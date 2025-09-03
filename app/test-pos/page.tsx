// Test POS page without authentication
'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface Product {
  product_id: number
  product_code: string
  product_name: string
  sale_price: number
  current_stock: number
  requires_prescription: boolean
  is_medicine: boolean
  category_id: number | null
  product_categories?: {
    category_id: number
    category_name: string
  } | null
}

export default function TestPOSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const supabase = createClient()

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      
      console.log('Starting product fetch...')
      
      // Simple query first
      let query = supabase
        .from('products')
        .select(`
          product_id,
          product_code,
          product_name,
          sale_price,
          current_stock,
          requires_prescription,
          is_medicine,
          category_id,
          product_categories (
            category_id,
            category_name
          )
        `)
        .eq('is_active', true)
        .limit(10)

      console.log('Query built, executing...')
      
      const { data, error } = await query

      console.log('Query result:', { data, error })

      if (error) {
        console.error('Supabase error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }
      
      // Transform data
      const transformedData = data?.map(product => ({
        ...product,
        product_categories: Array.isArray(product.product_categories) 
          ? product.product_categories[0] || null
          : product.product_categories
      })) || []
      
      console.log('Transformed data:', transformedData)
      setProducts(transformedData)
      toast.success(`Loaded ${transformedData.length} products`)
      
    } catch (error: any) {
      console.error('Error fetching products:', {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      })
      toast.error(`Error: ${error?.message || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">🧪 POS Test Page</h1>
        <p className="text-muted-foreground">Testing product fetch without authentication</p>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Products
                <Button onClick={fetchProducts} disabled={loading}>
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {products.map((product) => (
                  <div
                    key={product.product_id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{product.product_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {product.product_code} | Stock: {product.current_stock}
                      </div>
                      {product.product_categories && (
                        <Badge variant="secondary" className="mt-1">
                          {product.product_categories.category_name}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">
                        {product.sale_price.toLocaleString()}đ
                      </div>
                      {product.requires_prescription && (
                        <Badge variant="destructive">Prescription</Badge>
                      )}
                    </div>
                  </div>
                ))}
                
                {products.length === 0 && !loading && (
                  <div className="text-center py-8 text-muted-foreground">
                    No products found
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debug" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Debug Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div><strong>Environment:</strong></div>
                <div>SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL}</div>
                <div>Has ANON KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Yes' : 'No'}</div>
                <div>Has PUBLISHABLE KEY: {process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ? 'Yes' : 'No'}</div>
                
                <div className="mt-4"><strong>State:</strong></div>
                <div>Products count: {products.length}</div>
                <div>Loading: {loading ? 'Yes' : 'No'}</div>
                <div>Search term: {searchTerm || 'None'}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
