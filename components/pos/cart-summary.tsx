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
  isFullHeight?: boolean // New prop to control height behavior
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
  disabled = false,
  isFullHeight = false
}: CartSummaryProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  return (
    <Card className={`supabase-card ${!isFullHeight ? 'sticky top-4' : ''}`}>
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-base sm:text-lg text-foreground">
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
      <CardContent className="space-y-3 sm:space-y-4 pt-3 sm:pt-4">
        {/* Cart Items - Dynamic height based on context */}
        <div className={`${
          isFullHeight 
            ? 'max-h-none' // No height limit for full height mode (mobile drawer)
            : 'max-h-48 sm:max-h-64 md:max-h-80' // Limited height for desktop sidebar
        } overflow-y-auto space-y-2 sm:space-y-3 pr-1 sm:pr-2`}>
          <AnimatePresence>
            {cart.map((item) => (
              <motion.div
                key={item.product.product_id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="supabase-product-card p-2 sm:p-3"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground text-xs sm:text-sm line-clamp-2 mb-1">
                      {item.product.product_name}
                    </h4>
                    <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mb-1 sm:mb-2">
                      {item.product.product_code}
                    </p>
                    
                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateQuantity(item.product.product_id, item.quantity - 1)}
                        className="h-6 w-6 sm:h-7 sm:w-7 p-0 supabase-button-secondary"
                      >
                        <Minus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </Button>
                      <span className="text-xs sm:text-sm font-medium text-foreground min-w-[1.5rem] text-center">
                        {item.quantity}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateQuantity(item.product.product_id, item.quantity + 1)}
                        disabled={item.quantity >= item.product.current_stock}
                        className="h-6 w-6 sm:h-7 sm:w-7 p-0 supabase-button-secondary disabled:opacity-50"
                      >
                        <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1 sm:gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveItem(item.product.product_id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-5 w-5 sm:h-6 sm:w-6 p-0"
                    >
                      <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </Button>
                    
                    <div className="text-right">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {formatPrice(item.unit_price)} x {item.quantity}
                      </p>
                      <p className="font-semibold text-brand text-xs sm:text-sm">
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
          <div className="text-center py-8 sm:py-12 text-muted-foreground">
            <div className="p-3 sm:p-4 bg-muted rounded-2xl w-fit mx-auto mb-3 sm:mb-4">
              <ShoppingCart className="h-8 w-8 sm:h-12 sm:w-12 mx-auto opacity-30" />
            </div>
            <p className="text-base sm:text-lg font-medium text-foreground mb-2">Giỏ hàng trống</p>
            <p className="text-sm">Thêm sản phẩm để bắt đầu</p>
          </div>
        )}

        {/* Order Summary */}
        {cart.length > 0 && (
          <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-border">
            {/* VAT Selection - Compact for mobile */}
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm font-medium text-foreground">VAT (%)</Label>
              <Select value={vatRate.toString()} onValueChange={(value) => onVatChange(Number(value))}>
                <SelectTrigger className="supabase-input h-8 sm:h-10">
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

            {/* Discount Section - Responsive */}
            <div className="space-y-2 sm:space-y-3">
              <Label className="text-xs sm:text-sm font-medium text-foreground">Giảm giá</Label>
              
              {/* Discount Type Toggle */}
              <div className="grid grid-cols-2 gap-1 sm:gap-2">
                <Button
                  variant={discountType === 'percentage' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onDiscountTypeChange('percentage')}
                  className={`text-xs sm:text-sm ${discountType === 'percentage' ? 'supabase-button' : 'supabase-button-secondary'}`}
                >
                  <Percent className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  <span className="hidden sm:inline">Theo %</span>
                  <span className="sm:hidden">%</span>
                </Button>
                <Button
                  variant={discountType === 'amount' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onDiscountTypeChange('amount')}
                  className={`text-xs sm:text-sm ${discountType === 'amount' ? 'supabase-button' : 'supabase-button-secondary'}`}
                >
                  <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  <span className="hidden sm:inline">Số tiền</span>
                  <span className="sm:hidden">VND</span>
                </Button>
              </div>

              {/* Discount Value Input */}
              <div className="relative">
                <Input
                  type="number"
                  placeholder={discountType === 'percentage' ? 'Nhập %' : 'Nhập số tiền'}
                  value={discountValue || ''}
                  onChange={(e) => onDiscountValueChange(Number(e.target.value) || 0)}
                  min="0"
                  max={discountType === 'percentage' ? '100' : subtotal}
                  className="supabase-input h-8 sm:h-10 pr-12 text-sm"
                />
                <div className="absolute right-3 top-2 sm:top-2.5 text-xs text-muted-foreground font-medium">
                  {discountType === 'percentage' ? '%' : 'VND'}
                </div>
              </div>
            </div>

            {/* Calculation Summary - Responsive */}
            <div className="space-y-1.5 sm:space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground">Tạm tính:</span>
                <span className="text-foreground font-medium">{formatPrice(subtotal)}</span>
              </div>
              
              {discountAmount > 0 && (
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">
                    Giảm giá ({discountType === 'percentage' ? `${discountValue}%` : 'Số tiền'}):
                  </span>
                  <span className="text-destructive font-medium">-{formatPrice(discountAmount)}</span>
                </div>
              )}
              
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground">VAT ({vatRate}%):</span>
                <span className="text-foreground font-medium">{formatPrice(tax)}</span>
              </div>
              
              <div className="flex justify-between text-base sm:text-lg font-bold pt-2 border-t border-border">
                <span className="text-foreground">Tổng cộng:</span>
                <span className="text-brand">{formatPrice(total)}</span>
              </div>
            </div>

            {/* Checkout Button */}
            <Button
              onClick={onCheckout}
              disabled={disabled || cart.length === 0}
              className="w-full supabase-button py-2 sm:py-3 text-sm sm:text-base shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              {disabled ? (
                <span className="text-xs sm:text-sm">Chọn khách hàng</span>
              ) : (
                <span>Thanh Toán</span>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
