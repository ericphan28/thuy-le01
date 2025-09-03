import { createClient } from '@/lib/supabase/client'
import { VolumeTiersService, type VolumeTierMatch } from './volume-tiers-service'

// Enhanced Pricing Service V2 - Client-side only, sử dụng API route
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
  tax_rate?: number
  customer_id?: string
  when?: Date
  price_book_id?: number
}

export interface EnhancedPricingResult {
  // Giá cơ bản
  list_price: number
  
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
  
  // Giá cuối cùng (rule price vs volume tier price - chọn giá tốt nhất cho khách)
  final_price: number
  final_savings: number
  final_savings_percent: number
  
  // Breakdown chi tiết
  breakdown: {
    original_price: number
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
    price_rules_savings: number
    volume_tier_savings: number
  }
}

class EnhancedPricingService {
  private supabase = createClient()
  private volumeTiersService = new VolumeTiersService()

  /**
   * Kiểm tra contract pricing cho customer
   */
  async getContractPrice(
    productCode: string,
    customerId: string
  ): Promise<number | null> {
    try {
      // Get product_id first
      const { data: product, error: productError } = await this.supabase
        .from('products')
        .select('product_id')
        .eq('product_code', productCode)
        .maybeSingle()

      if (productError || !product) {
        console.error('Product lookup error:', productError)
        return null
      }

      // Check contract price by product_id and customer_id
      const { data, error } = await this.supabase
        .from('contract_prices')
        .select('net_price')
        .eq('customer_id', parseInt(customerId))
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
   * Tính giá cho một sản phẩm duy nhất
   */
  async calculateProductPrice(
    product: EnhancedProduct,
    quantity: number,
    options: EnhancedPricingOptions = {}
  ): Promise<EnhancedPricingResult> {
    const {
      include_volume_tiers = true,
      include_price_rules = true,
      tax_rate = 0,
      when = new Date()
    } = options

    const list_price = product.sale_price || product.base_price || 0
    
    // Stock validation
    const stock_status = {
      available: product.current_stock,
      requested: quantity,
      is_sufficient: product.current_stock >= quantity,
      warning: product.current_stock < quantity 
        ? `Chỉ còn ${product.current_stock} sản phẩm trong kho`
        : undefined
    }

    let rule_applied_price = list_price
    let applied_rule = undefined
    let volume_tier_price = undefined
    let volume_tier_match = undefined
    let contract_price = undefined

    // 1. Kiểm tra contract pricing trước (highest priority)
    if (options.customer_id) {
      contract_price = await this.getContractPrice(product.product_code, options.customer_id)
      if (contract_price) {
        console.log(`🏷️ Contract price found for ${product.product_code}: ${contract_price}`)
      }
    }

    // 2. Tính giá từ price rules (sử dụng existing API)
    if (include_price_rules) {
      try {
        const response = await fetch('/api/pricing/simulate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sku: product.product_code,
            qty: quantity,
            when: when?.toISOString() || new Date().toISOString(),
            customer_id: options.customer_id || null
          })
        })

        if (response.ok) {
          const apiResult = await response.json()
          if (apiResult.finalPrice && apiResult.appliedRule) {
            rule_applied_price = apiResult.finalPrice
            applied_rule = {
              id: apiResult.appliedRule.id,
              reason: apiResult.appliedRule.reason || 'Price rule applied',
              discount_amount: list_price - apiResult.finalPrice,
              discount_percent: list_price > 0 ? ((list_price - apiResult.finalPrice) / list_price) * 100 : 0
            }
          }
        }
      } catch (error) {
        console.warn('Price rules calculation failed:', error)
      }
    }

    // 3. Tính giá từ volume tiers
    if (include_volume_tiers) {
      try {
        const tierMatch = await this.volumeTiersService.calculateVolumePrice(
          product.product_id,
          product.category_id,
          quantity,
          list_price,
          when
        )

        if (tierMatch) {
          volume_tier_price = tierMatch.discounted_price
          volume_tier_match = tierMatch
        }
      } catch (error) {
        console.warn('Volume tiers calculation failed:', error)
      }
    }

