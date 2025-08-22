import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import PromotionCreateForm from "@/components/pricing/promotion-create-form"

export default async function NewPromotionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const errorMsg = typeof sp.error === 'string' ? sp.error : ''
  const supabase = await createClient()

  // Fetch active price books and lists for pickers
  const [{ data: books }, { data: products }, { data: categories }] = await Promise.all([
    supabase.from('price_books').select('price_book_id, name, is_active').eq('is_active', true).order('name'),
    supabase.from('products').select('product_code, product_name, sale_price, base_price, cost_price').order('product_name').limit(1000),
    supabase.from('product_categories').select('category_id, category_name').order('category_name').limit(1000)
  ])

  async function createPromotion(formData: FormData): Promise<void> {
    'use server'
    const price_book_id = Number(formData.get('price_book_id'))
    const scope = String(formData.get('scope') || '')
    const sku_code = scope === 'sku' ? String(formData.get('sku_code') || '').trim() || null : null
    const category_id = scope === 'category' ? Number(formData.get('category_id')) || null : null
    const tag = scope === 'tag' ? String(formData.get('tag') || '').trim() || null : null
    const action_type = String(formData.get('action_type') || '')
    const action_value = Number(formData.get('action_value')) || null
    const min_qty = Number(formData.get('min_qty')) || null
    const max_qty = Number(formData.get('max_qty')) || null
    const priority = Number(formData.get('priority')) || 100
    const effective_from = String(formData.get('effective_from') || '') || null
    const effective_to = String(formData.get('effective_to') || '') || null
    const is_active = formData.get('is_active') === 'on'
    const notes = String(formData.get('notes') || '').trim() || null

    let problems: string[] = []
    if (!price_book_id || price_book_id <= 0) problems.push('Vui lòng chọn bảng giá.')
    if (!scope) problems.push('Vui lòng chọn phạm vi áp dụng.')
    if (scope === 'sku' && !sku_code) problems.push('Vui lòng nhập mã sản phẩm.')
    if (scope === 'category' && !category_id) problems.push('Vui lòng chọn danh mục.')
    if (scope === 'tag' && !tag) problems.push('Vui lòng nhập nhãn.')
    if (!action_type) problems.push('Vui lòng chọn loại khuyến mãi.')
    if (action_type !== 'promotion' && (!action_value || action_value <= 0)) problems.push('Vui lòng nhập giá trị khuyến mãi.')
    if (min_qty && max_qty && min_qty > max_qty) {
      problems.push('Số lượng tối thiểu không được lớn hơn số lượng tối đa.')
    }
    if (effective_from && effective_to && new Date(effective_from) > new Date(effective_to)) {
      problems.push('Hiệu lực từ không được sau Hiệu lực đến.')
    }

    if (problems.length > 0) {
      redirect(`/dashboard/pricing/promotions/new?error=${encodeURIComponent(problems.join(' '))}`)
    }

    const supabase = await createClient()
    const { error } = await supabase.from('price_rules').insert({
      price_book_id,
      scope, sku_code, category_id, tag,
      action_type, action_value,
      min_qty, max_qty,
      priority,
      effective_from, effective_to,
      is_active,
      notes,
    })

    if (error) {
      redirect(`/dashboard/pricing/promotions/new?error=${encodeURIComponent('Không thể tạo khuyến mãi: ' + error.message)}`)
    }

    revalidatePath('/dashboard/pricing/promotions')
    redirect('/dashboard/pricing/promotions')
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Tạo khuyến mãi mới</h1>
        <p className="text-sm text-muted-foreground mt-1">Tạo chương trình khuyến mãi, combo/gói, voucher và ưu đãi đặc biệt</p>
      </div>

      {errorMsg && (
        <div className="mb-6 border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-3 text-sm">
          {errorMsg}
        </div>
      )}

      <PromotionCreateForm
        books={books || []}
        products={products || []}
        categories={categories || []}
        onSubmit={createPromotion}
      />
    </div>
  )
}
