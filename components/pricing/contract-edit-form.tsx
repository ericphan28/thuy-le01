'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Search, Calculator, TrendingUp, DollarSign } from 'lucide-react'
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

interface Contract {
  contract_id: number
  customer_id: number
  product_id: number
  net_price: number
  effective_from: string | null
  effective_to: string | null
  is_active: boolean
  notes: string | null
}

interface ContractEditFormProps {
  contract: Contract
  customers: Customer[]
  products: Product[]
  currentCustomer: Customer | null
  currentProduct: Product | null
  onSubmit: (formData: FormData) => void
  onDelete: (formData: FormData) => void
}

export default function ContractEditForm({
  contract,
  customers,
  products,
  currentCustomer,
  currentProduct,
  onSubmit,
  onDelete
}: ContractEditFormProps) {
  const [customerSearch, setCustomerSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState(contract.customer_id)
  const [selectedProductId, setSelectedProductId] = useState(contract.product_id)
  const [contractPrice, setContractPrice] = useState(contract.net_price)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
  const selectedCustomer = customers.find(c => c.customer_id === selectedCustomerId) || currentCustomer
  const selectedProduct = products.find(p => p.product_id === selectedProductId) || currentProduct

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

  const handleDeleteConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    onDelete(formData)
  }

  return (
    <div className="space-y-6">
      {/* Current Contract Info */}
      <div className="p-4 bg-muted/30 rounded-lg">
        <div className="text-sm font-medium mb-3">Thông tin hợp đồng hiện tại</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Contract Price */}
          <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
            <div className="text-xs font-medium text-primary mb-1">GIÁ HỢP ĐỒNG</div>
            <div className="text-lg font-bold text-primary">
              {Number(contract.net_price).toLocaleString('vi-VN')}₫
            </div>
          </div>
          
          {/* List Price */}
          {currentProduct && (
            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="text-xs font-medium text-muted-foreground mb-1">GIÁ NIÊM YẾT</div>
              <div className="text-lg font-semibold">
                {Number(currentProduct.sale_price || 0).toLocaleString('vi-VN')}₫
              </div>
            </div>
          )}
          
          {/* Cost Price */}
          {currentProduct && (
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
              <div className="text-xs font-medium text-orange-700 mb-1">GIÁ GỐC (NHẬP)</div>
              <div className="text-lg font-semibold text-orange-600">
                {Number(currentProduct.cost_price || 0).toLocaleString('vi-VN')}₫
              </div>
            </div>
          )}
        </div>
        
        {/* Status */}
        <div className="mt-3 pt-2 border-t border-muted-foreground/20">
          <span className="text-xs font-medium">TRẠNG THÁI: </span>
          {contract.is_active ? (
            <Badge className="bg-green-100 text-green-800">🟢 Đang hoạt động</Badge>
          ) : (
            <Badge variant="outline">🔴 Tạm dừng</Badge>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="p-4 border border-destructive bg-destructive/10 rounded-md">
          <h3 className="font-medium text-destructive mb-2">Xác nhận xóa hợp đồng</h3>
          <p className="text-sm text-destructive/80 mb-4">
            Bạn có chắc muốn xóa hợp đồng giá này? Hành động này không thể hoàn tác.
          </p>
          <div className="flex gap-3">
            <form onSubmit={handleDeleteConfirm}>
              <input type="hidden" name="confirmed" value="true" />
              <Button type="submit" variant="destructive" size="sm">
                Có, xóa hợp đồng
              </Button>
            </form>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Hủy
            </Button>
          </div>
        </div>
      )}

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
              value={contractPrice}
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
              defaultValue={contract.effective_from ? new Date(contract.effective_from).toISOString().split('T')[0] : ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="effective_to">Hiệu lực đến</Label>
            <Input
              id="effective_to"
              name="effective_to"
              type="date"
              defaultValue={contract.effective_to ? new Date(contract.effective_to).toISOString().split('T')[0] : ''}
            />
          </div>
        </div>

        {/* Active Status */}
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={contract.is_active}
              className="rounded"
            />
            <span className="text-sm font-medium">Kích hoạt hợp đồng</span>
          </label>
          <div className="text-xs text-muted-foreground">
            Chỉ hợp đồng được kích hoạt mới áp dụng khi tính giá
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Ghi chú</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={contract.notes || ''}
            className="h-20"
            placeholder="Điều kiện đặc biệt, lý do áp dụng giá hợp đồng..."
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-4">
          <Button type="submit" className="w-full sm:w-auto">
            <TrendingUp className="h-4 w-4 mr-2" />
            Lưu thay đổi
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/dashboard/pricing/contracts" className="flex items-center">Hủy</Link>
          </Button>
          <Button 
            type="button" 
            variant="destructive" 
            className="w-full sm:w-auto sm:ml-auto"
            onClick={() => setConfirmDelete(true)}
          >
            Xóa hợp đồng
          </Button>
        </div>
      </form>
    </div>
  )
}
