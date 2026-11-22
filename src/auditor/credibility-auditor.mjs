/**
 * Token Burn Credibility Auditor ("Real Infrastructure vs Theater")
 *
 * Implements the exact framework from "5 Token Burns That Aren't Just a Show":
 *   1. Five Credibility Traits (a credible burn has >= 3 of 5 traits):
 *      - ruleBased: deterministic protocol/formula rule ("when X happens"), not discretionary
 *      - auditable: verifiable directly on-chain without trusting tweets or blog posts
 *      - usageLinked: more demand / utility -> more burn (or predictable cadence)
 *      - clearTradeoff: explicit economic payer (user fees, protocol surplus, or schedule)
 *      - noApplauseRequired: automated infrastructure, no countdown timer / PR hype needed
 *   2. Two-Question On-Chain Sanity Check:
 *      - Q1 (Destination): Where did the tokens go?
 *      - Q2 (Supply Reality): Did totalSupply / effective irrecoverable supply actually drop,
 *        or was circulating supply merely re-labeled / wash-minted?
 */

export const DESTINATIONS = Object.freeze({
  PROTOCOL_DESTRUCTION: "PROTOCOL_DESTRUCTION",
  NULL_ADDRESS_BURN: "NULL_ADDRESS_BURN",
  IRRECOVERABLE_SINK_DEAD: "IRRECOVERABLE_SINK_DEAD",
  TREASURY_OR_LOCK_CONTROLLED: "TREASURY_OR_LOCK_CONTROLLED",
  UNVERIFIED: "UNVERIFIED",
});

export const SUPPLY_IMPACTS = Object.freeze({
  TOTAL_SUPPLY_REDUCED: "TOTAL_SUPPLY_REDUCED",
  CIRCULATING_SINK_ONLY: "CIRCULATING_SINK_ONLY",
  RELABELED_NO_REDUCTION: "RELABELED_NO_REDUCTION",
  NET_INFLATIONARY_WASH_BURN: "NET_INFLATIONARY_WASH_BURN",
});

export const TRAIT_KEYS = [
  "ruleBased",
  "auditable",
  "usageLinked",
  "clearTradeoff",
  "noApplauseRequired",
];

/**
 * Audit a token burn mechanism against the 5-trait rubric and 2-question sanity check.
 */
export function auditBurnCredibility(profile) {
  const {
    id,
    name,
    chain,
    mechanismSummary,
    traits = {},
    sanityCheck = {},
    payerSource = "unknown",
    verificationMethod = "unspecified",
  } = profile;

  const normalizedTraits = {};
  let traitScore = 0;
  for (const key of TRAIT_KEYS) {
    const val = Boolean(traits[key]);
    normalizedTraits[key] = val;
    if (val) traitScore += 1;
  }

  const destination = sanityCheck.destination ?? DESTINATIONS.UNVERIFIED;
  const supplyImpact = sanityCheck.supplyImpact ?? SUPPLY_IMPACTS.RELABELED_NO_REDUCTION;
  const hasOnChainProof = Boolean(sanityCheck.onChainProofVerified);

  const redFlags = [];
  const passesTraitThreshold = traitScore >= 3;

  if (!passesTraitThreshold) {
    redFlags.push(`Failed 3-of-5 credibility trait threshold (${traitScore}/5).`);
  }
  if (
    destination === DESTINATIONS.TREASURY_OR_LOCK_CONTROLLED ||
    destination === DESTINATIONS.UNVERIFIED
  ) {
    redFlags.push(`Destination "${destination}" is not provably irrecoverable.`);
  }
  if (
    supplyImpact === SUPPLY_IMPACTS.RELABELED_NO_REDUCTION ||
    supplyImpact === SUPPLY_IMPACTS.NET_INFLATIONARY_WASH_BURN
  ) {
    redFlags.push(`Supply sanity check failed: "${supplyImpact}" does not prove net burn.`);
  }
  if (!hasOnChainProof) {
    redFlags.push("Missing independent on-chain verification (relies on blog/tweet claims).");
  }
  if (!normalizedTraits.clearTradeoff) {
    redFlags.push("Unclear economic tradeoff ('nobody is paying' -> likely supply rearrangement).");
  }

  const destinationSafe =
    destination === DESTINATIONS.PROTOCOL_DESTRUCTION ||
    destination === DESTINATIONS.NULL_ADDRESS_BURN ||
    destination === DESTINATIONS.IRRECOVERABLE_SINK_DEAD;

  const supplyCredible =
    supplyImpact === SUPPLY_IMPACTS.TOTAL_SUPPLY_REDUCED ||
    supplyImpact === SUPPLY_IMPACTS.CIRCULATING_SINK_ONLY;

  let verdict = "THEATER_ALERT";
  if (passesTraitThreshold && destinationSafe && supplyCredible && hasOnChainProof) {
    verdict =
      supplyImpact === SUPPLY_IMPACTS.TOTAL_SUPPLY_REDUCED && traitScore >= 4
        ? "CREDIBLE_INFRASTRUCTURE"
        : "CREDIBLE_WITH_CAVEATS";
  } else if (passesTraitThreshold && (destinationSafe || supplyCredible)) {
    verdict = "BORDERLINE_NEEDS_AUDIT";
  }

  // Quantitative composite score (0-100)
  const traitPoints = traitScore * 12; // max 60
  const destPoints =
    destination === DESTINATIONS.PROTOCOL_DESTRUCTION ||
    destination === DESTINATIONS.NULL_ADDRESS_BURN
      ? 15
      : destination === DESTINATIONS.IRRECOVERABLE_SINK_DEAD
        ? 11
        : 0;
  const supplyPoints =
    supplyImpact === SUPPLY_IMPACTS.TOTAL_SUPPLY_REDUCED
      ? 15
      : supplyImpact === SUPPLY_IMPACTS.CIRCULATING_SINK_ONLY
        ? 10
        : 0;
  const proofPoints = hasOnChainProof ? 10 : 0;
  const compositeScore = Math.min(100, traitPoints + destPoints + supplyPoints + proofPoints);

  return {
    id,
    name,
    chain,
    mechanismSummary,
    payerSource,
    verificationMethod,
    traitScore,
    maxTraits: 5,
    passesTraitThreshold,
    traits: normalizedTraits,
    sanityCheck: {
      q1_destination: destination,
      q2_supplyImpact: supplyImpact,
      onChainProofVerified: hasOnChainProof,
    },
    compositeScore,
    verdict,
    redFlags,
  };
}

