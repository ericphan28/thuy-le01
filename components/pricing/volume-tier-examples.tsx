'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function VolumeTierExamples() {
  const examples = [
    {
      id: 1,
      title: "🏥 Thuốc kháng sinh",
      product: "Amoxicillin 500mg",
      basePrice: 5000,
      tiers: [
        { minQty: 1, maxQty: 9, discount: 0, label: "Giá lẻ" },
        { minQty: 10, maxQty: 49, discount: 5, label: "Mua sỉ nhỏ" },
        { minQty: 50, maxQty: 99, discount: 10, label: "Mua sỉ vừa" },
        { minQty: 100, maxQty: null, discount: 15, label: "Mua sỉ lớn" }
      ]
    },
    {
      id: 2,
      title: "🧴 Vitamin tổng hợp",
      product: "Vitamin C 1000mg",
      basePrice: 15000,
      tiers: [
        { minQty: 1, maxQty: 4, discount: 0, label: "Giá lẻ" },
        { minQty: 5, maxQty: 19, discount: 8, label: "Combo gia đình" },
        { minQty: 20, maxQty: null, discount: 12, label: "Mua hàng loạt" }
      ]
    }
  ]

  const calculatePrice = (basePrice: number, discount: number) => {
    return basePrice * (1 - discount / 100)
  }

  const calculateSavings = (basePrice: number, discount: number, qty: number) => {
    const originalTotal = basePrice * qty
    const discountedTotal = calculatePrice(basePrice, discount) * qty
    return originalTotal - discountedTotal
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>💡 Ví dụ minh họa - Cách hoạt động của Bậc số lượng</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {examples.map((example) => (
            <div key={example.id} className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3">{example.title}</h3>
              <div className="text-sm text-muted-foreground mb-4">
                Sản phẩm: <span className="font-medium">{example.product}</span>
                <br />
                Giá gốc: <span className="font-medium">{example.basePrice.toLocaleString('vi-VN')}₫/viên</span>
              </div>

              <div className="space-y-3">
                {example.tiers.map((tier, index) => {
                  const discountedPrice = calculatePrice(example.basePrice, tier.discount)
                  const exampleQty = tier.minQty + Math.floor((tier.maxQty || tier.minQty + 10) - tier.minQty) / 2
                  const savings = calculateSavings(example.basePrice, tier.discount, Math.floor(exampleQty))
                  
                  return (
                    <div key={index} className="bg-muted/30 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={tier.discount > 0 ? "default" : "outline"}>
                            {tier.label}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {tier.minQty} - {tier.maxQty || '∞'} viên
                          </span>
                        </div>
                        {tier.discount > 0 && (
                          <div className="text-green-600 font-medium">
                            -{tier.discount}%
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground">Giá mỗi viên:</div>
                          <div className="font-medium">
                            {discountedPrice.toLocaleString('vi-VN')}₫
                          </div>
                        </div>
                        
                        {tier.discount > 0 && (
                          <div>
                            <div className="text-muted-foreground">Ví dụ mua {Math.floor(exampleQty)} viên:</div>
                            <div className="font-medium text-green-600">
                              Tiết kiệm {savings.toLocaleString('vi-VN')}₫
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Simulation */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <div className="text-sm font-medium text-blue-800 mb-2">
                  🎯 Mô phỏng: Khách mua 25 viên
                </div>
                <div className="space-y-1 text-sm">
                  {(() => {
                    const qty = 25
                    const applicableTier = example.tiers.find(t => 
                      qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty)
                    ) || example.tiers[0]
                    
                    const originalTotal = example.basePrice * qty
                    const discountedPrice = calculatePrice(example.basePrice, applicableTier.discount)
                    const discountedTotal = discountedPrice * qty
                    const savings = originalTotal - discountedTotal

                    return (
                      <>
                        <div className="text-blue-700">
                          Áp dụng: <span className="font-medium">{applicableTier.label}</span>
                          {applicableTier.discount > 0 && ` (giảm ${applicableTier.discount}%)`}
                        </div>
                        <div className="flex justify-between">
                          <span>Tổng tiền gốc:</span>
                          <span className="line-through">{originalTotal.toLocaleString('vi-VN')}₫</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>Tổng sau chiết khấu:</span>
                          <span className="text-green-600">{discountedTotal.toLocaleString('vi-VN')}₫</span>
                        </div>
                        {savings > 0 && (
                          <div className="flex justify-between text-green-600 font-medium">
                            <span>🎉 Tiết kiệm:</span>
                            <span>{savings.toLocaleString('vi-VN')}₫</span>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Key Benefits */}
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-semibold text-green-800 mb-3">🌟 Lợi ích của Bậc số lượng:</h4>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium text-green-700">Cho khách hàng:</div>
              <ul className="text-green-600 mt-1 space-y-1">
                <li>• Tiết kiệm chi phí khi mua số lượng lớn</li>
                <li>• Khuyến khích mua thêm sản phẩm</li>
                <li>• Trải nghiệm mua sắm thông minh</li>
              </ul>
            </div>
            <div>
              <div className="font-medium text-green-700">Cho nhà thuốc:</div>
              <ul className="text-green-600 mt-1 space-y-1">
                <li>• Tăng doanh số bán hàng</li>
                <li>• Xoay vòng hàng tồn kho nhanh hơn</li>
                <li>• Cạnh tranh tốt với đối thủ</li>
              </ul>
            </div>
            <div>
              <div className="font-medium text-green-700">Tự động hóa:</div>
              <ul className="text-green-600 mt-1 space-y-1">
                <li>• Áp dụng chiết khấu tự động</li>
                <li>• Không cần nhân viên tính toán</li>
                <li>• Minh bạch và nhất quán</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
