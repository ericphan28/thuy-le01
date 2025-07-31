'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
  Search, 
  Package, 
  AlertTriangle, 
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Download
} from 'lucide-react'

// 🐾 Updated interface to match actual database schema
interface VeterinaryProduct {
  product_id: number
  product_code: string
  product_name: string
  category_id: number | null
  base_unit_id: number | null
  base_price: number
  cost_price: number
  sale_price: number
  current_stock: number
  min_stock: number
  max_stock: number
  is_medicine: boolean
  requires_prescription: boolean
  storage_condition: string | null
  expiry_tracking: boolean
  allow_sale: boolean
  is_active: boolean
  description: string | null
  product_categories?: {
    category_id: number
    category_name: string
  } | null
  units?: {
    unit_id: number
    unit_name: string
    unit_code: string
  } | null
}

export default function VeterinaryProductsPage() {
  const [products, setProducts] = useState<VeterinaryProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'prescription' | 'low_stock' | 'expiring'>('all')
  const [totalCount, setTotalCount] = useState<number>(0)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  
  // Sorting states
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'stock' | 'category'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const supabase = createClient()

  // 🐾 Core API Call: Fetch veterinary products with pagination and sorting
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // First, get total count for filtered products
      let countQuery = supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      // Apply same filters to count query
      if (filterType === 'prescription') {
        countQuery = countQuery.eq('requires_prescription', true)
      } else if (filterType === 'low_stock') {
        countQuery = countQuery.lte('current_stock', 10)
      } else if (filterType === 'expiring') {
        countQuery = countQuery.eq('expiry_tracking', true)
      }

      // Apply search to count query
      if (searchTerm) {
        countQuery = countQuery.or(`product_name.ilike.%${searchTerm}%,product_code.ilike.%${searchTerm}%`)
      }

      const { count: filteredCount } = await countQuery
      setTotalCount(filteredCount || 0)

      // Main query with pagination and sorting
      let query = supabase
        .from('products')
        .select(`
          product_id,
          product_code,
          product_name,
          category_id,
          base_unit_id,
          base_price,
          cost_price,
          sale_price,
          current_stock,
          min_stock,
          max_stock,
          is_medicine,
          requires_prescription,
          storage_condition,
          expiry_tracking,
          allow_sale,
          is_active,
          description,
          product_categories!fk_products_category_id (
            category_id,
            category_name
          ),
          units!products_base_unit_id_fkey (
            unit_id,
            unit_name,
            unit_code
          )
        `)
        .eq('is_active', true)

      // Apply sorting
      const sortColumn = sortBy === 'name' ? 'product_name' 
                       : sortBy === 'price' ? 'sale_price'
                       : sortBy === 'stock' ? 'current_stock'
                       : 'product_name'
      
      query = query.order(sortColumn, { ascending: sortOrder === 'asc' })

      // Apply filters based on veterinary business logic
      if (filterType === 'prescription') {
        query = query.eq('requires_prescription', true)
      } else if (filterType === 'low_stock') {
        query = query.lte('current_stock', 10)
      } else if (filterType === 'expiring') {
        query = query.eq('expiry_tracking', true)
      }

      // Search functionality
      if (searchTerm) {
        query = query.or(`product_name.ilike.%${searchTerm}%,product_code.ilike.%${searchTerm}%`)
      }

      // Apply pagination
      const startIndex = (currentPage - 1) * itemsPerPage
      query = query.range(startIndex, startIndex + itemsPerPage - 1)

      const { data, error: fetchError } = await query

      if (fetchError) {
        console.error('Supabase error:', fetchError)
        setError(`Lỗi database: ${fetchError.message}`)
        return
      }

      // Transform data to handle explicit relationship arrays
      const transformedProducts: VeterinaryProduct[] = (data || []).map(item => ({
        ...item,
        product_categories: item.product_categories?.[0] || null,
        units: item.units?.[0] || null
      }))

      setProducts(transformedProducts)
    } catch (err) {
      console.error('Products fetch error:', err)
      setError('Không thể tải danh sách sản phẩm')
    } finally {
      setLoading(false)
    }
  }, [filterType, searchTerm, supabase, currentPage, itemsPerPage, sortBy, sortOrder])

  // Load products on component mount and when filters change
  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filterType, searchTerm, sortBy, sortOrder])

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / itemsPerPage)
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalCount)

  // Sorting handler
  const handleSort = (column: 'name' | 'price' | 'stock' | 'category') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  // 🚨 Veterinary business logic functions
  const getStockStatus = (stock: number) => {
    if (stock === 0) return { label: 'Hết hàng', color: 'destructive' as const }
    if (stock <= 5) return { label: 'Sắp hết', color: 'secondary' as const }
    if (stock <= 10) return { label: 'Ít hàng', color: 'outline' as const }
    return { label: 'Còn hàng', color: 'default' as const }
  }

  // Format price helper function
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  // Statistics for dashboard
  const stats = {
    total: products.length,
    prescriptionRequired: products.filter(p => p.requires_prescription).length,
    lowStock: products.filter(p => p.current_stock <= 10).length,
    expiring: products.filter(p => p.expiry_tracking).length
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-green-600 bg-clip-text text-transparent">🐾 Quản lý Sản phẩm Thú y</h1>
        </div>
        
        <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 via-red-50 to-rose-50 ring-2 ring-red-200/50 rounded-xl backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-full shadow-lg">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-800">Có lỗi xảy ra</h3>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Ultra Compact Header with Inline Stats */}
      <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-3 ring-1 ring-gray-100/50">
        <div className="flex flex-col gap-3">
          {/* Title and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-lg shadow-lg">
                <Package className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-green-600 bg-clip-text text-transparent">
                  Sản phẩm Thú y
                </h1>
                <p className="text-xs text-gray-500">
                  {startItem}-{endItem} / {totalCount} sản phẩm
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700 h-6 px-1.5 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Thêm
              </Button>
              <Button variant="outline" size="sm" className="bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 h-6 px-1.5 text-xs">
                <Download className="h-3 w-3 mr-1" />
                Xuất
              </Button>
            </div>
          </div>

          {/* Inline Stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.total}</div>
              <div className="text-xs opacity-90">Tổng SP</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.prescriptionRequired}</div>
              <div className="text-xs opacity-90">Kê đơn</div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.lowStock}</div>
              <div className="text-xs opacity-90">Sắp hết</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.expiring}</div>
              <div className="text-xs opacity-90">HSD</div>
            </div>
          </div>

          {/* Compact Search and Controls */}
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Tìm sản phẩm..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-8 border-white/30 bg-white/60 backdrop-blur-sm focus:border-blue-400 focus:ring-blue-400/30 rounded-lg shadow-sm text-sm"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {/* Filters */}
              <div className="flex gap-1">
                <Badge 
                  variant={filterType === 'all' ? 'default' : 'outline'}
                  className={`cursor-pointer px-1.5 py-0.5 text-xs font-medium transition-all ${
                    filterType === 'all' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-white/60 border-gray-200 hover:bg-blue-50'
                  }`}
                  onClick={() => setFilterType('all')}
                >
                  Tất cả
                </Badge>
                <Badge 
                  variant={filterType === 'prescription' ? 'default' : 'outline'}
                  className={`cursor-pointer px-1.5 py-0.5 text-xs font-medium transition-all ${
                    filterType === 'prescription' 
                      ? 'bg-orange-600 text-white' 
                      : 'bg-white/60 border-gray-200 hover:bg-orange-50'
                  }`}
                  onClick={() => setFilterType('prescription')}
                >
                  Kê đơn
                </Badge>
                <Badge 
                  variant={filterType === 'low_stock' ? 'default' : 'outline'}
                  className={`cursor-pointer px-1.5 py-0.5 text-xs font-medium transition-all ${
                    filterType === 'low_stock' 
                      ? 'bg-red-600 text-white' 
                      : 'bg-white/60 border-gray-200 hover:bg-red-50'
                  }`}
                  onClick={() => setFilterType('low_stock')}
                >
                  Sắp hết
                </Badge>
                <Badge 
                  variant={filterType === 'expiring' ? 'default' : 'outline'}
                  className={`cursor-pointer px-1.5 py-0.5 text-xs font-medium transition-all ${
                    filterType === 'expiring' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-white/60 border-gray-200 hover:bg-green-50'
                  }`}
                  onClick={() => setFilterType('expiring')}
                >
                  HSD
                </Badge>
              </div>
              
              {/* Sort & Items Per Page */}
              <div className="flex items-center gap-1">
                <Button
                  variant={sortBy === 'name' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('name')}
                  className="h-6 px-1.5 text-xs"
                >
                  Tên {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'price' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('price')}
                  className="h-6 px-1.5 text-xs"
                >
                  Giá {sortBy === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'stock' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('stock')}
                  className="h-6 px-1.5 text-xs"
                >
                  Kho {sortBy === 'stock' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                
                <select 
                  value={itemsPerPage} 
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="h-6 px-1 text-xs border border-white/30 bg-white/60 backdrop-blur-sm rounded focus:border-blue-400"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        // Ultra Compact Loading State
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {[...Array(12)].map((_, i) => (
            <Card key={i} className="animate-pulse border-0 shadow-md bg-white/95 backdrop-blur-lg rounded-lg overflow-hidden">
              <CardContent className="p-2">
                <div className="space-y-2">
                  <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-1/2"></div>
                  <div className="h-8 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // Ultra Dense Products Grid - Maximum density for more products per screen
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {products.map((product) => {
            const stockStatus = getStockStatus(product.current_stock)
            const profitMargin = product.sale_price > 0 ? (((product.sale_price - product.cost_price) / product.sale_price) * 100) : 0
            
            return (
              <Card 
                key={product.product_id} 
                className="group border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 bg-white/95 backdrop-blur-lg overflow-hidden rounded-lg ring-1 ring-gray-100/50 hover:ring-blue-200/50"
              >
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-green-500"></div>
                
                <CardHeader className="pb-1 pt-2 px-2">
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-bold text-gray-900 truncate leading-tight">
                        {product.product_name}
                      </CardTitle>
                      <p className="text-xs text-gray-500 truncate">
                        {product.product_code}
                      </p>
                    </div>
                    <Badge 
                      variant={stockStatus.color}
                      className="text-xs px-1 py-0 flex-shrink-0 h-4"
                    >
                      {stockStatus.label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-2 pt-1 space-y-2">
                  {/* Compact Price & Stock */}
                  <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-green-50 rounded-md p-2">
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div>
                        <span className="text-gray-500 text-xs">Giá:</span>
                        <p className="font-bold text-green-600 text-sm">{formatPrice(product.sale_price)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">Kho:</span>
                        <p className="font-bold text-blue-600 text-sm">{product.current_stock}</p>
                      </div>
                    </div>
                  </div>

                  {/* Compact Profit */}
                  <div className="bg-white/60 rounded-md p-1.5 text-center">
                    <span className="text-gray-500 text-xs block">Lợi nhuận</span>
                    <span className={`font-semibold text-sm ${profitMargin > 20 ? 'text-green-600' : profitMargin > 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {profitMargin.toFixed(0)}%
                    </span>
                  </div>

                  {/* Compact Tags */}
                  <div className="flex flex-wrap gap-0.5">
                    {product.is_medicine && (
                      <Badge variant="secondary" className="text-xs px-1 py-0 h-4">💊</Badge>
                    )}
                    {product.requires_prescription && (
                      <Badge variant="outline" className="text-xs px-1 py-0 h-4 border-orange-200 text-orange-700">📋</Badge>
                    )}
                    {product.expiry_tracking && (
                      <Badge variant="outline" className="text-xs px-1 py-0 h-4 border-green-200 text-green-700">📅</Badge>
                    )}
                  </div>

                  {/* Compact Actions */}
                  <div className="border-t border-gray-100 pt-1.5 mt-1.5">
                    <div className="flex justify-between items-center gap-1">
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-1.5 py-0">
                        Chi tiết
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-6 px-1.5 py-0">
                        Sửa
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Professional Pagination */}
      {!loading && products.length > 0 && totalPages > 1 && (
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-xl ring-1 ring-gray-100/50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                Hiển thị <span className="font-semibold">{startItem}</span> đến{' '}
                <span className="font-semibold">{endItem}</span> trong tổng số{' '}
                <span className="font-semibold">{totalCount}</span> sản phẩm
              </div>
              
              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="h-8 w-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show more info if there are more products */}
      {!loading && products.length > 0 && products.length < totalCount && totalPages <= 1 && (
        <Card className="text-center py-6 border-0 shadow-lg bg-gradient-to-r from-blue-50 via-indigo-50 to-green-50 backdrop-blur-xl rounded-xl ring-1 ring-blue-100/50">
          <CardContent>
            <div className="flex flex-col items-center space-y-2">
              <div className="p-2 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full">
                <Package className="h-8 w-8 text-blue-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-blue-800">
                  Hiển thị {products.length} / {totalCount} sản phẩm
                </h3>
                <p className="text-blue-600 text-sm">
                  Còn {totalCount - products.length} sản phẩm khác trong database. 
                  Sử dụng tìm kiếm hoặc bộ lọc để tìm sản phẩm cụ thể.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Empty State */}
      {!loading && products.length === 0 && (
        <Card className="text-center py-16 border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-xl ring-1 ring-gray-100/50">
          <CardContent>
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-gradient-to-br from-gray-100 to-slate-100 rounded-full shadow-inner">
                <Package className="h-12 w-12 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-gray-800">
                  Không tìm thấy sản phẩm
                </h3>
                <p className="text-gray-600 max-w-md">
                  Không có sản phẩm nào phù hợp với tiêu chí tìm kiếm của bạn. 
                  Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('')
                  setFilterType('all')
                }}
                className="mt-4 bg-white/60 backdrop-blur-sm border-blue-200 hover:bg-blue-50 transition-all duration-300 h-10 px-6 rounded-lg shadow-sm"
              >
                <Filter className="h-4 w-4 mr-2" />
                Xóa bộ lọc
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
