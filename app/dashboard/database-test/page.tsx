"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DatabaseTestPage() {
  const [status, setStatus] = useState('Testing...')
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const testDatabase = async () => {
      try {
        const supabase = createClient()
        
        // Test basic connection
        setStatus('Testing database connection...')
        
        // Test products table
        console.log('Testing products table...')
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('product_id, product_code, product_name, is_active')
          .eq('is_active', true)
          .limit(5)

        if (productsError) {
          console.error('Products error:', productsError)
          setError(`Products error: ${productsError.message}`)
          return
        }

        setProducts(productsData || [])
        console.log('Products test successful:', productsData?.length)

        // Test categories table
        console.log('Testing categories table...')
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('product_categories')
          .select('category_id, category_name, is_active')
          .eq('is_active', true)

        if (categoriesError) {
          console.error('Categories error:', categoriesError)
          setError(`Categories error: ${categoriesError.message}`)
          return
        }

        setCategories(categoriesData || [])
        console.log('Categories test successful:', categoriesData?.length)

        setStatus('✅ Database connection successful!')

      } catch (err) {
        console.error('Test error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('❌ Database connection failed')
      }
    }

    testDatabase()
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Database Connection Test</h1>
      
      <div className="space-y-6">
        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold mb-2">Connection Status</h2>
          <p className="text-gray-700">{status}</p>
          {error && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold mb-2">Products Table Test</h2>
          <p className="text-gray-600 mb-2">Found {products.length} active products</p>
          <div className="space-y-1">
            {products.slice(0, 3).map((product, index) => (
              <div key={index} className="text-sm text-gray-700">
                • {product.product_code}: {product.product_name}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold mb-2">Categories Table Test</h2>
          <p className="text-gray-600 mb-2">Found {categories.length} active categories</p>
          <div className="space-y-1">
            {categories.map((category, index) => (
              <div key={index} className="text-sm text-gray-700">
                • {category.category_name}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold mb-2">Next Steps</h2>
          <div className="text-sm text-gray-700 space-y-1">
            <p>✅ Test basic table access</p>
            <p>✅ Verify data structure</p>
            <p>✅ Check relationship between products and categories</p>
            <p>🔄 Test ProductService integration</p>
          </div>
        </div>
      </div>
    </div>
  )
}
