/**
 * Invoice Analytics Analyzer - Xuân Thùy Pet Pharmacy
 * Phân tích thống kê chi tiết hóa đơn từ Supabase database
 * Based on customer-stats-analyzer.ts pattern
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { mkdirSync, existsSync } from 'fs'
import path from 'path'

interface Invoice {
  invoice_id: number
  invoice_code: string
  invoice_date: string
  return_code: string | null
  customer_id: number | null
  customer_name: string
  branch_id: number
  total_amount: number
  customer_paid: number
  notes: string | null
  status: string
  created_at: string
  updated_at: string
}

interface InvoiceDetail {
  detail_id: number
  invoice_id: number | null
  product_id: number | null
  invoice_code: string
  product_code: string
  product_name: string
  customer_code: string | null
  customer_name: string
  branch_id: number
  quantity: number
  unit_price: number
  discount_amount: number
  total_amount: number
  profit_amount: number
  cash_payment: number
  card_payment: number
  transfer_payment: number
  wallet_payment: number
  points_payment: number
  invoice_date: string
  created_at: string
}

interface InvoiceStats {
  totalInvoices: number
  totalRevenue: number
  totalProfit: number
  averageOrderValue: number
  averageProfit: number
  profitMargin: number
  topCustomers: Array<{
    customer_id: number | null
    customer_name: string
    total_orders: number
    total_revenue: number
    total_profit: number
  }>
  topProducts: Array<{
    product_id: number | null
    product_name: string
    product_code: string
    total_quantity: number
    total_revenue: number
    total_profit: number
  }>
  paymentMethods: {
    cash: number
    card: number
    transfer: number
    wallet: number
    points: number
  }
  monthlyTrends: Array<{
    month: string
    total_orders: number
    total_revenue: number
    total_profit: number
    avg_order_value: number
  }>
  branchPerformance: Array<{
    branch_id: number
    total_orders: number
    total_revenue: number
    total_profit: number
  }>
}

function loadEnvFile(): Record<string, string> {
  try {
    const envContent = readFileSync('.env.local', 'utf8')
    console.log('📄 .env.local content length:', envContent.length)
    
    const envVars: Record<string, string> = {}
    
    envContent.split('\n').forEach((line, index) => {
      const trimmedLine = line.trim()
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const equalIndex = trimmedLine.indexOf('=')
        if (equalIndex > 0) {
          const key = trimmedLine.substring(0, equalIndex).trim()
          const value = trimmedLine.substring(equalIndex + 1).trim()
          if (key && value) {
            envVars[key] = value
            console.log(`   Line ${index + 1}: ${key} = ${value.substring(0, 20)}...`)
          }
        }
      }
    })
    
    console.log('🔑 Successfully loaded env keys:', Object.keys(envVars))
    return envVars
  } catch (error) {
    console.error('❌ Could not load .env.local file:', error)
    return {}
  }
}

class InvoiceAnalyticsAnalyzer {
  private supabase: ReturnType<typeof createClient>
  private invoices: Invoice[] = []
  private invoiceDetails: InvoiceDetail[] = []

  constructor() {
    // Load environment variables
    const envVars = loadEnvFile()
    const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY

    console.log('🔍 Environment check:')
    console.log(`   URL: ${supabaseUrl || 'NOT SET'}`)
    console.log(`   KEY: ${supabaseKey ? `${supabaseKey.substring(0, 20)}...` : 'NOT SET'}`)
    console.log(`   Using: ${envVars.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE_KEY' : 'PUBLISHABLE_OR_ANON_KEY'}`)

    if (!supabaseUrl || !supabaseKey) {
      console.error('Available env vars:', Object.keys(envVars))
      throw new Error('Missing Supabase configuration in .env.local')
    }

    this.supabase = createClient(supabaseUrl, supabaseKey)
    
    console.log('🚀 Invoice Analytics Analyzer khởi tạo thành công!')
    console.log(`📅 Ngày phân tích: ${new Date().toLocaleString('vi-VN')}`)
    console.log('=' .repeat(80))
  }

  /**
   * Lấy tất cả dữ liệu cần thiết từ Supabase
   */
  async fetchData(): Promise<void> {
    console.log('\n📊 Đang lấy dữ liệu từ Supabase...')

    try {
      // Lấy invoices
      console.log('🧾 Lấy invoices...')
      const { data: invoicesData, error: invoicesError } = await this.supabase
        .from('invoices')
        .select('*')
        .order('invoice_date', { ascending: false })

      if (invoicesError) {
        throw new Error(`Lỗi khi lấy invoices: ${invoicesError.message}`)
      }

      this.invoices = (invoicesData || []) as unknown as Invoice[]
      console.log(`✅ Đã lấy ${this.invoices.length} hóa đơn`)

      // Lấy invoice details
      console.log('📋 Lấy invoice details...')
      const { data: detailsData, error: detailsError } = await this.supabase
        .from('invoice_details')
        .select('*')
        .order('invoice_date', { ascending: false })

      if (detailsError) {
        throw new Error(`Lỗi khi lấy invoice details: ${detailsError.message}`)
      }

      this.invoiceDetails = (detailsData || []) as unknown as InvoiceDetail[]
      console.log(`✅ Đã lấy ${this.invoiceDetails.length} chi tiết hóa đơn`)

      if (this.invoices.length === 0) {
        console.warn('⚠️  Không có dữ liệu hóa đơn trong database!')
        return
      }

      // Hiển thị sample data
      console.log('\n🔍 Sample dữ liệu (5 hóa đơn đầu):')
      this.invoices.slice(0, 5).forEach((invoice, index) => {
        console.log(`   ${index + 1}. ${invoice.invoice_code || 'N/A'} - ${invoice.customer_name || 'N/A'}`)
        console.log(`      💰 Số tiền: ${(invoice.total_amount || 0).toLocaleString('vi-VN')} VND`)
        console.log(`      📅 Ngày: ${invoice.invoice_date || 'N/A'}`)
      })

    } catch (error) {
      console.error('❌ Lỗi khi lấy dữ liệu:', error)
      throw error
    }
  }

  /**
   * Tính toán các thống kê chi tiết
   */
  calculateStats(): InvoiceStats {
    console.log('\n📈 Bắt đầu tính toán thống kê...')

    if (this.invoices.length === 0) {
      throw new Error('Không có dữ liệu hóa đơn để phân tích')
    }

    // 1. Thống kê cơ bản
    console.log('1️⃣ Thống kê cơ bản...')
    const totalInvoices = this.invoices.length
    const totalRevenue = this.invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
    const totalProfit = this.invoiceDetails.reduce((sum, detail) => sum + (detail.profit_amount || 0), 0)
    const averageOrderValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0
    const averageProfit = this.invoiceDetails.length > 0 ? totalProfit / this.invoiceDetails.length : 0
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

    // 2. Top customers analysis
    console.log('2️⃣ Phân tích khách hàng...')
    const customerMap = new Map<string, {
      customer_id: number | null
      customer_name: string
      total_orders: number
      total_revenue: number
      total_profit: number
    }>()
    this.invoices.forEach(invoice => {
      const key = `${invoice.customer_id}_${invoice.customer_name}`
      if (customerMap.has(key)) {
        const existing = customerMap.get(key)!
        existing.total_orders += 1
        existing.total_revenue += invoice.total_amount || 0
      } else {
        customerMap.set(key, {
          customer_id: invoice.customer_id,
          customer_name: invoice.customer_name || 'Unknown',
          total_orders: 1,
          total_revenue: invoice.total_amount || 0,
          total_profit: 0
        })
      }
    })

    // Add profit to customers
    this.invoiceDetails.forEach(detail => {
      for (const [mapKey, customer] of customerMap.entries()) {
        if (mapKey.includes(detail.customer_name)) {
          customer.total_profit += detail.profit_amount || 0
          break
        }
      }
    })

    const topCustomers = Array.from(customerMap.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 20)

    // 3. Top products analysis
    console.log('3️⃣ Phân tích sản phẩm...')
    const productMap = new Map<string, {
      product_id: number | null
      product_name: string
      product_code: string
      total_quantity: number
      total_revenue: number
      total_profit: number
    }>()
    this.invoiceDetails.forEach(detail => {
      const key = `${detail.product_id}_${detail.product_name}`
      if (productMap.has(key)) {
        const existing = productMap.get(key)!
        existing.total_quantity += detail.quantity || 0
        existing.total_revenue += detail.total_amount || 0
        existing.total_profit += detail.profit_amount || 0
      } else {
        productMap.set(key, {
          product_id: detail.product_id,
          product_name: detail.product_name || 'Unknown',
          product_code: detail.product_code || 'N/A',
          total_quantity: detail.quantity || 0,
          total_revenue: detail.total_amount || 0,
          total_profit: detail.profit_amount || 0
        })
      }
    })

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 20)

    // 4. Payment methods analysis
    console.log('4️⃣ Phân tích phương thức thanh toán...')
    const paymentMethods = {
      cash: this.invoiceDetails.reduce((sum, detail) => sum + (detail.cash_payment || 0), 0),
      card: this.invoiceDetails.reduce((sum, detail) => sum + (detail.card_payment || 0), 0),
      transfer: this.invoiceDetails.reduce((sum, detail) => sum + (detail.transfer_payment || 0), 0),
      wallet: this.invoiceDetails.reduce((sum, detail) => sum + (detail.wallet_payment || 0), 0),
      points: this.invoiceDetails.reduce((sum, detail) => sum + (detail.points_payment || 0), 0)
    }

    // 5. Monthly trends
    console.log('5️⃣ Xu hướng theo tháng...')
    const monthMap = new Map<string, {
      month: string
      total_orders: number
      total_revenue: number
      total_profit: number
      avg_order_value: number
    }>()
    this.invoices.forEach(invoice => {
      const date = new Date(invoice.invoice_date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      
      if (monthMap.has(monthKey)) {
        const existing = monthMap.get(monthKey)!
        existing.total_orders += 1
        existing.total_revenue += invoice.total_amount || 0
      } else {
        monthMap.set(monthKey, {
          month: monthKey,
          total_orders: 1,
          total_revenue: invoice.total_amount || 0,
          total_profit: 0,
          avg_order_value: 0
        })
      }
    })

    // Add profit to monthly trends
    this.invoiceDetails.forEach(detail => {
      const date = new Date(detail.invoice_date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (monthMap.has(monthKey)) {
        monthMap.get(monthKey)!.total_profit += detail.profit_amount || 0
      }
    })

    const monthlyTrends = Array.from(monthMap.values())
      .map(month => ({
        ...month,
        avg_order_value: month.total_orders > 0 ? month.total_revenue / month.total_orders : 0
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // 6. Branch performance
    console.log('6️⃣ Hiệu suất chi nhánh...')
    const branchMap = new Map<number, {
      branch_id: number
      total_orders: number
      total_revenue: number
      total_profit: number
    }>()
    this.invoices.forEach(invoice => {
      const branchId = invoice.branch_id
      if (branchMap.has(branchId)) {
        const existing = branchMap.get(branchId)!
        existing.total_orders += 1
        existing.total_revenue += invoice.total_amount || 0
      } else {
        branchMap.set(branchId, {
          branch_id: branchId,
          total_orders: 1,
          total_revenue: invoice.total_amount || 0,
          total_profit: 0
        })
      }
    })

    // Add profit to branches
    this.invoiceDetails.forEach(detail => {
      const branchId = detail.branch_id
      if (branchMap.has(branchId)) {
        branchMap.get(branchId)!.total_profit += detail.profit_amount || 0
      }
    })

    const branchPerformance = Array.from(branchMap.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)

    return {
      totalInvoices,
      totalRevenue,
      totalProfit,
      averageOrderValue,
      averageProfit,
      profitMargin,
      topCustomers,
      topProducts,
      paymentMethods,
      monthlyTrends,
      branchPerformance
    }
  }

  /**
   * Hiển thị kết quả thống kê
   */
  displayStats(stats: InvoiceStats): void {
    console.log('\n' + '=' .repeat(80))
    console.log('📊 KẾT QUẢ PHÂN TÍCH THỐNG KÊ HÓA ĐƠN')
    console.log('=' .repeat(80))

    // 1. Tổng quan
    console.log('\n1️⃣ TỔNG QUAN:')
    console.log(`   📋 Tổng số hóa đơn: ${stats.totalInvoices.toLocaleString('vi-VN')}`)
    console.log(`   💰 Tổng doanh thu: ${Math.round(stats.totalRevenue).toLocaleString('vi-VN')} VND`)
    console.log(`   💹 Tổng lợi nhuận: ${Math.round(stats.totalProfit).toLocaleString('vi-VN')} VND`)
    console.log(`   📊 Giá trị đơn hàng TB: ${Math.round(stats.averageOrderValue).toLocaleString('vi-VN')} VND`)
    console.log(`   📈 Tỷ suất lợi nhuận: ${stats.profitMargin.toFixed(2)}%`)

    // 2. Top 10 khách hàng
    console.log('\n2️⃣ TOP 10 KHÁCH HÀNG THEO DOANH THU:')
    stats.topCustomers.slice(0, 10).forEach((customer, index) => {
      console.log(`   ${(index + 1).toString().padStart(2, ' ')}. ${customer.customer_name}`)
      console.log(`       💰 ${customer.total_revenue.toLocaleString('vi-VN')} VND | 🛒 ${customer.total_orders} đơn | 💹 ${customer.total_profit.toLocaleString('vi-VN')} VND`)
    })

    // 3. Top 10 sản phẩm
    console.log('\n3️⃣ TOP 10 SẢN PHẨM THEO DOANH THU:')
    stats.topProducts.slice(0, 10).forEach((product, index) => {
      console.log(`   ${(index + 1).toString().padStart(2, ' ')}. ${product.product_name} (${product.product_code})`)
      console.log(`       💰 ${product.total_revenue.toLocaleString('vi-VN')} VND | 📦 ${product.total_quantity} | 💹 ${product.total_profit.toLocaleString('vi-VN')} VND`)
    })

    // 4. Phương thức thanh toán
    console.log('\n4️⃣ PHƯƠNG THỨC THANH TOÁN:')
    const totalPayments = Object.values(stats.paymentMethods).reduce((sum, val) => sum + val, 0)
    Object.entries(stats.paymentMethods).forEach(([method, amount]) => {
      const percentage = totalPayments > 0 ? (amount / totalPayments * 100).toFixed(1) : '0.0'
      const methodName = {
        cash: 'Tiền mặt',
        card: 'Thẻ',
        transfer: 'Chuyển khoản',
        wallet: 'Ví điện tử',
        points: 'Điểm'
      }[method] || method
      console.log(`   💳 ${methodName}: ${Math.round(amount).toLocaleString('vi-VN')} VND (${percentage}%)`)
    })

    // 5. Hiệu suất chi nhánh
    console.log('\n5️⃣ HIỆU SUẤT CHI NHÁNH:')
    stats.branchPerformance.forEach((branch) => {
      console.log(`   🏢 Chi nhánh ${branch.branch_id}: ${branch.total_revenue.toLocaleString('vi-VN')} VND (${branch.total_orders} đơn)`)
    })

    // 6. Xu hướng 6 tháng gần nhất
    console.log('\n6️⃣ XU HƯỚNG 6 THÁNG GẦN NHẤT:')
    stats.monthlyTrends.slice(-6).forEach(month => {
      console.log(`   📅 ${month.month}: ${month.total_revenue.toLocaleString('vi-VN')} VND (${month.total_orders} đơn, AOV: ${Math.round(month.avg_order_value).toLocaleString('vi-VN')} VND)`)
    })
  }

  /**
   * Xuất báo cáo ra file
   */
  exportReport(stats: InvoiceStats): void {
    console.log('\n📝 Đang xuất báo cáo...')

    try {
      // Tạo thư mục nếu chưa có
      const outputDir = './docs'
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      // Tạo báo cáo Markdown
      const markdownReport = `# Invoice Analytics Report - Xuân Thùy Pet Pharmacy

**Generated:** ${new Date().toLocaleString('vi-VN')}  
**Total Invoices Analyzed:** ${stats.totalInvoices.toLocaleString('vi-VN')}

## 📊 Executive Summary

| Metric | Value |
|--------|-------|
| **Total Invoices** | ${stats.totalInvoices.toLocaleString('vi-VN')} |
| **Total Revenue** | ${Math.round(stats.totalRevenue).toLocaleString('vi-VN')} VND |
| **Total Profit** | ${Math.round(stats.totalProfit).toLocaleString('vi-VN')} VND |
| **Average Order Value** | ${Math.round(stats.averageOrderValue).toLocaleString('vi-VN')} VND |
| **Profit Margin** | ${stats.profitMargin.toFixed(2)}% |

## 🏆 Top 10 Customers by Revenue

${stats.topCustomers.slice(0, 10).map((customer, index) => 
  `${index + 1}. **${customer.customer_name}** - ${customer.total_revenue.toLocaleString('vi-VN')} VND (${customer.total_orders} orders)`
).join('\n')}

## 📦 Top 10 Products by Revenue

${stats.topProducts.slice(0, 10).map((product, index) => 
  `${index + 1}. **${product.product_name}** (${product.product_code}) - ${product.total_revenue.toLocaleString('vi-VN')} VND (${product.total_quantity} units)`
).join('\n')}

## 💳 Payment Methods Distribution

- **Cash:** ${Math.round(stats.paymentMethods.cash).toLocaleString('vi-VN')} VND
- **Card:** ${Math.round(stats.paymentMethods.card).toLocaleString('vi-VN')} VND
- **Transfer:** ${Math.round(stats.paymentMethods.transfer).toLocaleString('vi-VN')} VND
- **E-Wallet:** ${Math.round(stats.paymentMethods.wallet).toLocaleString('vi-VN')} VND
- **Points:** ${Math.round(stats.paymentMethods.points).toLocaleString('vi-VN')} VND

## 🏢 Branch Performance

${stats.branchPerformance.map((branch, index) => 
  `${index + 1}. **Branch ${branch.branch_id}** - ${branch.total_revenue.toLocaleString('vi-VN')} VND (${branch.total_orders} orders)`
).join('\n')}

## 📈 Monthly Revenue Trends (Last 6 Months)

${stats.monthlyTrends.slice(-6).map(month => 
  `- **${month.month}**: ${month.total_revenue.toLocaleString('vi-VN')} VND (${month.total_orders} orders, AOV: ${Math.round(month.avg_order_value).toLocaleString('vi-VN')} VND)`
).join('\n')}

## 🎯 Implementation Guidelines

### Essential Dashboard Components:
1. **Invoice List Table** - Comprehensive invoice listing with filters
2. **Revenue Analytics** - Monthly/quarterly revenue trends
3. **Customer Insights** - Top customers and purchase patterns
4. **Product Performance** - Best-selling products analysis
5. **Payment Analytics** - Payment method preferences
6. **Branch Comparison** - Multi-location performance metrics

### Key Features to Implement:
- **Advanced Filtering**: Date range, customer, product, payment method, branch
- **Real-time KPIs**: Revenue, profit margin, average order value
- **Interactive Charts**: Monthly trends, payment distribution, top performers
- **Export Capabilities**: PDF reports, Excel exports for detailed analysis

---
*Report generated automatically by Invoice Analytics Analyzer*
`

      const markdownPath = path.join(outputDir, 'INVOICE_ANALYTICS_DOCUMENTATION.md')
      writeFileSync(markdownPath, markdownReport, 'utf-8')

      console.log(`✅ Báo cáo Markdown: ${markdownPath}`)

    } catch (error) {
      console.error('❌ Lỗi khi xuất báo cáo:', error)
    }
  }

  /**
   * Chạy toàn bộ phân tích
   */
  async runAnalysis(): Promise<void> {
    try {
      console.log('🎯 BẮT ĐẦU PHÂN TÍCH THỐNG KÊ HÓA ĐƠN')
      
      // Lấy dữ liệu
      await this.fetchData()
      
      // Tính toán thống kê
      const stats = this.calculateStats()
      
      // Hiển thị kết quả
      this.displayStats(stats)
      
      // Xuất báo cáo
      this.exportReport(stats)
      
      console.log('\n' + '=' .repeat(80))
      console.log('🎉 HOÀN THÀNH PHÂN TÍCH!')
      console.log(`📊 Đã phân tích ${stats.totalInvoices.toLocaleString('vi-VN')} hóa đơn`)
      console.log(`💰 Tổng doanh thu: ${Math.round(stats.totalRevenue).toLocaleString('vi-VN')} VND`)
      console.log(`💹 Tổng lợi nhuận: ${Math.round(stats.totalProfit).toLocaleString('vi-VN')} VND`)
      console.log(`📁 Báo cáo: ./docs/INVOICE_ANALYTICS_DOCUMENTATION.md`)
      console.log('🚀 Sẵn sàng cho: /dashboard/invoices implementation')
      console.log('=' .repeat(80))
      
    } catch (error) {
      console.error('\n❌ PHÂN TÍCH THẤT BẠI:', error)
      process.exit(1)
    }
  }
}

// Chạy phân tích
async function main() {
  try {
    const analyzer = new InvoiceAnalyticsAnalyzer()
    await analyzer.runAnalysis()
  } catch (error) {
    console.error('❌ Lỗi khởi tạo:', error)
    process.exit(1)
  }
}

// Execute
if (require.main === module) {
  main().catch(console.error)
}

export default InvoiceAnalyticsAnalyzer
