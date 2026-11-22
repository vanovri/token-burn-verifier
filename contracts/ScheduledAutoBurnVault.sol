// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title ScheduledAutoBurnVault
 * @notice BNB-inspired deterministic formula-driven quarterly Auto-Burn contract.
 *
 * On-chain formula:
 *   B = N * 1000 / (P + K)
 *   - N = blocks produced in quarter
 *   - P = average USD price (scaled 1e6)
 *   - K = constant price anchor (scaled 1e6, e.g. 1000 * 1e6)
 *   - Enforces immutable quarterly cadence (90 days) and hard SUPPLY_FLOOR (100,000,000 tokens).
 */
contract ScheduledAutoBurnVault {
    uint256 public constant QUARTER_INTERVAL = 90 days;
    uint256 public constant USD_SCALE = 1_000_000;
    uint256 public constant TOKEN_DECIMALS = 1e18;

    uint256 public immutable supplyFloor;
    uint256 public immutable priceAnchorScaled; // K * 1e6

    uint256 public totalSupply;
    uint256 public cumulativeBurned;
    uint256 public lastBurnTimestamp;
    uint256 public quarterCounter;

    event AutoBurnExecuted(
        uint256 indexed quarterNumber,
        uint256 blocksProducedN,
        uint256 avgPriceScaledP,
        uint256 burnedAmount,
        uint256 postBurnSupply
    );

    error QuarterNotElapsed(uint256 nextAllowedTimestamp);
    error InvalidParameters();
    error SupplyFloorReached();

    constructor(uint256 initialSupply, uint256 _supplyFloor, uint256 _priceAnchorUsd) {
        if (initialSupply <= _supplyFloor || _priceAnchorUsd == 0) revert InvalidParameters();
        totalSupply = initialSupply;
        supplyFloor = _supplyFloor;
        priceAnchorScaled = _priceAnchorUsd * USD_SCALE;
        lastBurnTimestamp = block.timestamp;
    }

    /**
     * @notice Preview exact quarterly burn without state mutation.
     */
    function previewQuarterlyBurn(
        uint256 blocksProducedN,
        uint256 avgPriceScaledP
    ) public view returns (uint256 actualBurn) {
        if (blocksProducedN == 0 || avgPriceScaledP == 0) revert InvalidParameters();
        if (totalSupply <= supplyFloor) return 0;

        // B (in whole tokens) = N * 1000 / (P + K)
        // With 18 decimals & USD_SCALE: (N * 1000 * USD_SCALE * 1e18) / (P_scaled + K_scaled)
        uint256 denom = avgPriceScaledP + priceAnchorScaled;
        uint256 rawBurn = (blocksProducedN * 1000 * USD_SCALE * TOKEN_DECIMALS) / denom;
        uint256 maxBurnable = totalSupply - supplyFloor;
        actualBurn = rawBurn < maxBurnable ? rawBurn : maxBurnable;
    }

    /**
     * @notice Execute deterministic quarterly Auto-Burn once 90 days have elapsed.
     */
    function executeQuarterlyAutoBurn(
        uint256 blocksProducedN,
        uint256 avgPriceScaledP
    ) external returns (uint256 burnedAmount) {
        uint256 nextAllowed = lastBurnTimestamp + QUARTER_INTERVAL;
        if (block.timestamp < nextAllowed) revert QuarterNotElapsed(nextAllowed);
        if (totalSupply <= supplyFloor) revert SupplyFloorReached();

        burnedAmount = previewQuarterlyBurn(blocksProducedN, avgPriceScaledP);

        unchecked {
            totalSupply -= burnedAmount;
            cumulativeBurned += burnedAmount;
            quarterCounter += 1;
        }
        lastBurnTimestamp = block.timestamp;

        emit AutoBurnExecuted(
            quarterCounter,
            blocksProducedN,
            avgPriceScaledP,
            burnedAmount,
            totalSupply
        );
    }
}
