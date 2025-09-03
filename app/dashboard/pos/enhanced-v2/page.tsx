"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { enhancedPricingService, type EnhancedProduct, type EnhancedPricingResult } from '@/lib/services/enhanced-pricing-service-v2'
import EnhancedCartSummaryV2 from '@/components/pos/enhanced-cart-summary-v2'

export default function EnhancedPricingDemoV2() {
  const [productCode, setProductCode] = useState('SP000049') // Sản phẩm có pricing rules
  const [quantity, setQuantity] = useState(5)
  const [product, setProduct] = useState<EnhancedProduct | null>(null)
  const [pricingResult, setPricingResult] = useState<EnhancedPricingResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const testProduct = async () => {
    if (!productCode.trim()) {
      setError('Vui lòng nhập mã sản phẩm')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // 1. Lấy thông tin sản phẩm
      const productData = await enhancedPricingService.getProductWithPricing(productCode)
      
      if (!productData) {
        setError(`Không tìm thấy sản phẩm với mã: ${productCode}`)
        setProduct(null)
        setPricingResult(null)
        return
      }

      setProduct(productData)

      // 2. Tính giá với enhanced pricing
      const pricing = await enhancedPricingService.calculateProductPrice(productData, quantity, {
        include_volume_tiers: true,
        include_price_rules: true,
        tax_rate: 10
      })

      setPricingResult(pricing)

    } catch (error) {
      console.error('Test error:', error)
      setError(`Lỗi: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Test với những sản phẩm có pricing rules
  const quickTests = [
    { code: 'SP000049', name: 'Có HOT tag rule', qty: 5 },
    { code: 'SP000001', name: 'Sản phẩm đầu tiên', qty: 3 },
    { code: 'MED001', name: 'Medicine sample', qty: 10 },
  ]

  const formatVND = (amount: number) => {
    return amount.toLocaleString('vi-VN') + ' ₫'
  }

  useEffect(() => {
    // Auto test khi component mount
    if (productCode) {
      testProduct()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🧪 Enhanced Pricing V2 Demo</h1>
      <p className="text-muted-foreground mb-6">
        Test Enhanced Pricing Service tích hợp với existing Pricing Engine + Volume Tiers
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Testing Panel */}
        <div className="space-y-6">
          {/* Test Form */}
          <Card>
            <CardHeader>
              <CardTitle>🎯 Test Single Product</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mã sản phẩm (SKU)</Label>
                <Input
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                  placeholder="Nhập mã SKU (ví dụ: SP000049)"
                />
              </div>

              <div className="space-y-2">
                <Label>Số lượng</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  min="1"
                />
              </div>

              <Button 
                onClick={testProduct} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Đang tính...' : 'Test Pricing'}
              </Button>

              {/* Quick Tests */}
              <div className="space-y-2">
                <Label>Quick Tests</Label>
                <div className="grid grid-cols-1 gap-2">
                  {quickTests.map((test) => (
                    <Button
                      key={test.code}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setProductCode(test.code)
                        setQuantity(test.qty)
                        setTimeout(() => testProduct(), 100)
                      }}
                      disabled={isLoading}
                    >
                      {test.code} - {test.name} (x{test.qty})
                    </Button>
                  ))}
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Product Info */}
          {product && (
            <Card>
              <CardHeader>
                <CardTitle>📦 Product Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div><strong>Code:</strong> {product.product_code}</div>
                <div><strong>Name:</strong> {product.product_name}</div>
                <div><strong>Sale Price:</strong> {formatVND(product.sale_price)}</div>
                <div><strong>Stock:</strong> {product.current_stock} units</div>
                <div><strong>Category ID:</strong> {product.category_id}</div>
              </CardContent>
            </Card>
          )}

          {/* Pricing Result */}
          {pricingResult && (
            <Card>
              <CardHeader>
                <CardTitle>💰 Pricing Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Main Prices */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>List Price:</span>
                    <span>{formatVND(pricingResult.list_price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rule Applied Price:</span>
                    <span>{formatVND(pricingResult.rule_applied_price)}</span>
                  </div>
                  {pricingResult.volume_tier_price && (
                    <div className="flex justify-between">
                      <span>Volume Tier Price:</span>
                      <span>{formatVND(pricingResult.volume_tier_price)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Final Price:</span>
                    <span className="text-green-600">{formatVND(pricingResult.final_price)}</span>
                  </div>
                </div>

                {/* Applied Rules */}
                {pricingResult.applied_rule && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <h4 className="font-medium mb-2">🎯 Applied Price Rule</h4>
                    <div className="text-sm space-y-1">
                      <div>Rule ID: {pricingResult.applied_rule.id}</div>
                      <div>Reason: {pricingResult.applied_rule.reason}</div>
                      <div>Discount: {formatVND(pricingResult.applied_rule.discount_amount)} ({pricingResult.applied_rule.discount_percent.toFixed(1)}%)</div>
                    </div>
                  </div>
                )}

                {/* Volume Tier */}
                {pricingResult.volume_tier_match && (
                  <div className="p-3 bg-green-50 rounded-lg">
                    <h4 className="font-medium mb-2">🎁 Volume Tier Match</h4>
                    <div className="text-sm space-y-1">
                      <div>Tier ID: {pricingResult.volume_tier_match.tier.tier_id}</div>
                      <div>Min Qty: {pricingResult.volume_tier_match.tier.min_qty}</div>
                      <div>Savings: {formatVND(pricingResult.volume_tier_match.savings)} ({pricingResult.volume_tier_match.savings_percent.toFixed(1)}%)</div>
                    </div>
                  </div>
                )}

                {/* Pricing Source */}
                <div className="flex items-center gap-2">
                  <span>Pricing Source:</span>
                  <Badge variant="outline">
                    {pricingResult.pricing_source}
                  </Badge>
                </div>

                {/* Total Savings */}
                {pricingResult.final_savings > 0 && (
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Savings:</span>
                      <span className="text-green-600 font-bold">
                        {formatVND(pricingResult.final_savings)} ({pricingResult.final_savings_percent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                )}

                {/* Stock Status */}
                <div className={`p-3 rounded-lg ${
                  pricingResult.stock_status.is_sufficient ? 'bg-green-50' : 'bg-red-50'
                }`}>
                  <div className="text-sm">
                    <div>Stock Available: {pricingResult.stock_status.available}</div>
                    <div>Requested: {pricingResult.stock_status.requested}</div>
                    <div className={
                      pricingResult.stock_status.is_sufficient ? 'text-green-600' : 'text-red-600'
                    }>
                      Status: {pricingResult.stock_status.is_sufficient ? '✅ Sufficient' : '⚠️ Insufficient'}
                    </div>
                    {pricingResult.stock_status.warning && (
                      <div className="text-amber-600 mt-1">{pricingResult.stock_status.warning}</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Enhanced Cart Demo */}
        <div className="space-y-6">
          <EnhancedCartSummaryV2 />
        </div>
      </div>
    </div>
  )
}
