import { createClient } from '@/lib/supabase/server'

export default async function PricingSimulatePage() {
  const supabase = await createClient()
  const [{ data: books }, { data: prods }, { data: customers }] = await Promise.all([
    supabase.from('price_books').select('price_book_id, name').order('created_at', { ascending: false }),
    supabase.from('products').select('product_code, product_name').order('product_name').limit(1000),
    supabase.from('customers').select('customer_id, customer_name, customer_code').order('customer_name').limit(500)
  ])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Mô phỏng giá (Unified Pricing Engine)</h1>
      <div className="text-sm text-muted-foreground mb-4">
        🚀 Sử dụng Unified Pricing Service - tích hợp contract pricing, price rules và volume tiers
      </div>
      <form className="grid grid-cols-4 gap-3 max-w-5xl" action="/api/pricing/simulate" method="get">
        <label className="flex flex-col gap-1">
          <HeaderWithHelp label="Bảng giá" help="Chọn bảng giá để tính" />
          <select name="price_book_id" className="border rounded px-2 py-1">
            {(books || []).map(b => <option key={b.price_book_id} value={b.price_book_id}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <HeaderWithHelp label="Sản phẩm" help="Chọn SKU để mô phỏng" />
          <select name="sku" className="border rounded px-2 py-1">
            {(prods || []).map(p => <option key={p.product_code} value={p.product_code}>{p.product_code} | {p.product_name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <HeaderWithHelp label="Số lượng" help="Số lượng để tính bậc số lượng nếu có" />
          <input name="qty" type="number" min={1} defaultValue={1} className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <HeaderWithHelp label="Khách hàng" help="Chọn khách hàng để kiểm tra contract pricing (tùy chọn)" />
          <select name="customer_id" className="border rounded px-2 py-1">
            <option value="">-- Không chọn --</option>
            {(customers || []).map(c => <option key={c.customer_id} value={c.customer_id}>{c.customer_code} | {c.customer_name}</option>)}
          </select>
        </label>
        <div className="col-span-4">
          <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded" type="submit">Tính thử (Unified Engine)</button>
        </div>
      </form>
      <div className="text-sm text-muted-foreground">
        <strong>Gợi ý:</strong> Dùng trang này để kiểm tra nhanh trước khi chạy khuyến mãi lớn.
        <br />
        <strong>Mới:</strong> Có thể chọn khách hàng để test contract pricing (ví dụ: A HOÀNG HIẾU VỊT có contract SP000049 = 185k)
      </div>
    </div>
  )
}

function HeaderWithHelp({ label, help }: { label: string; help: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm">{label}</span>
      <span
        className="text-muted-foreground cursor-help inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground/30 text-[10px]"
        title={help}
        aria-label={`Giải thích: ${label}`}
      >i</span>
    </div>
  )
}
