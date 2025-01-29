import { ethers, expect } from "../setup";
import { PrivateKey, Client, AccountId } from "@hashgraph/sdk";
import { ZeroAddress, ZeroHash } from "ethers";
import { VaultToken, Slice, BasicVault, AutoCompounder } from "../../typechain-types";

import {
    usdcAddress,
    uniswapRouterAddress,
    uniswapFactoryAddress,
    pythOracleAddress,
    pythUtilsAddress
} from "../../constants";

async function createPriceFeedData(
    id: any,
    price: number,
    conf: number,
    expo: number,
    publishTime: number,
    emaPrice: number,
    emaConf: number,
    emaExpo: number,
    emaPublishTime: number,
    prevPublishTime: number
): Promise<string | null> {
    const types = [
        "bytes32",                   // id
        "int64",                     // price.price
        "uint64",                    // price.conf
        "int32",                     // price.expo
        "uint64",                    // price.publishTime
        "int64",                     // emaPrice.price
        "uint64",                    // emaPrice.conf
        "int32",                     // emaPrice.expo
        "uint64",                    // emaPrice.publishTime
        "uint64"                     // prevPublishTime
    ];

    const values = [
        id,             // id
        price,          // price.price
        conf,           // price.conf
        expo,           // price.expo
        publishTime,    // price.publishTime
        emaPrice,       // emaPrice.price
        emaConf,        // emaPrice.conf
        emaExpo,        // emaPrice.expo
        emaPublishTime, // emaPrice.publishTime
        prevPublishTime // prevPublishTime
    ];

    return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
}

// constants
const priceIds = [
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222222222222222222222222222",
];

// Zero fee
const feeConfig = {
    receiver: ZeroAddress,
    token: ZeroAddress,
    feePercentage: 0,
};

