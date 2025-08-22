'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Search, Calculator, TrendingUp, DollarSign, Plus } from 'lucide-react'
import Link from 'next/link'

interface Customer {
  customer_id: number
  customer_name: string
  customer_code: string
}

interface Product {
  product_id: number
  product_code: string
  product_name: string
  sale_price: number
  cost_price: number
  base_price: number
}

interface ContractCreateFormProps {
  customers: Customer[]
  products: Product[]
  onSubmit: (formData: FormData) => void
}

export default function ContractCreateForm({
  customers,
  products,
  onSubmit
}: ContractCreateFormProps) {
  const [customerSearch, setCustomerSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState(0)
  const [selectedProductId, setSelectedProductId] = useState(0)
  const [contractPrice, setContractPrice] = useState(0)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [showProductDropdown, setShowProductDropdown] = useState(false)

  // Filter customers based on search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 10)
    return customers.filter(c => 
      c.customer_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.customer_code?.toLowerCase().includes(customerSearch.toLowerCase())
    ).slice(0, 10)
  }, [customers, customerSearch])

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 15)
    return products.filter(p => 
      p.product_name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.product_code?.toLowerCase().includes(productSearch.toLowerCase())
    ).slice(0, 15)
  }, [products, productSearch])

  // Get selected customer and product
  const selectedCustomer = customers.find(c => c.customer_id === selectedCustomerId)
  const selectedProduct = products.find(p => p.product_id === selectedProductId)

  // Calculate profit metrics
  const profitMetrics = useMemo(() => {
    if (!selectedProduct || !contractPrice || selectedProduct.cost_price <= 0) {
      return null
    }

    const costPrice = selectedProduct.cost_price
    const salePrice = selectedProduct.sale_price
    const profit = contractPrice - costPrice
    const profitMargin = (profit / contractPrice) * 100
    const retailMargin = salePrice > 0 ? ((salePrice - costPrice) / salePrice) * 100 : 0
    const discountFromRetail = salePrice > 0 ? ((salePrice - contractPrice) / salePrice) * 100 : 0

    return {
      costPrice,
      salePrice,
      profit,
      profitMargin,
      retailMargin,
      discountFromRetail,
      isProfit: profit > 0,
      profitStatus: profit > 0 ? 'Có lãi' : profit === 0 ? 'Hòa vốn' : 'Thua lỗ'
    }
  }, [selectedProduct, contractPrice])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    onSubmit(formData)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer Selection */}
        <div className="space-y-2">
          <Label htmlFor="customer_search">Khách hàng <span className="text-destructive">*</span></Label>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                id="customer_search"
                placeholder="Tìm tên hoặc mã khách hàng..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onFocus={() => setShowCustomerDropdown(true)}
                className="pl-10"
              />
            </div>
            
            {showCustomerDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredCustomers.map(customer => (
                  <div
                    key={customer.customer_id}
                    className={`p-3 hover:bg-gray-50 cursor-pointer ${
                      selectedCustomerId === customer.customer_id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => {
                      setSelectedCustomerId(customer.customer_id)
                      setCustomerSearch(`${customer.customer_name} (${customer.customer_code})`)
                      setShowCustomerDropdown(false)
                    }}
                  >
                    <div className="font-medium">{customer.customer_name}</div>
                    <div className="text-sm text-muted-foreground">{customer.customer_code}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <input type="hidden" name="customer_id" value={selectedCustomerId} />
          
          {selectedCustomer && (
            <div className="text-sm text-muted-foreground">
              Đã chọn: <span className="font-medium">{selectedCustomer.customer_name}</span> ({selectedCustomer.customer_code})
            </div>
          )}
        </div>

        {/* Product Selection */}
        <div className="space-y-2">
          <Label htmlFor="product_search">Sản phẩm <span className="text-destructive">*</span></Label>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                id="product_search"
                placeholder="Tìm tên hoặc mã sản phẩm..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onFocus={() => setShowProductDropdown(true)}
                className="pl-10"
              />
            </div>
            
            {showProductDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredProducts.map(product => (
                  <div
                    key={product.product_id}
                    className={`p-3 hover:bg-gray-50 cursor-pointer ${
                      selectedProductId === product.product_id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => {
                      setSelectedProductId(product.product_id)
                      setProductSearch(`${product.product_name} (${product.product_code})`)
                      setShowProductDropdown(false)
                    }}
                  >
                    <div className="font-medium">{product.product_name}</div>
                    <div className="text-sm text-muted-foreground">{product.product_code}</div>
                    <div className="text-sm text-green-600">
                      Bán: {Number(product.sale_price || 0).toLocaleString('vi-VN')}₫
                      {product.cost_price > 0 && (
                        <span className="text-orange-600 ml-2">
                          • Gốc: {Number(product.cost_price).toLocaleString('vi-VN')}₫
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <input type="hidden" name="product_id" value={selectedProductId} />
          
          {selectedProduct && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm">
                <div className="font-medium">{selectedProduct.product_name}</div>
                <div className="text-muted-foreground">Mã: {selectedProduct.product_code}</div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Giá bán:</span>
                    <div className="font-semibold">{Number(selectedProduct.sale_price || 0).toLocaleString('vi-VN')}₫</div>
                  </div>
                  <div>
                    <span className="text-xs text-orange-700">Giá gốc:</span>
                    <div className="font-semibold text-orange-600">{Number(selectedProduct.cost_price || 0).toLocaleString('vi-VN')}₫</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contract Price */}
        <div className="space-y-2">
          <Label htmlFor="net_price">Giá hợp đồng <span className="text-destructive">*</span></Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              id="net_price"
              name="net_price"
              type="number"
              step="0.01"
              min="0"
              value={contractPrice || ''}
              onChange={(e) => setContractPrice(Number(e.target.value))}
              className="pl-10"
              placeholder="0"
              required
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Giá bán áp dụng riêng cho khách hàng này (VNĐ)
          </div>
        </div>

        {/* Profit Analysis */}
        {profitMetrics && contractPrice > 0 && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="h-4 w-4 text-green-600" />
              <h3 className="font-medium text-green-800">Phân tích lợi nhuận tự động</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-white rounded border">
                <div className="text-xs text-muted-foreground mb-1">LỢI NHUẬN</div>
                <div className={`text-lg font-bold ${profitMetrics.isProfit ? 'text-green-600' : 'text-red-600'}`}>
                  {profitMetrics.profitMargin.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">{profitMetrics.profitStatus}</div>
              </div>
              
              <div className="text-center p-3 bg-white rounded border">
                <div className="text-xs text-muted-foreground mb-1">LÃI/SẢN PHẨM</div>
                <div className={`text-lg font-bold ${profitMetrics.isProfit ? 'text-green-600' : 'text-red-600'}`}>
                  {profitMetrics.profit > 0 ? '+' : ''}{profitMetrics.profit.toLocaleString('vi-VN')}₫
                </div>
              </div>
              
              <div className="text-center p-3 bg-white rounded border">
                <div className="text-xs text-muted-foreground mb-1">SO VỚI NIÊM YẾT</div>
                <div className="text-lg font-bold text-blue-600">
                  {profitMetrics.retailMargin.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {profitMetrics.discountFromRetail > 0 ? `Giảm ${profitMetrics.discountFromRetail.toFixed(1)}%` : 'Cao hơn niêm yết'}
                </div>
              </div>
            </div>
            
            {!profitMetrics.isProfit && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                ⚠️ Giá hợp đồng thấp hơn giá vốn. Khuyến nghị xem xét lại giá.
              </div>
            )}
          </div>
        )}

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="effective_from">Hiệu lực từ</Label>
            <Input
              id="effective_from"
              name="effective_from"
              type="date"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="effective_to">Hiệu lực đến</Label>
            <Input
              id="effective_to"
              name="effective_to"
              type="date"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Ghi chú</Label>
          <Textarea
            id="notes"
            name="notes"
            className="h-20"
            placeholder="Điều kiện đặc biệt, lý do áp dụng giá hợp đồng..."
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-4">
          <Button 
            type="submit" 
            className="w-full sm:w-auto"
            disabled={!selectedCustomerId || !selectedProductId || !contractPrice}
          >
            <Plus className="h-4 w-4 mr-2" />
            Tạo hợp đồng giá
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/dashboard/pricing/contracts" className="flex items-center">Hủy</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
