// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "../common/IERC20.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IHRC} from "../common/hedera/IHRC.sol";
import "../common/safe-HTS/SafeHTS.sol";
import "../common/safe-HTS/IHederaTokenService.sol";

/**
 * @title Locker
 *
 * The contract which allows to stake HTS tokens and claim a reward token
 * according to the configured locking period.
 */
contract Locker is Ownable {
    using SafeCast for uint;

    /**
     * @notice Staked event.
     * @dev Emitted when user stakes an asset.
     *
     * @param user The user address.
     * @param token The staking token address.
     * @param amount The amount to stake.
     */
    event Staked(address indexed user, address indexed token, uint256 amount);

    /**
     * @notice Withdraw event.
     * @dev Emitted when user withdraws an asset.
     *
     * @param user The user address.
     * @param token The token address.
     * @param amount The amount to withdraw.
     */
    event Withdraw(address indexed user, address indexed token, uint256 amount);

    /**
     * @notice Claim event.
     * @dev Emitted when user claims reward.
     *
     * @param user The user address.
     * @param amount The claimed amount.
     */
    event Claim(address indexed user, uint256 amount);

    /**
     * @notice RewardsDurationUpdated event.
     * @dev Emitted when the owner updates reward duration.
     *
     * @param duration The new reward duration.
     * @param amount The reward amount.
     */
    event RewardsDurationUpdated(uint64 duration, uint256 amount);

    /**
     * @notice NotifiedRewardAmount event.
     * @dev Emitted when the owner updates locking configuration.
     *
     * @param finishAt The end of the locking period.
     * @param updatedAt The timestamp of update.
     * @param amount The reward amount.
     */
    event NotifiedRewardAmount(uint64 finishAt, uint64 updatedAt, uint256 amount);

    error TokenNotSupported(address _token);

    // Reward token
    IERC20 public rewardsToken;

    // Duration of rewards to be paid out (in seconds)
    uint64 public duration;
    // Timestamp of when the rewards finish
    uint64 public finishAt;
    // Minimum of last updated time and reward finish time
    uint64 public updatedAt;
    // Reward to be paid out per second
    uint64 public rewardRate;
    // Sum of (reward rate * dt * 1e18 / total supply)
    mapping(address token => uint256 reward) rewardPerTokenStored;
    // User address => Token address => rewardPerTokenStored
    mapping(address user => mapping(address token => uint256 paidReward)) public userRewardPerTokenPaid;
    // User address => Token address => Rewards to be claimed
    mapping(address user => mapping(address token => uint256 reward)) public rewards;

    // Staking tokens
    address[] public tokens;

    // Total staked
    mapping(address token => uint256 totalSupply) public totalSupply;
    // User address => Token address => Staked amount
    mapping(address user => mapping(address token => uint256 balance)) public balanceOf;

    /**
     * @dev Initializes contract with passed parameters and performs association.
     *
     * @param _rewardToken The address of the reward token.
     * @param _tokens The addresses of staking tokens.
     */
    constructor(address _rewardToken, address[] memory _tokens) payable Ownable(msg.sender) {
        require(_rewardToken != address(0), "Locker: reward token cannot be zero address");
        require(_tokens.length > 0 && _tokens.length < 20, "Locker: incorrect number of tokens");

        rewardsToken = IERC20(_rewardToken);
        SafeHTS.safeAssociateToken(_rewardToken, address(this));

        tokens = _tokens;

        uint256 tokensSize = _tokens.length;
        for (uint256 i = 0; i < tokensSize; i++) {
            SafeHTS.safeAssociateToken(tokens[i], address(this));
        }
    }

    /**
     * @dev Updates reward values.
     *
     * @param _account The user address.
     */
    function _updateReward(address _account, address _token) internal {
        rewardPerTokenStored[_token] = rewardPerToken(_token);
        updatedAt = lastTimeRewardApplicable();

        if (_account != address(0)) {
            rewards[_account][_token] = earned(_account, _token);
            userRewardPerTokenPaid[_account][_token] = rewardPerTokenStored[_token];
        }
    }

    /**
     * @dev Returns reward token balancer for the user.
     *
     * @param _user The user address.
     */
    function getUserRewardBalance(address _user) external view returns (uint256) {
        return rewardsToken.balanceOf(_user);
    }

    /**
     * @dev Returns reward token address.
     */
    function getRewardTokenAddress() external view returns (address) {
        return address(rewardsToken);
    }

    /**
     * @dev Returns reward token total supply.
     */
    function getRewardTokenCount() external view returns (uint256) {
        return rewardsToken.totalSupply();
    }

    /**
     * @dev Returns distribution .
     */
    function lastTimeRewardApplicable() public view returns (uint64) {
        return _min(finishAt, block.timestamp).toUint64();
    }

    /**
     * @dev Returns reward per token.
     */
    function rewardPerToken(address _token) public view returns (uint256) {
        if (totalSupply[_token] == 0) {
            return rewardPerTokenStored[_token];
        }

        return
            rewardPerTokenStored[_token] +
            (rewardRate * (lastTimeRewardApplicable() - updatedAt) * 1e18) /
            totalSupply[_token];
    }

    /**
     * @dev Stakes the input amount of the staking token to the contract.
     *
     * @param amount The amount of the staking token.
     */
    function stake(address _token, uint256 amount) external {
        if (!_isTokenExist(_token)) revert TokenNotSupported(_token);
        require(amount > 0, "Locker: amount cannot be zero");

        _updateReward(msg.sender, _token);

        SafeHTS.safeTransferToken(_token, msg.sender, address(this), int64(uint64(amount)));

        balanceOf[msg.sender][_token] += amount;
        totalSupply[_token] += amount;

        emit Staked(msg.sender, _token, amount);
    }

    /**
     * @dev Withdraws the staking token.
     *
     * @param amount The amount of the staking token to withdraw.
     */
    function withdraw(address _token, uint256 amount) external {
        if (!_isTokenExist(_token)) revert TokenNotSupported(_token);
        require(amount > 0, "Locker: amount cannot be zero");

        _updateReward(msg.sender, _token);

        SafeHTS.safeTransferToken(_token, address(this), msg.sender, int64(uint64(amount)));

        balanceOf[msg.sender][_token] -= amount;
        totalSupply[_token] -= amount;

        emit Withdraw(msg.sender, _token, amount);
    }

    /**
     * @dev Returns the count of rewards for the user.
     *
     * @param _account The address of the user for rewards calculation.
     */
    function earned(address _account, address _token) public view returns (uint256) {
        return
            ((balanceOf[_account][_token] * (rewardPerToken(_token) - userRewardPerTokenPaid[_account][_token])) /
                1e18) + rewards[_account][_token];
    }

    /**
     * @dev Claims all rewards.
     */
    function claimReward() external {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];

            _updateReward(msg.sender, token);

            uint256 reward = rewards[msg.sender][token];
            if (reward > 0) {
                rewards[msg.sender][token] = 0;
                totalReward += reward;
            }
        }

        if (totalReward > 0) {
            SafeHTS.safeTransferToken(address(rewardsToken), address(this), msg.sender, int64(uint64(totalReward)));
            emit Claim(msg.sender, totalReward);
        }
    }

    /**
     * @dev Sets duration for the rewards distribution.
     *
     * @param _duration The duration of rewards to be paid out.
     * @param reward The rewards amount.
     */
    function setRewardsDuration(uint256 _duration, uint256 reward) external onlyOwner {
        require(finishAt < block.timestamp, "Locker: reward duration not finished");

        SafeHTS.safeTransferToken(address(rewardsToken), msg.sender, address(this), int64(uint64(reward)));
        duration = _duration.toUint64();

        emit RewardsDurationUpdated(duration, reward);
    }

    /**
     * @dev Configures rewards parameters and the end of the distribution.
     *
     * @param _amount The rewards amount.
     */
    function notifyRewardAmount(uint256 _amount) external {
        _updateReward(address(0), address(0));

        if (block.timestamp >= finishAt) {
            rewardRate = (_amount / duration).toUint64();
        } else {
            uint256 remainingRewards = (finishAt - block.timestamp) * rewardRate;
            rewardRate = ((_amount + remainingRewards) / duration).toUint64();
        }

        require(rewardRate > 0, "Locker: reward rate is zero");
        require(
            rewardRate * duration <= rewardsToken.balanceOf(address(this)),
            "Locker: insuficcient token balance on the contract"
        );

        finishAt = (block.timestamp + duration).toUint64();
        updatedAt = block.timestamp.toUint64();

        emit NotifiedRewardAmount(finishAt, updatedAt, _amount);
    }

    /**
     * @dev Checks token support.
     *
     * @param _token The token address.
     * @return exist The existance flag.
     */
    function _isTokenExist(address _token) private view returns (bool exist) {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == _token) return true;
        }
    }

    /**
     * @dev Returns the minimum value from the input.
     *
     * @param x The first value.
     * @param y The second value.
     */
    function _min(uint256 x, uint256 y) private pure returns (uint256) {
        return x <= y ? x : y;
    }
}
