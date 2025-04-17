import { ethers } from 'hardhat';
import { v4 as uuidv4 } from 'uuid';
import { LogDescription, ZeroAddress } from 'ethers';
import Deployments from '../../data/deployments/chain-296.json';
import { uniswapRouterAddress } from '../../constants';

import { deployVault } from '../vault/deploy-vault';

export async function deployAutoCompounder(): Promise<string> {
    const [owner] = await ethers.getSigners();

    const salt = `0x${uuidv4().replace(/-/g, '')}`; // generate salt

    const rewardToken = await ethers.getContractAt('VaultToken', Deployments.vault.RewardToken);
    const autoCompounderFactory = await ethers.getContractAt('AutoCompounderFactory', Deployments.autoCompounder.AutoCompounderFactory);

    const autoCompounderDetails = {
        uniswapV2Router: uniswapRouterAddress,
        vault: await deployVault(),
        usdc: rewardToken.target,
        aTokenName: "aToken",
        aTokenSymbol: "aToken",
        operator: ZeroAddress
    }

    const tx = await autoCompounderFactory.deployAutoCompounder(
        salt,
        autoCompounderDetails
    );

    const logs = await autoCompounderFactory.queryFilter(
        autoCompounderFactory.filters.AutoCompounderDeployed,
        tx.blockNumber as number,
        tx.blockNumber as number
    );
    const event = logs[0]; // Get the first log
    const decodedEvent = autoCompounderFactory.interface.parseLog(event) as LogDescription;

    // Extract and verify the emitted address
    const newAutoCompounderAddress = decodedEvent.args[0];

    console.log(`AutoCompounder deployed at address: ${newAutoCompounderAddress}, tx: ${tx.hash}`);

    return newAutoCompounderAddress;
}

deployAutoCompounder()
    .catch(console.error);

module.exports = {
    deployAutoCompounder
}