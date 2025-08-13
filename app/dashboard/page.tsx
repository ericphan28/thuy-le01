"use client"

import { AuthWrapper } from "@/components/auth-wrapper"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { 
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  RefreshCw,
  AlertTriangle
} from "lucide-react"

import { useDashboard } from "@/lib/hooks/use-dashboard"
import { StatCard } from "@/components/dashboard/stat-card"
import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { TopProducts, RecentOrders } from "@/components/dashboard/dashboard-widgets"

export default function DashboardPage() {
  const { 
    stats, 
    revenueData, 
    topProducts, 
    recentOrders, 
    loading, 
    error, 
    refetch 
  } = useDashboard()

  if (error) {
    return (
      <AuthWrapper>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-muted-foreground">
                Tổng quan hoạt động kinh doanh
              </p>
            </div>
            <Button onClick={refetch} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Thử lại
            </Button>
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Lỗi khi tải dữ liệu dashboard: {error}
            </AlertDescription>
          </Alert>
        </div>
      </AuthWrapper>
    )
  }

  return (
    <AuthWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              📊 Dashboard
            </h1>
            <p className="text-muted-foreground">
              Tổng quan hoạt động kinh doanh và chỉ số quan trọng
            </p>
          </div>
          <Button 
            onClick={refetch} 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Tổng Doanh Thu"
            value={stats?.totalRevenue || 0}
            icon={DollarSign}
            growth={stats?.revenueGrowth || 0}
            prefix="₫"
            loading={loading}
          />
          <StatCard
            title="Tổng Đơn Hàng"
            value={stats?.totalOrders || 0}
            icon={ShoppingCart}
            growth={stats?.ordersGrowth || 0}
            loading={loading}
          />
          <StatCard
            title="Tổng Khách Hàng"
            value={stats?.totalCustomers || 0}
            icon={Users}
            growth={stats?.customersGrowth || 0}
            loading={loading}
          />
          <StatCard
            title="Tổng Sản Phẩm"
            value={stats?.totalProducts || 0}
            icon={Package}
            growth={stats?.productsGrowth || 0}
            loading={loading}
          />
        </div>

        {/* Revenue Chart */}
        <RevenueChart data={revenueData} loading={loading} />

        {/* Bottom Widgets */}
        <div className="grid gap-4 md:grid-cols-2">
          <TopProducts products={topProducts} loading={loading} />
          <RecentOrders orders={recentOrders} loading={loading} />
        </div>

        {/* Debug Info (chỉ hiện trong development) */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-sm">🔧 Debug Info</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-gray-600">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <strong>Stats:</strong> {stats ? '✅ Loaded' : '❌ Empty'}
                </div>
                <div>
                  <strong>Revenue Data:</strong> {revenueData.length} points
                </div>
                <div>
                  <strong>Top Products:</strong> {topProducts.length} items
                </div>
                <div>
                  <strong>Recent Orders:</strong> {recentOrders.length} items
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AuthWrapper>
  )
}