// Tests
describe("Slice", function () {
    async function deployFixture() {
        const [
            owner,
        ] = await ethers.getSigners();

        let client = Client.forTestnet();

        const operatorPrKey = PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY || '');
        const operatorAccountId = AccountId.fromString(process.env.ACCOUNT_ID || '');

        client.setOperator(
            operatorAccountId,
            operatorPrKey
        );

        // Staking Token
        const VaultToken = await ethers.getContractFactory("VaultToken");
        const stakingToken = await VaultToken.deploy(
        ) as VaultToken;
        await stakingToken.waitForDeployment();

        // Reward Token
        const RewardToken = await ethers.getContractFactory("VaultToken");
        const rewardToken = await RewardToken.deploy(
        ) as VaultToken;
        await rewardToken.waitForDeployment();

        // Basic Vault
        const Vault = await ethers.getContractFactory("BasicVault");
        const vault = await Vault.deploy(
            stakingToken,
            "TST",
            "TST",
            feeConfig,
            owner.address,
            owner.address
        ) as BasicVault;
        await vault.waitForDeployment();

        const vault1 = await Vault.deploy(
            stakingToken.target,
            "TST",
            "TST",
            feeConfig,
            owner.address,
            owner.address
        ) as BasicVault;
        await vault1.waitForDeployment();

        // AutoCompounder
        const AutoCompounder = await ethers.getContractFactory("AutoCompounder");
        const autoCompounder = await AutoCompounder.deploy(
            uniswapRouterAddress,
            vault.target,
            usdcAddress,
            "TST",
            "TST"
        ) as AutoCompounder;
        await autoCompounder.waitForDeployment();

        const autoCompounder1 = await AutoCompounder.deploy(
            uniswapRouterAddress,
            vault1.target,
            rewardToken.target,
            "TST",
            "TST"
        ) as AutoCompounder;
        await autoCompounder1.waitForDeployment();

        // await stakingToken.mint(testAccount.address, ethers.parseUnits("500000000", 18));

        // Slice
        const Slice = await ethers.getContractFactory("Slice", {
            libraries: {
                PythUtils: pythUtilsAddress,
            },
        });
        const slice = await Slice.deploy(
            uniswapRouterAddress, // Uniswap 
            pythOracleAddress, // Oracle
            rewardToken.target, // BaseToken TODO: Change to real USDC
            "sToken",
            "sToken",
            18
        ) as Slice;
        await slice.waitForDeployment();

        return {
            slice,
            vault,
            vault1,
            autoCompounder,
            autoCompounder1,
            stakingToken,
            rewardToken,
            client,
            owner,
        };
    }

    describe.only("rebalance", function () {
        it("Should distribute tokens close to the provided allocation Autocompounders", async function () {
            const {
                slice,
                owner,
                vault,
                vault1,
                autoCompounder,
                autoCompounder1,
                // uniswapV2Router02,
                // uniswapV2Factory,
                stakingToken,
                rewardToken,
            } = await deployFixture();
            const allocationPercentage1 = 4000;
            const allocationPercentage2 = 6000;
            const amountToDeposit = ethers.parseUnits("50", 12);
            const rewardAmount = ethers.parseUnits("50000000", 18);

            const latestBlock = await ethers.provider.getBlock("latest");
            const timestamp = latestBlock?.timestamp;

            const uniswapV2Factory = await ethers.getContractAt("contracts/erc4626/interfaces/IUniswapV2Factory.sol:IUniswapV2Factory", uniswapFactoryAddress);
            const uniswapV2Router02 = await ethers.getContractAt("contracts/erc4626/interfaces/IUniswapV2Router02.sol:IUniswapV2Router02", uniswapRouterAddress);

            // Create Pair
            const txpr = await uniswapV2Factory.createPair(
                rewardToken.target,
                stakingToken.target,
                { value: ethers.parseUnits("50", 18), gasLimit: 3000000 }
            );

            console.log(txpr.hash);

            const pair = await uniswapV2Factory.getPair(
                rewardToken.target,
                stakingToken.target
            );

            console.log("Pair: ", pair);

            // Add Liquidity
            await rewardToken.approve(uniswapV2Router02.target, ethers.parseUnits("50000000", 18));
            await stakingToken.approve(uniswapV2Router02.target, ethers.parseUnits("50000000", 18));

            const addLiquidityTx = await uniswapV2Router02.addLiquidity(
                rewardToken.target,
                stakingToken.target,
                ethers.parseUnits("5000000", 18),
                ethers.parseUnits("5000000", 18),
                ethers.parseUnits("5000000", 18),
                ethers.parseUnits("5000000", 18),
                owner.address,
                timestamp! + 100
            );

            console.log("Add Liquidity Tx: ", addLiquidityTx.hash);

            // Add tracking tokens
            await slice.addAllocation(
                autoCompounder1.target,
                priceIds[0],
                allocationPercentage1
            );
            await slice.addAllocation(
                autoCompounder.target,
                priceIds[1],
                allocationPercentage2
            );

            console.log("Tracking tokens added");

            // Deposit to Slice
            await stakingToken.approve(slice.target, amountToDeposit + amountToDeposit);

            const depositAutoCompounderTx = await slice.deposit(autoCompounder1.target, amountToDeposit);
            console.log("Deposit to Vault Tx: ", depositAutoCompounderTx.hash);
            const depositAutoCompounder1Tx = await slice.deposit(autoCompounder.target, amountToDeposit);
            console.log("Deposit to AutoCompounder Tx: ", depositAutoCompounder1Tx.hash);

            // console.log("aToken balance before: ", await autoCompounder.balanceOf(balancer.address));
            // console.log("vToken balance before: ", await vault.balanceOf(balancer.address));

            // Add reward
            await rewardToken.approve(vault.target, rewardAmount);
            await rewardToken.approve(vault1.target, rewardAmount);

            const addRewardTx = await vault.addReward(rewardToken.target, rewardAmount);
            const addReward1Tx = await vault1.addReward(rewardToken.target, rewardAmount);
            console.log(addRewardTx.hash);
            console.log(addReward1Tx.hash);

            console.log("aToken balance before: ", await autoCompounder.balanceOf(slice.target));
            console.log("aToken1 balance before: ", await autoCompounder1.balanceOf(slice.target));
            console.log("vToken balance before: ", await vault.balanceOf(slice.target));
            console.log("vToken1 balance before: ", await vault1.balanceOf(slice.target));
            console.log("USDC balance before: ", await rewardToken.balanceOf(slice.target));
            console.log("Underlying balance before: ", await stakingToken.balanceOf(slice.target));

            const tx = await slice.rebalance();

            console.log(`Rebalance tx: ${tx.hash}`);

            console.log("aToken balance after: ", await autoCompounder.balanceOf(slice.target));
            console.log("aToken1 balance after: ", await autoCompounder1.balanceOf(slice.target));
            console.log("vToken balance after: ", await vault.balanceOf(slice.target));
            console.log("vToken1 balance after: ", await vault1.balanceOf(slice.target));
            console.log("USDC balance after: ", await rewardToken.balanceOf(slice.target));
            console.log("Underlying balance after: ", await stakingToken.balanceOf(slice.target));
        });
    });

    describe("addAllocation", function () {
        it("Should add token allocation", async function () {
            const { slice, owner, vault } = await deployFixture();
            const allocationPercentage = 4000;
            const token = await vault.share();

            const tx = await slice.addAllocation(
                token,
                priceIds[0],
                allocationPercentage,
                { from: owner.address, gasLimit: 3000000 }
            );

            console.log(tx.hash);

            await expect(
                tx
            ).to.emit(slice, "AllocationAdded")
                .withArgs(token, priceIds[0], allocationPercentage);
        });

        it("Should revert if zero token address", async function () {
            const { slice } = await deployFixture();
            const allocationPercentage = 4000;

            await expect(
                slice.addAllocation(
                    ZeroAddress,
                    priceIds[0],
                    allocationPercentage,
                )
            ).to.be.revertedWith("Slice: Invalid aToken address");
        });

        it("Should revert if invalid price id", async function () {
            const { slice, autoCompounder } = await deployFixture();
            const allocationPercentage = 4000;

            await expect(
                slice.addAllocation(
                    autoCompounder.target,
                    ZeroHash,
                    allocationPercentage,
                )
            ).to.be.revertedWith("Slice: Invalid price id");
        });

        it("Should revert if invalid percentage", async function () {
            const { slice, autoCompounder } = await deployFixture();
            const allocationPercentage = 0;

            await expect(
                slice.addAllocation(
                    autoCompounder.target,
                    priceIds[0],
                    allocationPercentage,
                )
            ).to.be.revertedWith("Slice: Invalid allocation percentage");
        });

        it("Should revert if token already added", async function () {
            const { slice, owner, autoCompounder } = await deployFixture();
            const allocationPercentage = 4000;

            const tx = await slice.addAllocation(
                autoCompounder.target,
                priceIds[0],
                allocationPercentage,
                { from: owner.address, gasLimit: 3000000 }
            );

            await expect(
                slice.addAllocation(
                    autoCompounder.target,
                    priceIds[0],
                    allocationPercentage,
                )
            ).to.be.revertedWith("Slice: Allocation for the passed token exists");
        });
    });

    describe("setAllocationPercentage", function () {
        it("Should change allocation percentage", async function () {
            const { slice, owner, autoCompounder } = await deployFixture();
            const allocationPercentage = 4000;
            const newAllocationPercentage = 5000;

            const tx = await slice.addAllocation(
                autoCompounder.target,
                priceIds[0],
                allocationPercentage,
                { from: owner.address, gasLimit: 3000000 }
            );

            console.log(tx.hash);

            await expect(
                tx
            ).to.emit(slice, "AllocationAdded");

            const setAllocationTx = await slice.setAllocationPercentage(
                autoCompounder.target,
                newAllocationPercentage
            );

            await expect(
                setAllocationTx
            ).to.emit(slice, "AllocationPercentageChanged")
                .withArgs(autoCompounder.target, newAllocationPercentage);
        });

        it("Should revert if token doesn't exist", async function () {
            const { slice, autoCompounder } = await deployFixture();
            const allocationPercentage = 4000;

            await expect(
                slice.setAllocationPercentage(
                    autoCompounder.target,
                    allocationPercentage,
                )
            ).to.be.revertedWith("Slice: Allocation for the passed token doesn't exist");
        });

        it("Should revert if invalid percentage", async function () {
            const { slice, autoCompounder } = await deployFixture();
            const allocationPercentage = 0;

            await expect(
                slice.setAllocationPercentage(
                    autoCompounder.target,
                    allocationPercentage,
                )
            ).to.be.revertedWith("Slice: Invalid percentage");
        });
    });
});
