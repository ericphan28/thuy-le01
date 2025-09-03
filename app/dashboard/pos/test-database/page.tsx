"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

export default function DatabaseTestPage() {
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const testDatabase = async () => {
    setLoading(true)
    setResult('Testing database...')

    try {
      const supabase = createClient()

      console.log('=== Testing Database Connection ===')
      
      // 1. Check price books
      const { data: priceBooks, error: pbError } = await supabase
        .from('price_books')
        .select('*')
        .limit(5)
      
      console.log('Price Books:', priceBooks, 'Error:', pbError)

      // 2. Check price rules
      const { data: priceRules, error: prError } = await supabase
        .from('price_rules')
        .select('*')
        .limit(10)
      
      console.log('Price Rules:', priceRules, 'Error:', prError)

      // 3. Check products
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('product_id, product_code, product_name, sale_price, category_id')
        .limit(10)
      
      console.log('Products:', products, 'Error:', prodError)

      // 4. Check for SP000049 specifically
      const { data: sp049, error: sp049Error } = await supabase
        .from('products')
        .select('*')
        .eq('product_code', 'SP000049')
        .single()
      
      console.log('SP000049:', sp049, 'Error:', sp049Error)

      // 5. Test pricing API directly
      const pricingResponse = await fetch('/api/pricing/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: 'SP000049',
          qty: 5
        })
      })

      const pricingResult = await pricingResponse.json()
      console.log('Pricing API Result:', pricingResult)

      // Compile results
      const results = {
        priceBooks: { count: priceBooks?.length || 0, data: priceBooks, error: pbError },
        priceRules: { count: priceRules?.length || 0, data: priceRules, error: prError },
        products: { count: products?.length || 0, data: products?.slice(0, 3), error: prodError },
        sp049: { data: sp049, error: sp049Error },
        pricingAPI: { 
          status: pricingResponse.status, 
          ok: pricingResponse.ok,
          result: pricingResult 
        }
      }

      setResult(JSON.stringify(results, null, 2))

    } catch (error) {
      console.error('Database test error:', error)
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>🔍 Database & API Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={testDatabase} 
            disabled={loading}
          >
            {loading ? 'Testing...' : 'Test Database & Pricing API'}
          </Button>

          {result && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">Results:</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm max-h-96">
                {result}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
