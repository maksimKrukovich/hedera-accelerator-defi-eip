import { anyValue, ethers, expect } from "../setup";
import { PrivateKey, Client, AccountId } from "@hashgraph/sdk";
import { ZeroAddress } from "ethers";
import { VaultToken, BasicVault, AsyncVault, AutoCompounder } from "../../typechain-types";
import hre from "hardhat";

import {
    usdcAddress,
    uniswapRouterAddress,
    uniswapFactoryAddress
} from "../../constants";

// constants
const testAccountAddress = "0x934b9afc8be0f78f698753a8f67131fa58cd9884";
const operatorPrKeyTest = PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY_TEST || '');
const operatorAccountIdTest = AccountId.fromString(process.env.ACCOUNT_ID_TEST || '');

const operatorPrKey = PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY || '');
const operatorAccountId = AccountId.fromString(process.env.ACCOUNT_ID || '');

const testAccount = new hre.ethers.Wallet(process.env.PRIVATE_KEY_TEST!, ethers.provider);

// Zero fee
const feeConfig = {
    receiver: ZeroAddress,
    token: ZeroAddress,
    feePercentage: 0,
};

// Tests
describe("AutoCompounder", function () {
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

        const VaultToken = await ethers.getContractFactory("VaultToken");
        const stakingToken = await VaultToken.deploy(
        ) as VaultToken;
        await stakingToken.waitForDeployment();

        await stakingToken.mint(testAccount.address, ethers.parseUnits("500000000", 18));

        const RewardToken = await ethers.getContractFactory("VaultToken");
        const rewardToken = await RewardToken.deploy(
        ) as VaultToken;
        await rewardToken.waitForDeployment();

        // const BasicVault = await ethers.getContractFactory("BasicVault");
        // const basicVault = await BasicVault.deploy(
        //     stakingToken.target,
        //     "TST",
        //     "TST",
        //     feeConfig,
        //     owner.address,
        //     owner.address
        // ) as BasicVault;
        // await basicVault.waitForDeployment();

        const AsyncVault = await ethers.getContractFactory("contracts/erc7540/AsyncVault.sol:AsyncVault");
        const basicVault = await AsyncVault.deploy(
            stakingToken.target,
            "TST",
            "TST",
            feeConfig,
            owner.address,
            owner.address
        ) as AsyncVault;
        await basicVault.waitForDeployment();

        const AutoCompounder = await ethers.getContractFactory("AutoCompounder");
        const autoCompounder = await AutoCompounder.deploy(
            uniswapRouterAddress,
            basicVault,
            rewardToken.target, // TODO: change to real USDC
            "TST",
            "TST"
        ) as AutoCompounder;
        await autoCompounder.waitForDeployment();

        return {
            autoCompounder,
            basicVault,
            stakingToken,
            rewardToken,
            client,
            owner,
        };
    }

    describe("deposit", function () {
        it("Should deposit tokens and return shares", async function () {
            const { autoCompounder, stakingToken, owner, basicVault } = await deployFixture();
            const amountToDeposit = ethers.parseUnits("170", 18);

            await stakingToken.approve(autoCompounder.target, amountToDeposit);

            const tx = await autoCompounder.deposit(
                amountToDeposit,
                owner.address,
                { from: owner.address, gasLimit: 3000000 }
            );

            console.log(tx.hash);

            await expect(
                tx
            ).to.emit(autoCompounder, "Deposit")
                .withArgs(owner.address, amountToDeposit, anyValue);

            // Check share token was transferred to contract
            await expect(
                tx
            ).to.changeTokenBalance(
                basicVault,
                autoCompounder.target,
                amountToDeposit
            );
            // Check auto token was transferred to contract
            await expect(
                tx
            ).to.changeTokenBalance(
                autoCompounder,
                owner.address,
                amountToDeposit / await autoCompounder.exchangeRate()
            );
        });

        it("Should revert in case of zero assets", async function () {
            const { autoCompounder, owner } = await deployFixture();
            const amountToDeposit = 0;

            await expect(
                autoCompounder.deposit(
                    amountToDeposit,
                    owner.address
                )
            ).to.be.revertedWith("AutoCompounder: Invalid assets amount");
        });
    });

    describe("withdraw", function () {
        it.only("Should withdraw tokens", async function () {
            const { autoCompounder, basicVault, stakingToken, rewardToken, owner } = await deployFixture();
            const amountToWithdraw = 10;
            const rewardAmount = 50000;
            const amountToDeposit = ethers.parseUnits("170", 18);

            await stakingToken.approve(autoCompounder.target, amountToDeposit);

            await autoCompounder.deposit(
                amountToDeposit,
                owner.address,
                { from: owner.address, gasLimit: 3000000 }
            );

            // Add reward to the Vault
            await rewardToken.approve(basicVault.target, rewardAmount);
            await basicVault.addReward(rewardToken.target, rewardAmount);

            await autoCompounder.approve(autoCompounder.target, 100);
            await basicVault.approve(autoCompounder.target, 1000);

            const tx = await autoCompounder.withdraw(
                amountToWithdraw,
                owner.address,
                { from: owner.address, gasLimit: 3000000 }
            );

            console.log(tx.hash);

            await expect(
                tx
            ).to.emit(autoCompounder, "Withdraw")
                .withArgs(owner.address, amountToWithdraw, anyValue);
        });

        it("Should revert in case of zero amount of aToken", async function () {
            const { autoCompounder } = await deployFixture();
            const amountToWithdraw = 0;

            await expect(
                autoCompounder.withdraw(
                    amountToWithdraw,
                    autoCompounder.target
                )
            ).to.be.revertedWith("AutoCompounder: Invalid aToken amount");
        });
    });

    describe("claim", function () {
        it("Should claim reward and reinvest", async function () {
            const { autoCompounder, basicVault, stakingToken, rewardToken, owner } = await deployFixture();
            const amountToDeposit = 112412;
            const rewardAmount = ethers.parseUnits("5000000", 18);

            const uniswapRouter = await ethers.getContractAt(
                "contracts/erc4626/interfaces/IUniswapV2Router02.sol:IUniswapV2Router02",
                uniswapRouterAddress
            );
            const uniswapFactory = await ethers.getContractAt("IUniswapV2Factory", uniswapFactoryAddress);

            const latestBlock = await ethers.provider.getBlock("latest");
            const timestamp = latestBlock?.timestamp;

            // Create Pair
            await uniswapFactory.createPair(
                rewardToken.target,
                stakingToken.target,
                { gasLimit: 3000000 }
            );

            // Add Liquidity
            await rewardToken.approve(uniswapRouter, ethers.parseUnits("5000000", 18));
            await stakingToken.approve(uniswapRouter, ethers.parseUnits("5000000", 18));

            const addLiquidityTx = await uniswapRouter.addLiquidity(
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

            // Deposit
            await stakingToken.approve(autoCompounder.target, amountToDeposit);
            await autoCompounder.deposit(
                amountToDeposit,
                owner.address,
                { from: owner.address, gasLimit: 3000000 }
            );

            // Add reward to the Vault
            await rewardToken.approve(basicVault.target, rewardAmount);
            await basicVault.addReward(rewardToken.target, rewardAmount);

            console.log("Shares: ", await basicVault.balanceOf(autoCompounder.target));
            console.log("Reward: ", await basicVault.getUserReward(autoCompounder.target, rewardToken.target));

            // Claim and reinvest
            const tx = await autoCompounder.claim(
                { from: owner.address, gasLimit: 3000000 }
            );

            console.log("Claim Tx", tx.hash);

            await expect(
                tx
            ).to.emit(autoCompounder, "Claim");
        });
    });
});
