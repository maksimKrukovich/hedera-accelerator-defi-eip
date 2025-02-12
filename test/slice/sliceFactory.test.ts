import { ethers, expect } from "../setup";
import { PrivateKey, Client, AccountId } from "@hashgraph/sdk";
import { ZeroAddress, ZeroHash } from "ethers";
import { SliceFactory } from "../../typechain-types";

import {
    usdcAddress,
    uniswapRouterAddress,
    pythOracleAddress,
    pythUtilsAddress
} from "../../constants";

// constants
const salt = "testSalt";

const groupName = "Stadiums";
const sTokenPayload = "sToken";

const group = ethers.zeroPadBytes(ethers.toUtf8Bytes(groupName), 32);
const description = ethers.zeroPadBytes(ethers.toUtf8Bytes(sTokenPayload), 32)

// Tests
describe("SliceFactory", function () {
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

        const SliceFactory = await ethers.getContractFactory("SliceFactory", {
            libraries: {
                PythUtils: pythUtilsAddress,
            },
        });
        const sliceFactory = await SliceFactory.deploy() as SliceFactory;
        await sliceFactory.waitForDeployment();

        return {
            sliceFactory,
            client,
            owner,
        };
    }

    describe("deploySlice", function () {
        it("Should deploy Slice and compare slice group", async function () {
            const { sliceFactory, owner } = await deployFixture();
            const sliceDetails = {
                pyth: pythOracleAddress,
                uniswapRouter: uniswapRouterAddress,
                usdc: usdcAddress,
                name: sTokenPayload,
                symbol: sTokenPayload,
                group: group,
                description: description,
                decimals: 8
            }

            // Deploy Slice
            const tx = await sliceFactory.deploySlice(
                salt,
                sliceDetails,
                { from: owner.address, gasLimit: 3000000 }
            );

            console.log(tx.hash);

            await expect(
                tx
            ).to.emit(sliceFactory, "SliceDeployed");

            // Get deployed Slice
            const sliceAddress = await sliceFactory.getSlicesByGroup(group);
            const slice = await ethers.getContractAt("Slice", sliceAddress[0]);

            const actualSliceGroup = await slice.group();

            // Check the group match
            expect(actualSliceGroup).to.eq(group);
        });

        it("Should revert if oracle zero address", async function () {
            const { sliceFactory } = await deployFixture();
            const sliceDetails = {
                pyth: ZeroAddress,
                uniswapRouter: uniswapRouterAddress,
                usdc: usdcAddress,
                name: sTokenPayload,
                symbol: sTokenPayload,
                group: group,
                description: description,
                decimals: 8
            }

            await expect(
                sliceFactory.deploySlice(
                    salt,
                    sliceDetails
                )
            ).to.be.revertedWith("SliceFactory: Invalid Pyth oracle address");
        });

        it("Should revert if uniswap router zero address", async function () {
            const { sliceFactory } = await deployFixture();
            const sliceDetails = {
                pyth: pythOracleAddress,
                uniswapRouter: ZeroAddress,
                usdc: usdcAddress,
                name: sTokenPayload,
                symbol: sTokenPayload,
                group: group,
                description: description,
                decimals: 8
            }

            await expect(
                sliceFactory.deploySlice(
                    salt,
                    sliceDetails
                )
            ).to.be.revertedWith("SliceFactory: Invalid Uniswap Router address");
        });

        it("Should revert if USDC zero address", async function () {
            const { sliceFactory } = await deployFixture();
            const sliceDetails = {
                pyth: pythOracleAddress,
                uniswapRouter: uniswapRouterAddress,
                usdc: ZeroAddress,
                name: sTokenPayload,
                symbol: sTokenPayload,
                group: group,
                description: description,
                decimals: 8
            }

            await expect(
                sliceFactory.deploySlice(
                    salt,
                    sliceDetails
                )
            ).to.be.revertedWith("SliceFactory: Invalid USDC address");
        });

        it("Should revert if group wasn't provided", async function () {
            const { sliceFactory } = await deployFixture();
            const sliceDetails = {
                pyth: pythOracleAddress,
                uniswapRouter: uniswapRouterAddress,
                usdc: usdcAddress,
                name: sTokenPayload,
                symbol: sTokenPayload,
                group: ZeroHash,
                description: description,
                decimals: 8
            }

            await expect(
                sliceFactory.deploySlice(
                    salt,
                    sliceDetails
                )
            ).to.be.revertedWith("SliceFactory: Invalid group");
        });
    });
});
