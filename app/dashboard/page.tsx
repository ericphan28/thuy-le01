import { AuthWrapper } from "@/components/auth-wrapper"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  BarChart3, 
  Users, 
  Package, 
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  CheckCircle
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const stats = [
  {
    title: "Tổng Doanh Thu",
    value: "₫28,456,000",
    change: "+12.5%",
    changeType: "positive",
    icon: DollarSign,
    description: "So với tháng trước"
  },
  {
    title: "Đơn Hàng",
    value: "1,234",
    change: "+8.2%",
    changeType: "positive",
    icon: ShoppingCart,
    description: "Đơn hàng trong tháng"
  },
  {
    title: "Khách Hàng",
    value: "856",
    change: "+15.3%",
    changeType: "positive",
    icon: Users,
    description: "Khách hàng hoạt động"
  },
  {
    title: "Sản Phẩm",
    value: "1,089",
    change: "-2.1%",
    changeType: "negative",
    icon: Package,
    description: "Tổng sản phẩm"
  }
]

const recentOrders = [
  {
    id: "HD001",
    customer: "Nguyễn Văn A",
    amount: "₫1,250,000",
    status: "completed",
    time: "2 phút trước"
  },
  {
    id: "HD002", 
    customer: "Trần Thị B",
    amount: "₫850,000",
    status: "pending",
    time: "5 phút trước"
  },
  {
    id: "HD003",
    customer: "Phạm Văn C", 
    amount: "₫2,100,000",
    status: "completed",
    time: "8 phút trước"
  },
  {
    id: "HD004",
    customer: "Lê Thị D",
    amount: "₫650,000", 
    status: "cancelled",
    time: "12 phút trước"
  }
]

const lowStockItems = [
  { name: "Vacxin Newcastle", current: 5, minimum: 20, status: "critical" },
  { name: "Thuốc tẩy giun", current: 12, minimum: 30, status: "warning" },
  { name: "Vitamin tổng hợp", current: 8, minimum: 25, status: "critical" },
  { name: "Kháng sinh Amoxicillin", current: 18, minimum: 40, status: "warning" }
]

export default function Dashboard() {
  return (
    <AuthWrapper requireAuth={true}>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Chào mừng bạn trở lại! Đây là tổng quan về cửa hàng của bạn.
            </p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <BarChart3 className="mr-2 h-4 w-4" />
            Xem báo cáo
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.title} className="relative overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {stat.title}
                  </CardTitle>
                  <Icon className="h-5 w-5 text-gray-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className={`font-medium ${
                      stat.changeType === 'positive' 
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }`}>
                      {stat.change}
                    </span>
                    <span className="text-gray-500">
                      {stat.description}
                    </span>
                  </div>
                </CardContent>
                <div className={`absolute bottom-0 left-0 h-1 w-full ${
                  stat.changeType === 'positive' 
                    ? 'bg-gradient-to-r from-green-400 to-green-600' 
                    : 'bg-gradient-to-r from-red-400 to-red-600'
                }`} />
              </Card>
            )
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Orders */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Đơn Hàng Gần Đây
              </CardTitle>
              <CardDescription>
                Các đơn hàng mới nhất của cửa hàng
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-sm font-medium text-blue-600">
                        {order.id}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {order.customer}
                        </p>
                        <p className="text-sm text-gray-500">
                          {order.time}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900 dark:text-white">
                        {order.amount}
                      </span>
                      <Badge 
                        variant={
                          order.status === 'completed' ? 'default' :
                          order.status === 'pending' ? 'secondary' : 
                          'destructive'
                        }
                        className="flex items-center gap-1"
                      >
                        {order.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                        {order.status === 'completed' ? 'Hoàn thành' :
                         order.status === 'pending' ? 'Chờ xử lý' : 'Đã hủy'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                Xem tất cả đơn hàng
              </Button>
            </CardContent>
          </Card>

          {/* Low Stock Alert */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Cảnh Báo Tồn Kho
              </CardTitle>
              <CardDescription>
                Sản phẩm sắp hết hàng
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {lowStockItems.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg dark:border-gray-700">
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        Còn {item.current} / Tối thiểu {item.minimum}
                      </p>
                    </div>
                    <Badge 
                      variant={item.status === 'critical' ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {item.status === 'critical' ? 'Nguy hiểm' : 'Cảnh báo'}
                    </Badge>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                <Package className="mr-2 h-4 w-4" />
                Quản lý kho
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      </AuthWrapper>
  )
}
