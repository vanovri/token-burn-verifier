#!/usr/bin/env node
/**
 * CLI Script 2 (From Article + Upgraded Supply Proof): Generic ERC-20 Burn Scanner
 *
 * Scans BOTH Transfer(*, 0x000...dEaD) [sink] AND Transfer(*, 0x000...0000) [true _burn],
 * plus Mint events Transfer(0x000...0000, *) to catch wash-burn inflation theater.
 *
 * Usage:
 *   npm run verify:erc20
 *   TOKEN_ADDRESS=0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE BLOCK_WINDOW=2000 node scripts/verify-erc20-burn.mjs
 *   node scripts/verify-erc20-burn.mjs --json
 */

import { REFERENCE_ERC20_TOKENS, verifyErc20Burn } from "../src/verifiers/erc20-burn-verifier.mjs";
import { DEFAULT_RPCS } from "../src/verifiers/rpc-utils.mjs";

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const blockWindow = Number(process.env.BLOCK_WINDOW || 1500);
const rpcUrls = process.env.RPC_URL ? [process.env.RPC_URL] : DEFAULT_RPCS.ethereum;

const targets = process.env.TOKEN_ADDRESS
  ? [{ label: "Custom Token", address: process.env.TOKEN_ADDRESS, extraSinkAddresses: [] }]
  : [REFERENCE_ERC20_TOKENS.SHIB, REFERENCE_ERC20_TOKENS.USDC];

const results = [];
for (const target of targets) {
  const res = await verifyErc20Burn({
    tokenAddress: target.address,
    blockWindow,
    chunkSize: 1000,
    extraSinkAddresses: target.extraSinkAddresses ?? [],
    rpcUrls,
  });
  results.push({ label: target.label, ...res });
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    console.log(`\n=== ERC-20 Burn Audit: ${r.symbol} (${r.label}) ===`);
    console.log(`Contract          : ${r.tokenAddress}`);
    console.log(`Block Window      : #${r.blockRange.fromBlock} -> #${r.blockRange.toBlock} (${r.blockRange.blocksScanned} blocks)`);
    console.log(`totalSupply()     : ${r.onChainSupplyState.totalSupplyFormatted} ${r.symbol}`);
    console.log(`balanceOf(dEaD)   : ${r.onChainSupplyState.deadAddressBalanceFormatted} ${r.symbol} (${r.onChainSupplyState.deadSinkPercentOfTotalSupply}% of totalSupply)`);
    console.log(`Combined Sinks    : ${r.onChainSupplyState.combinedBurnSinksBalanceFormatted} ${r.symbol} (${r.onChainSupplyState.combinedBurnSinksPercentOfTotalSupply}% of totalSupply)`);
    console.log(`Window -> dEaD    : ${r.windowActivity.burnedToDeadFormatted} ${r.symbol} (${r.windowActivity.transfersToDeadCount} txs)`);
    console.log(`Window -> 0x0000  : ${r.windowActivity.burnedToZeroFormatted} ${r.symbol} (${r.windowActivity.transfersToZeroCount} txs)`);
    console.log(`Window Mints      : ${r.windowActivity.mintedFromZeroFormatted} ${r.symbol} (${r.windowActivity.mintsFromZeroCount} txs)`);
    console.log(`Classification    : ${r.classification}`);
    console.log(`Wash-Burn Alert   : ${r.washBurnWarning ? "YES (Minted > Burned!)" : "NO"}`);
    console.log(`Q1 Destination    : ${r.sanityCheck.q1_whereDidTokensGo}`);
    console.log(`Q2 Supply Reduced : totalSupply=${r.sanityCheck.q2_totalSupplyActuallyDecreased} | deadSink=${r.sanityCheck.q2_circulatingReducedViaDeadSink}`);
  }
}
