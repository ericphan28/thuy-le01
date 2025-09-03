"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle, ShoppingCart, Calculator, Percent } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Product {
  product_code: string
  product_name: string
  sale_price: number
  current_stock: number
  category_id: number
}

interface Customer {
  customer_id: string
  customer_name: string
  phone?: string
}

interface CartItem {
  product: Product
  quantity: number
  pricing_result: {
    listPrice: number
    finalPrice: number
    totalSavings: number
    appliedRule?: {
      id: number
      reason: string
    }
    totalAmount: number
    discountPercent: number
  }
}

export default function NewPOSSystem() {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(true)
  
  const supabase = createClient()

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsRes, customersRes] = await Promise.all([
          supabase
            .from('products')
            .select('product_code, product_name, sale_price, current_stock, category_id')
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

        if (productsRes.data) setProducts(productsRes.data)
        if (customersRes.data) setCustomers(customersRes.data)
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: product.product_code,
          qty: quantity,
          customer_id: selectedCustomer?.customer_id || null
        })
      })

      if (response.ok) {
        const result = await response.json()
        return {
          listPrice: result.listPrice || product.sale_price,
          finalPrice: result.finalPrice || product.sale_price,
          totalSavings: result.totalSavings || 0,
          appliedRule: result.appliedRule ? {
            id: result.appliedRule.id,
            reason: result.appliedRule.reason
          } : undefined,
          totalAmount: result.totalAmount || (result.finalPrice || product.sale_price) * quantity,
          discountPercent: result.discountPercent || 0
        }
      }
    } catch (error) {
      console.error('Price calculation error:', error)
    }

    // Fallback
    return {
      listPrice: product.sale_price,
      finalPrice: product.sale_price,
      totalSavings: 0,
      totalAmount: product.sale_price * quantity,
      discountPercent: 0
    }
  }

  // Add to cart
  const addToCart = async (product: Product, quantity = 1) => {
    setIsLoading(true)
    try {
      const pricingResult = await calculatePrice(product, quantity)
      
      const existingIndex = cartItems.findIndex(item => 
        item.product.product_code === product.product_code
      )

      if (existingIndex >= 0) {
        // Update existing item
        const newQuantity = cartItems[existingIndex].quantity + quantity
        const newPricingResult = await calculatePrice(product, newQuantity)
        
        const updatedItems = [...cartItems]
        updatedItems[existingIndex] = {
          ...updatedItems[existingIndex],
          quantity: newQuantity,
          pricing_result: newPricingResult
        }
        setCartItems(updatedItems)
      } else {
        // Add new item
        const newItem: CartItem = {
          product,
          quantity,
          pricing_result: pricingResult
        }
        setCartItems([...cartItems, newItem])
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
      removeFromCart(index)
      return
    }

    setIsLoading(true)
    try {
      const item = cartItems[index]
      const newPricingResult = await calculatePrice(item.product, newQuantity)
      
      const updatedItems = [...cartItems]
      updatedItems[index] = {
        ...item,
        quantity: newQuantity,
        pricing_result: newPricingResult
      }
      setCartItems(updatedItems)
    } catch (error) {
      console.error('Update quantity error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Remove from cart
  const removeFromCart = (index: number) => {
    const newItems = cartItems.filter((_, i) => i !== index)
    setCartItems(newItems)
  }

  // Clear cart
  const clearCart = () => {
    setCartItems([])
  }

  // Filter products for search
  const filteredProducts = products.filter(p => 
    p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.product_code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate totals
  const subtotal = cartItems.reduce((sum, item) => sum + item.pricing_result.totalAmount, 0)
  const totalSavings = cartItems.reduce((sum, item) => sum + (item.pricing_result.totalSavings * item.quantity), 0)
  const tax = subtotal * 0.1 // 10% tax
  const finalTotal = subtotal + tax

  const formatVND = (amount: number) => {
    return amount.toLocaleString('vi-VN') + ' ₫'
  }

  if (isDataLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span>Đang tải dữ liệu...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCart className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold">POS System V2</h1>
          <p className="text-muted-foreground">
            Hệ thống bán hàng với tính giá thông minh - Tích hợp Pricing Engine
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Product Selection */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <Card>
            <CardHeader>
              <CardTitle>👤 Khách hàng</CardTitle>
            </CardHeader>
            <CardContent>
              <select 
                className="w-full p-2 border rounded-lg"
                value={selectedCustomer?.customer_id || ''}
                onChange={(e) => {
                  const customer = customers.find(c => c.customer_id === e.target.value)
                  setSelectedCustomer(customer || null)
                }}
              >
                <option value="">Khách lẻ</option>
                {customers.map((customer) => (
                  <option key={customer.customer_id} value={customer.customer_id}>
                    {customer.customer_name} {customer.phone ? `- ${customer.phone}` : ''}
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <div className="mt-2">
                  <Badge variant="secondary">VIP Customer - Giá ưu đãi</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Product Search & Selection */}
          <Card>
            <CardHeader>
              <CardTitle>🛍️ Chọn sản phẩm</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Tìm kiếm sản phẩm (tên hoặc mã SKU)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              
              <div className="max-h-96 overflow-y-auto border rounded-lg">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {searchQuery ? 'Không tìm thấy sản phẩm' : 'Không có sản phẩm'}
                  </div>
                ) : (
                  filteredProducts.slice(0, 20).map((product) => (
                    <div
                      key={product.product_code}
                      className="p-3 border-b last:border-b-0 hover:bg-muted cursor-pointer"
                      onClick={() => addToCart(product, 1)}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <h4 className="font-medium">{product.product_name}</h4>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{product.product_code}</span>
                            <span>•</span>
                            <span>Tồn: {product.current_stock}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatVND(product.sale_price)}</div>
                          {product.current_stock <= 0 && (
                            <Badge variant="destructive" className="text-xs">Hết hàng</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Cart */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Giỏ hàng ({cartItems.length})
              </CardTitle>
              {cartItems.length > 0 && (
                <Button variant="outline" size="sm" onClick={clearCart}>
                  Xóa tất cả
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {cartItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Giỏ hàng trống
                </div>
              ) : (
                <>
                  {/* Cart Items */}
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {cartItems.map((item, index) => (
                      <Card key={`${item.product.product_code}-${index}`} className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{item.product.product_name}</h4>
                            <p className="text-xs text-muted-foreground">{item.product.product_code}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFromCart(index)}
                            className="h-6 w-6 p-0"
                          >
                            ×
                          </Button>
                        </div>

                        {/* Stock Warning */}
                        {item.quantity > item.product.current_stock && (
                          <div className="flex items-center gap-1 text-amber-600 text-xs mb-2">
                            <AlertTriangle className="h-3 w-3" />
                            Vượt quá tồn kho ({item.product.current_stock})
                          </div>
                        )}

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-2 mb-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                            disabled={isLoading}
                            className="h-7 w-7 p-0"
                          >
                            -
                          </Button>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                            className="w-16 h-7 text-center text-sm"
                            min="1"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(index, item.quantity + 1)}
                            disabled={isLoading}
                            className="h-7 w-7 p-0"
                          >
                            +
                          </Button>
                        </div>

                        {/* Price Info */}
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span>Giá niêm yết:</span>
                            <span>{formatVND(item.pricing_result.listPrice)}</span>
                          </div>
                          
                          {item.pricing_result.appliedRule && (
                            <div className="flex justify-between text-blue-600">
                              <span>Rule #{item.pricing_result.appliedRule.id}:</span>
                              <span>{formatVND(item.pricing_result.finalPrice)}</span>
                            </div>
                          )}
                          
                          {item.pricing_result.totalSavings > 0 && (
                            <div className="flex justify-between text-green-600">
                              <span className="flex items-center gap-1">
                                <Percent className="h-2 w-2" />
                                Tiết kiệm:
                              </span>
                              <span>-{formatVND(item.pricing_result.totalSavings)}</span>
                            </div>
                          )}
                          
                          <Separator />
                          <div className="flex justify-between font-medium">
                            <span>Thành tiền:</span>
                            <span>{formatVND(item.pricing_result.totalAmount)}</span>
                          </div>
                        </div>

                        {/* Applied Rule Badge */}
                        {item.pricing_result.appliedRule && (
                          <div className="mt-2">
                            <Badge variant="default" className="text-xs">
                              {item.pricing_result.appliedRule.reason}
                            </Badge>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>

                  {/* Cart Summary */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Tạm tính:</span>
                        <span>{formatVND(subtotal)}</span>
                      </div>
                      
                      {totalSavings > 0 && (
                        <div className="flex justify-between text-green-600 text-sm">
                          <span>Tổng tiết kiệm:</span>
                          <span>-{formatVND(totalSavings)}</span>
                        </div>
                      )}
                      
                      <div className="flex justify-between text-sm">
                        <span>Thuế (10%):</span>
                        <span>{formatVND(tax)}</span>
                      </div>
                      
                      <Separator />
                      <div className="flex justify-between text-lg font-bold">
                        <span>Tổng cộng:</span>
                        <span className="text-green-600">{formatVND(finalTotal)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Checkout Button */}
                  <Button className="w-full" size="lg">
                    Thanh toán - {formatVND(finalTotal)}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
