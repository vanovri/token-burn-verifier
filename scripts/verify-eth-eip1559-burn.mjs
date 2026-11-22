#!/usr/bin/env node
/**
 * CLI Script 1 (From Article): Ethereum EIP-1559 Base-Fee Burn Verifier
 *
 * Usage:
 *   npm run verify:eth
 *   TX_HASH=0x... RPC_URL=https://ethereum-rpc.publicnode.com node scripts/verify-eth-eip1559-burn.mjs
 *   node scripts/verify-eth-eip1559-burn.mjs --json
 */

import { verifyEthereumEip1559Burn } from "../src/verifiers/eth-eip1559-verifier.mjs";
import { DEFAULT_RPCS } from "../src/verifiers/rpc-utils.mjs";

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const txHash = process.env.TX_HASH || undefined;
const rpcUrls = process.env.RPC_URL ? [process.env.RPC_URL] : DEFAULT_RPCS.ethereum;

const result = await verifyEthereumEip1559Burn({ txHash, rpcUrls });

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("=== Ethereum EIP-1559 Live Burn Proof ===");
  console.log(`RPC Endpoint      : ${result.rpcUrl}`);
  console.log(`Block Number      : #${result.blockNumber} (${result.blockTimestampIso})`);
  console.log(`Transaction Hash  : ${result.txHash} (type ${result.txType})`);
  console.log(`Gas Used          : ${result.gasUsed}`);
  console.log(`Base Fee          : ${result.baseFeeGwei} gwei`);
  console.log(`Effective Gas     : ${result.effectiveGasPriceGwei} gwei`);
  console.log(`TX Burned (Base)  : ${result.txBurnedEth} ETH (${result.txBurnSharePercent}% of tx fee)`);
  console.log(`TX Priority Tip   : ${result.txPriorityTipEth} ETH (to validator/builder)`);
  console.log(`Block Utilization : ${result.blockUtilizationPercent}% (${result.blockGasUsed} / ${result.blockGasLimit})`);
  console.log(`Block Total Burn  : ${result.blockTotalBurnedEth} ETH`);
  console.log(`Sanity Check      : ${result.sanityCheck.whereDidTokensGo}`);
}
