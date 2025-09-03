import { createClient } from '@/lib/supabase/client'
import { computePrice, type PriceRule, type PricingContext, type PricingResult } from '@/lib/pricing/client-engine'
import { volumeTiersService, type VolumeTierMatch } from '@/lib/services/volume-tiers-service'
import type { Product, Customer } from '@/lib/types/pos'

export interface EnhancedCustomer extends Customer {
  customer_type?: 'individual' | 'business' | 'vip'
  price_book_id?: number | null
}

export interface CartItem {
  product: Product
  quantity: number
  unit_price: number // Giá đã tính toán
  subtotal: number // quantity * unit_price
  applied_discount?: number
  applied_rule?: PriceRule
  volume_tier_match?: VolumeTierMatch
}

export interface CartPricing {
  items: CartItem[]
  subtotal: number
  total_discount: number
  tax_amount: number
  final_total: number
  applied_rules: PriceRule[]
  volume_tier_savings: number
}

export interface PricingCalculationOptions {
  customer?: EnhancedCustomer | null
  price_book_id?: number | null
  include_volume_tiers?: boolean
  tax_rate?: number
}

class EnhancedPricingService {
  private supabase = createClient()

  /**
   * Tính giá cho một sản phẩm duy nhất
   */
  async calculateProductPrice(
    product: Product, 
    quantity: number, 
    options: PricingCalculationOptions = {}
  ): Promise<PricingResult> {
    try {
      // 1. Lấy price rules áp dụng cho sản phẩm
      const rules = await this.getPriceRules(product, options.price_book_id)
      
      // 2. Tạo pricing context
      const context: PricingContext = {
        basePrice: product.sale_price,
        qty: quantity,
        now: new Date(),
        rules
      }

      // 3. Tính giá cơ bản với rules
      const baseResult = computePrice(context)

      // 4. Kiểm tra volume tier discounts nếu được enable
      if (options.include_volume_tiers !== false) {
        const volumeTierMatch = await volumeTiersService.findBestMatch(
          product.product_id,
          product.category_id,
          quantity
        )

        if (volumeTierMatch) {
          const volumeTierPrice = this.applyVolumeTierDiscount(
            baseResult.finalPrice,
            volumeTierMatch
          )
          
          // So sánh và chọn giá tốt nhất
          if (volumeTierPrice < baseResult.finalPrice) {
            return {
              ...baseResult,
              finalPrice: volumeTierPrice,
              volumeTierMatch,
              reason: `Volume tier: ${volumeTierMatch.tier.min_qty}+ units`
            }
          }
        }
      }

      return baseResult
    } catch (error) {
      console.error('Error calculating product price:', error)
      // Fallback to base price
      return {
        finalPrice: product.sale_price,
        discountAmount: 0,
        discountPercent: 0,
        reason: 'Error in calculation, using base price'
      }
    }
  }

  /**
   * Tính giá cho toàn bộ giỏ hàng
   */
  async calculateCartPricing(
    cartItems: { product: Product; quantity: number }[],
    options: PricingCalculationOptions = {}
  ): Promise<CartPricing> {
    try {
      const processedItems: CartItem[] = []
      let totalDiscount = 0
      const appliedRules: PriceRule[] = []
      let volumeTierSavings = 0

      // Tính giá từng item
      for (const item of cartItems) {
        const pricingResult = await this.calculateProductPrice(
          item.product,
          item.quantity,
          options
        )

        const originalPrice = item.product.sale_price * item.quantity
        const finalPrice = pricingResult.finalPrice * item.quantity
        const itemDiscount = originalPrice - finalPrice

        totalDiscount += itemDiscount

        if (pricingResult.appliedRule) {
          appliedRules.push(pricingResult.appliedRule)
        }

        if (pricingResult.volumeTierMatch) {
          volumeTierSavings += itemDiscount
        }

        processedItems.push({
          product: item.product,
          quantity: item.quantity,
          unit_price: pricingResult.finalPrice,
          subtotal: finalPrice,
          applied_discount: itemDiscount,
          applied_rule: pricingResult.appliedRule,
          volume_tier_match: pricingResult.volumeTierMatch
        })
      }

      const subtotal = processedItems.reduce((sum, item) => sum + item.subtotal, 0)
      const taxAmount = subtotal * (options.tax_rate || 0) / 100
      const finalTotal = subtotal + taxAmount

      return {
        items: processedItems,
        subtotal,
        total_discount: totalDiscount,
        tax_amount: taxAmount,
        final_total: finalTotal,
        applied_rules: appliedRules,
        volume_tier_savings: volumeTierSavings
      }
    } catch (error) {
      console.error('Error calculating cart pricing:', error)
      throw error
    }
  }

