import { createClient } from '@/lib/supabase/client'
import type { 
  DashboardStats, 
  RevenueData, 
  TopProduct 
} from '@/lib/types/dashboard'

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
      const { data: currentMonthInvoices } = await this.supabase
        .from('invoices')
        .select('total_amount, customer_paid')
        .gte('invoice_date', startOfMonth.toISOString())
        .eq('status', 'completed')

      // Doanh thu tháng trước  
      const { data: lastMonthInvoices } = await this.supabase
        .from('invoices')
        .select('total_amount, customer_paid')
        .gte('invoice_date', startOfLastMonth.toISOString())
        .lte('invoice_date', endOfLastMonth.toISOString())
        .eq('status', 'completed')

      // Tổng số hóa đơn tháng này
      const { count: currentInvoices } = await this.supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .gte('invoice_date', startOfMonth.toISOString())

      // Tổng số hóa đơn tháng trước
      const { count: lastMonthInvoicesCount } = await this.supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .gte('invoice_date', startOfLastMonth.toISOString())
        .lte('invoice_date', endOfLastMonth.toISOString())

      // Tổng khách hàng
      const { count: totalCustomers } = await this.supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      // Khách hàng mới tháng này
      const { count: newCustomers } = await this.supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString())
        .eq('is_active', true)

      // Khách hàng mới tháng trước
      const { count: lastMonthNewCustomers } = await this.supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfLastMonth.toISOString())
        .lte('created_at', endOfLastMonth.toISOString())
        .eq('is_active', true)

      // Tổng sản phẩm
      const { count: totalProducts } = await this.supabase
        .from('products')
        .select('*', { count: 'exact', head: true })

      // Tổng nợ khách hàng
      const { data: debtData } = await this.supabase
        .from('customers')
        .select('current_debt')
        .eq('is_active', true)

      // Hóa đơn hoàn thành vs pending
      const { count: completedInvoices } = await this.supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('invoice_date', startOfMonth.toISOString())

      const { count: pendingInvoices } = await this.supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')

      // Tính toán
      const totalRevenue = currentMonthInvoices?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0
      const lastRevenue = lastMonthInvoices?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0
      const totalDebt = debtData?.reduce((sum, customer) => sum + Number(customer.current_debt), 0) || 0
      
      const revenueGrowth = lastRevenue > 0 ? ((totalRevenue - lastRevenue) / lastRevenue) * 100 : 0
      const invoicesGrowth = lastMonthInvoicesCount && lastMonthInvoicesCount > 0 ? 
        ((currentInvoices || 0) - lastMonthInvoicesCount) / lastMonthInvoicesCount * 100 : 0
      const customersGrowth = lastMonthNewCustomers && lastMonthNewCustomers > 0 ? 
        ((newCustomers || 0) - lastMonthNewCustomers) / lastMonthNewCustomers * 100 : 0
      
      const averageOrderValue = currentInvoices && currentInvoices > 0 ? totalRevenue / currentInvoices : 0

      return {
        totalRevenue,
        totalOrders: currentInvoices || 0,
        totalCustomers: totalCustomers || 0,
        totalProducts: totalProducts || 0,
        revenueGrowth,
        ordersGrowth: invoicesGrowth,
        customersGrowth,
        productsGrowth: 0 // not computed yet
      } as DashboardStats
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
      throw error
    }
  }

  // Lấy dữ liệu doanh thu theo ngày (30 ngày gần nhất)
  async getRevenueData(): Promise<RevenueData[]> {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    try {
      const { data: invoicesData } = await this.supabase
        .from('invoices')
        .select('invoice_date, total_amount')
        .gte('invoice_date', thirtyDaysAgo.toISOString())
        .eq('status', 'completed')
        .order('invoice_date', { ascending: true })

      const { data: detailsData } = await this.supabase
        .from('invoice_details')
        .select('invoice_date, profit_amount')
        .gte('invoice_date', thirtyDaysAgo.toISOString())

      // Group by date
      const revenueByDate = invoicesData?.reduce((acc, invoice) => {
        const date = new Date(invoice.invoice_date).toISOString().split('T')[0]
        if (!acc[date]) {
          acc[date] = { revenue: 0, invoices: 0, profit: 0 }
        }
        acc[date].revenue += Number(invoice.total_amount)
        acc[date].invoices += 1
        return acc
      }, {} as Record<string, { revenue: number; invoices: number; profit: number }>) || {}

      // Add profit data
      detailsData?.forEach(detail => {
        const date = new Date(detail.invoice_date).toISOString().split('T')[0]
        if (revenueByDate[date]) {
          revenueByDate[date].profit += Number(detail.profit_amount) || 0
        }
      })

      return Object.entries(revenueByDate)
        .map(([date, data]) => ({
          date,
          revenue: data.revenue,
          orders: data.invoices
        }))
        .sort((a, b) => a.date.localeCompare(b.date)) as RevenueData[]

    } catch (error) {
      console.error('Error fetching revenue data:', error)
      throw error
    }
  }

  // Lấy top sản phẩm bán chạy
  async getTopProducts(limit = 10): Promise<TopProduct[]> {
    try {
      const { data } = await this.supabase
        .from('invoice_details')
        .select(`
          product_id,
          product_code,
          product_name,
          quantity,
          unit_price,
          line_total,
          profit_amount
        `)
        .gte('invoice_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      // Group by product
      const productStats = data?.reduce((acc, item) => {
        const key = `${item.product_id}_${item.product_code}`
        if (!acc[key]) {
          acc[key] = {
            id: String(item.product_id),
            name: item.product_name,
            category: '',
            revenue: 0,
            quantity_sold: 0,
            growth: 0
          }
        }
        acc[key].quantity_sold += Number(item.quantity)
        acc[key].revenue += Number(item.line_total)
        return acc
      }, {} as Record<string, TopProduct>) || {}

      return Object.values(productStats)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit)

    } catch (error) {
      console.error('Error fetching top products:', error)
      throw error
    }
  }

  // Advanced customer/invoice breakdown methods removed for lightweight build
}
