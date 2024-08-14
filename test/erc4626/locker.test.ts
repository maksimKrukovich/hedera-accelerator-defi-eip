import { anyValue, ethers, expect } from "../setup";
import { TokenTransfer, createFungibleToken, TokenBalance, createAccount, addToken, mintToken } from "../../scripts/utils";
import { PrivateKey, Client, AccountId, TokenAssociateTransaction, AccountBalanceQuery } from "@hashgraph/sdk";
import hre from "hardhat";
import erc20Abi from "./IERC20.json";
import { Locker } from "../../typechain-types";
import { BigNumberish } from "ethers";

// constants
const lockerAddress = "0x47cE9bbAeC2AFd351Dc08c0A8962b41037235C7d";

const rewardTokenAddress = "0x00000000000000000000000000000000004719e7";
const id = "0.0.4659687";
const stakingTokens = [
    "0x00000000000000000000000000000000004719e6",
    "0x0000000000000000000000000000000000476034",
    "0x0000000000000000000000000000000000476035"
];

async function stake(locker: Locker, address: string, amount: BigNumberish) {
    const token = await ethers.getContractAt(
        erc20Abi.abi,
        address
    );

    await token.approve(locker.target, amount);

    return locker.stake(address, amount);
}
// Tests
describe("Locker", function () {
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

        const rewardToken = await ethers.getContractAt(
            erc20Abi.abi,
            rewardTokenAddress
        );

        const locker = await ethers.getContractAt(
            "Locker",
            lockerAddress
        );

        // const stakingTokenOperatorBalance = await (
        //     await TokenBalance(operatorAccountId, client)
        // ).tokens!.get(id);
        // console.log("Reward token balance: ", stakingTokenOperatorBalance.toString());

        // const Locker = await ethers.getContractFactory("Locker");
        // const locker = await Locker.deploy(
        //     stakingTokenAddress,
        //     rewardTokenAddress
        // );
        // console.log("Hash ", locker.deploymentTransaction()?.hash);
        // await locker.waitForDeployment();

        // console.log("Locker deployed with address: ", await locker.getAddress());

        return {
            locker,
            rewardToken,
            client,
            owner,
        };
    }

    describe("stake", function () {
        it("Should stake the staking token", async function () {
            const { locker, owner } = await deployFixture();
            const amountToStake = ethers.parseUnits("1", 8);

            const tx = await stake(locker, stakingTokens[0], amountToStake);

            await expect(
                tx
            ).to.emit(locker, "Staked")
                .withArgs(owner.address, stakingTokens[0], amountToStake);

            console.log(tx.hash);
        });

        // it("Should revert if amount is zero", async function () {
        //     const { locker } = await deployFixture();
        //     const amountToStake = 0;

        //     await expect(
        //         locker.stake(amountToStake)
        //     ).to.be.revertedWith("Locker: amount cannot be zero");
        // });
    });

    describe("withdraw", function () {
        it("Should withdraw the staking token", async function () {
            const { locker, owner, rewardToken } = await deployFixture();
            const amountToStake = ethers.parseUnits("10", 8);

            await expect(
                stake(locker, stakingTokens[0], amountToStake)
            ).to.emit(locker, "Staked")
                .withArgs(owner.address, stakingTokens[0], amountToStake);

            const tx = await locker.withdraw(stakingTokens[0], amountToStake);

            await expect(
                tx
            ).to.emit(locker, "Withdraw")
                .withArgs(owner.address, stakingTokens[0], amountToStake);

            console.log(tx.hash);
        });

        // it("Should stake the staking token", async function () {
        //     const { locker, owner, stakingToken, rewardToken } = await deployFixture();
        //     const amountToStake = ethers.parseUnits("10", 8);

        //     const tx = await locker.stake(amountToStake);

        //     console.log(tx.hash);
        // });
    });

    describe("claimReward", function () {
        it("Should claim reward", async function () {
            const { locker, owner, rewardToken } = await deployFixture();
            const amountToStake = ethers.parseUnits("10", 8);

            await stake(locker, stakingTokens[0], amountToStake);
            await stake(locker, stakingTokens[1], amountToStake);

            const tx = await locker.claimReward();

            await expect(
                tx
            ).to.emit(locker, "Claim")
                .withArgs(owner.address, amountToStake);

            console.log(tx.hash);
        });
    });

    describe("notifyReward", function () {
        it.only("Should notify reward amount", async function () {
            const { locker, owner, rewardToken } = await deployFixture();
            const amount = 100000000000;

            // const tx = await locker.notifyRewardAmount(amount);

            // console.log(tx.hash);

            // await expect(
            //     tx
            // ).to.emit(locker, "NotifiedRewardAmount");

            console.log(await locker.userRewardPerTokenPaid(owner.address, stakingTokens[0]));
            console.log(await locker.rewards(owner.address, stakingTokens[0]));
            console.log(await locker.earned(owner.address, stakingTokens[0]));
        });
    });

    describe("setRewardsDuration", function () {
        it("Should set rewards duration", async function () {
            const { locker, owner, rewardToken } = await deployFixture();
            const amount = 100000000000;

            const blockNumber = await ethers.provider.getBlockNumber();
            const block = await ethers.provider.getBlock(blockNumber);
            const currentTime = block!.timestamp;

            const duration = currentTime + 100000;

            const tx1 = await rewardToken.approve(locker.target, amount);
            console.log(tx1.hash);

            const tx = await locker.setRewardsDuration(duration, amount);

            console.log(tx.hash);

            await expect(
                tx
            ).to.emit(locker, "RewardsDurationUpdated")
                .withArgs(duration, amount);
        });
    });
});
