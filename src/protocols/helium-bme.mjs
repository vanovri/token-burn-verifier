/**
 * 5) Helium Burn-to-Mint Data Credits (BME) Engine
 *
 * Protocol rule:
 *   1 Data Credit (DC) is fixed at $0.00001 USD (100,000 DC = $1.00 USD).
 *   To acquire DCs, users permanently burn HNT at the current oracle USD price:
 *     DC_minted = floor(HNT_burned * P_HNT_USD * 100,000)
 *     HNT_needed = (DC_desired * 0.00001) / P_HNT_USD
 *   Data Credits are NON-TRANSFERABLE (soulbound utility credits) spent strictly on network actions:
 *     - LoRaWAN / IoT packet transfer: 1 DC per 24-byte packet
 *     - Hotspot onboarding: ~4,000,000 DC ($40 USD)
 *     - Location assertion: ~1,000,000 DC ($10 USD)
 */

import { formatUnitsExact } from "./ethereum-eip1559.mjs";

export const HNT_DECIMALS = 8;
export const HNT_ATOMIC_UNIT = 10n ** 8n; // 1 HNT = 1e8 bones
export const DC_PER_USD = 100_000n; // 1 DC = $0.00001
export const USD_PER_DC = 0.00001;
export const BYTES_PER_LORAWAN_DC = 24;
export const HELIUM_SOLANA_MINTS = {
  HNT: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
  DC: "dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm",
};

/**
 * Burn HNT (in atomic bones, 1e8 = 1 HNT) to mint non-transferable Data Credits at oracle price.
 * Uses exact BigInt fixed-point arithmetic (micro-USD = 1e6).
 */
export function burnHntToMintDc({ hntAmount, hntOraclePriceUsd }) {
  if (hntAmount <= 0 || hntOraclePriceUsd <= 0) {
    throw new RangeError("hntAmount and hntOraclePriceUsd must be positive");
  }

  const hntBones = BigInt(Math.round(hntAmount * 1e8));
  const priceMicroUsd = BigInt(Math.round(hntOraclePriceUsd * 1_000_000));

  // USD value (in micro-USD) = (hntBones * priceMicroUsd) / 1e8
  // DC minted = USD * 100,000 = (hntBones * priceMicroUsd * 100,000) / (1e8 * 1e6)
  //           = (hntBones * priceMicroUsd) / 1e9
  const dcMinted = (hntBones * priceMicroUsd) / 1_000_000_000n;
  const usdValue = Number(dcMinted) * USD_PER_DC;

  return {
    hntBurned: formatUnitsExact(hntBones, HNT_DECIMALS, 8),
    hntBurnedBones: hntBones,
    hntOraclePriceUsd,
    dcMinted,
    dcMintedString: dcMinted.toString(),
    dcUsdValue: Number(usdValue.toFixed(5)),
    transferable: false,
    utilityCapacity: {
      loraWan24BytePackets: dcMinted.toString(),
      maxPayloadMegabytes: Number(((Number(dcMinted) * BYTES_PER_LORAWAN_DC) / 1e6).toFixed(4)),
    },
  };
}

/**
 * Compute exact HNT that must be permanently burned to mint a target amount of Data Credits.
 */
export function hntRequiredToMintDc({ dcDesired, hntOraclePriceUsd }) {
  const dc = BigInt(dcDesired);
  if (dc <= 0n || hntOraclePriceUsd <= 0) {
    throw new RangeError("dcDesired and hntOraclePriceUsd must be positive");
  }

  const priceMicroUsd = BigInt(Math.round(hntOraclePriceUsd * 1_000_000));
  // Ceiling division so user always burns enough HNT to cover dcDesired
  const numerator = dc * 1_000_000_000n;
  const hntBonesRequired = (numerator + priceMicroUsd - 1n) / priceMicroUsd;

  return {
    dcDesired: dc,
    dcUsdCost: Number((Number(dc) * USD_PER_DC).toFixed(5)),
    hntOraclePriceUsd,
    hntBonesRequired,
    hntRequired: formatUnitsExact(hntBonesRequired, HNT_DECIMALS, 8),
  };
}

/**
 * Simulate Burn-to-Mint Equilibrium (BME): compare real network usage burn vs daily HNT emissions.
 */
export function simulateHeliumBme({
  dailyLoraPackets = 150_000_000,
  dailyMobileDataGb = 25_000, // ~50,000 DC/GB ($0.50/GB telecom offload)
  dailyHotspotOnboards = 120, // 4,000,000 DC ($40) each
  hntOraclePriceUsd = 5.5,
  dailyHntEmission = 20_548, // ~7.5M HNT/yr post-halving reference
} = {}) {
  const dcFromLora = BigInt(dailyLoraPackets);
  const dcFromMobile = BigInt(dailyMobileDataGb) * 50_000n;
  const dcFromOnboards = BigInt(dailyHotspotOnboards) * 4_000_000n;
  const totalDailyDc = dcFromLora + dcFromMobile + dcFromOnboards;

  const req = hntRequiredToMintDc({ dcDesired: totalDailyDc, hntOraclePriceUsd });
  const dailyBurnedHnt = Number(req.hntRequired);
  const netDailySupplyDelta = dailyHntEmission - dailyBurnedHnt;
  const burnToEmissionRatio = dailyBurnedHnt / dailyHntEmission;

  return {
    protocol: "Helium (Burn-to-Mint Data Credits)",
    hntOraclePriceUsd,
    dailyDcBreakdown: {
      loraPacketsDc: dcFromLora.toString(),
      mobileOffloadDc: dcFromMobile.toString(),
      hotspotOnboardsDc: dcFromOnboards.toString(),
      totalDailyDc: totalDailyDc.toString(),
      totalDailyUsdSpent: req.dcUsdCost,
    },
    dailyHntBurned: Number(dailyBurnedHnt.toFixed(4)),
    dailyHntEmission,
    netDailyHntDelta: Number(netDailySupplyDelta.toFixed(4)),
    burnToEmissionRatio: Number(burnToEmissionRatio.toFixed(4)),
    regime:
      netDailySupplyDelta < 0
        ? "NET_DEFLATIONARY_DEMAND_DRIVEN"
        : burnToEmissionRatio >= 0.5
          ? "APPROACHING_EQUILIBRIUM"
          : "UNDERUTILIZED_EMISSION_DOMINATED",
  };
}
