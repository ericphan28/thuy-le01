// Volume Tiers Service - Quản lý bậc số lượng
import { createClient } from '@/lib/supabase/client'

export interface VolumeTier {
  tier_id: number
  scope: 'sku' | 'category'
  product_id?: number
  category_id?: number
  min_qty: number
  discount_percent?: number
  discount_amount?: number
  effective_from?: Date
  effective_to?: Date
  is_active: boolean
  notes?: string
  product?: {
    product_code: string
    product_name: string
    sale_price: number
  }
  category?: {
    category_name: string
  }
}

export interface VolumeTierMatch {
  tier: VolumeTier
  original_price: number
  discounted_price: number
  savings: number
  savings_percent: number
}

export class VolumeTiersService {
  private supabase = createClient()

  /**
   * Tìm bậc số lượng phù hợp cho sản phẩm/số lượng
   */
  async findMatchingTiers(
    product_id: number, 
    category_id: number, 
    quantity: number,
    when: Date = new Date()
  ): Promise<VolumeTier[]> {
    // First get matching volume tiers
    const { data: baseTiers, error: tierError } = await this.supabase
      .from('volume_tiers')
      .select('*')
      .or(`and(scope.eq.sku,product_id.eq.${product_id}),and(scope.eq.category,category_id.eq.${category_id})`)
      .eq('is_active', true)
      .lte('min_qty', quantity)
      .or('max_qty.is.null,max_qty.gte.' + quantity)
      .or('effective_from.is.null,effective_from.lte.' + when.toISOString())
      .or('effective_to.is.null,effective_to.gte.' + when.toISOString())
      .order('min_qty', { ascending: false })
      .limit(1)

    if (tierError || !baseTiers?.length) {
      console.warn('Volume tiers query error:', tierError)
      return []
    }

    // Manually fetch related data to avoid relationship issues
    const enrichedTiers = await Promise.all(
      baseTiers.map(async (tier) => {
        let product = null
        let category = null

        // Fetch product data if needed
        if (tier.product_id && tier.scope === 'sku') {
          const { data: productData } = await this.supabase
            .from('products')
            .select('product_code, product_name, sale_price')
            .eq('product_id', tier.product_id)
            .single()
          product = productData
        }

        // Fetch category data if needed
        if (tier.category_id && tier.scope === 'category') {
          const { data: categoryData } = await this.supabase
            .from('product_categories')
            .select('category_name')
            .eq('category_id', tier.category_id)
            .single()
          category = categoryData
        }

        return {
          ...tier,
          product,
          category
        } as VolumeTier
      })
    )

    return enrichedTiers
  }

