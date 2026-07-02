import { NextResponse } from 'next/server';

/**
 * @fileOverview MT5 Update API (DEPRECATED)
 * This endpoint has been removed as the platform now uses internal Demo Nodes.
 */
export async function POST() {
  return NextResponse.json({ status: "DEPRECATED", message: "Use internal demo engine." });
}
