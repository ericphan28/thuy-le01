import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TodayRevenue {
  revenue: number
  orders: number
  customers: number
  loading: boolean
  error: string | null
}

export function useTodayRevenue(): TodayRevenue {
  const [data, setData] = useState<TodayRevenue>({
    revenue: 0,
    orders: 0,
    customers: 0,
    loading: true,
    error: null
  })

  const supabase = createClient()

  useEffect(() => {
    const fetchTodayRevenue = async () => {
      try {
        const today = new Date()
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

        // Lấy doanh thu hôm nay
        const { data: invoices, error: invoiceError } = await supabase
          .from('invoices')
          .select('total_amount, customer_id')
          .gte('invoice_date', startOfToday.toISOString())
          .lt('invoice_date', endOfToday.toISOString())
          .eq('status', 'completed')

        if (invoiceError) {
          console.error('Error fetching today revenue:', invoiceError)
          setData(prev => ({ 
            ...prev, 
            loading: false, 
            error: 'Không thể tải dữ liệu doanh thu' 
          }))
          return
        }

        // Tính toán metrics
        const revenue = invoices?.reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0) || 0
        const orders = invoices?.length || 0
        const uniqueCustomers = new Set(invoices?.map(inv => inv.customer_id).filter(Boolean)).size

        setData({
          revenue,
          orders,
          customers: uniqueCustomers,
          loading: false,
          error: null
        })

      } catch (error) {
        console.error('Unexpected error fetching today revenue:', error)
        setData(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Đã xảy ra lỗi không mong muốn' 
        }))
      }
    }

    fetchTodayRevenue()

    // Refresh every 5 minutes
    const interval = setInterval(fetchTodayRevenue, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [supabase])

  return data
}
