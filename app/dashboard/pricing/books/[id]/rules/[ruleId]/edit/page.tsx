import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { SmartPriceRuleForm } from "@/components/pricing/smart-price-rule-form"
import { ProductItem, CategoryItem } from "@/components/pricing/pickers"

// Small helpers (duplicated with create page – could be extracted later)
function toNumber(v: FormDataEntryValue | null): number | null { if (v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null }
function toDate(v: FormDataEntryValue | null): string | null { if (!v) return null; const s = String(v); return s ? new Date(s).toISOString().replace('Z', '') : null }

export default async function EditPriceRulePage({ params, searchParams }: { params: Promise<{ id: string, ruleId: string }>, searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, ruleId } = await params
  const sp = await searchParams
  const errorMsg = typeof sp.error === 'string' ? sp.error : ''
  const priceBookId = Number(id)
  const rId = Number(ruleId)

  const supabase = await createClient()
  const [{ data: rule }, { data: book }, { data: prodList }, { data: catList }] = await Promise.all([
    supabase.from('price_rules').select('*').eq('rule_id', rId).maybeSingle(),
    supabase.from('price_books').select('price_book_id, name').eq('price_book_id', priceBookId).maybeSingle(),
    supabase.from('products').select('product_code, product_name, sale_price, base_price').order('product_name').limit(500),
    supabase.from('product_categories').select('category_id, category_name').order('category_name').limit(500)
  ])

  if (!rule || !book) {
    redirect(`/dashboard/pricing/books/${priceBookId}`)
  }

  async function updateRule(formData: FormData): Promise<void> {
    'use server'
    const supabase = await createClient()
    const scope = String(formData.get('scope') || '') || null
    const action_type = String(formData.get('action_type') || '') || null
    const action_value = toNumber(formData.get('action_value'))
    const sku_code = scope === 'sku' ? (String(formData.get('sku_code') || '') || null) : null
    const category_id = scope === 'category' ? toNumber(formData.get('category_id')) : null
    const tag = scope === 'tag' ? (String(formData.get('tag') || '') || null) : null
    const min_qty = toNumber(formData.get('min_qty'))
    const max_qty = toNumber(formData.get('max_qty'))
    const priority = toNumber(formData.get('priority')) ?? 100
    const is_active = Boolean(formData.get('is_active'))
    const notes = String(formData.get('notes') || '') || null
    const effective_from = toDate(formData.get('effective_from'))
    const effective_to = toDate(formData.get('effective_to'))

    const problems: string[] = []
    if (!scope) problems.push('Phạm vi là bắt buộc.')
    if (!action_type) problems.push('Ưu đãi là bắt buộc.')
    if (action_value == null || !Number.isFinite(action_value)) problems.push('Giá trị ưu đãi không hợp lệ.')
    if (min_qty != null && min_qty < 0) problems.push('SL tối thiểu không được âm.')
    if (max_qty != null && max_qty < 0) problems.push('SL tối đa không được âm.')
    if (min_qty != null && max_qty != null && min_qty > max_qty) problems.push('SL tối thiểu không được lớn hơn SL tối đa.')
    if (scope === 'sku') {
      if (!sku_code) problems.push('SKU bắt buộc khi Phạm vi = sku.')
      if (sku_code) {
        const { data: p } = await supabase.from('products').select('product_code').eq('product_code', sku_code).maybeSingle()
        if (!p) problems.push(`SKU không tồn tại: ${sku_code}`)
      }
    }
    if (scope === 'category') {
      if (category_id == null) problems.push('Category ID bắt buộc khi Phạm vi = category.')
      if (category_id != null) {
        const { data: c } = await supabase.from('product_categories').select('category_id').eq('category_id', category_id).maybeSingle()
        if (!c) problems.push(`Category không tồn tại: #${category_id}`)
      }
    }
    if (scope === 'tag' && !tag) problems.push('Tag bắt buộc khi Phạm vi = tag.')
    if (action_type === 'percent' && (action_value == null || action_value < 0 || action_value > 100)) problems.push('Giảm % phải trong khoảng 0–100.')
    if (action_type === 'amount' && action_value != null && action_value < 0) problems.push('Số tiền giảm không được âm.')
    if (action_type === 'net' && action_value != null && action_value < 0) problems.push('Giá cố định không được âm.')
    if (effective_from && effective_to && new Date(effective_from) > new Date(effective_to)) problems.push('Hiệu lực từ không được sau Hiệu lực đến.')

    if (problems.length) {
      redirect(`/dashboard/pricing/books/${priceBookId}/rules/${rId}/edit?error=${encodeURIComponent(problems.join(' '))}`)
    }

    const { error } = await supabase.from('price_rules').update({
      scope, sku_code, category_id, tag,
      action_type, action_value,
      min_qty, max_qty,
      priority,
      effective_from, effective_to,
      is_active,
      notes,
    }).eq('rule_id', rId)

    if (error) {
      redirect(`/dashboard/pricing/books/${priceBookId}/rules/${rId}/edit?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/dashboard/pricing/books/${priceBookId}`)
    redirect(`/dashboard/pricing/books/${priceBookId}`)
  }

  async function deleteRule(): Promise<void> {
    'use server'
    const supabase = await createClient()
    const { error } = await supabase.from('price_rules').delete().eq('rule_id', rId)
    if (error) {
      redirect(`/dashboard/pricing/books/${priceBookId}/rules/${rId}/edit?error=${encodeURIComponent(error.message)}`)
    }
    revalidatePath(`/dashboard/pricing/books/${priceBookId}`)
    redirect(`/dashboard/pricing/books/${priceBookId}`)
  }

  const productList: ProductItem[] = prodList || []
  const categoryList: CategoryItem[] = catList || []

  return (
    <SmartPriceRuleForm
      priceBookId={priceBookId}
      priceBookName={book.name || `Sổ giá #${priceBookId}`}
      productList={productList}
      categoryList={categoryList as CategoryItem[]}
      onSubmit={updateRule}
      errorMessage={errorMsg}
      mode="edit"
      initialValues={{
        scope: rule.scope as any,
        action_type: rule.action_type as any,
        action_value: rule.action_value as any,
        sku_code: rule.sku_code,
        category_id: rule.category_id,
        tag: rule.tag,
        min_qty: rule.min_qty,
        max_qty: rule.max_qty,
        priority: rule.priority,
        is_active: rule.is_active,
        notes: rule.notes,
        effective_from: rule.effective_from,
        effective_to: rule.effective_to,
      }}
      submitLabel="💾 Lưu thay đổi"
      onDelete={deleteRule}
    />
  )
}
