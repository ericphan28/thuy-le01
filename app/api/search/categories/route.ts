import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const supabase = await createClient()

  const base = supabase
    .from('product_categories')
    .select('category_id, category_name')
    .order('category_name', { ascending: true })
    .limit(20)

  const query = q
    ? supabase
        .from('product_categories')
        .select('category_id, category_name')
        .ilike('category_name', `%${q}%`)
        .order('category_name', { ascending: true })
        .limit(20)
    : base

  const { data, error } = await query
  return NextResponse.json({ items: data ?? [], error: error?.message || null })
}