  /**
   * Lấy price rules áp dụng cho sản phẩm
   */
  private async getPriceRules(
    product: Product, 
    priceBookId?: number | null
  ): Promise<PriceRule[]> {
    try {
      // Tạo array các conditions để OR
      const conditions = ['scope.eq.all']
      
      if (product.product_code) {
        conditions.push(`and(scope.eq.sku,sku_code.eq.${product.product_code})`)
      }
      
      if (product.category_id) {
        conditions.push(`and(scope.eq.category,category_id.eq.${product.category_id})`)
      }

      let query = this.supabase
        .from('price_rules')
        .select('*')
        .eq('is_active', true)
        .or(conditions.join(','))

      // Filter by price book if specified
      if (priceBookId) {
        query = query.eq('price_book_id', priceBookId)
      }

      const { data, error } = await query.order('priority', { ascending: false })

      if (error) {
        console.error('Supabase query error:', error)
        throw error
      }

      console.log(`Found ${data?.length || 0} price rules for product ${product.product_code}`)

      return data?.map(rule => ({
        id: rule.rule_id,
        action_type: rule.action_type,
        action_value: rule.action_value,
        priority: rule.priority || 0,
        min_qty: rule.min_qty,
        max_qty: rule.max_qty,
        scope: rule.scope,
        target: rule.sku_code || rule.category_id || 'all',
        is_active: rule.is_active,
        effective_from: rule.effective_from,
        effective_to: rule.effective_to
      })) || []
    } catch (error) {
      console.error('Error fetching price rules:', error)
      return []
    }
  }

  /**
   * Áp dụng volume tier discount
   */
  private applyVolumeTierDiscount(
    basePrice: number, 
    volumeTierMatch: VolumeTierMatch
  ): number {
    const tier = volumeTierMatch.tier

    if (tier.discount_percent) {
      return basePrice * (1 - tier.discount_percent / 100)
    } else if (tier.discount_amount) {
      return Math.max(0, basePrice - tier.discount_amount)
    }

    return basePrice
  }

  /**
   * Kiểm tra stock availability cho cart
   */
  async validateCartStock(
    cartItems: { product: Product; quantity: number }[]
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    for (const item of cartItems) {
      if (item.quantity > item.product.current_stock) {
        errors.push(
          `${item.product.product_name}: Chỉ còn ${item.product.current_stock} sản phẩm`
        )
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Format giá tiền theo định dạng VND
   */
  formatPrice(price: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  /**
   * Lấy thông tin customer pricing
   */
  async getCustomerPricing(customerId: number): Promise<EnhancedCustomer | null> {
    try {
      const { data, error } = await this.supabase
        .from('customers')
        .select('customer_id, customer_code, customer_name, current_debt, debt_limit')
        .eq('customer_id', customerId)
        .single()

      if (error) throw error
      
      // Return with default values for enhanced properties
      return {
        ...data,
        customer_type: 'individual',
        price_book_id: null
      }
    } catch (error) {
      console.error('Error fetching customer pricing:', error)
      return null
    }
  }
}

export const enhancedPricingService = new EnhancedPricingService()
