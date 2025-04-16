import { ethers } from 'hardhat';
import { ZeroAddress } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { LogDescription } from 'ethers';
import Deployments from '../../data/deployments/chain-296.json';

const salt = `0x${uuidv4().replace(/-/g, '')}`; // generate salt

const cliff = 30;
const unlockDuration = 60;

const feeConfig = {
    receiver: ZeroAddress,
    token: ZeroAddress,
    feePercentage: 0,
};

export async function deployVault(): Promise<string> {
    const [owner] = await ethers.getSigners();

    const VaultToken = await ethers.getContractFactory("VaultToken");
    const stakingToken = await VaultToken.deploy();
    await stakingToken.waitForDeployment();

    console.log(`Staking token deployed at address: ${stakingToken.target}`);

    const vaultDetails = {
        stakingToken: stakingToken.target,
        shareTokenName: "TST",
        shareTokenSymbol: "TST",
        vaultRewardController: owner.address,
        feeConfigController: owner.address,
        cliff: cliff,
        unlockDuration: unlockDuration
    }

    const vaultFactory = await ethers.getContractAt('VaultFactory', Deployments.vault.VaultFactory);

    const tx = await vaultFactory.deployVault(
        salt,
        vaultDetails,
        feeConfig
    );
    await tx.wait();

    const logs = await vaultFactory.queryFilter(
        vaultFactory.filters.VaultDeployed,
        tx.blockNumber as number,
        tx.blockNumber as number
    );
    const event = logs[0]; // Get the first log
    const decodedEvent = vaultFactory.interface.parseLog(event) as LogDescription;

    // Extract and verify the emitted address
    const newVaultAddress = decodedEvent.args[0];

    console.log(`Vault deployed at address: ${newVaultAddress}, tx: ${tx.hash}`);

    return newVaultAddress;
}

deployVault()
    .catch(console.error);

module.exports = {
    deployVault
}