// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title Token Balancer
 */
interface ITokenBalancer {
    event TokenAdded(address indexed token, bytes32 priceId, uint256 allocationPercentage);
    event TargetAllocationPercentageChanged(address indexed token, uint256 allocationPercentage);

    struct TokenInfo {
        bytes32 priceId;
        uint256 price;
        uint256 targetPercentage;
        address[] path;
    }

    function addTrackingToken(address token, bytes32 priceId, uint256 percentage) external;

    function rebalance(address[] calldata _rewardTokens) external;
}
