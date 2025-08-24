'use client'

import { useState, useEffect } from 'react'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"

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

interface SimulationResult {
  listPrice: number
  finalPrice: number
  totalSavings: number
  appliedRuleId: number | null
  appliedReason: string
  quantity: number
  totalAmount: number
}

interface Props {
  products: Product[]
  customers: Customer[]
}

export default function PriceSimulatorForm({ products, customers }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [customSku, setCustomSku] = useState<string>('')
  const [simulationDate, setSimulationDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [error, setError] = useState<string>('')
  
  const supabase = createClient()

  // Filter products based on search
  const [productSearch, setProductSearch] = useState('')
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.product_code.toLowerCase().includes(productSearch.toLowerCase())
  )

  const handleSimulate = async () => {
    if (!selectedProduct && !customSku) {
      setError('Vui lòng chọn sản phẩm hoặc nhập mã SKU')
      return
    }

    if (quantity <= 0) {
      setError('Số lượng phải lớn hơn 0')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const productCode = selectedProduct?.product_code || customSku.toUpperCase()

      // Gọi API simulation
      const response = await fetch('/api/pricing/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: productCode,
          qty: quantity,
          when: simulationDate
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'API call failed')
      }

      const apiResult = await response.json()

      // Format kết quả từ API response
      const formattedResult: SimulationResult = {
        listPrice: apiResult.listPrice,
        finalPrice: apiResult.finalPrice,
        totalSavings: apiResult.totalSavings,
        appliedRuleId: apiResult.appliedRule?.id || null,
        appliedReason: apiResult.appliedRule?.reason || 'Không có quy tắc được áp dụng',
        quantity: apiResult.quantity,
        totalAmount: apiResult.totalAmount
      }

      setResult(formattedResult)
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi tính toán giá')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedProduct(null)
    setSelectedCustomer(null)
    setQuantity(1)
    setCustomSku('')
    setResult(null)
    setError('')
  }

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📝 Thông tin mô phỏng</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product Selection */}
          <div className="space-y-2">
            <Label>🛍️ Chọn sản phẩm</Label>
            <div className="grid gap-2">
              <Input
                placeholder="Tìm kiếm sản phẩm..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              <Select 
                value={selectedProduct?.product_code || ''} 
                onValueChange={(value) => {
                  const product = products.find(p => p.product_code === value)
                  setSelectedProduct(product || null)
                  setCustomSku('')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="-- Chọn từ danh sách --" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProducts.slice(0, 20).map((product) => (
                    <SelectItem key={product.product_code} value={product.product_code}>
                      <div className="flex justify-between items-center w-full">
                        <span>{product.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {product.product_code}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Hoặc nhập mã SKU trực tiếp:
            </div>
            <Input
              placeholder="Nhập mã SKU (ví dụ: SP000001)"
              value={customSku}
              onChange={(e) => {
                setCustomSku(e.target.value.toUpperCase())
                setSelectedProduct(null)
              }}
            />
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label>📦 Số lượng</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              placeholder="Nhập số lượng"
            />
          </div>

          {/* Customer (Optional) */}
          <div className="space-y-2">
            <Label>👤 Khách hàng (tùy chọn)</Label>
            <Select 
              value={selectedCustomer?.customer_id || ''} 
              onValueChange={(value) => {
                const customer = customers.find(c => c.customer_id === value)
                setSelectedCustomer(customer || null)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="-- Chọn khách hàng để áp dụng giá VIP --" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.customer_id} value={customer.customer_id}>
                    <div className="flex flex-col">
                      <span>{customer.name}</span>
                      {customer.phone && (
                        <span className="text-xs text-muted-foreground">{customer.phone}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Simulation Date */}
          <div className="space-y-2">
            <Label>📅 Ngày áp dụng</Label>
            <Input
              type="date"
              value={simulationDate}
              onChange={(e) => setSimulationDate(e.target.value)}
            />
            <div className="text-xs text-muted-foreground">
              Để kiểm tra khuyến mãi có hiệu lực trong tương lai
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button 
              onClick={handleSimulate} 
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? '⏳ Đang tính...' : '🎯 Tính giá'}
            </Button>
            <Button variant="outline" onClick={resetForm}>
              🔄 Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              ✅ Kết quả mô phỏng
              {result.totalSavings > 0 && (
                <Badge className="bg-green-100 text-green-700">
                  Tiết kiệm {result.totalSavings.toLocaleString('vi-VN')}đ
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Price Breakdown */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Giá niêm yết</div>
                <div className="text-2xl font-bold">
                  {result.listPrice.toLocaleString('vi-VN')}đ
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600 mb-1">Giá cuối</div>
                <div className="text-2xl font-bold text-blue-700">
                  {result.finalPrice.toLocaleString('vi-VN')}đ
                </div>
              </div>
            </div>

            {/* Total Amount */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-green-600">Tổng thanh toán</div>
                  <div className="text-xl font-bold text-green-700">
                    {result.totalAmount.toLocaleString('vi-VN')}đ
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-green-600">Số lượng: {result.quantity}</div>
                  {result.totalSavings > 0 && (
                    <div className="text-sm font-medium text-green-700">
                      💰 Tiết kiệm: {result.totalSavings.toLocaleString('vi-VN')}đ
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Applied Rules */}
            {result.appliedRuleId && (
              <div className="space-y-2">
                <h4 className="font-semibold">🎯 Quy tắc được áp dụng:</h4>
                <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded">
                  <div>
                    <div className="font-medium">Quy tắc #{result.appliedRuleId}</div>
                    <div className="text-sm text-amber-700">
                      {result.appliedReason}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    #{result.appliedRuleId}
                  </Badge>
                </div>
              </div>
            )}

            {!result.appliedRuleId && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                <div className="text-sm text-gray-600">
                  💡 Không có quy tắc giá nào được áp dụng - sử dụng giá niêm yết
                </div>
              </div>
            )}

            {/* Export Options */}
            <div className="pt-4 border-t">
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  📊 Export Excel
                </Button>
                <Button variant="outline" size="sm">
                  📄 Export PDF
                </Button>
                <Button variant="outline" size="sm">
                  📋 Copy kết quả
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
