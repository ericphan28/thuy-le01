"use client"

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart, X, Plus, Minus, CreditCard, AlertTriangle, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { enhancedPricingService, type CartPricing, type EnhancedCustomer } from '@/lib/services/enhanced-pricing-service'
import { CartItemPriceDisplay } from './enhanced-price-display'
import type { Product, Customer } from '@/lib/types/pos'

interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  subtotal: number
  applied_discount?: number
  applied_rule?: any
  volume_tier_match?: any
}

interface EnhancedCartSummaryProps {
  rawCartItems: { product: Product; quantity: number }[]
  selectedCustomer?: Customer | null
  vatRate: number
  onUpdateQuantity: (productId: number, quantity: number) => void
  onRemoveItem: (productId: number) => void
  onVatChange: (rate: number) => void
  onCheckout: () => void
  disabled?: boolean
  isFullHeight?: boolean
}

export function EnhancedCartSummary({ 
  rawCartItems,
  selectedCustomer,
  vatRate,
  onUpdateQuantity, 
  onRemoveItem,
  onVatChange,
  onCheckout,
  disabled = false,
  isFullHeight = false
}: EnhancedCartSummaryProps) {
  const [cartPricing, setCartPricing] = useState<CartPricing | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [stockValidation, setStockValidation] = useState<{ valid: boolean; errors: string[] }>({ valid: true, errors: [] })

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  // Recalculate pricing when cart or customer changes
  const recalculatePricing = useCallback(async () => {
    if (rawCartItems.length === 0) {
      setCartPricing(null)
      setStockValidation({ valid: true, errors: [] })
      return
    }

    setIsCalculating(true)
    try {
      // Calculate enhanced pricing
      const pricing = await enhancedPricingService.calculateCartPricing(
        rawCartItems,
        {
          customer: selectedCustomer ? {
            ...selectedCustomer,
            customer_type: 'individual',
            price_book_id: null
          } : null,
          price_book_id: null,
          include_volume_tiers: true,
          tax_rate: vatRate
        }
      )

      setCartPricing(pricing)

      // Validate stock
      const validation = await enhancedPricingService.validateCartStock(rawCartItems)
      setStockValidation(validation)

      if (!validation.valid) {
        toast.error(`Có ${validation.errors.length} sản phẩm không đủ hàng`)
      }
    } catch (error) {
      console.error('Error calculating cart pricing:', error)
      toast.error('Lỗi khi tính toán giá')
    } finally {
      setIsCalculating(false)
    }
  }, [rawCartItems, selectedCustomer, vatRate])

  useEffect(() => {
    recalculatePricing()
  }, [recalculatePricing])

  const handleQuantityChange = async (productId: number, newQuantity: number) => {
    onUpdateQuantity(productId, newQuantity)
    // Pricing will be recalculated automatically due to useEffect
  }

  const canCheckout = cartPricing && stockValidation.valid && cartPricing.items.length > 0

  return (
    <Card className="supabase-card">
      {/* Header */}
      <CardHeader className="pb-2 border-b border-border">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-brand" />
            <span className="text-sm font-medium text-foreground">Giỏ hàng Enhanced</span>
            {isCalculating && <Loader2 className="h-3 w-3 animate-spin text-brand" />}
          </div>
          {rawCartItems.length > 0 && (
            <Badge variant="secondary" className="bg-brand/10 text-brand text-xs px-2 py-1">
              {rawCartItems.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-3 space-y-3">
        {/* Stock Validation Warnings */}
        {!stockValidation.valid && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Cảnh báo tồn kho</span>
            </div>
            {stockValidation.errors.map((error, index) => (
              <div key={index} className="text-xs text-destructive ml-6">
                {error}
              </div>
            ))}
          </div>
        )}

        {/* Cart Items */}
        <div className={`${
          isFullHeight 
            ? 'max-h-none' 
            : 'max-h-48 sm:max-h-60'
        } overflow-y-auto space-y-2`}>
          <AnimatePresence>
            {cartPricing?.items.map((item) => (
              <motion.div
                key={item.product.product_id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-muted/30 rounded-lg p-2"
              >
                <div className="flex items-start gap-2">
                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground text-xs line-clamp-1 mb-1">
                      {item.product.product_name}
                    </h4>
                    
                    {/* Enhanced Price Display */}
                    <CartItemPriceDisplay
                      originalPrice={item.product.sale_price}
                      finalPrice={item.unit_price}
                      quantity={item.quantity}
                      appliedRule={item.applied_rule}
                      volumeTierMatch={item.volume_tier_match}
                      className="mb-2"
                    />
                    
                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuantityChange(item.product.product_id, item.quantity - 1)}
                        disabled={item.quantity <= 1 || disabled}
                        className="h-6 w-6 p-0"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          const newQty = parseInt(e.target.value) || 1
                          handleQuantityChange(item.product.product_id, Math.max(1, newQty))
                        }}
                        className="h-6 w-12 text-xs text-center px-1"
                        min="1"
                        max={item.product.current_stock}
                        disabled={disabled}
                      />
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuantityChange(item.product.product_id, item.quantity + 1)}
                        disabled={item.quantity >= item.product.current_stock || disabled}
                        className="h-6 w-6 p-0"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      
                      <span className="text-xs text-muted-foreground ml-1">
                        / {item.product.current_stock}
                      </span>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemoveItem(item.product.product_id)}
                    disabled={disabled}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Empty Cart Message */}
        {rawCartItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Giỏ hàng trống</p>
          </div>
        )}

        {/* Pricing Summary */}
        {cartPricing && cartPricing.items.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            {/* Subtotal */}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tạm tính:</span>
              <span>{formatPrice(cartPricing.subtotal)}</span>
            </div>

            {/* Total Discount */}
            {cartPricing.total_discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Tổng giảm giá:</span>
                <span>-{formatPrice(cartPricing.total_discount)}</span>
              </div>
            )}

            {/* Volume Tier Savings */}
            {cartPricing.volume_tier_savings > 0 && (
              <div className="flex justify-between text-sm text-blue-600">
                <span>Chiết khấu số lượng:</span>
                <span>-{formatPrice(cartPricing.volume_tier_savings)}</span>
              </div>
            )}

            {/* VAT */}
            <div className="flex items-center justify-between">
              <Label htmlFor="vat" className="text-sm text-muted-foreground">VAT (%):</Label>
              <Input
                id="vat"
                type="number"
                value={vatRate}
                onChange={(e) => onVatChange(parseFloat(e.target.value) || 0)}
                className="w-20 h-8 text-sm"
                min="0"
                max="100"
                step="0.1"
                disabled={disabled}
              />
            </div>

            {cartPricing.tax_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Thuế VAT:</span>
                <span>{formatPrice(cartPricing.tax_amount)}</span>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between text-lg font-semibold pt-1 border-t border-border">
              <span>Tổng cộng:</span>
              <span className="text-brand">{formatPrice(cartPricing.final_total)}</span>
            </div>
          </div>
        )}

        {/* Checkout Button */}
        <Button
          onClick={onCheckout}
          disabled={!canCheckout || disabled || isCalculating}
          className="w-full"
          size="lg"
        >
          <CreditCard className="h-4 w-4 mr-2" />
          {isCalculating ? 'Đang tính toán...' : 'Thanh toán'}
        </Button>
      </CardContent>
    </Card>
  )
}
