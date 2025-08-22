import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export default async function PriceBookDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const { id: idStr } = await params
  const sp = await searchParams
  const id = Number(idStr)

  const [{ data: book, error: bookErr }] = await Promise.all([
    supabase.from("price_books").select("*").eq("price_book_id", id).maybeSingle(),
  ])

  if (bookErr) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Bảng giá</h1>
        <div className="mt-4 text-destructive">Không thể tải bảng giá: {bookErr.message}</div>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Bảng giá</h1>
        <div className="mt-4">Không tìm thấy bảng giá.</div>
      </div>
    )
  }

  // Filters + pagination from search params
  const viewMode = (sp.view as string) === 'advanced' ? 'advanced' : 'basic'
  const statusFilter = (sp.status as string) || 'all' // all|on|off
  const effFilter = (sp.eff as string) || 'all' // all|current
  const typeFilter = (sp.type as string) || 'all' // all|net|percent|amount
  const qRaw = (sp.q as string) || ''
  const q = qRaw.trim().replace(/,/g, ' ')
  const page = Math.max(1, Number.parseInt((sp.page as string) || '1') || 1)
  const size = Math.min(200, Math.max(10, Number.parseInt((sp.size as string) || '50') || 50))

  const now = new Date()
  // Build filtered, paginated query on server
  let query = supabase
    .from('price_rules')
    .select('rule_id, scope, sku_code, category_id, tag, action_type, action_value, min_qty, max_qty, priority, is_active, effective_from, effective_to, notes', { count: 'exact' })
    .eq('price_book_id', id)

  if (statusFilter === 'on') query = query.eq('is_active', true)
  if (statusFilter === 'off') query = query.eq('is_active', false)
  if (typeFilter !== 'all') query = query.eq('action_type', typeFilter)
  if (effFilter === 'current') {
    const iso = now.toISOString()
    query = query.or(`effective_from.is.null,effective_from.lte.${iso}`)
    query = query.or(`effective_to.is.null,effective_to.gte.${iso}`)
  }
  if (q) {
    const ors: string[] = [
      `sku_code.ilike.%${q}%`,
      `tag.ilike.%${q}%`,
    ]
    const asNum = Number.parseInt(q)
    if (!Number.isNaN(asNum)) ors.push(`category_id.eq.${asNum}`)
    query = query.or(ors.join(','))
  }
  const from = (page - 1) * size
  const to = from + size - 1
  query = query
    .order('is_active', { ascending: false })
    .order('priority', { ascending: false })
    .order('rule_id', { ascending: true })
    .range(from, to)

  const { data: rules, error: rulesErr, count: totalCount } = await query

  // Build product map for only paged rules
  const skuCodes = (rules || []).filter(r => r.scope === 'sku' && !!r.sku_code).map(r => r.sku_code as string)
  const productMap = new Map<string, { name: string; listPrice: number | null }>()
  if (skuCodes.length > 0) {
    const { data: prods } = await supabase
      .from('products')
      .select('product_code, product_name, sale_price, base_price')
      .in('product_code', Array.from(new Set(skuCodes)))
    for (const p of prods || []) {
      const listPrice = (p.sale_price as number | null) ?? (p.base_price as number | null) ?? null
      productMap.set(p.product_code as string, { name: p.product_name as string, listPrice })
    }
  }

  // Server actions: bulk enable/disable/delete and generate from products
  async function bulkEnable(formData: FormData): Promise<void> {
    'use server'
    const supabase = await createClient()
    const ids = formData.getAll('ids').map(v => Number(v)).filter(n => Number.isFinite(n))
    if (ids.length > 0) {
      await supabase.from('price_rules').update({ is_active: true }).in('rule_id', ids as any)
    }
    revalidatePath(`/dashboard/pricing/books/${id}`)
    redirect(`/dashboard/pricing/books/${id}`)
  }

  async function bulkDisable(formData: FormData): Promise<void> {
    'use server'
    const supabase = await createClient()
    const ids = formData.getAll('ids').map(v => Number(v)).filter(n => Number.isFinite(n))
    if (ids.length > 0) {
      await supabase.from('price_rules').update({ is_active: false }).in('rule_id', ids as any)
    }
    revalidatePath(`/dashboard/pricing/books/${id}`)
    redirect(`/dashboard/pricing/books/${id}`)
  }

  async function bulkDelete(formData: FormData): Promise<void> {
    'use server'
    const supabase = await createClient()
    const ids = formData.getAll('ids').map(v => Number(v)).filter(n => Number.isFinite(n))
    if (ids.length > 0) {
      await supabase.from('price_rules').delete().in('rule_id', ids as any)
    }
    revalidatePath(`/dashboard/pricing/books/${id}`)
    redirect(`/dashboard/pricing/books/${id}`)
  }

  async function generateFromProducts(): Promise<void> {
    'use server'
    const supabase = await createClient()
    // Get existing SKU net rules in this book
    const { data: exist } = await supabase
      .from('price_rules')
      .select('sku_code')
      .eq('price_book_id', id)
      .eq('scope', 'sku')
      .eq('action_type', 'net')
    const existing = new Set((exist || []).map(r => r.sku_code as string))
    // Get products with sale_price > 0
    const { data: prods } = await supabase
      .from('products')
      .select('product_code, sale_price')
      .gt('sale_price', 0)
    const payload = [] as any[]
    for (const p of prods || []) {
      const code = p.product_code as string
      if (!code || existing.has(code)) continue
      payload.push({
        price_book_id: id,
        scope: 'sku',
        sku_code: code,
        action_type: 'net',
        action_value: p.sale_price,
        priority: 100,
        is_active: true,
        notes: 'Auto-generated from products.sale_price'
      })
    }
    if (payload.length > 0) {
      // Insert in chunks of 500 to be safe
      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500)
        await supabase.from('price_rules').insert(chunk)
      }
    }
    revalidatePath(`/dashboard/pricing/books/${id}`)
    redirect(`/dashboard/pricing/books/${id}`)
  }

  const total = totalCount ?? (rules?.length ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / size))

  const buildQS = (overrides: Record<string, string | number>) => {
    const params = new URLSearchParams()
    params.set('view', viewMode)
    params.set('status', statusFilter)
    params.set('eff', effFilter)
    params.set('type', typeFilter)
    if (q) params.set('q', q)
    params.set('size', String(size))
    const pageStr = String('page' in overrides ? overrides.page : page)
    params.set('page', pageStr)
    for (const [k, v] of Object.entries(overrides)) {
      if (k !== 'page') params.set(k, String(v))
    }
    return `?${params.toString()}`
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{book.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Kênh: {book.channel || '-'} • Chi nhánh: {book.branch_id ?? '-'} • Nhóm KH: {book.customer_group || '-'}</p>
        <p className="text-xs text-muted-foreground">Hiệu lực: {formatRange(book.effective_from, book.effective_to)} • Trạng thái: {book.is_active ? 'Đang bật' : 'Tắt'}</p>
        {book.notes ? <p className="text-sm mt-2">{book.notes}</p> : null}
        <div className="mt-3">
          <a className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90" href={`/dashboard/pricing/books/${book.price_book_id}/rules/new`}>
            + Thêm quy tắc
          </a>
        </div>
      </div>

      {rulesErr ? (
        <div className="border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-4">
          <div className="font-medium">Không thể tải quy tắc giá</div>
          <div className="text-sm mt-1">{rulesErr?.message}</div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Quy tắc áp dụng ({total})</div>
            <form method="get" className="flex gap-2 text-sm">
              <input type="hidden" name="view" value={viewMode} />
              <input type="hidden" name="page" value={1} />
              <input type="hidden" name="size" value={size} />
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Trạng thái</span>
                <select name="status" defaultValue={statusFilter} className="border rounded px-2 py-1">
                  <option value="all">Tất cả</option>
                  <option value="on">Đang bật</option>
                  <option value="off">Tắt</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Hiệu lực</span>
                <select name="eff" defaultValue={effFilter} className="border rounded px-2 py-1">
                  <option value="all">Tất cả</option>
                  <option value="current">Đang áp dụng</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Loại ưu đãi</span>
                <select name="type" defaultValue={typeFilter} className="border rounded px-2 py-1">
                  <option value="all">Tất cả</option>
                  <option value="net">Giá cố định</option>
                  <option value="percent">Giảm %</option>
                  <option value="amount">Giảm tiền</option>
                </select>
              </label>
              <input name="q" defaultValue={q} placeholder="Tìm SKU/Tên..." className="border rounded px-2 py-1 w-56" />
              <a className="border rounded px-2 py-1" href={`?view=${viewMode === 'basic' ? 'advanced' : 'basic'}&status=${statusFilter}&eff=${effFilter}`}>
                {viewMode === 'basic' ? 'Xem nâng cao' : 'Thu gọn' }
              </a>
              <button type="submit" className="px-2 py-1 bg-muted rounded">Lọc</button>
            </form>
          </div>

          <div className="mb-3 text-xs text-muted-foreground">
            Mẹo: Khi có nhiều quy tắc cùng áp dụng, quy tắc có Priority cao hơn sẽ được chọn. Dùng Priority để ưu đãi đè lên giá nền.
          </div>

          {rules && rules.length > 0 ? (
            <form action={bulkEnable} className="overflow-x-auto">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <button type="submit" className="px-2 py-1 border rounded" title="Bật các quy tắc đã chọn">Bật</button>
                <button formAction={bulkDisable} type="submit" className="px-2 py-1 border rounded" title="Tắt các quy tắc đã chọn">Tắt</button>
                <button formAction={bulkDelete} type="submit" className="px-2 py-1 border border-destructive text-destructive rounded" title="Xoá các quy tắc đã chọn">Xoá</button>
                <button formAction={generateFromProducts} type="submit" className="ml-3 px-2 py-1 bg-primary text-primary-foreground rounded" title="Tạo quy tắc từ giá sản phẩm cho các SKU chưa có">Tạo từ sản phẩm</button>
              </div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <div>Trang {page} / {totalPages}</div>
                <div className="flex items-center gap-2">
                  <a className={`px-2 py-1 border rounded ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`} href={buildQS({ page: Math.max(1, page - 1) })}>‹ Trước</a>
                  <a className={`px-2 py-1 border rounded ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`} href={buildQS({ page: Math.min(totalPages, page + 1) })}>Sau ›</a>
                </div>
              </div>
              <table className="w-full text-sm border rounded-md">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 border-b w-[40px]"><input type="checkbox" title="(Chọn thủ công từng dòng)" /></th>
                    <th className="p-3 border-b">
                      <HeaderWithHelp label="Đối tượng" help="Sản phẩm/Ngành hàng/Nhãn mà quy tắc áp dụng" />
                    </th>
                    <th className="p-3 border-b">
                      <HeaderWithHelp label="Giá niêm yết" help="Giá hiện tại trong danh mục sản phẩm" />
                    </th>
                    <th className="p-3 border-b">
                      <HeaderWithHelp label="Ưu đãi" help="Cách tính giảm giá: Giá cố định / Giảm % / Giảm tiền" />
                    </th>
                    <th className="p-3 border-b">
                      <HeaderWithHelp label="Giá áp dụng" help="Giá sau khi tính ưu đãi" />
                    </th>
                    <th className="p-3 border-b">
                      <HeaderWithHelp label="Điều kiện" help="Giới hạn số lượng (min/max) nếu có" />
                    </th>
                    <th className="p-3 border-b">
                      <HeaderWithHelp label="Hiệu lực" help="Khoảng ngày áp dụng của quy tắc" />
                    </th>
                    <th className="p-3 border-b">
                      <HeaderWithHelp label="Trạng thái" help="Bật/Tắt quy tắc" />
                    </th>
                    {viewMode === 'advanced' && (<>
                      <th className="p-3 border-b"><HeaderWithHelp label="Phạm vi" help="SKU / Ngành hàng / Nhãn" /></th>
                      <th className="p-3 border-b"><HeaderWithHelp label="Ưu tiên" help="Số lớn hơn sẽ thắng khi trùng điều kiện" /></th>
                      <th className="p-3 border-b">Ghi chú</th>
                    </>)}
                    <th className="p-3 border-b w-[80px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {(rules || []).map((r) => {
                    const target = renderTarget(r, productMap)
                    const listPrice = r.scope === 'sku' ? (productMap.get(r.sku_code || '')?.listPrice ?? null) : null
                    const promo = formatAction(r.action_type, r.action_value)
                    const applied = calcAppliedPrice(r.action_type as any, r.action_value as any, listPrice)
                    const eff = formatRange(r.effective_from, r.effective_to)
                    const on = !!r.is_active
                    return (
                      <tr key={r.rule_id} className="hover:bg-accent/30">
                        <td className="p-3 border-b align-top">
                          <input type="checkbox" name="ids" value={r.rule_id} />
                        </td>
                        <td className="p-3 border-b align-top">{target}</td>
                        <td className="p-3 border-b align-top">{listPrice != null ? money(listPrice) : '-'}</td>
                        <td className="p-3 border-b align-top">
                          <div className="flex flex-col gap-1">
                            <div>
                              <Badge variant={r.action_type === 'net' ? 'secondary' : 'default'} className="mr-2">
                                {promo}
                              </Badge>
                              {r.priority != null ? (
                                <Badge variant="outline" title="Priority: số lớn hơn sẽ thắng">P{r.priority}</Badge>
                              ) : null}
                            </div>
                            {listPrice != null && applied != null && applied !== listPrice ? (
                              <div className="text-xs text-muted-foreground" title="Tính từ giá niêm yết và ưu đãi">
                                {money(listPrice)} → {money(applied)}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3 border-b font-medium align-top" title={r.action_type === 'net' ? 'Giá cố định từ quy tắc' : 'Giá sau khi áp ưu đãi trên giá niêm yết'}>
                          {applied != null ? money(applied) : '-'}
                        </td>
                        <td className="p-3 border-b">{formatQty(r.min_qty, r.max_qty)}</td>
                        <td className="p-3 border-b">{eff}</td>
                        <td className="p-3 border-b">
                          {on ? (
                            <Badge title="Quy tắc đang bật">Đang bật</Badge>
                          ) : (
                            <Badge variant="outline" title="Quy tắc đang tắt">Tắt</Badge>
                          )}
                        </td>
                        {viewMode === 'advanced' && (<>
                          <td className="p-3 border-b">
                            <Badge variant="outline">{r.scope}</Badge>
                          </td>
                          <td className="p-3 border-b" title="Số lớn hơn sẽ thắng khi trùng điều kiện">{r.priority}</td>
                          <td className="p-3 border-b max-w-[280px] truncate" title={r.notes || ''}>{r.notes || ''}</td>
                        </>)}
                        <td className="p-3 border-b text-right">
                          <a className="text-sm text-primary hover:underline" href={`/dashboard/pricing/books/${book.price_book_id}/rules/${r.rule_id}/edit`}>Sửa</a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="mt-3 flex items-center justify-between text-sm">
                <div>Tổng cộng: {total} quy tắc • Mỗi trang {size}</div>
                <div className="flex items-center gap-2">
                  <a className={`px-2 py-1 border rounded ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`} href={buildQS({ page: Math.max(1, page - 1) })}>‹ Trước</a>
                  <a className={`px-2 py-1 border rounded ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`} href={buildQS({ page: Math.min(totalPages, page + 1) })}>Sau ›</a>
                </div>
              </div>
            </form>
          ) : (
            <div className="text-sm">
              <div className="text-muted-foreground">Chưa có quy tắc nào.</div>
              <div className="mt-3 border rounded-md p-3 bg-muted/20">
                <div className="text-sm font-medium">Gợi ý</div>
                <ul className="list-disc ml-5 mt-1 text-muted-foreground">
                  <li>Hiện dữ liệu import đang nằm trong <code className="bg-muted px-1 py-0.5 rounded">products.sale_price</code>.</li>
                  <li>Để hiển thị tại đây, hãy tạo quy tắc cho từng SKU từ giá bán hiện tại bằng script: <code className="bg-muted px-1 py-0.5 rounded">sql/generate_pos_rules_from_products.sql</code>.</li>
                  <li>Hoặc chèn vài quy tắc mẫu với <code className="bg-muted px-1 py-0.5 rounded">sql/seed_price_rules.sql</code>.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function isInRange(from?: string | null, to?: string | null, now = new Date()) {
  const f = from ? new Date(from) : null
  const t = to ? new Date(to) : null
  if (f && t) return now >= f && now <= t
  if (f && !t) return now >= f
  if (!f && t) return now <= t
  return true
}

function formatRange(from?: string | null, to?: string | null) {
  const f = from ? new Date(from) : null
  const t = to ? new Date(to) : null
  const fmt = (d: Date) => d.toLocaleDateString('vi-VN')
  if (f && t) return `${fmt(f)} → ${fmt(t)}`
  if (f && !t) return `${fmt(f)} → ∞`
  if (!f && t) return `… → ${fmt(t)}`
  return '-'
}

function renderTarget(r: any, productMap: Map<string, { name: string; listPrice: number | null }>) {
  if (r.scope === 'sku') {
    const p = productMap.get(r.sku_code || '')
    if (p) {
      return (
        <div>
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-muted-foreground"><code className="bg-muted px-1 py-0.5 rounded">{r.sku_code}</code></div>
        </div>
      )
    }
    return <code className="bg-muted px-1 py-0.5 rounded">{r.sku_code || '-'}</code>
  }
  if (r.scope === 'category') return <span>Ngành hàng <code className="bg-muted px-1 py-0.5 rounded">#{r.category_id ?? '-'}</code></span>
  if (r.scope === 'tag') return <span>Nhãn <code className="bg-muted px-1 py-0.5 rounded">{r.tag || '-'}</code></span>
  return '-'
}

function calcAppliedPrice(type: 'net' | 'percent' | 'amount' | null, val: number | null, listPrice: number | null): number | null {
  if (listPrice == null) return type === 'net' ? (val ?? null) : null
  if (!type || val == null) return null
  switch (type) {
    case 'net': return val
    case 'percent': return Math.max(0, round2(listPrice * (100 - val) / 100))
    case 'amount': return Math.max(0, round2(listPrice - val))
    default: return null
  }
}

function round2(n: number) { return Math.round(n * 100) / 100 }
function money(n: number) { return n.toLocaleString('vi-VN') + '₫' }

function formatAction(type?: string | null, value?: number | null) {
  if (!type) return '-'
  switch (type) {
    case 'percent': return value != null ? `Giảm ${value}%` : 'Giảm %'
    case 'amount': return value != null ? `Giảm ${value.toLocaleString('vi-VN')}₫` : 'Giảm tiền'
    case 'net': return value != null ? `Giá cố định ${value.toLocaleString('vi-VN')}₫` : 'Giá cố định'
    case 'bundle': return 'Gói/bundle'
    case 'tier': return 'Bậc số lượng'
    default: return type
  }
}

function formatQty(min?: number | null, max?: number | null) {
  if (min && max) return `${min} – ${max}`
  if (min && !max) return `≥ ${min}`
  if (!min && max) return `≤ ${max}`
  return '-'
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
