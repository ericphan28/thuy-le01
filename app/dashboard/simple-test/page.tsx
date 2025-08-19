"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SimpleProductTest() {
  const [status, setStatus] = useState('Loading...')
  const [products, setProducts] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const testSimpleQuery = async () => {
      try {
        const supabase = createClient()
        
        setStatus('Testing simple product query...')
        
        // Very basic query first
        const { data, error, count } = await supabase
          .from('products')
          .select('*', { count: 'exact' })
          .eq('is_active', true)
          .limit(5)

        if (error) {
          console.error('Simple query error:', error)
          setError(`Error: ${JSON.stringify(error)}`)
          setStatus('❌ Simple query failed')
          return
        }

        console.log('Simple query result:', data)
        setProducts(data || [])
        setStatus(`✅ Found ${count} total products, showing ${data?.length}`)

      } catch (err) {
        console.error('Catch error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('❌ Query failed with exception')
      }
    }

    testSimpleQuery()
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Simple Product Query Test</h1>
      
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold mb-2">Status</h2>
          <p>{status}</p>
          {error && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-700">
              <strong>Error Details:</strong>
              <pre className="text-xs mt-1 whitespace-pre-wrap">{error}</pre>
            </div>
          )}
        </div>

        {products.length > 0 && (
          <div className="bg-white p-4 rounded-lg border">
            <h2 className="text-lg font-semibold mb-2">Sample Products</h2>
            <div className="space-y-2">
              {products.map((product, index) => (
                <div key={index} className="text-sm border-b pb-2">
                  <div><strong>ID:</strong> {product.product_id}</div>
                  <div><strong>Code:</strong> {product.product_code}</div>
                  <div><strong>Name:</strong> {product.product_name}</div>
                  <div><strong>Category ID:</strong> {product.category_id}</div>
                  <div><strong>Stock:</strong> {product.current_stock}</div>
                  <div><strong>Price:</strong> {product.sale_price}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold mb-2">Next: Test with Category Join</h2>
          <button 
            onClick={async () => {
              try {
                setStatus('Testing join query...')
                const supabase = createClient()
                
                const { data, error } = await supabase
                  .from('products')
                  .select(`
                    *,
                    category:product_categories(*)
                  `)
                  .eq('is_active', true)
                  .limit(3)

                if (error) {
                  setError(`Join error: ${JSON.stringify(error)}`)
                  setStatus('❌ Join query failed')
                } else {
                  console.log('Join query result:', data)
                  setProducts(data || [])
                  setStatus(`✅ Join query successful, ${data?.length} products with categories`)
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown join error')
                setStatus('❌ Join query exception')
              }
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Test Category Join
          </button>
        </div>
      </div>
    </div>
  )
}
