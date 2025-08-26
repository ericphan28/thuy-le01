import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import Link from 'next/link'
import ResetPriceBook from '@/components/pricing/reset-price-book'

export default async function ResetPriceBookPage() {
  const supabase = await createClient()
  
  // Get all price books
  const { data: priceBooks, error } = await supabase
    .from('price_books')
    .select('price_book_id, name, channel, is_active')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching price books:', error)
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🔄 Reset Bảng Giá</h1>
          <p className="text-muted-foreground mt-2">
            Khôi phục bảng giá về trạng thái mặc định với các template có sẵn
          </p>
        </div>
        <div className="flex gap-2">
          <Link 
            href="/dashboard/pricing/simulator" 
            className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            🎯 Mô phỏng giá
          </Link>
          <Link 
            href="/dashboard/pricing/books" 
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            📖 Quản lý bảng giá
          </Link>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-amber-800 mb-2">ℹ️ Về chức năng Reset:</h3>
        <div className="text-sm text-amber-700 space-y-1">
          <div><strong>Mặc định</strong> có nghĩa là áp dụng một bộ quy tắc giá chuẩn, phù hợp với nghiệp vụ thông thường</div>
          <div><strong>Xóa sạch:</strong> Chỉ dùng giá niêm yết, không có quy tắc giảm giá</div>
          <div><strong>Cơ bản:</strong> Áp dụng giảm giá theo số lượng đơn giản</div>
          <div><strong>POS Template:</strong> Bộ quy tắc chuyên nghiệp cho bán hàng tại quầy</div>
        </div>
      </div>

      {/* Price Books List */}
      {priceBooks && priceBooks.length > 0 ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">📋 Chọn bảng giá cần reset:</h2>
            <div className="grid gap-4">
              {priceBooks.map((priceBook) => (
                <div key={priceBook.price_book_id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-lg">{priceBook.name}</h3>
                      <Badge variant={priceBook.is_active ? "default" : "secondary"}>
                        {priceBook.is_active ? "Hoạt động" : "Không hoạt động"}
                      </Badge>
                      {priceBook.channel && (
                        <Badge variant="outline">
                          {priceBook.channel}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <ResetPriceBook 
                    priceBookId={priceBook.price_book_id}
                    priceBookName={priceBook.name}
                    onResetComplete={() => {
                      // Optional: Refresh page or show notification
                      window.location.reload()
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-xl font-semibold mb-2">Không có bảng giá nào</h3>
          <p className="text-muted-foreground mb-6">
            Bạn cần tạo ít nhất một bảng giá trước khi có thể reset
          </p>
          <Link 
            href="/dashboard/pricing/books" 
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            ➕ Tạo bảng giá mới
          </Link>
        </div>
      )}

      {/* Warning */}
      <div className="mt-8 bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="font-semibold text-red-800 mb-2">⚠️ Lưu ý quan trọng:</h3>
        <div className="text-sm text-red-700 space-y-1">
          <div>• Thao tác reset sẽ <strong>xóa tất cả quy tắc giá hiện tại</strong> của bảng giá đã chọn</div>
          <div>• Dữ liệu đã xóa <strong>không thể khôi phục</strong>, hãy cân nhắc kỹ trước khi thực hiện</div>
          <div>• Nên backup dữ liệu quan trọng trước khi reset</div>
          <div>• Sau khi reset, bạn có thể thêm quy tắc mới hoặc chỉnh sửa các quy tắc template</div>
        </div>
      </div>
    </div>
  )
}
