export interface DashboardStats {
  totalRevenue: number
  totalOrders: number
  totalCustomers: number
  totalProducts: number
  revenueGrowth: number
  ordersGrowth: number
  customersGrowth: number
  productsGrowth: number
}

export interface RevenueData {
  date: string
  revenue: number
  orders: number
}

export interface TopProduct {
  id: string
  name: string
  category: string
  revenue: number
  quantity_sold: number
  growth: number
}

export interface RecentOrder {
  id: string
  customer_name: string
  total: number
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
  created_at: string
  items_count: number
  invoice_code?: string
  detail_url?: string
}

export interface CustomerData {
  id: number
  name: string
  email: string
  phone: string
  total_orders: number
  total_spent: number
  last_order_date: string
}

export interface ProductStats {
  id: number
  name: string
  category_name: string
  stock_quantity: number
  sold_quantity: number
  revenue: number
  profit_margin: number
}
