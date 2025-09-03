import { createClient } from '@/lib/supabase/client'
import { volumeTiersService, type VolumeTierMatch } from './volume-tiers-service'

/**
 * UNIFIED PRICING SERVICE
 * 
 * Service tổng hợp tất cả các loại pricing:
 * 1. Contract Pricing (priority cao nhất)
 * 2. Price Rules (từ existing engine)
 * 3. Volume Tiers
 * 4. List Price (fallback)
 * 
 * Được sử dụng bởi:
 * - POS System (Enhanced Pricing)
 * - Pricing Simulator
 * - API endpoints
 */

export interface UnifiedPricingOptions {
  customer_id?: string | number
  price_book_id?: number
  include_volume_tiers?: boolean
  include_price_rules?: boolean
  include_contract_pricing?: boolean
  tax_rate?: number
  when?: Date
}

export interface UnifiedPricingResult {
  // Input data
  product_code: string
  quantity: number
  customer_id?: string | number
  
  // Pricing breakdown
  list_price: number
  contract_price?: number
  rule_price?: number
  volume_tier_price?: number
  
  // Final result
  final_price: number
  final_savings: number
  final_savings_percent: number
  
  // Source tracking
  pricing_source: 'contract' | 'rules' | 'volume_tiers' | 'list_price'
  applied_rule?: {
    id: number
    reason: string
    discount_amount: number
    discount_percent: number
  }
  volume_tier_match?: VolumeTierMatch
  
  // Additional info
  breakdown: {
    original_price: number
    contract_discount: number
    rule_discount: number
    volume_discount: number
    tax_amount: number
    total_amount: number
  }
  
  calculation_timestamp: Date
}

export class UnifiedPricingService {
  private supabase = createClient()

  /**
   * Main pricing calculation method
   */
  async calculatePrice(
    productCode: string,
    quantity: number,
    options: UnifiedPricingOptions = {}
  ): Promise<UnifiedPricingResult> {
    const {
      customer_id,
      price_book_id = 1, // Default price book
      include_volume_tiers = true,
      include_price_rules = true,
      include_contract_pricing = true,
      tax_rate = 0,
      when = new Date()
    } = options

    // Get product info
    const product = await this.getProductInfo(productCode)
    if (!product) {
      throw new Error(`Product ${productCode} not found`)
    }

    const list_price = product.sale_price
    let final_price = list_price
    let pricing_source: UnifiedPricingResult['pricing_source'] = 'list_price'
    
    // Results from different pricing methods
    let contract_price: number | undefined
    let rule_price: number | undefined
    let volume_tier_price: number | undefined
    let applied_rule: UnifiedPricingResult['applied_rule']
    let volume_tier_match: VolumeTierMatch | undefined

    // 1. Contract Pricing (Highest Priority)
    if (include_contract_pricing && customer_id) {
      const contractResult = await this.getContractPrice(productCode, customer_id)
      if (contractResult !== null) {
        contract_price = contractResult
        final_price = contract_price
        pricing_source = 'contract'
      }
    }

    // 2. Price Rules (if no contract or contract allows rules)
    if (include_price_rules && !contract_price) {
      const ruleResult = await this.getExistingEnginePrice(
        productCode, 
        quantity, 
        price_book_id, 
        when
      )
      if (ruleResult?.final_price && ruleResult.final_price < final_price) {
        rule_price = ruleResult.final_price
        final_price = rule_price
        pricing_source = 'rules'
        
        if (ruleResult.applied_rule_id) {
          applied_rule = {
            id: ruleResult.applied_rule_id,
            reason: ruleResult.applied_reason || 'Price rule applied',
            discount_amount: list_price - ruleResult.final_price,
            discount_percent: ((list_price - ruleResult.final_price) / list_price) * 100
          }
        }
      }
    }

    // 3. Volume Tiers (if no contract and better than rules)
    if (include_volume_tiers && !contract_price) {
      try {
        const tierMatch = await volumeTiersService.calculateVolumePrice(
          product.product_id,
          product.category_id,
          quantity,
          list_price,
          when
        )

        if (tierMatch?.discounted_price && tierMatch.discounted_price < final_price) {
          volume_tier_price = tierMatch.discounted_price
          final_price = volume_tier_price
          pricing_source = 'volume_tiers'
          volume_tier_match = tierMatch
        }
      } catch (error) {
        console.warn('Volume tiers calculation failed:', error)
      }
    }

    // Calculate breakdown
    const contract_discount = contract_price ? (list_price - contract_price) : 0
    const rule_discount = rule_price ? (list_price - rule_price) : 0
    const volume_discount = volume_tier_price ? (list_price - volume_tier_price) : 0
    const final_savings = list_price - final_price
    const final_savings_percent = list_price > 0 ? (final_savings / list_price) * 100 : 0
    const tax_amount = final_price * (tax_rate / 100)
    const total_amount = final_price + tax_amount

    return {
      product_code: productCode,
      quantity,
      customer_id,
      list_price,
      contract_price,
      rule_price,
      volume_tier_price,
      final_price,
      final_savings,
      final_savings_percent,
      pricing_source,
      applied_rule,
      volume_tier_match,
      breakdown: {
        original_price: list_price,
        contract_discount,
        rule_discount,
        volume_discount,
        tax_amount,
        total_amount
      },
      calculation_timestamp: new Date()
    }
  }

