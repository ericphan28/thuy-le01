"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'

interface Product {
  product_code: string
  product_name: string
  sale_price: number
  category_id: number
}

interface PriceRule {
  rule_id: number
  scope: string
  sku_code?: string
  category_id?: number
  action_type: string
  action_value: number
  priority: number
  is_active: boolean
}

interface TestResult {
  product: Product
  quantity: number
  pricingResult: any
  hasRule: boolean
  ruleInfo?: PriceRule
}

export default function PricingTestPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [priceRules, setPriceRules] = useState<PriceRule[]>([])
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(true)
  
  const supabase = createClient()

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsRes, rulesRes] = await Promise.all([
          supabase
            .from('products')
            .select('product_code, product_name, sale_price, category_id')
            .eq('is_active', true)
            .order('product_name')
            .limit(20),
          supabase
            .from('price_rules')
            .select('rule_id, scope, sku_code, category_id, action_type, action_value, priority, is_active')
            .eq('is_active', true)
            .limit(50)
        ])

        if (productsRes.data) setProducts(productsRes.data)
        if (rulesRes.data) setPriceRules(rulesRes.data)
        
        console.log('Loaded products:', productsRes.data?.length)
        console.log('Loaded price rules:', rulesRes.data?.length)
        console.log('Sample rules:', rulesRes.data?.slice(0, 3))
      } catch (err) {
        console.error('Data loading error:', err)
      } finally {
        setIsDataLoading(false)
      }
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Test pricing for all products
  const testAllProducts = async () => {
    setIsLoading(true)
    setTestResults([])
    
    try {
      const results: TestResult[] = []
      
      // Test first 10 products with different quantities
      for (const product of products.slice(0, 10)) {
        const quantity = Math.floor(Math.random() * 10) + 1 // Random quantity 1-10
        
        try {
          const response = await fetch('/api/pricing/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: product.product_code,
              qty: quantity
            })
          })

          let pricingResult = null
          if (response.ok) {
            pricingResult = await response.json()
          } else {
            const errorText = await response.text()
            pricingResult = { error: errorText }
          }

          // Check if product has applicable rules
          const applicableRules = priceRules.filter(rule => {
            if (rule.scope === 'sku') return rule.sku_code === product.product_code
            if (rule.scope === 'category') return rule.category_id === product.category_id
            if (rule.scope === 'all') return true
            return false
          })

          results.push({
            product,
            quantity,
            pricingResult,
            hasRule: applicableRules.length > 0,
            ruleInfo: applicableRules[0] // First applicable rule
          })
        } catch (error) {
          console.error(`Error testing ${product.product_code}:`, error)
          results.push({
            product,
            quantity,
            pricingResult: { error: String(error) },
            hasRule: false
          })
        }
      }
      
      setTestResults(results)
    } catch (error) {
      console.error('Test all products error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatVND = (amount: number) => {
    return amount.toLocaleString('vi-VN') + ' ₫'
  }

  if (isDataLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span>Đang tải dữ liệu để test pricing...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🧪 Pricing System Test</h1>
      <p className="text-muted-foreground mb-6">
        Test hệ thống tính giá với dữ liệu thật từ database
      </p>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{products.length}</div>
            <div className="text-sm text-muted-foreground">Sản phẩm có sẵn</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{priceRules.length}</div>
            <div className="text-sm text-muted-foreground">Quy tắc giá active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">{testResults.length}</div>
            <div className="text-sm text-muted-foreground">Kết quả test</div>
          </CardContent>
        </Card>
      </div>

      {/* Test Button */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <Button 
            onClick={testAllProducts} 
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? 'Đang test...' : 'Test Pricing cho 10 sản phẩm đầu'}
          </Button>
        </CardContent>
      </Card>

      {/* Sample Price Rules */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>📋 Price Rules hiện có</CardTitle>
        </CardHeader>
        <CardContent>
          {priceRules.length === 0 ? (
            <Alert>
              <AlertDescription>
                Không có price rules nào trong database. Cần tạo rules để test pricing.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {priceRules.slice(0, 5).map((rule) => (
                <div key={rule.rule_id} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge variant="outline">Rule #{rule.rule_id}</Badge>
                      <Badge variant="secondary" className="ml-2">{rule.scope}</Badge>
                    </div>
                    <div className="text-sm">
                      {rule.action_type} - {rule.action_value}
                      {rule.action_type === 'percent' && '%'}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Target: {rule.sku_code || rule.category_id || 'All'} | Priority: {rule.priority}
                  </div>
                </div>
              ))}
              {priceRules.length > 5 && (
                <div className="text-sm text-muted-foreground text-center">
                  ...và {priceRules.length - 5} rules khác
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🎯 Kết quả Test Pricing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {testResults.map((result, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-medium">{result.product.product_name}</h4>
                      <div className="text-sm text-muted-foreground">
                        {result.product.product_code} | Quantity: {result.quantity}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {result.hasRule && (
                        <Badge variant="default">Có Rule</Badge>
                      )}
                      {result.pricingResult.appliedRule && (
                        <Badge variant="secondary">Applied</Badge>
                      )}
                    </div>
                  </div>

                  {result.pricingResult.error ? (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Lỗi: {result.pricingResult.error}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Pricing Result */}
                      <div className="space-y-2">
                        <h5 className="font-medium text-sm">Kết quả tính giá:</h5>
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span>Giá niêm yết:</span>
                            <span>{formatVND(result.pricingResult.listPrice || result.product.sale_price)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Giá cuối:</span>
                            <span className="font-medium">
                              {formatVND(result.pricingResult.finalPrice || result.product.sale_price)}
                            </span>
                          </div>
                          {result.pricingResult.totalSavings > 0 && (
                            <div className="flex justify-between text-green-600">
                              <span>Tiết kiệm:</span>
                              <span>{formatVND(result.pricingResult.totalSavings)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-medium border-t pt-1">
                            <span>Thành tiền:</span>
                            <span>{formatVND(result.pricingResult.totalAmount || result.product.sale_price * result.quantity)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Rule Info */}
                      <div className="space-y-2">
                        <h5 className="font-medium text-sm">Quy tắc áp dụng:</h5>
                        {result.pricingResult.appliedRule ? (
                          <div className="text-sm space-y-1">
                            <div>Rule ID: {result.pricingResult.appliedRule.id}</div>
                            <div>Lý do: {result.pricingResult.appliedRule.reason}</div>
                          </div>
                        ) : result.ruleInfo ? (
                          <div className="text-sm text-amber-600">
                            Có rule #{result.ruleInfo.rule_id} khả dụng nhưng chưa được áp dụng
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            Không có rule áp dụng - Sử dụng giá niêm yết
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
