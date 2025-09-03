import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export default async function TestProductsPage() {
  const supabase = await createClient()
  
  // Get all products with SP000385
  const { data: sp385, error: sp385Error } = await supabase
    .from('products')
    .select('product_code, product_name, sale_price, is_active')
    .eq('product_code', 'SP000385')
    .maybeSingle()

  // Get first 20 products ordered by code
  const { data: firstProducts, error: firstError } = await supabase
    .from('products')
    .select('product_code, product_name, is_active')
    .eq('is_active', true)
    .order('product_code')
    .limit(20)

  // Get total count
  const { count: totalCount, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Product Test Debug</h1>
      
      <div className="border rounded p-4">
        <h2 className="font-semibold">SP000385 Search Result:</h2>
        {sp385 ? (
          <div className="mt-2 p-2 bg-green-100">
            <div>✅ Found: {sp385.product_code}</div>
            <div>Name: {sp385.product_name}</div>
            <div>Price: {sp385.sale_price}</div>
            <div>Active: {sp385.is_active ? 'Yes' : 'No'}</div>
          </div>
        ) : (
          <div className="mt-2 p-2 bg-red-100">
            ❌ SP000385 not found
            {sp385Error && <div>Error: {sp385Error.message}</div>}
          </div>
        )}
      </div>

      <div className="border rounded p-4">
        <h2 className="font-semibold">Total Active Products: {totalCount || 'Loading...'}</h2>
        {countError && <div className="text-red-500">Count Error: {countError.message}</div>}
      </div>

      <div className="border rounded p-4">
        <h2 className="font-semibold">First 20 Products (by code):</h2>
        {firstProducts ? (
          <div className="mt-2 space-y-1">
            {firstProducts.map((p, i) => (
              <div key={i} className="text-sm">
                {p.product_code} - {p.product_name} ({p.is_active ? 'Active' : 'Inactive'})
              </div>
            ))}
          </div>
        ) : (
          <div>Loading products...</div>
        )}
        {firstError && <div className="text-red-500">Products Error: {firstError.message}</div>}
      </div>
    </div>
  )
}
