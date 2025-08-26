'use client'

import { useState, useEffect, useMemo } from 'react'
import { SkuPicker, CategoryPicker, ProductItem, CategoryItem } from './pickers'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type RuleScope = 'sku' | 'category' | 'tag' | ''
type RuleActionType = 'net' | 'percent' | 'amount' | 'promotion' | ''

interface SmartPriceRuleFormProps {
  priceBookId: number
  priceBookName: string
  productList: ProductItem[]
  categoryList: CategoryItem[]
  onSubmit: (formData: FormData) => Promise<void>
  errorMessage?: string
  mode?: 'create' | 'edit'
  initialValues?: Partial<{
    scope: RuleScope
    action_type: RuleActionType
    action_value: number | null
    sku_code: string | null
    category_id: number | null
    tag: string | null
    min_qty: number | null
    max_qty: number | null
    priority: number | null
    is_active: boolean | null
    notes: string | null
    effective_from: string | null
    effective_to: string | null
  }>
  submitLabel?: string
  onDelete?: () => Promise<void>
}

export function SmartPriceRuleForm({
  priceBookId,
  priceBookName,
  productList,
  categoryList,
  onSubmit,
  errorMessage,
  mode = 'create',
  initialValues,
  submitLabel,
  onDelete,
}: SmartPriceRuleFormProps) {
  const [scope, setScope] = useState<RuleScope>(initialValues?.scope || '')
  const [actionType, setActionType] = useState<RuleActionType>(initialValues?.action_type || '')
  const [actionValue, setActionValue] = useState<number>(initialValues?.action_value ?? 0)
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null)
  const [minQty, setMinQty] = useState<number>(initialValues?.min_qty ?? 1)
  const [maxQty, setMaxQty] = useState<number | ''>(initialValues?.max_qty ?? '')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (initialValues?.sku_code && productList.length) {
      const found = productList.find(p => p.product_code === initialValues.sku_code) || null
      setSelectedProduct(found)
    }
  }, [initialValues?.sku_code, productList])

  useEffect(() => {
    if (mode === 'edit') setDirty(true)
  }, [mode, scope, actionType, actionValue, minQty, maxQty])  // Added mode to dependency array

  // Smart action type suggestions based on scope
  const suggestedActions = useMemo(() => {
    switch (scope) {
      case 'sku':
        return [
          { value: 'net', label: '💰 Giá cố định', desc: 'Đặt giá bán chính xác' },
          { value: 'percent', label: '📊 Giảm %', desc: 'Giảm % từ giá niêm yết' },
          { value: 'promotion', label: '🎁 Khuyến mãi', desc: 'Giá đặc biệt có thời hạn' }
        ]
      case 'category':
        return [
          { value: 'percent', label: '📊 Giảm %', desc: 'Giảm % cho cả ngành hàng' },
          { value: 'amount', label: '💸 Giảm tiền', desc: 'Giảm số tiền cố định' },
          { value: 'promotion', label: '🎁 Khuyến mãi', desc: 'Campaign cho ngành hàng' }
        ]
      case 'tag':
        return [
          { value: 'percent', label: '📊 Giảm %', desc: 'Giảm % cho tag' },
          { value: 'promotion', label: '🎁 Khuyến mãi', desc: 'Campaign theo tag' }
        ]
      default:
        return []
    }
  }, [scope])

  // Calculate preview price
  const previewPrice = useMemo(() => {
    if (!selectedProduct || !actionType || !actionValue) return null
    
    const basePrice = selectedProduct.sale_price || selectedProduct.base_price || 0
    
    switch (actionType) {
      case 'net':
        return actionValue
      case 'percent':
        return basePrice * (1 - actionValue / 100)
      case 'amount':
        return Math.max(0, basePrice - actionValue)
      case 'promotion':
        return basePrice * (1 - actionValue / 100) // Assume promotion is percentage
      default:
        return null
    }
  }, [selectedProduct, actionType, actionValue])

  const formatMoney = (amount: number) => amount.toLocaleString('vi-VN') + '₫'

  const getActionValuePlaceholder = () => {
    switch (actionType) {
      case 'net':
        return 'VD: 100000 (giá bán = 100,000₫)'
      case 'percent':
        return 'VD: 10 (giảm 10%)'
      case 'amount':
        return 'VD: 5000 (giảm 5,000₫)'
      case 'promotion':
        return 'VD: 15 (giảm 15% khuyến mãi)'
      default:
        return ''
    }
  }

  const getActionValueSuffix = () => {
    switch (actionType) {
      case 'net':
        return '₫'
      case 'percent':
      case 'promotion':
        return '%'
      case 'amount':
        return '₫'
      default:
        return ''
    }
  }

  const toLocal = (v?: string | null) => {
    if (!v) return ''
    const d = new Date(v)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const finalSubmitLabel = submitLabel || (mode === 'edit' ? '💾 Lưu thay đổi' : '💾 Lưu quy tắc giá')
  const quantityPreview = useMemo(() => {
    const hasMin = minQty !== undefined && minQty !== null && !Number.isNaN(minQty)
    const hasMax = maxQty !== '' && maxQty !== null && maxQty !== undefined && !Number.isNaN(Number(maxQty))
    const maxNumber = hasMax ? Number(maxQty) : null
    if (hasMin && hasMax && minQty > (maxNumber as number)) {
      return { text: 'Lỗi: SL tối thiểu phải ≤ SL tối đa', error: true }
    }
    if (!hasMin && !hasMax) return { text: 'Áp dụng cho mọi số lượng', error: false }
    if (hasMin && hasMax) return { text: `Áp dụng cho ${minQty} ≤ SL ≤ ${maxNumber}`, error: false }
    if (hasMin && !hasMax) return { text: `Áp dụng cho SL ≥ ${minQty}`, error: false }
    if (!hasMin && hasMax) return { text: `Áp dụng cho SL ≤ ${maxNumber}`, error: false }
    return { text: '', error: false }
  }, [minQty, maxQty])

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{mode === 'edit' ? 'Sửa quy tắc giá' : 'Thêm quy tắc giá mới'}</h1>
          <p className="text-muted-foreground">Sổ giá: <span className="font-medium">{priceBookName}</span></p>
        </div>
        {mode === 'edit' && onDelete && (
          <form action={onDelete}>
            <button
              type="submit"
              className="text-sm px-3 py-1.5 border border-destructive text-destructive rounded hover:bg-destructive/5"
              onClick={(e) => { if(!confirm('Xoá quy tắc này?')) { e.preventDefault() } }}
            >🗑️ Xoá</button>
          </form>
        )}
      </div>

      {errorMessage && (
        <div className="border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-3 text-sm">
          {errorMessage}
        </div>
      )}

      <form action={onSubmit} className="space-y-6">
        {/* Step 1: Choose Scope */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 text-sm flex items-center justify-center">1</span>
              Phạm vi áp dụng
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { value: 'sku', label: '🏷️ Sản phẩm', desc: 'Áp dụng cho 1 sản phẩm cụ thể' },
                { value: 'category', label: '📁 Ngành hàng', desc: 'Áp dụng cho cả ngành hàng' },
                { value: 'tag', label: '🏷️ Tag', desc: 'Áp dụng theo nhãn sản phẩm' }
              ].map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer border rounded-lg p-3 text-sm transition-colors ${
                    scope === option.value 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted hover:border-muted-foreground/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={(e) => setScope(e.target.value as RuleScope)}
                    className="sr-only"
                  />
                  <div className="font-medium">{option.label}</div>
                  <div className="text-muted-foreground text-xs mt-1">{option.desc}</div>
                </label>
              ))}
            </div>

            {/* Dynamic Scope Fields */}
            {scope === 'sku' && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Chọn sản phẩm</label>
                <SkuPicker
                  items={productList}
                  name="sku_code"
                  onValueChange={(product) => setSelectedProduct(product)}
                  defaultValue={initialValues?.sku_code || undefined}
                />
              </div>
            )}

            {scope === 'category' && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Chọn ngành hàng</label>
                <CategoryPicker items={categoryList} name="category_id" defaultValue={initialValues?.category_id || undefined} />
              </div>
            )}

            {scope === 'tag' && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Nhập tag</label>
                <input
                  name="tag"
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="VD: HOT, SALE, NEW"
                  defaultValue={initialValues?.tag || ''}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Choose Action Type */}
        {scope && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 text-sm flex items-center justify-center">2</span>
                Loại quy tắc giá
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {suggestedActions.map((action) => (
                  <label
                    key={action.value}
                    className={`cursor-pointer border rounded-lg p-3 text-sm transition-colors ${
                      actionType === action.value
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="action_type"
                      value={action.value}
                      checked={actionType === action.value}
                      onChange={(e) => setActionType(e.target.value as RuleActionType)}
                      className="sr-only"
                    />
                    <div className="font-medium">{action.label}</div>
                    <div className="text-muted-foreground text-xs mt-1">{action.desc}</div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Configure Price */}
        {scope && actionType && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 text-sm flex items-center justify-center">3</span>
                Thiết lập giá
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Giá trị {getActionValueSuffix() && `(${getActionValueSuffix()})`}
                  </label>
                  <input
                    name="action_value"
                    type="number"
                    step="0.01"
                    required
                    className="w-full border rounded-md px-3 py-2"
                    placeholder={getActionValuePlaceholder()}
                    value={actionValue || ''}
                    onChange={(e) => setActionValue(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Số lượng tối thiểu</label>
                  <input
                    name="min_qty"
                    type="number"
                    step="0.01"
                    className="w-full border rounded-md px-3 py-2"
                    placeholder="VD: 1"
                    value={minQty}
                    onChange={(e) => setMinQty(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Số lượng tối đa (tuỳ chọn)</label>
                  <input
                    name="max_qty"
                    type="number"
                    step="0.01"
                    className="w-full border rounded-md px-3 py-2"
                    placeholder="Trống = không giới hạn"
                    value={maxQty}
                    onChange={(e) => {
                      const v = e.target.value
                      setMaxQty(v === '' ? '' : Number(v))
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Để trống nếu áp dụng cho mọi số lượng lớn hơn hoặc bằng tối thiểu.</p>
                </div>
              </div>

              {/* Quantity condition preview */}
              <div className={`text-xs ${quantityPreview.error ? 'text-destructive' : 'text-muted-foreground'}`}>
                {quantityPreview.text}
              </div>

              {/* Price Preview */}
              {selectedProduct && previewPrice !== null && (
                <div className="bg-muted/30 rounded-lg p-4">
                  <h4 className="font-medium text-sm mb-2">📊 Xem trước giá</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Giá niêm yết:</span>
                      <div className="font-medium">
                        {formatMoney(selectedProduct.sale_price || selectedProduct.base_price || 0)}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Giá sau quy tắc:</span>
                      <div className="font-bold text-primary">
                        {formatMoney(previewPrice)}
                      </div>
                    </div>
                  </div>
                  {actionType === 'promotion' && (
                    <Badge variant="secondary" className="mt-2">🎁 Khuyến mãi</Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Additional Settings */}
        {scope && actionType && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 text-sm flex items-center justify-center">4</span>
                Thiết lập bổ sung
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Ưu tiên</label>
                  <input
                    name="priority"
                    type="number"
                    className="w-full border rounded-md px-3 py-2"
                    defaultValue={initialValues?.priority ?? 100}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Số lớn hơn = ưu tiên cao hơn
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Hiệu lực từ</label>
                  <input
                    name="effective_from"
                    type="datetime-local"
                    className="w-full border rounded-md px-3 py-2"
                    defaultValue={toLocal(initialValues?.effective_from)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Hiệu lực đến</label>
                  <input
                    name="effective_to"
                    type="datetime-local"
                    className="w-full border rounded-md px-3 py-2"
                    defaultValue={toLocal(initialValues?.effective_to)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Ghi chú</label>
                <textarea
                  name="notes"
                  className="w-full border rounded-md px-3 py-2"
                  rows={3}
                  placeholder="Ghi chú nội bộ cho quy tắc này..."
                  defaultValue={initialValues?.notes || ''}
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input name="is_active" type="checkbox" defaultChecked={initialValues?.is_active ?? true} />
                  <span>Kích hoạt quy tắc</span>
                </label>
                {mode === 'edit' && !dirty && (
                  <span className="text-xs text-muted-foreground">Không thay đổi dữ liệu.</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hidden fields */}
        <input type="hidden" name="price_book_id" value={priceBookId} />

        {/* Submit */}
        {scope && actionType && (
          <div className="flex gap-3">
            <button
              type="submit"
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
              disabled={mode === 'edit' && !dirty}
            >
              {finalSubmitLabel}
            </button>
            <a
              href={`/dashboard/pricing/books/${priceBookId}`}
              className="px-6 py-2 border rounded-md font-medium hover:bg-muted"
            >
              ❌ Hủy
            </a>
          </div>
        )}
      </form>
    </div>
  )
}
