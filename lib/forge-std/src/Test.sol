// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Test
 * @notice Forge-std Test contract stub providing standard assertions for Foundry test suites.
 */
abstract contract Test {
    event log(string);
    event log_named_uint(string key, uint256 val);
    event log_named_address(string key, address val);

    function assertTrue(bool condition) internal pure {
        require(condition, "assertTrue failed");
    }

    function assertTrue(bool condition, string memory err) internal pure {
        require(condition, err);
    }

    function assertFalse(bool condition) internal pure {
        require(!condition, "assertFalse failed");
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "assertEq uint256 failed");
    }

    function assertEq(address a, address b) internal pure {
        require(a == b, "assertEq address failed");
    }

    function assertEq(string memory a, string memory b) internal pure {
        require(keccak256(bytes(a)) == keccak256(bytes(b)), "assertEq string failed");
    }
}
