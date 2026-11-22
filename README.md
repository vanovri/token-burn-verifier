# Token Burn Verifier — 5 Real Protocol Burns vs Theater

Executable multi-chain verification toolkit, exact `BigInt` protocol math simulators, Solidity reference contracts, interactive audit dashboard, and anti-theater credibility engine implementing every mechanism and script from *"5 Token Burns That Aren't Just a Show"* (Thinking Loop).

## What's Implemented

1. **5 Exact Protocol Burn Engines (`src/protocols/`)** — Zero-float `BigInt` / fixed-point arithmetic:
   - **Ethereum EIP-1559** (`ethereum-eip1559.mjs`): Base fee burn (`gasUsed * baseFeePerGas`), priority tip split, canonical elasticity rule (`±12.5%`), and multi-block net issuance thermostat.
   - **Avalanche C-Chain** (`avalanche-burn.mjs`): 100% transaction fee burn (`0%` validator fee payout) and fee-vs-UX friction tradeoff simulator.
   - **XRP Ledger** (`xrpl-burn.mjs`): Protocol-level `total_coins` genesis supply destruction accounting (`100B XRP - total_coins`) and quadratic anti-spam fee escalation.
   - **BNB Chain Auto-Burn + BEP-95** (`bnb-autoburn.mjs`): Quarterly formula `B = N * 1000 / (P + K)` capped at the `100,000,000 BNB` supply floor + BEP-95 real-time gas burn.
   - **Helium Burn-to-Mint Data Credits** (`helium-bme.mjs`): `$0.00001 / DC` non-transferable utility minting (`HNT -> DC`) and Burn-to-Mint Equilibrium (BME) demand vs emission model.

2. **Live Mainnet Multi-Chain Verifiers (`src/verifiers/` & `scripts/`)**:
   - `npm run verify:eth` — Exact Ethers.js v6 EIP-1559 burn estimator (supports `TX_HASH` / `RPC_URL`, or auto-selects a live mainnet EIP-1559 tx).
   - `npm run verify:erc20` — Upgraded Ethers.js v6 ERC-20 scanner checking BOTH `Transfer(*, 0x000...dEaD)` sink transfers AND `Transfer(*, 0x000...0000)` true `_burn` plus `Transfer(0x0000, *)` mints (live SHIB vs USDC proof).
   - `npm run verify:live` — Queries all **5 live mainnets** (ETH, AVAX C-Chain, XRPL, BSC, Solana/Helium) + SHIB/USDC ERC-20 comparison and writes SHA-256 verified proofs to `reports/live-onchain-proof.json`, `reports/LIVE_ONCHAIN_AUDIT_REPORT.md`, and `dashboard/data.js`.

3. **Real vs Theater Credibility Auditor (`src/auditor/credibility-auditor.mjs`)**:
   - Enforces the 5-trait rubric (`>= 3/5` threshold: Rule-Based, Auditable, Usage-Linked, Clear Tradeoff, No Applause Required) + 2-question on-chain supply sanity check (Destination + True Supply Change).
   - Benchmarked on all 5 real protocols vs 3 classic theater anti-patterns (*Countdown Treasury Relabel*, *Dev Mint-and-Burn Wash*, *Discretionary Hype Burn*).

4. **Solidity Reference Smart Contracts (`contracts/`)**:
   - `RealFeeBurnToken.sol`, `BurnToMintDataCredits.sol`, `ScheduledAutoBurnVault.sol`, and `TheaterBurnAntiPattern.sol` — compiled and verified cleanly via `solc` (`npm run compile:contracts`).

5. **Interactive Audit & Simulation Dashboard (`dashboard/index.html`)**:
   - Zero-server self-contained HTML dashboard powered by live `dashboard/data.js` snapshot, live interactive calculators for all 5 mechanisms, and an interactive Real vs Theater rubric scorer.

## Quick Start

```bash
npm install
npm run demo         # Run simulators + auditor + solc compilation + live 5-chain & ERC-20 proofs
npm test             # Run full automated test suite (node --test)
npm run verify:eth   # Standalone ETH EIP-1559 CLI verifier (supports TX_HASH=0x...)
npm run verify:erc20 # Standalone ERC-20 burn & wash-mint scanner (supports TOKEN_ADDRESS=0x...)
```
