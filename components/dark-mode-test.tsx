import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sun, Moon, Monitor } from 'lucide-react'

export function DarkModeTest() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-background">
      <div className="supabase-container">
        <div className="supabase-page-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand rounded-xl shadow-lg">
                <Monitor className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">🌙 Supabase Dark Mode Test</h1>
                <p className="text-muted-foreground">Test màu sắc và theme switching cho hệ thống</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Theme Controls */}
          <Card className="supabase-card">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <div className="p-1.5 bg-brand rounded-lg">
                  <Sun className="h-4 w-4 text-white" />
                </div>
                Theme Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={() => setTheme('light')}
                  variant={theme === 'light' ? 'default' : 'outline'}
                  className={theme === 'light' ? 'supabase-button' : 'supabase-button-secondary'}
                >
                  <Sun className="h-4 w-4 mr-2" />
                  Light Mode
                </Button>
                <Button 
                  onClick={() => setTheme('dark')}
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  className={theme === 'dark' ? 'supabase-button' : 'supabase-button-secondary'}
                >
                  <Moon className="h-4 w-4 mr-2" />
                  Dark Mode
                </Button>
                <Button 
                  onClick={() => setTheme('system')}
                  variant={theme === 'system' ? 'default' : 'outline'}
                  className={theme === 'system' ? 'supabase-button' : 'supabase-button-secondary'}
                >
                  <Monitor className="h-4 w-4 mr-2" />
                  System
                </Button>
              </div>
              
              <div className="supabase-card p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Current Theme:</p>
                    <p className="text-lg font-semibold text-brand">{theme || 'Loading...'}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-full ${
                    theme === 'dark' ? 'bg-slate-700' : theme === 'light' ? 'bg-white border-2 border-gray-300' : 'bg-gradient-to-r from-white to-slate-700'
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Color Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Primary Colors */}
            <Card className="supabase-card">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <div className="w-3 h-3 bg-brand rounded-full"></div>
                  Primary Colors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-brand rounded-lg">
                    <span className="text-white font-medium">Brand Color</span>
                    <code className="text-xs text-white/80">--brand</code>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-foreground rounded-lg">
                    <span className="text-background font-medium">Foreground</span>
                    <code className="text-xs text-background/80">--foreground</code>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-background border border-border rounded-lg">
                    <span className="text-foreground font-medium">Background</span>
                    <code className="text-xs text-muted-foreground">--background</code>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Secondary Colors */}
            <Card className="supabase-card">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <div className="w-3 h-3 bg-muted rounded-full"></div>
                  Secondary Colors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground font-medium">Muted Background</span>
                    <code className="text-xs text-muted-foreground/80">--muted</code>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                    <span className="text-secondary-foreground font-medium">Secondary</span>
                    <code className="text-xs text-secondary-foreground/80">--secondary</code>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <span className="text-foreground font-medium">Border Style</span>
                    <code className="text-xs text-muted-foreground">--border</code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Component Examples */}
          <Card className="supabase-card">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <div className="p-1.5 bg-brand rounded-lg">
                  <Sun className="h-4 w-4 text-white" />
                </div>
                Component Examples
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Product Cards Example */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Product Cards</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="supabase-product-card">
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="w-2 h-2 bg-brand rounded-full"></div>
                          <span className="text-xs text-muted-foreground">SP00{i}</span>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground">Sản phẩm {i}</h4>
                          <p className="text-sm text-muted-foreground">Mô tả sản phẩm</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold text-brand">100.000đ</span>
                          <Button size="sm" className="supabase-button h-8 px-3 text-xs">
                            Thêm
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Buttons Example */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Buttons</h3>
                <div className="flex flex-wrap gap-3">
                  <Button className="supabase-button">Primary Button</Button>
                  <Button className="supabase-button-secondary">Secondary Button</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="outline">Outline</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
