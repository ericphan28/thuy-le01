"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { VolumeTiersService } from '@/lib/services/volume-tiers-service'

export default function TestVolumeTiersPage() {
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const testVolumeTiers = async () => {
    setLoading(true)
    setResult('Testing volume tiers service...')

    try {
      const volumeTiersService = new VolumeTiersService()
      
      // Test with dummy product ID and category
      const productId = 1
      const categoryId = 1
      const quantity = 5

      const tiers = await volumeTiersService.findMatchingTiers(
        productId,
        categoryId,
        quantity
      )

      setResult(`Found ${tiers.length} matching volume tiers:\n${JSON.stringify(tiers, null, 2)}`)
    } catch (error) {
      console.error('Volume tiers test error:', error)
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testCalculateVolumePrice = async () => {
    setLoading(true)
    setResult('Testing volume price calculation...')

    try {
      const volumeTiersService = new VolumeTiersService()
      
      const productId = 1
      const categoryId = 1
      const quantity = 10
      const basePrice = 100000

      const volumePrice = await volumeTiersService.calculateVolumePrice(
        productId,
        categoryId,
        quantity,
        basePrice
      )

      setResult(`Volume price calculation:\n${JSON.stringify(volumePrice, null, 2)}`)
    } catch (error) {
      console.error('Volume price calculation error:', error)
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testGetProductTiers = async () => {
    setLoading(true)
    setResult('Testing get product tiers...')

    try {
      const volumeTiersService = new VolumeTiersService()
      
      const productId = 1

      const tiers = await volumeTiersService.getProductTiers(productId)

      setResult(`Product tiers:\n${JSON.stringify(tiers, null, 2)}`)
    } catch (error) {
      console.error('Get product tiers error:', error)
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Volume Tiers Service Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button 
              onClick={testVolumeTiers} 
              disabled={loading}
            >
              Test Find Matching Tiers
            </Button>
            <Button 
              onClick={testCalculateVolumePrice} 
              disabled={loading}
              variant="outline"
            >
              Test Calculate Volume Price
            </Button>
            <Button 
              onClick={testGetProductTiers} 
              disabled={loading}
              variant="secondary"
            >
              Test Get Product Tiers
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
