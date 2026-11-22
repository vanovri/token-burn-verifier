import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileAllContracts } from "../scripts/compile-contracts.mjs";

describe("Solidity Reference Contracts Compilation & ABI Verification", () => {
  const manifest = compileAllContracts();

  it("compiles all 4 Solidity contracts cleanly with 0 errors and 0 warnings", () => {
    assert.equal(manifest.contractCount, 4);
    assert.equal(manifest.errorCount, 0);
    assert.equal(manifest.warningCount, 0);
  });

  it("verifies RealFeeBurnToken has no post-genesis mint() and emits FeeBurned", () => {
    const c = manifest.contracts.find((x) => x.contractName === "RealFeeBurnToken");
    assert.ok(c);
    assert.ok(c.deployedBytecodeBytes > 200);
    assert.ok(c.events.some((e) => e.startsWith("FeeBurned(")));
    assert.equal(
      c.functions.some((fn) => fn.toLowerCase().includes("mint")),
      false,
      "RealFeeBurnToken must not expose a discretionary mint() function"
    );
  });

  it("verifies BurnToMintDataCredits exposes burnForCredits, spendCredits, and non-transferable guard", () => {
    const c = manifest.contracts.find((x) => x.contractName === "BurnToMintDataCredits");
    assert.ok(c);
    assert.ok(c.functions.includes("burnForCredits(uint256)"));
    assert.ok(c.functions.includes("spendCredits(uint256,bytes32)"));
    assert.ok(c.functions.includes("transferDataCredits(address,uint256)"));
    assert.ok(c.events.some((e) => e.startsWith("TokenBurnedForCredits(")));
  });

  it("verifies ScheduledAutoBurnVault enforces formula preview and quarterly execution", () => {
    const c = manifest.contracts.find((x) => x.contractName === "ScheduledAutoBurnVault");
    assert.ok(c);
    assert.ok(c.functions.includes("previewQuarterlyBurn(uint256,uint256)"));
    assert.ok(c.functions.includes("executeQuarterlyAutoBurn(uint256,uint256)"));
    assert.ok(c.events.some((e) => e.startsWith("AutoBurnExecuted(")));
  });

  it("verifies TheaterBurnAntiPattern explicitly isolates both anti-pattern trap functions", () => {
    const c = manifest.contracts.find((x) => x.contractName === "TheaterBurnAntiPattern");
    assert.ok(c);
    assert.ok(c.functions.includes("relabelTreasuryAsBurned(uint256,string)"));
    assert.ok(c.functions.includes("mintAndBurnWash(uint256)"));
  });
});
