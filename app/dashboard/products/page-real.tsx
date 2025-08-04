'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
  Search, 
  Package, 
  Plus,
  Download,
  Edit2,
  Trash2,
  Pill,
  AlertTriangle
} from 'lucide-react'

interface Product {
  product_id: number
  product_code: string
  product_name: string
  category_id?: number
  sale_price: number
  cost_price: number
  current_stock: number
  min_stock: number
  max_stock: number
  description?: string
  image_url?: string
  is_medicine?: boolean
  requires_prescription?: boolean
  is_active: boolean
  allow_sale: boolean
  storage_condition?: string
  product_categories?: {
    category_id: number
    category_name: string
  } | null
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'prescription' | 'low_stock' | 'expiring'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'stock'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  const supabase = createClient()

  // Fetch products từ Supabase với relation
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabase
        .from('products')
        .select(`
          product_id,
          product_code,
          product_name,
          category_id,
          sale_price,
          cost_price,
          current_stock,
          min_stock,
          max_stock,
          description,
          image_url,
          is_medicine,
          requires_prescription,
          is_active,
          allow_sale,
          storage_condition,
          product_categories!fk_products_category_id (
            category_id,
            category_name
          )
        `)
        .eq('is_active', true)
        .eq('allow_sale', true)
        .order('product_name', { ascending: true })

      if (error) {
        console.error('Error fetching products:', error)
        return
      }

      // Transform data để đảm bảo product_categories là single object 
      const transformedData = data?.map(product => ({
        ...product,
        product_categories: Array.isArray(product.product_categories) 
          ? product.product_categories[0] || null
          : product.product_categories
      })) || []

