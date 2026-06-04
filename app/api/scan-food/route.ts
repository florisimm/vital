import { NextResponse } from 'next/server'

// Replaced by barcode-based Open Food Facts lookup via /api/barcode-lookup.
export async function POST() {
  return NextResponse.json(
    { error: 'Endpoint removed. Use /api/barcode-lookup?barcode=<code> instead.' },
    { status: 410 },
  )
}
