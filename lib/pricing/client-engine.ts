// Client-side pricing engine - không sử dụng server-side dependencies
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
  const discountAmount = basePrice - finalPrice
  const discountPercent = basePrice > 0 ? (discountAmount / basePrice) * 100 : 0

  let reason = `Rule #${winner.id} (${winner.action_type})`
  if (winner.action_type === 'percent') {
    reason += ` -${winner.action_value}%`
  } else if (winner.action_type === 'amount') {
    reason += ` -${winner.action_value.toLocaleString()}₫`
  } else {
    reason += ` = ${winner.action_value.toLocaleString()}₫`
  }

  return {
    finalPrice,
    appliedRule: winner,
    discountAmount,
    discountPercent,
    reason
  }
}

// Simulation function for client-side use without database dependency
export function simulatePrice(
  basePrice: number,
  qty: number,
  rules: PriceRule[]
): PricingResult {
  const ctx: PricingContext = {
    basePrice,
    qty,
    now: new Date(),
    rules
  }
  return computePrice(ctx)
}
