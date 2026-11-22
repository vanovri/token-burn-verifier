#!/usr/bin/env node
/**
 * Master End-to-End Runner
 * Executes:
 *   1. Deterministic Math Simulators (all 5 token burn protocols)
 *   2. Real vs Theater Credibility Auditor (5 real + 3 theater anti-patterns)
 *   3. Solidity Smart Contract Compilation (4 contracts via solc)
 *   4. Live Mainnet On-Chain Verification (5 chains + SHIB/USDC ERC-20 audit)
 */

import { auditAllCanonicalProfiles } from "../src/auditor/credibility-auditor.mjs";
import { simulateAvaxFeeTension } from "../src/protocols/avalanche-burn.mjs";
import { simulateBnbQuarterlySchedule } from "../src/protocols/bnb-autoburn.mjs";
import { simulateEip1559Blocks } from "../src/protocols/ethereum-eip1559.mjs";
import { simulateHeliumBme } from "../src/protocols/helium-bme.mjs";
import { simulateXrplAntiSpamEscalation } from "../src/protocols/xrpl-burn.mjs";
import { compileAllContracts } from "./compile-contracts.mjs";
import { runLiveMultiChainVerification } from "./verify-all-5-chains.mjs";

console.log("===================================================================");
console.log("  TOKEN BURN VERIFIER — FULL EXECUTION SUITE (5 REAL VS THEATER)   ");
console.log("===================================================================\n");

console.log("[1/4] Deterministic Protocol Simulators:");
const ethSim = simulateEip1559Blocks();
console.log(`  - ETH EIP-1559  : ${ethSim.blocksSimulated} blocks | Burned=${ethSim.cumulativeBurnedEth} ETH | Issued=${ethSim.cumulativeIssuedEth} ETH | NetDeflationary=${ethSim.netDeflationary}`);

const avaxSim = simulateAvaxFeeTension();
console.log(`  - AVAX C-Chain  : 4 fee regimes (25..500 nAVAX) | Daily burn range=${avaxSim.scenarios[0].dailyBurnAvax}..${avaxSim.scenarios[3].dailyBurnAvax} AVAX (0% validator fee share)`);

const xrplSim = simulateXrplAntiSpamEscalation();
console.log(`  - XRP Ledger    : Anti-spam load 25..1000 tx/ledger | Fee escalates ${xrplSim.levels[0].openLedgerFeeDrops} -> ${xrplSim.levels.at(-1).openLedgerFeeDrops} drops`);

const bnbSim = simulateBnbQuarterlySchedule();
console.log(`  - BNB Auto-Burn : 8 quarters | Supply ${bnbSim.startSupplyBnb.toLocaleString()} -> ${bnbSim.endSupplyBnb.toLocaleString()} BNB (Burned=${bnbSim.cumulativeAutoBurnBnb.toLocaleString()} BNB)`);

const hntSim = simulateHeliumBme();
console.log(`  - Helium BME    : Daily burn=${hntSim.dailyHntBurned} HNT ($${hntSim.dailyDcBreakdown.totalDailyUsdSpent} utility) | Regime=${hntSim.regime}\n`);

console.log("[2/4] Real vs Theater Credibility Auditor (8 Cases):");
for (const audit of auditAllCanonicalProfiles()) {
  console.log(
    `  - ${audit.name.padEnd(44)} | Traits=${audit.traitScore}/5 | Score=${String(audit.compositeScore).padStart(3)}/100 | ${audit.verdict}`
  );
}

console.log("\n[3/4] Solidity Reference Smart Contracts:");
const manifest = compileAllContracts();
console.log(`  - Compiled ${manifest.contractCount} contracts (${manifest.errorCount} errors, ${manifest.warningCount} warnings) via solc ${manifest.compilerVersion}`);

console.log("\n[4/4] Live Mainnet On-Chain Verification (5 Chains + 2 ERC-20 Models):");
await runLiveMultiChainVerification();
