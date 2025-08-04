import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart, X, Plus, Minus, CreditCard } from 'lucide-react'
import type { CartItem } from '@/lib/types/pos'

interface CartSummaryProps {
  cart: CartItem[]
  onUpdateQuantity: (productId: number, quantity: number) => void
  onRemoveItem: (productId: number) => void
  onCheckout: () => void
  disabled?: boolean
}

export function CartSummary({ 
  cart, 
  onUpdateQuantity, 
  onRemoveItem, 
  onCheckout,
  disabled = false
}: CartSummaryProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0)
  const tax = subtotal * 0.1 // 10% VAT
  const total = subtotal + tax

  return (
    <Card className="supabase-card sticky top-4">
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg text-foreground">
            <div className="p-1.5 bg-brand rounded-lg">
              <ShoppingCart className="h-4 w-4 text-primary-foreground" />
            </div>
            Giỏ Hàng
          </span>
          <Badge variant="secondary" className="bg-brand/10 text-brand border-brand/20">
            {cart.length} sản phẩm
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Cart Items */}
        <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
          <AnimatePresence>
            {cart.map((item) => (
              <motion.div
                key={item.product.product_id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="supabase-product-card p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground text-sm line-clamp-2 mb-1">
                      {item.product.product_name}
                    </h4>
                    <p className="text-xs text-muted-foreground font-mono mb-2">
                      {item.product.product_code}
                    </p>
                    
                    {/* Quantity Controls */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateQuantity(item.product.product_id, item.quantity - 1)}
                        className="h-7 w-7 p-0 supabase-button-secondary"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm font-medium text-foreground min-w-[2rem] text-center">
                        {item.quantity}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateQuantity(item.product.product_id, item.quantity + 1)}
                        disabled={item.quantity >= item.product.current_stock}
                        className="h-7 w-7 p-0 supabase-button-secondary disabled:opacity-50"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveItem(item.product.product_id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {formatPrice(item.unit_price)} x {item.quantity}
                      </p>
                      <p className="font-semibold text-brand">
                        {formatPrice(item.line_total)}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {cart.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="p-4 bg-muted rounded-2xl w-fit mx-auto mb-4">
              <ShoppingCart className="h-12 w-12 mx-auto opacity-30" />
            </div>
            <p className="text-lg font-medium text-foreground mb-2">Giỏ hàng trống</p>
            <p className="text-sm">Thêm sản phẩm để bắt đầu</p>
          </div>
        )}

        {/* Order Summary */}
        {cart.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tạm tính:</span>
                <span className="text-foreground font-medium">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT (10%):</span>
                <span className="text-foreground font-medium">{formatPrice(tax)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                <span className="text-foreground">Tổng cộng:</span>
                <span className="text-brand">{formatPrice(total)}</span>
              </div>
            </div>

            {/* Checkout Button */}
            <Button
              onClick={onCheckout}
              disabled={disabled || cart.length === 0}
              className="w-full supabase-button py-3 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-5 h-5 mr-2" />
              {disabled ? 'Chọn khách hàng để thanh toán' : 'Thanh Toán'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
