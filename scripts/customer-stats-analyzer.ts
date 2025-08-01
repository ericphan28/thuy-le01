/**
 * Customer Statistics Analyzer - Xuân Thùy Pet Pharmacy
 * Phân tích thống kê chi tiết khách hàng từ Supabase database
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { mkdirSync, existsSync } from 'fs'
import path from 'path'

interface Customer {
  customer_id: number
  customer_code: string
  customer_name: string
  customer_type_id: number
  branch_created_id: number
  phone?: string
  email?: string
  address?: string
  company_name?: string
  tax_code?: string
  id_number?: string
  gender?: string
  debt_limit: number
  current_debt: number
  total_revenue: number
  total_profit: number
  purchase_count: number
  last_purchase_date?: string
  status: number
  notes?: string
  created_by: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface CustomerType {
  type_id: number
  type_code: string
  type_name: string
  description: string
  is_active: boolean
  created_at: string
}

interface CustomerStats {
  totalCustomers: number
  activeCustomers: number
  inactiveCustomers: number
  totalRevenue: number
  averageRevenue: number
  medianRevenue: number
  maxRevenue: number
  minRevenue: number
  totalDebt: number
  averageDebt: number
  customersWithDebt: number
  debtViolations: number
  dataQuality: {
    phoneCompleteness: number
    emailCompleteness: number
    addressCompleteness: number
    genderCompleteness: number
  }
  demographics: {
    genderDistribution: Record<string, number>
    typeDistribution: Record<string, number>
    branchDistribution: Record<string, number>
    createdByDistribution: Record<string, number>
  }
  revenueSegments: {
    noRevenue: number
    lowRevenue: number      // < 1M
    mediumRevenue: number   // 1M - 10M
    highRevenue: number     // 10M - 50M
    vipRevenue: number      // > 50M
  }
  monthlyTrends: {
    newCustomersLast30Days: number
    newCustomersLast90Days: number
    newCustomersLast365Days: number
  }
  topCustomers: Array<{
    customer_id: number
    customer_code: string
    customer_name: string
    total_revenue: number
    customer_type: string
    purchase_count: number
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

class CustomerStatsAnalyzer {
  private supabase: ReturnType<typeof createClient>
  private customers: Customer[] = []
  private customerTypes: CustomerType[] = []

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
    
    console.log('🚀 Customer Statistics Analyzer khởi tạo thành công!')
    console.log(`📅 Ngày phân tích: ${new Date().toLocaleString('vi-VN')}`)
    console.log('=' .repeat(80))
  }

  /**
   * Lấy tất cả dữ liệu cần thiết từ Supabase
   */
  async fetchData(): Promise<void> {
    console.log('\n📊 Đang lấy dữ liệu từ Supabase...')

    try {
      // Lấy customer types
      console.log('🏷️  Lấy customer types...')
      const { data: typesData, error: typesError } = await this.supabase
        .from('customer_types')
        .select('*')
        .order('type_id')

      if (typesError) {
        console.warn('⚠️  Không thể lấy customer_types:', typesError.message)
        this.customerTypes = []
      } else {
        this.customerTypes = (typesData || []) as unknown as CustomerType[]
        console.log(`✅ Đã lấy ${this.customerTypes.length} loại khách hàng`)
      }

      // Lấy tất cả customers
      console.log('👥 Lấy dữ liệu customers...')
      const { data: customersData, error: customersError } = await this.supabase
        .from('customers')
        .select('*')
        .order('customer_id')

      if (customersError) {
        throw new Error(`Lỗi khi lấy customers: ${customersError.message}`)
      }

      this.customers = (customersData || []) as unknown as Customer[]
      console.log(`✅ Đã lấy ${this.customers.length} khách hàng`)

      if (this.customers.length === 0) {
        console.warn('⚠️  Không có dữ liệu khách hàng trong database!')
        return
      }

      // Hiển thị sample data
      console.log('\n🔍 Sample dữ liệu (5 khách hàng đầu):')
      this.customers.slice(0, 5).forEach((customer, index) => {
        console.log(`   ${index + 1}. ${customer.customer_name || 'N/A'} (${customer.customer_code || 'N/A'})`)
        console.log(`      💰 Doanh thu: ${(customer.total_revenue || 0).toLocaleString('vi-VN')} VND`)
        console.log(`      📞 SĐT: ${customer.phone || 'N/A'} | 📧 Email: ${customer.email || 'N/A'}`)
      })

    } catch (error) {
      console.error('❌ Lỗi khi lấy dữ liệu:', error)
      throw error
    }
  }

  /**
   * Tính toán các thống kê chi tiết
   */
  calculateStats(): CustomerStats {
    console.log('\n📈 Bắt đầu tính toán thống kê...')

    if (this.customers.length === 0) {
      throw new Error('Không có dữ liệu khách hàng để phân tích')
    }

    // 1. Thống kê cơ bản
    console.log('1️⃣ Thống kê cơ bản...')
    const totalCustomers = this.customers.length
    const activeCustomers = this.customers.filter(c => c.is_active).length
    const inactiveCustomers = totalCustomers - activeCustomers

    // 2. Thống kê doanh thu
    console.log('2️⃣ Thống kê doanh thu...')
    const revenues = this.customers.map(c => c.total_revenue || 0).sort((a, b) => a - b)
    const totalRevenue = revenues.reduce((sum, rev) => sum + rev, 0)
    const averageRevenue = revenues.length > 0 ? totalRevenue / revenues.length : 0
    const medianRevenue = revenues.length > 0 ? revenues[Math.floor(revenues.length / 2)] : 0
    const maxRevenue = revenues.length > 0 ? Math.max(...revenues) : 0
    const minRevenue = revenues.length > 0 ? Math.min(...revenues) : 0

    // 3. Thống kê công nợ
    console.log('3️⃣ Thống kê công nợ...')
    const debts = this.customers.map(c => c.current_debt || 0)
    const totalDebt = debts.reduce((sum, debt) => sum + debt, 0)
    const customersWithDebt = this.customers.filter(c => (c.current_debt || 0) > 0).length
    const averageDebt = customersWithDebt > 0 ? totalDebt / customersWithDebt : 0
    const debtViolations = this.customers.filter(c => 
      (c.current_debt || 0) > (c.debt_limit || 0) && (c.debt_limit || 0) > 0
    ).length

    // 4. Chất lượng dữ liệu
    console.log('4️⃣ Đánh giá chất lượng dữ liệu...')
    const phoneCompleteness = (this.customers.filter(c => c.phone && c.phone.trim()).length / totalCustomers) * 100
    const emailCompleteness = (this.customers.filter(c => c.email && c.email.trim()).length / totalCustomers) * 100
    const addressCompleteness = (this.customers.filter(c => c.address && c.address.trim()).length / totalCustomers) * 100
    const genderCompleteness = (this.customers.filter(c => c.gender && c.gender.trim()).length / totalCustomers) * 100

    // 5. Phân bố nhân khẩu học
    console.log('5️⃣ Phân tích nhân khẩu học...')
    
    // Gender distribution
    const genderDistribution: Record<string, number> = {}
    this.customers.forEach(c => {
      const gender = c.gender || 'Không xác định'
      genderDistribution[gender] = (genderDistribution[gender] || 0) + 1
    })

    // Type distribution
    const typeDistribution: Record<string, number> = {}
    this.customers.forEach(c => {
      const type = this.customerTypes.find(t => t.type_id === c.customer_type_id)
      const typeName = type ? type.type_name : `Type ${c.customer_type_id}`
      typeDistribution[typeName] = (typeDistribution[typeName] || 0) + 1
    })

    // Branch distribution
    const branchDistribution: Record<string, number> = {}
    this.customers.forEach(c => {
      const branch = `Chi nhánh ${c.branch_created_id || 'Unknown'}`
      branchDistribution[branch] = (branchDistribution[branch] || 0) + 1
    })

    // Created by distribution
    const createdByDistribution: Record<string, number> = {}
    this.customers.forEach(c => {
      const creator = c.created_by || 'Unknown'
      createdByDistribution[creator] = (createdByDistribution[creator] || 0) + 1
    })

    // 6. Phân khúc doanh thu
    console.log('6️⃣ Phân khúc doanh thu...')
    const revenueSegments = {
      noRevenue: this.customers.filter(c => (c.total_revenue || 0) === 0).length,
      lowRevenue: this.customers.filter(c => (c.total_revenue || 0) > 0 && (c.total_revenue || 0) < 1000000).length,
      mediumRevenue: this.customers.filter(c => (c.total_revenue || 0) >= 1000000 && (c.total_revenue || 0) < 10000000).length,
      highRevenue: this.customers.filter(c => (c.total_revenue || 0) >= 10000000 && (c.total_revenue || 0) < 50000000).length,
      vipRevenue: this.customers.filter(c => (c.total_revenue || 0) >= 50000000).length
    }

    // 7. Xu hướng theo thời gian
    console.log('7️⃣ Xu hướng thời gian...')
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000))
    const oneYearAgo = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000))

    const newCustomersLast30Days = this.customers.filter(c => 
      new Date(c.created_at) >= thirtyDaysAgo
    ).length
    const newCustomersLast90Days = this.customers.filter(c => 
      new Date(c.created_at) >= ninetyDaysAgo
    ).length
    const newCustomersLast365Days = this.customers.filter(c => 
      new Date(c.created_at) >= oneYearAgo
    ).length

    // 8. Top customers
    console.log('8️⃣ Top khách hàng...')
    const topCustomers = this.customers
      .filter(c => (c.total_revenue || 0) > 0)
      .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))
      .slice(0, 20)
      .map(c => ({
        customer_id: c.customer_id,
        customer_code: c.customer_code || '',
        customer_name: c.customer_name || '',
        total_revenue: c.total_revenue || 0,
        customer_type: this.customerTypes.find(t => t.type_id === c.customer_type_id)?.type_name || 'Unknown',
        purchase_count: c.purchase_count || 0
      }))

    return {
      totalCustomers,
      activeCustomers,
      inactiveCustomers,
      totalRevenue,
      averageRevenue,
      medianRevenue,
      maxRevenue,
      minRevenue,
      totalDebt,
      averageDebt,
      customersWithDebt,
      debtViolations,
      dataQuality: {
        phoneCompleteness,
        emailCompleteness,
        addressCompleteness,
        genderCompleteness
      },
      demographics: {
        genderDistribution,
        typeDistribution,
        branchDistribution,
        createdByDistribution
      },
      revenueSegments,
      monthlyTrends: {
        newCustomersLast30Days,
        newCustomersLast90Days,
        newCustomersLast365Days
      },
      topCustomers
    }
  }

  /**
   * Hiển thị kết quả thống kê
   */
  displayStats(stats: CustomerStats): void {
    console.log('\n' + '=' .repeat(80))
    console.log('📊 KẾT QUẢ PHÂN TÍCH THỐNG KÊ KHÁCH HÀNG')
    console.log('=' .repeat(80))

    // 1. Tổng quan
    console.log('\n1️⃣ TỔNG QUAN:')
    console.log(`   📋 Tổng số khách hàng: ${stats.totalCustomers.toLocaleString('vi-VN')}`)
    console.log(`   ✅ Đang hoạt động: ${stats.activeCustomers.toLocaleString('vi-VN')} (${(stats.activeCustomers/stats.totalCustomers*100).toFixed(1)}%)`)
    console.log(`   ❌ Không hoạt động: ${stats.inactiveCustomers.toLocaleString('vi-VN')} (${(stats.inactiveCustomers/stats.totalCustomers*100).toFixed(1)}%)`)

    // 2. Doanh thu
    console.log('\n2️⃣ DOANH THU:')
    console.log(`   💰 Tổng doanh thu: ${Math.round(stats.totalRevenue).toLocaleString('vi-VN')} VND`)
    console.log(`   📊 Doanh thu trung bình: ${Math.round(stats.averageRevenue).toLocaleString('vi-VN')} VND`)
    console.log(`   📈 Doanh thu trung vị: ${Math.round(stats.medianRevenue).toLocaleString('vi-VN')} VND`)
    console.log(`   🏆 Doanh thu cao nhất: ${Math.round(stats.maxRevenue).toLocaleString('vi-VN')} VND`)
    console.log(`   📉 Doanh thu thấp nhất: ${Math.round(stats.minRevenue).toLocaleString('vi-VN')} VND`)

    // 3. Công nợ
    console.log('\n3️⃣ CÔNG NỢ:')
    console.log(`   💸 Tổng công nợ: ${Math.round(stats.totalDebt).toLocaleString('vi-VN')} VND`)
    console.log(`   📊 Số KH có công nợ: ${stats.customersWithDebt.toLocaleString('vi-VN')} (${(stats.customersWithDebt/stats.totalCustomers*100).toFixed(1)}%)`)
    console.log(`   📈 Công nợ trung bình: ${Math.round(stats.averageDebt).toLocaleString('vi-VN')} VND`)
    if (stats.debtViolations > 0) {
      console.log(`   ⚠️  Vi phạm hạn mức: ${stats.debtViolations} khách hàng`)
    }

    // 4. Chất lượng dữ liệu
    console.log('\n4️⃣ CHẤT LƯỢNG DỮ LIỆU:')
    const getQualityIcon = (percentage: number) => percentage > 80 ? '🟢' : percentage > 50 ? '🟡' : '🔴'
    console.log(`   📞 Điện thoại: ${stats.dataQuality.phoneCompleteness.toFixed(1)}% ${getQualityIcon(stats.dataQuality.phoneCompleteness)}`)
    console.log(`   📧 Email: ${stats.dataQuality.emailCompleteness.toFixed(1)}% ${getQualityIcon(stats.dataQuality.emailCompleteness)}`)
    console.log(`   🏠 Địa chỉ: ${stats.dataQuality.addressCompleteness.toFixed(1)}% ${getQualityIcon(stats.dataQuality.addressCompleteness)}`)
    console.log(`   👤 Giới tính: ${stats.dataQuality.genderCompleteness.toFixed(1)}% ${getQualityIcon(stats.dataQuality.genderCompleteness)}`)

    // 5. Phân khúc doanh thu
    console.log('\n5️⃣ PHÂN KHÚC DOANH THU:')
    console.log(`   🚫 Không có doanh thu: ${stats.revenueSegments.noRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.noRevenue/stats.totalCustomers*100).toFixed(1)}%)`)
    console.log(`   🥉 Thấp (<1M): ${stats.revenueSegments.lowRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.lowRevenue/stats.totalCustomers*100).toFixed(1)}%)`)
    console.log(`   🥈 Trung bình (1M-10M): ${stats.revenueSegments.mediumRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.mediumRevenue/stats.totalCustomers*100).toFixed(1)}%)`)
    console.log(`   🥇 Cao (10M-50M): ${stats.revenueSegments.highRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.highRevenue/stats.totalCustomers*100).toFixed(1)}%)`)
    console.log(`   💎 VIP (>50M): ${stats.revenueSegments.vipRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.vipRevenue/stats.totalCustomers*100).toFixed(1)}%)`)

    // 6. Xu hướng thời gian
    console.log('\n6️⃣ XU HƯỚNG THỜI GIAN:')
    console.log(`   📅 KH mới 30 ngày: ${stats.monthlyTrends.newCustomersLast30Days.toLocaleString('vi-VN')}`)
    console.log(`   📅 KH mới 90 ngày: ${stats.monthlyTrends.newCustomersLast90Days.toLocaleString('vi-VN')}`)
    console.log(`   📅 KH mới 1 năm: ${stats.monthlyTrends.newCustomersLast365Days.toLocaleString('vi-VN')}`)

    // 7. Top 10 khách hàng
    console.log('\n7️⃣ TOP 10 KHÁCH HÀNG THEO DOANH THU:')
    stats.topCustomers.slice(0, 10).forEach((customer, index) => {
      console.log(`   ${(index + 1).toString().padStart(2, ' ')}. ${customer.customer_name} (${customer.customer_code})`)
      console.log(`       💰 ${customer.total_revenue.toLocaleString('vi-VN')} VND | 🛒 ${customer.purchase_count} đơn | 🏷️  ${customer.customer_type}`)
    })

    // 8. Phân bố giới tính (top 5)
    console.log('\n8️⃣ PHÂN BỐ GIỚI TÍNH:')
    Object.entries(stats.demographics.genderDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([gender, count]) => {
        const percentage = (count / stats.totalCustomers * 100).toFixed(1)
        console.log(`   👤 ${gender}: ${count.toLocaleString('vi-VN')} (${percentage}%)`)
      })

    // 9. Phân bố loại khách hàng
    console.log('\n9️⃣ PHÂN BỐ LOẠI KHÁCH HÀNG:')
    Object.entries(stats.demographics.typeDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        const percentage = (count / stats.totalCustomers * 100).toFixed(1)
        console.log(`   🏷️  ${type}: ${count.toLocaleString('vi-VN')} (${percentage}%)`)
      })
  }

  /**
   * Xuất báo cáo ra file
   */
  exportReport(stats: CustomerStats): void {
    console.log('\n📝 Đang xuất báo cáo...')

    try {
      // Tạo thư mục nếu chưa có
      const outputDir = './docs/api'
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      // Tạo báo cáo JSON
      const report = {
        metadata: {
          title: 'Customer Statistics Report - Xuân Thùy Pet Pharmacy',
          generatedAt: new Date().toISOString(),
          generatedBy: 'Customer Statistics Analyzer v1.0',
          totalCustomersAnalyzed: stats.totalCustomers
        },
        summary: {
          totalCustomers: stats.totalCustomers,
          activeCustomers: stats.activeCustomers,
          activeRate: `${(stats.activeCustomers/stats.totalCustomers*100).toFixed(1)}%`,
          totalRevenue: `${Math.round(stats.totalRevenue).toLocaleString('vi-VN')} VND`,
          averageRevenue: `${Math.round(stats.averageRevenue).toLocaleString('vi-VN')} VND`,
          totalDebt: `${Math.round(stats.totalDebt).toLocaleString('vi-VN')} VND`
        },
        detailedStats: stats,
        rawData: {
          topCustomers: stats.topCustomers,
          customerTypes: this.customerTypes
        }
      }

      const jsonPath = path.join(outputDir, 'customer-statistics-report.json')
      writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')

      // Tạo báo cáo Markdown
      const markdownReport = `# Customer Statistics Report - Xuân Thùy Pet Pharmacy

**Generated:** ${new Date().toLocaleString('vi-VN')}  
**Total Customers Analyzed:** ${stats.totalCustomers.toLocaleString('vi-VN')}

## 📊 Executive Summary

| Metric | Value |
|--------|-------|
| **Total Customers** | ${stats.totalCustomers.toLocaleString('vi-VN')} |
| **Active Customers** | ${stats.activeCustomers.toLocaleString('vi-VN')} (${(stats.activeCustomers/stats.totalCustomers*100).toFixed(1)}%) |
| **Total Revenue** | ${Math.round(stats.totalRevenue).toLocaleString('vi-VN')} VND |
| **Average Revenue** | ${Math.round(stats.averageRevenue).toLocaleString('vi-VN')} VND |
| **Total Debt** | ${Math.round(stats.totalDebt).toLocaleString('vi-VN')} VND |

## 🏆 Top 10 Customers

${stats.topCustomers.slice(0, 10).map((customer, index) => 
  `${index + 1}. **${customer.customer_name}** (${customer.customer_code}) - ${customer.total_revenue.toLocaleString('vi-VN')} VND`
).join('\n')}

## 📈 Revenue Segments

- **No Revenue:** ${stats.revenueSegments.noRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.noRevenue/stats.totalCustomers*100).toFixed(1)}%)
- **Low (<1M):** ${stats.revenueSegments.lowRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.lowRevenue/stats.totalCustomers*100).toFixed(1)}%)
- **Medium (1M-10M):** ${stats.revenueSegments.mediumRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.mediumRevenue/stats.totalCustomers*100).toFixed(1)}%)
- **High (10M-50M):** ${stats.revenueSegments.highRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.highRevenue/stats.totalCustomers*100).toFixed(1)}%)
- **VIP (>50M):** ${stats.revenueSegments.vipRevenue.toLocaleString('vi-VN')} (${(stats.revenueSegments.vipRevenue/stats.totalCustomers*100).toFixed(1)}%)

## 📊 Data Quality

- **Phone:** ${stats.dataQuality.phoneCompleteness.toFixed(1)}%
- **Email:** ${stats.dataQuality.emailCompleteness.toFixed(1)}%
- **Address:** ${stats.dataQuality.addressCompleteness.toFixed(1)}%
- **Gender:** ${stats.dataQuality.genderCompleteness.toFixed(1)}%

## 📅 Recent Trends

- **New Customers (30 days):** ${stats.monthlyTrends.newCustomersLast30Days.toLocaleString('vi-VN')}
- **New Customers (90 days):** ${stats.monthlyTrends.newCustomersLast90Days.toLocaleString('vi-VN')}
- **New Customers (1 year):** ${stats.monthlyTrends.newCustomersLast365Days.toLocaleString('vi-VN')}

---
*Report generated automatically by Customer Statistics Analyzer*
`

      const markdownPath = path.join(outputDir, 'CUSTOMER_STATISTICS.md')
      writeFileSync(markdownPath, markdownReport, 'utf-8')

      console.log(`✅ Báo cáo JSON: ${jsonPath}`)
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
      console.log('🎯 BẮT ĐẦU PHÂN TÍCH THỐNG KÊ KHÁCH HÀNG')
      
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
      console.log(`📊 Đã phân tích ${stats.totalCustomers.toLocaleString('vi-VN')} khách hàng`)
      console.log(`💰 Tổng doanh thu: ${Math.round(stats.totalRevenue).toLocaleString('vi-VN')} VND`)
      console.log(`📁 Báo cáo đã được lưu tại: ./docs/api/`)
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
    const analyzer = new CustomerStatsAnalyzer()
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

export default CustomerStatsAnalyzer
