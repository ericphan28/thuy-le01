"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Package } from "lucide-react"

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Báo Cáo & Thống Kê</h1>
          <p className="text-gray-600">Phân tích dữ liệu kinh doanh chi tiết</p>
        </div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-orange-600" />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Doanh Thu Tháng</p>
                <p className="text-2xl font-bold">₫15,420,000</p>
                <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" />
                  +12.5%
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Đơn Hàng Tháng</p>
                <p className="text-2xl font-bold">1,234</p>
                <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" />
                  +8.3%
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <ShoppingCart className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Khách Hàng Mới</p>
                <p className="text-2xl font-bold">89</p>
                <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                  <TrendingDown className="h-3 w-3" />
                  -2.1%
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Sản Phẩm Bán</p>
                <p className="text-2xl font-bold">2,456</p>
                <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" />
                  +15.7%
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <Package className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Doanh Thu Theo Tháng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">Biểu đồ doanh thu sẽ hiển thị ở đây</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Sản Phẩm Bán Chạy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "iPhone 15 Pro", sales: 45, revenue: "₫1,350,000" },
                { name: "Samsung Galaxy S24", sales: 38, revenue: "₫950,000" },
                { name: "MacBook Air M3", sales: 23, revenue: "₫1,840,000" },
                { name: "iPad Pro", sales: 19, revenue: "₫760,000" },
              ].map((product, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-gray-600">{product.sales} đã bán</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">{product.revenue}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reports Section */}
      <Card>
        <CardHeader>
          <CardTitle>Báo Cáo Chi Tiết</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="flex items-center gap-2 h-20">
              <BarChart3 className="h-5 w-5" />
              <div className="text-left">
                <p className="font-medium">Báo Cáo Doanh Thu</p>
                <p className="text-sm text-gray-600">Chi tiết theo ngày/tháng</p>
              </div>
            </Button>

            <Button variant="outline" className="flex items-center gap-2 h-20">
              <Package className="h-5 w-5" />
              <div className="text-left">
                <p className="font-medium">Báo Cáo Tồn Kho</p>
                <p className="text-sm text-gray-600">Quản lý hàng hóa</p>
              </div>
            </Button>

            <Button variant="outline" className="flex items-center gap-2 h-20">
              <Users className="h-5 w-5" />
              <div className="text-left">
                <p className="font-medium">Báo Cáo Khách Hàng</p>
                <p className="text-sm text-gray-600">Phân tích khách hàng</p>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
