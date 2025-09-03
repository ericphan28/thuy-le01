import { NextRequest, NextResponse } from 'next/server'
import { unifiedPricingService } from '@/lib/services/unified-pricing-service'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const price_book_id = Number(url.searchParams.get('price_book_id'))
  const sku = String(url.searchParams.get('sku') || '')
  const qty = Number(url.searchParams.get('qty') || 1)
  const customer_id = url.searchParams.get('customer_id')
  
  if (!price_book_id || !sku) {
    return NextResponse.json({ error: 'Missing price_book_id or sku' }, { status: 400 })
  }
  
  try {
    const result = await unifiedPricingService.calculatePrice(sku, qty, {
      price_book_id,
      customer_id: customer_id || undefined,
      include_contract_pricing: true,
      include_price_rules: true,
      include_volume_tiers: true
    })
    
    // Convert to legacy format for compatibility
    return NextResponse.json({
      list_price: result.list_price,
      final_price: result.final_price,
      finalPrice: result.final_price, // Legacy compatibility
      applied_rule_id: result.applied_rule?.id || null,
      applied_reason: result.applied_rule?.reason || 'No rules applied',
      appliedRule: result.applied_rule ? {
        id: result.applied_rule.id,
        reason: result.applied_rule.reason,
        discount_amount: result.applied_rule.discount_amount,
        discount_percent: result.applied_rule.discount_percent
      } : null,
      volume_tier_match: result.volume_tier_match,
      pricing_source: result.pricing_source,
      contract_price: result.contract_price,
      breakdown: result.breakdown
    })
  } catch (error) {
    console.error('Unified pricing calculation error:', error)
    return NextResponse.json({ error: 'Pricing calculation failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sku, qty, when, customer_id, price_book_id } = await request.json()
    
    // Validate inputs
    if (!sku || !qty || qty <= 0) {
      return NextResponse.json(
        { error: 'Missing or invalid parameters. Required: sku, qty' },
        { status: 400 }
      )
    }

    const result = await unifiedPricingService.calculatePrice(sku, qty, {
      price_book_id: price_book_id || 1, // Default to price book 1
      customer_id: customer_id || undefined,
      include_contract_pricing: true,
      include_price_rules: true,
      include_volume_tiers: true,
      when: when ? new Date(when) : new Date()
    })
    
    // Convert to legacy format for compatibility with existing POS
    return NextResponse.json({
      list_price: result.list_price,
      final_price: result.final_price,
      finalPrice: result.final_price, // Legacy compatibility
      applied_rule_id: result.applied_rule?.id || null,
      applied_reason: result.applied_rule?.reason || 'No rules applied',
      appliedRule: result.applied_rule ? {
        id: result.applied_rule.id,
        reason: result.applied_rule.reason,
        discount_amount: result.applied_rule.discount_amount,
        discount_percent: result.applied_rule.discount_percent
      } : null,
      volume_tier_match: result.volume_tier_match,
      pricing_source: result.pricing_source,
      contract_price: result.contract_price,
      breakdown: result.breakdown,
      
      // Enhanced info
      enhanced_pricing: {
        contract_price: result.contract_price,
        rule_price: result.rule_price,
        volume_tier_price: result.volume_tier_price,
        final_savings: result.final_savings,
        final_savings_percent: result.final_savings_percent,
        pricing_source: result.pricing_source
      }
    })
  } catch (error) {
    console.error('Unified pricing calculation error:', error)
    return NextResponse.json({ error: 'Pricing calculation failed' }, { status: 500 })
  }
}
