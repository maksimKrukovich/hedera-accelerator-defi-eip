//SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import {PythUtils} from "@pythnetwork/pyth-sdk-solidity/PythUtils.sol";

import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";
import {ITokenBalancer} from "./interfaces/ITokenBalancer.sol";

import "../common/safe-HTS/SafeHTS.sol";

/**
 * @title Token Balancer
 *
 * The contract that helps to maintain reward token balances.
 */
contract TokenBalancer is ITokenBalancer, AccessControl {
    using PythUtils for int64;

    // Max tokens amount to rebalance
    uint8 constant MAX_TOKENS_AMOUNT = 10;

    // Saucer Swap
    IUniswapV2Router02 public saucerSwap;

    // Oracle
    IPyth public pyth;

    // Token address => Token info
    mapping(address token => TokenInfo) public tokens;

    /**
     * @dev Initializes contract with passed parameters.
     *
     * @param _pyth The address of the Pyth oracle.
     * @param _saucerSwap The address of Saucer swap contract.
     * @param _tokens The tokens to rebalance.
     * @param _allocationPercentage The target allocation percentage.
     * @param _priceIds The price IDs in terms of Pyth oracle.
     */
    constructor(
        address _pyth,
        address _saucerSwap,
        address[] memory _tokens,
        uint256[] memory _allocationPercentage,
        bytes32[] memory _priceIds
    ) {
        require(_pyth != address(0), "TokenBalancer: Invalid Pyth address");
        require(_saucerSwap != address(0), "TokenBalancer: Invalid Saucer Swap address");
        require(_tokens.length != 0 && _tokens.length <= MAX_TOKENS_AMOUNT, "TokenBalancer: Invalid amount of tokens");
        require(_allocationPercentage.length > 0, "TokenBalancer: Allocation percentage not configured");
        require(_priceIds.length > 0, "TokenBalancer: No price ids");

        saucerSwap = IUniswapV2Router02(_saucerSwap);
        pyth = IPyth(_pyth);

        uint256 tokensSize = _tokens.length;
        for (uint256 i = 0; i < tokensSize; i++) {
            addTrackingToken(_tokens[i], _priceIds[i], _allocationPercentage[i]);
        }
    }

    /**
     * @dev Gets token price and calculate one dollar in any token.
     *
     * @param token The token address.
     * @param priceId The price ID in terms of Pyth oracle.
     */
    function _getPrice(address token, bytes32 priceId) public view returns (uint256 oneDollarInToken) {
        PythStructs.Price memory price = pyth.getPrice(priceId);
        return price.price.convertToUint(price.expo, IERC20Metadata(token).decimals());
    }

    /**
     * @dev Updates price.
     *
     * @param pythPriceUpdate The pyth price update.
     */
    function update(bytes[] calldata pythPriceUpdate) public payable {
        uint updateFee = pyth.getUpdateFee(pythPriceUpdate);
        pyth.updatePriceFeeds{value: updateFee}(pythPriceUpdate);
    }

    /**
     * @dev Initiates rebalance process.
     *
     * @param _rewardTokens The reward tokens to rebalance.
     */
    function rebalance(address[] calldata _rewardTokens) external {
        uint256 rewardTokensSize = _rewardTokens.length;
        uint256[] memory prices = new uint256[](rewardTokensSize);
        for (uint256 i = 0; i < rewardTokensSize; i++) {
            TokenInfo storage token = tokens[_rewardTokens[i]];
            prices[i] = token.price;
        }

        uint256[] memory swapAmounts = _rebalance(prices, _rewardTokens, rewardTokensSize);

        _swapExtraRewardSupplyToTransitionToken(_rewardTokens, rewardTokensSize);

        uint256 swapsCount = swapAmounts.length;
        for (uint256 i = 0; i < swapsCount; i++) {
            saucerSwap.swapExactETHForTokens(
                swapAmounts[i],
                tokens[_rewardTokens[i]].path,
                address(this),
                block.timestamp
            );
        }
    }

    /**
     * @dev Swaps extra reward balance to WHBAR token for future rebalance.
     *
     * @param _rewardTokens The reward tokens array.
     * @param rewardTokensSize The reward tokens size.
     */
    function _swapExtraRewardSupplyToTransitionToken(
        address[] calldata _rewardTokens,
        uint256 rewardTokensSize
    ) public {
        uint256 tokenBalance;
        uint256 totalValue;
        uint256 targetValue;
        uint256 targetQuantity;

        for (uint256 i = 0; i < rewardTokensSize; i++) {
            TokenInfo storage token = tokens[_rewardTokens[i]];

            tokenBalance = IERC20(_rewardTokens[i]).balanceOf(msg.sender);
            totalValue = tokenBalance * token.price;
            targetValue = (totalValue * tokens[_rewardTokens[i]].targetPercentage) / 10000;
            targetQuantity = targetValue / token.price;

            if (tokenBalance > targetQuantity) {
                uint256 excessQuantity = tokenBalance - targetQuantity;

                // Approve token transfer to SaucerSwap
                IERC20(_rewardTokens[i]).approve(address(saucerSwap), excessQuantity);

                // Perform the swap
                saucerSwap.swapExactTokensForETH(
                    excessQuantity,
                    0, // Accept any amount of ETH
                    token.path,
                    address(this),
                    block.timestamp
                );
            }
        }
    }

    /**
     * @dev Calculates amount of swap for every passed token.
     *
     * @param _tokenPrices The token prices array.
     * @param _rewardTokens The reward tokens array.
     * @param rewardTokensSize The cashed size of reward tokens to save gas.
     */
    function _rebalance(
        uint256[] memory _tokenPrices,
        address[] calldata _rewardTokens,
        uint256 rewardTokensSize
    ) public view returns (uint256[] memory) {
        uint256 totalValue;
        uint256[] memory tokenBalances = new uint256[](rewardTokensSize);

        // Calculate total value in the contract
        for (uint256 i = 0; i < rewardTokensSize; i++) {
            tokenBalances[i] = IERC20(_rewardTokens[i]).balanceOf(msg.sender);
            totalValue += tokenBalances[i] * _tokenPrices[i];
        }

        // Array to store the amounts to swap
        uint256[] memory swapAmounts = new uint256[](rewardTokensSize);

        // Calculate target values and swap amounts
        for (uint256 i = 0; i < rewardTokensSize; i++) {
            uint256 targetValue = (totalValue * tokens[_rewardTokens[i]].targetPercentage) / 10000;
            uint256 targetQuantity = targetValue / _tokenPrices[i];

            swapAmounts[i] = targetQuantity - tokenBalances[i];
        }

        return swapAmounts;
    }

    /**
     * @dev Add token to the system.
     *
     * @param token The token address.
     * @param priceId The price ID in terms of Pyth oracle.
     * @param percentage The target allocation percentage.
     */
    function addTrackingToken(address token, bytes32 priceId, uint256 percentage) public {
        require(token != address(0), "TokenBalancer: Invalid token address");
        require(priceId.length != 0, "TokenBalancer: Invalid price ID");
        require(percentage < 10000, "TokenBalancer: Percentage exceeds 100%");
        require(tokens[token].priceId == 0, "TokenBalancer: Token already exists");

        address[] memory _path = new address[](2);
        (_path[0], _path[1]) = (saucerSwap.WHBAR(), token);

        tokens[token] = TokenInfo(priceId, _getPrice(token, priceId), percentage, _path);

        emit TokenAdded(token, priceId, percentage);
    }

    /**
     * @dev Sets a target percentage for a reward token.
     *
     * @param token The token address.
     * @param percentage The allocation percentage.
     */
    function setAllocationPercentage(address token, uint256 percentage) external {
        require(token != address(0), "Invalid token address");
        require(percentage < 10000, "Percentage exceeds 100%");

        tokens[token].targetPercentage = percentage;

        emit TargetAllocationPercentageChanged(token, percentage);
    }
}
