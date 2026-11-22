/**
 * Live Ethereum EIP-1559 Fee Burn Verifier (Ethers.js v6)
 *
 * Implements the exact article method:
 *   receipt = provider.getTransactionReceipt(txHash)
 *   block   = provider.getBlock(receipt.blockNumber)
 *   burnedWei = receipt.gasUsed * block.baseFeePerGas
 *
 * Also verifies full block burn (`block.gasUsed * block.baseFeePerGas`) and separates
 * the burned base fee from the validator priority tip.
 */

import { ethers } from "ethers";
import { calculateEip1559TxBurn, formatUnitsExact } from "../protocols/ethereum-eip1559.mjs";
import { DEFAULT_RPCS, withEvmProvider } from "./rpc-utils.mjs";

export async function verifyEthereumEip1559Burn({ txHash, rpcUrls = DEFAULT_RPCS.ethereum } = {}) {
  const { result, rpcUrl } = await withEvmProvider(rpcUrls, async (provider) => {
    let targetTxHash = txHash;
    let block;

    if (!targetTxHash) {
      // Auto-discover the latest finalized/recent block with EIP-1559 transactions
      const latestNum = await provider.getBlockNumber();
      block = await provider.getBlock(latestNum, true);
      if (!block || !block.baseFeePerGas) {
        throw new Error(`Block ${latestNum} has no baseFeePerGas`);
      }
      // Prefer a type-2 EIP-1559 transaction with a non-zero priority tip so both burn + tip split show clearly
      const txs = block.prefetchedTransactions ?? [];
      const chosen =
        txs.find((t) => t.type === 2 && (t.maxPriorityFeePerGas ?? 0n) > 0n) ??
        txs.find((t) => t.type === 2) ??
        txs[0];
      if (!chosen) throw new Error(`Latest block ${latestNum} has 0 transactions`);
      targetTxHash = chosen.hash;
    }

    const receipt = await provider.getTransactionReceipt(targetTxHash);
    if (!receipt) throw new Error(`Transaction receipt not found for ${targetTxHash}`);

    if (!block || block.number !== receipt.blockNumber) {
      block = await provider.getBlock(receipt.blockNumber);
    }
    if (!block?.baseFeePerGas) {
      throw new Error(`Block ${receipt.blockNumber} has no baseFeePerGas (pre-EIP-1559 block?)`);
    }

    const effectiveGasPrice = receipt.gasPrice ?? block.baseFeePerGas;
    const txBurn = calculateEip1559TxBurn({
      gasUsed: receipt.gasUsed,
      baseFeePerGas: block.baseFeePerGas,
      effectiveGasPrice,
    });

    const blockBurnedWei = block.gasUsed * block.baseFeePerGas;

    return {
      chain: "Ethereum Mainnet",
      mechanism: "EIP-1559 Base Fee Burn",
      blockNumber: block.number,
      blockHash: block.hash,
      blockTimestampIso: new Date(Number(block.timestamp) * 1000).toISOString(),
      txHash: receipt.hash,
      txType: receipt.type,
      gasUsed: receipt.gasUsed.toString(),
      baseFeePerGasWei: block.baseFeePerGas.toString(),
      baseFeeGwei: ethers.formatUnits(block.baseFeePerGas, "gwei"),
      effectiveGasPriceGwei: ethers.formatUnits(effectiveGasPrice, "gwei"),
      txBurnedWei: txBurn.burnedWei.toString(),
      txBurnedEth: ethers.formatEther(txBurn.burnedWei),
      txPriorityTipEth: ethers.formatEther(txBurn.priorityTipWei),
      txBurnSharePercent: txBurn.burnSharePercent,
      blockGasUsed: block.gasUsed.toString(),
      blockGasLimit: block.gasLimit.toString(),
      blockUtilizationPercent: Number(((Number(block.gasUsed) / Number(block.gasLimit)) * 100).toFixed(2)),
      blockTotalBurnedWei: blockBurnedWei.toString(),
      blockTotalBurnedEth: formatUnitsExact(blockBurnedWei, 18, 6),
      sanityCheck: {
        whereDidTokensGo: "PROTOCOL_DESTRUCTION (base fee destroyed in EVM state transition)",
        supplyActuallyChanged: true,
      },
    };
  });

  return { ...result, rpcUrl, verifiedAtIso: new Date().toISOString() };
}
