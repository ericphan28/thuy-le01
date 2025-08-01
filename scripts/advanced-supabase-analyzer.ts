/**
 * Advanced Supabase Customer Data Analyzer - Xuân Thùy Pet Pharmacy
 * Phân tích thống kê khách hàng từ dữ liệu thực tế với logging chi tiết
 */

import fs from 'fs/promises'
import { readFileSync } from 'fs'
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

interface AnalysisResult {
  summary: {
    totalCustomers: number
    activeCustomers: number
    totalRevenue: number
    avgRevenue: number
    maxRevenue: number
    dataCompleteness: Record<string, number>
  }
  demographics: {
    genderDistribution: Record<string, number>
    typeDistribution: Record<string, number>
    createdByDistribution: Record<string, number>
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
      name: string
      code: string
      revenue: number
      type: string
    }>
  }
  dataQuality: {
    issues: string[]
    recommendations: string[]
    completenessScore: number
  }
}

class AdvancedSupabaseAnalyzer {
  private dataFile = './backup_thuyle_data.sql'
  private schemaFile = './backup_thuyle_schema_complete.sql'
  private outputDir = './docs/api'
  private customers: Customer[] = []
  private customerTypes: CustomerType[] = []

  constructor() {
    console.log('🚀 Khởi tạo Advanced Supabase Customer Analyzer...')
    console.log(`📅 Ngày phân tích: ${new Date().toLocaleString('vi-VN')}`)
    console.log('=' .repeat(80))
  }

  /**
   * Parse dữ liệu từ SQL backup file
   */
  async parseDataFromSQL(): Promise<void> {
    console.log('\n📖 BƯỚC 1: Đọc và phân tích dữ liệu từ SQL backup...')
    
    try {
      const sqlContent = readFileSync(this.dataFile, 'utf8')
      console.log(`✅ Đã tải file dữ liệu: ${(sqlContent.length / 1024 / 1024).toFixed(2)} MB`)

      // Parse customer_types trước
      console.log('\n🏷️  Phân tích bảng customer_types...')
      const customerTypesMatch = sqlContent.match(
        /COPY public\.customer_types \([^)]+\) FROM stdin;([\s\S]*?)\\\.(?=\n\n--|\n\nSET|\Z)/
      )

      if (customerTypesMatch) {
        const typeData = customerTypesMatch[1].trim()
        const typeRows = typeData.split('\n').filter(line => line.trim() && line.trim() !== '\\.')
        
        this.customerTypes = typeRows.map(row => {
          const values = row.split('\t')
          return {
            type_id: parseInt(values[0]),
            type_code: values[1],
            type_name: values[2],
            description: values[3],
            is_active: values[4] === 't',
            created_at: values[5]
          }
        })
        
        console.log(`✅ Đã parse ${this.customerTypes.length} loại khách hàng:`)
        this.customerTypes.forEach(type => {
          console.log(`   - ${type.type_code}: ${type.type_name} (${type.description})`)
        })
      }

      // Parse customers
      console.log('\n👥 Phân tích bảng customers...')
      const customersMatch = sqlContent.match(
        /COPY public\.customers \([^)]+\) FROM stdin;([\s\S]*?)\\\.(?=\n\n--|\n\nSET|\Z)/
      )

