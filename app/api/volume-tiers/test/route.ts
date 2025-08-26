import { NextRequest, NextResponse } from 'next/server'
import { volumeTiersService } from '@/lib/services/volume-tiers-service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action') || 'test'

    switch (action) {
      case 'test':
        return await testVolumeCalculation(searchParams)
      
      case 'examples':
        return await getExamples()
      
      case 'demo':
        return await createDemoData()
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function testVolumeCalculation(searchParams: URLSearchParams) {
  const product_id = parseInt(searchParams.get('product_id') || '1')
  const category_id = parseInt(searchParams.get('category_id') || '1')
  const quantity = parseInt(searchParams.get('quantity') || '15')
  const price = parseFloat(searchParams.get('price') || '10000')

  console.log('🧪 Testing volume calculation:', { product_id, category_id, quantity, price })

  const result = await volumeTiersService.calculateVolumePrice(
    product_id,
    category_id,
    quantity,
    price
  )

  return NextResponse.json({
    success: true,
    test_params: { product_id, category_id, quantity, price },
    result: result ? {
      tier_info: {
        scope: result.tier.scope,
        min_qty: result.tier.min_qty,
        discount_percent: result.tier.discount_percent,
        discount_amount: result.tier.discount_amount,
        notes: result.tier.notes
      },
      pricing: {
        original_price: result.original_price,
        discounted_price: result.discounted_price,
        savings: result.savings,
        savings_percent: result.savings_percent
      }
    } : null,
    message: result ? 'Volume tier applied successfully!' : 'No matching volume tier found'
  })
}

async function getExamples() {
  const examples = [
    {
      product: "Paracetamol 500mg",
      base_price: 5000,
      scenarios: [
        { quantity: 5, expected: "No discount" },
        { quantity: 15, expected: "5% discount" },
        { quantity: 75, expected: "10% discount" },
        { quantity: 150, expected: "15% discount" }
      ]
    },
    {
      product: "Vitamin C 1000mg", 
      base_price: 15000,
      scenarios: [
        { quantity: 3, expected: "No discount" },
        { quantity: 8, expected: "8% discount" },
        { quantity: 25, expected: "12% discount" }
      ]
    }
  ]

  return NextResponse.json({
    success: true,
    examples,
    note: "These are example scenarios for volume tier testing"
  })
}

async function createDemoData() {
  try {
    console.log('🏗️ Creating demo volume tiers...')
    
    const demoTiers = [
      {
        scope: 'sku' as const,
        product_id: 1,
        min_qty: 10,
        max_qty: 49,
        discount_percent: 5,
        notes: 'Demo: Mua sỉ nhỏ - Giảm 5%'
      },
      {
        scope: 'sku' as const,
        product_id: 1,
        min_qty: 50,
        max_qty: 99,
        discount_percent: 10,
        notes: 'Demo: Mua sỉ vừa - Giảm 10%'
      },
      {
        scope: 'sku' as const,
        product_id: 1,
        min_qty: 100,
        discount_percent: 15,
        notes: 'Demo: Mua sỉ lớn - Giảm 15%'
      }
    ]

    const createdTiers = []
    for (const tierData of demoTiers) {
      const tier = await volumeTiersService.createTier({
        ...tierData,
        category_id: undefined,
        discount_amount: undefined,
        effective_from: undefined,
        effective_to: undefined,
        is_active: true
      })
      if (tier) createdTiers.push(tier)
    }

    return NextResponse.json({
      success: true,
      created_tiers: createdTiers.length,
      tiers: createdTiers,
      message: `Successfully created ${createdTiers.length} demo volume tiers!`
    })
  } catch (error) {
    console.error('Demo creation failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create demo data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, ...data } = body

    switch (action) {
      case 'create_tier':
        const tier = await volumeTiersService.createTier(data)
        return NextResponse.json({ success: true, tier })
      
      case 'calculate_price':
        const result = await volumeTiersService.calculateVolumePrice(
          data.product_id,
          data.category_id,
          data.quantity,
          data.price
        )
        return NextResponse.json({ success: true, result })
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('POST API Error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
