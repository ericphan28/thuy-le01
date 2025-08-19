"use client"

import { useState, useEffect } from 'react'
import { useProducts, useProductCategories, useProductStats } from '@/lib/hooks/use-products'
import { ProductFilters } from '@/lib/services/product-service'
import { ProductCard } from '@/components/products/product-card'
import { ProductFiltersComponent } from '@/components/products/product-filters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Package,
  Plus,
  Grid3X3,
  List,
  Search,
  Filter,
  Download,
  Upload,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Product } from '@/lib/services/product-service'
import { toast } from 'sonner'

export default function ProductCatalogPage() {
  const router = useRouter()
  
  // Handlers for product actions
  const handleEditProduct = (product: Product) => {
    router.push(`/dashboard/products/edit/simple?id=${product.product_id}`)
  }

  const handleViewProduct = (product: Product) => {
    router.push(`/dashboard/products/view?id=${product.product_id}`)
  }

  const handleAddToCart = (product: Product) => {
    toast.success(`Đã thêm ${product.product_name} vào giỏ hàng`)
  }
  
  const [filters, setFilters] = useState<ProductFilters>({
    page: 1,
    limit: 20,
    sort_by: 'product_name',
    sort_order: 'asc'
  })
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showFilters, setShowFilters] = useState(true)
  const [quickSearch, setQuickSearch] = useState('')

  const { 
    products, 
    loading, 
    error, 
    pagination,
    refetch 
  } = useProducts(filters)
  
  const { categories } = useProductCategories()
  const { stats, loading: statsLoading } = useProductStats()

  // (Duplicate handleAddToCart removed)

  // Handle filter changes
  const handleFiltersChange = (newFilters: ProductFilters) => {
    console.log('📋 Catalog page - handleFiltersChange:', { 
      oldFilters: filters, 
      newFilters, 
      merged: { ...newFilters, page: 1 }
    })
    setFilters({ ...newFilters, page: 1 }) // Reset to first page when filters change
  }

  // Handle pagination
  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }))
  }

  // Quick search
  const handleQuickSearch = (value: string) => {
    console.log('⚡ Quick search:', { value, currentFilters: filters })
    setQuickSearch(value)
    if (value.length === 0 || value.length >= 2) {
      const newFilters = { ...filters, search: value || undefined }
      console.log('⚡ Quick search applying filters:', newFilters)
      handleFiltersChange(newFilters)
    }
  }

  // Reset filters
  const resetFilters = () => {
    setFilters({
      page: 1,
      limit: 20,
      sort_by: 'product_name',
      sort_order: 'asc'
    })
    setQuickSearch('')
  }

  // Category quick filter
  const handleCategoryFilter = (categoryId: number | null) => {
    handleFiltersChange({
      ...filters,
      category_id: categoryId || undefined
    })
  }

  const statsCards = [
    {
      title: 'Tổng sản phẩm',
      value: stats?.total_products || 0,
      icon: Package,
      color: 'text-blue-600 bg-blue-50'
    },
    {
      title: 'Sắp hết hàng',
      value: stats?.low_stock_count || 0,
      icon: AlertTriangle,
      color: 'text-orange-600 bg-orange-50'
    },
    {
      title: 'Hết hàng',
      value: stats?.out_of_stock_count || 0,
      icon: TrendingDown,
      color: 'text-red-600 bg-red-50'
    },
    {
      title: 'Giá trị tồn kho',
      value: `${(stats?.total_inventory_value || 0).toLocaleString('vi-VN')} ₫`,
      icon: TrendingUp,
      color: 'text-green-600 bg-green-50'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Package className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  Danh mục sản phẩm
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Quản lý và theo dõi sản phẩm của cửa hàng
                </p>
              </div>
              
              {/* Desktop controls */}
              <div className="hidden lg:flex items-center gap-3">
                {/* Quick Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Tìm kiếm nhanh..."
                    value={quickSearch}
                    onChange={(e) => handleQuickSearch(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>

                {/* View Mode Toggle */}
                <div className="flex rounded-lg border border-gray-200 bg-white">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="rounded-r-none"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-l-none border-l"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>

                {/* Filter Toggle */}
                <Button
                  variant={showFilters ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? <EyeOff className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
                  {showFilters ? 'Ẩn bộ lọc' : 'Hiện bộ lọc'}
                </Button>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Xuất Excel
                  </Button>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Nhập Excel
                  </Button>
                  <Link href="/dashboard/products/new">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Thêm sản phẩm
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Mobile/Tablet controls */}
              <div className="lg:hidden flex flex-col gap-3">
                {/* Mobile search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Tìm kiếm sản phẩm..."
                    value={quickSearch}
                    onChange={(e) => handleQuickSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Mobile action bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* View Mode Toggle */}
                    <div className="flex rounded-lg border border-gray-200 bg-white">
                      <Button
                        variant={viewMode === 'grid' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('grid')}
                        className="rounded-r-none px-3"
                      >
                        <Grid3X3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('list')}
                        className="rounded-l-none border-l px-3"
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Filter Toggle */}
                    <Button
                      variant={showFilters ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setShowFilters(!showFilters)}
                    >
                      <Filter className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">
                        {showFilters ? 'Ẩn bộ lọc' : 'Lọc'}
                      </span>
                    </Button>
                  </div>

                  {/* Add Product */}
                  <Link href="/dashboard/products/new">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
                      <Plus className="h-4 w-4 mr-1" />
                      Thêm
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6">
          {statsCards.map((stat, index) => {
            const Icon = stat.icon
            return (
              <Card key={index}>
                <CardContent className="p-3 lg:p-6">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs lg:text-sm font-medium text-gray-600 truncate">
                        {stat.title}
                      </p>
                      <p className="text-lg lg:text-2xl font-bold text-gray-900 mt-1">
                        {typeof stat.value === 'string' && stat.value.includes('₫') 
                          ? <span className="text-sm lg:text-2xl">{stat.value}</span>
                          : stat.value
                        }
                      </p>
                    </div>
                    <div className={cn('rounded-lg p-2 lg:p-3 ml-2', stat.color)}>
                      <Icon className="h-4 w-4 lg:h-5 lg:w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Filters Sidebar */}
          {showFilters && (
            <div className="lg:w-80 lg:flex-shrink-0">
              <ProductFiltersComponent
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onReset={resetFilters}
                compact={true}
              />

              {/* Categories Quick Filter */}
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Danh mục</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <button
                    onClick={() => handleCategoryFilter(null)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                      !filters.category_id 
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "hover:bg-gray-50"
                    )}
                  >
                    Tất cả danh mục
                    {!filters.category_id && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {pagination?.total || 0}
                      </Badge>
                    )}
                  </button>

                  {categories.map((category) => (
                    <button
                      key={category.category_id}
                      onClick={() => handleCategoryFilter(category.category_id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                        filters.category_id === category.category_id
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "hover:bg-gray-50"
                      )}
                    >
                      {category.category_name}
                      {filters.category_id === category.category_id && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {pagination?.total || 0}
                        </Badge>
                      )}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Kết quả tìm kiếm
                </h2>
                {pagination && (
                  <div className="text-sm text-gray-600">
                    Hiển thị {((pagination.page - 1) * pagination.limit) + 1}-
                    {Math.min(pagination.page * pagination.limit, pagination.total)} 
                    của {pagination.total} sản phẩm
                  </div>
                )}
              </div>

              {/* Items per page */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Hiển thị:</span>
                <select
                  value={filters.limit}
                  onChange={(e) => handleFiltersChange({ ...filters, limit: parseInt(e.target.value) })}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-sm text-gray-600">sản phẩm</span>
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Đang tải...</span>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="text-center py-12">
                <div className="text-red-600 mb-2">Có lỗi xảy ra khi tải dữ liệu</div>
                <Button onClick={refetch} variant="outline">
                  Thử lại
                </Button>
              </div>
            )}

            {/* Products Grid/List */}
            {!loading && !error && (
              <>
                <div className={cn(
                  viewMode === 'grid' 
                    ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
                    : "space-y-3"
                )}>
                  {products.map((product) => (
                    <ProductCard
                      key={product.product_id}
                      product={product}
                      layout={viewMode}
                      compact={true}
                      onEdit={handleEditProduct}
                      onView={handleViewProduct}
                      onAddToCart={handleAddToCart}
                    />
                  ))}
                </div>

                {/* Empty State */}
                {products.length === 0 && (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Không tìm thấy sản phẩm
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm
                    </p>
                    <Button onClick={resetFilters} variant="outline">
                      Xóa bộ lọc
                    </Button>
                  </div>
                )}

                {/* Pagination */}
                {pagination && pagination.total_pages > 1 && (
                  <div className="flex items-center justify-center mt-8 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                    >
                      Trước
                    </Button>

                    {/* Page Numbers */}
                    {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                      const pageNum = Math.max(1, pagination.page - 2) + i
                      if (pageNum > pagination.total_pages) return null

                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === pagination.page ? "default" : "outline"}
                          onClick={() => handlePageChange(pageNum)}
                          className="w-10"
                        >
                          {pageNum}
                        </Button>
                      )
                    })}

                    <Button
                      variant="outline"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.total_pages}
                    >
                      Sau
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
