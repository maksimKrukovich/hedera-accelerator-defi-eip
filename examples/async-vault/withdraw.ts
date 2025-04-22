import { ethers } from 'hardhat';
import Deployments from '../../data/deployments/chain-296.json';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const assetsAmount = ethers.parseUnits("10", 18);
const rewardAmount = ethers.parseUnits("50000000", 18);

async function withdraw() {
    const [owner] = await ethers.getSigners();

    const vault = await ethers.getContractAt('AsyncVault', Deployments.asyncVault.AsyncVault);
    const rewardToken = await ethers.getContractAt('VaultToken', Deployments.asyncVault.RewardToken);
    const stakingToken = await ethers.getContractAt('VaultToken', await vault.asset());

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

    // Warp time to unlock tokens
    await delay(90000);

    // Request redeem
    await vault.approve(vault.target, assetsAmount);
    const requestRedeemTx = await vault.requestRedeem(assetsAmount, owner.address, owner.address);
    await requestRedeemTx.wait();
    console.log(`Redeem requested: ${requestRedeemTx.hash}`);

    // Withdraw
    const withdrawTx = await vault.withdraw(assetsAmount, owner.address, owner.address);
    await withdrawTx.wait();

    console.log(`Withdraw tx: ${withdrawTx.hash}`);
}

withdraw()
    .catch(console.error);
