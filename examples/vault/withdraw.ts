import { ethers } from 'hardhat';
import Deployments from '../../data/deployments/chain-296.json';

const assetsAmount = ethers.parseUnits("10", 18);
const rewardAmount = ethers.parseUnits("50000000", 18);

async function withdraw() {
    const [owner] = await ethers.getSigners();

    const vault = await ethers.getContractAt('BasicVault', Deployments.vault.Vault);
    const rewardToken = await ethers.getContractAt('VaultToken', Deployments.vault.RewardToken);

    const depositTx = await vault.deposit(assetsAmount, owner.address);
    await depositTx.wait();

    await rewardToken.approve(vault.target, rewardAmount);

    const addRewardTx = await vault.addReward(rewardToken.target, rewardAmount);
    await addRewardTx.wait();
    console.log(`Reward added: ${addRewardTx.hash}`);

    await vault.approve(vault.target, assetsAmount);

    const withdrawTx = await vault.withdraw(assetsAmount, owner.address, owner.address);
    await withdrawTx.wait();

    console.log(`Withdraw tx: ${withdrawTx.hash}`);
}

withdraw()
    .catch(console.error);
