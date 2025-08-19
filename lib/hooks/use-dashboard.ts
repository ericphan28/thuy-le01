import { useState, useEffect, useCallback, useMemo } from 'react'
import { DashboardService } from '@/lib/services/dashboard-service'
import type { DashboardStats, RevenueData, TopProduct, RecentOrder } from '@/lib/types/dashboard'

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueData[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dashboardService = useMemo(() => new DashboardService(), [])

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('🔄 Loading dashboard data...')

      const [statsData, revenueDataResult, topProductsData, recentOrdersData] = await Promise.all([
        dashboardService.getDashboardStats(),
        dashboardService.getRevenueData(),
        dashboardService.getTopProducts(),
        dashboardService.getRecentOrders()
      ])

      console.log('📊 Dashboard data loaded:', {
        stats: statsData,
        revenue: revenueDataResult.length,
        products: topProductsData.length,
        orders: recentOrdersData.length
      })

      setStats(statsData)
      setRevenueData(revenueDataResult)
      setTopProducts(topProductsData)
      setRecentOrders(recentOrdersData)
    } catch (err) {
      console.error('❌ Dashboard loading error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [dashboardService])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const refetch = useCallback(() => {
    loadDashboardData()
  }, [loadDashboardData])

  return {
    stats,
    revenueData,
    topProducts,
    recentOrders,
    loading,
    error,
    refetch
  }
}
