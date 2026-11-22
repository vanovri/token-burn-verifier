/**
 * Shared RPC provider utilities with automatic fallback endpoints and chunked log queries.
 */

import { ethers } from "ethers";

export const DEFAULT_RPCS = {
  ethereum: [
    process.env.ETH_RPC_URL || process.env.RPC_URL,
    "https://ethereum-rpc.publicnode.com",
    "https://eth.drpc.org",
    "https://1rpc.io/eth",
  ].filter(Boolean),
  avalanche: [
    process.env.AVAX_RPC_URL,
    "https://api.avax.network/ext/bc/C/rpc",
    "https://avalanche-c-chain-rpc.publicnode.com",
  ].filter(Boolean),
  bsc: [
    process.env.BSC_RPC_URL,
    "https://bsc-rpc.publicnode.com",
    "https://bsc-dataseed.binance.org",
    "https://1rpc.io/bnb",
  ].filter(Boolean),
  xrpl: [
    process.env.XRPL_RPC_URL,
    "https://xrplcluster.com",
    "https://s1.ripple.com:51234/",
    "https://s2.ripple.com:51234/",
  ].filter(Boolean),
  solana: [
    process.env.SOLANA_RPC_URL,
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
  ].filter(Boolean),
};

export const BURN_ADDRESSES = Object.freeze({
  DEAD: "0x000000000000000000000000000000000000dEaD",
  ZERO: "0x0000000000000000000000000000000000000000",
  AVAX_BLACKHOLE: "0x0100000000000000000000000000000000000000",
});

/**
 * Execute an async function against a list of EVM RPC URLs until one succeeds.
 */
export async function withEvmProvider(urls, fn) {
  const errors = [];
  for (const url of urls) {
    const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
    try {
      const result = await fn(provider, url);
      return { result, rpcUrl: url };
    } catch (err) {
      errors.push(`${url}: ${err?.shortMessage || err?.message || String(err)}`);
    } finally {
      provider.destroy();
    }
  }
  throw new Error(`All EVM RPC endpoints failed:\n${errors.join("\n")}`);
}

/**
 * Execute a raw JSON-RPC POST request with automatic endpoint fallback.
 */
export async function postJsonRpc(urls, payload, timeoutMs = 10_000) {
  const errors = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (data?.error) {
        throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      }
      return { data, rpcUrl: url };
    } catch (err) {
      errors.push(`${url}: ${err?.message || String(err)}`);
    }
  }
  throw new Error(`All JSON-RPC endpoints failed:\n${errors.join("\n")}`);
}

/**
 * Query contract event logs across a block window using safe chunk sizes so public RPCs
 * don't reject wide block ranges.
 */
export async function queryFilterChunked(contract, filter, fromBlock, toBlock, chunkSize = 2000) {
  const allLogs = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(toBlock, start + chunkSize - 1);
    const logs = await contract.queryFilter(filter, start, end);
    allLogs.push(...logs);
  }
  return allLogs;
}
