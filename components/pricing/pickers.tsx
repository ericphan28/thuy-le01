'use client'

import { useMemo, useRef, useState } from 'react'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'

export type ProductItem = {
  product_code: string
  product_name: string
  sale_price?: number | null
  base_price?: number | null
}

export type CategoryItem = {
  category_id: number
  category_name: string
}

function money(n: number) {
  return n.toLocaleString('vi-VN') + '₫'
}

export function SkuPicker({
  items,
  name,
  defaultValue,
  className,
  onValueChange,
}: {
  items: ProductItem[]
  name: string
  defaultValue?: string
  className?: string
  onValueChange?: (product: ProductItem | null) => void
}) {
  const initial = useMemo(() => items.find(p => p.product_code === defaultValue) || null, [items, defaultValue])
  const [value, setValue] = useState<ProductItem | null>(initial)
  const [list, setList] = useState<ProductItem[]>(items)
  const cacheRef = useRef<Record<string, ProductItem[]>>({})
  const lastQueryRef = useRef<string>('')
  const timerRef = useRef<any>(null)
  const label = (p: ProductItem) => `${p.product_code} | ${p.product_name}`
  const listPrice = value ? (value.sale_price ?? value.base_price ?? null) : null

  const handleValueChange = (v: ProductItem | null) => {
    setValue(v)
    onValueChange?.(v)
  }

  return (
    <div className={className}>
      <SearchableCombobox
        items={list}
        value={value || undefined}
        onValueChange={(v) => handleValueChange(v as ProductItem | null)}
        getItemId={(p) => p.product_code}
        getItemLabel={label}
        placeholder="Chọn sản phẩm..."
        onSearch={(q) => {
          const query = (q || '').trim()
          // Guard: ignore empty (tránh spam request q="")
          if (!query) return
          // Guard: ignore identical query liên tiếp
            if (query === lastQueryRef.current) return
          lastQueryRef.current = query
          // Cached
          if (cacheRef.current[query]) {
            setList(cacheRef.current[query])
            return
          }
          // Debounce 300ms
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(async () => {
            try {
              const res = await fetch(`/api/search/products?q=${encodeURIComponent(query)}`)
              const json = await res.json()
              if (Array.isArray(json.items)) {
                cacheRef.current[query] = json.items
                setList(json.items)
              }
            } catch {}
          }, 300)
        }}
      />
      <input type="hidden" name={name} value={value?.product_code ?? ''} />
      <div className="text-xs text-muted-foreground mt-1">
        {value ? (
          <span title="Giá hiện tại trong danh mục">
            Giá niêm yết: {listPrice != null ? money(listPrice) : '-'}
          </span>
        ) : (
          <span>Gõ để tìm theo mã/tên sản phẩm</span>
        )}
      </div>
    </div>
  )
}

export function CategoryPicker({
  items,
  name,
  defaultValue,
  className,
}: {
  items: CategoryItem[]
  name: string
  defaultValue?: number
  className?: string
}) {
  const initial = useMemo(() => items.find(c => c.category_id === defaultValue) || null, [items, defaultValue])
  const [value, setValue] = useState<CategoryItem | null>(initial)
  const [list, setList] = useState<CategoryItem[]>(items)
  const cacheRef = useRef<Record<string, CategoryItem[]>>({})
  const lastQueryRef = useRef<string>('')
  const timerRef = useRef<any>(null)
  const label = (c: CategoryItem) => `${c.category_name} (#${c.category_id})`

  return (
    <div className={className}>
      <SearchableCombobox
        items={list}
        value={value || undefined}
        onValueChange={(v) => setValue(v as CategoryItem | null)}
        getItemId={(c) => c.category_id}
        getItemLabel={label}
        placeholder="Chọn ngành hàng..."
        onSearch={(q) => {
          const query = (q || '').trim()
          if (!query) return
          if (query === lastQueryRef.current) return
          lastQueryRef.current = query
          if (cacheRef.current[query]) {
            setList(cacheRef.current[query])
            return
          }
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(async () => {
            try {
              const res = await fetch(`/api/search/categories?q=${encodeURIComponent(query)}`)
              const json = await res.json()
              if (Array.isArray(json.items)) {
                cacheRef.current[query] = json.items
                setList(json.items)
              }
            } catch {}
          }, 300)
        }}
      />
      <input type="hidden" name={name} value={value?.category_id ?? ''} />
      <div className="text-xs text-muted-foreground mt-1">
        {value ? <span>Đã chọn: {label(value)}</span> : <span>Gõ để tìm theo tên ngành hàng</span>}
      </div>
    </div>
  )
}
