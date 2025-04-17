import { ethers } from 'hardhat';
import { ZeroAddress } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { LogDescription } from 'ethers';
import Deployments from '../../data/deployments/chain-296.json';

const salt = `0x${uuidv4().replace(/-/g, '')}`; // generate salt

const cliff = 100;
const unlockDuration = 500;

const assetsAmount = ethers.parseUnits("10", 18);
const rewardAmount = ethers.parseUnits("50", 18);

const feeConfig = {
    receiver: ZeroAddress,
    token: ZeroAddress,
    feePercentage: 0,
};

export async function deployAsyncVault(): Promise<string> {
    const [owner] = await ethers.getSigners();

    const rewardToken = await ethers.getContractAt("VaultToken", Deployments.vault.RewardToken);

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

    const vaultFactory = await ethers.getContractAt('AsyncVaultFactory', Deployments.asyncVault.AsyncVaultFactory);

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

    const vault = await ethers.getContractAt("AsyncVault", newVaultAddress);

    // Request deposit
    const requestDepositTx = await vault.requestDeposit(assetsAmount, owner.address, owner.address);
    console.log(`Deposit requested: ${requestDepositTx.hash}`);

    // Claim deposit
    const depositTx = await vault['deposit(uint256,address)'](assetsAmount, owner.address);
    console.log(`Claim deposit: ${depositTx.hash}`);

    // Add initial reward
    const addRewardTx = await vault.addReward(rewardToken.target, rewardAmount);
    console.log(`Reward added: ${addRewardTx.hash}`);

    return newVaultAddress;
}

deployAsyncVault()
    .catch(console.error);

module.exports = {
    deployAsyncVault
}