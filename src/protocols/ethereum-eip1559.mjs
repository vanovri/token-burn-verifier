/**
 * 1) Ethereum EIP-1559 Fee Burn Engine
 *
 * Protocol rule:
 *   User pays gas -> baseFeePerGas * gasUsed is BURNED permanently.
 *   Priority tip  -> (effectiveGasPrice - baseFeePerGas) * gasUsed goes to validator/builder.
 *
 * Exact integer arithmetic using BigInt (wei) to prevent IEEE-754 floating-point drift.
 */

export const BASE_FEE_MAX_CHANGE_DENOMINATOR = 8n;
export const ELASTICITY_MULTIPLIER = 2n;
export const WEI_PER_ETH = 10n ** 18n;
export const WEI_PER_GWEI = 10n ** 9n;

/**
 * Format a BigInt wei value to fixed-precision decimal ETH string without float loss.
 * @param {bigint} wei
 * @param {number} decimals
 * @returns {string}
 */
export function formatUnitsExact(amount, unitDecimals = 18, displayDecimals = 6) {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(unitDecimals);
  const whole = abs / base;
  const frac = abs % base;
  if (displayDecimals <= 0) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }
  const padded = frac.toString().padStart(unitDecimals, "0");
  const sliced = padded.slice(0, displayDecimals).padEnd(displayDecimals, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${sliced}`;
}

/**
 * Calculate exact EIP-1559 transaction burn and priority tip split.
 * Matches article formula: burnedWei = receipt.gasUsed * block.baseFeePerGas.
 */
export function calculateEip1559TxBurn({ gasUsed, baseFeePerGas, effectiveGasPrice }) {
  const gas = BigInt(gasUsed);
  const baseFee = BigInt(baseFeePerGas);
  const effPrice = effectiveGasPrice !== undefined ? BigInt(effectiveGasPrice) : baseFee;

  if (gas < 0n || baseFee < 0n || effPrice < 0n) {
    throw new RangeError("gasUsed, baseFeePerGas, and effectiveGasPrice must be non-negative");
  }
  if (effPrice < baseFee) {
    throw new RangeError("effectiveGasPrice cannot be lower than block baseFeePerGas");
  }

  const burnedWei = gas * baseFee;
  const priorityFeePerGas = effPrice - baseFee;
  const priorityTipWei = gas * priorityFeePerGas;
  const totalFeeWei = burnedWei + priorityTipWei;
  const burnShareBps = totalFeeWei === 0n ? 0 : Number((burnedWei * 10000n) / totalFeeWei);

  return {
    gasUsed: gas,
    baseFeePerGas: baseFee,
    effectiveGasPrice: effPrice,
    priorityFeePerGas,
    burnedWei,
    priorityTipWei,
    totalFeeWei,
    burnSharePercent: Number((burnShareBps / 100).toFixed(2)),
    burnedEth: formatUnitsExact(burnedWei, 18, 9),
    priorityTipEth: formatUnitsExact(priorityTipWei, 18, 9),
    totalFeeEth: formatUnitsExact(totalFeeWei, 18, 9),
  };
}

/**
 * Compute next-block baseFeePerGas using the canonical Ethereum EIP-1559 specification.
 */
export function computeNextBaseFee({ parentBaseFeePerGas, parentGasUsed, parentGasLimit }) {
  const parentBaseFee = BigInt(parentBaseFeePerGas);
  const gasUsed = BigInt(parentGasUsed);
  const gasLimit = BigInt(parentGasLimit);

  if (gasLimit <= 0n) throw new RangeError("parentGasLimit must be positive");
  const gasTarget = gasLimit / ELASTICITY_MULTIPLIER;

  if (gasUsed === gasTarget) {
    return parentBaseFee;
  }

  if (gasUsed > gasTarget) {
    const gasUsedDelta = gasUsed - gasTarget;
    const baseFeeDelta =
      (parentBaseFee * gasUsedDelta) / gasTarget / BASE_FEE_MAX_CHANGE_DENOMINATOR;
    const increment = baseFeeDelta > 1n ? baseFeeDelta : 1n;
    return parentBaseFee + increment;
  }

  const gasUsedDelta = gasTarget - gasUsed;
  const baseFeeDelta =
    (parentBaseFee * gasUsedDelta) / gasTarget / BASE_FEE_MAX_CHANGE_DENOMINATOR;
  return parentBaseFee > baseFeeDelta ? parentBaseFee - baseFeeDelta : 0n;
}

/**
 * Simulate N consecutive Ethereum blocks to observe EIP-1559 thermostat dynamics.
 * @param {object} params
 * @param {bigint|number|string} params.initialBaseFeeGwei
 * @param {bigint|number} params.gasLimit
 * @param {number[]} params.blockUtilizations Array of block fill ratios (0.0 to 1.0)
 * @param {bigint} [params.issuancePerBlockWei] PoS staking issuance per slot (~0.028 ETH default)
 */
export function simulateEip1559Blocks({
  initialBaseFeeGwei = 15,
  gasLimit = 30_000_000n,
  blockUtilizations = [0.5, 0.85, 0.95, 1.0, 0.7, 0.3, 0.5],
  issuancePerBlockWei = 28_000_000_000_000_000n,
} = {}) {
  const limit = BigInt(gasLimit);
  let currentBaseFee = BigInt(Math.round(Number(initialBaseFeeGwei) * 1000)) * 10n ** 6n;
  let cumulativeBurnedWei = 0n;
  let cumulativeIssuedWei = 0n;
  const blocks = [];

  for (let i = 0; i < blockUtilizations.length; i++) {
    const util = Math.max(0, Math.min(1, blockUtilizations[i]));
    const gasUsed = (limit * BigInt(Math.round(util * 10000))) / 10000n;
    const burnedWei = gasUsed * currentBaseFee;
    const nextBaseFee = computeNextBaseFee({
      parentBaseFeePerGas: currentBaseFee,
      parentGasUsed: gasUsed,
      parentGasLimit: limit,
    });

    cumulativeBurnedWei += burnedWei;
    cumulativeIssuedWei += issuancePerBlockWei;

    blocks.push({
      blockOffset: i + 1,
      utilizationPercent: Number((util * 100).toFixed(1)),
      gasUsed: gasUsed.toString(),
      baseFeeGwei: formatUnitsExact(currentBaseFee, 9, 4),
      nextBaseFeeGwei: formatUnitsExact(nextBaseFee, 9, 4),
      burnedWei: burnedWei.toString(),
      burnedEth: formatUnitsExact(burnedWei, 18, 6),
      netSupplyDeltaWei: (issuancePerBlockWei - burnedWei).toString(),
      deflationary: burnedWei > issuancePerBlockWei,
    });

    currentBaseFee = nextBaseFee;
  }

  const netSupplyDeltaWei = cumulativeIssuedWei - cumulativeBurnedWei;
  return {
    protocol: "Ethereum (EIP-1559)",
    blocksSimulated: blocks.length,
    finalBaseFeeGwei: formatUnitsExact(currentBaseFee, 9, 4),
    cumulativeBurnedWei: cumulativeBurnedWei.toString(),
    cumulativeBurnedEth: formatUnitsExact(cumulativeBurnedWei, 18, 6),
    cumulativeIssuedEth: formatUnitsExact(cumulativeIssuedWei, 18, 6),
    netSupplyDeltaEth: formatUnitsExact(netSupplyDeltaWei, 18, 6),
    netDeflationary: cumulativeBurnedWei > cumulativeIssuedWei,
    blocks,
  };
}
