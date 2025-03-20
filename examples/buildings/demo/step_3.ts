import { ethers } from 'hardhat';

async function logProposalState(governanceAddress: string, proposalId: bigint) {
  const governance = await ethers.getContractAt('BuildingGovernance', governanceAddress);
  // const token = await ethers.getContractAt('BuildingERC20', await governance.token());
  console.log(
    `\n\n` + 
    `clock: ${await governance.clock()}\n` +
    `voting period: ${await governance.votingPeriod()}\n` +
    `voting delay: ${await governance.votingDelay()}\n` +
    `token: ${await governance.token()}\n` +
    `proposalId: ${proposalId}\n` +
    `proposal threshold: ${await governance.proposalThreshold()}\n` +
    `proposal state: ${await governance.state(proposalId)}\n` +
    `proposal votes: ${await governance.proposalVotes(proposalId)}\n` +
    `proposal snapshot: ${await governance.proposalSnapshot(proposalId)}\n` +
    `proposal deadline: ${await governance.proposalDeadline(proposalId)}\n` +
    `proposal proposer: ${await governance.proposalProposer(proposalId)}\n` +
    `proposal eta: ${await governance.proposalEta(proposalId)}\n\n` 
  );
}

async function executeTextProposal(governanceAddress: string, description: string) {
  const governance = await ethers.getContractAt('BuildingGovernance', governanceAddress);
  
  const descriptionHash = ethers.id(description);

  const extx = await governance.execute(
    [ethers.ZeroAddress],
    [0n],
    ["0x"],
    descriptionHash,
    { gasLimit: 600000 }
  );

  await extx.wait();

  console.log(`- proposal ${description} executed`);
}

async function run () {
  const governance = "GOVERNANCE_ADDRESS";
  const proposalDescription = "Proposal #2: Create a new proposal";
  const proposalId = 0n; // PROPOSAL_ID
  
  await executeTextProposal(governance, proposalDescription);
  await logProposalState(governance, proposalId);
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
