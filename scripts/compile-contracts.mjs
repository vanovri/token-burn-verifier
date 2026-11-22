#!/usr/bin/env node
/**
 * Compile and verify all Solidity reference burn contracts using solc (JS compiler).
 * Produces `artifacts/contracts-manifest.json` with bytecode hashes, sizes, and ABI signatures.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts");

export function compileAllContracts() {
  const solFiles = readdirSync(CONTRACTS_DIR)
    .filter((f) => f.endsWith(".sol"))
    .sort();

  const sources = {};
  for (const file of solFiles) {
    sources[file] = {
      content: readFileSync(path.join(CONTRACTS_DIR, file), "utf8"),
    };
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  const warnings = (output.errors || []).filter((e) => e.severity === "warning");

  if (errors.length > 0) {
    throw new Error(
      `Solidity compilation failed with ${errors.length} error(s):\n` +
        errors.map((e) => e.formattedMessage).join("\n")
    );
  }

  const compiled = [];
  for (const file of solFiles) {
    const fileContracts = output.contracts?.[file] || {};
    for (const [contractName, artifact] of Object.entries(fileContracts)) {
      const bytecode = artifact.evm.bytecode.object;
      const deployedBytecode = artifact.evm.deployedBytecode.object;
      const events = artifact.abi
        .filter((item) => item.type === "event")
        .map((e) => `${e.name}(${e.inputs.map((i) => i.type).join(",")})`);
      const functions = artifact.abi
        .filter((item) => item.type === "function")
        .map((fn) => `${fn.name}(${fn.inputs.map((i) => i.type).join(",")})`);

      const bytecodeSha256 = createHash("sha256").update(bytecode).digest("hex");

      compiled.push({
        file,
        contractName,
        bytecodeBytes: bytecode.length / 2,
        deployedBytecodeBytes: deployedBytecode.length / 2,
        bytecodeSha256,
        functions,
        events,
        abi: artifact.abi,
      });
    }
  }

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const manifest = {
    compilerVersion: solc.version(),
    compiledAtIso: new Date().toISOString(),
    contractCount: compiled.length,
    errorCount: 0,
    warningCount: warnings.length,
    warnings: warnings.map((w) => w.formattedMessage),
    contracts: compiled,
  };

  writeFileSync(
    path.join(ARTIFACTS_DIR, "contracts-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = compileAllContracts();
  console.log(`Compiled ${manifest.contractCount} Solidity contracts with solc ${manifest.compilerVersion} (0 errors, ${manifest.warningCount} warnings):`);
  for (const c of manifest.contracts) {
    console.log(
      `  - ${c.contractName} (${c.file}): ${c.deployedBytecodeBytes} B runtime | events: ${c.events.join(", ")}`
    );
  }
}
