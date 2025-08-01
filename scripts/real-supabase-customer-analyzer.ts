/**
 * Real-time Supabase Customer Data Analyzer - Xuân Thùy Pet Pharmacy
 * Kết nối trực tiếp với Supabase để phân tích dữ liệu khách hàng thực tế
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

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

interface Invoice {
  invoice_id: number
  invoice_code: string
  customer_id: number
  total_amount: number
  invoice_date: string
  created_at: string
}

interface SupabaseAnalysisResult {
  summary: {
    totalCustomers: number
    activeCustomers: number
    totalRevenue: number
    avgRevenue: number
    maxRevenue: number
    dataQuality: {
      phoneCompleteness: number
      emailCompleteness: number
      addressCompleteness: number
    }
  }
  demographics: {
    genderDistribution: Record<string, number>
    typeDistribution: Record<string, number>
    branchDistribution: Record<string, number>
  }
  businessMetrics: {
    revenueRanges: Record<string, number>
    debtAnalysis: {
      customersWithDebt: number
      totalDebt: number
      avgDebt: number
      debtViolations: number
    }
    topCustomers: Array<{
      customer_id: number
      name: string
      code: string
      revenue: number
      type: string
    }>
    recentActivity: {
      newCustomersThisMonth: number
      totalInvoicesThisMonth: number
      revenueThisMonth: number
    }
  }
}

class RealSupabaseAnalyzer {
  private supabase: ReturnType<typeof createClient>
  private outputDir = './docs/api'
  private customers: Customer[] = []
  private customerTypes: CustomerType[] = []
  private invoices: Invoice[] = []

  constructor() {
    console.log('🚀 Khởi tạo Real-time Supabase Customer Analyzer...')
    console.log(`📅 Ngày phân tích: ${new Date().toLocaleString('vi-VN')}`)
    console.log('=' .repeat(80))

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Thiếu thông tin cấu hình Supabase!')
      console.error('   Kiểm tra NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local')
      process.exit(1)
    }

    this.supabase = createClient(supabaseUrl, supabaseKey)
    console.log('✅ Đã kết nối Supabase client')
    console.log(`🔗 URL: ${supabaseUrl}`)
  }

  /**
   * Test kết nối Supabase
   */
  async testConnection(): Promise<void> {
    console.log('\n🔌 BƯỚC 1: Kiểm tra kết nối Supabase...')
    
    try {
      // Test với một query đơn giản
      const { error, count } = await this.supabase
        .from('customers')
        .select('customer_id', { count: 'exact', head: true })
        .limit(1)

      if (error) {
        console.error('❌ Lỗi kết nối Supabase:', error.message)
        console.error('   Chi tiết:', error)
        
        // Gợi ý các giải pháp
        console.log('\n💡 Gợi ý khắc phục:')
        console.log('   1. Kiểm tra URL và API key trong .env.local')
        console.log('   2. Đảm bảo RLS (Row Level Security) cho phép truy cập')
        console.log('   3. Kiểm tra quyền của API key đối với bảng customers')
        console.log('   4. Xác minh bảng customers tồn tại trong database')
        
        throw error
      }

      console.log(`✅ Kết nối thành công!`)
      console.log(`📊 Tổng số bản ghi customers: ${count || 'N/A'}`)
      
    } catch (error) {
      console.error('❌ Không thể kết nối với Supabase:', error)
      throw error
    }
  }

  /**
   * Lấy dữ liệu khách hàng từ Supabase
   */
  async fetchCustomerData(): Promise<void> {
    console.log('\n📊 BƯỚC 2: Lấy dữ liệu từ Supabase...')

    try {
      // Fetch customer types
      console.log('🏷️  Lấy dữ liệu customer_types...')
      const { data: customerTypesData, error: typesError } = await this.supabase
        .from('customer_types')
        .select('*')
        .order('type_id')

      if (typesError) {
        console.warn('⚠️  Không thể lấy customer_types:', typesError.message)
        this.customerTypes = []
      } else {
        this.customerTypes = (customerTypesData || []) as unknown as CustomerType[]
        console.log(`✅ Đã lấy ${this.customerTypes.length} loại khách hàng:`)
        this.customerTypes.forEach(type => {
          console.log(`   - ${type.type_code}: ${type.type_name}`)
        })
      }

      // Fetch customers
      console.log('\n👥 Lấy dữ liệu customers...')
      const { data: customersData, error: customersError } = await this.supabase
        .from('customers')
        .select('*')
        .order('customer_id')

      if (customersError) {
        console.error('❌ Lỗi khi lấy dữ liệu customers:', customersError.message)
        throw customersError
      }

      this.customers = (customersData || []) as unknown as Customer[]
      console.log(`✅ Đã lấy ${this.customers.length} khách hàng`)

      if (this.customers.length === 0) {
        console.warn('⚠️  Không có dữ liệu khách hàng trong database!')
        return
      }

      // Hiển thị thống kê cơ bản
      const activeCount = this.customers.filter(c => c.is_active).length
      const withRevenueCount = this.customers.filter(c => c.total_revenue > 0).length
      const totalRevenue = this.customers.reduce((sum, c) => sum + (c.total_revenue || 0), 0)

      console.log(`📈 Thống kê cơ bản:`)
      console.log(`   - Khách hàng đang hoạt động: ${activeCount}/${this.customers.length}`)
      console.log(`   - Khách hàng có doanh thu: ${withRevenueCount}`)
      console.log(`   - Tổng doanh thu: ${totalRevenue.toLocaleString('vi-VN')} VND`)

      // Sample một vài records để debug
      console.log('\n🔍 Mẫu dữ liệu (3 khách hàng đầu tiên):')
      this.customers.slice(0, 3).forEach((customer, index) => {
        console.log(`   ${index + 1}. ${customer.customer_name} (${customer.customer_code})`)
        console.log(`      📞 ${customer.phone || 'N/A'} | 💰 ${(customer.total_revenue || 0).toLocaleString('vi-VN')} VND`)
      })

      // Fetch recent invoices for activity analysis
      console.log('\n📋 Lấy dữ liệu invoices gần đây...')
      const oneMonthAgo = new Date()
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
      
      const { data: invoicesData, error: invoicesError } = await this.supabase
        .from('invoices')
        .select('invoice_id, invoice_code, customer_id, total_amount, invoice_date, created_at')
        .gte('created_at', oneMonthAgo.toISOString())
        .order('created_at', { ascending: false })

      if (invoicesError) {
        console.warn('⚠️  Không thể lấy dữ liệu invoices:', invoicesError.message)
        this.invoices = []
      } else {
        this.invoices = (invoicesData || []) as unknown as Invoice[]
        console.log(`✅ Đã lấy ${this.invoices.length} hóa đơn trong tháng qua`)
      }

    } catch (error) {
      console.error('❌ Lỗi khi lấy dữ liệu:', error)
      throw error
    }
  }

  /**
   * Phân tích chi tiết dữ liệu khách hàng
   */
  async analyzeCustomerData(): Promise<SupabaseAnalysisResult> {
    console.log('\n📊 BƯỚC 3: Phân tích chi tiết dữ liệu khách hàng...')

    if (this.customers.length === 0) {
      throw new Error('Không có dữ liệu khách hàng để phân tích')
    }

    // 1. Thống kê tổng quan
    console.log('\n1️⃣ Thống kê tổng quan:')
    const totalCustomers = this.customers.length
    const activeCustomers = this.customers.filter(c => c.is_active).length
    const totalRevenue = this.customers.reduce((sum, c) => sum + (c.total_revenue || 0), 0)
    const customersWithRevenue = this.customers.filter(c => (c.total_revenue || 0) > 0)
    const avgRevenue = customersWithRevenue.length > 0 ? totalRevenue / customersWithRevenue.length : 0
    const maxRevenue = Math.max(...this.customers.map(c => c.total_revenue || 0))

    console.log(`   📋 Tổng số khách hàng: ${totalCustomers.toLocaleString('vi-VN')}`)
    console.log(`   ✅ Khách hàng đang hoạt động: ${activeCustomers.toLocaleString('vi-VN')} (${(activeCustomers/totalCustomers*100).toFixed(1)}%)`)
    console.log(`   💰 Tổng doanh thu: ${totalRevenue.toLocaleString('vi-VN')} VND`)
    console.log(`   📈 Doanh thu trung bình: ${Math.round(avgRevenue).toLocaleString('vi-VN')} VND`)
    console.log(`   🏆 Doanh thu cao nhất: ${maxRevenue.toLocaleString('vi-VN')} VND`)

    // 2. Chất lượng dữ liệu
    console.log('\n2️⃣ Chất lượng dữ liệu:')
    const phoneCompleteness = this.customers.filter(c => c.phone && c.phone.trim()).length / totalCustomers * 100
    const emailCompleteness = this.customers.filter(c => c.email && c.email.trim()).length / totalCustomers * 100
    const addressCompleteness = this.customers.filter(c => c.address && c.address.trim()).length / totalCustomers * 100

    console.log(`   📞 Điện thoại: ${phoneCompleteness.toFixed(1)}% ${phoneCompleteness > 80 ? '🟢' : phoneCompleteness > 50 ? '🟡' : '🔴'}`)
    console.log(`   📧 Email: ${emailCompleteness.toFixed(1)}% ${emailCompleteness > 80 ? '🟢' : emailCompleteness > 50 ? '🟡' : '🔴'}`)
    console.log(`   🏠 Địa chỉ: ${addressCompleteness.toFixed(1)}% ${addressCompleteness > 80 ? '🟢' : addressCompleteness > 50 ? '🟡' : '🔴'}`)

    // 3. Phân bố nhân khẩu học
    console.log('\n3️⃣ Phân bố nhân khẩu học:')

    // Gender distribution
    const genderDistribution = this.customers.reduce((acc, customer) => {
      const gender = customer.gender || 'Không xác định'
      acc[gender] = (acc[gender] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('   👤 Phân bố giới tính:')
    Object.entries(genderDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([gender, count]) => {
        const percentage = (count / totalCustomers * 100).toFixed(1)
        console.log(`      ${gender}: ${count.toLocaleString('vi-VN')} (${percentage}%)`)
      })

    // Customer type distribution
    const typeDistribution = this.customers.reduce((acc, customer) => {
      const typeId = customer.customer_type_id
      const typeName = this.customerTypes.find(t => t.type_id === typeId)?.type_name || `Type ${typeId}`
      acc[typeName] = (acc[typeName] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('   🏷️  Phân bố loại khách hàng:')
    Object.entries(typeDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        const percentage = (count / totalCustomers * 100).toFixed(1)
        console.log(`      ${type}: ${count.toLocaleString('vi-VN')} (${percentage}%)`)
      })

    // Branch distribution
    const branchDistribution = this.customers.reduce((acc, customer) => {
      const branchId = customer.branch_created_id || 'Unknown'
      acc[`Chi nhánh ${branchId}`] = (acc[`Chi nhánh ${branchId}`] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('   🏢 Phân bố theo chi nhánh:')
    Object.entries(branchDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([branch, count]) => {
        const percentage = (count / totalCustomers * 100).toFixed(1)
        console.log(`      ${branch}: ${count.toLocaleString('vi-VN')} (${percentage}%)`)
      })

    // 4. Phân tích doanh thu
    console.log('\n4️⃣ Phân tích doanh thu:')
    const revenueRanges = {
      'Không có doanh thu': this.customers.filter(c => (c.total_revenue || 0) === 0).length,
      'Dưới 1 triệu': this.customers.filter(c => (c.total_revenue || 0) > 0 && (c.total_revenue || 0) < 1000000).length,
      '1-5 triệu': this.customers.filter(c => (c.total_revenue || 0) >= 1000000 && (c.total_revenue || 0) < 5000000).length,
      '5-20 triệu': this.customers.filter(c => (c.total_revenue || 0) >= 5000000 && (c.total_revenue || 0) < 20000000).length,
      '20-50 triệu': this.customers.filter(c => (c.total_revenue || 0) >= 20000000 && (c.total_revenue || 0) < 50000000).length,
      'Trên 50 triệu': this.customers.filter(c => (c.total_revenue || 0) >= 50000000).length
    }

    Object.entries(revenueRanges).forEach(([range, count]) => {
      const percentage = (count / totalCustomers * 100).toFixed(1)
      console.log(`   💰 ${range}: ${count.toLocaleString('vi-VN')} (${percentage}%)`)
    })

    // 5. Phân tích công nợ
    console.log('\n5️⃣ Phân tích công nợ:')
    const customersWithDebt = this.customers.filter(c => (c.current_debt || 0) > 0)
    const totalDebt = this.customers.reduce((sum, c) => sum + (c.current_debt || 0), 0)
    const avgDebt = customersWithDebt.length > 0 ? totalDebt / customersWithDebt.length : 0
    const debtViolations = this.customers.filter(c => (c.current_debt || 0) > (c.debt_limit || 0) && (c.debt_limit || 0) > 0).length

    console.log(`   📊 Khách hàng có công nợ: ${customersWithDebt.length.toLocaleString('vi-VN')}`)
    console.log(`   💸 Tổng công nợ: ${totalDebt.toLocaleString('vi-VN')} VND`)
    console.log(`   📈 Công nợ trung bình: ${Math.round(avgDebt).toLocaleString('vi-VN')} VND`)
    if (debtViolations > 0) {
      console.log(`   ⚠️  Vi phạm hạn mức: ${debtViolations} khách hàng`)
    }

    // 6. Top khách hàng
    console.log('\n6️⃣ Top 10 khách hàng theo doanh thu:')
    const topCustomers = this.customers
      .filter(c => (c.total_revenue || 0) > 0)
      .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))
      .slice(0, 10)
      .map(c => ({
        customer_id: c.customer_id,
        name: c.customer_name,
        code: c.customer_code,
        revenue: c.total_revenue || 0,
        type: this.customerTypes.find(t => t.type_id === c.customer_type_id)?.type_name || 'Unknown'
      }))

    topCustomers.forEach((customer, index) => {
      console.log(`   ${(index + 1).toString().padStart(2, ' ')}. ${customer.name} (${customer.code})`)
      console.log(`       💰 ${customer.revenue.toLocaleString('vi-VN')} VND - ${customer.type}`)
    })

    // 7. Hoạt động gần đây
    console.log('\n7️⃣ Hoạt động gần đây (30 ngày):')
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    
    const newCustomersThisMonth = this.customers.filter(c => 
      new Date(c.created_at) >= oneMonthAgo
    ).length

    const revenueThisMonth = this.invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)

    console.log(`   👤 Khách hàng mới: ${newCustomersThisMonth.toLocaleString('vi-VN')}`)
    console.log(`   📋 Hóa đơn: ${this.invoices.length.toLocaleString('vi-VN')}`)
    console.log(`   💰 Doanh thu: ${revenueThisMonth.toLocaleString('vi-VN')} VND`)

    return {
      summary: {
        totalCustomers,
        activeCustomers,
        totalRevenue: Math.round(totalRevenue),
        avgRevenue: Math.round(avgRevenue),
        maxRevenue,
        dataQuality: {
          phoneCompleteness,
          emailCompleteness,
          addressCompleteness
        }
      },
      demographics: {
        genderDistribution,
        typeDistribution,
        branchDistribution
      },
      businessMetrics: {
        revenueRanges,
        debtAnalysis: {
          customersWithDebt: customersWithDebt.length,
          totalDebt: Math.round(totalDebt),
          avgDebt: Math.round(avgDebt),
          debtViolations
        },
        topCustomers,
        recentActivity: {
          newCustomersThisMonth,
          totalInvoicesThisMonth: this.invoices.length,
          revenueThisMonth: Math.round(revenueThisMonth)
        }
      }
    }
  }

  /**
   * Tạo báo cáo chi tiết
   */
  async generateDetailedReport(analysisResult: SupabaseAnalysisResult): Promise<void> {
    console.log('\n📝 BƯỚC 4: Tạo báo cáo chi tiết...')

    try {
      await fs.mkdir(this.outputDir, { recursive: true })

      const report = {
        metadata: {
          title: 'Báo Cáo Phân Tích Khách Hàng Real-time - Xuân Thùy Pet Pharmacy',
          generatedAt: new Date().toISOString(),
          generatedBy: 'Real-time Supabase Customer Analyzer v1.0',
          dataSource: 'Supabase Database (Real-time)',
          totalRecordsAnalyzed: this.customers.length,
          analysisScope: 'Full customer database + Recent invoices (30 days)'
        },
        executiveSummary: {
          keyMetrics: {
            totalCustomers: analysisResult.summary.totalCustomers,
            activeCustomersRate: `${(analysisResult.summary.activeCustomers / analysisResult.summary.totalCustomers * 100).toFixed(1)}%`,
            totalRevenue: `${analysisResult.summary.totalRevenue.toLocaleString('vi-VN')} VND`,
            averageRevenuePerCustomer: `${analysisResult.summary.avgRevenue.toLocaleString('vi-VN')} VND`,
            dataQualityScore: `${((analysisResult.summary.dataQuality.phoneCompleteness + analysisResult.summary.dataQuality.emailCompleteness + analysisResult.summary.dataQuality.addressCompleteness) / 3).toFixed(1)}%`
          },
          recentActivity: {
            newCustomersThisMonth: analysisResult.businessMetrics.recentActivity.newCustomersThisMonth,
            invoicesThisMonth: analysisResult.businessMetrics.recentActivity.totalInvoicesThisMonth,
            revenueThisMonth: `${analysisResult.businessMetrics.recentActivity.revenueThisMonth.toLocaleString('vi-VN')} VND`
          }
        },
        detailedAnalysis: analysisResult,
        recommendations: {
          immediate: [
            analysisResult.summary.dataQuality.phoneCompleteness < 70 ? 'Cải thiện thu thập số điện thoại khách hàng' : null,
            analysisResult.summary.dataQuality.emailCompleteness < 50 ? 'Tăng cường thu thập email khách hàng' : null,
            analysisResult.businessMetrics.debtAnalysis.debtViolations > 0 ? `Xử lý ${analysisResult.businessMetrics.debtAnalysis.debtViolations} khách hàng vượt hạn mức công nợ` : null
          ].filter(Boolean),
          longTerm: [
            'Phát triển chương trình khách hàng thân thiết',
            'Tự động hóa quy trình chăm sóc khách hàng',
            'Phân khúc khách hàng để marketing hiệu quả',
            'Xây dựng dashboard theo dõi real-time'
          ]
        }
      }

      const reportPath = path.join(this.outputDir, 'real-time-customer-analysis-report.json')
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8')

      // Tạo executive summary dạng markdown
      const markdownSummary = `# Báo Cáo Phân Tích Khách Hàng Real-time - Xuân Thùy Pet Pharmacy

## 📊 Tóm Tắt Điều Hành

**Ngày phân tích:** ${new Date().toLocaleString('vi-VN')}  
**Nguồn dữ liệu:** ${this.customers.length.toLocaleString('vi-VN')} khách hàng từ Supabase (Real-time)

### 🎯 Chỉ Số Quan Trọng

| Chỉ số | Giá trị |
|--------|---------|
| **Tổng số khách hàng** | ${analysisResult.summary.totalCustomers.toLocaleString('vi-VN')} |
| **Khách hàng đang hoạt động** | ${analysisResult.summary.activeCustomers.toLocaleString('vi-VN')} (${(analysisResult.summary.activeCustomers/analysisResult.summary.totalCustomers*100).toFixed(1)}%) |
| **Tổng doanh thu** | ${analysisResult.summary.totalRevenue.toLocaleString('vi-VN')} VND |
| **Doanh thu trung bình** | ${analysisResult.summary.avgRevenue.toLocaleString('vi-VN')} VND |

### 📈 Hoạt Động Gần Đây (30 ngày)

- **Khách hàng mới:** ${analysisResult.businessMetrics.recentActivity.newCustomersThisMonth.toLocaleString('vi-VN')}
- **Hóa đơn:** ${analysisResult.businessMetrics.recentActivity.totalInvoicesThisMonth.toLocaleString('vi-VN')}
- **Doanh thu:** ${analysisResult.businessMetrics.recentActivity.revenueThisMonth.toLocaleString('vi-VN')} VND

### 🏆 Top 5 Khách Hàng VIP

${analysisResult.businessMetrics.topCustomers.slice(0, 5).map((customer, index) => 
  `${index + 1}. **${customer.name}** (${customer.code}) - ${customer.revenue.toLocaleString('vi-VN')} VND`
).join('\n')}

### 📊 Chất Lượng Dữ Liệu

- **Điện thoại:** ${analysisResult.summary.dataQuality.phoneCompleteness.toFixed(1)}%
- **Email:** ${analysisResult.summary.dataQuality.emailCompleteness.toFixed(1)}%
- **Địa chỉ:** ${analysisResult.summary.dataQuality.addressCompleteness.toFixed(1)}%

### 🚨 Vấn Đề Cần Chú Ý

${analysisResult.businessMetrics.debtAnalysis.debtViolations > 0 ? 
  `- **Công nợ:** ${analysisResult.businessMetrics.debtAnalysis.debtViolations} khách hàng vượt hạn mức` : 
  '✅ Không có vấn đề công nợ nghiêm trọng'
}

---
*Báo cáo được tạo tự động từ dữ liệu Supabase real-time*
`

      const markdownPath = path.join(this.outputDir, 'REAL_TIME_CUSTOMER_ANALYSIS.md')
      await fs.writeFile(markdownPath, markdownSummary, 'utf-8')

      console.log(`✅ Đã tạo báo cáo chi tiết: ${reportPath}`)
      console.log(`✅ Đã tạo tóm tắt điều hành: ${markdownPath}`)

    } catch (error) {
      console.error('❌ Lỗi khi tạo báo cáo:', error)
      throw error
    }
  }

  /**
   * Chạy toàn bộ phân tích
   */
  async runCompleteAnalysis(): Promise<void> {
    console.log('🎯 BẮT ĐẦU PHÂN TÍCH REAL-TIME KHÁCH HÀNG XUÂN THÙY PET PHARMACY')
    console.log('=' .repeat(80))

    try {
      // Bước 1: Test kết nối
      await this.testConnection()

      // Bước 2: Lấy dữ liệu
      await this.fetchCustomerData()

      // Bước 3: Phân tích dữ liệu
      const analysisResult = await this.analyzeCustomerData()

      // Bước 4: Tạo báo cáo
      await this.generateDetailedReport(analysisResult)

      console.log('\n' + '=' .repeat(80))
      console.log('🎉 HOÀN THÀNH PHÂN TÍCH REAL-TIME!')
      console.log(`📊 Đã phân tích ${this.customers.length.toLocaleString('vi-VN')} khách hàng từ Supabase`)
      console.log(`💰 Tổng doanh thu: ${analysisResult.summary.totalRevenue.toLocaleString('vi-VN')} VND`)
      console.log(`📁 Báo cáo chi tiết: ./docs/api/`)
      console.log(`🔗 Dữ liệu được lấy trực tiếp từ Supabase database`)
      console.log('=' .repeat(80))

    } catch (error) {
      console.error('\n❌ PHÂN TÍCH THẤT BẠI:', error)
      if (error instanceof Error && (error.message?.includes('JWT') || error.message?.includes('auth'))) {
        console.log('\n💡 Gợi ý: Kiểm tra quyền truy cập Supabase và RLS policies')
      }
      process.exit(1)
    }
  }
}

// Chạy phân tích
async function main() {
  const analyzer = new RealSupabaseAnalyzer()
  await analyzer.runCompleteAnalysis()
}

// Execute
if (require.main === module) {
  main().catch(console.error)
}

export default RealSupabaseAnalyzer
