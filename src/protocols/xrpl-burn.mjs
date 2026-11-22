/**
 * 3) XRP Ledger (XRPL) Transaction Cost Destruction Engine
 *
 * Protocol rule:
 *   Every validated transaction deducts a small XRP fee (in drops, 1 XRP = 1,000,000 drops)
 *   which is permanently destroyed — NEVER paid to validators.
 *   Primary design objective: anti-spam & shared resource protection (slow, steady supply burn).
 */

import { formatUnitsExact } from "./ethereum-eip1559.mjs";

export const DROPS_PER_XRP = 1_000_000n;
export const XRPL_GENESIS_DROPS = 100_000_000_000n * DROPS_PER_XRP; // 100 Billion XRP
export const XRPL_MIN_BASE_FEE_DROPS = 10n;

/**
 * Derive exact cumulative protocol-level XRP burned from a validated ledger header's `total_coins`.
 */
export function calculateXrplCumulativeBurn(totalCoinsDrops) {
  const remaining = BigInt(totalCoinsDrops);
  if (remaining < 0n || remaining > XRPL_GENESIS_DROPS) {
    throw new RangeError("total_coins must lie between 0 and 100,000,000,000 XRP (in drops)");
  }
  const burnedDrops = XRPL_GENESIS_DROPS - remaining;
  const burnedPctTimes10000 = (burnedDrops * 1_000_000n) / XRPL_GENESIS_DROPS; // in 0.0001% units

  return {
    genesisDrops: XRPL_GENESIS_DROPS,
    remainingDrops: remaining,
    cumulativeBurnedDrops: burnedDrops,
    remainingXrp: formatUnitsExact(remaining, 6, 6),
    cumulativeBurnedXrp: formatUnitsExact(burnedDrops, 6, 6),
    percentSupplyDestroyed: Number((Number(burnedPctTimes10000) / 10000).toFixed(6)),
  };
}

/**
 * Sum transaction fees destroyed inside a single validated ledger.
 */
export function sumXrplLedgerDestroyedFees(transactions) {
  let totalDrops = 0n;
  let minFeeDrops = null;
  let maxFeeDrops = 0n;

  for (const tx of transactions) {
    const fee = BigInt(tx?.Fee ?? tx?.tx?.Fee ?? 0);
    totalDrops += fee;
    if (minFeeDrops === null || fee < minFeeDrops) minFeeDrops = fee;
    if (fee > maxFeeDrops) maxFeeDrops = fee;
  }

  return {
    txCount: transactions.length,
    totalBurnedDrops: totalDrops,
    totalBurnedXrp: formatUnitsExact(totalDrops, 6, 6),
    minFeeDrops: minFeeDrops ?? 0n,
    maxFeeDrops,
    validatorFeePayoutDrops: 0n,
  };
}

/**
 * Simulate XRPL quadratic fee escalation under spam attack (anti-spam resilience model).
 * Under XRPL fee escalation: open_ledger_fee scales quadratically when tx count exceeds expected ledger size.
 */
export function simulateXrplAntiSpamEscalation({
  baseFeeDrops = 10n,
  expectedLedgerTxCount = 50,
  txLoadLevels = [25, 50, 100, 250, 500, 1000],
} = {}) {
  const base = BigInt(baseFeeDrops);
  const expected = BigInt(expectedLedgerTxCount);
  const multiplierBase = 256n; // XRPL reference fee level unit

  const levels = txLoadLevels.map((txCountNum) => {
    const txCount = BigInt(txCountNum);
    let openLedgerFeeDrops = base;

    if (txCount > expected) {
      // Quadratic escalation factor: base * ((txCount / expected)^2) * escalation scaling
      const ratioScaled = (txCount * multiplierBase) / expected;
      openLedgerFeeDrops = (base * ratioScaled * ratioScaled) / (multiplierBase * multiplierBase);
      if (openLedgerFeeDrops < base) openLedgerFeeDrops = base;
    }

    const totalLedgerBurnDrops = openLedgerFeeDrops * txCount;
    const attackCost10kTxXrp = formatUnitsExact(openLedgerFeeDrops * 10_000n, 6, 4);

    return {
      txCountInLedger: txCountNum,
      loadRatio: Number((txCountNum / expectedLedgerTxCount).toFixed(2)),
      openLedgerFeeDrops: openLedgerFeeDrops.toString(),
      openLedgerFeeXrp: formatUnitsExact(openLedgerFeeDrops, 6, 6),
      ledgerBurnXrp: formatUnitsExact(totalLedgerBurnDrops, 6, 6),
      spamAttack10kTxCostXrp: attackCost10kTxXrp,
      status: txCountNum > expectedLedgerTxCount ? "ESCALATED_ANTI_SPAM" : "NORMAL_BASE_FEE",
    };
  });

  return {
    protocol: "XRP Ledger (XRPL)",
    baseFeeDrops: base.toString(),
    expectedLedgerTxCount,
    levels,
  };
}
