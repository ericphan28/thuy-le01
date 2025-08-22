import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import Link from 'next/link'

export default async function ContractPricingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const sp = await searchParams
  const q = ((sp.q as string) || '').trim()
  const page = Math.max(1, Number.parseInt((sp.page as string) || '1') || 1)
  const size = Math.min(100, Math.max(10, Number.parseInt((sp.size as string) || '20') || 20))

  let query = supabase
    .from('contract_prices')
    .select('contract_id, customer_id, product_id, net_price, effective_from, effective_to, is_active, notes, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  const from = (page - 1) * size
  const to = from + size - 1
  query = query.range(from, to)
  const { data: contracts, error, count } = await query

  // Fetch related data separately
  let customers = new Map()
  let products = new Map()
  
  if (contracts && contracts.length > 0) {
    const customerIds = [...new Set(contracts.map(c => c.customer_id).filter(Boolean))]
    const productIds = [...new Set(contracts.map(c => c.product_id).filter(Boolean))]
    
    if (customerIds.length > 0) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('customer_id, customer_name, customer_code')
        .in('customer_id', customerIds)
      
      customerData?.forEach(c => customers.set(c.customer_id, c))
    }
    
    if (productIds.length > 0) {
      const { data: productData } = await supabase
        .from('products')
        .select('product_id, product_code, product_name, sale_price, cost_price')
        .in('product_id', productIds)
      
      productData?.forEach(p => products.set(p.product_id, p))
    }
  }

  // Filter by search query if provided
  let filteredContracts = contracts || []
  if (q && contracts) {
    filteredContracts = contracts.filter(c => {
      const customer = customers.get(c.customer_id)
      const product = products.get(c.product_id)
      const searchText = [
        customer?.customer_name,
        customer?.customer_code,
        product?.product_name,
        product?.product_code
      ].filter(Boolean).join(' ').toLowerCase()
      
      return searchText.includes(q.toLowerCase())
    })
  }

  const total = count ?? (filteredContracts?.length ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / size))

  async function createContract(formData: FormData) {
    'use server'
    // Remove this function as we now use dedicated /new page
  }

  async function toggleActive(formData: FormData) {
    'use server'
    const contract_id = Number(formData.get('contract_id'))
    const current = formData.get('current') === 'true'
    
    const supabase = await createClient()
    await supabase.from('contract_prices')
      .update({ is_active: !current })
      .eq('contract_id', contract_id)
    
    revalidatePath('/dashboard/pricing/contracts')
    redirect('/dashboard/pricing/contracts')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Hợp đồng giá</h1>
          <p className="text-sm text-muted-foreground mt-2">Giá riêng theo khách hàng × sản phẩm (net price).</p>
        </div>
        <Link href="/dashboard/pricing/contracts/new" className="px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90">
          + Tạo hợp đồng
        </Link>
      </div>

      {error ? (
        <div className="mt-6 border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-4">
          <div className="font-medium">Không thể tải hợp đồng giá</div>
          <div className="text-sm mt-1">{error.message}</div>
        </div>
      ) : (filteredContracts && filteredContracts.length > 0 ? (
        <div className="mt-6">
          <form method="get" className="mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
              <input name="q" defaultValue={q} className="border rounded px-2 py-1 w-full sm:w-64" placeholder="Tìm khách/sản phẩm..." />
              <input type="hidden" name="size" value={size} />
              <button type="submit" className="px-3 py-1 bg-primary text-primary-foreground rounded hover:opacity-90">
                Tìm kiếm
              </button>
            </div>
            <div className="text-muted-foreground">Trang {page} / {totalPages}</div>
          </form>

          {/* Mobile Card View */}
          <div className="block sm:hidden space-y-4">
            {filteredContracts.map((c: any) => {
              const customer = customers.get(c.customer_id)
              const product = products.get(c.product_id)
              const contractPrice = Number(c.net_price)
              const costPrice = Number(product?.cost_price || 0)
              const profitMargin = costPrice > 0 && contractPrice > 0 ? 
                (((contractPrice - costPrice) / contractPrice) * 100).toFixed(1) : null
              const profitAmount = costPrice > 0 && contractPrice > 0 ? 
                (contractPrice - costPrice) : null
              
              return (
                <div key={c.contract_id} className="border rounded-lg p-4 bg-card">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Link href={`/dashboard/pricing/contracts/${c.contract_id}`} className="font-medium hover:underline text-primary">
                        {customer?.customer_name || `ID: ${c.customer_id}`}
                      </Link>
                      {customer?.customer_code && (
                        <div className="text-xs text-muted-foreground">{customer.customer_code}</div>
                      )}
                    </div>
                    <div className="text-right">
                      {c.is_active ? (
                        <Badge className="bg-green-100 text-green-800">Đang bật</Badge>
                      ) : (
                        <Badge variant="outline">Tắt</Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">{product?.product_name || 'N/A'}</span>
                      <span className="text-muted-foreground ml-2">({product?.product_code || `ID: ${c.product_id}`})</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
                      <div>
                        <div className="text-xs text-muted-foreground">GIÁ HỢP ĐỒNG</div>
                        <div className="font-semibold text-primary">{contractPrice.toLocaleString('vi-VN')}₫</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">LỢI NHUẬN</div>
                        {profitMargin ? (
                          <div>
                            <div className="font-semibold text-green-600">{profitMargin}%</div>
                            <div className="text-xs text-muted-foreground">+{profitAmount?.toLocaleString('vi-VN')}₫</div>
                          </div>
                        ) : (
                          <div className="text-muted-foreground">N/A</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      {formatRange(c.effective_from, c.effective_to)}
                    </div>
                    
                    {c.notes && (
                      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                        {c.notes}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <Link href={`/dashboard/pricing/contracts/${c.contract_id}/edit`} className="text-sm text-primary hover:underline">
                      Chỉnh sửa
                    </Link>
                    <form action={toggleActive} className="inline">
                      <input type="hidden" name="contract_id" value={c.contract_id} />
                      <input type="hidden" name="current" value={c.is_active} />
                      <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
                        {c.is_active ? 'Tắt' : 'Bật'}
                      </button>
                    </form>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm border rounded-md">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 border-b">Khách hàng</th>
                  <th className="p-3 border-b">Sản phẩm</th>
                  <th className="p-3 border-b">Giá HĐ</th>
                  <th className="p-3 border-b">Gốc</th>
                  <th className="p-3 border-b">LN</th>
                  <th className="p-3 border-b">Hiệu lực</th>
                  <th className="p-3 border-b">TT</th>
                  <th className="p-3 border-b">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((c: any) => {
                  const customer = customers.get(c.customer_id)
                  const product = products.get(c.product_id)
                  const contractPrice = Number(c.net_price)
                  const costPrice = Number(product?.cost_price || 0)
                  const profitMargin = costPrice > 0 && contractPrice > 0 ? 
                    (((contractPrice - costPrice) / contractPrice) * 100).toFixed(1) : null
                  const profitAmount = costPrice > 0 && contractPrice > 0 ? 
                    (contractPrice - costPrice) : null
                  
                  return (
                  <tr key={c.contract_id} className="hover:bg-accent/30">
                    <td className="p-3 border-b">
                      <Link href={`/dashboard/pricing/contracts/${c.contract_id}`} className="hover:underline">
                        {customer?.customer_name || `ID: ${c.customer_id}`}
                      </Link>
                    </td>
                    <td className="p-3 border-b">
                      <div className="font-medium">{product?.product_name || 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">{product?.product_code || `ID: ${c.product_id}`}</div>
                    </td>
                    <td className="p-3 border-b font-medium text-primary">{contractPrice.toLocaleString('vi-VN')}₫</td>
                    <td className="p-3 border-b text-orange-600">
                      {costPrice > 0 ? `${costPrice.toLocaleString('vi-VN')}₫` : 'N/A'}
                    </td>
                    <td className="p-3 border-b">
                      {profitMargin ? (
                        <div>
                          <div className="font-medium text-green-600">{profitMargin}%</div>
                          <div className="text-xs text-green-500">
                            +{profitAmount?.toLocaleString('vi-VN')}₫
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">N/A</div>
                      )}
                    </td>
                    <td className="p-3 border-b">{formatRange(c.effective_from, c.effective_to)}</td>
                    <td className="p-3 border-b">
                      {c.is_active ? (
                        <Badge className="bg-green-100 text-green-800">Bật</Badge>
                      ) : (
                        <Badge variant="outline">Tắt</Badge>
                      )}
                    </td>
                    <td className="p-3 border-b">
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/pricing/contracts/${c.contract_id}/edit`} className="text-xs text-primary hover:underline">
                          Sửa
                        </Link>
                        <form action={toggleActive} className="inline">
                          <input type="hidden" name="contract_id" value={c.contract_id} />
                          <input type="hidden" name="current" value={c.is_active} />
                          <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
                            {c.is_active ? 'Tắt' : 'Bật'}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
            <div className="text-center sm:text-left text-muted-foreground">
              Tổng: {total} hợp đồng • Trang {page}/{totalPages} • {size}/trang
            </div>
            <div className="flex items-center gap-2">
              <a 
                className={`px-3 py-1.5 border rounded-md ${page <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-accent'}`} 
                href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.max(1, page - 1)}`}
              >
                ← Trước
              </a>
              <span className="px-2 text-muted-foreground">{page}/{totalPages}</span>
              <a 
                className={`px-3 py-1.5 border rounded-md ${page >= totalPages ? 'pointer-events-none opacity-50' : 'hover:bg-accent'}`} 
                href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.min(totalPages, page + 1)}`}
              >
                Sau →
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 border rounded-md p-6 text-sm">
          <div className="font-medium">Chưa có hợp đồng giá nào.</div>
          <div className="mt-2 text-muted-foreground">
            Hợp đồng giá cho phép thiết lập giá riêng cho từng khách hàng × sản phẩm, ưu tiên cao hơn bảng giá chung.
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
