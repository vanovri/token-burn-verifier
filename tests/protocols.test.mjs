import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateAvaxTxBurn, simulateAvaxFeeTension } from "../src/protocols/avalanche-burn.mjs";
import {
  BNB_SUPPLY_FLOOR,
  calculateBep95GasBurn,
  calculateBnbAutoBurn,
  simulateBnbQuarterlySchedule,
} from "../src/protocols/bnb-autoburn.mjs";
import {
  calculateEip1559TxBurn,
  computeNextBaseFee,
  simulateEip1559Blocks,
} from "../src/protocols/ethereum-eip1559.mjs";
import {
  burnHntToMintDc,
  hntRequiredToMintDc,
  simulateHeliumBme,
} from "../src/protocols/helium-bme.mjs";
import {
  XRPL_GENESIS_DROPS,
  calculateXrplCumulativeBurn,
  simulateXrplAntiSpamEscalation,
  sumXrplLedgerDestroyedFees,
} from "../src/protocols/xrpl-burn.mjs";

describe("1) Ethereum EIP-1559 Fee Burn Math", () => {
  it("computes exact burned wei vs validator priority tip without float loss", () => {
    const res = calculateEip1559TxBurn({
      gasUsed: 21_000n,
      baseFeePerGas: 20_000_000_000n, // 20 gwei
      effectiveGasPrice: 25_000_000_000n, // 25 gwei (5 gwei tip)
    });
    assert.equal(res.burnedWei, 420_000_000_000_000n);
    assert.equal(res.priorityTipWei, 105_000_000_000_000n);
    assert.equal(res.totalFeeWei, 525_000_000_000_000n);
    assert.equal(res.burnSharePercent, 80);
  });

  it("enforces EIP-1559 elasticity rule: +12.5% max at full block, unchanged at 50% target", () => {
    const base = 16_000_000_000n;
    const limit = 30_000_000n;
    assert.equal(
      computeNextBaseFee({ parentBaseFeePerGas: base, parentGasUsed: 15_000_000n, parentGasLimit: limit }),
      base
    );
    assert.equal(
      computeNextBaseFee({ parentBaseFeePerGas: base, parentGasUsed: 30_000_000n, parentGasLimit: limit }),
      18_000_000_000n // +12.5%
    );
    assert.equal(
      computeNextBaseFee({ parentBaseFeePerGas: base, parentGasUsed: 0n, parentGasLimit: limit }),
      14_000_000_000n // -12.5%
    );
  });

  it("rejects effectiveGasPrice lower than baseFeePerGas", () => {
    assert.throws(
      () => calculateEip1559TxBurn({ gasUsed: 21000n, baseFeePerGas: 30n, effectiveGasPrice: 20n }),
      RangeError
    );
  });

  it("simulates multi-block thermostat dynamics", () => {
    const sim = simulateEip1559Blocks({ blockUtilizations: [1.0, 1.0, 1.0] });
    assert.equal(sim.blocksSimulated, 3);
    assert.equal(sim.netDeflationary, true);
    assert.ok(Number(sim.finalBaseFeeGwei) > 15);
  });
});

describe("2) Avalanche C-Chain 100% Fee Burn Math", () => {
  it("burns 100% of transaction fees (including priority tip) with 0 validator fee payout", () => {
    const res = calculateAvaxTxBurn({
      gasUsed: 100_000n,
      baseFeePerGas: 25_000_000_000n,
      effectiveGasPrice: 30_000_000_000n,
    });
    assert.equal(res.totalBurnedWei, 3_000_000_000_000_000n);
    assert.equal(res.basePortionWei, 2_500_000_000_000_000n);
    assert.equal(res.tipPortionAlsoBurnedWei, 500_000_000_000_000n);
    assert.equal(res.validatorFeePayoutWei, 0n);
    assert.equal(res.burnSharePercent, 100);
  });

  it("models low-fee modest burn vs high-fee UX friction tradeoff", () => {
    const sim = simulateAvaxFeeTension({ feeScenariosNAvax: [25, 500], avaxPriceUsd: 30 });
    assert.equal(sim.scenarios[0].uxStatus, "LOW_FEE_MODEST_BURN");
    assert.equal(sim.scenarios[1].uxStatus, "HIGH_BURN_USER_FRICTION");
    assert.equal(sim.scenarios[0].validatorFeeSharePercent, 0);
  });
});