      setProducts(transformedData)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount || 0)
  }

  const getStockStatus = (current: number, min: number) => {
    if (current === 0) return { color: 'bg-red-500', text: 'Hết hàng' }
    if (current <= min) return { color: 'bg-yellow-500', text: 'Sắp hết' }
    return { color: 'bg-green-500', text: 'Còn hàng' }
  }

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.product_code.toLowerCase().includes(searchTerm.toLowerCase())
    
    if (filterType === 'prescription') return matchesSearch && product.requires_prescription
    if (filterType === 'low_stock') return matchesSearch && product.current_stock <= product.min_stock
    if (filterType === 'expiring') return matchesSearch && product.current_stock <= (product.min_stock * 1.2)
    
    return matchesSearch
  })

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let aVal: string | number, bVal: string | number
    
    switch (sortBy) {
      case 'price':
        aVal = a.sale_price || 0
        bVal = b.sale_price || 0
        break
      case 'stock':
        aVal = a.current_stock || 0
        bVal = b.current_stock || 0
        break
      default:
        aVal = a.product_name
        bVal = b.product_name
    }
    
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1
    } else {
      return aVal < bVal ? 1 : -1
    }
  })

  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedProducts = sortedProducts.slice(startIndex, startIndex + itemsPerPage)

  const handleSort = (field: 'name' | 'price' | 'stock') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const handleEdit = (product: Product) => {
    console.log('Edit product:', product)
  }

  const handleDelete = (id: number) => {
    console.log('Delete product:', id)
  }

  // Calculate stats from real data
  const stats = {
    total: products.length,
    prescriptionRequired: products.filter(p => p.requires_prescription).length,
    lowStock: products.filter(p => p.current_stock <= p.min_stock).length,
    medicines: products.filter(p => p.is_medicine).length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600 dark:text-gray-400">Đang tải sản phẩm...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="supabase-card">
        <div className="flex flex-col gap-4">
          {/* Title and Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quản lý Sản phẩm</h1>
              <p className="text-gray-600 dark:text-gray-400">Quản lý {stats.total} sản phẩm thú y</p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button className="supabase-button">
                <Plus className="h-4 w-4 mr-2" />
                Thêm sản phẩm
              </Button>
              <Button variant="outline" className="supabase-button">
                <Download className="h-4 w-4 mr-2" />
                Xuất Excel
              </Button>
            </div>
          </div>

          {/* Real Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm opacity-90">Tổng sản phẩm</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.medicines}</div>
              <div className="text-sm opacity-90">Thuốc thú y</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.prescriptionRequired}</div>
              <div className="text-sm opacity-90">Cần kê đơn</div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.lowStock}</div>
              <div className="text-sm opacity-90">Sắp hết hàng</div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Tìm sản phẩm theo tên hoặc mã..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 supabase-input"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {/* Filter Badges */}
              <div className="flex gap-2">
                <Badge 
                  variant={filterType === 'all' ? 'default' : 'outline'}
                  className={`cursor-pointer ${filterType === 'all' ? 'bg-blue-600 text-white' : ''}`}
                  onClick={() => setFilterType('all')}
                >
                  Tất cả
                </Badge>
                <Badge 
                  variant={filterType === 'prescription' ? 'default' : 'outline'}
                  className={`cursor-pointer ${filterType === 'prescription' ? 'bg-orange-600 text-white' : ''}`}
                  onClick={() => setFilterType('prescription')}
                >
                  Kê đơn
                </Badge>
                <Badge 
                  variant={filterType === 'low_stock' ? 'default' : 'outline'}
                  className={`cursor-pointer ${filterType === 'low_stock' ? 'bg-red-600 text-white' : ''}`}
                  onClick={() => setFilterType('low_stock')}
                >
                  Sắp hết
                </Badge>
              </div>
              
              {/* Sort Options */}
              <div className="flex items-center gap-2">
                <Button
                  variant={sortBy === 'name' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('name')}
                  className="supabase-button"
                >
                  Tên {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'price' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('price')}
                  className="supabase-button"
                >
                  Giá {sortBy === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'stock' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('stock')}
                  className="supabase-button"
                >
                  Kho {sortBy === 'stock' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                
                <select 
                  value={itemsPerPage.toString()} 
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="h-8 px-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded focus:border-blue-400"
                >
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {paginatedProducts.map((product) => {
          const stockStatus = getStockStatus(product.current_stock, product.min_stock)
          
          return (
            <div
              key={product.product_id}
              className="supabase-card p-4 hover:shadow-lg transition-shadow"
            >
              {/* Product Image */}
              <div className="relative w-full h-32 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-lg mb-3 flex items-center justify-center">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.product_name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <Package className="h-12 w-12 text-gray-400" />
                )}
                
                {/* Stock Badge */}
                <div className="absolute top-2 right-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium text-white ${stockStatus.color}`}
                  >
                    {Math.floor(product.current_stock)}
                  </span>
                </div>
              </div>

              {/* Product Info */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm leading-tight text-gray-900 dark:text-white line-clamp-2">
                  {product.product_name}
                </h3>
                
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>Mã: {product.product_code}</span>
                  {product.product_categories && (
                    <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      {product.product_categories.category_name}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(product.sale_price)}
                    </div>
                    {product.cost_price && (
                      <div className="text-xs text-gray-500 line-through">
                        Vốn: {formatCurrency(product.cost_price)}
                      </div>
                    )}
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(product)}
                      className="h-7 w-7 p-0 hover:bg-blue-50 dark:hover:bg-blue-900"
                    >
                      <Edit2 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(product.product_id)}
                      className="h-7 w-7 p-0 hover:bg-red-50 dark:hover:bg-red-900"
                    >
                      <Trash2 className="h-3 w-3 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex items-center gap-1 flex-wrap">
                  {product.is_medicine && (
                    <Badge variant="outline" className="text-xs">
                      <Pill className="h-2 w-2 mr-1" />
                      Thuốc
                    </Badge>
                  )}
                  {product.requires_prescription && (
                    <Badge variant="outline" className="text-xs text-orange-600">
                      <AlertTriangle className="h-2 w-2 mr-1" />
                      Kê đơn
                    </Badge>
                  )}
                  {product.current_stock <= product.min_stock && (
                    <Badge variant="outline" className="text-xs text-red-600">
                      Sắp hết
                    </Badge>
                  )}
                </div>

                {/* Stock Info */}
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Tồn: <span className="font-medium">{Math.floor(product.current_stock)}</span>
                  {product.min_stock > 0 && (
                    <span> / Tối thiểu: {Math.floor(product.min_stock)}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {paginatedProducts.length === 0 && !loading && (
        <div className="text-center py-8">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">
            {searchTerm ? `Không tìm thấy sản phẩm cho "${searchTerm}"` : 'Không có sản phẩm nào'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Hiển thị {startIndex + 1} - {Math.min(startIndex + itemsPerPage, sortedProducts.length)} trên {sortedProducts.length} sản phẩm
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="supabase-button"
            >
              Trước
            </Button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Trang {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="supabase-button"
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
