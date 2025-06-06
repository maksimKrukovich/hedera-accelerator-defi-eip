// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

contract BuildingGovernanceBeacon is UpgradeableBeacon {
    constructor(address implementation) UpgradeableBeacon(implementation, msg.sender) {}
}
