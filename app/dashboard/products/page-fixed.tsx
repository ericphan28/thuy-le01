'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

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

  const supabase = createClient()

  // 🐾 Core API Call: Fetch veterinary products with correct schema
  const fetchProducts = async () => {
    try {
      setLoading(true)
      setError(null)

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
        .order('product_name', { ascending: true })

      // Apply filters based on veterinary business logic
      if (filterType === 'prescription') {
        query = query.eq('requires_prescription', true)
      } else if (filterType === 'low_stock') {
        query = query.lte('current_stock', 10)
      } else if (filterType === 'expiring') {
        // Show products that have expiry tracking enabled
        query = query.eq('expiry_tracking', true)
      }

      // Search functionality
      if (searchTerm) {
        query = query.or(`product_name.ilike.%${searchTerm}%,product_code.ilike.%${searchTerm}%`)
      }

      const { data, error: fetchError } = await query.limit(50)

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
  }

  // Load products on component mount and when filters change
  useEffect(() => {
    fetchProducts()
  }, [filterType, searchTerm]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">🐾 Quản lý Sản phẩm Thú y</h1>
        </div>
        
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <span className="text-red-600">❌</span>
              <div>
                <p className="text-red-800 font-semibold">Lỗi kết nối database</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">🐾 Quản lý Sản phẩm Thú y</h1>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng sản phẩm</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cần đơn thuốc</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.prescriptionRequired}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sắp hết hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lowStock}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Theo dõi hạn sử dụng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expiring}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Tìm kiếm sản phẩm..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        
        <div className="flex gap-2">
          <Badge 
            variant={filterType === 'all' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilterType('all')}
          >
            Tất cả
          </Badge>
          <Badge 
            variant={filterType === 'prescription' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilterType('prescription')}
          >
            Đơn thuốc
          </Badge>
          <Badge 
            variant={filterType === 'low_stock' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilterType('low_stock')}
          >
            Sắp hết
          </Badge>
          <Badge 
            variant={filterType === 'expiring' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilterType('expiring')}
          >
            Theo dõi HSD
          </Badge>
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-8 bg-gray-200 rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const stockStatus = getStockStatus(product.current_stock)
            
            return (
              <Card key={product.product_id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{product.product_name}</CardTitle>
                      <CardDescription>
                        SKU: {product.product_code}
                      </CardDescription>
                    </div>

                    {product.requires_prescription && (
                      <Badge variant="secondary" className="ml-2">
                        Đơn thuốc
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Price */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Giá bán:</span>
                    <div className="text-right">
                      <div className="font-semibold text-lg">
                        {formatPrice(product.sale_price)}
                      </div>
                      {product.product_categories && (
                        <div className="text-xs text-muted-foreground">
                          {product.product_categories.category_name}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Unit */}
                  {product.units && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Đơn vị:</span>
                      <span className="text-sm">
                        {product.units.unit_name}
                      </span>
                    </div>
                  )}

                  {/* Stock */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tồn kho:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{product.current_stock}</span>
                      <Badge variant={stockStatus.color}>
                        {stockStatus.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Expiry Tracking */}
                  {product.expiry_tracking && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Theo dõi hạn sử dụng:</span>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">
                          Được theo dõi
                        </Badge>
                      </div>
                    </div>
                  )}

                  {/* Profit Margin */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Lợi nhuận:</span>
                    <div className="text-right">
                      <div className="text-sm font-medium text-green-600">
                        {formatPrice(product.sale_price - product.cost_price)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ({(((product.sale_price - product.cost_price) / product.sale_price) * 100).toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && products.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <div className="text-muted-foreground">
              <p className="text-lg mb-2">🔍 Không tìm thấy sản phẩm</p>
              <p className="text-sm">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
