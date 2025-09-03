import { Badge } from '@/components/ui/badge'
import { Info, Percent, DollarSign, Tag } from 'lucide-react'
import type { PriceRule } from '@/lib/pricing/engine'
import type { VolumeTierMatch } from '@/lib/services/volume-tiers-service'

interface PriceBreakdownProps {
  originalPrice: number
  finalPrice: number
  appliedRule?: PriceRule
  volumeTierMatch?: VolumeTierMatch
  discountAmount: number
  className?: string
  showDetails?: boolean
}

interface PriceBreakdownProps {
  originalPrice: number
  finalPrice: number
  appliedRule?: PriceRule
  volumeTierMatch?: VolumeTierMatch
  discountAmount: number
  className?: string
  showDetails?: boolean
}

export function PriceBreakdown({
  originalPrice,
  finalPrice,
  appliedRule,
  volumeTierMatch,
  discountAmount,
  className = "",
  showDetails = true
}: PriceBreakdownProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  const discountPercent = originalPrice > 0 ? (discountAmount / originalPrice) * 100 : 0
  const hasDiscount = discountAmount > 0

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Price Display */}
      <div className="flex items-center gap-2">
        {hasDiscount && (
          <span className="text-sm text-muted-foreground line-through">
            {formatPrice(originalPrice)}
          </span>
        )}
        <span className={`font-semibold ${hasDiscount ? 'text-green-600' : 'text-foreground'}`}>
          {formatPrice(finalPrice)}
        </span>
        {hasDiscount && (
          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
            -{discountPercent.toFixed(1)}%
          </Badge>
        )}
      </div>

      {/* Discount Details */}
      {showDetails && hasDiscount && (
        <div className="space-y-1">
          {/* Applied Rule */}
          {appliedRule && (
            <div className="text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                <span>Rule #{appliedRule.id} - Ưu tiên: {appliedRule.priority}</span>
              </div>
              <div className="ml-4 text-xs">
                {appliedRule.action_type === 'percent' ? 'Giảm %' : 
                 appliedRule.action_type === 'amount' ? 'Giảm tiền' : 'Giá cố định'}: {appliedRule.action_value}
                {appliedRule.action_type === 'percent' ? '%' : '₫'}
              </div>
            </div>
          )}

          {/* Volume Tier */}
          {volumeTierMatch && (
            <div className="text-xs text-blue-600">
              <div className="flex items-center gap-1">
                <Percent className="h-3 w-3" />
                <span>Chiết khấu số lượng: {volumeTierMatch.tier.min_qty}+ sản phẩm</span>
              </div>
              <div className="ml-4 text-xs">
                Giảm: {volumeTierMatch.tier.discount_percent ? 
                  `${volumeTierMatch.tier.discount_percent}%` :
                  formatPrice(volumeTierMatch.tier.discount_amount || 0)
                }
              </div>
            </div>
          )}

          {/* Savings Amount */}
          <div className="flex items-center gap-1 text-xs text-green-600">
            <DollarSign className="h-3 w-3" />
            <span>Tiết kiệm: {formatPrice(discountAmount)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

interface CartItemPriceDisplayProps {
  originalPrice: number
  finalPrice: number
  quantity: number
  appliedRule?: PriceRule
  volumeTierMatch?: VolumeTierMatch
  className?: string
}

export function CartItemPriceDisplay({
  originalPrice,
  finalPrice,
  quantity,
  appliedRule,
  volumeTierMatch,
  className = ""
}: CartItemPriceDisplayProps) {
  const unitDiscount = originalPrice - finalPrice
  const totalOriginal = originalPrice * quantity
  const totalFinal = finalPrice * quantity
  const totalDiscount = totalOriginal - totalFinal

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Unit Price */}
      <div className="text-sm">
        <PriceBreakdown
          originalPrice={originalPrice}
          finalPrice={finalPrice}
          appliedRule={appliedRule}
          volumeTierMatch={volumeTierMatch}
          discountAmount={unitDiscount}
          showDetails={false}
        />
      </div>

      {/* Total Price for Quantity */}
      {quantity > 1 && (
        <div className="text-xs text-muted-foreground border-t pt-1">
          <div className="flex justify-between">
            <span>Tổng ({quantity} sản phẩm):</span>
            <div className="flex items-center gap-1">
              {totalDiscount > 0 && (
                <span className="line-through text-muted-foreground">
                  {formatPrice(totalOriginal)}
                </span>
              )}
              <span className={`font-medium ${totalDiscount > 0 ? 'text-green-600' : ''}`}>
                {formatPrice(totalFinal)}
              </span>
            </div>
          </div>
          {totalDiscount > 0 && (
            <div className="text-green-600 text-right">
              Tiết kiệm: {formatPrice(totalDiscount)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
