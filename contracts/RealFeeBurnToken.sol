// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title RealFeeBurnToken
 * @notice Protocol-level usage-linked burn reference (inspired by ETH EIP-1559 / AVAX / XRPL).
 *
 * Credibility properties:
 *   1. Rule-based: fixed immutable feeBurnBps applied automatically on every transfer.
 *   2. Auditable: emits ERC-20 Transfer(from, address(0), fee) + FeeBurned event.
 *   3. Usage-linked: more transfer volume -> proportionally more burn.
 *   4. Clear tradeoff: transaction sender pays the fee; zero mint() exists after construction.
 *   5. True supply reduction: `totalSupply` strictly decreases on every burn.
 */
contract RealFeeBurnToken {
    string public constant name = "Real Fee Burn Token";
    string public constant symbol = "RFBT";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    uint256 public totalBurned;
    uint16 public immutable feeBurnBps; // e.g., 50 = 0.50% burned per transfer

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event FeeBurned(address indexed payer, uint256 burnedAmount, uint256 newTotalSupply);

    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidAddress();
    error FeeTooHigh();

    constructor(uint256 initialSupply, uint16 _feeBurnBps) {
        if (_feeBurnBps > 500) revert FeeTooHigh(); // Hard cap 5.00%
        feeBurnBps = _feeBurnBps;
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transferWithBurn(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < value) revert InsufficientAllowance();
        if (allowed != type(uint256).max) {
            unchecked {
                allowance[from][msg.sender] = allowed - value;
            }
        }
        _transferWithBurn(from, to, value);
        return true;
    }

    function _transferWithBurn(address from, address to, uint256 value) internal {
        if (to == address(0)) revert InvalidAddress();
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();

        uint256 burnAmount = (value * feeBurnBps) / 10_000;
        uint256 netTransfer = value - burnAmount;

        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to] += netTransfer;
        }

        emit Transfer(from, to, netTransfer);

        if (burnAmount > 0) {
            unchecked {
                totalSupply -= burnAmount;
                totalBurned += burnAmount;
            }
            // Canonical ERC-20 protocol-level burn event: Transfer to address(0)
            emit Transfer(from, address(0), burnAmount);
            emit FeeBurned(from, burnAmount, totalSupply);
        }
    }
}
