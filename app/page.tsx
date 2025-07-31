import { EnvVarWarning } from "@/components/env-var-warning";
import { ClientAuthButton } from "@/components/client-auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  BarChart3, 
  Package, 
  Users, 
  ShoppingCart,
  DollarSign,
  Zap,
  Shield,
  Phone,
  Mail,
  Facebook,
  Building2,
  Star,
  Check
} from "lucide-react";

export default function Home() {
  const features = [
    {
      icon: ShoppingCart,
      title: "Quản lý bán hàng",
      description: "Tạo hóa đơn nhanh chóng, theo dõi đơn hàng và xử lý trả hàng một cách hiệu quả"
    },
    {
      icon: Package,
      title: "Quản lý kho hàng",
      description: "Theo dõi tồn kho real-time, cảnh báo hàng sắp hết, quản lý nhập xuất tự động"
    },
    {
      icon: Users,
      title: "Quản lý khách hàng",
      description: "Lưu trữ thông tin khách hàng, lịch sử mua hàng và chương trình khách hàng VIP"
    },
    {
      icon: BarChart3,
      title: "Báo cáo thông minh",
      description: "Dashboard trực quan với biểu đồ chi tiết về doanh thu, lợi nhuận và xu hướng"
    },
    {
      icon: DollarSign,
      title: "Quản lý tài chính",
      description: "Theo dõi thu chi, công nợ khách hàng và nhà cung cấp một cách chính xác"
    },
    {
      icon: Zap,
      title: "Tốc độ cao",
      description: "Giao diện hiện đại, xử lý nhanh chóng và đồng bộ dữ liệu real-time"
    }
  ];

  const benefits = [
    "Tiết kiệm thời gian quản lý hàng ngày",
    "Giảm sai sót trong tính toán và báo cáo", 
    "Tăng hiệu quả bán hàng và chăm sóc khách hàng",
    "Ra quyết định kinh doanh dựa trên dữ liệu chính xác",
    "Mở rộng quy mô kinh doanh dễ dàng"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-gray-200/50 shadow-sm dark:bg-gray-900/95 dark:border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Thú Y Thùy Trang
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Management System
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeSwitcher />
              {!hasEnvVars ? <EnvVarWarning /> : <ClientAuthButton />}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <Badge className="mb-6 bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400">
              <Star className="mr-1 h-3 w-3" />
              Phần mềm quản lý chuyên nghiệp
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Phần mềm quản lý bán hàng cho
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                {" "}doanh nghiệp Thú Y Thùy Trang
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
              Giải pháp toàn diện giúp tự động hóa quy trình bán hàng, quản lý kho và chăm sóc khách hàng. 
              Tối ưu hiệu quả kinh doanh với công nghệ hiện đại.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              {hasEnvVars && (
                <Link href="/dashboard">
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-3">
                    <BarChart3 className="mr-2 h-5 w-5" />
                    Truy cập Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              )}
              <Button variant="outline" size="lg" className="text-lg px-8 py-3">
                <Phone className="mr-2 h-5 w-5" />
                Liên hệ tư vấn
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mt-16">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">1,089</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Sản phẩm</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">397</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Khách hàng</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">739</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Hóa đơn</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">4,134</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Giao dịch</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Tính năng nổi bật
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Hệ thống tích hợp đầy đủ các module quản lý cần thiết cho doanh nghiệp thú y
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="text-xl font-semibold">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                Lợi ích khi sử dụng hệ thống
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
                Được thiết kế đặc biệt cho ngành thú y với hiểu biết sâu sắc về quy trình kinh doanh
              </p>
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20 mt-0.5">
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-gray-700 dark:text-gray-300">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-video rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-2xl flex items-center justify-center">
                <div className="text-center text-white">
                  <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-80" />
                  <h3 className="text-xl font-semibold mb-2">Dashboard Demo</h3>
                  <p className="text-blue-100">Giao diện trực quan và hiện đại</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Developer Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Được phát triển bởi
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Đội ngũ chuyên gia với kinh nghiệm phát triển phần mềm quản lý
            </p>
          </div>

          <Card className="border-0 shadow-xl">
            <CardContent className="p-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 mx-auto mb-4 shadow-lg">
                    <Building2 className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Gia Kiệm Số
                  </h3>
                  <p className="text-blue-600 dark:text-blue-400 mb-4 font-medium">
                    giakiemso.com
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    Chuyên cung cấp giải pháp số hóa cho doanh nghiệp
                  </p>
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Thông tin liên hệ Developer
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300">
                        ericphan28@gmail.com
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300">
                        Thắng Phan
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300">
                        Zalo: 0907136029
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Facebook className="h-5 w-5 text-blue-600" />
                      <a 
                        href="https://www.facebook.com/thang.phan.334/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        Facebook Profile
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      {hasEnvVars && (
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <Card className="border-0 shadow-2xl bg-gradient-to-br from-blue-500 to-indigo-600">
              <CardContent className="p-12">
                <div className="text-white">
                  <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                    Sẵn sàng bắt đầu?
                  </h2>
                  <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
                    Trải nghiệm ngay dashboard quản lý hiện đại và bắt đầu tối ưu hóa 
                    quy trình kinh doanh của bạn
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link href="/dashboard">
                      <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8 py-3">
                        <BarChart3 className="mr-2 h-5 w-5" />
                        Vào Dashboard
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                    <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-blue-600 text-lg px-8 py-3">
                      <Shield className="mr-2 h-5 w-5" />
                      Tìm hiểu thêm
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-bold">Thú Y Thùy Trang</span>
              </div>
              <p className="text-gray-400">
                Hệ thống quản lý bán hàng chuyên nghiệp cho doanh nghiệp thú y
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Liên hệ</h4>
              <div className="space-y-2 text-gray-400">
                <p>Email: ericphan28@gmail.com</p>
                <p>Zalo: 0907136029</p>
                <p>Developer: Thắng Phan</p>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Công nghệ</h4>
              <p className="text-gray-400">
                Được xây dựng với Next.js, Supabase, và các công nghệ hiện đại nhất
              </p>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 Thú Y Thùy Trang Management System. Phát triển bởi Gia Kiệm Số.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