/**
 * Canonical catalog: the 5 real protocol burns from the article + 3 classic "burn theater" anti-patterns.
 */
export const CANONICAL_BURN_PROFILES = [
  {
    id: "eth-eip1559",
    name: "Ethereum EIP-1559 Fee Burn",
    chain: "Ethereum Mainnet",
    mechanismSummary: "Every block destroys baseFeePerGas * gasUsed at protocol level; priority tips go to validators.",
    payerSource: "Blockspace users (base gas fee)",
    verificationMethod: "RPC eth_getBlockByNumber + eth_getTransactionReceipt (gasUsed * baseFeePerGas)",
    traits: {
      ruleBased: true,
      auditable: true,
      usageLinked: true,
      clearTradeoff: true,
      noApplauseRequired: true,
    },
    sanityCheck: {
      destination: DESTINATIONS.PROTOCOL_DESTRUCTION,
      supplyImpact: SUPPLY_IMPACTS.TOTAL_SUPPLY_REDUCED,
      onChainProofVerified: true,
    },
  },
  {
    id: "avax-cchain-fee",
    name: "Avalanche C-Chain Fee Burn",
    chain: "Avalanche C-Chain",
    mechanismSummary: "100% of AVAX transaction fees are permanently destroyed; zero fee payouts to validators or treasury.",
    payerSource: "Network transaction senders (100% of tx fees)",
    verificationMethod: "C-Chain RPC block/receipt gasUsed * effectiveGasPrice + blackhole fee verification",
    traits: {
      ruleBased: true,
      auditable: true,
      usageLinked: true,
      clearTradeoff: true,
      noApplauseRequired: true,
    },
    sanityCheck: {
      destination: DESTINATIONS.PROTOCOL_DESTRUCTION,
      supplyImpact: SUPPLY_IMPACTS.TOTAL_SUPPLY_REDUCED,
      onChainProofVerified: true,
    },
  },
  {
    id: "xrpl-tx-cost",
    name: "XRP Ledger Anti-Spam Destruction",
    chain: "XRP Ledger Mainnet",
    mechanismSummary: "Every validated tx destroys its XRP fee (in drops) to deter spam; reflected directly in ledger total_coins.",
    payerSource: "Transaction senders paying anti-spam network cost",
    verificationMethod: "XRPL RPC ledger(validated) -> 100B XRP - total_coins + sum(tx.Fee)",
    traits: {
      ruleBased: true,
      auditable: true,
      usageLinked: true,
      clearTradeoff: true,
      noApplauseRequired: true,
    },
    sanityCheck: {
      destination: DESTINATIONS.PROTOCOL_DESTRUCTION,
      supplyImpact: SUPPLY_IMPACTS.TOTAL_SUPPLY_REDUCED,
      onChainProofVerified: true,
    },
  },
  {
    id: "bnb-autoburn-bep95",
    name: "BNB Chain Auto-Burn + BEP-95",
    chain: "BNB Smart Chain",
    mechanismSummary: "Quarterly formula B = N * 1000 / (P + K) toward 100M floor + continuous BEP-95 gas fee burn to 0x...dEaD.",
    payerSource: "Protocol scheduled supply reduction + BSC gas fee share",
    verificationMethod: "BSC RPC balanceOf(0x...dEaD) + public quarterly burn tx + Auto-Burn formula check",
    traits: {
      ruleBased: true,
      auditable: true,
      usageLinked: true,
      clearTradeoff: true,
      noApplauseRequired: false, // Quarterly events still carry slight ceremonial framing, though formula-driven
    },
    sanityCheck: {
      destination: DESTINATIONS.IRRECOVERABLE_SINK_DEAD,
      supplyImpact: SUPPLY_IMPACTS.TOTAL_SUPPLY_REDUCED,
      onChainProofVerified: true,
    },
  },
  {
    id: "helium-bme-dc",
    name: "Helium Burn-to-Mint Data Credits",
    chain: "Solana / Helium Network",
    mechanismSummary: "HNT is permanently burned at oracle USD price to mint non-transferable Data Credits ($0.00001/DC) for network usage.",
    payerSource: "Real IoT/Mobile network consumers purchasing prepaid utility credits",
    verificationMethod: "Solana RPC getTokenSupply on HNT & DC SPL mints + burn-to-mint oracle accounting",
    traits: {
      ruleBased: true,
      auditable: true,
      usageLinked: true,
      clearTradeoff: true,
      noApplauseRequired: true,
    },
    sanityCheck: {
      destination: DESTINATIONS.PROTOCOL_DESTRUCTION,
      supplyImpact: SUPPLY_IMPACTS.TOTAL_SUPPLY_REDUCED,
      onChainProofVerified: true,
    },
  },
  // --- Anti-Patterns ("Theater Burns") ---
  {
    id: "theater-treasury-relabel",
    name: "[ANTI-PATTERN] Countdown Treasury Relabel",
    chain: "Generic EVM",
    mechanismSummary: "Team announces '50% Supply Burn!' with countdown timer, but moves uncirculated treasury tokens to a multisig time-lock.",
    payerSource: "Nobody (rearrangement of uncirculated team allocation)",
    verificationMethod: "Screenshot tweet only; totalSupply() unchanged",
    traits: {
      ruleBased: false,
      auditable: false,
      usageLinked: false,
      clearTradeoff: false,
      noApplauseRequired: false,
    },
    sanityCheck: {
      destination: DESTINATIONS.TREASURY_OR_LOCK_CONTROLLED,
      supplyImpact: SUPPLY_IMPACTS.RELABELED_NO_REDUCTION,
      onChainProofVerified: false,
    },
  },
  {
    id: "theater-mint-and-burn",
    name: "[ANTI-PATTERN] Dev Mint-and-Burn Wash",
    chain: "Generic EVM",
    mechanismSummary: "Owner calls mint() for 10M tokens and transfers 5M to 0x...dEaD to generate a 'massive burn' tx hash while net supply grows +5M.",
    payerSource: "Diluted token holders (net inflation disguised as burn)",
    verificationMethod: "Transfer->dEaD log exists, but totalSupply() increased net +5M",
    traits: {
      ruleBased: false,
      auditable: true,
      usageLinked: false,
      clearTradeoff: false,
      noApplauseRequired: false,
    },
    sanityCheck: {
      destination: DESTINATIONS.IRRECOVERABLE_SINK_DEAD,
      supplyImpact: SUPPLY_IMPACTS.NET_INFLATIONARY_WASH_BURN,
      onChainProofVerified: true,
    },
  },
  {
    id: "theater-vibe-burn",
    name: "[ANTI-PATTERN] Discretionary Hype Burn",
    chain: "Generic EVM",
    mechanismSummary: "One-off manual burn of 0.1% supply announced whenever token price dips, with no usage link or repeatable rule.",
    payerSource: "Ad-hoc marketing budget",
    verificationMethod: "Single manual tx to 0x...dEaD; no recurring protocol rule",
    traits: {
      ruleBased: false,
      auditable: true,
      usageLinked: false,
      clearTradeoff: false,
      noApplauseRequired: false,
    },
    sanityCheck: {
      destination: DESTINATIONS.IRRECOVERABLE_SINK_DEAD,
      supplyImpact: SUPPLY_IMPACTS.CIRCULATING_SINK_ONLY,
      onChainProofVerified: true,
    },
  },
];

export function auditAllCanonicalProfiles() {
  return CANONICAL_BURN_PROFILES.map(auditBurnCredibility);
}
