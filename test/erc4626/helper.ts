import { AddressLike } from "ethers";
import { ethers } from "../setup";

// constants
export enum VaultType {
    Basic,
    Async
}

export async function getCorrectDepositNumber(vault: any) {
    for (let i = 1; i > 0; i++) {
        if (await vault.previewDeposit(i) != 0) {
            return i;
        }
    }
}

export async function deployBasicVault(
    stakingToken: AddressLike,
    owner: AddressLike,
    feeConfig: any
) {
    const BasicVault = await ethers.getContractFactory("BasicVault");
    const vault = await BasicVault.deploy(
        stakingToken,
        "TST",
        "TST",
        feeConfig,
        owner,
        owner
    );
    await vault.waitForDeployment();
    return vault;
}

export async function deployAsyncVault(
    stakingToken: AddressLike,
    owner: AddressLike,
    feeConfig: any
) {
    const AsyncVault = await ethers.getContractFactory("contracts/erc7540/AsyncVault.sol:AsyncVault");
    const asyncVault = await AsyncVault.deploy(
        stakingToken,
        "AsyncTST",
        "AsyncTST",
        feeConfig,
        owner,
        owner
    );
    await asyncVault.waitForDeployment();
    return asyncVault;
}

module.exports = {
    VaultType,
    getCorrectDepositNumber,
    deployBasicVault,
    deployAsyncVault
}
