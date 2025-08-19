'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CatalogProductCard, CatalogProduct } from '@/components/products/catalog-product-card'
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
import { productUpdateService } from '@/lib/services/product-update-service'
import { productCreateService } from '@/lib/services/product-create-service'
import { productService } from '@/lib/services/product-service'
import { BulkActions } from '@/components/products/bulk-actions'

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
  const [selectedProducts, setSelectedProducts] = useState<number[]>([])
  
  // Real data states
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load data from Supabase
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Load products and categories in parallel
      const [productsResult, categoriesData] = await Promise.all([
        productService.getProducts({ limit: 1000 }),
        productCreateService.getCategories()
      ])

      // Transform productService data to CatalogProduct format
      const transformedProducts: CatalogProduct[] = productsResult.products.map(product => ({
        product_id: product.product_id,
        product_name: product.product_name,
        product_code: product.product_code,
        sale_price: product.sale_price,
        purchase_price: product.cost_price,
        stock_quantity: product.current_stock,
        category_name: product.category?.category_name || 'N/A',
        unit_name: 'chiếc', // Default unit for now
        is_active: product.is_active,
        created_at: product.created_at
      }))

      setProducts(transformedProducts)
      setCategories(categoriesData || [])
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Lỗi khi tải dữ liệu')
      toast.error('Lỗi khi tải dữ liệu sản phẩm')
    } finally {
      setLoading(false)
    }
  }

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
  const handleEditProduct = (product: CatalogProduct) => {
    router.push(`/dashboard/products/edit/simple?id=${product.product_id}`)
  }

  const handleViewProduct = (product: CatalogProduct) => {
    router.push(`/dashboard/products/view?id=${product.product_id}`)
  }

  const handleAddToCart = (product: CatalogProduct) => {
    toast.success(`Đã thêm ${product.product_name} vào giỏ hàng`)
  }

  const handleDeleteProduct = async (product: CatalogProduct) => {
    try {
      const confirmed = await new Promise<boolean>((resolve) => {
        const result = window.confirm(
          `Bạn có chắc chắn muốn xóa sản phẩm "${product.product_name}"?\n\nSản phẩm sẽ được đánh dấu là không hoạt động và không thể bán được nữa.`
        )
        resolve(result)
      })

      if (!confirmed) return

      await productUpdateService.deleteProduct(product.product_id)
      toast.success(`Đã xóa sản phẩm ${product.product_name}`)
      
      // Reload data instead of page refresh
      await loadData()
      setSelectedProducts([])
    } catch (error) {
      console.error('Delete product error:', error)
      toast.error('Lỗi khi xóa sản phẩm')
    }
  }

  const handleBulkDelete = async (productIds: number[]) => {
    try {
      for (const id of productIds) {
        await productUpdateService.deleteProduct(id)
      }
      // Reload data instead of page refresh
      await loadData()
    } catch (error) {
      console.error('Bulk delete error:', error)
      throw error
    }
  }

  const handleExport = () => {
    toast.info('Chức năng xuất Excel đang phát triển')
  }

  const handleImport = (file: File) => {
    toast.info(`Nhập file: ${file.name} - Chức năng đang phát triển`)
  }

  const handleProductSelection = (productId: number, selected: boolean) => {
    if (selected) {
      setSelectedProducts(prev => [...prev, productId])
    } else {
      setSelectedProducts(prev => prev.filter(id => id !== productId))
    }
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
          <p className="text-red-600 mb-4">Lỗi khi tải dữ liệu</p>
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

      {/* Bulk Actions */}
      <BulkActions
        products={filteredProducts}
        selectedProducts={selectedProducts}
        onSelectionChange={setSelectedProducts}
        onBulkDelete={handleBulkDelete}
        onExport={handleExport}
        onImport={handleImport}
      />

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
              <CatalogProductCard
                key={product.product_id}
                product={product}
                onEdit={handleEditProduct}
                onView={handleViewProduct}
                onAddToCart={handleAddToCart}
                onDelete={handleDeleteProduct}
                compact={viewMode === 'list'}
                selected={selectedProducts.includes(product.product_id)}
                onSelectionChange={(selected) => handleProductSelection(product.product_id, selected)}
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
