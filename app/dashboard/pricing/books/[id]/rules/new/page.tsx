import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { SmartPriceRuleForm } from "@/components/pricing/smart-price-rule-form"
import { ProductItem, CategoryItem } from "@/components/pricing/pickers"

export default async function NewPriceRulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const { id } = await params
  const priceBookId = Number(id)
  if (!Number.isFinite(priceBookId)) redirect('/dashboard/pricing/books')

  const supabase = await createClient()
  const sp = await searchParams
  const errorMsg = typeof sp.error === 'string' ? sp.error : ''

  const [{ data: book }, { data: prodList }, { data: catList }] = await Promise.all([
    supabase.from('price_books').select('price_book_id, name').eq('price_book_id', priceBookId).maybeSingle(),
    supabase.from('products').select('product_code, product_name, sale_price, base_price').order('product_name').limit(500),
    supabase.from('product_categories').select('category_id, category_name').order('category_name').limit(500)
  ])

  if (!book) redirect('/dashboard/pricing/books')

  async function createRule(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const scope = (formData.get('scope') as string) || null
    const action_type = (formData.get('action_type') as string) || null
    const action_value = toNumber(formData.get('action_value'))
    const sku_code = scope === 'sku' ? ((formData.get('sku_code') as string) || null) : null
    const category_id = scope === 'category' ? toNumber(formData.get('category_id')) : null
    const tag = scope === 'tag' ? ((formData.get('tag') as string)?.trim() || null) : null
    const min_qty = toNumber(formData.get('min_qty'))
    const max_qty = toNumber(formData.get('max_qty'))
    const priority = toNumber(formData.get('priority')) ?? 100
    const is_active = !!formData.get('is_active')
    const notes = ((formData.get('notes') as string) || '').trim() || null
    const effective_from = toDate(formData.get('effective_from'))
    const effective_to = toDate(formData.get('effective_to'))

    const problems: string[] = []
    if (!scope) problems.push('Thiếu phạm vi.')
    if (!action_type) problems.push('Thiếu loại quy tắc.')
    if (action_value == null || !Number.isFinite(action_value)) problems.push('Giá trị không hợp lệ.')
    if (scope === 'sku' && !sku_code) problems.push('Thiếu SKU.')
    if (scope === 'category' && category_id == null) problems.push('Thiếu ngành hàng.')
    if (scope === 'tag' && !tag) problems.push('Thiếu tag.')
    if (min_qty != null && min_qty < 0) problems.push('SL tối thiểu >= 0.')
    if (max_qty != null && max_qty < 0) problems.push('SL tối đa >= 0.')
    if (min_qty != null && max_qty != null && min_qty > max_qty) problems.push('SL tối thiểu <= SL tối đa.')
    if (effective_from && effective_to && effective_from > effective_to) problems.push('Thời gian không hợp lệ.')
  if (action_type === 'percent' && action_value != null && (action_value < 0 || action_value > 100)) problems.push('% phải trong 0–100.')
  if (action_type === 'amount' && action_value != null && action_value < 0) problems.push('Số tiền giảm >= 0.')
  if (action_type === 'net' && action_value != null && action_value < 0) problems.push('Giá net >= 0.')

    if (problems.length) {
      redirect(`/dashboard/pricing/books/${priceBookId}/rules/new?error=${encodeURIComponent(problems.join(' '))}`)
    }

    const { error } = await supabase.from('price_rules').insert({
      price_book_id: priceBookId,
      scope,
      action_type,
      action_value,
      sku_code,
      category_id,
      tag,
      min_qty,
      max_qty,
      priority,
      is_active,
      notes,
      effective_from,
      effective_to,
    })
    if (error) {
      redirect(`/dashboard/pricing/books/${priceBookId}/rules/new?error=${encodeURIComponent(error.message)}`)
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
  try {
    return s ? new Date(s).toISOString().replace('Z', '') : null
  } catch {
    return null
  }
}
