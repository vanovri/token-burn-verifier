/**
 * Live Generic ERC-20 Burn Scanner (Ethers.js v6)
 *
 * Implements the article's Transfer -> DEAD scanner AND solves the article's caveat:
 *   "This doesn't prove 'supply reduced' in every tokenomics model, but it does verify
 *    that tokens moved into a sink address."
 *
 * Upgrades:
 *   1. Scans BOTH Transfer(*, 0x000...dEaD) [sink transfer] AND Transfer(*, 0x000...0000) [true _burn].
 *   2. Calls on-chain totalSupply(), balanceOf(DEAD), balanceOf(ZERO), symbol(), decimals().
 *   3. Classifies burn provenance accurately:
 *        - PROTOCOL_TOTAL_SUPPLY_REDUCTION (Transfer -> ZERO reduces totalSupply())
 *        - IRRECOVERABLE_DEAD_SINK_ONLY (Transfer -> dEaD locks tokens without decreasing totalSupply())
 *        - HYBRID_BURN_AND_SINK
 *        - NO_BURN_ACTIVITY_IN_WINDOW
 */

import { ethers } from "ethers";
import { BURN_ADDRESSES, DEFAULT_RPCS, queryFilterChunked, withEvmProvider } from "./rpc-utils.mjs";

export const ERC20_BURN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

export const REFERENCE_ERC20_TOKENS = Object.freeze({
  SHIB: {
    label: "Shiba Inu (DEAD Sink Model)",
    address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
    extraSinkAddresses: ["0xdEAD000000000000000042069420694206942069"],
  },
  USDC: {
    label: "USD Coin (True _burn -> 0x0000 Model)",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    extraSinkAddresses: [],
  },
});

export async function verifyErc20Burn({
  tokenAddress,
  blockWindow = 5000,
  chunkSize = 2000,
  extraSinkAddresses = [],
  rpcUrls = DEFAULT_RPCS.ethereum,
} = {}) {
  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    throw new Error(`Invalid ERC-20 token address: ${tokenAddress}`);
  }

  const { result, rpcUrl } = await withEvmProvider(rpcUrls, async (provider) => {
    const token = new ethers.Contract(tokenAddress, ERC20_BURN_ABI, provider);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - blockWindow + 1);

    const [symbol, name, decimalsRaw, totalSupply, deadBalance, zeroBalance, ...extraBalances] =
      await Promise.all([
        token.symbol().catch(() => "UNKNOWN"),
        token.name().catch(() => "Unknown Token"),
        token.decimals().catch(() => 18n),
        token.totalSupply(),
        token.balanceOf(BURN_ADDRESSES.DEAD),
        token.balanceOf(BURN_ADDRESSES.ZERO),
        ...extraSinkAddresses.map((addr) => token.balanceOf(addr)),
      ]);

    const decimals = Number(decimalsRaw);
    const extraSinksTotal = extraBalances.reduce((acc, v) => acc + v, 0n);
    const combinedSinkBalance = deadBalance + extraSinksTotal;

    const deadFilter = token.filters.Transfer(null, BURN_ADDRESSES.DEAD);
    const zeroFilter = token.filters.Transfer(null, BURN_ADDRESSES.ZERO);
    const mintFilter = token.filters.Transfer(BURN_ADDRESSES.ZERO, null);

    const [deadLogs, zeroLogs, mintLogs] = await Promise.all([
      queryFilterChunked(token, deadFilter, fromBlock, latestBlock, chunkSize),
      queryFilterChunked(token, zeroFilter, fromBlock, latestBlock, chunkSize),
      queryFilterChunked(token, mintFilter, fromBlock, latestBlock, chunkSize),
    ]);

    let burnedToDead = 0n;
    for (const log of deadLogs) burnedToDead += log.args.value;

    let burnedToZero = 0n;
    for (const log of zeroLogs) burnedToZero += log.args.value;

    let mintedFromZero = 0n;
    for (const log of mintLogs) mintedFromZero += log.args.value;

    const totalBurnInWindow = burnedToDead + burnedToZero;
    const netSupplyChangeInWindow = mintedFromZero - burnedToZero;
    const deadSinkSharePct =
      totalSupply > 0n
        ? Number((deadBalance * 100_000_000n) / totalSupply) / 1_000_000
        : 0;
    const combinedSinkSharePct =
      totalSupply > 0n
        ? Number((combinedSinkBalance * 100_000_000n) / totalSupply) / 1_000_000
        : 0;

    let classification = "NO_BURN_ACTIVITY_IN_WINDOW";
    if (burnedToZero > 0n && burnedToDead > 0n) {
      classification = "HYBRID_BURN_AND_SINK";
    } else if (burnedToZero > 0n) {
      classification = "PROTOCOL_TOTAL_SUPPLY_REDUCTION";
    } else if (burnedToDead > 0n || combinedSinkBalance > 0n) {
      classification = "IRRECOVERABLE_DEAD_SINK_ONLY";
    }

    const washBurnWarning = mintedFromZero > totalBurnInWindow && totalBurnInWindow > 0n;

    return {
      chain: "Ethereum Mainnet",
      tokenAddress: ethers.getAddress(tokenAddress),
      symbol,
      name,
      decimals,
      blockRange: { fromBlock, toBlock: latestBlock, blocksScanned: latestBlock - fromBlock + 1 },
      onChainSupplyState: {
        totalSupplyRaw: totalSupply.toString(),
        totalSupplyFormatted: ethers.formatUnits(totalSupply, decimals),
        deadAddressBalanceFormatted: ethers.formatUnits(deadBalance, decimals),
        extraBurnSinksBalanceFormatted: ethers.formatUnits(extraSinksTotal, decimals),
        combinedBurnSinksBalanceFormatted: ethers.formatUnits(combinedSinkBalance, decimals),
        zeroAddressBalanceFormatted: ethers.formatUnits(zeroBalance, decimals),
        deadSinkPercentOfTotalSupply: Number(deadSinkSharePct.toFixed(6)),
        combinedBurnSinksPercentOfTotalSupply: Number(combinedSinkSharePct.toFixed(4)),
      },
      windowActivity: {
        transfersToDeadCount: deadLogs.length,
        burnedToDeadFormatted: ethers.formatUnits(burnedToDead, decimals),
        transfersToZeroCount: zeroLogs.length,
        burnedToZeroFormatted: ethers.formatUnits(burnedToZero, decimals),
        mintsFromZeroCount: mintLogs.length,
        mintedFromZeroFormatted: ethers.formatUnits(mintedFromZero, decimals),
        netProtocolSupplyDeltaFormatted: ethers.formatUnits(netSupplyChangeInWindow, decimals),
      },
      classification,
      washBurnWarning,
      sanityCheck: {
        q1_whereDidTokensGo:
          burnedToZero > 0n
            ? "0x0000...0000 (ERC-20 _burn decreases totalSupply)"
            : combinedSinkBalance > 0n
              ? "0x0000...dEaD / burn sinks (irrecoverable addresses; totalSupply unchanged)"
              : "None detected in scanned window",
        q2_totalSupplyActuallyDecreased: burnedToZero > 0n,
        q2_circulatingReducedViaDeadSink: burnedToDead > 0n || combinedSinkBalance > 0n,
      },
    };
  });

  return { ...result, rpcUrl, verifiedAtIso: new Date().toISOString() };
}
