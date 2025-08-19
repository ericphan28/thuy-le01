'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ProductCard } from '@/components/pos/product-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Grid,
  List,
  Search,
  Filter,
  Plus,
  Package,
  DollarSign,
  AlertTriangle,
  TrendingUp
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// Mock data for development
const mockProducts = [
  {
    product_id: 1,
    product_name: 'iPhone 15 Pro Max',
    product_code: 'APPLE001',
    sale_price: 29990000,
    purchase_price: 28000000,
    stock_quantity: 15,
    category_name: 'Electronics',
    unit_name: 'chiếc',
    is_active: true,
    created_at: '2024-01-15T10:00:00Z'
  },
  {
    product_id: 2,
    product_name: 'Samsung Galaxy S24',
    product_code: 'SAMSUNG001',
    sale_price: 22990000,
    purchase_price: 21000000,
    stock_quantity: 8,
    category_name: 'Electronics',
    unit_name: 'chiếc',
    is_active: true,
    created_at: '2024-01-20T14:30:00Z'
  },
  {
    product_id: 3,
    product_name: 'MacBook Pro 14"',
    product_code: 'APPLE002',
    sale_price: 55990000,
    purchase_price: 52000000,
    stock_quantity: 3,
    category_name: 'Computers',
    unit_name: 'chiếc',
    is_active: true,
    created_at: '2024-01-25T09:15:00Z'
  }
]

const mockCategories = [
  { category_id: 1, category_name: 'Electronics' },
  { category_id: 2, category_name: 'Computers' },
  { category_id: 3, category_name: 'Accessories' }
]

interface Product {
  product_id: number
  product_name: string
  product_code: string
  sale_price: number
  purchase_price: number
  stock_quantity: number
  category_name: string
  unit_name: string
  is_active: boolean
  created_at: string
}

interface Category {
  category_id: number
  category_name: string
}

export default function ProductCatalogPage() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('name')

  // Using mock data for now
  const products = mockProducts
  const categories = mockCategories
  const loading = false
  const error = null

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(product => {
      const matchesSearch = product.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           product.product_code.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = selectedCategory === 'all' || product.category_name === selectedCategory
      return matchesSearch && matchesCategory && product.is_active
    })

    // Sort products
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.product_name.localeCompare(b.product_name)
        case 'price':
          return a.sale_price - b.sale_price
        case 'stock':
          return b.stock_quantity - a.stock_quantity
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        default:
          return 0
      }
    })

    return filtered
  }, [products, searchQuery, selectedCategory, sortBy])

  // Calculate stats
  const stats = useMemo(() => {
    const totalProducts = products.filter(p => p.is_active).length
    const lowStock = products.filter(p => p.is_active && p.stock_quantity <= 5).length
    const totalValue = products
      .filter(p => p.is_active)
      .reduce((sum, p) => sum + (p.sale_price * p.stock_quantity), 0)
    const averagePrice = totalProducts > 0 ? totalValue / totalProducts : 0

    return {
      totalProducts,
      lowStock,
      totalValue,
      averagePrice
    }
  }, [products])

  // Product action handlers
  const handleEditProduct = (product: Product) => {
    router.push(`/dashboard/products/edit/simple?id=${product.product_id}`)
  }

  const handleViewProduct = (product: Product) => {
    router.push(`/dashboard/products/view?id=${product.product_id}`)
  }

  const handleAddToCart = (product: any) => {
    toast.success(`Đã thêm ${product.product_name} vào giỏ hàng`)
  }

  const handleCreateProduct = () => {
    router.push('/dashboard/products/create')
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">Lỗi khi tải dữ liệu: {(error as Error).message}</p>
          <Button onClick={() => window.location.reload()}>
            Thử lại
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catalog Sản Phẩm</h1>
          <p className="text-muted-foreground">
            Quản lý và xem tất cả sản phẩm trong cửa hàng
          </p>
        </div>
        <Button onClick={handleCreateProduct} className="gap-2">
          <Plus className="h-4 w-4" />
          Thêm Sản Phẩm
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng Sản Phẩm</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              +2 từ tháng trước
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sắp Hết Hàng</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.lowStock}</div>
            <p className="text-xs text-muted-foreground">
              ≤ 5 sản phẩm
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Giá Trị Tồn Kho</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND'
              }).format(stats.totalValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              +5.2% từ tháng trước
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Giá Trung Bình</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND'
              }).format(stats.averagePrice)}
            </div>
            <p className="text-xs text-muted-foreground">
              +1.2% từ tháng trước
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm sản phẩm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2">
              {/* Category Filter */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Danh mục" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả danh mục</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.category_id} value={category.category_name}>
                      {category.category_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Sắp xếp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Tên A-Z</SelectItem>
                  <SelectItem value="price">Giá thấp - cao</SelectItem>
                  <SelectItem value="stock">Tồn kho cao - thấp</SelectItem>
                  <SelectItem value="newest">Mới nhất</SelectItem>
                </SelectContent>
              </Select>

              {/* View Mode Toggle */}
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-r-none"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-l-none"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Grid/List */}
      <div className="space-y-4">
        {filteredProducts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Không tìm thấy sản phẩm</h3>
              <p className="text-muted-foreground mb-4">
                Thử điều chỉnh bộ lọc hoặc tạo sản phẩm mới
              </p>
              <Button onClick={handleCreateProduct}>
                <Plus className="h-4 w-4 mr-2" />
                Tạo Sản Phẩm Đầu Tiên
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className={viewMode === 'grid' 
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'space-y-3'
          }>
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.product_id}
                product={{
                  product_id: product.product_id,
                  product_code: product.product_code,
                  product_name: product.product_name,
                  sale_price: product.sale_price,
                  current_stock: product.stock_quantity,
                  category_id: 1 // Default category for now
                }}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}
      </div>

      {/* Results Summary */}
      {filteredProducts.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Hiển thị {filteredProducts.length} trên tổng {stats.totalProducts} sản phẩm
        </div>
      )}
    </div>
  )
}
