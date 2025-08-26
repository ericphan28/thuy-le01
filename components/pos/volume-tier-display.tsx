'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from "@/components/ui/badge"
import { volumeTiersService, type VolumeTierMatch } from '@/lib/services/volume-tiers-service'
import type { CartItem } from '@/lib/types/pos'

interface VolumeTierDisplayProps {
  cartItem: CartItem
  onVolumeDiscountApplied?: (item: CartItem, tierMatch: VolumeTierMatch | null) => void
}

export default function VolumeTierDisplay({ cartItem, onVolumeDiscountApplied }: VolumeTierDisplayProps) {
  const [tierMatch, setTierMatch] = useState<VolumeTierMatch | null>(null)
  const [loading, setLoading] = useState(false)
  const [availableTiers, setAvailableTiers] = useState<any[]>([])

  const checkVolumeTiers = useCallback(async () => {
    if (!cartItem.product.product_id || !cartItem.product.category_id) return
    
    setLoading(true)
    try {
      const match = await volumeTiersService.calculateVolumePrice(
        cartItem.product.product_id,
        cartItem.product.category_id,
        cartItem.quantity,
        cartItem.unit_price
      )
      
      setTierMatch(match)
      onVolumeDiscountApplied?.(cartItem, match)
    } catch (error) {
      console.error('Volume tier check failed:', error)
    }
    setLoading(false)
  }, [cartItem, onVolumeDiscountApplied])

  const loadAvailableTiers = useCallback(async () => {
    if (!cartItem.product.product_id || !cartItem.product.category_id) return
    
    try {
      const [productTiers, categoryTiers] = await Promise.all([
        volumeTiersService.getProductTiers(cartItem.product.product_id),
        volumeTiersService.getCategoryTiers(cartItem.product.category_id)
      ])
      
      const allTiers = [...productTiers, ...categoryTiers]
        .sort((a, b) => a.min_qty - b.min_qty)
      
      setAvailableTiers(allTiers)
    } catch (error) {
      console.error('Failed to load available tiers:', error)
    }
  }, [cartItem])

  useEffect(() => {
    checkVolumeTiers()
    loadAvailableTiers()
  }, [checkVolumeTiers, loadAvailableTiers])

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground">
        ⏳ Đang kiểm tra bậc số lượng...
      </div>
    )
  }

  if (!tierMatch && availableTiers.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      {/* Current Volume Tier Applied */}
      {tierMatch && (
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30 rounded p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400 border-green-200 dark:border-green-700">
                🎯 Bậc số lượng
              </Badge>
              <span className="text-sm font-medium text-green-800 dark:text-green-300">
                {tierMatch.tier.discount_percent ? 
                  `Giảm ${tierMatch.tier.discount_percent}%` : 
                  `Giảm ${tierMatch.tier.discount_amount?.toLocaleString('vi-VN')}₫`
                }
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs text-green-600 dark:text-green-400">
                Tiết kiệm: {tierMatch.savings.toLocaleString('vi-VN')}₫
              </div>
              <div className="text-xs text-muted-foreground">
                {tierMatch.savings_percent.toFixed(1)}%
              </div>
            </div>
          </div>
          
          <div className="mt-2 text-xs text-green-700 dark:text-green-300">
            ✅ Đã mua đủ {tierMatch.tier.min_qty} sản phẩm • 
            Giá mỗi sản phẩm: {tierMatch.discounted_price.toLocaleString('vi-VN')}₫
          </div>
        </div>
      )}

      {/* Available Volume Tiers Hint */}
      {!tierMatch && availableTiers.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 rounded p-2">
          <div className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
            💡 Mua thêm để được chiết khấu:
          </div>
          <div className="space-y-1">
            {availableTiers
              .filter(tier => tier.min_qty > cartItem.quantity)
              .slice(0, 2)
              .map((tier, index) => {
                const neededQty = tier.min_qty - cartItem.quantity
                const discountText = tier.discount_percent ? 
                  `${tier.discount_percent}%` : 
                  `${tier.discount_amount?.toLocaleString('vi-VN')}₫`
                
                return (
                  <div key={index} className="text-xs text-blue-700 dark:text-blue-300">
                    🎯 Mua thêm {neededQty} sản phẩm → Giảm {discountText}
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Volume Tiers Progress */}
      {availableTiers.length > 0 && (
        <div className="bg-muted/30 rounded p-2">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            📊 Thang bậc số lượng:
          </div>
          <div className="space-y-1">
            {availableTiers.slice(0, 4).map((tier, index) => {
              const isActive = cartItem.quantity >= tier.min_qty
              const isNext = !isActive && cartItem.quantity < tier.min_qty
              
              return (
                <div 
                  key={index} 
                  className={`flex items-center justify-between text-xs p-1 rounded ${
                    isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                    isNext ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' :
                    'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  }`}
                >
                  <span>
                    {tier.min_qty}+ sản phẩm
                  </span>
                  <span className="font-medium">
                    {tier.discount_percent ? 
                      `-${tier.discount_percent}%` : 
                      `-${tier.discount_amount?.toLocaleString('vi-VN')}₫`
                    }
                    {isActive && ' ✅'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Component hiển thị tóm tắt volume discount cho toàn bộ cart
export function CartVolumeTierSummary({ 
  cart, 
  onTotalVolumeDiscountCalculated 
}: { 
  cart: CartItem[]
  onTotalVolumeDiscountCalculated?: (totalDiscount: number) => void 
}) {
  const [totalVolumeDiscount, setTotalVolumeDiscount] = useState(0)
  const [tierMatches, setTierMatches] = useState<{ [key: string]: VolumeTierMatch }>({})

  const calculateTotalVolumeDiscount = useCallback(async () => {
    let total = 0
    const matches: { [key: string]: VolumeTierMatch } = {}

    for (const item of cart) {
      if (item.product.product_id && item.product.category_id) {
        try {
          const match = await volumeTiersService.calculateVolumePrice(
            item.product.product_id,
            item.product.category_id,
            item.quantity,
            item.unit_price
          )
          
          if (match) {
            matches[item.product.product_code] = match
            total += match.savings * item.quantity
          }
        } catch (error) {
          console.error(`Volume tier calculation failed for ${item.product.product_code}:`, error)
        }
      }
    }

    setTotalVolumeDiscount(total)
    setTierMatches(matches)
    onTotalVolumeDiscountCalculated?.(total)
  }, [cart, onTotalVolumeDiscountCalculated])

  useEffect(() => {
    calculateTotalVolumeDiscount()
  }, [calculateTotalVolumeDiscount])

  if (totalVolumeDiscount === 0) {
    return null
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-green-800">
          🎯 Tổng chiết khấu bậc số lượng:
        </span>
        <span className="text-lg font-bold text-green-600">
          -{totalVolumeDiscount.toLocaleString('vi-VN')}₫
        </span>
      </div>
      
      <div className="space-y-1">
        {Object.entries(tierMatches).map(([productCode, match]) => (
          <div key={productCode} className="flex justify-between text-xs text-green-700">
            <span>{productCode}</span>
            <span>
              -{match.savings.toLocaleString('vi-VN')}₫ 
              ({match.savings_percent.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