      if (customersMatch) {
        const customerData = customersMatch[1].trim()
        const customerRows = customerData.split('\n').filter(line => line.trim() && line.trim() !== '\\.')
        
        console.log(`📊 Tìm thấy ${customerRows.length} dòng dữ liệu khách hàng`)
        
        this.customers = customerRows.map((row, index) => {
          const values = this.parseTabDelimitedRow(row)
          
          // Log một vài record đầu để debug
          if (index < 3) {
            console.log(`   Debug row ${index + 1}: ${values.slice(0, 5).join(' | ')}`)
          }
          
          return {
            customer_id: parseInt(values[0] || '0'),
            customer_code: values[1] || '',
            customer_name: values[2] || '',
            customer_type_id: parseInt(values[3] || '1'),
            branch_created_id: parseInt(values[4] || '1'),
            phone: values[5] === '\\N' ? undefined : values[5],
            email: values[6] === '\\N' ? undefined : values[6],
            address: values[7] === '\\N' ? undefined : values[7],
            company_name: values[8] === '\\N' ? undefined : values[8],
            tax_code: values[9] === '\\N' ? undefined : values[9],
            id_number: values[10] === '\\N' ? undefined : values[10],
            gender: values[11] === '\\N' ? undefined : values[11],
            debt_limit: parseFloat(values[12] || '0'),
            current_debt: parseFloat(values[13] || '0'),
            total_revenue: parseFloat(values[14] || '0'),
            total_profit: parseFloat(values[15] || '0'),
            purchase_count: parseInt(values[16] || '0'),
            last_purchase_date: values[17] === '\\N' ? undefined : values[17],
            status: parseInt(values[18] || '1'),
            notes: values[19] === '\\N' ? undefined : values[19],
            created_by: values[20] || '',
            is_active: values[21] === 't',
            created_at: values[22] || '',
            updated_at: values[23] || ''
          }
        })

        console.log(`✅ Đã parse thành công ${this.customers.length} khách hàng`)
        
        // Hiển thị thống kê cơ bản
        const activeCount = this.customers.filter(c => c.is_active).length
        const withRevenueCount = this.customers.filter(c => c.total_revenue > 0).length
        const totalRevenue = this.customers.reduce((sum, c) => sum + c.total_revenue, 0)
        
        console.log(`📈 Thống kê cơ bản:`)
        console.log(`   - Khách hàng đang hoạt động: ${activeCount}/${this.customers.length}`)
        console.log(`   - Khách hàng có doanh thu: ${withRevenueCount}`)
        console.log(`   - Tổng doanh thu: ${totalRevenue.toLocaleString('vi-VN')} VND`)
      } else {
        throw new Error('Không tìm thấy dữ liệu khách hàng trong file SQL')
      }

    } catch (error) {
      console.error('❌ Lỗi khi phân tích dữ liệu:', error)
      throw error
    }
  }

  /**
   * Parse tab-delimited row với xử lý escape characters
   */
  private parseTabDelimitedRow(row: string): string[] {
    return row.split('\t').map(value => {
      if (value === '\\N') return '\\N'
      return value.replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
    })
  }

  /**
   * Phân tích chi tiết dữ liệu khách hàng
   */
  async analyzeCustomerData(): Promise<AnalysisResult> {
    console.log('\n📊 BƯỚC 2: Phân tích chi tiết dữ liệu khách hàng...')

    // 1. Thống kê tổng quan
    console.log('\n1️⃣ Thống kê tổng quan:')
    const totalCustomers = this.customers.length
    const activeCustomers = this.customers.filter(c => c.is_active).length
    const totalRevenue = this.customers.reduce((sum, c) => sum + c.total_revenue, 0)
    const customersWithRevenue = this.customers.filter(c => c.total_revenue > 0)
    const avgRevenue = customersWithRevenue.length > 0 ? totalRevenue / customersWithRevenue.length : 0
    const maxRevenue = Math.max(...this.customers.map(c => c.total_revenue))

    console.log(`   📋 Tổng số khách hàng: ${totalCustomers.toLocaleString('vi-VN')}`)
    console.log(`   ✅ Khách hàng đang hoạt động: ${activeCustomers.toLocaleString('vi-VN')} (${(activeCustomers/totalCustomers*100).toFixed(1)}%)`)
    console.log(`   💰 Tổng doanh thu: ${totalRevenue.toLocaleString('vi-VN')} VND`)
    console.log(`   📈 Doanh thu trung bình: ${Math.round(avgRevenue).toLocaleString('vi-VN')} VND`)
    console.log(`   🏆 Doanh thu cao nhất: ${maxRevenue.toLocaleString('vi-VN')} VND`)

    // 2. Phân tích độ đầy đủ dữ liệu
    console.log('\n2️⃣ Phân tích độ đầy đủ dữ liệu:')
    const dataCompleteness = {
      phone: this.customers.filter(c => c.phone && c.phone.trim()).length / totalCustomers * 100,
      email: this.customers.filter(c => c.email && c.email.trim()).length / totalCustomers * 100,
      address: this.customers.filter(c => c.address && c.address.trim()).length / totalCustomers * 100,
      gender: this.customers.filter(c => c.gender && c.gender.trim()).length / totalCustomers * 100,
      company_name: this.customers.filter(c => c.company_name && c.company_name.trim()).length / totalCustomers * 100,
      tax_code: this.customers.filter(c => c.tax_code && c.tax_code.trim()).length / totalCustomers * 100
    }

    Object.entries(dataCompleteness).forEach(([field, percentage]) => {
      const status = percentage > 80 ? '🟢' : percentage > 50 ? '🟡' : '🔴'
      console.log(`   ${status} ${field}: ${percentage.toFixed(1)}%`)
    })

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

    // Created by distribution
    const createdByDistribution = this.customers.reduce((acc, customer) => {
      acc[customer.created_by] = (acc[customer.created_by] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    console.log('   👨‍💼 Phân bố theo người tạo:')
    Object.entries(createdByDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([creator, count]) => {
        const percentage = (count / totalCustomers * 100).toFixed(1)
        console.log(`      ${creator}: ${count.toLocaleString('vi-VN')} (${percentage}%)`)
      })

    // 4. Phân tích doanh thu
    console.log('\n4️⃣ Phân tích doanh thu:')
    const revenueRanges = {
      'Không có doanh thu': this.customers.filter(c => c.total_revenue === 0).length,
      'Dưới 1 triệu': this.customers.filter(c => c.total_revenue > 0 && c.total_revenue < 1000000).length,
      '1-5 triệu': this.customers.filter(c => c.total_revenue >= 1000000 && c.total_revenue < 5000000).length,
      '5-20 triệu': this.customers.filter(c => c.total_revenue >= 5000000 && c.total_revenue < 20000000).length,
      '20-50 triệu': this.customers.filter(c => c.total_revenue >= 20000000 && c.total_revenue < 50000000).length,
      'Trên 50 triệu': this.customers.filter(c => c.total_revenue >= 50000000).length
    }

    Object.entries(revenueRanges).forEach(([range, count]) => {
      const percentage = (count / totalCustomers * 100).toFixed(1)
      console.log(`   💰 ${range}: ${count.toLocaleString('vi-VN')} (${percentage}%)`)
    })

    // 5. Phân tích công nợ
    console.log('\n5️⃣ Phân tích công nợ:')
    const customersWithDebt = this.customers.filter(c => c.current_debt > 0)
    const totalDebt = this.customers.reduce((sum, c) => sum + c.current_debt, 0)
    const avgDebt = customersWithDebt.length > 0 ? totalDebt / customersWithDebt.length : 0
    const debtViolations = this.customers.filter(c => c.current_debt > c.debt_limit).length

    console.log(`   📊 Khách hàng có công nợ: ${customersWithDebt.length.toLocaleString('vi-VN')}`)
    console.log(`   💸 Tổng công nợ: ${totalDebt.toLocaleString('vi-VN')} VND`)
    console.log(`   📈 Công nợ trung bình: ${Math.round(avgDebt).toLocaleString('vi-VN')} VND`)
    if (debtViolations > 0) {
      console.log(`   ⚠️  Vi phạm hạn mức: ${debtViolations} khách hàng`)
    }

    // 6. Top khách hàng
    console.log('\n6️⃣ Top 10 khách hàng theo doanh thu:')
    const topCustomers = this.customers
      .filter(c => c.total_revenue > 0)
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 10)
      .map(c => ({
        name: c.customer_name,
        code: c.customer_code,
        revenue: c.total_revenue,
        type: this.customerTypes.find(t => t.type_id === c.customer_type_id)?.type_name || 'Unknown'
      }))

    topCustomers.forEach((customer, index) => {
      console.log(`   ${(index + 1).toString().padStart(2, ' ')}. ${customer.name} (${customer.code})`)
      console.log(`       💰 ${customer.revenue.toLocaleString('vi-VN')} VND - ${customer.type}`)
    })

    // 7. Đánh giá chất lượng dữ liệu
    console.log('\n7️⃣ Đánh giá chất lượng dữ liệu:')
    const issues: string[] = []
    const recommendations: string[] = []

    if (dataCompleteness.phone < 50) {
      issues.push('Ty le so dien thoai thap')
      recommendations.push('Cai thien quy trinh thu thap so dien thoai khach hang')
    }

    if (dataCompleteness.email < 20) {
      issues.push('Ty le email rat thap')
      recommendations.push('Khuyen khich khach hang cung cap email de lien lac')
    }

    if (debtViolations > 0) {
      issues.push(`${debtViolations} khach hang vuot han muc cong no`)
      recommendations.push('Xem xet dieu chinh han muc hoac thu hoi cong no')
    }

    const duplicateNames = this.findDuplicateNames()
    if (duplicateNames.length > 0) {
      issues.push(`${duplicateNames.length} ten khach hang co the trung lap`)
      recommendations.push('Ra soat va hop nhat cac khach hang trung lap')
    }

    const avgCompleteness = Object.values(dataCompleteness).reduce((sum, val) => sum + val, 0) / Object.values(dataCompleteness).length

    if (issues.length > 0) {
      console.log('   ⚠️  Vấn đề phát hiện:')
      issues.forEach(issue => console.log(`      - ${issue}`))
    } else {
      console.log('   ✅ Không phát hiện vấn đề nghiêm trọng')
    }

    return {
      summary: {
        totalCustomers,
        activeCustomers,
        totalRevenue: Math.round(totalRevenue),
        avgRevenue: Math.round(avgRevenue),
        maxRevenue,
        dataCompleteness
      },
      demographics: {
        genderDistribution,
        typeDistribution,
        createdByDistribution
      },
      businessMetrics: {
        revenueRanges,
        debtAnalysis: {
          customersWithDebt: customersWithDebt.length,
          totalDebt: Math.round(totalDebt),
          avgDebt: Math.round(avgDebt),
          debtViolations
        },
        topCustomers
      },
      dataQuality: {
        issues,
        recommendations,
        completenessScore: Math.round(avgCompleteness)
      }
    }
  }

  /**
   * Tìm tên khách hàng có thể trùng lặp
   */
  private findDuplicateNames(): string[] {
    const nameMap = new Map<string, number>()
    
    this.customers.forEach(customer => {
      const normalizedName = customer.customer_name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
      
      nameMap.set(normalizedName, (nameMap.get(normalizedName) || 0) + 1)
    })

    return Array.from(nameMap.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name)
  }

  /**
   * Tạo báo cáo chi tiết
   */
  async generateDetailedReport(analysisResult: AnalysisResult): Promise<void> {
    console.log('\n📝 BƯỚC 3: Tạo báo cáo chi tiết...')

    try {
      await fs.mkdir(this.outputDir, { recursive: true })

      const report = {
        metadata: {
          title: 'Báo Cáo Phân Tích Khách Hàng - Xuân Thùy Pet Pharmacy',
          generatedAt: new Date().toISOString(),
          generatedBy: 'Advanced Supabase Customer Analyzer v1.0',
          dataSource: 'backup_thuyle_data.sql',
          totalRecordsAnalyzed: this.customers.length
        },
        executiveSummary: {
          keyMetrics: {
            totalCustomers: analysisResult.summary.totalCustomers,
            activeCustomersRate: `${(analysisResult.summary.activeCustomers / analysisResult.summary.totalCustomers * 100).toFixed(1)}%`,
            totalRevenue: `${analysisResult.summary.totalRevenue.toLocaleString('vi-VN')} VNĐ`,
            averageRevenuePerCustomer: `${analysisResult.summary.avgRevenue.toLocaleString('vi-VN')} VNĐ`,
            dataCompletenessScore: `${analysisResult.dataQuality.completenessScore}%`
          },
          topInsights: [
            `Có ${analysisResult.summary.activeCustomers} khách hàng đang hoạt động trên tổng số ${analysisResult.summary.totalCustomers}`,
            `Doanh thu tập trung ở ${Object.entries(analysisResult.businessMetrics.revenueRanges).find(([, count]) => count === Math.max(...Object.values(analysisResult.businessMetrics.revenueRanges)))?.[0]}`,
            `Loại khách hàng chủ yếu: ${Object.entries(analysisResult.demographics.typeDistribution).sort((a, b) => b[1] - a[1])[0]?.[0]}`,
            analysisResult.dataQuality.issues.length === 0 ? 'Chất lượng dữ liệu tốt' : `Phát hiện ${analysisResult.dataQuality.issues.length} vấn đề cần xử lý`
          ]
        },
        detailedAnalysis: analysisResult,
        rawData: {
          customers: this.customers.slice(0, 100), // Chỉ lấy 100 record đầu cho báo cáo
          customerTypes: this.customerTypes
        },
        recommendations: {
          immediate: analysisResult.dataQuality.recommendations.slice(0, 3),
          longTerm: [
            'Xây dựng hệ thống CRM tự động hóa',
            'Phân khúc khách hàng theo giá trị',
            'Thiết lập chương trình khách hàng thân thiết',
            'Cải thiện quy trình thu thập dữ liệu'
          ]
        }
      }

      const reportPath = path.join(this.outputDir, 'advanced-customer-analysis-report.json')
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8')

      // Tạo executive summary dạng markdown
      const markdownSummary = `# Báo Cáo Phân Tích Khách Hàng - Xuân Thùy Pet Pharmacy

## 📊 Tóm Tắt Điều Hành

**Ngày phân tích:** ${new Date().toLocaleString('vi-VN')}  
**Nguồn dữ liệu:** ${this.customers.length.toLocaleString('vi-VN')} khách hàng từ Supabase

### 🎯 Chỉ Số Quan Trọng

| Chỉ số | Giá trị |
|--------|---------|
| **Tổng số khách hàng** | ${analysisResult.summary.totalCustomers.toLocaleString('vi-VN')} |
| **Khách hàng đang hoạt động** | ${analysisResult.summary.activeCustomers.toLocaleString('vi-VN')} (${(analysisResult.summary.activeCustomers/analysisResult.summary.totalCustomers*100).toFixed(1)}%) |
| **Tổng doanh thu** | ${analysisResult.summary.totalRevenue.toLocaleString('vi-VN')} VND |
| **Doanh thu trung bình** | ${analysisResult.summary.avgRevenue.toLocaleString('vi-VN')} VND |
| **Điểm chất lượng dữ liệu** | ${analysisResult.dataQuality.completenessScore}% |

### 🏆 Top 5 Khách Hàng VIP

${analysisResult.businessMetrics.topCustomers.slice(0, 5).map((customer, index) => 
  `${index + 1}. **${customer.name}** (${customer.code}) - ${customer.revenue.toLocaleString('vi-VN')} VND`
).join('\n')}

### 📈 Phân Bố Doanh Thu

${Object.entries(analysisResult.businessMetrics.revenueRanges).map(([range, count]) => 
  `- **${range}:** ${count.toLocaleString('vi-VN')} khách hàng`
).join('\n')}

### ⚠️ Vấn Đề Cần Chú Ý

${analysisResult.dataQuality.issues.length > 0 ? 
  analysisResult.dataQuality.issues.map(issue => `- ${issue}`).join('\n') :
  '✅ Không có vấn đề nghiêm trọng'
}

### 🚀 Khuyến Nghị

${analysisResult.dataQuality.recommendations.map(rec => `- ${rec}`).join('\n')}

---
*Báo cáo được tạo tự động bởi Advanced Supabase Customer Analyzer*
`

      const markdownPath = path.join(this.outputDir, 'ADVANCED_CUSTOMER_ANALYSIS.md')
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
    console.log('🎯 BẮT ĐẦU PHÂN TÍCH TOÀN DIỆN KHÁCH HÀNG XUÂN THÙY PET PHARMACY')
    console.log('=' .repeat(80))

    try {
      // Bước 1: Parse dữ liệu
      await this.parseDataFromSQL()

      // Bước 2: Phân tích dữ liệu
      const analysisResult = await this.analyzeCustomerData()

      // Bước 3: Tạo báo cáo
      await this.generateDetailedReport(analysisResult)

      console.log('\n' + '=' .repeat(80))
      console.log('🎉 HOÀN THÀNH PHÂN TÍCH!')
      console.log(`📊 Đã phân tích ${this.customers.length.toLocaleString('vi-VN')} khách hàng`)
      console.log(`💰 Tổng doanh thu: ${analysisResult.summary.totalRevenue.toLocaleString('vi-VN')} VND`)
      console.log(`📁 Báo cáo chi tiết: ./docs/api/`)
      console.log('=' .repeat(80))

    } catch (error) {
      console.error('\n❌ PHÂN TÍCH THẤT BẠI:', error)
      process.exit(1)
    }
  }
}

// Chạy phân tích
async function main() {
  const analyzer = new AdvancedSupabaseAnalyzer()
  await analyzer.runCompleteAnalysis()
}

// Execute
if (require.main === module) {
  main().catch(console.error)
}

export default AdvancedSupabaseAnalyzer
