import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const supabase = await createClient()

  const base = supabase
    .from('products')
    .select('product_code, product_name, sale_price, base_price')
    .order('product_name', { ascending: true })
    .limit(20)

  const query = q
    ? supabase
        .from('products')
        .select('product_code, product_name, sale_price, base_price')
        .or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%`)
        .order('product_name', { ascending: true })
        .limit(20)
    : base

  const { data, error } = await query
  return NextResponse.json({ items: data ?? [], error: error?.message || null })
}
