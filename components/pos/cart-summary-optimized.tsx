import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart, X, Plus, Minus, CreditCard } from 'lucide-react'
import type { CartItem } from '@/lib/types/pos'

interface CartSummaryOptimizedProps {
  cart: CartItem[]
  total: number
  onUpdateQuantity: (productId: number, quantity: number) => void
  onRemoveItem: (productId: number) => void
  onCheckout: () => void
  disabled?: boolean
  isFullHeight?: boolean
}

export function CartSummaryOptimized({ 
  cart, 
  total,
  onUpdateQuantity, 
  onRemoveItem,
  onCheckout,
  disabled = false,
  isFullHeight = false
}: CartSummaryOptimizedProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  return (
    <Card className={`supabase-card ${!isFullHeight ? 'sticky top-4' : ''}`}>
      {/* Compact Header */}
      <CardHeader className="pb-2 border-b border-border">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-brand" />
            <span className="text-sm font-medium text-foreground">Giỏ hàng</span>
          </div>
          {cart.length > 0 && (
            <Badge variant="secondary" className="bg-brand/10 text-brand text-xs px-2 py-1">
              {cart.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-3 space-y-3">
        {/* Cart Items - Super Compact */}
        <div className={`${
          isFullHeight 
            ? 'max-h-none' 
            : 'max-h-48 sm:max-h-60'
        } overflow-y-auto space-y-2`}>
          <AnimatePresence>
            {cart.map((item) => (
              <motion.div
                key={item.product.product_id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-muted/30 rounded-lg p-2"
              >
                <div className="flex items-center gap-2">
                  {/* Product Info - Compact */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground text-xs line-clamp-1 mb-1">
                      {item.product.product_name}
                    </h4>
                    
                    {/* Quantity Controls - Inline */}
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateQuantity(item.product.product_id, item.quantity - 1)}
                        className="h-5 w-5 p-0 rounded border-brand/30"
                      >
                        <Minus className="h-2.5 w-2.5" />
                      </Button>
                      <span className="text-xs font-bold text-brand min-w-[1.2rem] text-center px-1">
                        {item.quantity}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateQuantity(item.product.product_id, item.quantity + 1)}
                        disabled={item.quantity >= item.product.current_stock}
                        className="h-5 w-5 p-0 rounded border-brand/30 disabled:opacity-50"
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </Button>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        × {formatPrice(item.unit_price)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Price & Remove */}
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-xs font-semibold text-brand">
                        {formatPrice(item.line_total)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveItem(item.product.product_id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-5 w-5 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {cart.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart className="h-8 w-8 mx-auto opacity-30 mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">Giỏ hàng trống</p>
            <p className="text-xs">Thêm sản phẩm để bắt đầu</p>
          </div>
        )}

        {/* Total & Checkout - Ultra Compact */}
        {cart.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-border">
            {/* Simple Total */}
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-foreground">Tổng cộng:</span>
              <span className="text-lg font-bold text-brand">{formatPrice(total)}</span>
            </div>

            {/* Checkout Button - Prominent */}
            <Button
              onClick={onCheckout}
              disabled={disabled || cart.length === 0}
              className="w-full bg-brand hover:bg-brand/90 text-brand-foreground py-2.5 text-sm font-medium shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              {disabled ? 'Chọn khách hàng' : 'Thanh toán ngay'}
            </Button>
            
            {/* Quick Note */}
            <p className="text-[10px] text-muted-foreground text-center">
              VAT và giảm giá sẽ được tính khi thanh toán
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
