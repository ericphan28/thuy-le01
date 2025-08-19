'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  ShoppingCart,
  Target,
  Calendar,
  BarChart3,
  PieChart,
  RefreshCcw
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { productService } from '@/lib/services/product-service'
import { toast } from 'sonner'

interface ProductAnalytics {
  totalProducts: number
  activeProducts: number
  totalValue: number
  averagePrice: number
  topPerformers: TopProduct[]
  categoryBreakdown: CategoryStats[]
  stockAnalysis: StockAnalysis
  priceDistribution: PriceRange[]
}

interface TopProduct {
  product_id: number
  product_name: string
  product_code: string
  sale_price: number
  current_stock: number
  total_value: number
  category_name?: string
}

interface CategoryStats {
  category_name: string
  product_count: number
  total_value: number
  average_price: number
  percentage: number
}

interface StockAnalysis {
  wellStocked: number
  lowStock: number
  outOfStock: number
  overStocked: number
}

interface PriceRange {
  range: string
  count: number
  percentage: number
}

export default function ProductAnalyticsPage() {
  const [analytics, setAnalytics] = useState<ProductAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('30')

  useEffect(() => {
    loadAnalytics()
  }, [timeRange])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      
      const result = await productService.getProducts({ limit: 1000 })
      const products = result.products

      // Calculate analytics
      const totalProducts = products.length
      const activeProducts = products.filter(p => p.is_active).length
      const totalValue = products.reduce((sum, p) => sum + (p.current_stock * p.sale_price), 0)
      const averagePrice = totalProducts > 0 ? products.reduce((sum, p) => sum + p.sale_price, 0) / totalProducts : 0

      // Top performers by inventory value
      const topPerformers: TopProduct[] = products
        .map(p => ({
          product_id: p.product_id,
          product_name: p.product_name,
          product_code: p.product_code,
          sale_price: p.sale_price,
          current_stock: p.current_stock,
          total_value: p.current_stock * p.sale_price,
          category_name: p.category?.category_name
        }))
        .sort((a, b) => b.total_value - a.total_value)
        .slice(0, 10)

      // Category breakdown
      const categoryMap = new Map<string, { count: number, value: number, priceSum: number }>()
      products.forEach(p => {
        const categoryName = p.category?.category_name || 'Không phân loại'
        const current = categoryMap.get(categoryName) || { count: 0, value: 0, priceSum: 0 }
        categoryMap.set(categoryName, {
          count: current.count + 1,
          value: current.value + (p.current_stock * p.sale_price),
          priceSum: current.priceSum + p.sale_price
        })
      })

      const categoryBreakdown: CategoryStats[] = Array.from(categoryMap.entries()).map(([name, data]) => ({
        category_name: name,
        product_count: data.count,
        total_value: data.value,
        average_price: data.count > 0 ? data.priceSum / data.count : 0,
        percentage: totalProducts > 0 ? (data.count / totalProducts) * 100 : 0
      })).sort((a, b) => b.total_value - a.total_value)

      // Stock analysis
      const stockAnalysis: StockAnalysis = {
        wellStocked: products.filter(p => p.current_stock > p.min_stock * 2).length,
        lowStock: products.filter(p => p.current_stock <= p.min_stock && p.current_stock > 0).length,
        outOfStock: products.filter(p => p.current_stock === 0).length,
        overStocked: products.filter(p => p.current_stock > p.max_stock).length
      }

      // Price distribution
      const priceRanges = [
        { min: 0, max: 100000, label: 'Dưới 100K' },
        { min: 100000, max: 500000, label: '100K - 500K' },
        { min: 500000, max: 1000000, label: '500K - 1M' },
        { min: 1000000, max: 5000000, label: '1M - 5M' },
        { min: 5000000, max: 10000000, label: '5M - 10M' },
        { min: 10000000, max: Infinity, label: 'Trên 10M' }
      ]

      const priceDistribution: PriceRange[] = priceRanges.map(range => {
        const count = products.filter(p => p.sale_price >= range.min && p.sale_price < range.max).length
        return {
          range: range.label,
          count,
          percentage: totalProducts > 0 ? (count / totalProducts) * 100 : 0
        }
      }).filter(range => range.count > 0)

      setAnalytics({
        totalProducts,
        activeProducts,
        totalValue,
        averagePrice,
        topPerformers,
        categoryBreakdown,
        stockAnalysis,
        priceDistribution
      })

    } catch (error) {
      console.error('Error loading analytics:', error)
      toast.error('Lỗi khi tải dữ liệu phân tích')
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

  if (loading || !analytics) {
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
          <h1 className="text-3xl font-bold tracking-tight">Phân tích Sản phẩm</h1>
          <p className="text-muted-foreground">
            Thống kê và báo cáo chi tiết về sản phẩm
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 ngày</SelectItem>
              <SelectItem value="30">30 ngày</SelectItem>
              <SelectItem value="90">90 ngày</SelectItem>
              <SelectItem value="365">1 năm</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={loadAnalytics}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng sản phẩm</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.activeProducts} đang hoạt động
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng giá trị</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(analytics.totalValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Giá trị hàng tồn kho
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Giá trung bình</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(analytics.averagePrice)}
            </div>
            <p className="text-xs text-muted-foreground">
              Giá bán trung bình
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hiệu suất</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {Math.round((analytics.activeProducts / analytics.totalProducts) * 100)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Tỷ lệ sản phẩm hoạt động
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-green-600" />
              Sản phẩm giá trị cao nhất
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.topPerformers.slice(0, 8).map((product, index) => (
                <div key={product.product_id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Badge variant="outline" className="w-8 h-8 rounded-full p-0 flex items-center justify-center">
                      {index + 1}
                    </Badge>
                    <div>
                      <h4 className="font-medium text-sm">{product.product_name}</h4>
                      <p className="text-xs text-muted-foreground font-mono">
                        {product.product_code}
                      </p>
                      {product.category_name && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          {product.category_name}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-bold text-sm">
                      {formatCurrency(product.total_value)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {product.current_stock} × {formatCurrency(product.sale_price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <PieChart className="h-5 w-5 mr-2" />
              Phân bố theo danh mục
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.categoryBreakdown.map((category) => (
                <div key={category.category_name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{category.category_name}</span>
                    <span className="text-sm text-muted-foreground">
                      {category.percentage.toFixed(1)}%
                    </span>
                  </div>
                  
                  <Progress value={category.percentage} className="h-2" />
                  
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <span>{category.product_count} sản phẩm</span>
                    <span>{formatCurrency(category.total_value)}</span>
                    <span>{formatCurrency(category.average_price)} TB</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stock Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Package className="h-5 w-5 mr-2" />
              Phân tích tồn kho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {analytics.stockAnalysis.wellStocked}
                  </div>
                  <p className="text-xs text-green-600 font-medium">Tồn kho tốt</p>
                </div>
                
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {analytics.stockAnalysis.lowStock}
                  </div>
                  <p className="text-xs text-yellow-600 font-medium">Sắp hết</p>
                </div>
                
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {analytics.stockAnalysis.outOfStock}
                  </div>
                  <p className="text-xs text-red-600 font-medium">Hết hàng</p>
                </div>
                
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {analytics.stockAnalysis.overStocked}
                  </div>
                  <p className="text-xs text-blue-600 font-medium">Tồn dư</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Price Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <DollarSign className="h-5 w-5 mr-2" />
              Phân bố giá bán
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.priceDistribution.map((range) => (
                <div key={range.range} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{range.range}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">
                        {range.count} sản phẩm
                      </span>
                      <Badge variant="outline">
                        {range.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <Progress value={range.percentage} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
