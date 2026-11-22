import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROOF_PATH = path.resolve(__dirname, "../reports/live-onchain-proof.json");

describe("Live On-Chain Proof Artifact Integrity & Schema Verification", () => {
  it("exists and passes SHA-256 tamper-evidence verification", () => {
    assert.equal(existsSync(PROOF_PATH), true, "reports/live-onchain-proof.json must exist");
    const raw = JSON.parse(readFileSync(PROOF_PATH, "utf8"));
    const { integritySha256, ...body } = raw;
    assert.match(integritySha256, /^[0-9a-f]{64}$/);

    const recomputed = createHash("sha256").update(JSON.stringify(body, null, 2)).digest("hex");
    assert.equal(recomputed, integritySha256, "Integrity SHA-256 digest must match payload");
  });

  it("contains real live mainnet proof fields for all 5 protocols + 2 ERC-20 models", () => {
    const { liveOnChainProofs: p } = JSON.parse(readFileSync(PROOF_PATH, "utf8"));

    // 1. ETH EIP-1559
    assert.ok(p.ethereumEip1559.blockNumber > 20_000_000);
    assert.match(p.ethereumEip1559.txHash, /^0x[0-9a-fA-F]{64}$/);
    assert.ok(BigInt(p.ethereumEip1559.blockTotalBurnedWei) > 0n);

    // 2. AVAX C-Chain
    assert.ok(p.avalancheCChain.blockNumber > 50_000_000);
    assert.equal(p.avalancheCChain.validatorFeePayoutAvax, "0.0");
    assert.ok(Number(p.avalancheCChain.sampleTxBurnedAvax) > 0);

    // 3. XRPL
    assert.ok(p.xrplLedger.ledgerIndex > 90_000_000);
    assert.ok(BigInt(p.xrplLedger.cumulativeBurnedDrops) > 10_000_000_000_000n);

    // 4. BNB Chain
    assert.ok(p.bnbChain.blockNumber > 40_000_000);
    assert.ok(BigInt(p.bnbChain.deadAddressBalanceWei) > 0n);

    // 5. Helium (Solana)
    assert.ok(p.heliumSolana.solanaSlot > 300_000_000);
    assert.ok(Number(p.heliumSolana.hntCirculatingSupply) > 100_000_000);
    assert.ok(BigInt(p.heliumSolana.outstandingDataCredits) > 0n);

    // 6 & 7. ERC-20 Sink (SHIB) vs Protocol _burn (USDC)
    assert.equal(p.erc20Comparison.shibDeadSink.symbol, "SHIB");
    assert.ok(p.erc20Comparison.shibDeadSink.onChainSupplyState.combinedBurnSinksPercentOfTotalSupply > 40);
    assert.equal(p.erc20Comparison.usdcProtocolBurn.symbol, "USDC");
    assert.equal(p.erc20Comparison.usdcProtocolBurn.sanityCheck.q2_totalSupplyActuallyDecreased, true);
  });
});
