import { ethers } from 'hardhat';
import { v4 as uuidv4 } from 'uuid';
import { LogDescription } from 'ethers';
import Deployments from '../../data/deployments/chain-296.json';
import { uniswapRouterAddress, chainlinkAggregatorMockAddress } from '../../constants';

import { deployAutoCompounder } from '../autocompounder/deploy-autocompounder';

const salt = `0x${uuidv4().replace(/-/g, '')}`; // generate salt

const metadataUri = "ipfs://bafybeibnsoufr2renqzsh347nrx54wcubt5lgkeivez63xvivplfwhtpym/m";

const allocationPercentage1 = 4000;
const allocationPercentage2 = 6000;

export async function setupSlice() {
    const [owner] = await ethers.getSigners();

    const autoCompounder1 = await deployAutoCompounder();
    const autoCompounder2 = await deployAutoCompounder();

    const rewardToken = await ethers.getContractAt('VaultToken', Deployments.vault.RewardToken);
    const sliceFactory = await ethers.getContractAt('SliceFactory', Deployments.slice.SliceFactory);

    const sliceDetails = {
        uniswapRouter: uniswapRouterAddress,
        usdc: rewardToken.target,
        name: "sToken",
        symbol: "sToken",
        metadataUri: metadataUri
    }

    const tx = await sliceFactory.deploySlice(salt, sliceDetails);

    const logs = await sliceFactory.queryFilter(
        sliceFactory.filters.SliceDeployed,
        tx.blockNumber as number,
        tx.blockNumber as number
    );
    const event = logs[0]; // Get the first log
    const decodedEvent = sliceFactory.interface.parseLog(event) as LogDescription;

    // Extract and verify the emitted address
    const newSliceAddress = decodedEvent.args[0];

    console.log(`Slice deployed at address: ${newSliceAddress}, tx: ${tx.hash}`);

    const slice = await ethers.getContractAt("Slice", newSliceAddress);

    const allocationTx1 = await slice.addAllocation(autoCompounder1, chainlinkAggregatorMockAddress, allocationPercentage1);
    const allocationTx2 = await slice.addAllocation(autoCompounder2, chainlinkAggregatorMockAddress, allocationPercentage2);
    console.log(`Allocations setup: ${allocationTx1.hash}\n${allocationTx2.hash}`);
}

setupSlice()
    .catch(console.error);

module.exports = {
    setupSlice
}