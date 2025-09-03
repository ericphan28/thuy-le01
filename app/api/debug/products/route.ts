import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const productCode = url.searchParams.get('code') || 'SP000385'
  
  try {
    const supabase = await createClient()
    
    // Check if specific product exists
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('product_code, product_name, sale_price, is_active')
      .eq('product_code', productCode)
      .maybeSingle()
    
    // Also get total count of products
    const { count: totalCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
    
    // Get products ordered by code (first 10)
    const { data: sampleProducts } = await supabase
      .from('products')
      .select('product_code, product_name')
      .eq('is_active', true)
      .order('product_code')
      .limit(10)
    
    return NextResponse.json({
      searchedProduct: product,
      productExists: !!product,
      totalActiveProducts: totalCount,
      sampleProducts,
      productError
    })
  } catch (error) {
    console.error('Product check error:', error)
    return NextResponse.json({ error: 'Product check failed' }, { status: 500 })
  }
}
