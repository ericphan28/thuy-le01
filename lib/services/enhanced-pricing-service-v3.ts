import { createClient } from '@/lib/supabase/client'
import { VolumeTiersService, type VolumeTierMatch } from './volume-tiers-service'

// Import types only to avoid build issues
import type { UnifiedPricingResult } from './unified-pricing-service'

// Enhanced Pricing Service V3 - Now using Unified Pricing Service
export interface EnhancedProduct {
  product_id: number
  product_code: string
  product_name: string
  sale_price: number
  base_price?: number
  current_stock: number
  category_id: number
}

export interface EnhancedPricingOptions {
  include_volume_tiers?: boolean
  include_price_rules?: boolean
  include_contract_pricing?: boolean
  tax_rate?: number
  customer_id?: string
  when?: Date
  price_book_id?: number
}

export interface EnhancedPricingResult {
  // Giá cơ bản
  list_price: number
  
  // Giá từ contract pricing
  contract_price?: number
  
  // Giá từ price rules (existing engine)
  rule_applied_price: number
  applied_rule?: {
    id: number
    reason: string
    discount_amount: number
    discount_percent: number
  }
  
  // Giá từ volume tiers
  volume_tier_price?: number
  volume_tier_match?: VolumeTierMatch
  
  // Giá cuối cùng (contract > rules > volume tiers > list price)
  final_price: number
  final_savings: number
  final_savings_percent: number
  
  // Breakdown chi tiết
  breakdown: {
    original_price: number
    contract_discount: number
    rule_discount: number
    volume_discount: number
    tax_amount: number
    total_amount: number
  }
  
  // Stock validation
  stock_status: {
    available: number
    requested: number
    is_sufficient: boolean
    warning?: string
  }
  
  // Metadata
  pricing_source: 'price_rules' | 'volume_tiers' | 'list_price' | 'best_price' | 'contract'
  calculation_timestamp: Date
}

export interface CartItem {
  product: EnhancedProduct
  quantity: number
  pricing_result: EnhancedPricingResult
}

export interface CartPricing {
  items: CartItem[]
  subtotal: number
  total_discount: number
  tax_amount: number
  final_total: number
  total_savings: number
  savings_breakdown: {
    contract_savings: number
    price_rules_savings: number
    volume_tier_savings: number
  }
}

class EnhancedPricingService {
  private supabase = createClient()

