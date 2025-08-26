'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sun, Moon, Monitor, Lightbulb, Palette } from 'lucide-react'
import { useState } from 'react'

export function VolumeTiersDarkModeShowcase() {
  const { theme, setTheme } = useTheme()
  const [selectedTier, setSelectedTier] = useState(0)

  const volumeTiers = [
    {
      id: 1,
      name: "Paracetamol 500mg",
      basePrice: 5000,
      tiers: [
        { min: 1, max: 9, discount: 0, label: "Lẻ" },
        { min: 10, max: 49, discount: 5, label: "Bán buôn nhỏ" },
        { min: 50, max: 99, discount: 10, label: "Bán buôn vừa" },
        { min: 100, max: null, discount: 15, label: "Bán buôn lớn" }
      ]
    },
    {
      id: 2,
      name: "Vitamin C 1000mg",
      basePrice: 15000,
      tiers: [
        { min: 1, max: 19, discount: 0, label: "Lẻ" },
        { min: 20, max: 49, discount: 8, label: "Bán buôn" },
        { min: 50, max: null, discount: 12, label: "Đại lý" }
      ]
    }
  ]

  const currentProduct = volumeTiers[selectedTier]

  return (
    <div className="min-h-screen bg-background p-6 transition-colors duration-300">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header with Theme Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
              <Palette className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">🎨 Volume Tiers Dark Mode</h1>
              <p className="text-muted-foreground">Test giao diện bậc số lượng trong các theme khác nhau</p>
            </div>
          </div>

          {/* Theme Switcher */}
          <div className="flex items-center gap-2 p-1 bg-muted rounded-lg">
            <Button
              size="sm"
              variant={theme === 'light' ? 'default' : 'ghost'}
              onClick={() => setTheme('light')}
              className="h-9 px-3"
            >
              <Sun className="h-4 w-4 mr-2" />
              Sáng
            </Button>
            <Button
              size="sm"
              variant={theme === 'dark' ? 'default' : 'ghost'}
              onClick={() => setTheme('dark')}
              className="h-9 px-3"
            >
              <Moon className="h-4 w-4 mr-2" />
              Tối
            </Button>
            <Button
              size="sm"
              variant={theme === 'system' ? 'default' : 'ghost'}
              onClick={() => setTheme('system')}
              className="h-9 px-3"
            >
              <Monitor className="h-4 w-4 mr-2" />
              Hệ thống
            </Button>
          </div>
        </div>

        {/* Theme Status Card */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Trạng thái Theme Hiện tại
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Active Theme</div>
                <div className="text-lg font-bold text-primary">{theme || 'Loading...'}</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Background</div>
                <div className="w-8 h-8 mx-auto bg-background border-2 border-border rounded-full"></div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Foreground</div>
                <div className="w-8 h-8 mx-auto bg-foreground rounded-full"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Chọn sản phẩm:</span>
          {volumeTiers.map((product, index) => (
            <Button
              key={product.id}
              size="sm"
              variant={selectedTier === index ? 'default' : 'outline'}
              onClick={() => setSelectedTier(index)}
            >
              {product.name}
            </Button>
          ))}
        </div>

        {/* Volume Tiers Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Tiers List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{currentProduct.name}</span>
                <Badge variant="secondary">Giá gốc: {currentProduct.basePrice.toLocaleString('vi-VN')}₫</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentProduct.tiers.map((tier, index) => {
                const discountedPrice = currentProduct.basePrice * (1 - tier.discount / 100)
                const savings = currentProduct.basePrice - discountedPrice
                
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                      tier.discount > 0
                        ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 dark:from-green-950/20 dark:to-emerald-950/20 dark:border-green-800/30'
                        : 'bg-muted/30 border-border'
                    }`}
                  >
                    {/* Tier Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Badge 
                          variant={tier.discount > 0 ? "default" : "outline"}
                          className={tier.discount > 0 
                            ? "bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600" 
                            : ""
                          }
                        >
                          {tier.label}
                        </Badge>
                        <span className="text-sm text-muted-foreground font-medium">
                          {tier.min} - {tier.max || '∞'} viên
                        </span>
                      </div>
                      
                      {tier.discount > 0 && (
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="text-xs">
                            -{tier.discount}%
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Pricing Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Giá sau chiết khấu</div>
                        <div className="text-lg font-bold text-foreground">
                          {Math.round(discountedPrice).toLocaleString('vi-VN')}₫
                        </div>
                      </div>
                      
                      {tier.discount > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Tiết kiệm mỗi viên</div>
                          <div className="text-lg font-bold text-green-600 dark:text-green-400">
                            {Math.round(savings).toLocaleString('vi-VN')}₫
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Example Calculation */}
                    {tier.discount > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="text-xs text-muted-foreground mb-1">Ví dụ mua {tier.min + 5} viên:</div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Tổng tiết kiệm:</span>
                          <span className="font-bold text-green-600 dark:text-green-400">
                            {Math.round(savings * (tier.min + 5)).toLocaleString('vi-VN')}₫
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Calculator */}
          <Card>
            <CardHeader>
              <CardTitle>🧮 Máy tính bậc số lượng</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Số lượng mua:</label>
                  <input
                    type="number"
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
                    placeholder="Nhập số lượng..."
                    defaultValue="25"
                    min="1"
                  />
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground mb-2">Kết quả tính toán:</div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Bậc áp dụng:</span>
                      <Badge>Bán buôn vừa (-10%)</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Giá gốc:</span>
                      <span className="font-medium">125.000₫</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Giá sau chiết khấu:</span>
                      <span className="font-bold text-green-600 dark:text-green-400">112.500₫</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
                      <span>Tổng tiết kiệm:</span>
                      <span className="text-green-600 dark:text-green-400">12.500₫</span>
                    </div>
                  </div>
                </div>

                <Button className="w-full">
                  Áp dụng vào đơn hàng
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dark Mode Features Showcase */}
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="h-5 w-5" />
              Tính năng Dark Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium mb-1">🎨 Tự động theo hệ thống</div>
                <div className="text-muted-foreground">Theme tự động chuyển đổi theo thiết lập OS</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium mb-1">🌈 Màu sắc nhất quán</div>
                <div className="text-muted-foreground">Badges và highlights tối ưu cho từng theme</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium mb-1">👁️ Bảo vệ mắt</div>
                <div className="text-muted-foreground">Giảm ánh sáng xanh trong môi trường tối</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
