// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title TheaterBurnAntiPattern
 * @notice EDUCATIONAL ANTI-PATTERN — DO NOT DEPLOY IN PRODUCTION.
 *
 * Demonstrates the two classic "burn theater" traps warned about in
 * "5 Token Burns That Aren't Just a Show":
 *   Trap A (`relabelTreasuryAsBurned`): Emits a hype "MassiveBurnCeremony" event while
 *     only moving tokens to a team-controlled lock wallet. `totalSupply` never decreases!
 *   Trap B (`mintAndBurnWash`): Owner mints 2x tokens and sends 1x to 0x...dEaD to generate
 *     a real-looking Transfer->DEAD tx hash screenshot while net supply actually INCREASES!
 */
contract TheaterBurnAntiPattern {
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address public owner;
    address public teamControlledLock;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event MassiveBurnCeremony(string hypeTagline, uint256 advertisedAmount);

    constructor(uint256 initialSupply, address _teamControlledLock) {
        owner = msg.sender;
        teamControlledLock = _teamControlledLock;
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    /**
     * @notice TRAP A: Re-labeling treasury allocation without reducing totalSupply.
     */
    function relabelTreasuryAsBurned(uint256 amount, string calldata tagline) external {
        require(msg.sender == owner, "only owner");
        require(balanceOf[owner] >= amount, "insufficient");
        balanceOf[owner] -= amount;
        balanceOf[teamControlledLock] += amount;
        // totalSupply is UNCHANGED and team still controls `teamControlledLock`!
        emit Transfer(owner, teamControlledLock, amount);
        emit MassiveBurnCeremony(tagline, amount);
    }

    /**
     * @notice TRAP B: Mint-and-burn wash — produces a genuine Transfer->dEaD tx hash
     *         while inflating totalSupply by `burnAmount` net!
     */
    function mintAndBurnWash(uint256 burnAmount) external {
        require(msg.sender == owner, "only owner");
        uint256 mintAmount = burnAmount * 2;
        totalSupply += mintAmount;
        balanceOf[owner] += burnAmount;
        balanceOf[DEAD] += burnAmount;
        // Naive Transfer->DEAD scanners see `burnAmount` burned, missing the `2x` mint!
        emit Transfer(address(0), owner, mintAmount);
        emit Transfer(owner, DEAD, burnAmount);
        emit MassiveBurnCeremony("MASSIVE BURN COMPLETED!", burnAmount);
    }
}