    // 3. Chọn giá tốt nhất cho khách hàng
    // Xác định giá cuối cùng theo thứ tự ưu tiên:
    // 1. Contract price (highest priority)
    // 2. Best price between rules và volume tiers
    let final_price = list_price
    let pricing_source: 'price_rules' | 'volume_tiers' | 'list_price' | 'best_price' | 'contract' = 'list_price'

    if (contract_price) {
      final_price = contract_price
      pricing_source = 'contract'
    } else {
      const prices = [
        { price: list_price, source: 'list_price' as const },
        { price: rule_applied_price, source: 'price_rules' as const },
        ...(volume_tier_price ? [{ price: volume_tier_price, source: 'volume_tiers' as const }] : [])
      ]

      // Giá thấp nhất (tốt nhất cho khách)
      const bestPrice = prices.reduce((best, current) => 
        current.price < best.price ? current : best
      )

      final_price = bestPrice.price
      pricing_source = bestPrice.source === 'list_price' && final_price < list_price ? 'best_price' : bestPrice.source
    }

    const final_savings = list_price - final_price
    const final_savings_percent = list_price > 0 ? (final_savings / list_price) * 100 : 0

    // Breakdown chi tiết
    const rule_discount = list_price - rule_applied_price
    const volume_discount = volume_tier_price ? (list_price - volume_tier_price) : 0
    const contract_discount = contract_price ? (list_price - contract_price) : 0
    const tax_amount = final_price * (tax_rate / 100)
    const total_amount = final_price + tax_amount

    return {
      list_price,
      rule_applied_price,
      applied_rule,
      volume_tier_price,
      volume_tier_match,
      final_price,
      final_savings,
      final_savings_percent,
      breakdown: {
        original_price: list_price,
        rule_discount,
        volume_discount,
        tax_amount,
        total_amount
      },
      stock_status,
      pricing_source,
      calculation_timestamp: new Date()
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

      // Tích lũy savings
      if (pricingResult.applied_rule) {
        price_rules_savings += pricingResult.applied_rule.discount_amount * item.quantity
      }
      
      if (pricingResult.volume_tier_match) {
        volume_tier_savings += pricingResult.volume_tier_match.savings * item.quantity
      }
    }

    // Tính tổng
    const subtotal = items.reduce((sum, item) => 
      sum + (item.pricing_result.final_price * item.quantity), 0
    )
    
    const total_discount = items.reduce((sum, item) => 
      sum + (item.pricing_result.final_savings * item.quantity), 0
    )
    
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
        price_rules_savings,
        volume_tier_savings
      }
    }
  }

  /**
   * Lấy thông tin sản phẩm với đầy đủ dữ liệu pricing
   */
  async getProductWithPricing(productCode: string): Promise<EnhancedProduct | null> {
    const { data: product, error } = await this.supabase
      .from('products')
      .select('product_id, product_code, product_name, sale_price, base_price, current_stock, category_id')
      .eq('product_code', productCode.toUpperCase())
      .eq('is_active', true)
      .single()

    if (error || !product) {
      console.error('Product not found:', error)
      return null
    }

    return {
      product_id: product.product_id,
      product_code: product.product_code,
      product_name: product.product_name,
      sale_price: product.sale_price || 0,
      base_price: product.base_price || 0,
      current_stock: product.current_stock || 0,
      category_id: product.category_id
    }
  }

  /**
   * Tìm kiếm sản phẩm theo tên hoặc mã
   */
  async searchProducts(query: string, limit = 20): Promise<EnhancedProduct[]> {
    const { data: products, error } = await this.supabase
      .from('products')
      .select('product_id, product_code, product_name, sale_price, base_price, current_stock, category_id')
      .or(`product_code.ilike.%${query}%,product_name.ilike.%${query}%`)
      .eq('is_active', true)
      .order('product_name')
      .limit(limit)

    if (error) {
      console.error('Product search error:', error)
      return []
    }

    return products.map(product => ({
      product_id: product.product_id,
      product_code: product.product_code,
      product_name: product.product_name,
      sale_price: product.sale_price || 0,
      base_price: product.base_price || 0,
      current_stock: product.current_stock || 0,
      category_id: product.category_id
    }))
  }
}

export const enhancedPricingService = new EnhancedPricingService()
export { EnhancedPricingService }
