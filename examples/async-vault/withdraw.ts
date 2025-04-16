import { ethers } from 'hardhat';
import Deployments from '../../data/deployments/chain-296.json';

const assetsAmount = ethers.parseUnits("10", 18);
const rewardAmount = ethers.parseUnits("50000000", 18);

async function withdraw() {
    const [owner] = await ethers.getSigners();

    const vault = await ethers.getContractAt('AsyncVault', Deployments.asyncVault.AsyncVault);
    const stakingToken = await ethers.getContractAt('VaultToken', Deployments.asyncVault.StakingToken);
    const rewardToken = await ethers.getContractAt('VaultToken', Deployments.asyncVault.RewardToken);

    // Request deposit
    await stakingToken.approve(vault.target, assetsAmount);
    await vault.requestDeposit(assetsAmount, owner.address, owner.address);

    // Deposit
    const depositTx = await vault['deposit(uint256,address)'](assetsAmount, owner.address);
    await depositTx.wait();

    await rewardToken.approve(vault.target, rewardAmount);

    // Add reward
    const addRewardTx = await vault.addReward(rewardToken.target, rewardAmount);
    await addRewardTx.wait();
    console.log(`Reward added: ${addRewardTx.hash}`);

    // Request redeem
    await vault.approve(vault.target, assetsAmount);
    await vault.requestRedeem(assetsAmount, owner.address, owner.address);

    // Withdraw
    const withdrawTx = await vault.withdraw(assetsAmount, owner.address, owner.address);
    await withdrawTx.wait();

    console.log(`Withdraw tx: ${withdrawTx.hash}`);
}

withdraw()
    .catch(console.error);
