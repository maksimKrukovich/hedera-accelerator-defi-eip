import { ethers } from 'hardhat';
import Deployments from '../../data/deployments/chain-296.json';

import { uniswapRouterAddress } from '../../constants';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const amountToDeposit = ethers.parseUnits("50", 12);
const rewardAmount = ethers.parseUnits("50000000", 18);

export async function rebalance() {
    const [owner] = await ethers.getSigners();

    const rewardToken = await ethers.getContractAt('VaultToken', Deployments.vault.RewardToken);
    const uniswapV2Router02 = await ethers.getContractAt("UniswapRouterMock", uniswapRouterAddress);
    const slice = await ethers.getContractAt("Slice", Deployments.slice.Slice);

    // Get all staking tokens
    const allocations = await slice.allocations();
    const stakingTokens = await Promise.all(allocations.map(c => ethers.getContractAt("VaultToken", c.asset)));
    const autoCompounders = await Promise.all(allocations.map(c => ethers.getContractAt("AutoCompounder", c.aToken)));
    const vaults = await Promise.all(autoCompounders.map(async c => ethers.getContractAt("BasicVault", await c.vault())));

    // Add Liquidity
    await rewardToken.approve(uniswapV2Router02.target, ethers.parseUnits("50000000", 18));
    await stakingTokens[0].approve(uniswapV2Router02.target, ethers.parseUnits("50000000", 18));
    await stakingTokens[1].approve(uniswapV2Router02.target, ethers.parseUnits("50000000", 18));

    const addLiquidityTx1 = await uniswapV2Router02.addLiquidity(
        rewardToken.target,
        stakingTokens[0].target,
        ethers.parseUnits("5000000", 18),
        ethers.parseUnits("5000000", 18),
        ethers.parseUnits("5000000", 18),
        ethers.parseUnits("5000000", 18),
        owner.address,
        ethers.MaxUint256,
        { from: owner.address, gasLimit: 3000000 }
    );

    const addLiquidityTx2 = await uniswapV2Router02.addLiquidity(
        rewardToken.target,
        stakingTokens[1].target,
        ethers.parseUnits("5000000", 18),
        ethers.parseUnits("5000000", 18),
        ethers.parseUnits("5000000", 18),
        ethers.parseUnits("5000000", 18),
        owner.address,
        ethers.MaxUint256,
        { from: owner.address, gasLimit: 3000000 }
    );

    console.log(`Add Liquidity Tx1: ${addLiquidityTx1.hash}`);
    console.log(`Add Liquidity Tx2: ${addLiquidityTx2.hash}`);

    // Deposit to Slice
    await stakingTokens[0].approve(slice.target, amountToDeposit);
    await stakingTokens[1].approve(slice.target, amountToDeposit);

    const depositAutoCompounderTx1 = await slice.deposit(autoCompounders[0].target, amountToDeposit);
    const depositAutoCompounderTx2 = await slice.deposit(autoCompounders[1].target, amountToDeposit);
    console.log(`Deposit to AutoCompounder Tx1: ${depositAutoCompounderTx1.hash}`);
    console.log(`Deposit to AutoCompounder Tx2: ${depositAutoCompounderTx2.hash}`);

    // Add reward
    await rewardToken.approve(vaults[0].target, rewardAmount);
    await rewardToken.approve(vaults[1].target, rewardAmount);

    const addRewardTx1 = await vaults[0].addReward(rewardToken.target, rewardAmount);
    const addRewardTx2 = await vaults[1].addReward(rewardToken.target, rewardAmount);
    console.log(`Reward added Tx1: ${addRewardTx1.hash}`);
    console.log(`Reward added Tx2: ${addRewardTx2.hash}`);

    console.log(`aToken1 balance before: ${await autoCompounders[0].balanceOf(slice.target)}`);
    console.log(`aToken2 balance before: ${await autoCompounders[1].balanceOf(slice.target)}`);
    console.log(`USDC balance before: ${await rewardToken.balanceOf(slice.target)}`);

    await delay(90000);

    const tx = await slice.rebalance();

    console.log(`Rebalance tx: ${tx.hash}`);

    console.log(`aToken1 balance after: ${await autoCompounders[0].balanceOf(slice.target)}`);
    console.log(`aToken2 balance after: ${await autoCompounders[1].balanceOf(slice.target)}`);
    console.log(`USDC balance after: ${await rewardToken.balanceOf(slice.target)}`);
}

rebalance()
    .catch(console.error);

module.exports = {
    rebalance
}
