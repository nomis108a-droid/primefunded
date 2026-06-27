import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const db = getAdminDb();
    const symbols = ['XAUUSD','BTCUSD','ETHUSD','EURUSD','GBPUSD','USDJPY'];
    const prices: Record<string, any> = {};
    await Promise.all(symbols.map(async (sym) => {
      const doc = await db.collection('livePrices').doc(sym).get();
      if (doc.exists) {
        const d = doc.data()!;
        prices[sym] = { price: d.price, bid: d.bid, ask: d.ask, updatedAt: d.updatedAt };
      }
    }));
    return NextResponse.json(prices, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}