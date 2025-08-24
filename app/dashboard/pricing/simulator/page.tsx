import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import Link from 'next/link'
import PriceSimulatorForm from '@/components/pricing/price-simulator-form'

export default async function PriceSimulatorPage() {
  const supabase = await createClient()
  
  // Lấy danh sách products để làm dropdown suggestions
  const { data: products } = await supabase
    .from('products')
    .select('product_code, name, current_price, category_id')
    .eq('is_active', true)
    .order('name')
    .limit(100)

  // Lấy customers để test price rules theo customer
  const { data: customers } = await supabase
    .from('customers')
    .select('customer_id, name, phone')
    .eq('is_active', true)
    .order('name')
    .limit(50)

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
          <PriceSimulatorForm 
            products={products || []}
            customers={customers || []}
          />
        </div>

        {/* Right side - Quick Stats */}
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold mb-3">📊 Thống kê nhanh</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Tổng sản phẩm:</span>
                <Badge variant="secondary">{products?.length || 0}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Khách hàng VIP:</span>
                <Badge variant="secondary">{customers?.length || 0}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Quy tắc giá:</span>
                <Badge variant="outline">Đang tải...</Badge>
              </div>
            </div>
          </div>

          {/* Recent calculations */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold mb-3">🕒 Tính toán gần đây</h3>
            <div className="text-sm text-gray-500">
              Chưa có tính toán nào. Hãy thử mô phỏng giá cho sản phẩm đầu tiên!
            </div>
          </div>
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