  /**
   * Tính giá cho một sản phẩm duy nhất - Now using Unified Pricing Service
   */
  async calculateProductPrice(
    product: EnhancedProduct,
    quantity: number,
    options: EnhancedPricingOptions = {}
  ): Promise<EnhancedPricingResult> {
    const {
      include_volume_tiers = true,
      include_price_rules = true,
      include_contract_pricing = true,
      tax_rate = 0,
      customer_id,
      when = new Date(),
      price_book_id = 1
    } = options

    try {
      // Use Unified Pricing API for calculation
      const response = await fetch('/api/pricing/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: product.product_code,
          qty: quantity,
          customer_id,
          price_book_id,
          when: when.toISOString()
        })
      })

      if (!response.ok) {
        throw new Error(`Pricing API failed: ${response.status}`)
      }

      const unifiedResult = await response.json() as UnifiedPricingResult

      // Stock validation
      const stock_status = {
        available: product.current_stock,
        requested: quantity,
        is_sufficient: product.current_stock >= quantity,
        warning: product.current_stock < quantity ? `Chỉ còn ${product.current_stock} sản phẩm` : undefined
      }

      // Convert unified result to enhanced result format
      const enhancedResult: EnhancedPricingResult = {
        list_price: unifiedResult.list_price,
        contract_price: unifiedResult.contract_price,
        rule_applied_price: unifiedResult.rule_price || unifiedResult.list_price,
        applied_rule: unifiedResult.applied_rule,
        volume_tier_price: unifiedResult.volume_tier_price,
        volume_tier_match: unifiedResult.volume_tier_match,
        final_price: unifiedResult.final_price,
        final_savings: unifiedResult.final_savings,
        final_savings_percent: unifiedResult.final_savings_percent,
        breakdown: unifiedResult.breakdown,
        stock_status,
        pricing_source: unifiedResult.pricing_source === 'rules' ? 'price_rules' : unifiedResult.pricing_source,
        calculation_timestamp: unifiedResult.calculation_timestamp
      }

      return enhancedResult

    } catch (error) {
      console.error('Enhanced pricing calculation error:', error)
      
      // Fallback to basic pricing
      const fallbackPrice = product.sale_price || product.base_price || 0
      const tax_amount = fallbackPrice * (tax_rate / 100)
      
      return {
        list_price: fallbackPrice,
        rule_applied_price: fallbackPrice,
        final_price: fallbackPrice,
        final_savings: 0,
        final_savings_percent: 0,
        breakdown: {
          original_price: fallbackPrice,
          contract_discount: 0,
          rule_discount: 0,
          volume_discount: 0,
          tax_amount,
          total_amount: fallbackPrice + tax_amount
        },
        stock_status: {
          available: product.current_stock,
          requested: quantity,
          is_sufficient: product.current_stock >= quantity,
          warning: product.current_stock < quantity ? `Chỉ còn ${product.current_stock} sản phẩm` : undefined
        },
        pricing_source: 'list_price',
        calculation_timestamp: new Date()
      }
    }
  }

  /**
   * Tính giá cho toàn bộ giỏ hàng
   */
  async calculateCartPricing(
    cartItems: Array<{ product: EnhancedProduct; quantity: number }>,
    options: EnhancedPricingOptions = {}
  ): Promise<CartPricing> {
    const items: CartItem[] = []
    let contract_savings = 0
    let price_rules_savings = 0
    let volume_tier_savings = 0

    // Tính giá cho từng item
    for (const item of cartItems) {
      const pricingResult = await this.calculateProductPrice(
        item.product,
        item.quantity,
        options
      )

      items.push({
        product: item.product,
        quantity: item.quantity,
        pricing_result: pricingResult
      })

      // Tính savings theo từng loại
      const itemSavings = pricingResult.final_savings * item.quantity
      if (pricingResult.pricing_source === 'contract') {
        contract_savings += itemSavings
      } else if (pricingResult.pricing_source === 'price_rules') {
        price_rules_savings += itemSavings
      } else if (pricingResult.pricing_source === 'volume_tiers') {
        volume_tier_savings += itemSavings
      }
    }

    // Tính tổng
    const subtotal = items.reduce((sum, item) => 
      sum + (item.pricing_result.final_price * item.quantity), 0
    )
    
    const total_discount = contract_savings + price_rules_savings + volume_tier_savings
    const tax_amount = items.reduce((sum, item) => 
      sum + item.pricing_result.breakdown.tax_amount, 0
    )
    const final_total = subtotal + tax_amount

    return {
      items,
      subtotal,
      total_discount,
      tax_amount,
      final_total,
      total_savings: total_discount,
      savings_breakdown: {
        contract_savings,
        price_rules_savings,
        volume_tier_savings
      }
    }
  }

  /**
   * Quick price check for a single product
   */
  async quickPriceCheck(
    productCode: string,
    quantity: number = 1,
    customerId?: string
  ): Promise<{ 
    list_price: number; 
    final_price: number; 
    savings: number;
    source: string;
  }> {
    try {
      const response = await fetch('/api/pricing/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: productCode,
          qty: quantity,
          customer_id: customerId
        })
      })

      if (!response.ok) {
        throw new Error(`Pricing API failed: ${response.status}`)
      }

      const result = await response.json()

      return {
        list_price: result.list_price,
        final_price: result.final_price,
        savings: result.final_savings || ((result.list_price || 0) - (result.final_price || 0)),
        source: result.pricing_source || 'api'
      }
    } catch (error) {
      console.error('Quick price check failed:', error)
      throw error
    }
  }
}

// Export singleton instance
export { EnhancedPricingService }
