import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export default async function VolumeTiersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const sp = await searchParams
  const q = ((sp.q as string) || '').trim()
  const page = Math.max(1, Number.parseInt((sp.page as string) || '1') || 1)
  const size = Math.min(100, Math.max(10, Number.parseInt((sp.size as string) || '20') || 20))

  let query = supabase
    .from('volume_tiers')
    .select(`
      tier_id,
      scope,
      product_id,
      category_id,
      min_qty,
      discount_percent,
      discount_amount,
      effective_from,
      effective_to,
      is_active,
      notes,
      products(product_code, product_name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (q) {
    const asNum = Number.parseInt(q)
    if (!Number.isNaN(asNum)) {
      query = query.or(`category_id.eq.${asNum},product_id.eq.${asNum}`)
    } else {
      query = query.or(`products.product_code.ilike.%${q}%,products.product_name.ilike.%${q}%`)
    }
  }

  const from = (page - 1) * size
  const to = from + size - 1
  query = query.range(from, to)
  const { data: tiers, error, count } = await query

  const total = count ?? (tiers?.length ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / size))

  async function createTier(formData: FormData) {
    'use server'
    const scope = String(formData.get('scope') || 'sku')
    const product_id = formData.get('product_id') ? Number(formData.get('product_id')) : null
    const category_id = formData.get('category_id') ? Number(formData.get('category_id')) : null
    const min_qty = Number(formData.get('min_qty') || 0)
    const discount_percent = formData.get('discount_percent') ? Number(formData.get('discount_percent')) : null
    const discount_amount = formData.get('discount_amount') ? Number(formData.get('discount_amount')) : null
    
    if (min_qty <= 0 || (!discount_percent && !discount_amount)) {
      redirect('/dashboard/pricing/tiers?error=invalid_input')
    }

    const supabase = await createClient()
    await supabase.from('volume_tiers').insert({
      scope,
      product_id,
      category_id,
      min_qty,
      discount_percent,
      discount_amount,
      is_active: true
    })
    revalidatePath('/dashboard/pricing/tiers')
    redirect('/dashboard/pricing/tiers')
  }

  async function toggleActive(formData: FormData) {
    'use server'
    const tier_id = Number(formData.get('tier_id'))
    const current = formData.get('current') === 'true'
    
    const supabase = await createClient()
    await supabase.from('volume_tiers')
      .update({ is_active: !current })
      .eq('tier_id', tier_id)
    
    revalidatePath('/dashboard/pricing/tiers')
    redirect('/dashboard/pricing/tiers')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bậc số lượng</h1>
          <p className="text-sm text-muted-foreground mt-2">Thiết lập chiết khấu theo số lượng mua cho sản phẩm/danh mục.</p>
        </div>
        <form action={createTier} className="flex items-center gap-2 text-sm">
          <select name="scope" className="border rounded px-2 py-1">
            <option value="sku">Sản phẩm</option>
            <option value="category">Danh mục</option>
          </select>
          <input name="product_id" type="number" placeholder="ID SP" className="border rounded px-2 py-1 w-16" />
          <input name="category_id" type="number" placeholder="ID DM" className="border rounded px-2 py-1 w-16" />
          <input name="min_qty" type="number" placeholder="SL tối thiểu" className="border rounded px-2 py-1 w-24" required />
          <input name="discount_percent" type="number" step="0.1" placeholder="Giảm %" className="border rounded px-2 py-1 w-20" />
          <button type="submit" className="px-3 py-1.5 rounded bg-primary text-primary-foreground">Tạo</button>
        </form>
      </div>

      {error ? (
        <div className="mt-6 border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-4">
          <div className="font-medium">Không thể tải bậc số lượng</div>
          <div className="text-sm mt-1">{error.message}</div>
        </div>
      ) : (tiers && tiers.length > 0 ? (
        <div className="mt-6">
          <form method="get" className="mb-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <input name="q" defaultValue={q} className="border rounded px-2 py-1 w-64" placeholder="Tìm sản phẩm/ID danh mục..." />
              <input type="hidden" name="size" value={size} />
              <button type="submit" className="px-2 py-1 bg-muted rounded">Lọc</button>
            </div>
            <div>Trang {page} / {totalPages}</div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border rounded-md">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 border-b">Phạm vi</th>
                  <th className="p-3 border-b">Đối tượng</th>
                  <th className="p-3 border-b">Số lượng tối thiểu</th>
                  <th className="p-3 border-b">Chiết khấu</th>
                  <th className="p-3 border-b">Hiệu lực</th>
                  <th className="p-3 border-b">Trạng thái</th>
                  <th className="p-3 border-b">Ghi chú</th>
                  <th className="p-3 border-b">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t: any) => (
                  <tr key={t.tier_id} className="hover:bg-accent/30">
                    <td className="p-3 border-b">
                      <Badge variant="outline">{t.scope === 'sku' ? 'Sản phẩm' : 'Danh mục'}</Badge>
                    </td>
                    <td className="p-3 border-b">
                      {t.scope === 'sku' ? (
                        <div>
                          <div className="font-medium">{t.products?.product_name || 'N/A'}</div>
                          <div className="text-xs text-muted-foreground">{t.products?.product_code || `ID: ${t.product_id}`}</div>
                        </div>
                      ) : (
                        <div>Danh mục #{t.category_id}</div>
                      )}
                    </td>
                    <td className="p-3 border-b font-medium">{Number(t.min_qty).toLocaleString('vi-VN')}</td>
                    <td className="p-3 border-b">
                      {t.discount_percent ? (
                        <Badge>Giảm {t.discount_percent}%</Badge>
                      ) : t.discount_amount ? (
                        <Badge variant="secondary">Giảm {Number(t.discount_amount).toLocaleString('vi-VN')}₫</Badge>
                      ) : '-'}
                    </td>
                    <td className="p-3 border-b">{formatRange(t.effective_from, t.effective_to)}</td>
                    <td className="p-3 border-b">
                      {t.is_active ? (
                        <Badge>Đang bật</Badge>
                      ) : (
                        <Badge variant="outline">Tắt</Badge>
                      )}
                    </td>
                    <td className="p-3 border-b max-w-[200px] truncate" title={t.notes || ''}>{t.notes || ''}</td>
                    <td className="p-3 border-b">
                      <form action={toggleActive} className="inline">
                        <input type="hidden" name="tier_id" value={t.tier_id} />
                        <input type="hidden" name="current" value={t.is_active} />
                        <button type="submit" className="text-sm text-primary hover:underline">
                          {t.is_active ? 'Tắt' : 'Bật'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <div>Tổng cộng: {total} bậc số lượng • Mỗi trang {size}</div>
            <div className="flex items-center gap-2">
              <a className={`px-2 py-1 border rounded ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`} href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.max(1, page - 1)}`}>‹ Trước</a>
              <a className={`px-2 py-1 border rounded ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`} href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.min(totalPages, page + 1)}`}>Sau ›</a>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 border rounded-md p-6 text-sm">
          <div className="font-medium">Chưa có bậc số lượng nào.</div>
          <div className="mt-2 text-muted-foreground">
            Bậc số lượng cho phép tự động áp dụng chiết khấu khi khách mua từ số lượng nhất định trở lên.
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
