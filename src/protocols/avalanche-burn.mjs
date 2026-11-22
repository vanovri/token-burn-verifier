/**
 * 2) Avalanche (AVAX) C-Chain Fee Burn Engine
 *
 * Protocol rule:
 *   100% of transaction fees (base fee + priority tip) paid in AVAX are burned permanently.
 *   Validators receive staking rewards from protocol issuance — NEVER transaction fees.
 *   Zero discretionary treasury slush fund.
 */

import { formatUnitsExact } from "./ethereum-eip1559.mjs";

export const AVAX_C_CHAIN_BLACKHOLE = "0x0100000000000000000000000000000000000000";
export const NAVAX_PER_AVAX = 10n ** 9n;
export const WEI_PER_AVAX = 10n ** 18n;

/**
 * Calculate exact Avalanche C-Chain transaction burn.
 * Unlike Ethereum EIP-1559 (where tips go to validators), Avalanche burns 100% of fees.
 */
export function calculateAvaxTxBurn({ gasUsed, effectiveGasPrice, baseFeePerGas }) {
  const gas = BigInt(gasUsed);
  const effPrice = BigInt(effectiveGasPrice ?? baseFeePerGas ?? 0n);
  const baseFee = baseFeePerGas !== undefined ? BigInt(baseFeePerGas) : effPrice;

  if (gas < 0n || effPrice < 0n || baseFee < 0n) {
    throw new RangeError("gasUsed and gas prices must be non-negative");
  }

  const totalBurnedWei = gas * effPrice;
  const basePortionWei = gas * (baseFee <= effPrice ? baseFee : effPrice);
  const tipPortionAlsoBurnedWei = totalBurnedWei - basePortionWei;

  return {
    gasUsed: gas,
    effectiveGasPriceWei: effPrice,
    totalBurnedWei,
    basePortionWei,
    tipPortionAlsoBurnedWei,
    validatorFeePayoutWei: 0n,
    burnSharePercent: 100.0,
    burnedAvax: formatUnitsExact(totalBurnedWei, 18, 9),
  };
}

/**
 * Simulate Avalanche's fee-tension spectrum ("too low -> modest burn; spike -> user friction").
 */
export function simulateAvaxFeeTension({
  dailyTxCount = 450_000,
  avgGasPerTx = 85_000n,
  avaxPriceUsd = 28.0,
  feeScenariosNAvax = [25, 50, 150, 500],
} = {}) {
  const txCount = BigInt(dailyTxCount);
  const avgGas = BigInt(avgGasPerTx);
  const totalDailyGas = txCount * avgGas;

  const scenarios = feeScenariosNAvax.map((feeNAvax) => {
    const gasPriceWei = BigInt(Math.round(feeNAvax * 1000)) * 10n ** 6n;
    const dailyBurnWei = totalDailyGas * gasPriceWei;
    const annualBurnWei = dailyBurnWei * 365n;
    const txFeeAvax = Number(avgGas * gasPriceWei) / 1e18;
    const txFeeUsd = txFeeAvax * avaxPriceUsd;

    let uxStatus = "BALANCED";
    if (feeNAvax <= 30) uxStatus = "LOW_FEE_MODEST_BURN";
    else if (txFeeUsd > 0.5) uxStatus = "HIGH_BURN_USER_FRICTION";

    return {
      gasPriceNAvax: feeNAvax,
      avgTxFeeAvax: Number(txFeeAvax.toFixed(7)),
      avgTxFeeUsd: Number(txFeeUsd.toFixed(4)),
      dailyBurnAvax: formatUnitsExact(dailyBurnWei, 18, 4),
      annualizedBurnAvax: formatUnitsExact(annualBurnWei, 18, 2),
      validatorFeeSharePercent: 0,
      uxStatus,
    };
  });

  return {
    protocol: "Avalanche (AVAX C-Chain)",
    dailyTxCount,
    avgGasPerTx: avgGas.toString(),
    avaxPriceUsd,
    scenarios,
  };
}
