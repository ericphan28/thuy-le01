/**
 * Supabase Customer Management Database Analyzer & API Tester
 * Phân tích schema, test dữ liệu và tạo tài liệu API cho quản lý khách hàng
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import { readFileSync } from 'fs'
import path from 'path'

// Remove unused interfaces - they will be imported from types file
// interface Customer, CustomerType, Invoice removed

class SupabaseCustomerAnalyzer {
  private supabase
  private outputDir = './docs/api'

  constructor() {
    // Load environment variables từ .env.local
    try {
      const envData = readFileSync('.env.local', 'utf8')
      const envVars = envData.split('\n').reduce((acc: Record<string, string>, line: string) => {
        const [key, value] = line.split('=')
        if (key && value) {
          acc[key.trim()] = value.trim()
        }
        return acc
      }, {})
      
      // Set environment variables
      Object.assign(process.env, envVars)
    } catch {
      console.log('⚠️  .env.local not found, using default values')
    }

    // Cấu hình Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // Validate URL format
    if (!supabaseUrl || supabaseUrl === 'your_url' || !supabaseUrl.startsWith('http')) {
      console.error('❌ Invalid SUPABASE_URL. Please set proper URL in .env.local')
      console.error('Example: NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co')
      process.exit(1)
    }

    if (!supabaseKey || supabaseKey === 'your_key') {
      console.error('❌ Invalid SUPABASE_KEY. Please set proper key in .env.local')
      console.error('Example: NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
      process.exit(1)
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey)
    
    console.log('🔗 Supabase Client initialized')
    console.log(`📍 URL: ${supabaseUrl}`)
    console.log(`🔑 Key: ${supabaseKey.substring(0, 20)}...`)
  }

  /**
   * Kiểm tra kết nối database
   */
  async testConnection(): Promise<void> {
    try {
      console.log('\n🧪 Testing database connection...')
      
      const { error } = await this.supabase
        .from('customers')
        .select('customer_id')
        .limit(1)

      if (error) {
        throw new Error(`Connection failed: ${error.message}`)
      }

      console.log('✅ Database connection successful')
    } catch (error) {
      console.error('❌ Database connection failed:', error)
      throw error
    }
  }

  /**
   * Phân tích cấu trúc bảng customers
   */
  async analyzeCustomerSchema(): Promise<unknown> {
    try {
      console.log('\n📊 Analyzing customers table schema...')

      // Lấy sample data để phân tích structure
      const { data: customers, error } = await this.supabase
        .from('customers')
        .select('*')
        .limit(5)

      if (error) throw error

      if (!customers || customers.length === 0) {
        console.log('⚠️  No customers found in database')
        return null
      }

      const sampleCustomer = customers[0]
      const schema = {
        tableName: 'customers',
        totalRecords: customers.length,
        fields: Object.keys(sampleCustomer).map(field => ({
          name: field,
          type: typeof sampleCustomer[field],
          sample: sampleCustomer[field],
          isNullable: sampleCustomer[field] === null
        })),
        sampleData: customers.slice(0, 3)
      }

      console.log(`✅ Schema analyzed: ${schema.fields.length} fields found`)
      return schema
    } catch (error) {
      console.error('❌ Schema analysis failed:', error)
      return null
    }
  }

  /**
   * Phân tích quan hệ customer-invoice
   */
  async analyzeCustomerInvoiceRelation(): Promise<unknown> {
    try {
      console.log('\n🔗 Analyzing customer-invoice relationships...')

      const { data, error } = await this.supabase
        .from('customers')
        .select(`
          customer_id,
          customer_name,
          customer_code,
          total_revenue,
          purchase_count,
          invoices (
            invoice_id,
            invoice_code,
            total_amount,
            payment_status,
            invoice_date
          )
        `)
        .limit(3)

      if (error) throw error

      console.log(`✅ Relationship analysis complete: ${data?.length} customers with invoices`)
      return data
    } catch (error) {
      console.error('❌ Relationship analysis failed:', error)
      return null
    }
  }

  /**
   * Test các function có sẵn trong database
   */
  async testDatabaseFunctions(): Promise<void> {
    console.log('\n🧮 Testing database functions...')

    try {
      // Test get_financial_summary function
      console.log('📈 Testing get_financial_summary...')
      const { data: financialData, error: financialError } = await this.supabase
        .rpc('get_financial_summary', {
          date_from: '2025-07-01',
          date_to: '2025-07-31'
        })

      if (financialError) {
        console.log('⚠️  get_financial_summary not available or error:', financialError.message)
      } else {
        console.log('✅ get_financial_summary working:', JSON.stringify(financialData, null, 2))
      }

      // Test search_customers_with_stats function (nếu có)
      console.log('🔍 Testing search_customers_with_stats...')
      const { data: searchData, error: searchError } = await this.supabase
        .rpc('search_customers_with_stats', {
          search_term: '',
          customer_type_filter: null,
          limit_count: 5
        })

      if (searchError) {
        console.log('⚠️  search_customers_with_stats not available:', searchError.message)
      } else {
        console.log('✅ search_customers_with_stats working:', searchData?.length, 'records')
      }

    } catch (error) {
      console.error('❌ Function testing failed:', error)
    }
  }

  /**
   * Test CRUD operations
   */
  async testCRUDOperations(): Promise<void> {
    console.log('\n🔧 Testing CRUD operations...')

    const testCustomerCode = `TEST_${Date.now()}`
    let testCustomerId: number | null = null

    try {
      // CREATE - Tạo customer test
      console.log('➕ Testing CREATE operation...')
      const { data: createData, error: createError } = await this.supabase
        .from('customers')
        .insert([{
          customer_code: testCustomerCode,
          customer_name: 'Test Customer for API',
          phone: '0999999999',
          email: 'test@xuanthuy.com',
          customer_type_id: 1,
          debt_limit: 5000000,
          current_debt: 0,
          total_revenue: 0,
          total_profit: 0,
          purchase_count: 0,
          status: 1,
          is_active: true
        }])
        .select()
        .single()

      if (createError) {
        console.log('❌ CREATE failed:', createError.message)
        return
      }

      testCustomerId = createData.customer_id
      console.log('✅ CREATE successful, ID:', testCustomerId)

      // READ - Đọc customer vừa tạo
      console.log('📖 Testing READ operation...')
      const { data: readData, error: readError } = await this.supabase
        .from('customers')
        .select('*')
        .eq('customer_id', testCustomerId)
        .single()

      if (readError) {
        console.log('❌ READ failed:', readError.message)
      } else {
        console.log('✅ READ successful:', readData.customer_name)
      }

      // UPDATE - Cập nhật customer
      console.log('✏️  Testing UPDATE operation...')
      const { data: updateData, error: updateError } = await this.supabase
        .from('customers')
        .update({ 
          customer_name: 'Updated Test Customer',
          total_revenue: 1000000,
          updated_at: new Date().toISOString()
        })
        .eq('customer_id', testCustomerId)
        .select()
        .single()

      if (updateError) {
        console.log('❌ UPDATE failed:', updateError.message)
      } else {
        console.log('✅ UPDATE successful:', updateData.customer_name)
      }

      // DELETE - Xóa customer test
      console.log('🗑️  Testing DELETE operation...')
      const { error: deleteError } = await this.supabase
        .from('customers')
        .delete()
        .eq('customer_id', testCustomerId)

      if (deleteError) {
        console.log('❌ DELETE failed:', deleteError.message)
      } else {
        console.log('✅ DELETE successful')
        testCustomerId = null
      }

    } catch (error) {
      console.error('❌ CRUD testing failed:', error)
    } finally {
      // Cleanup nếu có lỗi và customer chưa được xóa
      if (testCustomerId) {
        try {
          await this.supabase
            .from('customers')
            .delete()
            .eq('customer_id', testCustomerId)
          console.log('🧹 Cleanup completed')
        } catch (cleanupError) {
          console.error('⚠️  Cleanup failed:', cleanupError)
        }
      }
    }
  }

  /**
   * Test tìm kiếm và lọc dữ liệu
   */
  async testSearchAndFilter(): Promise<void> {
    console.log('\n🔍 Testing search and filter operations...')

    try {
      // Test basic search
      console.log('🔤 Testing text search...')
      const { data: searchData, error: searchError } = await this.supabase
        .from('customers')
        .select('customer_id, customer_name, customer_code, phone')
        .or('customer_name.ilike.%test%,customer_code.ilike.%KH%,phone.ilike.%09%')
        .limit(5)

      if (searchError) {
        console.log('❌ Search failed:', searchError.message)
      } else {
        console.log(`✅ Search successful: ${searchData?.length} results`)
      }

      // Test filtering by customer type
      console.log('🏷️  Testing filter by customer type...')
      const { data: filterData, error: filterError } = await this.supabase
        .from('customers')
        .select(`
          customer_id,
          customer_name,
          customer_types (
            type_name
          )
        `)
        .eq('customer_type_id', 1)
        .limit(3)

      if (filterError) {
        console.log('❌ Filter failed:', filterError.message)
      } else {
        console.log(`✅ Filter successful: ${filterData?.length} results`)
      }

      // Test pagination
      console.log('📄 Testing pagination...')
      const { data: pageData, error: pageError, count } = await this.supabase
        .from('customers')
        .select('customer_id, customer_name', { count: 'exact' })
        .range(0, 9) // First 10 records
        .order('customer_name')

      if (pageError) {
        console.log('❌ Pagination failed:', pageError.message)
      } else {
        console.log(`✅ Pagination successful: ${pageData?.length} of ${count} total records`)
      }

    } catch (error) {
      console.error('❌ Search and filter testing failed:', error)
    }
  }

  /**
   * Tạo tài liệu API
   */
  async generateAPIDocumentation(): Promise<void> {
    console.log('\n📚 Generating API documentation...')

    try {
      // Tạo thư mục docs nếu chưa có
      await fs.mkdir(this.outputDir, { recursive: true })

      const apiDoc = {
        title: "Xuân Thùy - Customer Management API Documentation",
        version: "1.0.0",
        description: "API Documentation for Customer Management System",
        baseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        generatedAt: new Date().toISOString(),
        
        authentication: {
          type: "Bearer Token",
          description: "Use Supabase anon key or service role key"
        },

        endpoints: {
          customers: {
            basePath: "/rest/v1/customers",
            operations: {
              "GET /customers": {
                description: "Lấy danh sách khách hàng với pagination và filter",
                parameters: {
                  select: "Chọn các trường cần lấy (mặc định: *)",
                  limit: "Số lượng record (mặc định: 1000)",
                  offset: "Bỏ qua số record đầu",
                  order: "Sắp xếp theo trường (VD: customer_name.asc)",
                  customer_type_id: "Lọc theo loại khách hàng",
                  is_active: "Lọc theo trạng thái (true/false)"
                },
                example: `GET /rest/v1/customers?select=*&limit=20&offset=0&order=customer_name.asc&is_active=eq.true`
              },

              "GET /customers/:id": {
                description: "Lấy thông tin chi tiết 1 khách hàng",
                example: "GET /rest/v1/customers?customer_id=eq.1&select=*"
              },

              "POST /customers": {
                description: "Tạo khách hàng mới",
                requiredFields: ["customer_code", "customer_name"],
                optionalFields: ["phone", "email", "address", "customer_type_id"],
                example: {
                  customer_code: "KH000001",
                  customer_name: "Nguyễn Văn A",
                  phone: "0987654321",
                  email: "nguyenvana@email.com",
                  customer_type_id: 1
                }
              },

              "PATCH /customers": {
                description: "Cập nhật thông tin khách hàng",
                example: {
                  customer_name: "Nguyễn Văn B Updated",
                  phone: "0987654322"
                }
              },

              "DELETE /customers": {
                description: "Xóa khách hàng (soft delete bằng cách set is_active=false)",
                note: "Khuyến nghị sử dụng PATCH để set is_active=false thay vì DELETE"
              }
            }
          },

          customer_types: {
            basePath: "/rest/v1/customer_types",
            operations: {
              "GET /customer_types": {
                description: "Lấy danh sách loại khách hàng",
                example: "GET /rest/v1/customer_types?select=*&is_active=eq.true"
              }
            }
          },

          rpc_functions: {
            basePath: "/rest/v1/rpc",
            operations: {
              "search_customers_with_stats": {
                description: "Tìm kiếm khách hàng kèm thống kê",
                parameters: {
                  search_term: "Từ khóa tìm kiếm",
                  customer_type_filter: "Lọc theo loại khách hàng",
                  limit_count: "Số lượng kết quả",
                  date_from: "Ngày bắt đầu thống kê"
                },
                example: `POST /rest/v1/rpc/search_customers_with_stats
{
  "search_term": "nguyen",
  "customer_type_filter": null,
  "limit_count": 20,
  "date_from": "2025-07-01"
}`
              },

              "get_financial_summary": {
                description: "Báo cáo tài chính tổng quan",
                parameters: {
                  date_from: "Ngày bắt đầu",
                  date_to: "Ngày kết thúc"
                },
                example: `POST /rest/v1/rpc/get_financial_summary
{
  "date_from": "2025-07-01",
  "date_to": "2025-07-31"
}`
              }
            }
          }
        },

        responseFormats: {
          success: {
            description: "Phản hồi thành công",
            example: {
              data: "[]",
              status: 200,
              statusText: "OK"
            }
          },
          error: {
            description: "Phản hồi lỗi",
            example: {
              code: "PGRST116",
              details: "The result contains 0 rows",
              hint: null,
              message: "JSON object requested, multiple (or no) rows returned"
            }
          }
        },

        commonHeaders: {
          "Content-Type": "application/json",
          "Authorization": "Bearer YOUR_SUPABASE_KEY",
          "apikey": "YOUR_SUPABASE_ANON_KEY"
        },

        bestPractices: [
          "Luôn sử dụng `select` để chỉ lấy các trường cần thiết",
          "Sử dụng pagination với `limit` và `offset` cho hiệu suất tốt",
          "Sử dụng `eq`, `ilike`, `gte`, `lte` cho filtering chính xác",
          "Kiểm tra lỗi trong response trước khi xử lý data",
          "Sử dụng RPC functions cho logic phức tạp",
          "Implement retry logic cho network errors",
          "Cache dữ liệu ít thay đổi như customer_types"
        ]
      }

      // Ghi file documentation
      const docPath = path.join(this.outputDir, 'customer-management-api.json')
      await fs.writeFile(docPath, JSON.stringify(apiDoc, null, 2), 'utf-8')

      console.log(`✅ API documentation generated: ${docPath}`)

      // Tạo README cho developer
      const readmeContent = `# Customer Management API

## Quick Start

\`\`\`typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'YOUR_SUPABASE_URL',
  'YOUR_SUPABASE_ANON_KEY'
)

// Lấy danh sách khách hàng
const { data: customers, error } = await supabase
  .from('customers')
  .select('*')
  .eq('is_active', true)
  .limit(20)
\`\`\`

## Common Operations

### 1. Tìm kiếm khách hàng
\`\`\`typescript
const { data } = await supabase
  .from('customers')
  .select('customer_id, customer_name, phone')
  .or('customer_name.ilike.%search%,phone.ilike.%search%')
\`\`\`

### 2. Tạo khách hàng mới
\`\`\`typescript
const { data, error } = await supabase
  .from('customers')
  .insert([{
    customer_code: 'KH000001',
    customer_name: 'Nguyễn Văn A',
    phone: '0987654321'
  }])
  .select()
\`\`\`

### 3. Sử dụng RPC function
\`\`\`typescript
const { data } = await supabase
  .rpc('search_customers_with_stats', {
    search_term: 'nguyen',
    limit_count: 20
  })
\`\`\`

Xem file \`customer-management-api.json\` để biết thêm chi tiết.
`

      const readmePath = path.join(this.outputDir, 'README.md')
      await fs.writeFile(readmePath, readmeContent, 'utf-8')

      console.log(`✅ README generated: ${readmePath}`)

    } catch (error) {
      console.error('❌ Documentation generation failed:', error)
    }
  }

  /**
   * Chạy tất cả test và phân tích
   */
  async runFullAnalysis(): Promise<void> {
    console.log('🚀 Starting Supabase Customer Management Analysis...')
    console.log('=' .repeat(60))

    try {
      // 1. Test connection
      await this.testConnection()

      // 2. Phân tích schema
      await this.analyzeCustomerSchema()
      
      // 3. Phân tích relationships
      await this.analyzeCustomerInvoiceRelation()

      // 4. Test database functions
      await this.testDatabaseFunctions()

      // 5. Test CRUD operations
      await this.testCRUDOperations()

      // 6. Test search and filter
      await this.testSearchAndFilter()

      // 7. Generate API docs
      await this.generateAPIDocumentation()

      console.log('\n' + '=' .repeat(60))
      console.log('🎉 Analysis completed successfully!')
      console.log('📁 Check ./docs/api/ folder for generated documentation')

    } catch (error) {
      console.error('\n❌ Analysis failed:', error)
      process.exit(1)
    }
  }
}

// Run the analyzer
async function main() {
  const analyzer = new SupabaseCustomerAnalyzer()
  await analyzer.runFullAnalysis()
}

// Execute if run directly
if (require.main === module) {
  main().catch(console.error)
}

export default SupabaseCustomerAnalyzer
