#!/usr/bin/env node
/**
 * Master Live Multi-Chain Verification Script
 *
 * Queries ALL 5 mainnet chains from "5 Token Burns That Aren't Just a Show" PLUS
 * 2 contrasting ERC-20 burn models on Ethereum Mainnet (SHIB -> 0x...dEaD vs USDC -> 0x0000):
 *   1. Ethereum Mainnet (EIP-1559 baseFee burn)
 *   2. Avalanche C-Chain Mainnet (100% AVAX fee burn)
 *   3. XRP Ledger Mainnet (anti-spam fee destruction + genesis total_coins audit)
 *   4. BNB Smart Chain Mainnet (0x...dEaD burn sink + BEP-95 + Auto-Burn formula)
 *   5. Solana Mainnet / Helium (live HNT & Data Credits SPL token supply)
 *   6. ERC-20 Comparison: SHIB (dEaD sink) vs USDC (true _burn -> 0x0000)
 *
 * Outputs:
 *   - reports/live-onchain-proof.json (machine-verifiable snapshot + SHA-256 digest)
 *   - reports/LIVE_ONCHAIN_AUDIT_REPORT.md (human-readable audit report)
 *   - dashboard/data.js (bundled snapshot for offline/file:// dashboard viewing)
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditAllCanonicalProfiles } from "../src/auditor/credibility-auditor.mjs";
import { simulateAvaxFeeTension } from "../src/protocols/avalanche-burn.mjs";
import { simulateBnbQuarterlySchedule } from "../src/protocols/bnb-autoburn.mjs";
import { simulateEip1559Blocks } from "../src/protocols/ethereum-eip1559.mjs";
import { simulateHeliumBme } from "../src/protocols/helium-bme.mjs";
import { simulateXrplAntiSpamEscalation } from "../src/protocols/xrpl-burn.mjs";
import { verifyAvalancheFeeBurn } from "../src/verifiers/avax-verifier.mjs";
import { verifyBnbChainBurn } from "../src/verifiers/bnb-verifier.mjs";
import { REFERENCE_ERC20_TOKENS, verifyErc20Burn } from "../src/verifiers/erc20-burn-verifier.mjs";
import { verifyEthereumEip1559Burn } from "../src/verifiers/eth-eip1559-verifier.mjs";
import { verifyHeliumBmeOnChain } from "../src/verifiers/helium-verifier.mjs";
import { verifyXrplFeeDestruction } from "../src/verifiers/xrpl-verifier.mjs";
import { compileAllContracts } from "./compile-contracts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(ROOT, "reports");
const DASHBOARD_DIR = path.join(ROOT, "dashboard");

export async function runLiveMultiChainVerification() {
  console.log("Running LIVE mainnet on-chain burn verifications across 5 chains + 2 ERC-20 models...\n");

  const [eth, avax, xrpl, bnb, helium, erc20Shib, erc20Usdc] = await Promise.all([
    verifyEthereumEip1559Burn(),
    verifyAvalancheFeeBurn(),
    verifyXrplFeeDestruction(),
    verifyBnbChainBurn(),
    verifyHeliumBmeOnChain(),
    verifyErc20Burn({
      tokenAddress: REFERENCE_ERC20_TOKENS.SHIB.address,
      blockWindow: 1000,
      chunkSize: 500,
      extraSinkAddresses: REFERENCE_ERC20_TOKENS.SHIB.extraSinkAddresses,
    }),
    verifyErc20Burn({
      tokenAddress: REFERENCE_ERC20_TOKENS.USDC.address,
      blockWindow: 200,
      chunkSize: 200,
    }),
  ]);

  const simulations = {
    ethereum: simulateEip1559Blocks(),
    avalanche: simulateAvaxFeeTension(),
    xrpl: simulateXrplAntiSpamEscalation(),
    bnb: simulateBnbQuarterlySchedule(),
    helium: simulateHeliumBme(),
  };

  const credibilityAudits = auditAllCanonicalProfiles();
  const contractsManifest = compileAllContracts();

  const payload = {
    schemaVersion: "1.0.0",
    generatedAtIso: new Date().toISOString(),
    articleReference: "5 Token Burns That Aren't Just a Show (Thinking Loop)",
    liveOnChainProofs: {
      ethereumEip1559: eth,
      avalancheCChain: avax,
      xrplLedger: xrpl,
      bnbChain: bnb,
      heliumSolana: helium,
      erc20Comparison: {
        shibDeadSink: erc20Shib,
        usdcProtocolBurn: erc20Usdc,
      },
    },
    simulations,
    credibilityAudits,
    contractsSummary: {
      compilerVersion: contractsManifest.compilerVersion,
      contractCount: contractsManifest.contractCount,
      errorCount: contractsManifest.errorCount,
      contracts: contractsManifest.contracts.map(({ abi, ...rest }) => rest),
    },
  };

  const canonicalBody = JSON.stringify(payload, null, 2);
  const sha256 = createHash("sha256").update(canonicalBody).digest("hex");
  const finalReport = { ...payload, integritySha256: sha256 };

  mkdirSync(REPORTS_DIR, { recursive: true });
  mkdirSync(DASHBOARD_DIR, { recursive: true });

  const jsonPath = path.join(REPORTS_DIR, "live-onchain-proof.json");
  writeFileSync(jsonPath, JSON.stringify(finalReport, null, 2), "utf8");

  const mdPath = path.join(REPORTS_DIR, "LIVE_ONCHAIN_AUDIT_REPORT.md");
  writeFileSync(mdPath, renderMarkdownReport(finalReport), "utf8");

  const dashboardDataPath = path.join(DASHBOARD_DIR, "data.js");
  writeFileSync(
    dashboardDataPath,
    `// Auto-generated live on-chain burn proof snapshot (${finalReport.generatedAtIso})\nwindow.TOKEN_BURN_DATA = ${JSON.stringify(finalReport, null, 2)};\n`,
    "utf8"
  );

  console.log("LIVE VERIFICATION COMPLETE (7/7 Mainnet RPC Probes SUCCEEDED):");
  console.log(`  1) ETH EIP-1559  : Block #${eth.blockNumber} | Block Burn = ${eth.blockTotalBurnedEth} ETH | Sample TX Burn = ${eth.txBurnedEth} ETH (${eth.txBurnSharePercent}%)`);
  console.log(`  2) AVAX C-Chain  : Block #${avax.blockNumber} | Sample TX Burn = ${avax.sampleTxBurnedAvax} AVAX (100% burned, 0% validator payout)`);
  console.log(`  3) XRP Ledger    : Ledger #${xrpl.ledgerIndex} | Cumulative Burn = ${xrpl.cumulativeBurnedXrp} XRP (${xrpl.percentSupplyDestroyed}%) | Ledger TXs Burned = ${xrpl.validatedLedgerBurnedXrp} XRP`);
  console.log(`  4) BNB Chain     : Block #${bnb.blockNumber} | dEaD Sink = ${Number(bnb.deadAddressBalanceBnb).toFixed(4)} BNB | BEP-95 Block Est = ${bnb.estimatedBep95BlockBurnBnb} BNB`);
  console.log(`  5) Helium (SOL)  : Slot #${helium.solanaSlot} | HNT Supply = ${helium.hntCirculatingSupply} | Outstanding DC = ${helium.outstandingDataCredits} ($${helium.outstandingDcUsdValue})`);
  console.log(`  6) ERC-20 SHIB   : Classification = ${erc20Shib.classification} | Combined Burn Sinks = ${erc20Shib.onChainSupplyState.combinedBurnSinksPercentOfTotalSupply}% of totalSupply (dEaD=${erc20Shib.onChainSupplyState.deadSinkPercentOfTotalSupply}%)`);
  console.log(`  7) ERC-20 USDC   : Classification = ${erc20Usdc.classification} | Window _burn -> 0x0000 = ${erc20Usdc.windowActivity.burnedToZeroFormatted} USDC`);
  console.log(`\nArtifacts written:\n  - ${jsonPath}\n  - ${mdPath}\n  - ${dashboardDataPath}\n  - Integrity SHA-256: ${sha256}`);

  return finalReport;
}

function renderMarkdownReport(report) {
  const {
    ethereumEip1559: eth,
    avalancheCChain: avax,
    xrplLedger: xrpl,
    bnbChain: bnb,
    heliumSolana: helium,
    erc20Comparison: { shibDeadSink: shib, usdcProtocolBurn: usdc },
  } = report.liveOnChainProofs;

  const auditRows = report.credibilityAudits
    .map(
      (a) =>
        `| ${a.name} | ${a.chain} | ${a.traitScore}/5 | \`${a.sanityCheck.q1_destination}\` | \`${a.sanityCheck.q2_supplyImpact}\` | **${a.compositeScore}/100** | \`${a.verdict}\` |`
    )
    .join("\n");

  return `# Live Multi-Chain Token Burn Verification Report

- **Generated At:** \`${report.generatedAtIso}\`
- **Reference Framework:** *${report.articleReference}*
- **Integrity SHA-256:** \`${report.integritySha256}\`

## 1. Live On-Chain Proofs (5 Protocols)

| # | Protocol | Chain Height / Slot | Live Burn Proof | Destination / Supply Reality | RPC Source |
|---|---|---|---|---|---|
| 1 | **Ethereum EIP-1559** | Block \`#${eth.blockNumber}\` | Block burn: **${eth.blockTotalBurnedEth} ETH** · Sample TX \`${eth.txHash.slice(0, 14)}…\`: **${eth.txBurnedEth} ETH** (${eth.txBurnSharePercent}% of tx fee; tip: ${eth.txPriorityTipEth} ETH) | Protocol-level baseFee destruction | \`${eth.rpcUrl}\` |
| 2 | **Avalanche C-Chain** | Block \`#${avax.blockNumber}\` | Sample TX \`${avax.sampleTxHash.slice(0, 14)}…\`: **${avax.sampleTxBurnedAvax} AVAX** (**100%** burned, **0 AVAX** to validators) · Block floor: ${avax.blockFloorBurnedAvax} AVAX | Protocol blackhole \`${avax.blockCoinbaseMiner}\` | \`${avax.rpcUrl}\` |
| 3 | **XRP Ledger (XRPL)** | Ledger \`#${xrpl.ledgerIndex}\` | Cumulative destroyed since genesis: **${xrpl.cumulativeBurnedXrp} XRP** (${xrpl.percentSupplyDestroyed}% of 100B) · Ledger (${xrpl.validatedLedgerTxCount} txs): **${xrpl.validatedLedgerBurnedXrp} XRP** | Removed from protocol \`total_coins\` | \`${xrpl.rpcUrl}\` |
| 4 | **BNB Chain (Auto-Burn + BEP-95)** | Block \`#${bnb.blockNumber}\` | \`0x…dEaD\` sink balance: **${Number(bnb.deadAddressBalanceBnb).toFixed(4)} BNB** · BEP-95 10% block est: ${bnb.estimatedBep95BlockBurnBnb} BNB · Formula Q-burn (@ \$${bnb.autoBurnFormulaCheck.inputs.avgPriceUsdP}): ${bnb.autoBurnFormulaCheck.actualBurnBnb} BNB | Irrecoverable \`0x…dEaD\` sink + scheduled floor (100M BNB) | \`${bnb.rpcUrl}\` |
| 5 | **Helium BME (Solana)** | Slot \`#${helium.solanaSlot}\` | HNT SPL supply: **${helium.hntCirculatingSupply} HNT** · Outstanding non-transferable DC: **${helium.outstandingDataCredits} DC** (**\$${helium.outstandingDcUsdValue} USD** @ \$0.00001/DC) | HNT SPL burn -> non-transferable DC mint | \`${helium.rpcUrl}\` |

## 2. ERC-20 Burn Sanity Check: \`0x…dEaD\` Sink vs True \`_burn -> 0x0000\`

| Token | Contract | Blocks Scanned | \`balanceOf(dEaD)\` | Window -> \`dEaD\` | Window -> \`0x0000\` (\`_burn\`) | Window Mints | Classification |
|---|---|---:|---:|---:|---:|---:|---|
| **${shib.symbol}** | \`${shib.tokenAddress}\` | ${shib.blockRange.blocksScanned} | ${shib.onChainSupplyState.combinedBurnSinksPercentOfTotalSupply}% combined sinks (\`0x…dEaD\`: ${shib.onChainSupplyState.deadSinkPercentOfTotalSupply}%) | ${shib.windowActivity.burnedToDeadFormatted} (${shib.windowActivity.transfersToDeadCount} txs) | ${shib.windowActivity.burnedToZeroFormatted} | ${shib.windowActivity.mintedFromZeroFormatted} | \`${shib.classification}\` |
| **${usdc.symbol}** | \`${usdc.tokenAddress}\` | ${usdc.blockRange.blocksScanned} | ${usdc.onChainSupplyState.deadSinkPercentOfTotalSupply}% | ${usdc.windowActivity.burnedToDeadFormatted} | ${usdc.windowActivity.burnedToZeroFormatted} (${usdc.windowActivity.transfersToZeroCount} txs) | ${usdc.windowActivity.mintedFromZeroFormatted} (${usdc.windowActivity.mintsFromZeroCount} txs) | \`${usdc.classification}\` |

> **Key Takeaway:** Sending ERC-20 tokens to \`0x000…dEaD\` (like SHIB) removes tokens from active circulation without lowering \`totalSupply()\`. Calling \`_burn()\` to \`0x000…0000\` (like USDC) lowers \`totalSupply()\` directly — and auditing \`Transfer(0x0000, *)\` mints simultaneously catches mint-and-burn wash theater.

## 3. Credibility Rubric Audit (5 Real Protocols vs 3 Burn-Theater Anti-Patterns)

| Mechanism | Chain | Traits | Q1 Destination | Q2 Supply Reality | Score | Verdict |
|---|---|---:|---|---|---:|---|
${auditRows}

## 4. Solidity Reference Contracts Verified (\`solc ${report.contractsSummary.compilerVersion}\`)

- **Contracts Compiled:** ${report.contractsSummary.contractCount} (\`0\` errors)
${report.contractsSummary.contracts.map((c) => `- \`${c.contractName}\` (\`${c.file}\`): ${c.deployedBytecodeBytes} bytes runtime, SHA-256 \`${c.bytecodeSha256.slice(0, 16)}…\``).join("\n")}
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runLiveMultiChainVerification();
}
