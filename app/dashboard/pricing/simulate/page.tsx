import { createClient } from '@/lib/supabase/server'

export default async function PricingSimulatePage() {
  const supabase = await createClient()
  const [{ data: books }, { data: prods }] = await Promise.all([
    supabase.from('price_books').select('price_book_id, name').order('created_at', { ascending: false }),
    supabase.from('products').select('product_code, product_name').order('product_name').limit(1000)
  ])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Mô phỏng giá</h1>
      <form className="grid grid-cols-3 gap-3 max-w-3xl" action="/api/pricing/simulate" method="get">
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
        <div className="col-span-3">
          <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded" type="submit">Tính thử</button>
        </div>
      </form>
      <div className="text-sm text-muted-foreground">Gợi ý: Dùng trang này để kiểm tra nhanh trước khi chạy khuyến mãi lớn.</div>
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
