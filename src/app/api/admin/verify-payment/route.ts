import { NextRequest, NextResponse } from 'next/server';

const YOUR_EVM_WALLET = '0x3ab3ca43dc691f468bea91883f493cabf6da84d4';
const YOUR_TRON_WALLET = 'TMitDXKKnsHKgBVENHdorV4axBou6KC5JM';

const TOKEN_CONTRACTS: Record<number, Record<string, string>> = {
  1: {
    usdt: '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase(),
  },
  56: {
    usdt: '0x55d398326f99059ff775485246999027b3197955'.toLowerCase(),
    usdc: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'.toLowerCase(),
  },
  137: {
    usdt: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'.toLowerCase(),
    usdc: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'.toLowerCase(),
  },
};

async function verifyEvmPayment(chainId: number, txHash: string, expectedAmount: number) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return { verified: false, reason: 'ETHERSCAN_API_KEY not configured' };

  const receiptUrl = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${apiKey}`;
  const receiptRes = await fetch(receiptUrl);
  const receiptData = await receiptRes.json();

  if (!receiptData.result) {
    return { verified: false, reason: 'Transaction not found on-chain. It may not exist, or the hash is wrong.' };
  }

  if (receiptData.result.status !== '0x1') {
    return { verified: false, reason: 'Transaction exists but FAILED on-chain (reverted).' };
  }

  const logs = receiptData.result.logs || [];
  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const tokenAddresses = Object.values(TOKEN_CONTRACTS[chainId] || {});

  let matched = false;
  let matchedAmountRaw: bigint | null = null;

  for (const log of logs) {
    const logAddress = (log.address || '').toLowerCase();
    if (log.topics?.[0] === transferTopic && tokenAddresses.includes(logAddress)) {
      const toAddressInLog = '0x' + log.topics[2].slice(26);
      if (toAddressInLog.toLowerCase() === YOUR_EVM_WALLET.toLowerCase()) {
        matched = true;
        matchedAmountRaw = BigInt(log.data);
      }
    }
  }

  if (!matched) {
    return { verified: false, reason: `Transaction found, but no USDT/USDC transfer TO your wallet (${YOUR_EVM_WALLET}) was detected in this transaction.` };
  }

  const actualAmount = Number(matchedAmountRaw) / 1_000_000;
  const amountMatches = Math.abs(actualAmount - expectedAmount) < 0.5;

  return {
    verified: amountMatches,
    reason: amountMatches
      ? `Confirmed: $${actualAmount.toFixed(2)} received at your wallet, matches claimed $${expectedAmount}.`
      : `MISMATCH: on-chain amount is $${actualAmount.toFixed(2)}, but user claimed $${expectedAmount}.`,
    onChainAmount: actualAmount,
  };
}

async function verifyTronPayment(txHash: string, expectedAmount: number) {
  const url = `https://apilist.tronscanapi.com/api/transaction-info?hash=${txHash}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data || !data.hash) {
    return { verified: false, reason: 'Transaction not found on Tron network. Hash may be wrong.' };
  }

  if (data.contractRet !== 'SUCCESS' && data.confirmed !== true) {
    return { verified: false, reason: 'Transaction found but not confirmed or failed.' };
  }

  const trc20Info = data.trc20TransferInfo?.[0];
  if (!trc20Info) {
    return { verified: false, reason: 'No TRC20 (USDT) transfer detected in this transaction.' };
  }

  if (trc20Info.to_address !== YOUR_TRON_WALLET) {
    return { verified: false, reason: `Transfer went to a different address (${trc20Info.to_address}), not your wallet.` };
  }

  const actualAmount = Number(trc20Info.amount_str) / Math.pow(10, trc20Info.decimals || 6);
  const amountMatches = Math.abs(actualAmount - expectedAmount) < 0.5;

  return {
    verified: amountMatches,
    reason: amountMatches
      ? `Confirmed: $${actualAmount.toFixed(2)} received at your Tron wallet, matches claimed $${expectedAmount}.`
      : `MISMATCH: on-chain amount is $${actualAmount.toFixed(2)}, but user claimed $${expectedAmount}.`,
    onChainAmount: actualAmount,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { txHash, network, amountPaid } = await req.json();

    if (!txHash || !network || amountPaid == null) {
      return NextResponse.json({ error: 'Missing txHash, network, or amountPaid' }, { status: 400 });
    }

    const networkKey = network.toLowerCase();
    let result;

    if (networkKey.includes('tron') || networkKey.includes('trc')) {
      result = await verifyTronPayment(txHash, Number(amountPaid));
    } else {
      let chainId: number | undefined;
      if (networkKey.includes('polygon')) chainId = 137;
      else if (networkKey.includes('bsc') || networkKey.includes('bep20') || networkKey.includes('bnb')) chainId = 56;
      else if (networkKey.includes('eth') || networkKey.includes('erc20')) chainId = 1;

      if (!chainId) {
        return NextResponse.json({ error: `Unknown network: ${network}` }, { status: 400 });
      }
      result = await verifyEvmPayment(chainId, txHash, Number(amountPaid));
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ verified: false, reason: `Verification error: ${err.message}` }, { status: 500 });
  }
}
