'use client'

import { useState, useEffect } from 'react'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableCombobox } from "@/components/ui/searchable-combobox"
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
  // Remove props, will load data directly in component
}

export default function PriceSimulatorForm({}: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [customSku, setCustomSku] = useState<string>('')
  const [simulationDate, setSimulationDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [isLoading, setIsLoading] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(true)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [error, setError] = useState<string>('')
  
  const supabase = createClient()

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      setIsDataLoading(true)
      try {
        // Load products and customers in parallel
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
          // Map to expected interface
          const mappedProducts = productsRes.data.map(p => ({
            product_code: p.product_code,
            name: p.product_name,
            current_price: p.sale_price || 0,
            category_id: p.category_id
          }))
          setProducts(mappedProducts)
        }

        if (customersRes.data) {
          // Map to expected interface  
          const mappedCustomers = customersRes.data.map(c => ({
            customer_id: c.customer_id,
            name: c.customer_name,
            phone: c.phone
          }))
          setCustomers(mappedCustomers)
        }

        if (productsRes.error) console.error('Products error:', productsRes.error)
        if (customersRes.error) console.error('Customers error:', customersRes.error)
      } catch (err) {
        console.error('Data loading error:', err)
        setError('Không thể tải dữ liệu. Vui lòng thử lại.')
      } finally {
        setIsDataLoading(false)
      }
    }

    loadData()
  }, [supabase])  // Added supabase to dependency array

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
          when: simulationDate,
          customer_id: selectedCustomer?.customer_id || null
        })
      })

      // Check if response is ok
      if (!response.ok) {
        let errorMessage = 'Có lỗi xảy ra'
        let suggestion = 'Vui lòng thử lại sau.'
        
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
          suggestion = errorData.suggestion || suggestion
        } catch (parseError) {
          errorMessage = `Lỗi kết nối (HTTP ${response.status})`
          suggestion = 'Vui lòng kiểm tra kết nối mạng và thử lại.'
        }
        
        // Display user-friendly error with suggestion
        const fullError = suggestion && suggestion !== errorMessage 
          ? `❌ ${errorMessage}\n💡 ${suggestion}`
          : `❌ ${errorMessage}`
        
        setError(fullError)
        return
      }

      // Check if response has content
      const responseText = await response.text()
      if (!responseText.trim()) {
        throw new Error('API trả về response rỗng')
      }

      let apiResult
      try {
        apiResult = JSON.parse(responseText)
      } catch (parseError) {
        console.error('JSON parse error:', parseError)
        console.error('Response text:', responseText)
        throw new Error('API response không phải JSON hợp lệ')
      }

      // Format kết quả từ API response
      const formattedResult: SimulationResult = {
        listPrice: apiResult.listPrice || 0,
        finalPrice: apiResult.finalPrice || 0,
        totalSavings: apiResult.totalSavings || 0,
        appliedRuleId: apiResult.appliedRule?.id || null,
        appliedReason: apiResult.appliedRule?.reason || 'Không có quy tắc được áp dụng',
        quantity: apiResult.quantity || quantity,
        totalAmount: apiResult.totalAmount || 0
      }

      setResult(formattedResult)
      
      // Show recovery notification if price book was recovered
      if (apiResult.priceBook?.isRecovered) {
        console.warn('🚨 RECOVERY: Price book was automatically recreated')
        setError('⚠️ Thông báo: Bảng giá POS đã được khôi phục tự động do bảng giá gốc bị xóa.\n💡 Vui lòng kiểm tra và cập nhật lại các quy tắc giá cần thiết trong phần "Quản lý bảng giá".')
      }
    } catch (err: any) {
      console.error('Simulation error:', err)
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
      {/* Loading State */}
      {isDataLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span>Đang tải dữ liệu...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Form */}
      {!isDataLoading && (
        <>
          {/* Input Form */}
          <Card className="relative">
            <CardHeader>
              <CardTitle className="text-lg">📝 Thông tin mô phỏng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
          {/* Product Selection */}
          <div className="space-y-2">
            <Label>🛍️ Chọn sản phẩm</Label>
            <SearchableCombobox
              items={products}
              value={selectedProduct || undefined}
              onValueChange={(value) => {
                setSelectedProduct(value)
                setCustomSku('')
              }}
              getItemId={(item: Product) => item.product_code}
              getItemLabel={(item: Product) => `${item.name} • ${item.product_code} • ${item.current_price.toLocaleString('vi-VN')}đ`}
              placeholder="Tìm kiếm và chọn sản phẩm..."
            />
            
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
            {(selectedProduct?.product_code === 'SP000049' || customSku.toUpperCase() === 'SP000049') && quantity > 0 && (
              <div className="text-xs space-y-1">
                {quantity <= 30 ? (
                  <div className="text-green-600 flex items-center gap-1">
                    ✅ Dự kiến: 190.000đ/cái (giá ưu đãi tốt nhất)
                  </div>
                ) : (
                  <div className="text-amber-600 flex items-center gap-1">
                    ⚠️ Dự kiến: 215.000đ/cái (mua nhiều quá không lợi hơn)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Customer (Optional) */}
          <div className="space-y-2">
            <Label>👤 Khách hàng (tùy chọn)</Label>
            <SearchableCombobox
              items={customers}
              value={selectedCustomer || undefined}
              onValueChange={(value) => {
                setSelectedCustomer(value)
              }}
              getItemId={(item: Customer) => item.customer_id}
              getItemLabel={(item: Customer) => `${item.name}${item.phone ? ` • ${item.phone}` : ''}`}
              placeholder="Chọn khách hàng để áp dụng giá VIP..."
            />
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

          {/* Quick Explanation */}
          {(selectedProduct || customSku) && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="text-sm font-medium text-blue-800">Cách hệ thống tính giá</div>
              </div>
              <div className="text-xs text-blue-700 space-y-1">
                <div>• Hệ thống sẽ tìm tất cả quy tắc giá phù hợp</div>
                <div>• Ưu tiên theo độ ưu tiên (priority) và scope cụ thể</div>
                <div>• Tự động chọn giá tốt nhất cho khách hàng</div>
                {(selectedProduct?.product_code === 'SP000049' || customSku.toUpperCase() === 'SP000049') && (
                  <div className="mt-2 p-2 bg-yellow-100 border border-yellow-200 rounded text-xs">
                    <div className="font-medium text-yellow-800">💡 SP000049 - Case đặc biệt:</div>
                    <div className="text-yellow-700">Qty 1-30: 190k | Qty 31+: 215k (mua nhiều không rẻ hơn!)</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-red-800 font-medium mb-2">Có vấn đề xảy ra:</div>
              <div className="text-red-700 text-sm whitespace-pre-line">
                {error}
              </div>
              <div className="mt-3 pt-3 border-t border-red-200">
                <div className="text-red-600 text-xs">
                  🔧 Nếu vẫn gặp lỗi, vui lòng liên hệ bộ phận kỹ thuật để được hỗ trợ.
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button 
              onClick={handleSimulate} 
              disabled={isLoading || !selectedProduct || (!selectedProduct && !customSku.trim())}
              className="flex-1"
            >
              {isLoading ? '⏳ Đang tính toán giá...' : '🎯 Tính giá'}
            </Button>
            <Button 
              variant="outline" 
              onClick={resetForm}
              disabled={isLoading}
              title="Xóa tất cả và bắt đầu lại"
            >
              🔄 Reset
            </Button>
          </div>
          
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-lg">
              <div className="text-center">
                <div className="animate-spin text-2xl mb-2">⏳</div>
                <div className="text-sm text-gray-600">Đang tính toán giá tối ưu...</div>
              </div>
            </div>
          )}
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
            {/* Customer Information */}
            {selectedCustomer && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-sm font-medium text-purple-800">👤 Khách hàng:</div>
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                    {selectedCustomer.name}
                  </Badge>
                </div>
                {selectedCustomer.phone && (
                  <div className="text-sm text-purple-600">
                    📞 {selectedCustomer.phone}
                  </div>
                )}
              </div>
            )}

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

            {/* Logic Explanation */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                🧠 Tại sao có kết quả này?
              </h4>
              <div className="text-sm text-blue-700 space-y-2">
                {result.appliedRuleId ? (
                  <div>
                    <div className="font-medium mb-1">📋 Quy trình tính giá:</div>
                    <div className="ml-2 space-y-1">
                      <div>• Giá gốc: {result.listPrice.toLocaleString('vi-VN')}đ</div>
                      <div>• Số lượng: {result.quantity} sản phẩm</div>
                      <div>• Áp dụng quy tắc #{result.appliedRuleId}</div>
                      <div>• Giá sau quy tắc: {result.finalPrice.toLocaleString('vi-VN')}đ/sản phẩm</div>
                      {result.totalSavings > 0 && (
                        <div className="text-green-600 font-medium">
                          • Tiết kiệm: {(result.totalSavings / result.quantity).toLocaleString('vi-VN')}đ/sản phẩm
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium mb-1">📋 Không có quy tắc áp dụng:</div>
                    <div className="ml-2 space-y-1">
                      <div>• Sản phẩm không có quy tắc giá đặc biệt</div>
                      <div>• Hoặc không đáp ứng điều kiện (số lượng, thời gian...)</div>
                      <div>• Sử dụng giá niêm yết: {result.listPrice.toLocaleString('vi-VN')}đ</div>
                    </div>
                  </div>
                )}
                
                {/* Special case explanation for SP000049 */}
                {(selectedProduct?.product_code === 'SP000049' || customSku.toUpperCase() === 'SP000049') && (
                  <div className="mt-3 p-3 bg-yellow-100 border border-yellow-200 rounded">
                    <div className="font-medium text-yellow-800 mb-2">
                      🔍 Chi tiết quy tắc SP000049:
                    </div>
                    <div className="text-xs text-yellow-700 space-y-1">
                      <div><strong>Quy tắc #1:</strong> Priority 100 - Giá 190.000đ (qty 1-30) ✅ Tốt nhất</div>
                      <div><strong>Quy tắc #667:</strong> Priority 120 - Giảm 5.000đ cho tag HOT (hiện tại bị tắt)</div>
                      <div><strong>Quy tắc #672:</strong> Giảm 5.000đ khi mua từ 3 sản phẩm trở lên</div>
                      <div className="mt-2 font-medium">
                        {result.quantity <= 30 ? (
                          <span className="text-green-600">
                            → Với số lượng {result.quantity}, Quy tắc #1 được áp dụng (giá tốt nhất)
                          </span>
                        ) : (
                          <span className="text-amber-600">
                            → Với số lượng {result.quantity}, Quy tắc #672 được áp dụng (215.000đ)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
        </>
      )}
    </div>
  )
}
