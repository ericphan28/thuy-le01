"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Calculator } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Product {
  product_code: string
  product_name: string
  sale_price: number
}

interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  subtotal: number
}

export default function SimpleEnhancedCart() {
  const [products, setProducts] = useState<Product[]>([])
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(true)
  
  const supabase = createClient()

  // Load products
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const { data } = await supabase
          .from('products')
          .select('product_code, product_name, sale_price')
          .eq('is_active', true)
          .order('product_name')
          .limit(50)

        if (data) {
          setProducts(data)
        }
      } catch (err) {
        console.error('Data loading error:', err)
      } finally {
        setIsDataLoading(false)
      }
    }

    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Add product to cart
  const addToCart = (product: Product, quantity = 1) => {
    const existingIndex = cartItems.findIndex(item => 
      item.product.product_code === product.product_code
    )

    if (existingIndex >= 0) {
      const updatedItems = [...cartItems]
      updatedItems[existingIndex].quantity += quantity
      updatedItems[existingIndex].subtotal = updatedItems[existingIndex].unit_price * updatedItems[existingIndex].quantity
      setCartItems(updatedItems)
    } else {
      const newItem: CartItem = {
        product,
        quantity,
        unit_price: product.sale_price,
        subtotal: product.sale_price * quantity
      }
      setCartItems([...cartItems, newItem])
    }
  }

  // Update quantity
  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(index)
      return
    }

    const updatedItems = [...cartItems]
    updatedItems[index].quantity = newQuantity
    updatedItems[index].subtotal = updatedItems[index].unit_price * newQuantity
    setCartItems(updatedItems)
  }

  // Remove item
  const removeItem = (index: number) => {
    const newItems = cartItems.filter((_, i) => i !== index)
    setCartItems(newItems)
  }

  const subtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0)
  const tax = subtotal * 0.1
  const total = subtotal + tax

  const formatVND = (amount: number) => {
    return amount.toLocaleString('vi-VN') + ' ₫'
  }

  if (isDataLoading) {
    return (
      <Card>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Simple Enhanced Cart
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Product Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Thêm sản phẩm</label>
          <select 
            className="w-full p-2 border rounded-lg"
            onChange={(e) => {
              const product = products.find(p => p.product_code === e.target.value)
              if (product) {
                addToCart(product, 1)
                e.target.value = ''
              }
            }}
          >
            <option value="">Chọn sản phẩm...</option>
            {products.map((product) => (
              <option key={product.product_code} value={product.product_code}>
                {product.product_name} - {formatVND(product.sale_price)}
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

                {/* Quantity Controls */}
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantity(index, item.quantity - 1)}
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
                  >
                    +
                  </Button>
                </div>

                <div className="flex justify-between text-sm">
                  <span>Đơn giá:</span>
                  <span>{formatVND(item.unit_price)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Thành tiền:</span>
                  <span>{formatVND(item.subtotal)}</span>
                </div>
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
              <div className="flex justify-between">
                <span>Thuế (10%):</span>
                <span>{formatVND(tax)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Tổng cộng:</span>
                <span>{formatVND(total)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  )
}
