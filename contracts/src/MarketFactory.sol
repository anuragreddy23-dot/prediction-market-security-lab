// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockUSDC.sol";
import "./Oracle.sol";
import "./PredictionMarket.sol";

/**
 * @title MarketFactory
 * @notice Factory smart contract to create, track, and manage prediction markets.
 */
contract MarketFactory {
    MockUSDC public immutable usdc;
    Oracle public immutable oracle;

    address[] public deployedMarkets;
    mapping(uint256 => address) public getMarketById;
    uint256 public marketCount;

    event MarketCreated(
        uint256 indexed marketId,
        address indexed marketAddress,
        string question,
        uint256 resolutionDeadline
    );

    constructor(address _usdc, address _oracle) {
        usdc = MockUSDC(_usdc);
        oracle = Oracle(_oracle);
    }

    /**
     * @notice Deploy a new isolated PredictionMarket contract.
     */
    function createMarket(string memory question, uint256 duration) external returns (address marketAddress) {
        marketCount++;
        uint256 marketId = marketCount;

        PredictionMarket market = new PredictionMarket(
            address(usdc),
            address(oracle),
            marketId,
            question,
            duration
        );

        marketAddress = address(market);
        deployedMarkets.push(marketAddress);
        getMarketById[marketId] = marketAddress;

        emit MarketCreated(marketId, marketAddress, question, block.timestamp + duration);
        return marketAddress;
    }

    function getAllMarkets() external view returns (address[] memory) {
        return deployedMarkets;
    }
}
