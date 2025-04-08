import { anyValue, ethers, expect } from "../setup";
import { PrivateKey, Client, AccountId } from "@hashgraph/sdk";
import { ZeroAddress } from "ethers";
import { AutoCompounderFactory, BasicVault, VaultToken, UniswapRouterMock } from "../../typechain-types";

import factoryAbi from "@uniswap/v2-core/build/UniswapV2Factory.json";
import routerAbi from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import wethAbi from "@uniswap/v2-periphery/build/WETH9.json";

// constants
const salt = "testSalt";

const cliff = 100;
const unlockDuration = 500;

const aTokenName = "aToken";
const aTokenSymbol = "aToken";

// Zero fee
const feeConfig = {
    receiver: ZeroAddress,
    token: ZeroAddress,
    feePercentage: 0,
};

// Tests
describe("AutoCompounderFactory", function () {
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

        // Uniswap
        const UniswapV2Factory = await ethers.getContractFactory(factoryAbi.abi, factoryAbi.bytecode, owner);
        const uniswapV2Factory = await UniswapV2Factory.deploy(
            owner.address,
        );
        await uniswapV2Factory.waitForDeployment();

        const WETH = await ethers.getContractFactory(wethAbi.abi, wethAbi.bytecode, owner);
        const weth = await WETH.deploy();
        await weth.waitForDeployment();

        const UniswapV2Router02 = await ethers.getContractFactory(routerAbi.abi, routerAbi.bytecode, owner);
        const uniswapV2Router02 = await UniswapV2Router02.deploy(
            uniswapV2Factory.target,
            weth.target
        ) as UniswapRouterMock;
        await uniswapV2Router02.waitForDeployment();

        // Vault
        const VaultToken = await ethers.getContractFactory("VaultToken");
        const stakingToken = await VaultToken.deploy(
        ) as VaultToken;
        await stakingToken.waitForDeployment();

        const BasicVault = await ethers.getContractFactory("BasicVault");
        const hederaVault = await BasicVault.deploy(
            stakingToken.target,
            "TST",
            "TST",
            feeConfig,
            owner.address,
            owner.address,
            cliff,
            unlockDuration
        ) as BasicVault;
        await hederaVault.waitForDeployment();

        const AutoCompounderFactory = await ethers.getContractFactory(
            "AutoCompounderFactory"
        );
        const autoCompounderFactory = await AutoCompounderFactory.deploy() as AutoCompounderFactory;
        await autoCompounderFactory.waitForDeployment();

        return {
            autoCompounderFactory,
            hederaVault,
            stakingToken,
            uniswapV2Router02,
            client,
            owner,
        };
    }

    describe("deployAutoCompounder", function () {
        it("Should deploy AutoCompounder", async function () {
            const { autoCompounderFactory, hederaVault, stakingToken, uniswapV2Router02, owner } = await deployFixture();
            const autoCompounderDetails = {
                uniswapV2Router: uniswapV2Router02.target,
                vault: hederaVault.target,
                usdc: stakingToken.target,
                aTokenName: aTokenName,
                aTokenSymbol: aTokenSymbol,
                operator: ZeroAddress
            }

            const tx = await autoCompounderFactory.deployAutoCompounder(
                salt,
                autoCompounderDetails,
                { from: owner.address, gasLimit: 3000000 }
            );

            console.log(tx.hash);

            await expect(
                tx
            ).to.emit(autoCompounderFactory, "AutoCompounderDeployed")
                .withArgs(anyValue, hederaVault.target, aTokenName, aTokenSymbol);
        });
    });
});
