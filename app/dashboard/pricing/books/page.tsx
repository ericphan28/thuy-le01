import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export default async function PriceBooksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const sp = await searchParams
  const q = ((sp.q as string) || '').trim()
  const page = Math.max(1, Number.parseInt((sp.page as string) || '1') || 1)
  const size = Math.min(100, Math.max(10, Number.parseInt((sp.size as string) || '20') || 20))

  let query = supabase
    .from("price_books")
    .select("price_book_id, name, branch_id, channel, customer_group, effective_from, effective_to, is_active, created_at, notes", { count: 'exact' })
    .order("created_at", { ascending: false })

  if (q) {
    query = query.or([
      `name.ilike.%${q}%`,
      `channel.ilike.%${q}%`,
      `customer_group.ilike.%${q}%`,
    ].join(','))
  }
  const from = (page - 1) * size
  const to = from + size - 1
  query = query.range(from, to)
  const { data: books, error, count } = await query

  const total = count ?? (books?.length ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / size))

  async function createBook(formData: FormData) {
    'use server'
    const name = String(formData.get('name') || '').trim()
    if (!name) {
      redirect('/dashboard/pricing/books')
    }
    const supabase = await createClient()
    const { data, error } = await supabase.from('price_books').insert({ name, is_active: true }).select('price_book_id').single()
    if (error || !data) {
      revalidatePath('/dashboard/pricing/books')
      redirect('/dashboard/pricing/books')
    }
    redirect(`/dashboard/pricing/books/${data.price_book_id}`)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bảng giá</h1>
          <p className="text-sm text-muted-foreground mt-2">Danh sách & quản lý bảng giá theo chi nhánh/kênh/nhóm khách.</p>
        </div>
        <form action={createBook} className="flex items-center gap-2 text-sm">
          <input name="name" placeholder="Tên bảng giá mới" className="border rounded px-2 py-1" />
          <button type="submit" className="px-3 py-1.5 rounded bg-primary text-primary-foreground">Tạo</button>
        </form>
      </div>

      {error ? (
        <div className="mt-6 border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-4">
          <div className="font-medium">Không thể tải dữ liệu bảng giá</div>
          <div className="text-sm mt-1">{error.message}</div>
          <div className="text-xs mt-2 opacity-80">Có thể chưa áp dụng schema pricing hoặc thiếu quyền SELECT cho bảng price_books.</div>
        </div>
      ) : (books && books.length > 0 ? (
        <div className="mt-6">
          <form method="get" className="mb-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <input name="q" defaultValue={q} className="border rounded px-2 py-1 w-64" placeholder="Tìm tên/kênh/nhóm KH..." />
              <input type="hidden" name="size" value={size} />
              <button type="submit" className="px-2 py-1 bg-muted rounded">Lọc</button>
            </div>
            <div>Trang {page} / {totalPages}</div>
          </form>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border rounded-md">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3 border-b"><HeaderWithHelp label="Tên" help="Tên bảng giá" /></th>
                <th className="p-3 border-b"><HeaderWithHelp label="Kênh" help="Kênh bán áp dụng (POS/Online...)" /></th>
                <th className="p-3 border-b"><HeaderWithHelp label="Chi nhánh" help="Mã chi nhánh áp dụng (nếu có)" /></th>
                <th className="p-3 border-b"><HeaderWithHelp label="Nhóm KH" help="Nhóm khách hàng áp dụng (nếu có)" /></th>
                <th className="p-3 border-b"><HeaderWithHelp label="Hiệu lực" help="Khoảng ngày áp dụng của bảng giá" /></th>
                <th className="p-3 border-b"><HeaderWithHelp label="Trạng thái" help="Bật/Tắt bảng giá" /></th>
                <th className="p-3 border-b">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.price_book_id} className="hover:bg-accent/30">
                  <td className="p-3 border-b font-medium">
                    <a className="hover:underline" href={`/dashboard/pricing/books/${b.price_book_id}`}>{b.name}</a>
                  </td>
                  <td className="p-3 border-b">{b.channel || "-"}</td>
                  <td className="p-3 border-b">{b.branch_id ?? "-"}</td>
                  <td className="p-3 border-b">{b.customer_group || "-"}</td>
                  <td className="p-3 border-b">
                    {formatRange(b.effective_from, b.effective_to)}
                  </td>
                  <td className="p-3 border-b">
                    {b.is_active ? (
                      <Badge title="Bảng giá đang bật">Đang bật</Badge>
                    ) : (
                      <Badge variant="outline" title="Bảng giá đang tắt">Tắt</Badge>
                    )}
                  </td>
                  <td className="p-3 border-b max-w-[320px] truncate" title={b.notes || ""}>{b.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <div>Tổng cộng: {total} bảng giá • Mỗi trang {size}</div>
            <div className="flex items-center gap-2">
              <a className={`px-2 py-1 border rounded ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`} href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.max(1, page - 1)}`}>‹ Trước</a>
              <a className={`px-2 py-1 border rounded ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`} href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.min(totalPages, page + 1)}`}>Sau ›</a>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 border rounded-md p-6 text-sm">
          <div className="font-medium">Chưa có bảng giá nào.</div>
          <ol className="list-decimal ml-5 mt-2 space-y-1">
            <li>Tạo dữ liệu mẫu bằng cách chạy file SQL: <code className="bg-muted px-1 py-0.5 rounded">sql/seed_price_books.sql</code>.</li>
            <li>Hoặc chèn thủ công 1 bản ghi vào bảng <code className="bg-muted px-1 py-0.5 rounded">price_books</code>.</li>
          </ol>
        </div>
      ))}
    </div>
  )
}

function formatRange(from?: string | null, to?: string | null) {
  const f = from ? new Date(from) : null
  const t = to ? new Date(to) : null
  const fmt = (d: Date) => d.toLocaleDateString("vi-VN")
  if (f && t) return `${fmt(f)} → ${fmt(t)}`
  if (f && !t) return `${fmt(f)} → ∞`
  if (!f && t) return `… → ${fmt(t)}`
  return "-"
}

function HeaderWithHelp({ label, help }: { label: string; help: string }) {
  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <span
        className="text-muted-foreground cursor-help inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground/30 text-[10px]"
        title={help}
        aria-label={`Giải thích: ${label}`}
      >i</span>
    </div>
  )
}
