"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { DashboardService } from '@/lib/services/dashboardService'
import type { 
  DashboardStats, 
  RevenueData, 
  TopProduct 
} from '@/lib/types/dashboard'

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueData[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  // Extended analytics removed / not yet implemented in types
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dashboardService = useMemo(() => new DashboardService(), [])

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('🔄 Loading dashboard data...')

      const [
        statsData, 
        revenueData, 
  topProductsData
      ] = await Promise.all([
        dashboardService.getDashboardStats(),
        dashboardService.getRevenueData(),
  dashboardService.getTopProducts()
      ])

      console.log('✅ Dashboard data loaded:', {
        stats: statsData,
        revenuePoints: revenueData.length,
        topProducts: topProductsData.length
      })

      setStats(statsData)
      setRevenueData(revenueData)
      setTopProducts(topProductsData)
  // Additional setters removed

    } catch (err) {
      console.error('❌ Dashboard error:', err)
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [dashboardService])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const refetch = useCallback(() => {
    console.log('🔄 Refetching dashboard data...')
    loadDashboardData()
  }, [loadDashboardData])

  return {
    stats,
    revenueData,
    topProducts,
    loading,
    error,
    refetch
  }
}
