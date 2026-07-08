
/**
 * @fileOverview Institutional On-Chain Verification Library
 * Uses Etherscan V2 Multichain API to track incoming payments across EVM networks.
 */

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

export interface ChainConfig {
  id: number;
  name: string;
  confirmations: number;
  nativeToken: string;
}

export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  "ERC20": { id: 1, name: "Ethereum", confirmations: 12, nativeToken: "ETH" },
  "BEP20": { id: 56, name: "BSC", confirmations: 15, nativeToken: "BNB" },
  "Polygon": { id: 137, name: "Polygon", confirmations: 30, nativeToken: "MATIC" },
  "Arbitrum": { id: 42161, name: "Arbitrum", confirmations: 12, nativeToken: "ETH" },
  "Base": { id: 8453, name: "Base", confirmations: 12, nativeToken: "ETH" },
  "Avalanche": { id: 43114, name: "Avalanche", confirmations: 12, nativeToken: "AVAX" }
};

/**
 * Fetches the latest transaction list for a wallet on a specific EVM chain.
 */
export async function getChainTransactions(network: string, address: string) {
  const chain = SUPPORTED_CHAINS[network];
  if (!chain || !ETHERSCAN_API_KEY) return [];

  try {
    const url = `https://api.etherscan.io/v2/api?chainid=${chain.id}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const res = await fetch(url, { next: { revalidate: 15 } });
    const data = await res.json();
    
    if (data.status === "1" && Array.isArray(data.result)) {
      return data.result;
    }
    return [];
  } catch (error) {
    console.error(`[OnChain] Failed to fetch ${network} transactions:`, error);
    return [];
  }
}

/**
 * Validates if a transaction matches the expected order parameters.
 */
export function validateTransaction(tx: any, expectedAddress: string, expectedValueNative: number, tolerance: number = 0.02) {
  // 1. Target Address Check
  if (tx.to.toLowerCase() !== expectedAddress.toLowerCase()) return false;

  // 2. Value Conversion (Wei to Native)
  const valueWei = BigInt(tx.value);
  const valueNative = Number(valueWei) / 1e18;

  // 3. Tolerance check (Default 2%)
  const min = expectedValueNative * (1 - tolerance);
  const max = expectedValueNative * (1 + tolerance);

  return valueNative >= min && valueNative <= max;
}
