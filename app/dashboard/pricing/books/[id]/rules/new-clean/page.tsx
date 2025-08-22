import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { SmartPriceRuleForm } from "@/components/pricing/smart-price-rule-form"
import { ProductItem, CategoryItem } from "@/components/pricing/pickers"

export default async function NewPriceRulePage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const errorMsg = typeof sp.error === 'string' ? sp.error : ''
  const { id } = await params
  const priceBookId = Number(id)
  const supabase = await createClient()

  // Fetch context and lists for pickers
  const [{ data: book }, { data: prodList }, { data: catList }] = await Promise.all([
    supabase.from('price_books').select('price_book_id, name').eq('price_book_id', priceBookId).maybeSingle(),
    supabase.from('products').select('product_code, product_name, sale_price, base_price').order('product_name').limit(1000),
    supabase.from('product_categories').select('category_id, category_name').order('category_name').limit(1000)
  ])

  if (!book) {
    redirect('/dashboard/pricing/books')
  }

  async function createRule(formData: FormData): Promise<void> {
    'use server'
    const supabase = await createClient()

    const scope = String(formData.get('scope') || '') || null
    const action_type = String(formData.get('action_type') || '') || null
    const action_value = toNumber(formData.get('action_value'))
    const sku_code = scope === 'sku' ? (String(formData.get('sku_code') || '') || null) : null
    const category_id = scope === 'category' ? toNumber(formData.get('category_id')) : null
    const tagRaw = scope === 'tag' ? (String(formData.get('tag') || '') || null) : null
    const min_qty = toNumber(formData.get('min_qty'))
    const max_qty = toNumber(formData.get('max_qty'))
    const priority = toNumber(formData.get('priority')) ?? 100
    const is_active = Boolean(formData.get('is_active'))
    const notes = String(formData.get('notes') || '') || null
    const effective_from = toDate(formData.get('effective_from'))
    const effective_to = toDate(formData.get('effective_to'))

    // Validation
    const problems: string[] = []
    if (!scope) problems.push('Phạm vi là bắt buộc.')
    if (!action_type) problems.push('Loại quy tắc là bắt buộc.')
    if (action_value == null || !Number.isFinite(action_value)) problems.push('Giá trị không hợp lệ.')
    if (min_qty != null && min_qty < 0) problems.push('SL tối thiểu không được âm.')
    if (max_qty != null && max_qty < 0) problems.push('SL tối đa không được âm.')
    if (min_qty != null && max_qty != null && min_qty > max_qty) problems.push('SL tối thiểu không được lớn hơn SL tối đa.')

    if (scope === 'sku') {
      if (!sku_code) problems.push('SKU bắt buộc khi chọn sản phẩm cụ thể.')
      if (sku_code) {
        const { data: existing } = await supabase
          .from('products')
          .select('product_code')
          .eq('product_code', sku_code)
          .maybeSingle()
        if (!existing) problems.push(`SKU "${sku_code}" không tồn tại.`)
      }
    }

    if (scope === 'category') {
      if (!category_id) problems.push('Ngành hàng bắt buộc khi chọn ngành hàng.')
      if (category_id) {
        const { data: existing } = await supabase
          .from('product_categories')
          .select('category_id')
          .eq('category_id', category_id)
          .maybeSingle()
        if (!existing) problems.push(`Ngành hàng ID ${category_id} không tồn tại.`)
      }
    }

    if (scope === 'tag') {
      if (!tagRaw?.trim()) problems.push('Tag bắt buộc khi chọn tag.')
    }

    if (problems.length > 0) {
      const errorMsg = problems.join(' ')
      redirect(`/dashboard/pricing/books/${priceBookId}/rules/new?error=${encodeURIComponent(errorMsg)}`)
    }

    // Insert
    const { error } = await supabase.from('price_rules').insert({
      price_book_id: priceBookId,
      scope,
      action_type,
      action_value,
      sku_code,
      category_id,
      tag: tagRaw?.trim() || null,
      min_qty,
      max_qty,
      priority,
      is_active,
      notes,
      effective_from,
      effective_to,
    })

    if (error) {
      const errorMsg = `Không thể tạo quy tắc: ${error.message}`
      redirect(`/dashboard/pricing/books/${priceBookId}/rules/new?error=${encodeURIComponent(errorMsg)}`)
    }

    revalidatePath(`/dashboard/pricing/books/${priceBookId}`)
    redirect(`/dashboard/pricing/books/${priceBookId}`)
  }

  // Transform data for components
  const productList: ProductItem[] = prodList || []
  const categoryList: CategoryItem[] = catList || []

  return (
    <SmartPriceRuleForm
      priceBookId={priceBookId}
      priceBookName={book.name || `Sổ giá #${priceBookId}`}
      productList={productList}
      categoryList={categoryList}
      onSubmit={createRule}
      errorMessage={errorMsg}
    />
  )
}

function toNumber(v: FormDataEntryValue | null): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toDate(v: FormDataEntryValue | null): string | null {
  if (!v) return null
  const s = String(v)
  return s ? new Date(s).toISOString().replace('Z', '') : null
}