  /**
   * Tính giá sau chiết khấu bậc số lượng
   */
  async calculateVolumePrice(
    product_id: number,
    category_id: number,
    quantity: number,
    original_price: number,
    when: Date = new Date()
  ): Promise<VolumeTierMatch | null> {
    const tiers = await this.findMatchingTiers(product_id, category_id, quantity, when)
    
    if (tiers.length === 0) {
      return null
    }

    const tier = tiers[0]
    let discounted_price = original_price

    if (tier.discount_percent) {
      discounted_price = original_price * (1 - tier.discount_percent / 100)
    } else if (tier.discount_amount) {
      discounted_price = Math.max(0, original_price - tier.discount_amount)
    }

    const savings = original_price - discounted_price
    const savings_percent = original_price > 0 ? (savings / original_price) * 100 : 0

    return {
      tier,
      original_price,
      discounted_price: Math.round(discounted_price * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      savings_percent: Math.round(savings_percent * 100) / 100
    }
  }

  /**
   * Lấy tất cả bậc số lượng cho một sản phẩm
   */
  async getProductTiers(product_id: number): Promise<VolumeTier[]> {
    const { data: baseTiers, error } = await this.supabase
      .from('volume_tiers')
      .select('*')
      .eq('scope', 'sku')
      .eq('product_id', product_id)
      .eq('is_active', true)
      .order('min_qty')

    if (error || !baseTiers?.length) {
      return []
    }

    // Manually fetch product data
    const { data: productData } = await this.supabase
      .from('products')
      .select('product_code, product_name, sale_price')
      .eq('product_id', product_id)
      .single()

    return baseTiers.map(tier => ({
      ...tier,
      product: productData
    })) as VolumeTier[]
  }

  /**
   * Lấy tất cả bậc số lượng cho một danh mục
   */
  async getCategoryTiers(category_id: number): Promise<VolumeTier[]> {
    const { data: baseTiers, error } = await this.supabase
      .from('volume_tiers')
      .select('*')
      .eq('scope', 'category')
      .eq('category_id', category_id)
      .eq('is_active', true)
      .order('min_qty')

    if (error || !baseTiers?.length) {
      return []
    }

    // Manually fetch category data
    const { data: categoryData } = await this.supabase
      .from('product_categories')
      .select('category_name')
      .eq('category_id', category_id)
      .single()

    return baseTiers.map(tier => ({
      ...tier,
      category: categoryData
    })) as VolumeTier[]
  }

  /**
   * Tạo bậc số lượng mới
   */
  async createTier(tier: Omit<VolumeTier, 'tier_id'>): Promise<VolumeTier | null> {
    const { data, error } = await this.supabase
      .from('volume_tiers')
      .insert(tier)
      .select('*')
      .single()

    if (error) {
      console.error('Error creating volume tier:', error)
      return null
    }

    return data
  }

  /**
   * Cập nhật bậc số lượng
   */
  async updateTier(tier_id: number, updates: Partial<VolumeTier>): Promise<boolean> {
    const { error } = await this.supabase
      .from('volume_tiers')
      .update(updates)
      .eq('tier_id', tier_id)

    return !error
  }

  /**
   * Xóa bậc số lượng
   */
  async deleteTier(tier_id: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('volume_tiers')
      .delete()
      .eq('tier_id', tier_id)

    return !error
  }

  /**
   * Tìm bậc số lượng tốt nhất cho sản phẩm
   */
  async findBestMatch(
    product_id: number, 
    category_id: number | null, 
    quantity: number
  ): Promise<VolumeTierMatch | null> {
    try {
      const tiers = await this.findMatchingTiers(product_id, category_id || 0, quantity)
      
      if (!tiers.length) {
        return null
      }

      // Get the best tier (first one since they're ordered by min_qty desc)
      const bestTier = tiers[0]
      
      // Get product price for calculation
      const { data: productData } = await this.supabase
        .from('products')
        .select('sale_price')
        .eq('product_id', product_id)
        .single()

      if (!productData) {
        return null
      }

      const originalPrice = productData.sale_price
      let discountedPrice = originalPrice

      if (bestTier.discount_percent) {
        discountedPrice = originalPrice * (1 - bestTier.discount_percent / 100)
      } else if (bestTier.discount_amount) {
        discountedPrice = Math.max(0, originalPrice - bestTier.discount_amount)
      }

      const savings = originalPrice - discountedPrice
      const savingsPercent = originalPrice > 0 ? (savings / originalPrice) * 100 : 0

      return {
        tier: bestTier,
        original_price: originalPrice,
        discounted_price: discountedPrice,
        savings,
        savings_percent: savingsPercent
      }
    } catch (error) {
      console.error('Error finding best match:', error)
      return null
    }
  }
  calculateExamples(tier: VolumeTier, base_price: number = 10000): Array<{
    quantity: number
    original_total: number
    discounted_total: number
    savings: number
    unit_price: number
  }> {
    const examples = []
    const quantities = [tier.min_qty, tier.min_qty + 5, tier.min_qty + 10]

    for (const qty of quantities) {
      const original_total = qty * base_price
      let unit_price = base_price

      if (tier.discount_percent) {
        unit_price = base_price * (1 - tier.discount_percent / 100)
      } else if (tier.discount_amount) {
        unit_price = Math.max(0, base_price - tier.discount_amount)
      }

      const discounted_total = qty * unit_price
      const savings = original_total - discounted_total

      examples.push({
        quantity: qty,
        original_total: Math.round(original_total),
        discounted_total: Math.round(discounted_total),
        savings: Math.round(savings),
        unit_price: Math.round(unit_price)
      })
    }

    return examples
  }
}

// Singleton instance
export const volumeTiersService = new VolumeTiersService()
