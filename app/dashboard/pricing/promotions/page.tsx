import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import Link from 'next/link'

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const sp = await searchParams
  const q = ((sp.q as string) || '').trim()
  const page = Math.max(1, Number.parseInt((sp.page as string) || '1') || 1)
  const size = Math.min(100, Math.max(10, Number.parseInt((sp.size as string) || '20') || 20))

  // Sử dụng price_rules với các action_type khuyến mãi
  let query = supabase
    .from('price_rules')
    .select(`
      rule_id,
      scope,
      sku_code,
      category_id,
      tag,
      action_type,
      action_value,
      min_qty,
      max_qty,
      priority,
      is_active,
      effective_from,
      effective_to,
      notes,
      price_book_id,
      price_books(name)
    `, { count: 'exact' })
    .in('action_type', ['promotion', 'percent', 'amount'])
    .order('created_at', { ascending: false })

  if (q) {
    query = query.or([
      `sku_code.ilike.%${q}%`,
      `tag.ilike.%${q}%`,
      `notes.ilike.%${q}%`,
    ].join(','))
  }

  const from = (page - 1) * size
  const to = from + size - 1
  query = query.range(from, to)
  const { data: promotions, error, count } = await query

  const total = count ?? (promotions?.length ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / size))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Khuyến mãi</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Chiến dịch khuyến mãi được quản lý thông qua <strong>Price Rules</strong> trong Bảng giá với action_type đặc biệt.
          </p>
        </div>
        <div className="text-right">
          <Link href="/dashboard/pricing/books" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-90 font-medium">
            🎯 Tạo qua Bảng giá
          </Link>
          <div className="text-xs text-muted-foreground mt-1">
            Price Rules với action: percent/amount/promotion
          </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-medium text-blue-800 mb-2">💡 Cách tạo khuyến mãi:</h3>
        <div className="text-sm text-blue-700 space-y-1">
          <div><strong>Bước 1:</strong> Chọn Bảng giá → <strong>Bước 2:</strong> Thêm quy tắc</div>
          <div><strong>Action types:</strong> percent (giảm %), amount (giảm tiền), promotion (đặc biệt)</div>
          <div><strong>Scopes:</strong> sku (sản phẩm), category (danh mục), tag (nhãn)</div>
        </div>
      </div>

      {error ? (
        <div className="mt-6 border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-4">
          <div className="font-medium">Không thể tải khuyến mãi</div>
          <div className="text-sm mt-1">{error.message}</div>
        </div>
      ) : (promotions && promotions.length > 0 ? (
        <div className="mt-6">
          <form method="get" className="mb-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <input name="q" defaultValue={q} className="border rounded px-2 py-1 w-64" placeholder="Tìm SKU/tag/ghi chú..." />
              <input type="hidden" name="size" value={size} />
              <button type="submit" className="px-2 py-1 bg-muted rounded">Lọc</button>
            </div>
            <div>Trang {page} / {totalPages}</div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border rounded-md">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 border-b">Tên khuyến mãi</th>
                  <th className="p-3 border-b">Phạm vi áp dụng</th>
                  <th className="p-3 border-b">Điều kiện</th>
                  <th className="p-3 border-b">Hiệu lực</th>
                  <th className="p-3 border-b">Trạng thái</th>
                  <th className="p-3 border-b">Bảng giá</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p: any) => (
                  <tr key={p.rule_id} className="hover:bg-accent/30">
                    <td className="p-3 border-b">
                      <div className="font-medium">{p.notes || `Khuyến mãi #${p.rule_id}`}</div>
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="mr-1">P{p.priority}</Badge>
                        {formatAction(p.action_type, p.action_value)}
                      </div>
                    </td>
                    <td className="p-3 border-b">
                      {p.scope === 'sku' ? (
                        <div>
                          <Badge variant="secondary">Sản phẩm</Badge>
                          <div className="text-xs mt-1">{p.sku_code}</div>
                        </div>
                      ) : p.scope === 'category' ? (
                        <div>
                          <Badge variant="secondary">Danh mục</Badge>
                          <div className="text-xs mt-1">#{p.category_id}</div>
                        </div>
                      ) : p.scope === 'tag' ? (
                        <div>
                          <Badge variant="secondary">Nhãn</Badge>
                          <div className="text-xs mt-1">{p.tag}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="p-3 border-b">
                      {formatQty(p.min_qty, p.max_qty)}
                    </td>
                    <td className="p-3 border-b">{formatRange(p.effective_from, p.effective_to)}</td>
                    <td className="p-3 border-b">
                      {p.is_active ? (
                        <Badge>Đang chạy</Badge>
                      ) : (
                        <Badge variant="outline">Dừng</Badge>
                      )}
                    </td>
                    <td className="p-3 border-b">{p.price_books?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <div>Tổng cộng: {total} khuyến mãi • Mỗi trang {size}</div>
            <div className="flex items-center gap-2">
              <Link className={`px-2 py-1 border rounded ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`} href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.max(1, page - 1)}`}>‹ Trước</Link>
              <Link className={`px-2 py-1 border rounded ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`} href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.min(totalPages, page + 1)}`}>Sau ›</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 border rounded-md p-6 text-sm">
          <div className="font-medium">Chưa có khuyến mãi nào.</div>
          <div className="mt-2 text-muted-foreground">
            Khuyến mãi được quản lý thông qua quy tắc giá trong Bảng giá với loại action đặc biệt.
          </div>
          <div className="mt-3">
            <Link href="/dashboard/pricing/books" className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90">
              🎯 Tạo qua Price Rules
            </Link>
            <p className="text-xs text-muted-foreground mt-2">
              Bảng giá → Thêm quy tắc → action_type: percent/amount/promotion
            </p>
          </div>
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

function formatAction(type?: string | null, value?: number | null) {
  if (!type) return '-'
  switch (type) {
    case 'percent': return value != null ? `Giảm ${value}%` : 'Giảm %'
    case 'amount': return value != null ? `Giảm ${value.toLocaleString('vi-VN')}₫` : 'Giảm tiền'
    case 'net': return value != null ? `Giá ${value.toLocaleString('vi-VN')}₫` : 'Giá cố định'
    case 'promotion': return 'Khuyến mãi đặc biệt'
    case 'bundle': return 'Gói/Combo'
    default: return type
  }
}

function formatQty(min?: number | null, max?: number | null) {
  if (min && max) return `${min} – ${max}`
  if (min && !max) return `≥ ${min}`
  if (!min && max) return `≤ ${max}`
  return 'Không giới hạn'
}
