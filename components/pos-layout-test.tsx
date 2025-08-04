'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { 
  Package, 
  ShoppingCart, 
  Star, 
  TrendingUp, 
  Search,
  Sun,
  Moon,
  Monitor
} from 'lucide-react'

export default function PosLayoutTest() {
  const { theme, setTheme } = useTheme()
  const [cartItems] = useState(5)
  const [totalAmount] = useState(2_500_000)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">POS Layout Test</h1>
            <p className="text-muted-foreground">Kiểm tra responsive design và Supabase styling</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme('light')}
              className={theme === 'light' ? 'bg-brand text-primary-foreground' : ''}
            >
              <Sun className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme('dark')}
              className={theme === 'dark' ? 'bg-brand text-primary-foreground' : ''}
            >
              <Moon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme('system')}
              className={theme === 'system' ? 'bg-brand text-primary-foreground' : ''}
            >
              <Monitor className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="supabase-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tổng sản phẩm</p>
                <p className="text-2xl font-bold text-foreground">247</p>
              </div>
            </div>
          </div>
          <div className="supabase-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 text-green-600 rounded-lg">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Trong giỏ</p>
                <p className="text-2xl font-bold text-foreground">{cartItems}</p>
              </div>
            </div>
          </div>
          <div className="supabase-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 text-purple-600 rounded-lg">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hàng tồn kho</p>
                <p className="text-2xl font-bold text-foreground">1,523</p>
              </div>
            </div>
          </div>
          <div className="supabase-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 text-orange-600 rounded-lg">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tổng tiền</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left - Search & Products */}
          <div className="xl:col-span-2 space-y-4">
            {/* Search */}
            <Card className="supabase-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-lg text-foreground">
                    <div className="p-1.5 bg-brand rounded-lg">
                      <Search className="h-4 w-4 text-primary-foreground" />
                    </div>
                    Tìm Sản Phẩm
                  </span>
                  <Badge variant="secondary" className="bg-brand/10 text-brand border-brand/20">
                    247 sản phẩm
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    placeholder="Tìm sản phẩm theo tên hoặc mã..."
                    className="supabase-input pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Products Grid */}
            <Card className="supabase-card">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="supabase-product-card p-4 group cursor-pointer hover:shadow-lg transition-all duration-200">
                      <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center">
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium text-foreground group-hover:text-brand transition-colors line-clamp-2">
                          Sản phẩm {i + 1}
                        </h3>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold text-green-600">
                            {formatCurrency(150000 + i * 10000)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            Còn {20 + i}
                          </Badge>
                        </div>
                        <Button size="sm" className="w-full supabase-button">
                          Thêm vào giỏ
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-border gap-4">
                  <div className="text-sm text-muted-foreground order-2 sm:order-1">
                    Trang 1 / 5 - 247 sản phẩm
                  </div>
                  <div className="flex items-center gap-2 order-1 sm:order-2">
                    <Button variant="outline" size="sm" disabled className="supabase-button-secondary">
                      <span className="hidden sm:inline">Trước</span>
                    </Button>
                    <div className="px-4 py-2 text-sm bg-brand text-primary-foreground rounded-lg font-medium shadow-lg">
                      1
                    </div>
                    <Button variant="outline" size="sm" className="supabase-button-secondary">
                      <span className="hidden sm:inline">Sau</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right - Cart */}
          <div className="space-y-4">
            <Card className="supabase-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                  <ShoppingCart className="h-5 w-5 text-brand" />
                  Giỏ Hàng ({cartItems})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="supabase-product-card p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-foreground truncate">
                          Sản phẩm {i + 1}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(150000)} x {i + 1}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">
                          {formatCurrency(150000 * (i + 1))}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Cart Summary */}
                <div className="border-t border-border pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tạm tính:</span>
                    <span className="text-foreground">{formatCurrency(900000)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT (10%):</span>
                    <span className="text-foreground">{formatCurrency(90000)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-border pt-2">
                    <span className="text-foreground">Tổng cộng:</span>
                    <span className="text-green-600">{formatCurrency(990000)}</span>
                  </div>
                </div>

                <Button className="w-full supabase-button text-lg py-6">
                  Thanh Toán
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Design System Showcase */}
        <Card className="supabase-card">
          <CardHeader>
            <CardTitle className="text-foreground">Supabase Design System Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Buttons */}
            <div>
              <h3 className="font-semibold text-foreground mb-3">Buttons</h3>
              <div className="flex flex-wrap gap-3">
                <Button className="supabase-button">Primary Button</Button>
                <Button className="supabase-button-secondary">Secondary Button</Button>
                <Button variant="outline">Outline Button</Button>
                <Button variant="ghost">Ghost Button</Button>
              </div>
            </div>

            {/* Input */}
            <div>
              <h3 className="font-semibold text-foreground mb-3">Input</h3>
              <input 
                placeholder="Supabase styled input..." 
                className="supabase-input max-w-md"
              />
            </div>

            {/* Cards */}
            <div>
              <h3 className="font-semibold text-foreground mb-3">Cards</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="supabase-card p-4">
                  <h4 className="font-medium text-foreground mb-2">Supabase Card</h4>
                  <p className="text-muted-foreground">Standard card with consistent styling</p>
                </div>
                <div className="supabase-product-card p-4">
                  <h4 className="font-medium text-foreground mb-2">Product Card</h4>
                  <p className="text-muted-foreground">Enhanced card for product displays</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
