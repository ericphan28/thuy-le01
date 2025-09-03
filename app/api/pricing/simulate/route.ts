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
    console.log('🔍 API Debug - Request params:', { sku, qty, price_book_id, customer_id })
    
    const result = await unifiedPricingService.calculatePrice(sku, qty, {
      price_book_id,
      customer_id: customer_id || undefined,
      include_contract_pricing: true,
      include_price_rules: true,
      include_volume_tiers: true
    })
    
    console.log('🎯 API Debug - Unified result:', result)
    
    // Convert to legacy format for compatibility
    return NextResponse.json({
      list_price: result.list_price,
      final_price: result.final_price,
      finalPrice: result.final_price, // Legacy compatibility
      applied_rule_id: result.applied_rule?.id || null,
      applied_reason: result.applied_rule?.reason || (result.pricing_source === 'contract' ? 'Contract pricing applied' : 'No rules applied'),
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
    
    // Fallback to legacy engine if unified fails
    try {
      console.log('🔄 Falling back to legacy engine...')
      const { simulatePrice } = await import('@/lib/pricing/engine')
      const legacyResult = await simulatePrice({
        price_book_id,
        sku,
        qty,
        when: new Date()
      })
      
      console.log('🎯 API Debug - Legacy result:', legacyResult)
      
      return NextResponse.json({
        ...legacyResult,
        finalPrice: legacyResult.final_price, // Legacy compatibility
        pricing_source: 'fallback_legacy',
        contract_price: null,
        breakdown: {
          original_price: legacyResult.list_price,
          contract_discount: 0,
          rule_discount: (legacyResult.list_price || 0) - (legacyResult.final_price || 0),
          volume_discount: 0,
          tax_amount: 0,
          total_amount: legacyResult.final_price || 0
        }
      })
    } catch (fallbackError) {
      console.error('Fallback pricing also failed:', fallbackError)
      return NextResponse.json({ error: 'Pricing calculation failed completely' }, { status: 500 })
    }
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

    console.log('🔍 POST API Debug - Request params:', { sku, qty, price_book_id, customer_id, when })

    const result = await unifiedPricingService.calculatePrice(sku, qty, {
      price_book_id: price_book_id || 1, // Default to price book 1
      customer_id: customer_id || undefined,
      include_contract_pricing: true,
      include_price_rules: true,
      include_volume_tiers: true,
      when: when ? new Date(when) : new Date()
    })
    
    console.log('🎯 POST API Debug - Unified result:', result)
    
    // Convert to legacy format for compatibility with existing POS
    return NextResponse.json({
      list_price: result.list_price,
      final_price: result.final_price,
      finalPrice: result.final_price, // Legacy compatibility
      applied_rule_id: result.applied_rule?.id || null,
      applied_reason: result.applied_rule?.reason || (result.pricing_source === 'contract' ? 'Contract pricing applied' : 'No rules applied'),
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
    console.error('POST Unified pricing calculation error:', error)
    
    // Fallback to legacy engine if unified fails
    try {
      console.log('🔄 POST Falling back to legacy engine...')
      const { simulatePrice } = await import('@/lib/pricing/engine')
      const { sku, qty, price_book_id = 1, when } = await request.json()
      
      const legacyResult = await simulatePrice({
        price_book_id,
        sku,
        qty,
        when: when ? new Date(when) : new Date()
      })
      
      console.log('🎯 POST API Debug - Legacy result:', legacyResult)
      
      return NextResponse.json({
        ...legacyResult,
        finalPrice: legacyResult.final_price, // Legacy compatibility
        pricing_source: 'fallback_legacy',
        contract_price: null,
        breakdown: {
          original_price: legacyResult.list_price,
          contract_discount: 0,
          rule_discount: (legacyResult.list_price || 0) - (legacyResult.final_price || 0),
          volume_discount: 0,
          tax_amount: 0,
          total_amount: legacyResult.final_price || 0
        },
        enhanced_pricing: {
          contract_price: null,
          rule_price: legacyResult.final_price,
          volume_tier_price: null,
          final_savings: (legacyResult.list_price || 0) - (legacyResult.final_price || 0),
          final_savings_percent: legacyResult.list_price > 0 ? ((legacyResult.list_price - legacyResult.final_price) / legacyResult.list_price) * 100 : 0,
          pricing_source: 'fallback_legacy'
        }
      })
    } catch (fallbackError) {
      console.error('POST Fallback pricing also failed:', fallbackError)
      return NextResponse.json({ error: 'Pricing calculation failed completely' }, { status: 500 })
    }
  }
}
