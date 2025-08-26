import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import VolumeTierExamples from "@/components/pricing/volume-tier-examples"
import VolumeTierClientWrapper from "@/components/pricing/volume-tier-client-wrapper"
import DeleteTierButton from "@/components/pricing/delete-tier-button"

export default async function EnhancedVolumeTiersPage({ 
  searchParams 
}: { 
  searchParams: Promise<Record<string, string | string[] | undefined>> 
}) {
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
      created_at
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  // Handle search - for now, only search by IDs since we can't join
  if (q) {
    const asNum = Number.parseInt(q)
    if (!Number.isNaN(asNum)) {
      query = query.or(`category_id.eq.${asNum},product_id.eq.${asNum}`)
    }
    // TODO: Product name/code search needs separate implementation
  }

  const from = (page - 1) * size
  const to = from + size - 1
  query = query.range(from, to)
  const { data: baseTiers, error, count } = await query

  // Manually enrich tiers with product and category data
  let enrichedTiers = null
  if (baseTiers && !error) {
    // Get unique product IDs and category IDs
    const productIds = [...new Set(baseTiers.filter(t => t.product_id).map(t => t.product_id))]
    const categoryIds = [...new Set(baseTiers.filter(t => t.category_id).map(t => t.category_id))]

    // Fetch products data
    const productsMap = new Map()
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('product_id, product_code, product_name, sale_price')
        .in('product_id', productIds)
      
      products?.forEach(p => productsMap.set(p.product_id, p))
    }

    // Fetch categories data  
    const categoriesMap = new Map()
    if (categoryIds.length > 0) {
      const { data: categories } = await supabase
        .from('product_categories')
        .select('category_id, category_name')
        .in('category_id', categoryIds)
      
      categories?.forEach(c => categoriesMap.set(c.category_id, c))
    }

    // Enrich tiers with related data
    enrichedTiers = baseTiers.map(tier => ({
      ...tier,
      products: tier.product_id ? productsMap.get(tier.product_id) : null,
      product_categories: tier.category_id ? categoriesMap.get(tier.category_id) : null
    }))
  }

  const tiers = enrichedTiers
  const total = count ?? (tiers?.length ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / size))

  async function toggleActive(formData: FormData) {
    'use server'
    const tier_id = Number(formData.get('tier_id'))
    const current = formData.get('current') === 'true'
    
    const supabase = await createClient()
    await supabase.from('volume_tiers')
      .update({ is_active: !current })
      .eq('tier_id', tier_id)
    
    revalidatePath('/dashboard/pricing/tiers/enhanced')
    redirect('/dashboard/pricing/tiers/enhanced')
  }

  async function deleteTier(formData: FormData) {
    'use server'
    const tier_id = Number(formData.get('tier_id'))
    
    const supabase = await createClient()
    await supabase.from('volume_tiers')
      .delete()
      .eq('tier_id', tier_id)
    
    revalidatePath('/dashboard/pricing/tiers/enhanced')
    redirect('/dashboard/pricing/tiers/enhanced')
  }

  function formatRange(from?: string | null, to?: string | null) {
    if (!from && !to) return 'Vô thời hạn'
    if (from && !to) return `Từ ${new Date(from).toLocaleDateString('vi-VN')}`
    if (!from && to) return `Đến ${new Date(to).toLocaleDateString('vi-VN')}`
    return `${new Date(from!).toLocaleDateString('vi-VN')} → ${new Date(to!).toLocaleDateString('vi-VN')}`
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">🎯 Bậc số lượng (Volume Tiers)</h1>
          <p className="text-muted-foreground mt-2">
            Thiết lập chiết khấu tự động theo số lượng mua. Khách hàng được giảm giá khi mua từ số lượng nhất định trở lên.
          </p>
        </div>
      </div>

      {/* Examples Section */}
      <VolumeTierExamples />

      {/* Create Form */}
      <VolumeTierClientWrapper />

      {/* Search and Pagination */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Danh sách bậc số lượng hiện tại</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input 
                name="q" 
                defaultValue={q} 
                className="border rounded px-3 py-2 w-64" 
                placeholder="Tìm sản phẩm, mã sản phẩm, ID danh mục..." 
              />
              <input type="hidden" name="size" value={size} />
              <button type="submit" className="px-3 py-2 bg-primary text-primary-foreground rounded">
                🔍 Tìm
              </button>
            </div>
            <div className="text-sm text-muted-foreground">
              Trang {page} / {totalPages} • {total} bậc số lượng
            </div>
          </form>

          {error ? (
            <div className="border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-4">
              <div className="font-medium">Không thể tải bậc số lượng</div>
              <div className="text-sm mt-1">{error.message}</div>
            </div>
          ) : (tiers && tiers.length > 0 ? (
            <div className="space-y-4">
              {tiers.map((tier: any) => (
                <Card key={tier.tier_id} className={`${!tier.is_active ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Phạm vi áp dụng */}
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">Phạm vi</div>
                        <Badge variant="outline" className="mb-2">
                          {tier.scope === 'sku' ? '🎯 Sản phẩm' : '📂 Danh mục'}
                        </Badge>
                        <div className="text-sm">
                          {tier.scope === 'sku' ? (
                            <div>
                              <div className="font-medium">{tier.products?.product_name || 'N/A'}</div>
                              <div className="text-muted-foreground">
                                {tier.products?.product_code || `ID: ${tier.product_id}`}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium">
                                {tier.product_categories?.category_name || `Danh mục #${tier.category_id}`}
                              </div>
                              <div className="text-muted-foreground">ID: {tier.category_id}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Điều kiện số lượng */}
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">Điều kiện</div>
                        <div className="text-lg font-bold text-blue-600">
                          Từ {Number(tier.min_qty).toLocaleString('vi-VN')} sản phẩm
                        </div>
                      </div>

                      {/* Chiết khấu */}
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">Chiết khấu</div>
                        {tier.discount_percent ? (
                          <Badge className="bg-green-100 text-green-800 border-green-200">
                            🏷️ Giảm {tier.discount_percent}%
                          </Badge>
                        ) : tier.discount_amount ? (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-200">
                            💰 Giảm {Number(tier.discount_amount).toLocaleString('vi-VN')}₫
                          </Badge>
                        ) : (
                          <Badge variant="outline">Không có chiết khấu</Badge>
                        )}
                      </div>

                      {/* Trạng thái và thao tác */}
                      <div className="flex flex-col gap-2">
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">Trạng thái</div>
                          {tier.is_active ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              ✅ Đang hoạt động
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              ⏸️ Tạm dừng
                            </Badge>
                          )}
                        </div>
                        
                        {/* Thao tác */}
                        <div className="flex gap-2">
                          <form action={toggleActive} className="inline">
                            <input type="hidden" name="tier_id" value={tier.tier_id} />
                            <input type="hidden" name="current" value={tier.is_active} />
                            <button 
                              type="submit" 
                              className="text-xs px-2 py-1 rounded border hover:bg-accent"
                            >
                              {tier.is_active ? '⏸️ Tắt' : '▶️ Bật'}
                            </button>
                          </form>
                          
                          <DeleteTierButton tierId={tier.tier_id} deleteTier={deleteTier} />
                        </div>
                      </div>
                    </div>

                    {/* Thời gian hiệu lực */}
                    <div className="mt-3 pt-3 border-t text-sm">
                      <span className="text-muted-foreground">Hiệu lực: </span>
                      <span>{formatRange(tier.effective_from, tier.effective_to)}</span>
                      {tier.notes && (
                        <span className="ml-4">
                          <span className="text-muted-foreground">Ghi chú: </span>
                          <span>{tier.notes}</span>
                        </span>
                      )}
                    </div>

                    {/* Ví dụ tính toán cho tier này */}
                    {tier.products?.sale_price && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-sm font-medium text-muted-foreground mb-2">💡 Ví dụ tính toán:</div>
                        <div className="bg-muted/30 rounded p-3 text-sm">
                          {(() => {
                            const basePrice = tier.products.sale_price
                            const minQty = tier.min_qty
                            let unitPrice = basePrice
                            
                            if (tier.discount_percent) {
                              unitPrice = basePrice * (1 - tier.discount_percent / 100)
                            } else if (tier.discount_amount) {
                              unitPrice = Math.max(0, basePrice - tier.discount_amount)
                            }
                            
                            const originalTotal = minQty * basePrice
                            const discountedTotal = minQty * unitPrice
                            const savings = originalTotal - discountedTotal
                            
                            return (
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <div>Mua {minQty} sản phẩm:</div>
                                  <div className="text-muted-foreground line-through">
                                    {originalTotal.toLocaleString('vi-VN')}₫ (giá gốc)
                                  </div>
                                  <div className="font-bold text-green-600">
                                    {discountedTotal.toLocaleString('vi-VN')}₫ (sau chiết khấu)
                                  </div>
                                </div>
                                <div>
                                  <div className="text-green-600 font-bold">
                                    🎉 Tiết kiệm: {savings.toLocaleString('vi-VN')}₫
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    Giá mỗi sản phẩm: {unitPrice.toLocaleString('vi-VN')}₫
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Pagination */}
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-muted-foreground">
                  Hiển thị {Math.min(size, tiers.length)} / {total} bậc số lượng
                </div>
                <div className="flex items-center gap-2">
                  <a 
                    className={`px-3 py-2 border rounded ${page <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-accent'}`} 
                    href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.max(1, page - 1)}`}
                  >
                    ‹ Trước
                  </a>
                  <span className="px-3 py-2 text-sm">
                    {page} / {totalPages}
                  </span>
                  <a 
                    className={`px-3 py-2 border rounded ${page >= totalPages ? 'pointer-events-none opacity-50' : 'hover:bg-accent'}`} 
                    href={`?q=${encodeURIComponent(q)}&size=${size}&page=${Math.min(totalPages, page + 1)}`}
                  >
                    Sau ›
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <div className="text-xl font-medium mb-2">Chưa có bậc số lượng nào</div>
              <div className="text-muted-foreground mb-6">
                Bậc số lượng giúp khách hàng được chiết khấu khi mua với số lượng lớn.
                <br />
                Hãy tạo bậc số lượng đầu tiên để tăng doanh số bán hàng!
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