describe("3) XRP Ledger Anti-Spam Destruction Math", () => {
  it("computes exact cumulative burned XRP from protocol total_coins", () => {
    const remaining = XRPL_GENESIS_DROPS - 14_500_000_123456n;
    const res = calculateXrplCumulativeBurn(remaining);
    assert.equal(res.cumulativeBurnedDrops, 14_500_000_123456n);
    assert.equal(res.cumulativeBurnedXrp, "14500000.123456");
  });

  it("sums exact destroyed drops across ledger transactions with 0 validator payout", () => {
    const res = sumXrplLedgerDestroyedFees([{ Fee: "12" }, { Fee: "15" }, { tx: { Fee: "100" } }]);
    assert.equal(res.txCount, 3);
    assert.equal(res.totalBurnedDrops, 127n);
    assert.equal(res.minFeeDrops, 12n);
    assert.equal(res.maxFeeDrops, 100n);
    assert.equal(res.validatorFeePayoutDrops, 0n);
  });

  it("escalates open-ledger fees quadratically under spam load", () => {
    const sim = simulateXrplAntiSpamEscalation({ baseFeeDrops: 10n, expectedLedgerTxCount: 50, txLoadLevels: [50, 500] });
    assert.equal(sim.levels[0].openLedgerFeeDrops, "10");
    assert.equal(sim.levels[1].openLedgerFeeDrops, "1000"); // 10 * (10^2)
    assert.equal(sim.levels[1].status, "ESCALATED_ANTI_SPAM");
  });
});

describe("4) BNB Auto-Burn + BEP-95 Math", () => {
  it("computes exact quarterly formula B = N * 1000 / (P + K) and enforces 100M BNB floor", () => {
    const res = calculateBnbAutoBurn({
      blocksProducedN: 2_592_000,
      avgPriceUsdP: 1000,
      priceAnchorK: 1000,
      currentSupplyBnb: 144_000_000,
    });
    // 2,592,000 * 1000 / 2000 = 1,296,000 BNB
    assert.equal(res.actualBurnBnb, "1296000.0000");
    assert.equal(res.floorReached, false);

    // Clamps strictly at 100M supply floor
    const nearFloor = calculateBnbAutoBurn({
      blocksProducedN: 2_592_000,
      avgPriceUsdP: 500,
      priceAnchorK: 1000,
      currentSupplyBnb: 100_500_000,
    });
    assert.equal(nearFloor.actualBurnBnb, "500000.0000");
    assert.equal(nearFloor.postBurnSupplyBnb, `${BNB_SUPPLY_FLOOR}.0000`);
    assert.equal(nearFloor.floorReached, true);
  });

  it("splits BEP-95 real-time gas burn accurately", () => {
    const res = calculateBep95GasBurn({ gasUsed: 1_000_000n, gasPriceWei: 3_000_000_000n, burnRatioBps: 1000n });
    assert.equal(res.burnedWei, 300_000_000_000_000n);
    assert.equal(res.validatorShareWei, 2_700_000_000_000_000n);
  });

  it("monotonically reduces supply across multi-quarter schedule", () => {
    const sim = simulateBnbQuarterlySchedule({ quarters: 4 });
    assert.ok(sim.endSupplyBnb < sim.startSupplyBnb);
    assert.ok(sim.endSupplyBnb >= BNB_SUPPLY_FLOOR);
  });
});

describe("5) Helium Burn-to-Mint Data Credits (BME) Math", () => {
  it("mints exact non-transferable DCs pegged at $0.00001/DC and round-trips HNT requirement", () => {
    // 10 HNT @ $5.00 = $50.00 = 5,000,000 DC
    const minted = burnHntToMintDc({ hntAmount: 10, hntOraclePriceUsd: 5.0 });
    assert.equal(minted.dcMinted, 5_000_000n);
    assert.equal(minted.dcUsdValue, 50);
    assert.equal(minted.transferable, false);

    const req = hntRequiredToMintDc({ dcDesired: 5_000_000n, hntOraclePriceUsd: 5.0 });
    assert.equal(req.hntRequired, "10.00000000");
  });

  it("identifies demand-driven deflationary regime when DC burn exceeds daily HNT emission", () => {
    const sim = simulateHeliumBme({
      dailyLoraPackets: 500_000_000,
      dailyMobileDataGb: 200_000,
      dailyHotspotOnboards: 500,
      hntOraclePriceUsd: 4.0,
      dailyHntEmission: 20_000,
    });
    assert.equal(sim.regime, "NET_DEFLATIONARY_DEMAND_DRIVEN");
    assert.ok(sim.netDailyHntDelta < 0);
  });
});
