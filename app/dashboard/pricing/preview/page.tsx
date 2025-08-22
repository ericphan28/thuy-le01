import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { simulatePrice } from "@/lib/pricing/engine"

export default async function PricingPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const sp = await searchParams
  
  const customer_id = sp.customer_id ? Number(sp.customer_id) : null
  const price_book_id = sp.price_book_id ? Number(sp.price_book_id) : null
  const sku = ((sp.sku as string) || '').trim()
  const qty = Math.max(1, Number(sp.qty) || 1)

  // Load available data for dropdowns
  const [{ data: customers }, { data: books }, { data: products }] = await Promise.all([
    supabase.from('customers').select('customer_id, customer_name').order('customer_name').limit(50),
    supabase.from('price_books').select('price_book_id, name').eq('is_active', true).order('name'),
    supabase.from('products').select('product_code, product_name, sale_price').order('product_name').limit(100)
  ])

  let simulationResult = null
  let error = null

  if (price_book_id && sku && qty > 0) {
    try {
      simulationResult = await simulatePrice({ price_book_id, sku, qty })
    } catch (err: any) {
      error = err.message
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Mô phỏng giá bán</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Nhập thông tin khách hàng và sản phẩm để xem giá cuối cùng và quy tắc áp dụng.
        </p>
      </div>

      <form method="get" className="space-y-4 p-4 border rounded-lg bg-muted/20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Khách hàng</label>
            <select name="customer_id" defaultValue={customer_id || ''} className="w-full border rounded px-3 py-2">
              <option value="">Chọn khách hàng</option>
              {customers?.map(c => (
                <option key={c.customer_id} value={c.customer_id}>{c.customer_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Bảng giá <span className="text-destructive">*</span></label>
            <select name="price_book_id" defaultValue={price_book_id || ''} className="w-full border rounded px-3 py-2" required>
              <option value="">Chọn bảng giá</option>
              {books?.map(b => (
                <option key={b.price_book_id} value={b.price_book_id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Sản phẩm <span className="text-destructive">*</span></label>
            <input 
              name="sku" 
              defaultValue={sku} 
              list="products-list"
              className="w-full border rounded px-3 py-2" 
              placeholder="Mã sản phẩm"
              required 
            />
            <datalist id="products-list">
              {products?.map(p => (
                <option key={p.product_code} value={p.product_code}>{p.product_name}</option>
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Số lượng</label>
            <input 
              name="qty" 
              type="number" 
              min="1" 
              defaultValue={qty} 
              className="w-full border rounded px-3 py-2" 
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">
            Mô phỏng giá
          </button>
          <a href="/dashboard/pricing/preview" className="px-4 py-2 border rounded hover:bg-accent">
            Xóa bộ lọc
          </a>
        </div>
      </form>

      {error && (
        <div className="mt-6 border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-4">
          <div className="font-medium">Lỗi mô phỏng</div>
          <div className="text-sm mt-1">{error}</div>
        </div>
      )}

      {simulationResult && (
        <div className="mt-6 space-y-4">
          <div className="border rounded-lg p-4 bg-green-50 border-green-200">
            <h3 className="font-medium text-green-800 mb-2">Kết quả mô phỏng</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Giá niêm yết</div>
                <div className="font-medium text-lg">
                  {simulationResult.list_price ? `${simulationResult.list_price.toLocaleString('vi-VN')}₫` : 'N/A'}
                </div>
              </div>
              
              <div>
                <div className="text-muted-foreground">Giá cuối cùng</div>
                <div className="font-medium text-lg text-green-600">
                  {simulationResult.final_price !== null ? `${simulationResult.final_price.toLocaleString('vi-VN')}₫` : 'N/A'}
                </div>
              </div>
              
              <div>
                <div className="text-muted-foreground">Tiết kiệm</div>
                <div className="font-medium text-lg">
                  {simulationResult.list_price && simulationResult.final_price !== null && simulationResult.list_price > simulationResult.final_price
                    ? `${(simulationResult.list_price - simulationResult.final_price).toLocaleString('vi-VN')}₫`
                    : '0₫'
                  }
                </div>
              </div>
            </div>

            {simulationResult.applied_rule_id && (
              <div className="mt-4 p-3 bg-white rounded border">
                <div className="text-sm font-medium text-muted-foreground mb-1">Quy tắc áp dụng</div>
                <div className="flex items-center gap-2">
                  <Badge>#{simulationResult.applied_rule_id}</Badge>
                  <span className="text-sm">{simulationResult.applied_reason}</span>
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            * Kết quả chỉ mang tính tham khảo. Giá thực tế có thể khác do các điều kiện bổ sung tại thời điểm bán.
          </div>
        </div>
      )}

      {!simulationResult && !error && (price_book_id || sku) && (
        <div className="mt-6 border rounded-md p-4 text-sm text-muted-foreground">
          Vui lòng nhập đầy đủ Bảng giá và Mã sản phẩm để thực hiện mô phỏng.
        </div>
      )}

      <div className="mt-8 border-t pt-6">
        <h3 className="font-medium mb-3">Hướng dẫn sử dụng</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <div>• <strong>Bảng giá:</strong> Chọn bảng giá phù hợp với kênh bán (POS, Online...) và nhóm khách hàng.</div>
          <div>• <strong>Sản phẩm:</strong> Nhập mã sản phẩm chính xác. Hệ thống sẽ gợi ý từ danh sách có sẵn.</div>
          <div>• <strong>Số lượng:</strong> Ảnh hưởng đến các quy tắc chiết khấu theo volume và bậc số lượng.</div>
          <div>• <strong>Khách hàng:</strong> Nếu chọn, hệ thống sẽ kiểm tra hợp đồng giá riêng và nhóm khách hàng.</div>
        </div>
      </div>
    </div>
  )
}
