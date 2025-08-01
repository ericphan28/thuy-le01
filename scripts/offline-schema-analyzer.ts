/**
 * Offline Schema Analyzer - Phân tích schema từ SQL file
 */

import fs from 'fs/promises'
import path from 'path'

interface TableInfo {
  name: string
  columns: ColumnInfo[]
  constraints: string[]
  relationships: string[]
}

interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue?: string
  isPrimaryKey: boolean
  references?: string
}

class OfflineSchemaAnalyzer {
  private schemaContent = ''
  private outputDir = './docs/api'

  async loadSchemaFile(): Promise<void> {
    try {
      console.log('📖 Loading schema file...')
      this.schemaContent = await fs.readFile('backup_thuyle_schema_complete.sql', 'utf8')
      console.log(`✅ Schema file loaded (${this.schemaContent.length} characters)`)
    } catch (error) {
      console.error('❌ Failed to load schema file:', error)
      throw error
    }
  }

  extractTables(): TableInfo[] {
    const tables: TableInfo[] = []
    
    // Extract CREATE TABLE statements
    const createTableRegex = /CREATE TABLE public\.(\w+) \(([\s\S]*?)\);/g
    let match

    while ((match = createTableRegex.exec(this.schemaContent)) !== null) {
      const tableName = match[1]
      const tableBody = match[2]
      
      console.log(`🔍 Analyzing table: ${tableName}`)
      
      const columns = this.extractColumns(tableBody)
      const constraints = this.extractConstraints(tableBody)
      
      tables.push({
        name: tableName,
        columns,
        constraints,
        relationships: []
      })
    }

    return tables
  }

  private extractColumns(tableBody: string): ColumnInfo[] {
    const columns: ColumnInfo[] = []
    const lines = tableBody.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('CHECK')) {
        continue
      }

