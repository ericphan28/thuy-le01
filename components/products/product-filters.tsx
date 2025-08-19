"use client"

import { useState, useEffect } from 'react'
import { ProductFilters } from '@/lib/services/product-service'
import { useProductCategories, useBrands } from '@/lib/hooks/use-products'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { 
  Search, 
  Filter, 
  X, 
  Package,
  AlertTriangle,
  Pill,
  SortAsc,
  SortDesc
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProductFiltersProps {
  filters: ProductFilters
  onFiltersChange: (filters: ProductFilters) => void
  onReset: () => void
  className?: string
  compact?: boolean
}

export function ProductFiltersComponent({ 
  filters, 
  onFiltersChange, 
  onReset,
  className,
  compact = false 
}: ProductFiltersProps) {
  const { categories } = useProductCategories()
  const { brands } = useBrands()
  const [localFilters, setLocalFilters] = useState<ProductFilters>(filters)

  useEffect(() => {
    console.log('🔄 ProductFilters - filters prop changed:', filters)
    setLocalFilters(filters)
  }, [filters])

  const handleFilterChange = (key: keyof ProductFilters, value: any) => {
    console.log('🎛️ Filter change:', { key, value, currentFilters: localFilters })
    const newFilters = { ...localFilters, [key]: value }
    setLocalFilters(newFilters)
    console.log('🚀 Calling onFiltersChange with:', newFilters)
    onFiltersChange(newFilters)
  }

  const handleSearchChange = (value: string) => {
    setLocalFilters(prev => ({ ...prev, search: value }))
  }

  const handleSearchSubmit = () => {
    console.log('🔍 Search submit:', { search: localFilters.search, allFilters: localFilters })
    onFiltersChange(localFilters)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchSubmit()
    }
  }

  const clearFilter = (key: keyof ProductFilters) => {
    const newFilters = { ...localFilters }
    delete newFilters[key]
    setLocalFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const clearAllFilters = () => {
    console.log('🧹 Clearing all filters')
    const emptyFilters = {
      page: 1,
      limit: 20,
      sort_by: 'product_name',
      sort_order: 'asc'
    } as ProductFilters
    setLocalFilters(emptyFilters)
    onReset()
  }

  const activeFiltersCount = Object.keys(filters).filter(key => 
    key !== 'page' && key !== 'limit' && filters[key as keyof ProductFilters] !== undefined
  ).length

  const quickFilters = [
    {
      key: 'low_stock' as const,
      label: 'Sắp hết hàng',
      icon: AlertTriangle,
      color: 'text-orange-600 bg-orange-50 border-orange-200'
    },
    {
      key: 'out_of_stock' as const,
      label: 'Hết hàng',
      icon: Package,
      color: 'text-red-600 bg-red-50 border-red-200'
    },
    {
      key: 'is_medicine' as const,
      label: 'Thuốc',
      icon: Pill,
      color: 'text-blue-600 bg-blue-50 border-blue-200'
    }
  ]

  return (
    <Card className={className}>
      <CardHeader className={cn("pb-4", compact && "pb-2")}>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <span>Bộ lọc sản phẩm</span>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFiltersCount}
              </Badge>
            )}
          </div>
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-4 w-4 mr-1" />
              Xóa tất cả
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Tìm kiếm</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="search"
                placeholder="Tên, mã sản phẩm, barcode, thương hiệu..."
                value={localFilters.search || ''}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyPress={handleKeyPress}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearchSubmit} size="default">
              Tìm
            </Button>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="space-y-2">
          <Label>Bộ lọc nhanh</Label>
          <div className="flex flex-wrap gap-2">
            {quickFilters.map((filter) => {
              const isActive = filters[filter.key]
              const Icon = filter.icon
              
              return (
                <button
                  key={filter.key}
                  onClick={() => handleFilterChange(filter.key, !isActive)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all",
                    isActive 
                      ? filter.color
                      : "text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {filter.label}
                  {isActive && (
                    <X 
                      className="h-3 w-3 hover:text-red-500" 
                      onClick={(e) => {
                        e.stopPropagation()
                        clearFilter(filter.key)
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Category Filter */}
        <div className="space-y-2">
          <Label>Danh mục</Label>
          <Select
            value={filters.category_id?.toString() || 'all'}
            onValueChange={(value) => 
              handleFilterChange('category_id', value === 'all' ? undefined : parseInt(value))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn danh mục" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả danh mục</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.category_id} value={category.category_id.toString()}>
                  {category.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Brand Filter */}
        {!compact && (
          <div className="space-y-2">
            <Label>Thương hiệu</Label>
            <Select
              value={filters.brand || 'all'}
              onValueChange={(value) => 
                handleFilterChange('brand', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn thương hiệu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả thương hiệu</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand} value={brand}>
                    {brand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Sort Options */}
        <div className="space-y-2">
          <Label>Sắp xếp</Label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={filters.sort_by || 'product_name'}
              onValueChange={(value) => 
                handleFilterChange('sort_by', value as ProductFilters['sort_by'])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sắp xếp theo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product_name">Tên sản phẩm</SelectItem>
                <SelectItem value="sale_price">Giá bán</SelectItem>
                <SelectItem value="current_stock">Tồn kho</SelectItem>
                <SelectItem value="created_at">Ngày tạo</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.sort_order || 'asc'}
              onValueChange={(value) => 
                handleFilterChange('sort_order', value as ProductFilters['sort_order'])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">
                  <div className="flex items-center gap-2">
                    <SortAsc className="h-4 w-4" />
                    Tăng dần
                  </div>
                </SelectItem>
                <SelectItem value="desc">
                  <div className="flex items-center gap-2">
                    <SortDesc className="h-4 w-4" />
                    Giảm dần
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active Filters Summary */}
        {activeFiltersCount > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm text-gray-600">Bộ lọc đang áp dụng:</Label>
            <div className="flex flex-wrap gap-1">
              {Object.entries(filters).map(([key, value]) => {
                if (key === 'page' || key === 'limit' || !value) return null
                
                let displayValue = value.toString()
                if (key === 'category_id') {
                  const category = categories.find(c => c.category_id === value)
                  displayValue = category?.category_name || value.toString()
                }

                return (
                  <Badge key={key} variant="secondary" className="text-xs">
                    {displayValue}
                    <X 
                      className="h-3 w-3 ml-1 hover:text-red-500 cursor-pointer" 
                      onClick={() => clearFilter(key as keyof ProductFilters)}
                    />
                  </Badge>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
