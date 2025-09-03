"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle, Check, TrendingDown, Gift, Calculator } from 'lucide-react'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { createClient } from '@/lib/supabase/client'

interface Product {
  product_code: string
  name: string
  current_price: number
  category_id?: string
}

interface Customer {
  customer_id: string
  name: string
  phone?: string
}

interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  subtotal: number
  pricing_result?: {
    listPrice: number
    finalPrice: number
    totalSavings: number
    appliedRuleId: number | null
    appliedReason: string
    totalAmount: number
  }
}

interface Props {
  onCartUpdate?: (total: number) => void
  className?: string
}

export default function RealDataEnhancedCart({ onCartUpdate, className }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(true)
  
  const supabase = createClient()

  // Load real data from database
  useEffect(() => {
    const loadData = async () => {
      setIsDataLoading(true)
      try {
        const [productsRes, customersRes] = await Promise.all([
          supabase
            .from('products')
            .select('product_code, product_name, sale_price, category_id')
            .eq('is_active', true)
            .order('product_name')
            .limit(100),
          supabase
            .from('customers')
            .select('customer_id, customer_name, phone')
            .eq('is_active', true)
            .order('customer_name')
            .limit(50)
        ])

        if (productsRes.data) {
          const mappedProducts = productsRes.data.map(p => ({
            product_code: p.product_code,
            name: p.product_name,
            current_price: p.sale_price || 0,
            category_id: p.category_id
          }))
          setProducts(mappedProducts)
        }

        if (customersRes.data) {
          const mappedCustomers = customersRes.data.map(c => ({
            customer_id: c.customer_id,
            name: c.customer_name,
            phone: c.phone
          }))
          setCustomers(mappedCustomers)
        }
      } catch (err) {
        console.error('Data loading error:', err)
      } finally {
        setIsDataLoading(false)
      }
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Calculate price using existing pricing API
  const calculatePrice = async (product: Product, quantity: number): Promise<CartItem['pricing_result']> => {
    try {
      const response = await fetch('/api/pricing/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: product.product_code,
          qty: quantity,
          customer_id: selectedCustomer?.customer_id || null
        })
      })

      if (response.ok) {
        const apiResult = await response.json()
        return {
          listPrice: apiResult.listPrice || product.current_price,
          finalPrice: apiResult.finalPrice || product.current_price,
          totalSavings: apiResult.totalSavings || 0,
          appliedRuleId: apiResult.appliedRule?.id || null,
          appliedReason: apiResult.appliedRule?.reason || 'Giá niêm yết',
          totalAmount: apiResult.totalAmount || (apiResult.finalPrice || product.current_price) * quantity
        }
      }
    } catch (error) {
      console.error('Price calculation error:', error)
    }

    // Fallback to list price
    return {
      listPrice: product.current_price,
      finalPrice: product.current_price,
      totalSavings: 0,
      appliedRuleId: null,
      appliedReason: 'Giá niêm yết',
      totalAmount: product.current_price * quantity
    }
  }

  // Add product to cart
  const addToCart = async (product: Product, quantity = 1) => {
    setIsLoading(true)
    try {
      const pricingResult = await calculatePrice(product, quantity)
      
      // Check if product already exists in cart
      const existingIndex = cartItems.findIndex(item => 
        item.product.product_code === product.product_code
      )

      if (existingIndex >= 0) {
        // Update quantity
        const newQuantity = cartItems[existingIndex].quantity + quantity
        const newPricingResult = await calculatePrice(product, newQuantity)
        
        if (newPricingResult) {
          const updatedItems = [...cartItems]
          updatedItems[existingIndex] = {
            ...updatedItems[existingIndex],
            quantity: newQuantity,
            unit_price: newPricingResult.finalPrice,
            subtotal: newPricingResult.totalAmount,
            pricing_result: newPricingResult
          }
          setCartItems(updatedItems)
        }
      } else {
        // Add new item
        if (pricingResult) {
          const newItem: CartItem = {
            product,
            quantity,
            unit_price: pricingResult.finalPrice,
            subtotal: pricingResult.totalAmount,
            pricing_result: pricingResult
          }
          setCartItems([...cartItems, newItem])
        }
      }

      // Update total
      if (pricingResult) {
        const newTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0) + pricingResult.totalAmount
        if (onCartUpdate) {
          onCartUpdate(newTotal)
        }
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
      const item = cartItems[index]
      const newPricingResult = await calculatePrice(item.product, newQuantity)
      
      if (newPricingResult) {
        const updatedItems = [...cartItems]
        updatedItems[index] = {
          ...item,
          quantity: newQuantity,
          unit_price: newPricingResult.finalPrice,
          subtotal: newPricingResult.totalAmount,
          pricing_result: newPricingResult
        }
        setCartItems(updatedItems)

        const newTotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0)
        if (onCartUpdate) {
          onCartUpdate(newTotal)
        }
      }
    } catch (error) {
      console.error('Update quantity error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Remove item
  const removeItem = (index: number) => {
    const newItems = cartItems.filter((_, i) => i !== index)
    setCartItems(newItems)
    
    const newTotal = newItems.reduce((sum, item) => sum + item.subtotal, 0)
    if (onCartUpdate) onCartUpdate(newTotal)
  }

  // Calculate totals
  const subtotal = cartItems.reduce((sum, item) => sum + (item.pricing_result?.totalAmount || item.subtotal), 0)
  const totalSavings = cartItems.reduce((sum, item) => sum + (item.pricing_result?.totalSavings || 0), 0)
  const tax = subtotal * 0.1 // 10% tax
  const finalTotal = subtotal + tax

  const formatVND = (amount: number) => {
    return amount.toLocaleString('vi-VN') + ' ₫'
  }

  if (isDataLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span>Đang tải dữ liệu...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Enhanced POS Cart (Real Data + Pricing Engine)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Customer Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Khách hàng (VIP pricing)</label>
            {/* Temporary disable SearchableCombobox due to interface mismatch */}
            <select 
              value={selectedCustomer?.customer_id || ''}
              onChange={(e) => {
                const customerId = e.target.value;
                const customer = customers.find(c => c.customer_id.toString() === customerId);
                setSelectedCustomer(customer || null);
              }}
              className="w-full p-2 border rounded-md"
            >
              <option value="">Chọn khách hàng...</option>
              {customers.map(customer => (
                <option key={customer.customer_id} value={customer.customer_id}>
                  {customer.name} {customer.phone ? `(${customer.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Product Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Thêm sản phẩm</label>
            {/* Temporary disable SearchableCombobox due to interface mismatch */}
            <select 
              onChange={(e) => {
                const productCode = e.target.value;
                const product = products.find(p => p.product_code === productCode);
                if (product) {
                  addToCart(product, 1);
                  e.target.value = ''; // Reset selection
                }
              }}
              className="w-full p-2 border rounded-md"
            >
              <option value="">Chọn sản phẩm...</option>
              {products.map(product => (
                <option key={product.product_code} value={product.product_code}>
                  {product.name} ({product.product_code})
                </option>
              ))}
            </select>
          </div>

          {/* Cart Items */}
          {cartItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Giỏ hàng trống. Chọn sản phẩm để thêm vào giỏ.
            </div>
          ) : (
            <div className="space-y-3">
              {cartItems.map((item, index) => (
                <Card key={`${item.product.product_code}-${index}`} className="p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium">{item.product.name}</h4>
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
                  {item.pricing_result && (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Giá niêm yết:</span>
                        <span>{formatVND(item.pricing_result.listPrice)}</span>
                      </div>
                      
                      {item.pricing_result.appliedRuleId && (
                        <div className="flex justify-between text-blue-600">
                          <span className="flex items-center gap-1">
                            <TrendingDown className="h-3 w-3" />
                            Rule #{item.pricing_result.appliedRuleId}:
                          </span>
                          <span>-{formatVND(item.pricing_result.totalSavings)}</span>
                        </div>
                      )}
                      
                      <Separator />
                      <div className="flex justify-between font-medium">
                        <span>Giá cuối:</span>
                        <span>{formatVND(item.pricing_result.finalPrice)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Thành tiền:</span>
                        <span className="font-medium">
                          {formatVND(item.pricing_result.totalAmount)}
                        </span>
                      </div>
                      
                      {/* Applied Rule Badge */}
                      <div className="mt-2">
                        <Badge variant={item.pricing_result.appliedRuleId ? "default" : "outline"} className="text-xs">
                          {item.pricing_result.appliedReason}
                        </Badge>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Cart Summary */}
          {cartItems.length > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between">
                  <span>Tạm tính:</span>
                  <span>{formatVND(subtotal)}</span>
                </div>
                
                {totalSavings > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Tổng tiết kiệm:</span>
                    <span>-{formatVND(totalSavings)}</span>
                  </div>
                )}
                
                <div className="flex justify-between">
                  <span>Thuế (10%):</span>
                  <span>{formatVND(tax)}</span>
                </div>
                
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Tổng cộng:</span>
                  <span>{formatVND(finalTotal)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
