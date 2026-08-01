// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockUSDC.sol";
import "./Oracle.sol";

/**
 * @title VulnerablePredictionMarket
 * @notice Educational contract containing intentional vulnerabilities for security research:
 *         1. Unprotected Reentrancy (External call before state update).
 *         2. Unscaled Integer Division Loss (Rounding down to zero/underpayment).
 *         3. Mempool Front-Runable Resolution (No state lock before oracle report landing).
 *         4. Naive block.timestamp checks vulnerable to validator drift manipulation.
 */
contract VulnerablePredictionMarket {
    MockUSDC public immutable usdc;
    Oracle public immutable oracle;

    uint256 public immutable marketId;
    string public question;
    uint256 public immutable resolutionDeadline;

    enum MarketState { OPEN, RESOLVED, CANCELLED }
    MarketState public state;

    Oracle.Outcome public winningOutcome;

    uint256[2] public totalStakes; // index 0 = YES, index 1 = NO
    mapping(address => uint256[2]) public userStakes;
    mapping(address => bool) public hasClaimed;

    event Staked(address indexed user, uint8 outcomeIndex, uint256 amount);
    event MarketResolved(Oracle.Outcome outcome);
    event PayoutClaimed(address indexed user, uint256 amount);

    constructor(
        address _usdc,
        address _oracle,
        uint256 _marketId,
        string memory _question,
        uint256 _duration
    ) {
        usdc = MockUSDC(_usdc);
        oracle = Oracle(_oracle);
        marketId = _marketId;
        question = _question;
        resolutionDeadline = block.timestamp + _duration;
        state = MarketState.OPEN;
    }

    /**
     * @notice VULNERABILITY (Front-running + Timestamp Manipulation):
     *         Staking check uses strict `< resolutionDeadline`.
     *         Does NOT lock market when resolution transaction enters mempool.
     *         Mempool arbitrageurs see resolution tx and stake on winning outcome right before block lands!
     */
    function stakeVulnerable(uint8 outcomeIndex, uint256 amount) external {
        require(state == MarketState.OPEN, "Market not open");
        // Naive timestamp check: Miner/Validator can manipulate block.timestamp by +/- 15s
        require(block.timestamp < resolutionDeadline, "Deadline passed");
        require(outcomeIndex == 0 || outcomeIndex == 1, "Invalid outcome");

        userStakes[msg.sender][outcomeIndex] += amount;
        totalStakes[outcomeIndex] += amount;

        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit Staked(msg.sender, outcomeIndex, amount);
    }

    /**
     * @notice VULNERABILITY (Front-Runable Resolution):
     *         Resolves immediately without state lock phase. Anyone can see oracle report in mempool.
     */
    function resolveVulnerable() external {
        require(state == MarketState.OPEN, "Market already resolved");

        (Oracle.Outcome oracleOutcome, bool isFinalized) = oracle.getOutcome(marketId);
        require(isFinalized, "Oracle outcome not finalized");

        winningOutcome = oracleOutcome;
        state = MarketState.RESOLVED;
        emit MarketResolved(oracleOutcome);
    }

    /**
     * @notice VULNERABILITY (Reentrancy + Precision Rounding Loss):
     *         1. Reentrancy: Transfers tokens BEFORE setting `hasClaimed[msg.sender] = true`.
     *         2. Precision Loss: Calculates payout via unscaled integer division:
     *            `payout = (userStake * totalPool) / winningPool`
     *            Small stakes suffer severe integer truncation loss or evaluate to 0!
     */
    function claimPayoutVulnerable() external returns (uint256 payout) {
        require(state == MarketState.RESOLVED, "Market not resolved");
        require(!hasClaimed[msg.sender], "Already claimed");

        uint8 winIdx = (winningOutcome == Oracle.Outcome.YES) ? 0 : 1;
        uint256 userWinningStake = userStakes[msg.sender][winIdx];
        require(userWinningStake > 0, "No winning stake");

        uint256 totalPool = totalStakes[0] + totalStakes[1];
        uint256 winningPool = totalStakes[winIdx];

        // VULNERABLE ROUNDING: Unscaled integer division
        // If userWinningStake * totalPool < winningPool, payout evaluates to ZERO, stealing funds!
        payout = (userWinningStake * totalPool) / winningPool;

        // VULNERABLE REENTRANCY: External call BEFORE state update (Violates CEI & No ReentrancyGuard)
        require(usdc.transfer(msg.sender, payout), "Payout transfer failed");

        // State change AFTER transfer!
        hasClaimed[msg.sender] = true;

        emit PayoutClaimed(msg.sender, payout);
        return payout;
    }
}
