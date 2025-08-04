'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Sun, Moon, Monitor, ShoppingCart, Package } from 'lucide-react'

export default function IconTest() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Theme Controls */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Icon Visibility Test</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme('light')}
              className={theme === 'light' ? 'bg-brand text-white' : ''}
            >
              <Sun className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme('dark')}
              className={theme === 'dark' ? 'bg-brand text-white' : ''}
            >
              <Moon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme('system')}
              className={theme === 'system' ? 'bg-brand text-white' : ''}
            >
              <Monitor className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Current Theme Display */}
        <Card className="supabase-card">
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-lg">Current Theme: <span className="font-bold text-brand">{theme || 'Loading...'}</span></p>
            </div>
          </CardContent>
        </Card>

        {/* Icon Tests */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* POS-style Icons */}
          <Card className="supabase-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-lg text-foreground">
                  <div className="p-1.5 bg-brand rounded-lg shadow-sm">
                    <Search className="h-4 w-4 text-white" />
                  </div>
                  POS Header Icon (Fixed)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/60" />
                <input
                  placeholder="Search input icon (Fixed)"
                  className="supabase-input pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Various Icon Styles */}
          <Card className="supabase-card">
            <CardHeader>
              <CardTitle className="text-foreground">Icon Color Tests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Search className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">text-muted-foreground</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                  <Search className="h-5 w-5 text-foreground" />
                  <span className="text-sm">text-foreground</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                  <Search className="h-5 w-5 text-foreground/60" />
                  <span className="text-sm">text-foreground/60</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-brand rounded-lg">
                  <Search className="h-5 w-5 text-white" />
                  <span className="text-sm text-white">text-white on brand</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-brand rounded-lg">
                  <Search className="h-5 w-5 text-brand-foreground" />
                  <span className="text-sm text-white">text-brand-foreground</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Statistics Cards Test */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="supabase-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Products</p>
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
                <p className="text-sm text-muted-foreground">In Cart</p>
                <p className="text-2xl font-bold text-foreground">5</p>
              </div>
            </div>
          </div>
          <div className="supabase-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand/10 text-brand rounded-lg">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Brand Icon</p>
                <p className="text-2xl font-bold text-foreground">Test</p>
              </div>
            </div>
          </div>
          <div className="supabase-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Primary</p>
                <p className="text-2xl font-bold text-foreground">Test</p>
              </div>
            </div>
          </div>
        </div>

        {/* Debug Information */}
        <Card className="supabase-card">
          <CardHeader>
            <CardTitle className="text-foreground">Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current theme:</span>
                <span className="text-foreground">{theme}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">--brand color:</span>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-brand rounded"></div>
                  <span className="text-foreground">hsl(var(--brand))</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">--foreground color:</span>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-foreground rounded"></div>
                  <span className="text-foreground">hsl(var(--foreground))</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">--muted-foreground color:</span>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-muted-foreground rounded"></div>
                  <span className="text-foreground">hsl(var(--muted-foreground))</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
