/**
 * 4) BNB Chain Auto-Burn + BEP-95 Real-Time Burn Engine
 *
 * Protocol rules:
 *   (A) Quarterly Auto-Burn formula:
 *         B = N * (1000 / (P + K))
 *       where:
 *         N = total blocks produced during the quarter
 *         P = average BNB price in USD during the quarter
 *         K = constant price anchor (historically 1000, governance-adjustable)
 *       Stops automatically once circulating/total supply reaches the 100,000,000 BNB floor.
 *   (B) BEP-95 Real-Time Gas Burn:
 *       Fixed governance ratio (default 10% = 1000 bps) of collected gas fees per block
 *       is sent directly to the dead burn sink (0x000000000000000000000000000000000000dEaD).
 */

import { formatUnitsExact } from "./ethereum-eip1559.mjs";

export const BNB_BURN_DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
export const BNB_SUPPLY_FLOOR = 100_000_000; // 100M BNB target floor
export const BEP95_DEFAULT_BURN_RATIO_BPS = 1000n; // 10% real-time gas burn

/**
 * Compute quarterly BNB Auto-Burn amount using exact integer fixed-point math (1e8 BNB precision).
 * Formula: B = N * 1000 / (P + K), capped so supply never drops below 100,000,000 BNB.
 */
export function calculateBnbAutoBurn({
  blocksProducedN,
  avgPriceUsdP,
  priceAnchorK = 1000,
  currentSupplyBnb = 144_000_000,
  supplyFloorBnb = BNB_SUPPLY_FLOOR,
}) {
  if (blocksProducedN <= 0) throw new RangeError("blocksProducedN must be positive");
  if (avgPriceUsdP <= 0) throw new RangeError("avgPriceUsdP must be positive");
  if (priceAnchorK < 0) throw new RangeError("priceAnchorK must be non-negative");

  // Use scaled integer arithmetic (micro-USD scale = 1e6, BNB scale = 1e8)
  const SCALE_USD = 1_000_000n;
  const SCALE_BNB = 100_000_000n;

  const nBig = BigInt(Math.round(blocksProducedN));
  const pScaled = BigInt(Math.round(avgPriceUsdP * 1_000_000));
  const kScaled = BigInt(Math.round(priceAnchorK * 1_000_000));
  const denom = pScaled + kScaled;

  // B = N * 1000 / (P + K) in 1e8 BNB units
  const rawBurnScaled = (nBig * 1000n * SCALE_USD * SCALE_BNB) / denom;
  const currentScaled = BigInt(Math.round(currentSupplyBnb * 1e8));
  const floorScaled = BigInt(Math.round(supplyFloorBnb * 1e8));

  const maxBurnableScaled = currentScaled > floorScaled ? currentScaled - floorScaled : 0n;
  const actualBurnScaled = rawBurnScaled < maxBurnableScaled ? rawBurnScaled : maxBurnableScaled;
  const postBurnSupplyScaled = currentScaled - actualBurnScaled;
  const floorReached = postBurnSupplyScaled <= floorScaled;

  return {
    formula: "B = N * 1000 / (P + K)",
    inputs: { blocksProducedN, avgPriceUsdP, priceAnchorK, currentSupplyBnb, supplyFloorBnb },
    rawFormulaBurnBnb: formatUnitsExact(rawBurnScaled, 8, 4),
    actualBurnBnb: formatUnitsExact(actualBurnScaled, 8, 4),
    postBurnSupplyBnb: formatUnitsExact(postBurnSupplyScaled, 8, 4),
    floorReached,
    estimatedUsdValue: Number(((Number(actualBurnScaled) / 1e8) * avgPriceUsdP).toFixed(2)),
  };
}

/**
 * Compute BEP-95 real-time gas fee burn for a BSC block or transaction.
 */
export function calculateBep95GasBurn({
  gasUsed,
  gasPriceWei,
  burnRatioBps = BEP95_DEFAULT_BURN_RATIO_BPS,
}) {
  const gas = BigInt(gasUsed);
  const price = BigInt(gasPriceWei);
  const bps = BigInt(burnRatioBps);
  if (bps < 0n || bps > 10000n) throw new RangeError("burnRatioBps must be between 0 and 10000");

  const totalGasFeeWei = gas * price;
  const burnedWei = (totalGasFeeWei * bps) / 10000n;
  const validatorShareWei = totalGasFeeWei - burnedWei;

  return {
    totalGasFeeWei,
    burnedWei,
    validatorShareWei,
    burnRatioPercent: Number(bps) / 100,
    burnedBnb: formatUnitsExact(burnedWei, 18, 9),
    validatorShareBnb: formatUnitsExact(validatorShareWei, 18, 9),
  };
}

/**
 * Simulate multi-quarter BNB Auto-Burn trajectory toward the 100M BNB floor.
 */
export function simulateBnbQuarterlySchedule({
  startSupplyBnb = 142_000_000,
  quarters = 8,
  blocksPerQuarter = 2_592_000, // 3s reference cadence (or adjusted with K)
  quarterlyPricesUsd = [550, 600, 620, 580, 650, 700, 720, 680],
  priceAnchorK = 1000,
} = {}) {
  let supply = startSupplyBnb;
  const schedule = [];
  let cumulativeBurn = 0;

  for (let q = 0; q < quarters; q++) {
    const price = quarterlyPricesUsd[q % quarterlyPricesUsd.length];
    const res = calculateBnbAutoBurn({
      blocksProducedN: blocksPerQuarter,
      avgPriceUsdP: price,
      priceAnchorK,
      currentSupplyBnb: supply,
    });
    const burnedNum = Number(res.actualBurnBnb);
    supply = Number(res.postBurnSupplyBnb);
    cumulativeBurn += burnedNum;

    schedule.push({
      quarter: `Q+${q + 1}`,
      avgPriceUsd: price,
      burnedBnb: res.actualBurnBnb,
      remainingSupplyBnb: res.postBurnSupplyBnb,
      estimatedUsdValue: res.estimatedUsdValue,
      floorReached: res.floorReached,
    });
  }

  return {
    protocol: "BNB Chain (Auto-Burn + BEP-95)",
    startSupplyBnb,
    endSupplyBnb: Number(supply.toFixed(4)),
    cumulativeAutoBurnBnb: Number(cumulativeBurn.toFixed(4)),
    supplyFloorBnb: BNB_SUPPLY_FLOOR,
    schedule,
  };
}
