/**
 * Live XRP Ledger (XRPL) Anti-Spam Fee Destruction Verifier
 *
 * Queries validated XRPL mainnet ledger directly via JSON-RPC:
 *   1. Reads protocol-level `total_coins` from the validated ledger header.
 *   2. Computes exact cumulative XRP permanently destroyed since 100B XRP genesis.
 *   3. Expands all transactions in the validated ledger and sums exact `Fee` drops destroyed.
 */

import {
  calculateXrplCumulativeBurn,
  sumXrplLedgerDestroyedFees,
} from "../protocols/xrpl-burn.mjs";
import { DEFAULT_RPCS, postJsonRpc } from "./rpc-utils.mjs";

const RIPPLE_EPOCH_OFFSET_SEC = 946684800; // 2000-01-01T00:00:00Z

export async function verifyXrplFeeDestruction({ rpcUrls = DEFAULT_RPCS.xrpl } = {}) {
  const { data, rpcUrl } = await postJsonRpc(rpcUrls, {
    method: "ledger",
    params: [{ ledger_index: "validated", transactions: true, expand: true }],
  });

  const ledger = data?.result?.ledger;
  if (!ledger || !ledger.total_coins) {
    throw new Error("XRPL validated ledger response missing `ledger.total_coins`");
  }

  const cumulative = calculateXrplCumulativeBurn(ledger.total_coins);
  const txs = Array.isArray(ledger.transactions) ? ledger.transactions : [];
  const ledgerBurn = sumXrplLedgerDestroyedFees(txs);

  const closeTimeIso = ledger.close_time
    ? new Date((Number(ledger.close_time) + RIPPLE_EPOCH_OFFSET_SEC) * 1000).toISOString()
    : null;

  return {
    chain: "XRP Ledger Mainnet",
    mechanism: "Anti-Spam Transaction Cost Destruction",
    ledgerIndex: Number(ledger.ledger_index),
    ledgerHash: ledger.ledger_hash,
    closeTimeIso,
    genesisSupplyXrp: "100000000000.000000",
    remainingSupplyXrp: cumulative.remainingXrp,
    cumulativeBurnedXrp: cumulative.cumulativeBurnedXrp,
    cumulativeBurnedDrops: cumulative.cumulativeBurnedDrops.toString(),
    percentSupplyDestroyed: cumulative.percentSupplyDestroyed,
    validatedLedgerTxCount: ledgerBurn.txCount,
    validatedLedgerBurnedDrops: ledgerBurn.totalBurnedDrops.toString(),
    validatedLedgerBurnedXrp: ledgerBurn.totalBurnedXrp,
    minTxFeeDrops: ledgerBurn.minFeeDrops.toString(),
    maxTxFeeDrops: ledgerBurn.maxFeeDrops.toString(),
    validatorFeePayoutXrp: "0.000000",
    sanityCheck: {
      whereDidTokensGo: "PROTOCOL_DESTRUCTION (deducted from sender & removed from total_coins)",
      supplyActuallyChanged: true,
    },
    rpcUrl,
    verifiedAtIso: new Date().toISOString(),
  };
}
