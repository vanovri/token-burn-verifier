// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title BurnToMintDataCredits
 * @notice Helium-inspired Burn-to-Mint Equilibrium (BME) contract.
 *
 * Mechanics:
 *   - Users permanently burn commodity utility tokens (`HNT` equivalent, 8 decimals)
 *     at the current oracle USD price (`priceMicroUsd`, 6 decimals).
 *   - Contract mints NON-TRANSFERABLE Data Credits (DC) pegged at $0.00001 / DC (100,000 DC = $1).
 *   - DCs cannot be transferred or speculated on; they can ONLY be spent on real network actions.
 */
contract BurnToMintDataCredits {
    string public constant tokenSymbol = "bHNT";
    uint8 public constant tokenDecimals = 8;

    uint256 public totalTokenSupply;
    uint256 public totalTokenBurned;
    uint256 public totalDcMinted;
    uint256 public totalDcSpent;

    address public oracleAdmin;
    uint256 public oraclePriceMicroUsd; // e.g., 5_500_000 = $5.50 USD

    mapping(address => uint256) public tokenBalanceOf;
    mapping(address => uint256) public dataCreditsOf; // Soulbound / non-transferable

    event TokenBurnedForCredits(
        address indexed user,
        uint256 tokenBurnedAtomic,
        uint256 oraclePriceMicroUsd,
        uint256 dcMinted,
        uint256 newTokenSupply
    );
    event DataCreditsSpent(address indexed user, uint256 dcSpent, bytes32 indexed actionType);
    event OraclePriceUpdated(uint256 oldPriceMicroUsd, uint256 newPriceMicroUsd);

    error Unauthorized();
    error ZeroAmount();
    error InvalidPrice();
    error InsufficientTokens();
    error InsufficientDataCredits();
    error NonTransferableCredits();

    constructor(uint256 initialSupplyAtomic, uint256 initialPriceMicroUsd) {
        if (initialPriceMicroUsd == 0) revert InvalidPrice();
        oracleAdmin = msg.sender;
        oraclePriceMicroUsd = initialPriceMicroUsd;
        totalTokenSupply = initialSupplyAtomic;
        tokenBalanceOf[msg.sender] = initialSupplyAtomic;
    }

    function updateOraclePrice(uint256 newPriceMicroUsd) external {
        if (msg.sender != oracleAdmin) revert Unauthorized();
        if (newPriceMicroUsd == 0) revert InvalidPrice();
        uint256 oldPrice = oraclePriceMicroUsd;
        oraclePriceMicroUsd = newPriceMicroUsd;
        emit OraclePriceUpdated(oldPrice, newPriceMicroUsd);
    }

    /**
     * @notice Permanently burn commodity tokens to mint non-transferable Data Credits.
     *         DC = (tokenAtomic * oraclePriceMicroUsd) / 1e9
     *         (since 1 token = 1e8 atomic, 1 USD = 1e6 microUsd, 1 USD = 1e5 DC -> 1e8*1e6/1e5 = 1e9).
     */
    function burnForCredits(uint256 tokenAtomicAmount) external returns (uint256 dcMinted) {
        if (tokenAtomicAmount == 0) revert ZeroAmount();
        uint256 bal = tokenBalanceOf[msg.sender];
        if (bal < tokenAtomicAmount) revert InsufficientTokens();

        dcMinted = (tokenAtomicAmount * oraclePriceMicroUsd) / 1_000_000_000;
        if (dcMinted == 0) revert ZeroAmount();

        unchecked {
            tokenBalanceOf[msg.sender] = bal - tokenAtomicAmount;
            totalTokenSupply -= tokenAtomicAmount;
            totalTokenBurned += tokenAtomicAmount;
            dataCreditsOf[msg.sender] += dcMinted;
            totalDcMinted += dcMinted;
        }

        emit TokenBurnedForCredits(
            msg.sender,
            tokenAtomicAmount,
            oraclePriceMicroUsd,
            dcMinted,
            totalTokenSupply
        );
    }

    /**
     * @notice Spend non-transferable Data Credits to consume real network utility (e.g., LoRa packet transfer).
     */
    function spendCredits(uint256 dcAmount, bytes32 actionType) external {
        if (dcAmount == 0) revert ZeroAmount();
        uint256 dcBal = dataCreditsOf[msg.sender];
        if (dcBal < dcAmount) revert InsufficientDataCredits();

        unchecked {
            dataCreditsOf[msg.sender] = dcBal - dcAmount;
            totalDcSpent += dcAmount;
        }

        emit DataCreditsSpent(msg.sender, dcAmount, actionType);
    }

    /**
     * @notice Explicitly reverts any attempt to transfer Data Credits (enforces utility-only design).
     */
    function transferDataCredits(address, uint256) external pure {
        revert NonTransferableCredits();
    }
}
