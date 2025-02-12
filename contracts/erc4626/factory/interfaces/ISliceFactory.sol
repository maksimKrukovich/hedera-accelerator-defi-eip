// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title Slice Factory
 *
 * The contract which allows to deploy Slices with different parameters
 * and track contract addresses.
 */
interface ISliceFactory {
    /**
     * @notice SliceDeployed event.
     * @dev Emitted after Slice deployment.
     *
     * @param slice The address of the deployed Slice.
     * @param pyth The oracle address.
     * @param uniswapRouter The Uniswap router address.
     * @param usdc The USDC token address.
     */
    event SliceDeployed(address indexed slice, address indexed pyth, address uniswapRouter, address usdc);

    // Slice details struct
    struct SliceDetails {
        address pyth; // Price oracle address
        address uniswapRouter; // Uniswap router V2 address
        address usdc; // USDC token address
        string name; // sToken name
        string symbol; // sToken symbol
        bytes32 group; // Slice group
        bytes32 description; // Slice description
        uint8 decimals; // sToken decimals
    }

    /**
     * @dev Deploys a Slice using CREATE2 opcode.
     *
     * @param salt The CREATE2 salt.
     * @param sliceDetails The Slice parameters.
     * @return slice The address of the deployed Slice.
     */
    function deploySlice(string memory salt, SliceDetails calldata sliceDetails) external returns (address slice);

    /**
     * @dev Returns set of Slices with provided group.
     *
     * @param group The target group.
     * @return The addresses of found slices.
     */
    function getSlicesByGroup(bytes32 group) external view returns (address[] memory);
}
