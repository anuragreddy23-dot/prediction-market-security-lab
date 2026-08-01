// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockUSDC.sol";

/**
 * @title Oracle
 * @notice Multi-reporter dispute-enabled oracle contract for prediction markets.
 * @dev Implements a two-phase resolution mechanism:
 *      1. Initial Outcome Proposal with mandatory reporter stake bond.
 *      2. 24-hour Dispute Window allowing counter-bonded challenges.
 *      3. Slashing of dishonest reporters / failed challengers.
 */
contract Oracle {
    MockUSDC public immutable usdc;
    address public owner;

    uint256 public constant DISPUTE_WINDOW = 24 hours;
    uint256 public constant MIN_REPORTER_BOND = 100 * 10**6; // 100 USDC
    uint256 public constant DISPUTE_BOND_MULTIPLIER = 2; // 2x reporter bond required to dispute

    enum Outcome { UNRESOLVED, YES, NO, AMBIGUOUS }
    enum ProposalState { NONE, PROPOSED, DISPUTED, FINALIZED }

    struct Proposal {
        uint256 marketId;
        Outcome proposedOutcome;
        address reporter;
        uint256 reporterBond;
        uint256 timestamp;
        ProposalState state;
        address challenger;
        uint256 disputeBond;
        Outcome finalOutcome;
    }

    // marketId => Proposal
    mapping(uint256 => Proposal) public proposals;
    mapping(address => bool) public isAuthorizedReporter;

    event ReporterAuthorized(address indexed reporter, bool status);
    event OutcomeProposed(uint256 indexed marketId, address indexed reporter, Outcome outcome, uint256 bond);
    event OutcomeDisputed(uint256 indexed marketId, address indexed challenger, uint256 disputeBond);
    event ProposalFinalized(uint256 indexed marketId, Outcome finalOutcome, address SlashedParty, uint256 Reward);

    modifier onlyOwner() {
        require(msg.sender == owner, "Oracle: caller not owner");
        _;
    }

    constructor(address _usdc) {
        usdc = MockUSDC(_usdc);
        owner = msg.sender;
        isAuthorizedReporter[msg.sender] = true;
    }

    function setAuthorizedReporter(address reporter, bool status) external onlyOwner {
        isAuthorizedReporter[reporter] = status;
        emit ReporterAuthorized(reporter, status);
    }

    /**
     * @notice Propose outcome for a market with a bond.
     */
    function proposeOutcome(uint256 marketId, Outcome outcome, uint256 bondAmount) external {
        require(isAuthorizedReporter[msg.sender], "Oracle: unauthorized reporter");
        require(outcome == Outcome.YES || outcome == Outcome.NO || outcome == Outcome.AMBIGUOUS, "Oracle: invalid outcome");
        require(bondAmount >= MIN_REPORTER_BOND, "Oracle: bond too low");
        require(proposals[marketId].state == ProposalState.NONE, "Oracle: outcome already proposed");

        require(usdc.transferFrom(msg.sender, address(this), bondAmount), "Oracle: bond transfer failed");

        proposals[marketId] = Proposal({
            marketId: marketId,
            proposedOutcome: outcome,
            reporter: msg.sender,
            reporterBond: bondAmount,
            timestamp: block.timestamp,
            state: ProposalState.PROPOSED,
            challenger: address(0),
            disputeBond: 0,
            finalOutcome: Outcome.UNRESOLVED
        });

        emit OutcomeProposed(marketId, msg.sender, outcome, bondAmount);
    }

    /**
     * @notice Dispute a proposed outcome during the 24-hour window by posting counter-stake.
     */
    function disputeOutcome(uint256 marketId) external {
        Proposal storage prop = proposals[marketId];
        require(prop.state == ProposalState.PROPOSED, "Oracle: market not in proposed state");
        require(block.timestamp <= prop.timestamp + DISPUTE_WINDOW, "Oracle: dispute window closed");
        require(msg.sender != prop.reporter, "Oracle: reporter cannot dispute own proposal");

        uint256 requiredDisputeBond = prop.reporterBond * DISPUTE_BOND_MULTIPLIER;
        require(usdc.transferFrom(msg.sender, address(this), requiredDisputeBond), "Oracle: dispute bond failed");

        prop.state = ProposalState.DISPUTED;
        prop.challenger = msg.sender;
        prop.disputeBond = requiredDisputeBond;

        emit OutcomeDisputed(marketId, msg.sender, requiredDisputeBond);
    }

    /**
     * @notice Finalize proposal after dispute window closes without dispute.
     */
    function finalizeUncontestedProposal(uint256 marketId) external returns (Outcome) {
        Proposal storage prop = proposals[marketId];
        require(prop.state == ProposalState.PROPOSED, "Oracle: market not proposed or already resolved");
        require(block.timestamp > prop.timestamp + DISPUTE_WINDOW, "Oracle: dispute window active");

        prop.state = ProposalState.FINALIZED;
        prop.finalOutcome = prop.proposedOutcome;

        // Return reporter's initial bond
        require(usdc.transfer(prop.reporter, prop.reporterBond), "Oracle: bond refund failed");

        emit ProposalFinalized(marketId, prop.finalOutcome, address(0), 0);
        return prop.finalOutcome;
    }

    /**
     * @notice Resolve a disputed outcome via arbitration / multi-reporter consensus.
     * @param verifiedOutcome True ground truth outcome determined by consensus.
     */
    function resolveDispute(uint256 marketId, Outcome verifiedOutcome) external onlyOwner returns (Outcome) {
        Proposal storage prop = proposals[marketId];
        require(prop.state == ProposalState.DISPUTED, "Oracle: proposal not disputed");

        prop.state = ProposalState.FINALIZED;
        prop.finalOutcome = verifiedOutcome;

        if (verifiedOutcome != prop.proposedOutcome) {
            // Reporter lied! Slash reporter bond -> pay challenger
            uint256 totalReward = prop.reporterBond + prop.disputeBond;
            require(usdc.transfer(prop.challenger, totalReward), "Oracle: reward payout failed");
            emit ProposalFinalized(marketId, verifiedOutcome, prop.reporter, totalReward);
        } else {
            // Dispute was invalid! Slash challenger bond -> pay reporter
            uint256 totalReward = prop.reporterBond + prop.disputeBond;
            require(usdc.transfer(prop.reporter, totalReward), "Oracle: reward payout failed");
            emit ProposalFinalized(marketId, verifiedOutcome, prop.challenger, totalReward);
        }

        return verifiedOutcome;
    }

    function getOutcome(uint256 marketId) external view returns (Outcome state, bool isFinalized) {
        Proposal memory prop = proposals[marketId];
        if (prop.state == ProposalState.FINALIZED) {
            return (prop.finalOutcome, true);
        }
        return (Outcome.UNRESOLVED, false);
    }
}
