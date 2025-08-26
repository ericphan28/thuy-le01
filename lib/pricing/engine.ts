// Pricing engine tối giản dùng cho trang mô phỏng & form Smart Rules
// Nếu cần type Database có thể import, hiện chưa dùng trực tiếp.
// import type { Database } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { volumeTiersService, type VolumeTierMatch } from '@/lib/services/volume-tiers-service'

export type ActionType = 'net' | 'percent' | 'amount'
export interface PriceRule {
  id: number
  action_type: ActionType
  action_value: number
  priority: number
  min_qty?: number | null
  max_qty?: number | null
  scope: 'sku' | 'category' | 'tag' | 'all'
  target?: string | number | null
  is_active: boolean
  effective_from?: string | null
  effective_to?: string | null
}

export interface PricingContext {
  basePrice: number  // giá niêm yết (sale_price hoặc base_price)
  qty: number
  now: Date
  rules: PriceRule[]
}

export interface PricingResult {
  finalPrice: number
  appliedRule?: PriceRule
  discountAmount: number
  discountPercent: number
  reason: string
  volumeTierMatch?: VolumeTierMatch // Thông tin bậc số lượng nếu có
}

function withinDate(r: PriceRule, now: Date) {
  const fromOk = !r.effective_from || new Date(r.effective_from) <= now
  const toOk = !r.effective_to || new Date(r.effective_to) >= now
  return fromOk && toOk
}

function withinQty(r: PriceRule, qty: number) {
  const minOk = r.min_qty == null || qty >= r.min_qty
  const maxOk = r.max_qty == null || qty <= r.max_qty
  return minOk && maxOk
}

export function rankRules(rules: PriceRule[]): PriceRule[] {
  // specificity: sku > category > tag > all
  const specScore: Record<PriceRule['scope'], number> = {
    sku: 3,
    category: 2,
    tag: 1,
    all: 0
  }
  return [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    if (specScore[a.scope] !== specScore[b.scope]) return specScore[b.scope] - specScore[a.scope]
    return a.id - b.id
  })
}

