//SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";

import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import {PythUtils} from "@pythnetwork/pyth-sdk-solidity/PythUtils.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IERC4626} from "./IERC4626.sol";
import {IAutoCompounder} from "./interfaces/IAutoCompounder.sol";
import {ISlice} from "./interfaces/ISlice.sol";
import {ERC20} from "./ERC20.sol";

/**
 * @title Slice
 *
 * The contract represents a derivatives fund on tokenized assets, in current case buildings.
 * The main contract responsibility is to rebalance the asset portfolio (utilising USD prices)
 * and maintain predefined allocation of the stored assets.
 */
contract Slice is ISlice, ERC20, Ownable {
    using SafeERC20 for IERC20;
    using PythUtils for int64;

    // Basis points for calculations with percentages
    uint16 private constant BASIS_POINTS = 10000;

    // Max tokens amount to store
    uint8 private constant MAX_TOKENS_AMOUNT = 10;

    // Slice group
    bytes32 private immutable _group;

    // Slice description
    bytes32 private immutable _description;

    // Allocations array for each aToken stored
    Allocation[] private _allocations;

    // Price oracle
    IPyth private _pyth;

    // Uniswap router V2
    IUniswapV2Router02 private _uniswapRouter;

    // USDC
    address private _baseToken;

    // Token balances
    mapping(address => uint256) private _balances;

    // Rebalance payload struct (used for caching calculation data)
    struct RebalancePayload {
        address aToken; // aToken address
        uint256 targetUnderlyingAmount; // Target amount in terms of underlying
        uint256 aTokenTargetAmount; // aToken target amount
        uint256 currentBalance; // Current aToken balance
    }

    /**
     * @dev Initializes contract with passed parameters.
     *
     * @param uniswapRouter_ The address of the Uniswap router.
     * @param pyth_ The address of the price Oracle.
     * @param baseToken_ The address of the base token.
     * @param name_ The name of the sToken.
     * @param symbol_ The symbol of the sToken.
     * @param group_ The Slice group.
     * @param description_ The Slice description.
     * @param decimals_ The decimals of the sToken.
     */
    constructor(
        address uniswapRouter_,
        address pyth_,
        address baseToken_,
        string memory name_,
        string memory symbol_,
        bytes32 group_,
        bytes32 description_,
        uint8 decimals_
    ) ERC20(name_, symbol_, decimals_) Ownable(msg.sender) {
        require(uniswapRouter_ != address(0), "Slice: Invalid Uniswap router address");
        require(pyth_ != address(0), "Slice: Invalid price oralce address");
        require(baseToken_ != address(0), "Slice: Invalid USDC token address");
        require(group_ != bytes32(0), "Slice: Invalid group");
        require(description_ != bytes32(0), "Slice: Invalid description");

        _uniswapRouter = IUniswapV2Router02(uniswapRouter_);
        _pyth = IPyth(pyth_);
        _baseToken = baseToken_;
        _group = group_;
        _description = description_;
    }

    /*///////////////////////////////////////////////////////////////
                        DEPOSIT/WITHDRAWAL LOGIC
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Deposits to the AutoCompounder contract.
     * @inheritdoc ISlice
     */
    function deposit(address aToken, uint256 amount) external returns (uint256 aTokenAmount) {
        require(amount > 0, "Slice: Invalid amount");
        require(getTokenAllocation(aToken).aToken != address(0), "Slice: Allocation for the token doesn't exist");

        // Transfer underlying token from user to contract
        IERC20(IERC4626(aToken).asset()).safeTransferFrom(msg.sender, address(this), amount);

        // Deposit to AutoCompounder
        IERC20(IERC4626(aToken).asset()).approve(aToken, amount);
        aTokenAmount = IERC4626(aToken).deposit(amount, address(this));

        _balances[aToken] += aTokenAmount;

        // Mint appropriate sToken amount to sender
        _mint(msg.sender, aTokenAmount);

        emit Deposit(aToken, msg.sender, amount);
    }

    /**
     * @dev Withdraws set of stored tokens.
     * @inheritdoc ISlice
     */
    function withdraw(uint256 sTokenAmount) external returns (uint256[] memory amounts) {
        require(sTokenAmount > 0, "Slice: Invalid amount");

        // Burn sToken
        _burn(msg.sender, sTokenAmount);

        amounts = new uint256[](_allocations.length);

        address currentAToken;
        uint256 currentBalance;

        // Calculate proportional assets to return
        uint256 userShare = (sTokenAmount * decimals) / totalSupply();
        for (uint256 i = 0; i < _allocations.length; i++) {
            currentAToken = _allocations[i].aToken;
            currentBalance = _balances[currentAToken];

            amounts[i] = (currentBalance * userShare) / decimals;
            IERC20(currentAToken).safeTransfer(msg.sender, amounts[i]);

            emit Withdraw(currentAToken, msg.sender, amounts[i]);
        }
    }

    /*///////////////////////////////////////////////////////////////
                        ALLOCATION LOGIC
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Adds new aToken allocation.
     * @inheritdoc ISlice
     */
    function addAllocation(address aToken, bytes32 priceId, uint256 percentage) external {
        require(aToken != address(0), "Slice: Invalid aToken address");
        require(priceId != bytes32(0), "Slice: Invalid price id");
        require(percentage != 0 && percentage != BASIS_POINTS, "Slice: Invalid allocation percentage");
        require(getTokenAllocation(aToken).aToken == address(0), "Slice: Allocation for the passed token exists");
        require(_allocations.length < MAX_TOKENS_AMOUNT, "Slice: Allocation limit exceeds");

        _allocations.push(Allocation({aToken: aToken, priceId: priceId, targetPercentage: percentage}));

        emit AllocationAdded(aToken, priceId, percentage);
    }

    /**
     * @dev Sets new aToken allocation percentage.
     * @inheritdoc ISlice
     */
    function setAllocationPercentage(address aToken, uint256 newPercentage) external {
        require(aToken != address(0), "Slice: Invalid aToken address");
        require(newPercentage != 0 && newPercentage != BASIS_POINTS, "Slice: Invalid percentage");
        require(
            getTokenAllocation(aToken).aToken != address(0),
            "Slice: Allocation for the passed token doesn't exist"
        );

        for (uint256 i = 0; i < _allocations.length; i++) {
            if (_allocations[i].aToken == aToken) {
                _allocations[i].targetPercentage = newPercentage;
            }
        }

        emit AllocationPercentageChanged(aToken, newPercentage);
    }

    /*///////////////////////////////////////////////////////////////
                        REBALANCE LOGIC
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Generates array of payloads with caching target amounts and balances for each aToken.
     *
     * @return payloads The array of rebalance payloads.
     * @return aTokenToUnderlyingRate The aToken/Underlying exchange rate.
     */
    function _generateRebalancePayload()
        public
        returns (RebalancePayload[] memory payloads, uint256 aTokenToUnderlyingRate)
    {
        uint256 totalValue = _getTotalValue();

        address aToken;
        bytes32 priceId;
        uint256 targetValue;
        uint256 targetUnderlyingAmount;
        uint256 aTokenTargetAmount;
        uint256 withdrawnUnderlyingAmount;
        uint256 aTokenBalance;

        payloads = new RebalancePayload[](_allocations.length);

        for (uint256 i = 0; i < _allocations.length; i++) {
            aToken = _allocations[i].aToken;
            priceId = _allocations[i].priceId;

            (, , uint256 underlyingPrice, uint256 aTokenToUnderlyingRate) = _getTokenValue(aToken, priceId);

            targetValue = (totalValue * _allocations[i].targetPercentage) / BASIS_POINTS; // Target value in USD
            targetUnderlyingAmount = targetValue / underlyingPrice; // Target amount in underlying

            // Target amount in aToken
            aTokenTargetAmount = (targetUnderlyingAmount * aTokenToUnderlyingRate) / IERC20Metadata(aToken).decimals();
            aTokenBalance = IERC20(aToken).balanceOf(address(this));

            if (aTokenBalance > aTokenTargetAmount) {
                uint256 aTokenExcessAmount = aTokenBalance - aTokenTargetAmount;

                withdrawnUnderlyingAmount = IAutoCompounder(aToken).withdraw(aTokenExcessAmount, address(this));

                // Swap excess underlying to USDC for next 'buy' trades
                _tradeForToken(IERC4626(aToken).asset(), _baseToken, withdrawnUnderlyingAmount);

                payloads[i] = RebalancePayload({
                    aToken: aToken,
                    targetUnderlyingAmount: targetUnderlyingAmount,
                    aTokenTargetAmount: aTokenTargetAmount,
                    currentBalance: aTokenBalance - aTokenExcessAmount
                });
            } else {
                payloads[i] = RebalancePayload({
                    aToken: aToken,
                    targetUnderlyingAmount: targetUnderlyingAmount,
                    aTokenTargetAmount: aTokenTargetAmount,
                    currentBalance: aTokenBalance
                });
            }
        }
    }

    /**
     * @dev Makes set of swaps to reach target balances of aTokens from generated payloads.
     */
    function rebalance() external {
        (RebalancePayload[] memory payloads, uint256 aTokenToUnderlyingRate) = _generateRebalancePayload();

        uint256 withdrawnUnderlyingAmount;

        for (uint256 i = 0; i < payloads.length; i++) {
            address aToken = payloads[i].aToken;
            uint256 aTokenTargetAmount = payloads[i].aTokenTargetAmount;
            uint256 balance = payloads[i].currentBalance;

            if (aTokenTargetAmount == balance) continue;

            aTokenToUnderlyingRate = IAutoCompounder(aToken).exchangeRate(aToken);

            uint256 difference = aTokenTargetAmount - balance;
            uint256 neededUnderlying = difference / aTokenToUnderlyingRate;

            if (difference > balance) {
                withdrawnUnderlyingAmount = IAutoCompounder(aToken).withdraw(balance, address(this));
            } else {
                withdrawnUnderlyingAmount = IAutoCompounder(aToken).withdraw(difference, address(this));
            }

            // Swap underlying for USDC
            _tradeForToken(IERC4626(aToken).asset(), _baseToken, withdrawnUnderlyingAmount);

            uint256 neededUsdcToSwapForUnderlying = _getQuoteAmount(
                neededUnderlying,
                _baseToken,
                IERC4626(aToken).asset()
            );

            uint256 baseTokenBalance = IERC20(_baseToken).balanceOf(address(this));

            if (baseTokenBalance < neededUsdcToSwapForUnderlying) {
                // Swap whole USDC balance for underlying
                _tradeForToken(_baseToken, IERC4626(aToken).asset(), baseTokenBalance);

                uint256 underlyingBalance = IERC20(IERC4626(aToken).asset()).balanceOf(address(this));

                // Reinvest to get aToken
                IERC20(IERC4626(aToken).asset()).approve(aToken, underlyingBalance);
                _balances[aToken] += IERC4626(aToken).deposit(underlyingBalance, address(this));
            } else {
                // Swap USDC for aToken equivalent in underlying token
                _tradeForToken(_baseToken, IERC4626(aToken).asset(), neededUsdcToSwapForUnderlying);

                uint256 underlyingBalance = IERC20(IERC4626(aToken).asset()).balanceOf(address(this));

                // Reinvest to get aToken
                IERC20(IERC4626(aToken).asset()).approve(aToken, underlyingBalance);
                _balances[aToken] += IERC4626(aToken).deposit(underlyingBalance, address(this));
            }
        }
    }

    /*///////////////////////////////////////////////////////////////
                         INTERNAL HOOKS LOGIC
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Returns total portfolio value in USD.
     */
    function _getTotalValue() internal view returns (uint256 totalValue) {
        for (uint256 i = 0; i < _allocations.length; i++) {
            (uint256 currentValue, , , ) = _getTokenValue(_allocations[i].aToken, _allocations[i].priceId);
            totalValue += currentValue;
        }
    }

    /**
     * @dev Gets the USD value of a token held in the contract.
     *
     * @param token The aToken address.
     * @param priceId The price ID of related underlying.
     */
    function _getTokenValue(
        address token,
        bytes32 priceId
    )
        internal
        view
        returns (uint256 currentValue, uint256 underlyingValue, uint256 underlyingPrice, uint256 aTokenToUnderlyingRate)
    {
        uint256 balance = IERC20(token).balanceOf(address(this));
        aTokenToUnderlyingRate = IAutoCompounder(token).exchangeRate(token);
        underlyingPrice = _getPrice(IAutoCompounder(token).asset(), priceId);

        // Get Underlying value in aToken
        underlyingValue = (balance * aTokenToUnderlyingRate);

        // Get underlying value in USD
        currentValue = (underlyingValue * underlyingPrice) / IERC20Metadata(token).decimals();
    }

    /**
     * @dev Trades USDC or other tokens to buy the desired token.
     *
     * @param token The address of token to swap.
     * @param targetToken The address of token to receive.
     * @param amountIn The input amount.
     */
    function _tradeForToken(address token, address targetToken, uint256 amountIn) internal {
        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = targetToken;

        IERC20(path[0]).approve(uniswapV2Router(), amountIn);

        _uniswapRouter.swapExactTokensForTokens(
            amountIn,
            0, // Minimum output (slippage tolerance could be added here)
            path,
            address(this),
            block.timestamp
        );
    }

    /**
     * @dev Returns the amount of input token needed to swap in order to get amount out of output token.
     *
     * @param amountOut The desired amount out of output token.
     * @param tokenIn The input token address.
     * @param tokenOut The output token address.
     */
    function _getQuoteAmount(uint256 amountOut, address tokenIn, address tokenOut) internal view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amountsIn = _uniswapRouter.getAmountsIn(amountOut, path);
        return amountsIn[0];
    }

    /*///////////////////////////////////////////////////////////////
                         PRICE HOOKS LOGIC
    //////////////////////////////////////////////////////////////*/
    /**
     * @dev Fetches the token price and calculates one dollar in token.
     *
     * @param token The token address.
     * @param priceId The price ID in terms of Pyth oracle.
     */
    function _getPrice(address token, bytes32 priceId) internal view returns (uint256) {
        PythStructs.Price memory price = _pyth.getPrice(priceId);
        price.price.convertToUint(price.expo, IERC20Metadata(token).decimals());
        return 1 * 10e18;
    }

    /**
     * @dev Updates oracle price.
     *
     * @param pythPriceUpdate The pyth price update data.
     */
    function update(bytes[] calldata pythPriceUpdate) public payable {
        uint updateFee = _pyth.getUpdateFee(pythPriceUpdate);
        _pyth.updatePriceFeeds{value: updateFee}(pythPriceUpdate);
    }

    /*///////////////////////////////////////////////////////////////
                            VIEW HOOKS LOGIC
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Returns token allocation for the passed aToken address.
     * @inheritdoc ISlice
     */
    function getTokenAllocation(address aToken) public view returns (Allocation memory) {
        for (uint256 i = 0; i < _allocations.length; i++) {
            if (_allocations[i].aToken == aToken) return _allocations[i];
        }
    }

    /**
     * @dev Returns all token allocations.
     */
    function allocations() external view returns (Allocation[] memory) {
        return _allocations;
    }

    /**
     * @dev Returns the Pyth oracle address.
     */
    function pyth() public view returns (address) {
        return address(_pyth);
    }

    /**
     * @dev Returns the Uniswap V2 router address.
     */
    function uniswapV2Router() public view returns (address) {
        return address(_uniswapRouter);
    }

    /**
     * @dev Returns the base token used for trading (e.g., USDC).
     */
    function baseToken() public view returns (address) {
        return _baseToken;
    }

    /**
     * @dev Returns the Slice description.
     */
    function description() external view returns (bytes32) {
        return _description;
    }

    /**
     * @dev Returns the Slice group.
     */
    function group() external view returns (bytes32) {
        return _group;
    }
}
