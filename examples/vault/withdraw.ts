import { ethers } from 'hardhat';
import Deployments from '../../data/deployments/chain-296.json';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const assetsAmount = ethers.parseUnits("10", 18);
const rewardAmount = ethers.parseUnits("50000000", 18);

async function withdraw() {
    const [owner] = await ethers.getSigners();

    const vault = await ethers.getContractAt('BasicVault', Deployments.vault.Vault);
    const rewardToken = await ethers.getContractAt('VaultToken', Deployments.vault.RewardToken);
    const stakingToken = await ethers.getContractAt("VaultToken", await vault.asset());

    // Deposit
    await stakingToken.approve(vault.target, assetsAmount);

    const depositTx = await vault.deposit(assetsAmount, owner.address);
    await depositTx.wait();

    // Add reward
    await rewardToken.approve(vault.target, rewardAmount);

    const addRewardTx = await vault.addReward(rewardToken.target, rewardAmount);
    await addRewardTx.wait();
    console.log(`Reward added: ${addRewardTx.hash}`);

    // Warp time to unlock tokens
    await delay(90000);

    // Withdraw
    await vault.approve(vault.target, assetsAmount);

    const withdrawTx = await vault.withdraw(assetsAmount, owner.address, owner.address);
    await withdrawTx.wait();

    console.log(`Withdraw tx: ${withdrawTx.hash}`);
}

withdraw()
    .catch(console.error);
