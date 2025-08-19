"use client"

import { useState, useEffect } from 'react'
import { useProducts, useProductCategories, useProductStats } from '@/lib/hooks/use-products'
import { ProductFilters } from '@/lib/services/product-service'
import { ProductCard } from '@/components/products/product-card'
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

export default function ProductCatalogTestPage() {
  const [filters, setFilters] = useState<ProductFilters>({
    page: 1,
    limit: 20,
    sort_by: 'product_name',
    sort_order: 'asc'
  })
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const { 
    products, 
    loading, 
    error, 
    pagination,
    refetch 
  } = useProducts(filters)
  
  const { categories } = useProductCategories()
  const { stats, loading: statsLoading } = useProductStats()

  // Handle pagination
  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Đang tải...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-2">Có lỗi xảy ra: {error}</div>
        <Button onClick={refetch} variant="outline">
          Thử lại
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            Danh mục sản phẩm (Test)
          </h1>
          <p className="text-gray-600 mt-1">
            Testing product catalog with {products.length} products
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Tổng sản phẩm</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats?.total_products || 0}
                  </p>
                </div>
                <Package className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Products Grid */}
        <div className={cn(
          viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "space-y-4"
        )}>
          {products.map((product) => (
            <ProductCard
              key={product.product_id}
              product={product}
              layout={viewMode}
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
            <span className="text-sm text-gray-600">
              Trang {pagination.page} / {pagination.total_pages}
            </span>
            <Button
              variant="outline"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
            >
              Sau
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
