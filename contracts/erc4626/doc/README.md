# Basic Vault  
[Initial] Version 1.0  

## What is ERC4626  
It is a tokenized vault standard that simplifies the steps of depositing and withdrawing assets.  
Investors are able to deposit their assets into the vault and, in return, receive yield-bearing tokens that automatically represent the value of their share in the fund. This enables a smooth and automated access to the income sourced from the real estate portfolio.  

## Overview  
BasicVault is an advanced ERC4626-compliant tokenized vault that allows users to deposit an  
ERC20 token and receive share tokens in return. These shares are subject to linear vesting after a  
configurable cliff and unlock period. The contract also supports distributing multiple reward tokens  
proportional to users' share balances.  

## Initialisation  
| Parameters                | Description                                        |
|---------------------------|----------------------------------------------------|
| underlying_               | The ERC20 asset to be deposited.                   |
| name_                     | Name of the share token.                           |
| symbol_                   | Symbol of the share token.                         |
| feeConfig_                | Initial fee configuration.                         |
| vaultRewardController_    | Address allowed to add rewards.                    |
| feeConfigController_      | Address allowed to modify fee configuration.       |
| cliff_                    | Time in seconds before any shares unlock.          |
| unlockDuration_           | Time in seconds over which shares unlock linearly. |

## Deployment & Testing  
The contract can be deployed standardly via its contract factory and hardhat:  

```js
const Vault = await ethers.getContractFactory('BasicVault');
const vault = await Vault.deploy(*deploymentParams*);
await vault.waitForDeployment();
```

Or via script and the command:

```bash
yarn hardhat run examples/vault/deploy-vault.ts —-network testnet
```

The contract can be tested by the following command:

```bash
yarn hardhat test test/erc4626/basicVault.test.ts
```

## Roles & Permissions
VAULT_REWARD_CONTROLLER_ROLE
* The address(s) that can add reward tokens to the vault;
* Why: Prevents anyone from spamming arbitrary reward tokens;
* How to assign:

```js
vault.grantRole(
  await vault.VAULT_REWARD_CONTROLLER_ROLE(),
  rewardManagerAddress
);
```

OWNER (Ownable)
* The deployer or any address you transfer ownership to;
* Why: Can update vault parameters (e.g., vesting times);
* Transfer Ownership:

```js
await vault.transferOwnership(newOwnerAddress);
```

FEE_CONFIG_CONTROLLER_ROLE
* The fee manager address;
* Why: Can update fee configuration;
* Update fee configuration:

```js
const newFeeConfiguration = {
  receiver: feeReceiverAddress,
  token: feeTokenAddress,
  feePercentage: 0 < feePercentage < 10000
};
await vault.updateFeeConfig(newFeeConfiguration);
```

## Core Functions
### Deposit & Mint
deposit(uint256 assets, address receiver) returns uint256
* Deposits assets into the vault;
* Mints new shares to the receiver;
* Note: shares are initially locked based on vesting logic.

mint(uint256 shares, address receiver) returns uint256
* Deposits the required assets to mint shares to receiver.

### Withdraw & Redeem
withdraw(uint256 assets, address receiver, address owner) returns uint256
* Burns unlocked shares from owner;
* Transfers equivalent assets to receiver;
* Note: triggers claimReward for receiver.

redeem(uint256 shares, address receiver, address owner) returns uint256
* Burns shares from owner;
* Transfers unlocked assets to receiver;
* Note: triggers claimReward for receiver.

## Unlocking & Vesting logic
Linear Vesting per Deposit
* Each deposit is timestamped (depositLockCheckpoint);
* Shares begin unlocking after cliff time;
* Unlocking occurs linearly over unlockDuration.

### Key Functions
unlockedOf(address account) public view returns (uint256)
* Returns unlocked share balance of account.

lockedOf(address account) public view returns (uint256)
* Returns locked share balance of account.

### Unlocked Shares Calculation
If current time < lockStart, nothing is unlocked:

$$
\text{unlocked} = \text{0}
$$

If current time >= lockEnd, everything is unlocked:

$$
\text{unlocked} = \text{totalLocked} - \text{totalReleased}
$$

Otherwise, unlocks linearly:

$$
\text{unlocked} 
= (\text{totalLocked} - \text{totalReleased})
\;\times\;
\frac{\text{currentTime} - \text{lockStart}}{\text{unlockDuration}}
$$

## Rewards
Rewards allow the Vault to distribute additional ERC-20 tokens to depositors as an incentive.
These reward tokens are held in the Vault and accrue over time, proportional to each user’s share balance.
When new rewards are added, they are converted into a per-share reward rate so every depositor
automatically earns from future distributions.

addReward(address token, uint256 amount) external
* Adds a reward token to the vault;
* Only callable by VAULT_REWARD_CONTROLLER_ROLE.

claimAllReward(uint256 startIndex, address receiver) public returns (uint256, uint256)
* Claims all pending rewards for the caller and transfers to receiver.

getUserReward(address user, address rewardToken) public view returns (uint256)
* Returns pending reward amount for user for a specific reward token.

getAllRewards(address user) public view returns (uint256[])
* Returns all pending rewards for user across all reward tokens.

### Reward Calculation
$$
\text{rewardAmount} =
\left(
\text{perShareReward} - \text{lastClaimedPerShareReward}
\right)
\times
\frac{\text{userShares}}{10^{18}}
$$

## Admin Functions
setSharesLockTime(uint32 time) external onlyOwner
* Updates the unlock duration.

## View Functions
cliff() returns uint32
* Returns the configured cliff duration in seconds.

unlockDuration() returns uint32
* Returns the linear unlock duration in seconds.

feeConfig() returns FeeConfig struct
* Returns the configured fee for claim rewards.

getRewardTokens() returns address[]
* Returns an array of all reward tokens.

supportsInterface(bytes4 interfaceId) returns bool
* ERC165 interface support check.

## Inherited ERC4626 Functions (OpenZeppelin)
### Deposit & Mint
maxDeposit(address) – Maximum deposit allowed for user;

maxMint(address) – Maximum shares that can be minted for user;

previewDeposit(uint256) – Estimate shares returned for a deposit;

previewMint(uint256) – Estimate assets required to mint shares.

### Withdraw & Redeem
maxWithdraw(address) – Max assets user can withdraw (based on unlocked shares);

maxRedeem(address) – Maximum shares user can redeem;

previewWithdraw(uint256) – Estimate shares needed to withdraw amount;

previewRedeem(uint256) – Estimate assets received for share redemption.

### Asset & Share Accounting
convertToShares(uint256 assets) – Converts asset amount to shares;

convertToAssets(uint256 shares) – Converts shares to assets;

totalAssets() – Returns total amount of underlying assets held by the vault.