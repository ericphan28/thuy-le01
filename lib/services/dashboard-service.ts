import { createClient } from '@/lib/supabase/client'
import type { DashboardStats, RevenueData, TopProduct, RecentOrder } from '@/lib/types/dashboard'

export class DashboardService {
  private supabase = createClient()

  // Lấy thống kê tổng quan
  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    try {
      // Doanh thu tháng hiện tại
      const { data: currentRevenue } = await this.supabase
        .from('invoices')
        .select('total_amount')
        .gte('invoice_date', startOfMonth.toISOString())
        .eq('status', 'completed')

      // Doanh thu tháng trước
      const { data: lastMonthRevenue } = await this.supabase
        .from('invoices')
        .select('total_amount')
        .gte('invoice_date', startOfLastMonth.toISOString())
        .lte('invoice_date', endOfLastMonth.toISOString())
        .eq('status', 'completed')

      // Tổng đơn hàng tháng này
      const { count: currentOrders } = await this.supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .gte('invoice_date', startOfMonth.toISOString())

      // Tổng đơn hàng tháng trước
      const { count: lastMonthOrders } = await this.supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .gte('invoice_date', startOfLastMonth.toISOString())
        .lte('invoice_date', endOfLastMonth.toISOString())

      // Tổng khách hàng
      const { count: totalCustomers } = await this.supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })

      // Khách hàng mới tháng này
      const { count: newCustomers } = await this.supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString())

      // Khách hàng mới tháng trước
      const { count: lastMonthNewCustomers } = await this.supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfLastMonth.toISOString())
        .lte('created_at', endOfLastMonth.toISOString())

      // Tổng sản phẩm
      const { count: totalProducts } = await this.supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')

      // Tính toán
      const totalRevenue = currentRevenue?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0
      const lastRevenue = lastMonthRevenue?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0
      
      const revenueGrowth = lastRevenue > 0 ? ((totalRevenue - lastRevenue) / lastRevenue) * 100 : 0
      const ordersGrowth = lastMonthOrders && lastMonthOrders > 0 ? 
        ((currentOrders || 0) - lastMonthOrders) / lastMonthOrders * 100 : 0
      const customersGrowth = lastMonthNewCustomers && lastMonthNewCustomers > 0 ? 
        ((newCustomers || 0) - lastMonthNewCustomers) / lastMonthNewCustomers * 100 : 0

      return {
        totalRevenue,
        totalOrders: currentOrders || 0,
        totalCustomers: totalCustomers || 0,
        totalProducts: totalProducts || 0,
        revenueGrowth,
        ordersGrowth,
        customersGrowth,
        productsGrowth: 0
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
      return {
        totalRevenue: 0,
        totalOrders: 0,
        totalCustomers: 0,
        totalProducts: 0,
        revenueGrowth: 0,
        ordersGrowth: 0,
        customersGrowth: 0,
        productsGrowth: 0
      }
    }
  }

  // Lấy dữ liệu doanh thu theo ngày (30 ngày gần nhất)
  async getRevenueData(): Promise<RevenueData[]> {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    try {
      const { data } = await this.supabase
        .from('invoices')
        .select('invoice_date, total_amount')
        .gte('invoice_date', thirtyDaysAgo.toISOString())
        .eq('status', 'completed')
        .order('invoice_date', { ascending: true })

      // Group by date
      const groupedData = data?.reduce((acc, invoice) => {
        const date = new Date(invoice.invoice_date).toISOString().split('T')[0]
        if (!acc[date]) {
          acc[date] = { revenue: 0, orders: 0 }
        }
        acc[date].revenue += invoice.total_amount || 0
        acc[date].orders += 1
        return acc
      }, {} as Record<string, { revenue: number; orders: number }>) || {}

      return Object.entries(groupedData).map(([date, data]) => ({
        date,
        revenue: data.revenue,
        orders: data.orders
      }))
    } catch (error) {
      console.error('Error fetching revenue data:', error)
      return []
    }
  }

  // Lấy top sản phẩm bán chạy
  async getTopProducts(): Promise<TopProduct[]> {
    try {
      const { data } = await this.supabase
        .from('invoice_details')
        .select(`
          product_id,
          quantity,
          unit_price,
          line_total,
          product_name,
          invoices!inner(
            status,
            invoice_date
          )
        `)
        .eq('invoices.status', 'completed')
        .gte('invoices.invoice_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      // Group by product
      const productStats = data?.reduce((acc, item: any) => {
        const productId = item.product_id?.toString() || 'unknown'
        if (!acc[productId]) {
          acc[productId] = {
            id: productId,
            name: item.product_name || 'Unknown Product',
            category: 'General',
            revenue: 0,
            quantity_sold: 0,
            growth: 0
          }
        }
        acc[productId].revenue += item.line_total || 0
        acc[productId].quantity_sold += item.quantity || 0
        return acc
      }, {} as Record<string, TopProduct>) || {}

      return Object.values(productStats)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
    } catch (error) {
      console.error('Error fetching top products:', error)
      return []
    }
  }

  // Lấy đơn hàng gần nhất
  async getRecentOrders(): Promise<RecentOrder[]> {
    try {
      const { data } = await this.supabase
        .from('invoices')
        .select(`
          invoice_id,
          invoice_code,
          total_amount,
          status,
          invoice_date,
          customer_name
        `)
        .order('invoice_date', { ascending: false })
        .limit(10)

      return data?.map(invoice => ({
        id: invoice.invoice_id?.toString() || 'unknown',
        customer_name: invoice.customer_name || 'Unknown Customer',
        total: invoice.total_amount || 0,
        status: invoice.status as RecentOrder['status'],
        created_at: invoice.invoice_date,
        items_count: 1 // Since we don't have invoice_details joined
      })) || []
    } catch (error) {
      console.error('Error fetching recent orders:', error)
      return []
    }
  }
}
