import { NextRequest, NextResponse } from 'next/server'
import { simulatePrice } from '@/lib/pricing/engine'

export async function POST(request: NextRequest) {
  try {
    const { price_book_id, sku, qty, when } = await request.json()
    
    // Validate inputs
    if (!price_book_id || !sku || !qty) {
      return NextResponse.json(
        { error: 'Missing parameters. Required: price_book_id, sku, qty' },
        { status: 400 }
      )
    }

    const result = await simulatePrice({
      price_book_id,
      sku,
      qty,
      when: when ? new Date(when) : new Date()
    })
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Legacy pricing calculation error:', error)
    return NextResponse.json({ error: 'Pricing calculation failed' }, { status: 500 })
  }
}
