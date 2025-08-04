'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sun, Moon, Monitor, Package, Building2, Users } from 'lucide-react'
import Link from 'next/link'

export default function DesignConsistencyTest() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">🎨 Design Consistency Test</h1>
            <p className="text-muted-foreground">Kiểm tra tính thống nhất design system across all pages</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme('light')}
              className={theme === 'light' ? 'bg-brand text-white' : 'supabase-button-secondary'}
            >
              <Sun className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme('dark')}
              className={theme === 'dark' ? 'bg-brand text-white' : 'supabase-button-secondary'}
            >
              <Moon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme('system')}
              className={theme === 'system' ? 'bg-brand text-white' : 'supabase-button-secondary'}
            >
              <Monitor className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/dashboard/customers" className="block">
            <Card className="supabase-card group cursor-pointer hover:shadow-lg transition-all duration-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 text-blue-600 rounded-lg">
                    <Users className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Khách hàng</h3>
                    <p className="text-muted-foreground">Quản lý khách hàng thú y</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/suppliers" className="block">
            <Card className="supabase-card group cursor-pointer hover:shadow-lg transition-all duration-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-500/10 text-green-600 rounded-lg">
                    <Building2 className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Nhà cung cấp</h3>
                    <p className="text-muted-foreground">Quản lý nhà cung cấp</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/products" className="block">
            <Card className="supabase-card group cursor-pointer hover:shadow-lg transition-all duration-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-500/10 text-purple-600 rounded-lg">
                    <Package className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Sản phẩm</h3>
                    <p className="text-muted-foreground">Quản lý sản phẩm thú y</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Design System Components Preview */}
        <Card className="supabase-card">
          <CardHeader>
            <CardTitle className="text-foreground">Supabase Design System Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Statistics Cards Preview */}
            <div>
              <h3 className="font-semibold text-foreground mb-3">Statistics Cards (Used in all pages)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="supabase-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Customers</p>
                      <p className="text-2xl font-bold text-foreground">1,234</p>
                    </div>
                  </div>
                </div>
                <div className="supabase-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/10 text-green-600 rounded-lg">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Suppliers</p>
                      <p className="text-2xl font-bold text-foreground">56</p>
                    </div>
                  </div>
                </div>
                <div className="supabase-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 text-purple-600 rounded-lg">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Products</p>
                      <p className="text-2xl font-bold text-foreground">789</p>
                    </div>
                  </div>
                </div>
                <div className="supabase-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/10 text-orange-600 rounded-lg">
                      <Monitor className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">System</p>
                      <p className="text-2xl font-bold text-foreground">Active</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

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

            {/* Current Theme Display */}
            <div>
              <h3 className="font-semibold text-foreground mb-3">Theme Status</h3>
              <div className="supabase-card p-4 max-w-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Theme:</p>
                    <p className="text-lg font-semibold text-brand">{theme || 'Loading...'}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-full ${
                    theme === 'dark' ? 'bg-slate-700' : theme === 'light' ? 'bg-white border-2 border-gray-300' : 'bg-gradient-to-r from-white to-slate-700'
                  }`} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Summary */}
        <Card className="supabase-card">
          <CardHeader>
            <CardTitle className="text-foreground">✅ Design Consistency Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-foreground">Consistent Components</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>✅ Supabase cards across all pages</li>
                  <li>✅ Statistics cards with icons</li>
                  <li>✅ Search inputs with proper styling</li>
                  <li>✅ Pagination components</li>
                  <li>✅ Loading states</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-foreground">Theme Support</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>✅ Dark mode fully supported</li>
                  <li>✅ Light mode optimized</li>
                  <li>✅ Semantic color variables</li>
                  <li>✅ Brand colors consistent</li>
                  <li>✅ Icon visibility fixed</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
