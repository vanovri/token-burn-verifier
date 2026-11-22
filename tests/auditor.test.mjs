import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DESTINATIONS,
  SUPPLY_IMPACTS,
  auditAllCanonicalProfiles,
  auditBurnCredibility,
} from "../src/auditor/credibility-auditor.mjs";

describe("Burn Credibility Auditor (5-Trait Rubric + 2-Question Supply Sanity Check)", () => {
  it("passes all 5 canonical real protocol burns as CREDIBLE_INFRASTRUCTURE", () => {
    const audits = auditAllCanonicalProfiles();
    const realFive = audits.filter((a) => !a.id.startsWith("theater-"));
    assert.equal(realFive.length, 5);

    for (const a of realFive) {
      assert.equal(a.passesTraitThreshold, true, `${a.name} must meet >=3/5 traits`);
      assert.equal(a.verdict, "CREDIBLE_INFRASTRUCTURE", `${a.name} must pass as real infrastructure`);
      assert.ok(a.compositeScore >= 80, `${a.name} score ${a.compositeScore} should be >=80`);
      assert.equal(a.redFlags.length, 0, `${a.name} should have 0 red flags`);
    }
  });

  it("flags all 3 burn-theater anti-patterns as THEATER_ALERT with actionable red flags", () => {
    const audits = auditAllCanonicalProfiles();
    const theaters = audits.filter((a) => a.id.startsWith("theater-"));
    assert.equal(theaters.length, 3);

    for (const t of theaters) {
      assert.equal(t.verdict, "THEATER_ALERT", `${t.name} must be flagged as THEATER_ALERT`);
      assert.ok(t.redFlags.length >= 2, `${t.name} should surface concrete red flags`);
      assert.ok(t.compositeScore < 50, `${t.name} score ${t.compositeScore} should be <50`);
    }
  });

  it("rejects a burn with 4/5 traits if supply sanity check reveals wash-burn net inflation", () => {
    const sneakyWash = auditBurnCredibility({
      id: "sneaky-wash",
      name: "Sneaky Wash Burn",
      chain: "Test EVM",
      traits: {
        ruleBased: true,
        auditable: true,
        usageLinked: true,
        clearTradeoff: false,
        noApplauseRequired: true,
      },
      sanityCheck: {
        destination: DESTINATIONS.IRRECOVERABLE_SINK_DEAD,
        supplyImpact: SUPPLY_IMPACTS.NET_INFLATIONARY_WASH_BURN,
        onChainProofVerified: true,
      },
    });
    assert.notEqual(sneakyWash.verdict, "CREDIBLE_INFRASTRUCTURE");
    assert.ok(sneakyWash.redFlags.some((f) => f.includes("Supply sanity check failed")));
  });
});