export function applyRule(basePrice: number, r: PriceRule): number {
  const v = r.action_value
  switch (r.action_type) {
    case 'net':
      return Math.max(0, v)
    case 'percent':
      return Math.max(0, round2(basePrice * (1 - v / 100)))
    case 'amount':
      return Math.max(0, round2(basePrice - v))
    default:
      return basePrice
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function computePrice(ctx: PricingContext): PricingResult {
  const { basePrice, qty, now } = ctx
  const candidates = ctx.rules.filter(r =>
    r.is_active &&
    withinDate(r, now) &&
    withinQty(r, qty)
  )
  if (!candidates.length) {
    return {
      finalPrice: basePrice,
      appliedRule: undefined,
      discountAmount: 0,
      discountPercent: 0,
      reason: 'Không có quy tắc phù hợp'
    }
  }
  const ranked = rankRules(candidates)
  const winner = ranked[0]
  const finalPrice = applyRule(basePrice, winner)
  const discountAmount = round2(basePrice - finalPrice)
  const discountPercent = basePrice > 0 ? round2((discountAmount / basePrice) * 100) : 0
  return {
    finalPrice,
    appliedRule: winner,
    discountAmount,
    discountPercent,
    reason: `Áp dụng rule #${winner.id} (${winner.action_type})`
  }
}

// Helper tiện dụng cho trang mô phỏng
// Low-level helper: mô phỏng với dữ liệu đã có sẵn trong bộ nhớ
export async function simulateWithRules(opts: { basePrice: number; qty: number; rules: PriceRule[]; date?: Date }) {
  return computePrice({
    basePrice: opts.basePrice,
    qty: opts.qty,
    rules: opts.rules,
    now: opts.date || new Date()
  })
}

// High-level: mô phỏng trực tiếp từ DB theo price_book_id + sku + qty (được trang preview sử dụng)
export async function simulatePrice(opts: { price_book_id: number; sku: string; qty: number; when?: Date }) {
  const { price_book_id, sku } = opts
  const qty = Math.max(1, opts.qty || 1)
  const now = opts.when || new Date()
  const supabase = await createClient()

  // Tải sản phẩm & tất cả rule trong price book (có thể tối ưu filter sau)
  const [{ data: product }, { data: rulesData }] = await Promise.all([
    supabase.from('products').select('product_id, product_code, product_name, sale_price, base_price, category_id').eq('product_code', sku).maybeSingle(),
    supabase.from('price_rules').select('rule_id, scope, sku_code, category_id, tag, action_type, action_value, min_qty, max_qty, priority, is_active, effective_from, effective_to').eq('price_book_id', price_book_id)
  ])

  const list_price = product?.sale_price ?? product?.base_price ?? null
  if (!product || !rulesData) {
    return {
      list_price,
      final_price: list_price,
      applied_rule_id: null,
      applied_reason: 'Không tìm thấy sản phẩm hoặc rule',
    }
  }

  // Chuyển về PriceRule nội bộ
  const mapped: PriceRule[] = rulesData.map(r => ({
    id: r.rule_id,
    action_type: r.action_type as ActionType,
    action_value: Number(r.action_value) || 0,
    priority: r.priority ?? 100,
    min_qty: r.min_qty,
    max_qty: r.max_qty,
    scope: (r.scope as any) || 'all',
    target: r.scope === 'sku' ? r.sku_code : r.scope === 'category' ? r.category_id : r.scope === 'tag' ? r.tag : null,
    is_active: !!r.is_active,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
  }))

  console.log('🔍 Debug - All rules for price book:', mapped)
  console.log('🔍 Debug - Product info:', product)
  console.log('🔍 Debug - Search params:', { sku, qty, now })

  // Filter theo logic đơn giản tương tự computePrice nhưng thêm scope match
  const candidates = mapped.filter(r => {
    if (!r.is_active) return false
    if (!withinDate(r, now)) return false
    if (!withinQty(r, qty)) return false
    // scope matching
    switch (r.scope) {
      case 'sku':
        return r.target === product.product_code
      case 'category':
        return r.target === product.category_id
      case 'tag':
        // FIXED: Disable tag rules temporarily until proper tag system is implemented
        // This fixes the bug where Rule 667 (HOT tag) was incorrectly applied
        return false // Disable all tag rules to fix SP000049 pricing bug
      case 'all':
      default:
        return true
    }
  })

  // Tính giá từ price rules
  let priceRuleResult = null
  let basePrice = list_price || 0

  if (candidates.length > 0) {
    const ranked = rankRules(candidates)
    const winner = ranked[0]
    const rulePrice = applyRule(basePrice, winner)
    
    priceRuleResult = {
      applied_rule_id: winner.id,
      applied_reason: `${winner.action_type} (${winner.action_value}) priority ${winner.priority}`,
      rule_price: rulePrice
    }
    
    // Sử dụng giá từ rule làm base price cho volume tier
    basePrice = rulePrice
  }

  // Kiểm tra volume tiers
  let volumeTierMatch = null
  if (product.product_id && product.category_id) {
    try {
      volumeTierMatch = await volumeTiersService.calculateVolumePrice(
        product.product_id,
        product.category_id,
        qty,
        basePrice,
        now
      )
    } catch (error) {
      console.warn('Volume tier calculation failed:', error)
    }
  }

  // Quyết định giá cuối cùng
  let final_price = basePrice
  let applied_reason = priceRuleResult?.applied_reason || 'Giá niêm yết'

  if (volumeTierMatch) {
    final_price = volumeTierMatch.discounted_price
    applied_reason = `Bậc số lượng: ${volumeTierMatch.tier.discount_percent ? 
      `Giảm ${volumeTierMatch.tier.discount_percent}%` : 
      `Giảm ${volumeTierMatch.tier.discount_amount?.toLocaleString('vi-VN')}₫`} khi mua từ ${volumeTierMatch.tier.min_qty} sản phẩm`
    
    if (priceRuleResult) {
      applied_reason += ` (sau khi áp dụng ${priceRuleResult.applied_reason})`
    }
  }

  console.log('🎯 Debug - Final calculation:', { 
    list_price, 
    rule_price: priceRuleResult?.rule_price,
    volume_price: volumeTierMatch?.discounted_price,
    final_price 
  })

  return {
    list_price,
    final_price,
    applied_rule_id: priceRuleResult?.applied_rule_id || null,
    applied_reason,
    volume_tier_match: volumeTierMatch
  }
}
