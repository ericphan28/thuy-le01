"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle, Check, TrendingDown, Gift, Calculator } from 'lucide-react'
import { enhancedPricingService, type EnhancedProduct, type CartPricing, type CartItem } from '@/lib/services/enhanced-pricing-service-v2'

interface Props {
  onCartUpdate?: (total: number) => void
  className?: string
}

export default function EnhancedCartSummaryV2({ onCartUpdate, className }: Props) {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [cartPricing, setCartPricing] = useState<CartPricing | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<EnhancedProduct[]>([])

  // Search products
  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    try {
      const results = await enhancedPricingService.searchProducts(query, 10)
      setSearchResults(results)
    } catch (error) {
      console.error('Search error:', error)
    }
  }

  // Add product to cart
  const addToCart = async (product: EnhancedProduct, quantity = 1) => {
    setIsLoading(true)
    try {
      // Check if product already exists in cart
      const existingIndex = cartItems.findIndex(item => 
        item.product.product_id === product.product_id
      )

      let newCartItems: Array<{ product: EnhancedProduct; quantity: number }>

      if (existingIndex >= 0) {
        // Update quantity
        newCartItems = cartItems.map((item, index) => 
          index === existingIndex 
            ? { product: item.product, quantity: item.quantity + quantity }
            : { product: item.product, quantity: item.quantity }
        )
      } else {
        // Add new item
        newCartItems = [
          ...cartItems.map(item => ({ product: item.product, quantity: item.quantity })),
          { product, quantity }
        ]
      }

      // Recalculate pricing
      const newCartPricing = await enhancedPricingService.calculateCartPricing(newCartItems, {
        include_volume_tiers: true,
        include_price_rules: true,
        tax_rate: 10
      })

      setCartItems(newCartPricing.items)
      setCartPricing(newCartPricing)
      setSearchQuery('')
      setSearchResults([])

      if (onCartUpdate) {
        onCartUpdate(newCartPricing.final_total)
      }
    } catch (error) {
      console.error('Add to cart error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Update quantity
  const updateQuantity = async (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(index)
      return
    }

    setIsLoading(true)
    try {
      const newCartItems = cartItems.map((item, i) => 
        i === index 
          ? { product: item.product, quantity: newQuantity }
          : { product: item.product, quantity: item.quantity }
      )

      const newCartPricing = await enhancedPricingService.calculateCartPricing(newCartItems, {
        include_volume_tiers: true,
        include_price_rules: true,
        tax_rate: 10
      })

      setCartItems(newCartPricing.items)
      setCartPricing(newCartPricing)

      if (onCartUpdate) {
        onCartUpdate(newCartPricing.final_total)
      }
    } catch (error) {
      console.error('Update quantity error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Remove item
  const removeItem = async (index: number) => {
    setIsLoading(true)
    try {
      const newCartItems = cartItems
        .filter((_, i) => i !== index)
        .map(item => ({ product: item.product, quantity: item.quantity }))

      if (newCartItems.length === 0) {
        setCartItems([])
        setCartPricing(null)
        if (onCartUpdate) onCartUpdate(0)
      } else {
        const newCartPricing = await enhancedPricingService.calculateCartPricing(newCartItems, {
          include_volume_tiers: true,
          include_price_rules: true,
          tax_rate: 10
        })

        setCartItems(newCartPricing.items)
        setCartPricing(newCartPricing)

        if (onCartUpdate) {
          onCartUpdate(newCartPricing.final_total)
        }
      }
    } catch (error) {
      console.error('Remove item error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatVND = (amount: number) => {
    return amount.toLocaleString('vi-VN') + ' ₫'
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Enhanced Cart (V2 - Integrated Engine)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product Search */}
          <div className="space-y-2">
            <Input
              placeholder="Tìm sản phẩm (tên hoặc mã SKU)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                handleSearch(e.target.value)
              }}
            />
            
            {searchResults.length > 0 && (
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {searchResults.map((product) => (
                  <div
                    key={product.product_id}
                    className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                    onClick={() => addToCart(product, 1)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{product.product_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {product.product_code} - Stock: {product.current_stock}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatVND(product.sale_price)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Items */}
          {cartItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Giỏ hàng trống. Tìm kiếm sản phẩm để thêm vào giỏ.
            </div>
          ) : (
            <div className="space-y-3">
              {cartItems.map((item, index) => (
                <Card key={item.product.product_id} className="p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium">{item.product.product_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {item.product.product_code}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                    >
                      ×
                    </Button>
                  </div>

                  {/* Stock Warning */}
                  {!item.pricing_result.stock_status.is_sufficient && (
                    <div className="flex items-center gap-2 text-amber-600 text-sm mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      {item.pricing_result.stock_status.warning}
                    </div>
                  )}

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2 mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(index, item.quantity - 1)}
                      disabled={isLoading}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 0)}
                      className="w-20 text-center"
                      min="1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(index, item.quantity + 1)}
                      disabled={isLoading}
                    >
                      +
                    </Button>
                  </div>

                  {/* Price Breakdown */}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Giá niêm yết:</span>
                      <span>{formatVND(item.pricing_result.list_price)}</span>
                    </div>
                    
                    {item.pricing_result.applied_rule && (
                      <div className="flex justify-between text-blue-600">
                        <span className="flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          Price Rule #{item.pricing_result.applied_rule.id}:
                        </span>
                        <span>-{formatVND(item.pricing_result.applied_rule.discount_amount)}</span>
                      </div>
                    )}
                    
                    {item.pricing_result.volume_tier_match && (
                      <div className="flex justify-between text-green-600">
                        <span className="flex items-center gap-1">
                          <Gift className="h-3 w-3" />
                          Volume Tier:
                        </span>
                        <span>-{formatVND(item.pricing_result.volume_tier_match.savings)}</span>
                      </div>
                    )}
                    
                    <Separator />
                    <div className="flex justify-between font-medium">
                      <span>Giá cuối:</span>
                      <span>{formatVND(item.pricing_result.final_price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Thành tiền:</span>
                      <span className="font-medium">
                        {formatVND(item.pricing_result.final_price * item.quantity)}
                      </span>
                    </div>
                  </div>

                  {/* Pricing Source Badge */}
                  <div className="mt-2">
                    <Badge variant="outline" className="text-xs">
                      {item.pricing_result.pricing_source === 'price_rules' && 'Price Rules'}
                      {item.pricing_result.pricing_source === 'volume_tiers' && 'Volume Tiers'}
                      {item.pricing_result.pricing_source === 'list_price' && 'List Price'}
                      {item.pricing_result.pricing_source === 'best_price' && 'Best Price'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Cart Summary */}
          {cartPricing && (
            <Card className="bg-muted/50">
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between">
                  <span>Tạm tính:</span>
                  <span>{formatVND(cartPricing.subtotal)}</span>
                </div>
                
                {cartPricing.total_discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Tổng tiết kiệm:</span>
                    <span>-{formatVND(cartPricing.total_discount)}</span>
                  </div>
                )}
                
                {cartPricing.savings_breakdown.price_rules_savings > 0 && (
                  <div className="flex justify-between text-blue-600 text-sm">
                    <span className="ml-4">- Price Rules:</span>
                    <span>-{formatVND(cartPricing.savings_breakdown.price_rules_savings)}</span>
                  </div>
                )}
                
                {cartPricing.savings_breakdown.volume_tier_savings > 0 && (
                  <div className="flex justify-between text-green-600 text-sm">
                    <span className="ml-4">- Volume Tiers:</span>
                    <span>-{formatVND(cartPricing.savings_breakdown.volume_tier_savings)}</span>
                  </div>
                )}
                
                {cartPricing.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Thuế (10%):</span>
                    <span>{formatVND(cartPricing.tax_amount)}</span>
                  </div>
                )}
                
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Tổng cộng:</span>
                  <span>{formatVND(cartPricing.final_total)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
