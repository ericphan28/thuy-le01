import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { TopProduct, RecentOrder } from '@/lib/types/dashboard'

interface TopProductsProps {
  products: TopProduct[]
  loading?: boolean
}

export function TopProducts({ products, loading = false }: TopProductsProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sản Phẩm Bán Chạy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-20"></div>
                </div>
                <div className="text-right">
                  <div className="h-4 bg-gray-200 rounded animate-pulse mb-2 w-16"></div>
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-12"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900">
          🏆 Sản Phẩm Bán Chạy
        </CardTitle>
        <p className="text-sm text-gray-600">Top 5 sản phẩm có doanh thu cao nhất</p>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p className="text-lg mb-2">📦</p>
            <p>Chưa có dữ liệu sản phẩm</p>
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((product, index) => (
              <div key={product.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                    index === 1 ? 'bg-gray-100 text-gray-800' :
                    index === 2 ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{product.name}</div>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {product.category}
                      </Badge>
                      <span>{product.quantity_sold} đã bán</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-green-600">
                    {formatCurrency(product.revenue)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface RecentOrdersProps {
  orders: RecentOrder[]
  loading?: boolean
}

export function RecentOrders({ orders, loading = false }: RecentOrdersProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Đơn Hàng Gần Nhất</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-32"></div>
                </div>
                <div className="text-right">
                  <div className="h-4 bg-gray-200 rounded animate-pulse mb-2 w-20"></div>
                  <div className="h-6 bg-gray-200 rounded animate-pulse w-16"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      completed: { label: 'Hoàn thành', className: 'bg-green-100 text-green-800' },
      processing: { label: 'Đang xử lý', className: 'bg-blue-100 text-blue-800' },
      pending: { label: 'Chờ xử lý', className: 'bg-yellow-100 text-yellow-800' },
      cancelled: { label: 'Đã hủy', className: 'bg-red-100 text-red-800' }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    
    return (
      <Badge className={`text-xs ${config.className}`}>
        {config.label}
      </Badge>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900">
          🛒 Đơn Hàng Gần Nhất
        </CardTitle>
        <p className="text-sm text-gray-600">10 đơn hàng mới nhất trong hệ thống</p>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p className="text-lg mb-2">📋</p>
            <p>Chưa có đơn hàng nào</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{order.customer_name}</div>
                  <div className="text-sm text-gray-500">
                    {order.items_count} sản phẩm • {formatDate(order.created_at)}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <div className="font-semibold text-gray-900">
                    {formatCurrency(order.total)}
                  </div>
                  {getStatusBadge(order.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
