import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import Link from 'next/link'
import PriceSimulatorForm from '@/components/pricing/price-simulator-form'
import PriceSimulatorStats from '@/components/pricing/price-simulator-stats'

export default async function PriceSimulatorPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🎯 Mô phỏng Giá</h1>
          <p className="text-muted-foreground mt-2">
            Tính toán giá cuối cùng cho khách hàng dựa trên các quy tắc khuyến mãi
          </p>
        </div>
        <div className="flex gap-2">
          <Link 
            href="/dashboard/pricing/promotions" 
            className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            📋 Xem khuyến mãi
          </Link>
          <Link 
            href="/dashboard/pricing/books" 
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            📖 Bảng giá
          </Link>
          <Link 
            href="/dashboard/pricing/reset" 
            className="px-4 py-2 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
          >
            🔄 Reset bảng giá
          </Link>
        </div>
      </div>

      {/* Hướng dẫn sử dụng */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-800 mb-2">💡 Cách sử dụng:</h3>
        <div className="text-sm text-blue-700 space-y-1">
          <div><strong>Bước 1:</strong> Chọn sản phẩm từ danh sách hoặc nhập mã SKU</div>
          <div><strong>Bước 2:</strong> Nhập số lượng mua</div>
          <div><strong>Bước 3:</strong> (Tùy chọn) Chọn khách hàng để áp dụng giá VIP</div>
          <div><strong>Bước 4:</strong> Nhấn &ldquo;Tính giá&rdquo; để xem kết quả chi tiết</div>
        </div>
      </div>

      {/* Form mô phỏng */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left side - Input Form */}
        <div className="space-y-6">
          <PriceSimulatorForm />
        </div>

        {/* Right side - Quick Stats */}
        <div className="space-y-4">
          <PriceSimulatorStats />
        </div>
      </div>

      {/* Tips section */}
      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h3 className="font-semibold text-amber-800 mb-2">💡 Mẹo sử dụng hiệu quả:</h3>
        <div className="text-sm text-amber-700 space-y-1">
          <div>• <strong>Bulk testing:</strong> Sử dụng tính năng nhập nhiều SKU cùng lúc</div>
          <div>• <strong>Export kết quả:</strong> Lưu báo cáo để gửi cho team sales</div>
          <div>• <strong>So sánh giá:</strong> Test cùng sản phẩm với số lượng khác nhau</div>
          <div>• <strong>Date testing:</strong> Kiểm tra giá trong tương lai khi có khuyến mãi</div>
        </div>
      </div>
    </div>
  )
}
