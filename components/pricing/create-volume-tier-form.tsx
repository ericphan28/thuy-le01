'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export default function CreateVolumeTierForm() {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState({
    scope: 'sku' as 'sku' | 'category',
    product_id: '',
    category_id: '',
    min_qty: '',
    discount_type: 'percent' as 'percent' | 'amount',
    discount_percent: '',
    discount_amount: '',
    effective_from: '',
    effective_to: '',
    notes: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [supabase, setSupabase] = useState<any>(null)
  
  const router = useRouter()

  // Initialize Supabase client in useEffect
  useEffect(() => {
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!
    )
    console.log('🔍 Initializing Supabase client directly:', client)
    setSupabase(client)
  }, [])

  // Debug Supabase client
  console.log('🔍 Supabase client state:', supabase)
  console.log('🔍 Supabase client type:', typeof supabase)

  // Search products/categories
  const handleSearch = async (query: string) => {
    if (!query.trim() || !supabase) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      if (formData.scope === 'sku') {
        const { data } = await supabase
          .from('products')
          .select('product_id, product_code, product_name, sale_price')
          .or(`product_name.ilike.%${query}%,product_code.ilike.%${query}%`)
          .limit(10)
        setSearchResults(data || [])
      } else {
        const { data } = await supabase
          .from('product_categories')
          .select('category_id, category_name, category_code')
          .ilike('category_name', `%${query}%`)
          .limit(10)
        setSearchResults(data || [])
      }
    } catch (error) {
      console.error('Search error:', error)
    }
    setIsSearching(false)
  }

  // Calculate preview
  const calculatePreview = () => {
    const minQty = Number(formData.min_qty) || 0
    const basePrice = 10000 // Example price
    let discountedPrice = basePrice

    if (formData.discount_type === 'percent' && formData.discount_percent) {
      discountedPrice = basePrice * (1 - Number(formData.discount_percent) / 100)
    } else if (formData.discount_type === 'amount' && formData.discount_amount) {
      discountedPrice = Math.max(0, basePrice - Number(formData.discount_amount))
    }

    const originalTotal = minQty * basePrice
    const discountedTotal = minQty * discountedPrice
    const savings = originalTotal - discountedTotal

    return {
      minQty,
      basePrice,
      discountedPrice: Math.round(discountedPrice),
      originalTotal: Math.round(originalTotal),
      discountedTotal: Math.round(discountedTotal),
      savings: Math.round(savings),
      savingsPercent: Math.round((savings / originalTotal) * 100) || 0
    }
  }

  const preview = calculatePreview()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Check if supabase client is available
      if (!supabase || typeof supabase.from !== 'function') {
        console.error('❌ Supabase client is not available:', supabase)
        throw new Error('Supabase client is not available')
      }

      const tierData = {
        scope: formData.scope,
        product_id: formData.scope === 'sku' ? Number(formData.product_id) || null : null,
        category_id: formData.scope === 'category' ? Number(formData.category_id) || null : null,
        min_qty: Number(formData.min_qty),
        discount_percent: formData.discount_type === 'percent' ? Number(formData.discount_percent) || null : null,
        discount_amount: formData.discount_type === 'amount' ? Number(formData.discount_amount) || null : null,
        effective_from: formData.effective_from || null,
        effective_to: formData.effective_to || null,
        is_active: true,
        notes: formData.notes || null
      }

      console.log('🚀 Creating volume tier with data:', tierData)

      const { error, data } = await supabase
        .from('volume_tiers')
        .insert(tierData)
        .select()

      if (error) {
        console.error('❌ Supabase error:', error)
        throw error
      }

      console.log('✅ Volume tier created successfully:', data)

      // Reset form
      setFormData({
        scope: 'sku',
        product_id: '',
        category_id: '',
        min_qty: '',
        discount_type: 'percent',
        discount_percent: '',
        discount_amount: '',
        effective_from: '',
        effective_to: '',
        notes: ''
      })
      setIsOpen(false)
      setSearchResults([])
      setSearchQuery('')

      // Refresh page
      router.refresh()
    } catch (error) {
      console.error('Error creating volume tier:', error)
      alert('Có lỗi xảy ra khi tạo bậc số lượng. Vui lòng thử lại.')
    }
    setIsSubmitting(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          ➕ Tạo bậc số lượng mới
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm"
            disabled={!supabase}
          >
            {!supabase ? 'Đang tải...' : isOpen ? 'Đóng' : 'Tạo mới'}
          </button>
        </CardTitle>
      </CardHeader>
      
      {isOpen && (
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Chọn phạm vi */}
            <div className="space-y-3">
              <h3 className="font-medium">1️⃣ Chọn phạm vi áp dụng</h3>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="sku"
                    checked={formData.scope === 'sku'}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      scope: e.target.value as 'sku' | 'category',
                      product_id: '',
                      category_id: ''
                    }))}
                  />
                  <Badge variant="outline">🎯 Sản phẩm cụ thể</Badge>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="category"
                    checked={formData.scope === 'category'}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      scope: e.target.value as 'sku' | 'category',
                      product_id: '',
                      category_id: ''
                    }))}
                  />
                  <Badge variant="outline">📂 Toàn bộ danh mục</Badge>
                </label>
              </div>
            </div>

            {/* Step 2: Chọn sản phẩm/danh mục */}
            <div className="space-y-3">
              <h3 className="font-medium">
                2️⃣ Chọn {formData.scope === 'sku' ? 'sản phẩm' : 'danh mục'}
              </h3>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    handleSearch(e.target.value)
                  }}
                  placeholder={formData.scope === 'sku' ? 
                    'Tìm kiếm sản phẩm theo tên hoặc mã...' : 
                    'Tìm kiếm danh mục...'
                  }
                  className="w-full border rounded px-3 py-2"
                />
                
                {isSearching && (
                  <div className="absolute top-full left-0 right-0 bg-white border rounded-b shadow-lg p-2">
                    Đang tìm kiếm...
                  </div>
                )}
                
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border rounded-b shadow-lg max-h-48 overflow-y-auto z-10">
                    {searchResults.map((item) => (
                      <button
                        key={formData.scope === 'sku' ? item.product_id : item.category_id}
                        type="button"
                        className="w-full text-left p-3 hover:bg-accent border-b last:border-b-0"
                        onClick={() => {
                          if (formData.scope === 'sku') {
                            setFormData(prev => ({ ...prev, product_id: item.product_id.toString() }))
                            setSearchQuery(`${item.product_name} (${item.product_code})`)
                          } else {
                            setFormData(prev => ({ ...prev, category_id: item.category_id.toString() }))
                            setSearchQuery(item.category_name)
                          }
                          setSearchResults([])
                        }}
                      >
                        <div className="font-medium">
                          {formData.scope === 'sku' ? item.product_name : item.category_name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formData.scope === 'sku' ? 
                            `${item.product_code} • ${item.sale_price?.toLocaleString('vi-VN')}₫` :
                            `ID: ${item.category_id}`
                          }
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Điều kiện số lượng */}
            <div className="space-y-3">
              <h3 className="font-medium">3️⃣ Điều kiện số lượng</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Số lượng tối thiểu <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={formData.min_qty}
                    onChange={(e) => setFormData(prev => ({ ...prev, min_qty: e.target.value }))}
                    className="w-full border rounded px-3 py-2"
                    placeholder="VD: 10"
                  />
                </div>
              </div>
            </div>

            {/* Step 4: Chiết khấu */}
            <div className="space-y-3">
              <h3 className="font-medium">4️⃣ Mức chiết khấu</h3>
              <div className="flex gap-3 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="percent"
                    checked={formData.discount_type === 'percent'}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      discount_type: e.target.value as 'percent' | 'amount',
                      discount_percent: '',
                      discount_amount: ''
                    }))}
                  />
                  <span>🏷️ Giảm theo phần trăm (%)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="amount"
                    checked={formData.discount_type === 'amount'}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      discount_type: e.target.value as 'percent' | 'amount',
                      discount_percent: '',
                      discount_amount: ''
                    }))}
                  />
                  <span>💰 Giảm số tiền cố định (₫)</span>
                </label>
              </div>

              {formData.discount_type === 'percent' ? (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Phần trăm giảm giá <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                    value={formData.discount_percent}
                    onChange={(e) => setFormData(prev => ({ ...prev, discount_percent: e.target.value }))}
                    className="w-full border rounded px-3 py-2"
                    placeholder="VD: 10 (tức 10%)"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Số tiền giảm (VNĐ) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    required
                    value={formData.discount_amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, discount_amount: e.target.value }))}
                    className="w-full border rounded px-3 py-2"
                    placeholder="VD: 5000 (tức giảm 5.000₫)"
                  />
                </div>
              )}
            </div>

            {/* Preview */}
            {formData.min_qty && (formData.discount_percent || formData.discount_amount) && (
              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <h4 className="font-medium text-blue-800 mb-3">👀 Xem trước kết quả</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-blue-700 mb-2">Ví dụ mua {preview.minQty} sản phẩm:</div>
                    <div className="text-muted-foreground line-through">
                      {preview.originalTotal.toLocaleString('vi-VN')}₫ (giá gốc)
                    </div>
                    <div className="font-bold text-green-600">
                      {preview.discountedTotal.toLocaleString('vi-VN')}₫ (sau chiết khấu)
                    </div>
                  </div>
                  <div>
                    <div className="text-green-600 font-bold">
                      🎉 Tiết kiệm: {preview.savings.toLocaleString('vi-VN')}₫
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Giá mỗi sản phẩm: {preview.discountedPrice.toLocaleString('vi-VN')}₫
                    </div>
                    <div className="text-sm font-medium text-green-600">
                      Tiết kiệm {preview.savingsPercent}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Thời gian hiệu lực (tuỳ chọn) */}
            <div className="space-y-3">
              <h3 className="font-medium">5️⃣ Thời gian hiệu lực (tuỳ chọn)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Bắt đầu từ</label>
                  <input
                    type="date"
                    value={formData.effective_from}
                    onChange={(e) => setFormData(prev => ({ ...prev, effective_from: e.target.value }))}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Kết thúc vào</label>
                  <input
                    type="date"
                    value={formData.effective_to}
                    onChange={(e) => setFormData(prev => ({ ...prev, effective_to: e.target.value }))}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
            </div>

            {/* Step 6: Ghi chú */}
            <div className="space-y-3">
              <h3 className="font-medium">6️⃣ Ghi chú (tuỳ chọn)</h3>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full border rounded px-3 py-2"
                rows={3}
                placeholder="VD: Khuyến mãi mua sỉ cho nhà thuốc đại lý..."
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !formData.min_qty || 
                  (!formData.discount_percent && !formData.discount_amount) ||
                  (!formData.product_id && !formData.category_id)}
                className="px-6 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
              >
                {isSubmitting ? '⏳ Đang tạo...' : '✅ Tạo bậc số lượng'}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-6 py-2 border rounded hover:bg-accent"
              >
                ❌ Hủy
              </button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  )
}
