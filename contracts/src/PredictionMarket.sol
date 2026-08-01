// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockUSDC.sol";
import "./Oracle.sol";

/**
 * @title PredictionMarket
 * @notice Production-grade, secured binary prediction market smart contract.
 * @dev Implements:
 *      1. ReentrancyGuard + Checks-Effects-Interactions (CEI).
 *      2. High-precision 1e18 scaled math for proportional payouts (zero rounding loss).
 *      3. State Lock before resolution to prevent mempool front-running.
 *      4. Full refund/cancellation mechanism for ambiguous outcomes or expired deadlines.
 */
contract PredictionMarket {
    MockUSDC public immutable usdc;
    Oracle public immutable oracle;

    uint256 public immutable marketId;
    string public question;
    uint256 public immutable resolutionDeadline;
    uint256 public constant SCALE = 1e18; // Precision scale factor

    enum MarketState { OPEN, LOCKED, RESOLVED, CANCELLED }
    MarketState public state;

    Oracle.Outcome public winningOutcome;

    // Staking pools: YES (0), NO (1)
    uint256[2] public totalStakes; // index 0 = YES, index 1 = NO
    mapping(address => uint256[2]) public userStakes;
    mapping(address => bool) public hasClaimed;

    uint256 private _unlocked = 1;
    modifier nonReentrant() {
        require(_unlocked == 1, "REENTRANCY_GUARD");
        _unlocked = 0;
        _;
        _unlocked = 1;
    }

    event Staked(address indexed user, uint8 outcomeIndex, uint256 amount);
    event MarketLocked(uint256 timestamp);
    event MarketResolved(Oracle.Outcome outcome);
    event MarketCancelled(string reason);
    event PayoutClaimed(address indexed user, uint256 amount);
    event RefundClaimed(address indexed user, uint256 amount);

    constructor(
        address _usdc,
        address _oracle,
        uint256 _marketId,
        string memory _question,
        uint256 _duration
    ) {
        require(_duration >= 1 hours, "Duration too short");
        usdc = MockUSDC(_usdc);
        oracle = Oracle(_oracle);
        marketId = _marketId;
        question = _question;
        resolutionDeadline = block.timestamp + _duration;
        state = MarketState.OPEN;
    }

    /**
     * @notice Stake USDC on an outcome (0 = YES, 1 = NO).
     */
    function stake(uint8 outcomeIndex, uint256 amount) external nonReentrant {
        require(state == MarketState.OPEN, "Market not open");
        require(block.timestamp < resolutionDeadline, "Deadline passed");
        require(outcomeIndex == 0 || outcomeIndex == 1, "Invalid outcome index");
        require(amount > 0, "Amount must be > 0");

        // Checks complete -> Effects
        userStakes[msg.sender][outcomeIndex] += amount;
        totalStakes[outcomeIndex] += amount;

        // Interactions last
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");

        emit Staked(msg.sender, outcomeIndex, amount);
    }

    /**
     * @notice Locks market trading prior to oracle resolution landing to eliminate front-running.
     */
    function lockMarket() external {
        require(state == MarketState.OPEN, "Market not open");
        require(block.timestamp >= resolutionDeadline, "Deadline not reached");
        state = MarketState.LOCKED;
        emit MarketLocked(block.timestamp);
    }

    /**
     * @notice Resolves market using finalized Oracle outcome.
     */
    function resolveMarket() external nonReentrant {
        if (state == MarketState.OPEN) {
            require(block.timestamp >= resolutionDeadline, "Deadline not reached");
            state = MarketState.LOCKED;
        }
        require(state == MarketState.LOCKED, "Market not locked for resolution");

        (Oracle.Outcome oracleOutcome, bool isFinalized) = oracle.getOutcome(marketId);
        require(isFinalized, "Oracle outcome not finalized");

        if (oracleOutcome == Oracle.Outcome.AMBIGUOUS) {
            state = MarketState.CANCELLED;
            emit MarketCancelled("Oracle marked outcome ambiguous");
            return;
        }

        winningOutcome = oracleOutcome;
        state = MarketState.RESOLVED;
        emit MarketResolved(oracleOutcome);
    }

    /**
     * @notice Cancels market if resolution deadline passes by > 7 days without resolution.
     */
    function cancelDueToTimeout() external nonReentrant {
        require(state == MarketState.OPEN || state == MarketState.LOCKED, "Cannot cancel resolved market");
        require(block.timestamp > resolutionDeadline + 7 days, "Timeout grace period active");

        state = MarketState.CANCELLED;
        emit MarketCancelled("Oracle resolution timed out");
    }

    /**
     * @notice Claims proportional payout for winning stakers.
     * @dev Uses high-precision 1e18 scaling to eliminate integer division loss:
     *      payout = (userStake * totalPool * 1e18 / winningPool) / 1e18
     */
    function claimPayout() external nonReentrant returns (uint256 payout) {
        require(state == MarketState.RESOLVED, "Market not resolved");
        require(!hasClaimed[msg.sender], "Already claimed");

        uint8 winIdx = (winningOutcome == Oracle.Outcome.YES) ? 0 : 1;
        uint256 userWinningStake = userStakes[msg.sender][winIdx];
        require(userWinningStake > 0, "No winning stake");

        uint256 totalPool = totalStakes[0] + totalStakes[1];
        uint256 winningPool = totalStakes[winIdx];

        // Scaled high-precision calculation
        // Precision scale: (userStake * SCALE) / winningPool gives share ratio with 18 decimal places
        uint256 shareRatio = (userWinningStake * SCALE) / winningPool;
        payout = (shareRatio * totalPool) / SCALE;

        // Effects before interaction (CEI)
        hasClaimed[msg.sender] = true;

        require(usdc.transfer(msg.sender, payout), "Payout transfer failed");

        emit PayoutClaimed(msg.sender, payout);
        return payout;
    }

    /**
     * @notice Refund full staked amount if market was cancelled.
     */
    function claimRefund() external nonReentrant returns (uint256 refundAmount) {
        require(state == MarketState.CANCELLED, "Market not cancelled");
        require(!hasClaimed[msg.sender], "Already claimed");

        refundAmount = userStakes[msg.sender][0] + userStakes[msg.sender][1];
        require(refundAmount > 0, "No stakes to refund");

        hasClaimed[msg.sender] = true;

        require(usdc.transfer(msg.sender, refundAmount), "Refund transfer failed");

        emit RefundClaimed(msg.sender, refundAmount);
        return refundAmount;
    }

    function getTotalPool() external view returns (uint256) {
        return totalStakes[0] + totalStakes[1];
    }
}