      // Parse column definition
      const columnMatch = trimmed.match(/^(\w+)\s+([^,\s]+)(.*)/)
      if (columnMatch) {
        const name = columnMatch[1]
        const type = columnMatch[2]
        const modifiers = columnMatch[3]

        columns.push({
          name,
          type,
          nullable: !modifiers.includes('NOT NULL'),
          defaultValue: this.extractDefault(modifiers),
          isPrimaryKey: modifiers.includes('PRIMARY KEY'),
          references: this.extractReference(modifiers)
        })
      }
    }

    return columns
  }

  private extractConstraints(tableBody: string): string[] {
    const constraints: string[] = []
    const constraintRegex = /CONSTRAINT\s+(\w+)\s+(.+)/g
    let match

    while ((match = constraintRegex.exec(tableBody)) !== null) {
      constraints.push(`${match[1]}: ${match[2]}`)
    }

    return constraints
  }

  private extractDefault(modifiers: string): string | undefined {
    const defaultMatch = modifiers.match(/DEFAULT\s+([^,\s]+)/)
    return defaultMatch ? defaultMatch[1] : undefined
  }

  private extractReference(modifiers: string): string | undefined {
    const refMatch = modifiers.match(/REFERENCES\s+(\w+)\s*\((\w+)\)/)
    return refMatch ? `${refMatch[1]}.${refMatch[2]}` : undefined
  }

  extractFunctions(): Array<{ name: string; parameters: string[]; returnType: string }> {
    const functions: Array<{ name: string; parameters: string[]; returnType: string }> = []
    
    const functionRegex = /CREATE FUNCTION public\.(\w+)\((.*?)\) RETURNS (.*?)\s/g
    let match

    while ((match = functionRegex.exec(this.schemaContent)) !== null) {
      const name = match[1]
      const paramString = match[2]
      const returnType = match[3]
      
      const parameters = paramString.split(',').map(p => p.trim()).filter(p => p.length > 0)
      
      functions.push({ name, parameters, returnType })
    }

    return functions
  }

  async generateDocumentation(tables: TableInfo[]): Promise<void> {
    console.log('\n📚 Generating documentation...')

    await fs.mkdir(this.outputDir, { recursive: true })

    const functions = this.extractFunctions()

    const documentation = {
      title: "Xuân Thùy - Database Schema Documentation",
      generatedAt: new Date().toISOString(),
      generatedBy: "Offline Schema Analyzer",
      
      summary: {
        totalTables: tables.length,
        totalColumns: tables.reduce((sum, table) => sum + table.columns.length, 0),
        totalFunctions: functions.length,
        keyTables: ['customers', 'invoices', 'products', 'customer_types']
      },

      tables: tables.map(table => ({
        name: table.name,
        description: this.getTableDescription(table.name),
        columns: table.columns.map(col => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          isPrimaryKey: col.isPrimaryKey,
          defaultValue: col.defaultValue,
          references: col.references
        })),
        constraints: table.constraints,
        apiEndpoint: `/rest/v1/${table.name}`,
        sampleQueries: this.generateSampleQueries(table.name)
      })),

      functions: functions.map(func => ({
        name: func.name,
        description: this.getFunctionDescription(func.name),
        parameters: func.parameters,
        returnType: func.returnType,
        apiEndpoint: `/rest/v1/rpc/${func.name}`,
        sampleCall: this.generateSampleRPCCall(func.name)
      })),

      relationshipMap: this.generateRelationshipMap(tables),
      
      apiPatterns: {
        crud: {
          create: "POST /rest/v1/{table}",
          read: "GET /rest/v1/{table}",
          update: "PATCH /rest/v1/{table}",
          delete: "DELETE /rest/v1/{table}"
        },
        filtering: {
          equals: "?column=eq.value",
          like: "?column=like.*pattern*",
          in: "?column=in.(value1,value2)",
          range: "?column=gte.min&column=lte.max"
        },
        pagination: {
          limit: "?limit=20",
          offset: "?offset=40",
          range: "Range: 0-19"
        }
      },

      businessLogic: {
        customerManagement: {
          description: "Quản lý thông tin khách hàng, phân loại và theo dõi công nợ",
          keyTables: ["customers", "customer_types"],
          workflows: [
            "Đăng ký khách hàng mới",
            "Cập nhật thông tin khách hàng", 
            "Theo dõi công nợ và thanh toán",
            "Phân loại khách hàng theo doanh thu"
          ]
        },
        orderProcessing: {
          description: "Xử lý đơn hàng từ tạo đến thanh toán",
          keyTables: ["invoices", "invoice_details", "products"],
          workflows: [
            "Tạo hóa đơn bán hàng",
            "Thêm sản phẩm vào hóa đơn",
            "Tính toán tổng tiền và thuế",
            "Xử lý thanh toán"
          ]
        }
      }
    }

    const docPath = path.join(this.outputDir, 'schema-analysis.json')
    await fs.writeFile(docPath, JSON.stringify(documentation, null, 2), 'utf8')
    console.log(`✅ Documentation generated: ${docPath}`)

    // Generate TypeScript interfaces
    await this.generateTypeScriptInterfaces(tables)
  }

  private getTableDescription(tableName: string): string {
    const descriptions: Record<string, string> = {
      customers: "Thông tin khách hàng bao gồm thông tin cá nhân, công nợ và thống kê mua hàng",
      customer_types: "Phân loại khách hàng (lẻ, sỉ, VIP) với các ưu đãi tương ứng",
      invoices: "Hóa đơn bán hàng với thông tin thanh toán và trạng thái",
      invoice_details: "Chi tiết sản phẩm trong từng hóa đơn",
      products: "Danh mục sản phẩm với thông tin giá, tồn kho và đặc tính thuốc thú y",
      product_categories: "Phân loại sản phẩm theo ngành hàng",
      branches: "Chi nhánh cửa hàng",
      suppliers: "Nhà cung cấp sản phẩm"
    }
    return descriptions[tableName] || `Bảng ${tableName}`
  }

  private getFunctionDescription(funcName: string): string {
    const descriptions: Record<string, string> = {
      search_customers_with_stats: "Tìm kiếm khách hàng kèm thống kê doanh thu và tần suất mua hàng",
      get_financial_summary: "Báo cáo tài chính tổng quan theo khoảng thời gian",
      get_pharmacy_dashboard_stats: "Thống kê dashboard cho cửa hàng thú y",
      search_products_with_stats: "Tìm kiếm sản phẩm kèm thống kê bán hàng"
    }
    return descriptions[funcName] || `Function ${funcName}`
  }

  private generateSampleQueries(tableName: string): string[] {
    const baseUrl = `/rest/v1/${tableName}`
    return [
      `GET ${baseUrl}?select=*&limit=10`,
      `GET ${baseUrl}?select=*&is_active=eq.true`,
      `POST ${baseUrl}`,
      `PATCH ${baseUrl}?id=eq.1`,
      `DELETE ${baseUrl}?id=eq.1`
    ]
  }

  private generateSampleRPCCall(funcName: string): string {
    const samples: Record<string, string> = {
      search_customers_with_stats: `POST /rest/v1/rpc/${funcName}
{
  "search_term": "nguyen",
  "customer_type_filter": null,
  "limit_count": 20
}`,
      get_financial_summary: `POST /rest/v1/rpc/${funcName}
{
  "date_from": "2025-07-01",
  "date_to": "2025-07-31"
}`
    }
    return samples[funcName] || `POST /rest/v1/rpc/${funcName}\n{}`
  }

  private generateRelationshipMap(tables: TableInfo[]): Record<string, string[]> {
    const relationships: Record<string, string[]> = {}
    
    for (const table of tables) {
      relationships[table.name] = []
      
      for (const column of table.columns) {
        if (column.references) {
          relationships[table.name].push(`${column.name} → ${column.references}`)
        }
      }
    }
    
    return relationships
  }

  private async generateTypeScriptInterfaces(tables: TableInfo[]): Promise<void> {
    console.log('🔧 Generating TypeScript interfaces...')
    
    let tsContent = `// Auto-generated TypeScript interfaces from database schema
// Generated at: ${new Date().toISOString()}

`

    for (const table of tables) {
      const interfaceName = this.toPascalCase(table.name.replace(/s$/, '')) // Remove 's' suffix
      
      tsContent += `export interface ${interfaceName} {\n`
      
      for (const column of table.columns) {
        const optional = column.nullable ? '?' : ''
        const tsType = this.mapPostgresToTypeScript(column.type)
        tsContent += `  ${column.name}${optional}: ${tsType}\n`
      }
      
      tsContent += `}\n\n`
    }

    const tsPath = path.join(this.outputDir, 'database-types.ts')
    await fs.writeFile(tsPath, tsContent, 'utf8')
    console.log(`✅ TypeScript interfaces generated: ${tsPath}`)
  }

  private toPascalCase(str: string): string {
    return str.replace(/(^\w|_\w)/g, match => match.replace('_', '').toUpperCase())
  }

  private mapPostgresToTypeScript(pgType: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'number',
      'bigint': 'number', 
      'numeric': 'number',
      'decimal': 'number',
      'real': 'number',
      'double': 'number',
      'text': 'string',
      'varchar': 'string',
      'char': 'string',
      'boolean': 'boolean',
      'timestamp': 'string',
      'date': 'string',
      'time': 'string',
      'json': 'any',
      'jsonb': 'any'
    }

    // Extract base type (remove length specifications)
    const baseType = pgType.split('(')[0].toLowerCase()
    return typeMap[baseType] || 'unknown'
  }

  async runAnalysis(): Promise<void> {
    console.log('🚀 Starting Offline Schema Analysis...')
    console.log('=' .repeat(60))

    try {
      await this.loadSchemaFile()
      const tables = this.extractTables()
      
      console.log(`\n📊 Analysis Results:`)
      console.log(`- Tables found: ${tables.length}`)
      console.log(`- Total columns: ${tables.reduce((sum, t) => sum + t.columns.length, 0)}`)
      
      console.log(`\n📋 Key Tables:`)
      const keyTables = ['customers', 'invoices', 'products', 'customer_types']
      for (const tableName of keyTables) {
        const table = tables.find(t => t.name === tableName)
        if (table) {
          console.log(`  ✅ ${tableName}: ${table.columns.length} columns`)
        } else {
          console.log(`  ⚠️  ${tableName}: not found`)
        }
      }

      await this.generateDocumentation(tables)

      console.log('\n' + '=' .repeat(60))
      console.log('🎉 Offline analysis completed successfully!')
      console.log('📁 Check ./docs/api/ folder for generated files')

    } catch (error) {
      console.error('❌ Analysis failed:', error)
    }
  }
}

// Run the analyzer
async function main() {
  const analyzer = new OfflineSchemaAnalyzer()
  await analyzer.runAnalysis()
}

if (require.main === module) {
  main().catch(console.error)
}

export default OfflineSchemaAnalyzer
