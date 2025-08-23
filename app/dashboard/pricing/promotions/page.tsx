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

  // Load thêm thông tin sản phẩm và danh mục nếu cần
  let productMap: Record<string, string> = {}
  let categoryMap: Record<number, string> = {}
  
  if (promotions?.length) {
    // Load tên sản phẩm cho scope = sku
    const skuCodes = promotions
      .filter(p => p.scope === 'sku' && p.sku_code)
      .map(p => p.sku_code!)
    if (skuCodes.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('product_code, product_name')
        .in('product_code', skuCodes)
      productMap = products?.reduce((acc, p) => ({ ...acc, [p.product_code]: p.product_name }), {}) || {}
    }

    // Load tên danh mục cho scope = category
    const categoryIds = promotions
      .filter(p => p.scope === 'category' && p.category_id)
      .map(p => p.category_id!)
    if (categoryIds.length > 0) {
      const { data: categories } = await supabase
        .from('product_categories')
        .select('category_id, category_name')
        .in('category_id', categoryIds)
      categoryMap = categories?.reduce((acc, c) => ({ ...acc, [c.category_id]: c.category_name }), {}) || {}
    }
  }

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
          <form method="get" action="/dashboard/pricing/promotions" className="mb-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <input name="q" defaultValue={q} className="border rounded px-2 py-1 w-64" placeholder="Tìm SKU/tag/ghi chú..." />
              <input type="hidden" name="size" value={size} />
              <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">🔍 Lọc</button>
            </div>
            <div>Trang {page} / {totalPages}</div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border rounded-md">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 border-b font-semibold">🏷️ Khuyến mãi</th>
                  <th className="p-3 border-b font-semibold">🎯 Phạm vi áp dụng</th>
                  <th className="p-3 border-b font-semibold">📦 Điều kiện số lượng</th>
                  <th className="p-3 border-b font-semibold">⏰ Thời gian hiệu lực</th>
                  <th className="p-3 border-b font-semibold">⚡ Trạng thái</th>
                  <th className="p-3 border-b font-semibold">📊 Bảng giá</th>
                  <th className="p-3 border-b font-semibold">⚙️ Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p: any) => (
                  <tr key={p.rule_id} className="hover:bg-accent/30">
                    <td className="p-3 border-b">
                      <div className="font-medium text-gray-900">
                        {p.notes || `Khuyến mãi #${p.rule_id}`}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs bg-gray-50">
                          Ưu tiên {p.priority}
                        </Badge>
                        <div className="text-xs font-medium text-blue-600">
                          {formatActionDetailed(p.action_type, p.action_value)}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 border-b">
                      {p.scope === 'sku' ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700">🏷️ Sản phẩm</Badge>
                          </div>
                          <div className="text-xs mt-1 space-y-0.5">
                            <div className="font-mono text-muted-foreground">{p.sku_code}</div>
                            {productMap[p.sku_code!] && (
                              <div className="font-medium text-gray-800">{productMap[p.sku_code!]}</div>
                            )}
                          </div>
                        </div>
                      ) : p.scope === 'category' ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-green-100 text-green-700">📁 Danh mục</Badge>
                          </div>
                          <div className="text-xs mt-1 space-y-0.5">
                            <div className="font-mono text-muted-foreground">ID #{p.category_id}</div>
                            {categoryMap[p.category_id!] && (
                              <div className="font-medium text-gray-800">{categoryMap[p.category_id!]}</div>
                            )}
                          </div>
                        </div>
                      ) : p.scope === 'tag' ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700">🏷️ Nhãn</Badge>
                          </div>
                          <div className="text-xs mt-1">
                            <div className="font-medium bg-purple-50 text-purple-800 px-2 py-0.5 rounded-full inline-block">
                              {p.tag}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Badge variant="outline" className="bg-gray-100 text-gray-600">🌍 Tất cả</Badge>
                        </div>
                      )}
                    </td>
                    <td className="p-3 border-b">
                      <div className="text-sm">
                        {formatQtyDetailed(p.min_qty, p.max_qty)}
                      </div>
                    </td>
                    <td className="p-3 border-b">
                      <div className="text-sm">
                        {formatRange(p.effective_from, p.effective_to)}
                      </div>
                    </td>
                    <td className="p-3 border-b">
                      {p.is_active ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          ✅ Đang hoạt động
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
                          ⏸️ Tạm dừng
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 border-b">
                      <div className="text-sm">
                        {p.price_books?.name ? (
                          <div>
                            <div className="font-medium text-blue-600">{p.price_books.name}</div>
                            <div className="text-xs text-gray-500">ID: {p.price_book_id}</div>
                          </div>
                        ) : (
                          <div className="text-gray-400 text-sm">Chưa xác định</div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 border-b">
                      <div className="flex items-center gap-1">
                        <Link 
                          href={`/dashboard/pricing/books/${p.price_book_id}/rules/${p.rule_id}/edit`}
                          className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                          title="Chỉnh sửa khuyến mãi"
                        >
                          ✏️ Sửa
                        </Link>
                        <Link 
                          href={`/dashboard/pricing/books/${p.price_book_id}`}
                          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                          title="Xem bảng giá"
                        >
                          📊 Xem
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm bg-gray-50 p-3 rounded-lg">
            <div className="flex items-center gap-4">
              <div>📊 Tổng cộng: <span className="font-semibold text-blue-600">{total}</span> khuyến mãi</div>
              <div>📄 Mỗi trang: <span className="font-semibold">{size}</span> mục</div>
            </div>
            <div className="flex items-center gap-2">
              <Link 
                className={`px-3 py-1.5 border rounded-lg transition-colors ${page <= 1 ? 'pointer-events-none opacity-50 bg-gray-100' : 'hover:bg-gray-100'}`} 
                href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.max(1, page - 1)}`}
              >
                ← Trang trước
              </Link>
              <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-medium">
                {page} / {totalPages}
              </span>
              <Link 
                className={`px-3 py-1.5 border rounded-lg transition-colors ${page >= totalPages ? 'pointer-events-none opacity-50 bg-gray-100' : 'hover:bg-gray-100'}`} 
                href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.min(totalPages, page + 1)}`}
              >
                Trang sau →
              </Link>
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
  const fmt = (d: Date) => d.toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit', year: 'numeric' })
  
  if (f && t) {
    const isActive = new Date() >= f && new Date() <= t
    return (
      <div>
        <div className="text-sm font-medium">{fmt(f)} → {fmt(t)}</div>
        <div className={`text-xs ${isActive ? 'text-green-600' : 'text-gray-500'}`}>
          {isActive ? '🟢 Đang trong thời gian hiệu lực' : '🔴 Ngoài thời gian hiệu lực'}
        </div>
      </div>
    )
  }
  if (f && !t) return <div><div className="text-sm font-medium">{fmt(f)} → ∞</div><div className="text-xs text-blue-600">🔵 Không có ngày kết thúc</div></div>
  if (!f && t) return <div><div className="text-sm font-medium">… → {fmt(t)}</div><div className="text-xs text-orange-600">🟠 Không có ngày bắt đầu</div></div>
  return <div><div className="text-sm font-medium">Vô thời hạn</div><div className="text-xs text-gray-500">🌍 Luôn hiệu lực</div></div>
}

function formatActionDetailed(type?: string | null, value?: number | null) {
  if (!type) return '-'
  switch (type) {
    case 'percent': return value != null ? `🏷️ Giảm ${value}%` : '🏷️ Giảm theo %'
    case 'amount': return value != null ? `💰 Giảm ${value.toLocaleString('vi-VN')}₫` : '💰 Giảm số tiền'
    case 'net': return value != null ? `🏷️ Giá cố định ${value.toLocaleString('vi-VN')}₫` : '🏷️ Giá cố định'
    case 'promotion': return '🎁 Chương trình khuyến mãi đặc biệt'
    case 'bundle': return '📦 Gói combo'
    default: return type
  }
}

function formatQtyDetailed(min?: number | null, max?: number | null) {
  if (min && max) return `📦 ${min} → ${max} sản phẩm`
  if (min && !max) return `📦 Từ ${min} sản phẩm trở lên`
  if (!min && max) return `📦 Tối đa ${max} sản phẩm`
  return '📦 Không giới hạn số lượng'
}
