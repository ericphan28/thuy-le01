import { NextResponse } from 'next/server'
import { simulatePrice } from '@/lib/pricing/engine'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const price_book_id = Number(url.searchParams.get('price_book_id'))
  const sku = String(url.searchParams.get('sku') || '')
  const qty = Number(url.searchParams.get('qty') || 1)
  if (!price_book_id || !sku) {
    return NextResponse.json({ error: 'Missing price_book_id or sku' }, { status: 400 })
  }
  const result = await simulatePrice({ price_book_id, sku, qty })
  return NextResponse.json(result)
}
