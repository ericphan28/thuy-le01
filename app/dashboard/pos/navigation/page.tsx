"use client"

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  ShoppingCart, 
  Calculator, 
  TestTube, 
  Settings, 
  TrendingUp,
  Database,
  Zap,
  CheckCircle
} from 'lucide-react'

export default function POSNavigationPage() {
  const posVersions = [
    {
      title: "POS System V2 (Mới)",
      description: "Hệ thống POS hoàn toàn mới với tích hợp Pricing Engine",
      href: "/dashboard/pos/new-pos",
      icon: <ShoppingCart className="h-6 w-6" />,
      status: "Recommended",
      statusColor: "default",
      features: [
        "Tích hợp hoàn toàn với Pricing Engine hiện tại",
        "Tính giá thông minh theo rules",
        "Hỗ trợ khách hàng VIP",
        "Real-time stock validation",
        "Giao diện thân thiện"
      ]
    },
    {
      title: "POS System V1 (Cũ)",
      description: "Hệ thống POS gốc với enhanced pricing features",
      href: "/dashboard/pos",
      icon: <Calculator className="h-6 w-6" />,
      status: "Legacy",
      statusColor: "secondary",
      features: [
        "Hệ thống POS ban đầu",
        "Enhanced pricing toggle",
        "Basic cart functionality",
        "Volume tier support"
      ]
    }
  ]

  const testingTools = [
    {
      title: "Pricing System Test",
      description: "Test hệ thống tính giá với dữ liệu thật",
      href: "/dashboard/pos/pricing-test",
      icon: <TestTube className="h-6 w-6" />,
      status: "Testing",
      statusColor: "outline"
    },
    {
      title: "Real Data Demo",
      description: "Demo với dữ liệu thật từ database",
      href: "/dashboard/pos/real-data-demo",
      icon: <Database className="h-6 w-6" />,
      status: "Demo",
      statusColor: "outline"
    },
    {
      title: "Database Test",
      description: "Kiểm tra kết nối database và API",
      href: "/dashboard/pos/test-database",
      icon: <Settings className="h-6 w-6" />,
      status: "Debug",
      statusColor: "outline"
    }
  ]

  const pricingTools = [
    {
      title: "Price Simulator",
      description: "Công cụ mô phỏng giá hiện tại",
      href: "/dashboard/pricing/simulator",
      icon: <TrendingUp className="h-6 w-6" />,
      status: "Production",
      statusColor: "default"
    },
    {
      title: "Enhanced Pricing V2",
      description: "Enhanced pricing với Volume Tiers",
      href: "/dashboard/pos/enhanced-v2",
      icon: <Zap className="h-6 w-6" />,
      status: "Enhanced",
      statusColor: "secondary"
    }
  ]

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">🏪 POS Systems Navigation</h1>
        <p className="text-muted-foreground text-lg">
          Chọn hệ thống POS phù hợp hoặc các công cụ test/debug
        </p>
      </div>

      {/* Main POS Systems */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">🎯 POS Systems</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {posVersions.map((pos, index) => (
            <Card key={index} className="relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {pos.icon}
                    <div>
                      <CardTitle>{pos.title}</CardTitle>
                      <CardDescription>{pos.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={pos.statusColor as any}>
                    {pos.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {pos.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href={pos.href}>
                  <Button className="w-full" size="lg">
                    Sử dụng {pos.title}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Testing Tools */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">🧪 Testing & Debug Tools</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {testingTools.map((tool, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  {tool.icon}
                  <div>
                    <CardTitle className="text-lg">{tool.title}</CardTitle>
                  </div>
                </div>
                <Badge variant={tool.statusColor as any} className="w-fit">
                  {tool.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  {tool.description}
                </p>
                <Link href={tool.href}>
                  <Button variant="outline" className="w-full">
                    Mở Tool
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing Tools */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">💰 Pricing Tools</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {pricingTools.map((tool, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {tool.icon}
                    <CardTitle className="text-lg">{tool.title}</CardTitle>
                  </div>
                  <Badge variant={tool.statusColor as any}>
                    {tool.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  {tool.description}
                </p>
                <Link href={tool.href}>
                  <Button variant="outline" className="w-full">
                    Sử dụng
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Quick Stats */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>📊 System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">✅</div>
              <div className="text-sm">POS V2 Ready</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">🔗</div>
              <div className="text-sm">Pricing Engine</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">🗄️</div>
              <div className="text-sm">Real Database</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">🧪</div>
              <div className="text-sm">Testing Tools</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
