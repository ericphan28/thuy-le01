"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'

interface Product {
  product_code: string
  product_name: string
  sale_price: number
  category_id?: number
}

interface PricingResult {
  listPrice: number
  finalPrice: number
  totalSavings: number
  appliedRule?: {
    id: number
    reason: string
  }
  totalAmount: number
}

export default function RealDataPOSDemo() {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(true)
  
  const supabase = createClient()

  // Load real products
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('product_code, product_name, sale_price, category_id')
          .eq('is_active', true)
          .order('product_name')
          .limit(20)

        if (data) {
          setProducts(data)
          // Auto-select first product for demo
          if (data.length > 0) {
            setSelectedProduct(data[0])
          }
        }
        
        if (error) {
          console.error('Products loading error:', error)
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

  // Calculate price using real pricing engine
  const calculatePrice = async () => {
    if (!selectedProduct) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/pricing/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: selectedProduct.product_code,
          qty: quantity
        })
      })

      if (response.ok) {
        const result = await response.json()
        setPricingResult({
          listPrice: result.listPrice || selectedProduct.sale_price,
          finalPrice: result.finalPrice || selectedProduct.sale_price,
          totalSavings: result.totalSavings || 0,
          appliedRule: result.appliedRule ? {
            id: result.appliedRule.id,
            reason: result.appliedRule.reason
          } : undefined,
          totalAmount: result.totalAmount || (result.finalPrice || selectedProduct.sale_price) * quantity
        })
      } else {
        console.error('Pricing API error:', await response.text())
        // Fallback to list price
        setPricingResult({
          listPrice: selectedProduct.sale_price,
          finalPrice: selectedProduct.sale_price,
          totalSavings: 0,
          totalAmount: selectedProduct.sale_price * quantity
        })
      }
    } catch (error) {
      console.error('Price calculation error:', error)
      // Fallback to list price
      setPricingResult({
        listPrice: selectedProduct.sale_price,
        finalPrice: selectedProduct.sale_price,
        totalSavings: 0,
        totalAmount: selectedProduct.sale_price * quantity
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-calculate when product or quantity changes
  useEffect(() => {
    if (selectedProduct && !isDataLoading) {
      calculatePrice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, quantity])

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
              <span>Đang tải dữ liệu thật từ database...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🎯 Real Data POS Demo</h1>
      <p className="text-muted-foreground mb-6">
        Sử dụng dữ liệu thật từ database + Existing Pricing Engine
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Product Selection */}
        <Card>
          <CardHeader>
            <CardTitle>📦 Chọn sản phẩm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Sản phẩm có sẵn ({products.length} items)</label>
              <select 
                className="w-full p-2 border rounded-lg"
                value={selectedProduct?.product_code || ''}
                onChange={(e) => {
                  const product = products.find(p => p.product_code === e.target.value)
                  setSelectedProduct(product || null)
                }}
              >
                <option value="">Chọn sản phẩm...</option>
                {products.map((product) => (
                  <option key={product.product_code} value={product.product_code}>
                    {product.product_name} ({product.product_code}) - {formatVND(product.sale_price)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Số lượng</label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                min="1"
                max="100"
              />
            </div>

            {selectedProduct && (
              <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
                <div><strong>Mã:</strong> {selectedProduct.product_code}</div>
                <div><strong>Tên:</strong> {selectedProduct.product_name}</div>
                <div><strong>Giá niêm yết:</strong> {formatVND(selectedProduct.sale_price)}</div>
                <div><strong>Category ID:</strong> {selectedProduct.category_id}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing Result */}
        <Card>
          <CardHeader>
            <CardTitle>💰 Kết quả tính giá</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <div>Đang tính giá...</div>
              </div>
            ) : pricingResult ? (
              <div className="space-y-4">
                {/* Price Breakdown */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Giá niêm yết:</span>
                    <span>{formatVND(pricingResult.listPrice)}</span>
                  </div>
                  
                  {pricingResult.appliedRule && (
                    <div className="flex justify-between text-blue-600">
                      <span>Sau áp dụng rule #{pricingResult.appliedRule.id}:</span>
                      <span>{formatVND(pricingResult.finalPrice)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between font-medium text-lg border-t pt-2">
                    <span>Giá cuối:</span>
                    <span className="text-green-600">{formatVND(pricingResult.finalPrice)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Số lượng:</span>
                    <span>{quantity}</span>
                  </div>
                  
                  <div className="flex justify-between font-bold text-xl border-t pt-2">
                    <span>Thành tiền:</span>
                    <span className="text-green-600">{formatVND(pricingResult.totalAmount)}</span>
                  </div>
                </div>

                {/* Applied Rule */}
                {pricingResult.appliedRule ? (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <h4 className="font-medium mb-2">🎯 Quy tắc được áp dụng</h4>
                    <div className="text-sm space-y-1">
                      <div>Rule ID: {pricingResult.appliedRule.id}</div>
                      <div>Mô tả: {pricingResult.appliedRule.reason}</div>
                      <div className="text-green-600">
                        Tiết kiệm: {formatVND(pricingResult.totalSavings)} 
                        ({((pricingResult.totalSavings / pricingResult.listPrice) * 100).toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <Badge variant="outline">Sử dụng giá niêm yết</Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      Không có quy tắc giá phù hợp cho sản phẩm này
                    </p>
                  </div>
                )}

                {/* Total Savings */}
                {pricingResult.totalSavings > 0 && (
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Tổng tiết kiệm:</span>
                      <span className="text-green-600 font-bold text-lg">
                        {formatVND(pricingResult.totalSavings * quantity)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : selectedProduct ? (
              <div className="text-center py-8 text-muted-foreground">
                Chọn sản phẩm và số lượng để tính giá
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Vui lòng chọn sản phẩm
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Tests */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>⚡ Quick Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {products.slice(0, 8).map((product) => (
              <Button
                key={product.product_code}
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedProduct(product)
                  setQuantity(5)
                }}
                className="text-left h-auto p-2"
              >
                <div>
                  <div className="font-medium text-xs">{product.product_code}</div>
                  <div className="text-xs text-muted-foreground truncate">{product.product_name}</div>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