  /**
   * Get contract price for customer + product
   */
  private async getContractPrice(
    productCode: string,
    customerId: string | number
  ): Promise<number | null> {
    try {
      // Get product_id first
      const { data: product, error: productError } = await this.supabase
        .from('products')
        .select('product_id')
        .eq('product_code', productCode)
        .maybeSingle()

      if (productError || !product) {
        return null
      }

      // Check contract price by product_id and customer_id
      const { data, error } = await this.supabase
        .from('contract_prices')
        .select('net_price')
        .eq('customer_id', Number(customerId))
        .eq('product_id', product.product_id)
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        console.error('Contract price lookup error:', error)
        return null
      }

      return data?.net_price || null
    } catch (error) {
      console.error('Contract price service error:', error)
      return null
    }
  }

  /**
   * Get pricing from existing engine via API call or direct call
   */
  private async getExistingEnginePrice(
    productCode: string,
    quantity: number,
    priceBookId: number,
    when: Date
  ) {
    try {
      // For server-side use, import and call simulatePrice directly
      if (typeof window === 'undefined') {
        // Server-side: dynamic import to avoid build issues
        const { simulatePrice } = await import('@/lib/pricing/engine')
        return await simulatePrice({
          price_book_id: priceBookId,
          sku: productCode,
          qty: quantity,
          when: when
        })
      } else {
        // Client-side: use API call
        const response = await fetch('/api/pricing/simulate-legacy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            price_book_id: priceBookId,
            sku: productCode,
            qty: quantity,
            when: when.toISOString()
          })
        })

        if (response.ok) {
          return await response.json()
        } else {
          console.warn('Legacy pricing API failed:', response.status)
          return null
        }
      }
    } catch (error) {
      console.warn('Existing engine pricing failed:', error)
      return null
    }
  }

  /**
   * Get product information
   */
  private async getProductInfo(productCode: string) {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('product_id, product_code, product_name, sale_price, base_price, category_id')
        .eq('product_code', productCode)
        .maybeSingle()

      if (error) {
        console.error('Product lookup error:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Product service error:', error)
      return null
    }
  }

  /**
   * Bulk pricing calculation for cart/multiple items
   */
  async calculateBulkPricing(
    items: Array<{ productCode: string; quantity: number }>,
    options: UnifiedPricingOptions = {}
  ): Promise<{
    items: Array<UnifiedPricingResult>
    totals: {
      subtotal: number
      total_savings: number
      total_tax: number
      final_total: number
    }
  }> {
    const results: UnifiedPricingResult[] = []
    
    for (const item of items) {
      const result = await this.calculatePrice(
        item.productCode,
        item.quantity,
        options
      )
      results.push(result)
    }

    // Calculate totals
    const subtotal = results.reduce((sum, item) => sum + (item.final_price * item.quantity), 0)
    const total_savings = results.reduce((sum, item) => sum + (item.final_savings * item.quantity), 0)
    const total_tax = results.reduce((sum, item) => sum + item.breakdown.tax_amount, 0)
    const final_total = subtotal + total_tax

    return {
      items: results,
      totals: {
        subtotal,
        total_savings,
        total_tax,
        final_total
      }
    }
  }
}

// Export singleton instance
export const unifiedPricingService = new UnifiedPricingService()
