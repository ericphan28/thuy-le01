'use client'

import { useState, useMemo } from 'react'
import { Badge } from "@/components/ui/badge"

type PriceBook = {
  price_book_id: number
  name: string
  is_active: boolean
}

type Product = {
  product_code: string
  product_name: string
  sale_price?: number | null
  base_price?: number | null
  cost_price?: number | null
}

type Category = {
  category_id: number
  category_name: string
}

interface PromotionCreateFormProps {
  books: PriceBook[]
  products: Product[]
  categories: Category[]
  onSubmit: (formData: FormData) => void
}

export default function PromotionCreateForm({
  books,
  products,
  categories,
  onSubmit
}: PromotionCreateFormProps) {
  const [selectedBook, setSelectedBook] = useState<number | ''>('')
  const [scope, setScope] = useState<string>('')
  const [actionType, setActionType] = useState<string>('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [tag, setTag] = useState<string>('')
  const [actionValue, setActionValue] = useState<string>('')
  const [productSearch, setProductSearch] = useState<string>('')
  const [categorySearch, setCategorySearch] = useState<string>('')

  // Filtered lists for search
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 100)
    const q = productSearch.toLowerCase()
    return products.filter(p => 
      p.product_code.toLowerCase().includes(q) ||
      p.product_name.toLowerCase().includes(q)
    ).slice(0, 100)
  }, [products, productSearch])

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories
    const q = categorySearch.toLowerCase()
    return categories.filter(c => 
      c.category_name.toLowerCase().includes(q)
    )
  }, [categories, categorySearch])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    onSubmit(formData)
  }

  const getValuePlaceholder = () => {
    switch (actionType) {
      case 'percent': return '10'
      case 'amount': return '50000'
      case 'net': return '100000'
      default: return '0'
    }
  }

  const getValueHelp = () => {
    switch (actionType) {
      case 'percent': return 'Nhập % giảm (VD: 10 = giảm 10%)'
      case 'amount': return 'Nhập số tiền giảm (VD: 50000 = giảm 50,000₫)'
      case 'net': return 'Nhập giá bán cố định (VD: 100000 = bán 100,000₫)'
      default: return 'Nhập giá trị tương ứng với loại khuyến mãi đã chọn'
    }
  }

  const formatPrice = (price: number | null | undefined) => {
    if (!price) return '-'
    return price.toLocaleString('vi-VN') + '₫'
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Price Book Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Bảng giá áp dụng <span className="text-destructive">*</span></label>
          <select 
            name="price_book_id" 
            value={selectedBook}
            onChange={(e) => setSelectedBook(Number(e.target.value) || '')}
            className="w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" 
            required
          >
            <option value="">Chọn bảng giá</option>
            {books.map(b => (
              <option key={b.price_book_id} value={b.price_book_id}>
                {b.name} {!b.is_active && '(Tắt)'}
              </option>
            ))}
          </select>
          <div className="text-xs text-muted-foreground mt-1">
            Khuyến mãi sẽ áp dụng trong bảng giá này
          </div>
        </div>

        {/* Scope Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Phạm vi áp dụng <span className="text-destructive">*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className={`border rounded-lg p-3 cursor-pointer transition-colors ${
              scope === 'sku' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input 
                type="radio" 
                name="scope" 
                value="sku" 
                checked={scope === 'sku'}
                onChange={(e) => setScope(e.target.value)}
                className="sr-only" 
              />
              <div className="text-sm font-medium">Sản phẩm cụ thể</div>
              <div className="text-xs text-muted-foreground">Áp dụng cho 1 sản phẩm</div>
            </label>
            
            <label className={`border rounded-lg p-3 cursor-pointer transition-colors ${
              scope === 'category' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input 
                type="radio" 
                name="scope" 
                value="category" 
                checked={scope === 'category'}
                onChange={(e) => setScope(e.target.value)}
                className="sr-only" 
              />
              <div className="text-sm font-medium">Danh mục</div>
              <div className="text-xs text-muted-foreground">Áp dụng cho cả danh mục</div>
            </label>
            
            <label className={`border rounded-lg p-3 cursor-pointer transition-colors ${
              scope === 'tag' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input 
                type="radio" 
                name="scope" 
                value="tag" 
                checked={scope === 'tag'}
                onChange={(e) => setScope(e.target.value)}
                className="sr-only" 
              />
              <div className="text-sm font-medium">Nhãn</div>
              <div className="text-xs text-muted-foreground">Áp dụng theo tag</div>
            </label>
          </div>
        </div>

        {/* SKU Picker */}
        {scope === 'sku' && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <label className="block text-sm font-medium mb-2">Chọn sản phẩm <span className="text-destructive">*</span></label>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Tìm theo mã hoặc tên sản phẩm..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              
              <div className="max-h-60 overflow-y-auto border rounded-lg bg-white">
                {filteredProducts.map(p => {
                  const isSelected = selectedProduct?.product_code === p.product_code
                  const price = p.sale_price ?? p.base_price
                  return (
                    <label 
                      key={p.product_code}
                      className={`block p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                        isSelected ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="sku_code"
                        value={p.product_code}
                        checked={isSelected}
                        onChange={() => setSelectedProduct(p)}
                        className="sr-only"
                      />
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{p.product_name}</div>
                          <div className="text-xs text-muted-foreground">Mã: {p.product_code}</div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="text-muted-foreground">Giá bán: {formatPrice(price)}</div>
                          {p.cost_price && (
                            <div className="text-muted-foreground">Giá gốc: {formatPrice(p.cost_price)}</div>
                          )}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
              
              {selectedProduct && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-sm font-medium text-green-800">
                    ✓ Đã chọn: {selectedProduct.product_name} ({selectedProduct.product_code})
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    Giá hiện tại: {formatPrice(selectedProduct.sale_price ?? selectedProduct.base_price)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Category Picker */}
        {scope === 'category' && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <label className="block text-sm font-medium mb-2">Chọn danh mục <span className="text-destructive">*</span></label>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Tìm theo tên danh mục..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              
              <div className="max-h-48 overflow-y-auto border rounded-lg bg-white">
                {filteredCategories.map(c => {
                  const isSelected = selectedCategory?.category_id === c.category_id
                  return (
                    <label 
                      key={c.category_id}
                      className={`block p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                        isSelected ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="category_id"
                        value={c.category_id}
                        checked={isSelected}
                        onChange={() => setSelectedCategory(c)}
                        className="sr-only"
                      />
                      <div className="flex justify-between items-center">
                        <div className="font-medium text-sm">{c.category_name}</div>
                        <Badge variant="outline" className="text-xs">#{c.category_id}</Badge>
                      </div>
                    </label>
                  )
                })}
              </div>
              
              {selectedCategory && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-sm font-medium text-green-800">
                    ✓ Đã chọn: {selectedCategory.category_name} (#{selectedCategory.category_id})
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tag Input */}
        {scope === 'tag' && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <label className="block text-sm font-medium mb-2">Nhãn sản phẩm <span className="text-destructive">*</span></label>
            <input 
              name="tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="w-full border rounded-lg px-3 py-2" 
              placeholder="VD: HOT, SALE, NEW, COMBO..."
              required={scope === 'tag'}
            />
            <div className="text-xs text-muted-foreground mt-2">
              Áp dụng cho tất cả sản phẩm có nhãn này. Các nhãn phổ biến: HOT, SALE, NEW, COMBO
            </div>
          </div>
        )}

        {/* Promotion Type */}
        <div>
          <label className="block text-sm font-medium mb-2">Loại khuyến mãi <span className="text-destructive">*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className={`border rounded-lg p-3 cursor-pointer transition-colors ${
              actionType === 'percent' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input 
                type="radio" 
                name="action_type" 
                value="percent" 
                checked={actionType === 'percent'}
                onChange={(e) => setActionType(e.target.value)}
                className="sr-only" 
              />
              <div className="text-sm font-medium">Giảm %</div>
              <div className="text-xs text-muted-foreground">Giảm theo phần trăm</div>
            </label>
            
            <label className={`border rounded-lg p-3 cursor-pointer transition-colors ${
              actionType === 'amount' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input 
                type="radio" 
                name="action_type" 
                value="amount" 
                checked={actionType === 'amount'}
                onChange={(e) => setActionType(e.target.value)}
                className="sr-only" 
              />
              <div className="text-sm font-medium">Giảm tiền</div>
              <div className="text-xs text-muted-foreground">Giảm số tiền cố định</div>
            </label>
            
            <label className={`border rounded-lg p-3 cursor-pointer transition-colors ${
              actionType === 'net' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input 
                type="radio" 
                name="action_type" 
                value="net" 
                checked={actionType === 'net'}
                onChange={(e) => setActionType(e.target.value)}
                className="sr-only" 
              />
              <div className="text-sm font-medium">Giá cố định</div>
              <div className="text-xs text-muted-foreground">Bán với giá cố định</div>
            </label>
            
            <label className={`border rounded-lg p-3 cursor-pointer transition-colors ${
              actionType === 'promotion' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input 
                type="radio" 
                name="action_type" 
                value="promotion" 
                checked={actionType === 'promotion'}
                onChange={(e) => setActionType(e.target.value)}
                className="sr-only" 
              />
              <div className="text-sm font-medium">Đặc biệt</div>
              <div className="text-xs text-muted-foreground">Khuyến mãi đặc biệt</div>
            </label>
          </div>
        </div>

        {/* Promotion Value */}
        {actionType && actionType !== 'promotion' && (
          <div>
            <label className="block text-sm font-medium mb-2">Giá trị khuyến mãi <span className="text-destructive">*</span></label>
            <input 
              name="action_value"
              type="number" 
              step="0.01" 
              min="0"
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
              className="w-full border rounded-lg px-3 py-2.5" 
              placeholder={getValuePlaceholder()}
              required
            />
            <div className="text-xs text-muted-foreground mt-1">
              {getValueHelp()}
            </div>
          </div>
        )}

        {/* Quantity Conditions */}
        <div>
          <label className="block text-sm font-medium mb-2">Điều kiện số lượng (tùy chọn)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Số lượng tối thiểu</label>
              <input 
                name="min_qty" 
                type="number" 
                step="0.01" 
                min="0"
                className="w-full border rounded-lg px-3 py-2" 
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Số lượng tối đa</label>
              <input 
                name="max_qty" 
                type="number" 
                step="0.01" 
                min="0"
                className="w-full border rounded-lg px-3 py-2" 
                placeholder="Không giới hạn"
              />
            </div>
          </div>
        </div>

        {/* Time Range */}
        <div>
          <label className="block text-sm font-medium mb-2">Thời gian hiệu lực (tùy chọn)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Hiệu lực từ</label>
              <input 
                name="effective_from" 
                type="datetime-local"
                className="w-full border rounded-lg px-3 py-2" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Hiệu lực đến</label>
              <input 
                name="effective_to" 
                type="datetime-local"
                className="w-full border rounded-lg px-3 py-2" 
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Để trống nếu muốn áp dụng vô thời hạn
          </div>
        </div>

        {/* Priority & Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Độ ưu tiên</label>
            <input 
              name="priority" 
              type="number" 
              min="1"
              defaultValue="100"
              className="w-full border rounded-lg px-3 py-2" 
            />
            <div className="text-xs text-muted-foreground mt-1">
              Số càng nhỏ thì độ ưu tiên càng cao
            </div>
          </div>
          
          <div className="flex items-center pt-7">
            <input 
              name="is_active" 
              type="checkbox" 
              defaultChecked
              className="rounded mr-2" 
              id="is_active"
            />
            <label htmlFor="is_active" className="text-sm">Kích hoạt khuyến mãi ngay</label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-2">Ghi chú</label>
          <textarea 
            name="notes" 
            className="w-full border rounded-lg px-3 py-2 h-20" 
            placeholder="Mô tả chi tiết về khuyến mãi, điều kiện áp dụng..."
          />
        </div>

        {/* Submit Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-6">
          <button 
            type="submit" 
            className="w-full sm:w-auto px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 font-medium"
          >
            Tạo khuyến mãi
          </button>
          <a 
            href="/dashboard/pricing/promotions" 
            className="w-full sm:w-auto px-6 py-3 border rounded-lg hover:bg-accent text-center"
          >
            Hủy
          </a>
        </div>
      </form>
    </div>
  )
}
