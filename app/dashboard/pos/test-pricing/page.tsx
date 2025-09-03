"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { enhancedPricingService } from '@/lib/services/enhanced-pricing-service'

export default function TestPricingPage() {
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const testPricing = async () => {
    setLoading(true)
    setResult('Testing pricing service...')

    try {
      // Test product (dummy)
      const testProduct = {
        product_id: 1,
        product_code: 'TEST001',
        product_name: 'Test Product',
        sale_price: 100000,
        current_stock: 10,
        category_id: 1
      }

      // Test pricing calculation
      const pricingResult = await enhancedPricingService.calculateProductPrice(
        testProduct,
        5,
        {
          include_volume_tiers: true,
          tax_rate: 10
        }
      )

      setResult(JSON.stringify(pricingResult, null, 2))
    } catch (error) {
      console.error('Test error:', error)
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testCartPricing = async () => {
    setLoading(true)
    setResult('Testing cart pricing...')

    try {
      const testCartItems = [
        {
          product: {
            product_id: 1,
            product_code: 'TEST001',
            product_name: 'Test Product 1',
            sale_price: 100000,
            current_stock: 10,
            category_id: 1
          },
          quantity: 3
        },
        {
          product: {
            product_id: 2,
            product_code: 'TEST002',
            product_name: 'Test Product 2',
            sale_price: 50000,
            current_stock: 5,
            category_id: 2
          },
          quantity: 2
        }
      ]

      const cartPricing = await enhancedPricingService.calculateCartPricing(
        testCartItems,
        {
          include_volume_tiers: true,
          tax_rate: 10
        }
      )

      setResult(JSON.stringify(cartPricing, null, 2))
    } catch (error) {
      console.error('Cart test error:', error)
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Enhanced Pricing Service Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={testPricing} 
              disabled={loading}
            >
              Test Single Product Pricing
            </Button>
            <Button 
              onClick={testCartPricing} 
              disabled={loading}
              variant="outline"
            >
              Test Cart Pricing
            </Button>
          </div>

          {result && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">Result:</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                {result}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
