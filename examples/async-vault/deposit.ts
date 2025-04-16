import { ethers } from 'hardhat';
import Deployments from '../../data/deployments/chain-296.json';

const assetsAmount = ethers.parseUnits("10", 18);

export async function deposit() {
    const [owner] = await ethers.getSigners();

    const vault = await ethers.getContractAt('AsyncVault', Deployments.asyncVault.AsyncVault);
    const stakingToken = await ethers.getContractAt('VaultToken', Deployments.asyncVault.StakingToken);

    // Request deposit
    await stakingToken.approve(vault.target, assetsAmount);
    await vault.requestDeposit(assetsAmount, owner.address, owner.address);

    // Deposit
    const tx = await vault['deposit(uint256,address)'](assetsAmount, owner.address);
    await tx.wait();

    console.log(`Deposit tx: ${tx.hash}`);
}

deposit()
    .catch(console.error);

module.exports = {
    deposit
}
