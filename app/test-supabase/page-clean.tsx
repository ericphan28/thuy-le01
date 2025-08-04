"use client"

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TestResult {
  [key: string]: unknown
}

export default function TestSupabasePage() {
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const testBasicConnection = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('product_id, product_code, product_name')
        .limit(5)

      if (error) {
        setError(JSON.stringify(error, null, 2))
      } else {
        setResults(data)
      }
    } catch (error) {
      console.error('Connection test error:', error)
      setError('Connection test failed')
    } finally {
      setLoading(false)
    }
  }

  const testRelationshipQuery = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          product_id,
          product_code,
          product_name,
          sale_price,
          current_stock,
          category_id,
          product_categories!fk_products_category_id (
            category_id,
            category_name
          )
        `)
        .eq('is_active', true)
        .eq('allow_sale', true)
        .gt('current_stock', 0)
        .limit(5)

      if (error) {
        setError(JSON.stringify(error, null, 2))
      } else {
        setResults(data)
      }
    } catch (error) {
      console.error('Relationship test error:', error)
      setError('Relationship query failed')
    } finally {
      setLoading(false)
    }
  }

  const testTableList = async () => {
    setLoading(true)
    setError(null)
    try {
      // Try to get list of tables
      const { data, error } = await supabase
        .rpc('get_table_list')

      if (error) {
        setError(JSON.stringify(error, null, 2))
      } else {
        setResults(data)
      }
    } catch (error) {
      console.error('Table list error:', error)
      // Fallback: direct query to information_schema
      try {
        const { data: tables, error: tablesError } = await supabase
          .from('information_schema.tables')
          .select('table_name')
          .eq('table_schema', 'public')

        if (tablesError) {
          setError(JSON.stringify(tablesError, null, 2))
        } else {
          setResults(tables)
        }
      } catch (fallbackError) {
        console.error('Fallback query error:', fallbackError)
        setError('Failed to get table list')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Supabase Connection Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button onClick={testBasicConnection} disabled={loading}>
          Test Basic Connection
        </Button>
        <Button onClick={testRelationshipQuery} disabled={loading}>
          Test Relationship Query
        </Button>
        <Button onClick={testTableList} disabled={loading}>
          Test Table List
        </Button>
      </div>

      {loading && (
        <Card className="border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span>Testing connection...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-red-600 whitespace-pre-wrap overflow-auto">
              {error}
            </pre>
          </CardContent>
        </Card>
      )}

      {results && typeof results === 'object' && (
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="text-green-700">Results</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-green-600 whitespace-pre-wrap overflow-auto">
              {JSON.stringify(results, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
