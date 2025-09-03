import { Badge } from '@/components/ui/badge'
import { Percent, Tag, TrendingDown } from 'lucide-react'

interface PricingIndicatorProps {
  hasVolumeDiscounts?: boolean
  hasPriceRules?: boolean
  isOnPromotion?: boolean
  className?: string
}

export function PricingIndicator({
  hasVolumeDiscounts = false,
  hasPriceRules = false,
  isOnPromotion = false,
  className = ""
}: PricingIndicatorProps) {
  if (!hasVolumeDiscounts && !hasPriceRules && !isOnPromotion) {
    return null
  }

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {hasVolumeDiscounts && (
        <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
          <Percent className="h-3 w-3 mr-1" />
          Chiết khấu SL
        </Badge>
      )}
      
      {hasPriceRules && (
        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
          <Tag className="h-3 w-3 mr-1" />
          Quy tắc giá
        </Badge>
      )}
      
      {isOnPromotion && (
        <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
          <TrendingDown className="h-3 w-3 mr-1" />
          Khuyến mãi
        </Badge>
      )}
    </div>
  )
}

interface SmartPriceDisplayProps {
  originalPrice: number
  finalPrice: number
  quantity?: number
  showDetails?: boolean
  className?: string
}

export function SmartPriceDisplay({
  originalPrice,
  finalPrice,
  quantity = 1,
  showDetails = false,
  className = ""
}: SmartPriceDisplayProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  const hasDiscount = finalPrice < originalPrice
  const discountAmount = originalPrice - finalPrice
  const discountPercent = originalPrice > 0 ? (discountAmount / originalPrice) * 100 : 0
  
  const totalOriginal = originalPrice * quantity
  const totalFinal = finalPrice * quantity
  const totalSavings = totalOriginal - totalFinal

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Unit Price */}
      <div className="flex items-baseline gap-2">
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

      {/* Quantity Total */}
      {quantity > 1 && showDetails && (
        <div className="text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>{quantity} sản phẩm:</span>
            <div className="flex items-center gap-1">
              {totalSavings > 0 && (
                <span className="line-through text-muted-foreground">
                  {formatPrice(totalOriginal)}
                </span>
              )}
              <span className={`font-medium ${totalSavings > 0 ? 'text-green-600' : ''}`}>
                {formatPrice(totalFinal)}
              </span>
            </div>
          </div>
          {totalSavings > 0 && (
            <div className="text-green-600 text-right">
              Tiết kiệm: {formatPrice(totalSavings)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
