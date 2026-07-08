/**
 * @fileOverview Institutional On-Chain Verification Library
 * Uses Etherscan V2, TronGrid, and XRPL Cluster to track incoming payments.
 */

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY;

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
  "Avalanche": { id: 43114, name: "Avalanche", confirmations: 12, nativeToken: "AVAX" },
  "TRON": { id: 0, name: "Tron", confirmations: 19, nativeToken: "TRX" },
  "XRPL": { id: 0, name: "XRP Ledger", confirmations: 1, nativeToken: "XRP" }
};

export const EXPLORERS: Record<string, string> = {
  "ERC20": "https://etherscan.io/tx/",
  "BEP20": "https://bscscan.com/tx/",
  "Polygon": "https://polygonscan.com/tx/",
  "Arbitrum": "https://arbiscan.io/tx/",
  "Base": "https://basescan.org/tx/",
  "Avalanche": "https://snowtrace.io/tx/",
  "TRON": "https://tronscan.org/#/transaction/",
  "XRPL": "https://xrpscan.com/tx/"
};

/**
 * Validates if a string matches the expected transaction hash format for the network.
 */
export function isValidTxHash(hash: string, network: string): boolean {
  if (!hash) return false;
  if (hash === "ADMIN-GIFT" || hash.startsWith("COUPON-") || hash === "ADMIN-MANUAL") return true;

  const cleanHash = hash.trim();
  
  if (network === "TRON" || network === "XRPL") {
    // 64-character hexadecimal
    return /^[a-fA-F0-9]{64}$/.test(cleanHash);
  }
  
  // EVM (0x + 64-character hexadecimal)
  return /^0x[a-fA-F0-9]{64}$/.test(cleanHash);
}

/**
 * Fetches the latest transaction list for a wallet on a specific network.
 */
export async function getChainTransactions(network: string, address: string) {
  const chain = SUPPORTED_CHAINS[network];
  if (!chain) return [];

  try {
    if (network === "TRON") {
      return await getTronTransactions(address);
    }
    if (network === "XRPL") {
      return await getXrpTransactions(address);
    }
    
    // EVM Defaults
    if (!ETHERSCAN_API_KEY) return [];
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
 * Tron Specific Fetcher (TRX + TRC20 USDT)
 */
async function getTronTransactions(address: string) {
  try {
    const headers: any = { 'Content-Type': 'application/json' };
    if (TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = TRONGRID_API_KEY;

    const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=20&contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
    const res = await fetch(url, { headers, next: { revalidate: 15 } });
    const data = await res.json();
    
    if (data.success && Array.isArray(data.data)) {
      return data.data.map((tx: any) => ({
        hash: tx.transaction_id,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        tokenDecimal: tx.token_info?.decimals || 6,
        type: 'trc20',
        confirmations: 20
      }));
    }
    return [];
  } catch (e) {
    return [];
  }
}

/**
 * XRPL Specific Fetcher (XRP)
 */
async function getXrpTransactions(address: string) {
  try {
    const res = await fetch('https://xrplcluster.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_tx',
        params: [{ account: address, limit: 20 }]
      })
    });
    const data = await res.json();
    if (data.result?.transactions) {
      return data.result.transactions.map((t: any) => ({
        hash: t.tx.hash,
        from: t.tx.Account,
        to: t.tx.Destination,
        value: t.tx.Amount,
        destinationTag: t.tx.DestinationTag,
        validated: t.validated,
        type: 'xrp'
      }));
    }
    return [];
  } catch (e) {
    return [];
  }
}

/**
 * Validates if a transaction matches the expected order parameters.
 */
export function validateTransaction(tx: any, expectedAddress: string, expectedValueNative: number, tolerance: number = 0.02, destinationTag?: number | null) {
  if (tx.to?.toLowerCase() !== expectedAddress.toLowerCase()) return false;

  if (tx.type === 'xrp') {
    if (!tx.validated) return false;
    if (destinationTag && tx.destinationTag !== destinationTag) return false;
    const valueXrp = Number(tx.value) / 1000000;
    return valueCheck(valueXrp, expectedValueNative, tolerance);
  }

  if (tx.type === 'trc20') {
    const valueUsdt = Number(tx.value) / Math.pow(10, tx.tokenDecimal || 6);
    return valueCheck(valueUsdt, expectedValueNative, tolerance);
  }

  const valueWei = BigInt(tx.value || "0");
  const valueNative = Number(valueWei) / 1e18;
  return valueCheck(valueNative, expectedValueNative, tolerance);
}

function valueCheck(actual: number, expected: number, tolerance: number) {
  const min = expected * (1 - tolerance);
  const max = expected * (1 + tolerance);
  return actual >= min && actual <= max;
}