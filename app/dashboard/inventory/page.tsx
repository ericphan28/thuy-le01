'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  ShoppingCart,
  Archive,
  BarChart3,
  Plus,
  Minus,
  RefreshCcw,
  RotateCcw
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { productService } from '@/lib/services/product-service'
import { toast } from 'sonner'

interface InventoryStats {
  totalProducts: number
  totalValue: number
  lowStockCount: number
  outOfStockCount: number
  averageStockLevel: number
  totalQuantity: number
}

interface LowStockProduct {
  product_id: number
  product_name: string
  product_code: string
  current_stock: number
  min_stock: number
  sale_price: number
  category_name?: string
}

export default function InventoryDashboard() {
  const [stats, setStats] = useState<InventoryStats>({
    totalProducts: 0,
    totalValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    averageStockLevel: 0,
    totalQuantity: 0
  })
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInventoryData()
  }, [])

  const loadInventoryData = async () => {
    try {
      setLoading(true)
      
      const result = await productService.getProducts({ limit: 1000 })
      const products = result.products
      
      // Calculate stats
      const totalProducts = products.length
      const totalValue = products.reduce((sum, p) => sum + (p.current_stock * p.sale_price), 0)
      const lowStockProducts = products.filter(p => p.current_stock <= p.min_stock)
      const outOfStockProducts = products.filter(p => p.current_stock === 0)
      const totalQuantity = products.reduce((sum, p) => sum + p.current_stock, 0)
      const averageStockLevel = totalProducts > 0 ? totalQuantity / totalProducts : 0

      setStats({
        totalProducts,
        totalValue,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        averageStockLevel,
        totalQuantity
      })

      // Set low stock products with details
      setLowStockProducts(lowStockProducts.map(p => ({
        product_id: p.product_id,
        product_name: p.product_name,
        product_code: p.product_code,
        current_stock: p.current_stock,
        min_stock: p.min_stock,
        sale_price: p.sale_price,
        category_name: p.category?.category_name
      })))

    } catch (error) {
      console.error('Error loading inventory data:', error)
      toast.error('Lỗi khi tải dữ liệu tồn kho')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-96 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý Tồn kho</h1>
          <p className="text-muted-foreground text-sm">Ảnh chụp tổng quan: số lượng hiện tại, giá trị và cảnh báo để quyết định nhập thêm.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadInventoryData}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Làm mới
          </Button>
          <Button asChild variant="secondary">
            <a href="/dashboard/inventory/inbound">+ Nhập hàng</a>
          </Button>
          <Button asChild variant="secondary">
            <a href="/dashboard/inventory/movements">Lịch sử xuất nhập</a>
          </Button>
          <Button asChild variant="secondary">
            <a href="/dashboard/inventory/returns">Trả hàng</a>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng sản phẩm</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              Trong kho hiện tại
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Giá trị tồn kho</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.totalValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Tổng giá trị hàng tồn
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cảnh báo tồn kho</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.lowStockCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Sản phẩm sắp hết
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hết hàng</CardTitle>
            <Archive className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats.outOfStockCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Cần nhập ngay
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alert */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
              Cảnh báo tồn kho thấp
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Tất cả sản phẩm đều có tồn kho ổn định</p>
              </div>
            ) : (
              <div className="space-y-4">
                {lowStockProducts.slice(0, 10).map((product) => (
                  <div key={product.product_id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{product.product_name}</h4>
                      <p className="text-xs text-muted-foreground font-mono">
                        {product.product_code}
                      </p>
                      {product.category_name && (
                        <Badge variant="outline" className="text-xs mt-1">
                          {product.category_name}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-red-600">
                          {product.current_stock}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          / {product.min_stock} tối thiểu
                        </span>
                      </div>
                      <Progress 
                        value={(product.current_stock / product.min_stock) * 100} 
                        className="w-20 h-2 mt-1"
                      />
                    </div>
                    
                    <div className="flex gap-1 ml-4">
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {lowStockProducts.length > 10 && (
                  <p className="text-center text-sm text-muted-foreground">
                    Và {lowStockProducts.length - 10} sản phẩm khác...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inventory Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Tổng quan tồn kho
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Tổng số lượng:</span>
                <span className="font-bold">{stats.totalQuantity.toLocaleString()}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Trung bình/sản phẩm:</span>
                <span className="font-bold">{Math.round(stats.averageStockLevel)}</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Tình trạng tồn kho:</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-green-600">✓ Tồn kho tốt</span>
                    <span>{stats.totalProducts - stats.lowStockCount - stats.outOfStockCount}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-yellow-600">⚠ Sắp hết</span>
                    <span>{stats.lowStockCount}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-red-600">✗ Hết hàng</span>
                    <span>{stats.outOfStockCount}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t space-y-3">
              <h4 className="font-medium text-sm">Hành động nhanh:</h4>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="h-8" asChild>
                  <a href="/dashboard/inventory/inbound">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Nhập hàng
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="h-8" asChild>
                  <a href="/dashboard/inventory/movements">
                    <TrendingDown className="h-3 w-3 mr-1" />
                    Xuất nhập
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="h-8" asChild>
                  <a href="/dashboard/inventory/returns">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Trả hàng
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="h-8" asChild>
                  <a href="/dashboard/inventory/stock">
                    <Archive className="h-3 w-3 mr-1" />
                    Kiểm kho
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
