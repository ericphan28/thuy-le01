import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart, X, Plus, Minus, CreditCard, Percent, DollarSign } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CartItem } from '@/lib/types/pos'

interface CartSummaryProps {
  cart: CartItem[]
  subtotal: number
  discountAmount: number
  tax: number
  total: number
  vatRate: number
  discountType: 'percentage' | 'amount'
  discountValue: number
  onUpdateQuantity: (productId: number, quantity: number) => void
  onRemoveItem: (productId: number) => void
  onVatChange: (rate: number) => void
  onDiscountTypeChange: (type: 'percentage' | 'amount') => void
  onDiscountValueChange: (value: number) => void
  onCheckout: () => void
  disabled?: boolean
}

export function CartSummary({ 
  cart, 
  subtotal,
  discountAmount,
  tax,
  total,
  vatRate,
  discountType,
  discountValue,
  onUpdateQuantity, 
  onRemoveItem,
  onVatChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onCheckout,
  disabled = false
}: CartSummaryProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

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
          <div className="space-y-4 pt-4 border-t border-border">
            {/* VAT Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">VAT (%)</Label>
              <Select value={vatRate.toString()} onValueChange={(value) => onVatChange(Number(value))}>
                <SelectTrigger className="supabase-input">
                  <SelectValue placeholder="Chọn VAT" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0% - Không VAT</SelectItem>
                  <SelectItem value="5">5% - VAT giảm</SelectItem>
                  <SelectItem value="8">8% - VAT trung bình</SelectItem>
                  <SelectItem value="10">10% - VAT tiêu chuẩn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Discount Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground">Giảm giá</Label>
              
              {/* Discount Type Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={discountType === 'percentage' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onDiscountTypeChange('percentage')}
                  className={`flex-1 ${discountType === 'percentage' ? 'supabase-button' : 'supabase-button-secondary'}`}
                >
                  <Percent className="h-4 w-4 mr-1" />
                  Theo %
                </Button>
                <Button
                  variant={discountType === 'amount' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onDiscountTypeChange('amount')}
                  className={`flex-1 ${discountType === 'amount' ? 'supabase-button' : 'supabase-button-secondary'}`}
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Theo số tiền
                </Button>
              </div>

              {/* Discount Value Input */}
              <div className="relative">
                <Input
                  type="number"
                  placeholder={discountType === 'percentage' ? 'Nhập % giảm' : 'Nhập số tiền giảm'}
                  value={discountValue || ''}
                  onChange={(e) => onDiscountValueChange(Number(e.target.value) || 0)}
                  min="0"
                  max={discountType === 'percentage' ? '100' : subtotal}
                  className="supabase-input pr-12"
                />
                <div className="absolute right-3 top-2.5 text-xs text-muted-foreground font-medium">
                  {discountType === 'percentage' ? '%' : 'VND'}
                </div>
              </div>
            </div>

            {/* Calculation Summary */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tạm tính:</span>
                <span className="text-foreground font-medium">{formatPrice(subtotal)}</span>
              </div>
              
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Giảm giá ({discountType === 'percentage' ? `${discountValue}%` : 'Số tiền'}):
                  </span>
                  <span className="text-destructive font-medium">-{formatPrice(discountAmount)}</span>
                </div>
              )}
              
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT ({vatRate}%):</span>
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
