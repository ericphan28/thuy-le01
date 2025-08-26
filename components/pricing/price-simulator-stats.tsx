'use client'

import { useState, useEffect } from 'react'
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"

export default function PriceSimulatorStats() {
  const [stats, setStats] = useState({
    products: 0,
    customers: 0,
    rules: 0,
    isLoading: true
  })

  useEffect(() => {
    const loadStats = async () => {
      const supabase = createClient()
      
      try {
        const [productsRes, customersRes, rulesRes] = await Promise.all([
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('price_rules').select('*', { count: 'exact', head: true }).eq('is_active', true)
        ])

        setStats({
          products: productsRes.count || 0,
          customers: customersRes.count || 0,
          rules: rulesRes.count || 0,
          isLoading: false
        })
      } catch (error) {
        console.error('Stats loading error:', error)
        setStats(prev => ({ ...prev, isLoading: false }))
      }
    }

    loadStats()
  }, [])

  if (stats.isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-semibold mb-3">📊 Thống kê nhanh</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Tổng sản phẩm:</span>
              <Badge variant="secondary">Đang tải...</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Khách hàng VIP:</span>
              <Badge variant="secondary">Đang tải...</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Quy tắc giá:</span>
              <Badge variant="outline">Đang tải...</Badge>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold mb-3">📊 Thống kê nhanh</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Tổng sản phẩm:</span>
            <Badge variant="secondary">{stats.products.toLocaleString()}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Khách hàng VIP:</span>
            <Badge variant="secondary">{stats.customers.toLocaleString()}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Quy tắc giá:</span>
            <Badge variant="outline">{stats.rules.toLocaleString()} quy tắc</Badge>
          </div>
        </div>
      </div>

      {/* Recent calculations */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold mb-3">🕒 Tính toán gần đây</h3>
        <div className="text-sm text-gray-500">
          Chưa có tính toán nào. Hãy thử mô phỏng giá cho sản phẩm đầu tiên!
        </div>
      </div>
    </div>
  )
}
