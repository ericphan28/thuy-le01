import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { action } = await request.json()
    
    const results = []
    
    if (action === 'create_indexes' || action === 'all') {
      // Create essential indexes for POS performance
      const indexes = [
        {
          name: 'POS Products Optimization',
          sql: `CREATE INDEX IF NOT EXISTS idx_products_pos_optimized 
                ON products (is_active, allow_sale, product_name) 
                WHERE is_active = true AND allow_sale = true;`
        },
        {
          name: 'Product Search Optimization',
          sql: `CREATE INDEX IF NOT EXISTS idx_products_search_optimized
                ON products (product_code, product_name, is_active, allow_sale)
                WHERE is_active = true AND allow_sale = true;`
        },
        {
          name: 'Stock Check Optimization',
          sql: `CREATE INDEX IF NOT EXISTS idx_products_stock_check
                ON products (product_id, current_stock, is_active)
                WHERE is_active = true AND current_stock > 0;`
        },
        {
          name: 'Recent Invoices Optimization',
          sql: `CREATE INDEX IF NOT EXISTS idx_invoices_recent_with_customer
                ON invoices (created_at DESC, customer_id, invoice_code);`
        },
        {
          name: 'Invoice Details Covering Index',
          sql: `CREATE INDEX IF NOT EXISTS idx_invoice_details_covering
                ON invoice_details (invoice_id, product_id, quantity, unit_price, total_price);`
        },
        {
          name: 'Contract Pricing Lookup',
          sql: `CREATE INDEX IF NOT EXISTS idx_contract_prices_enhanced_lookup
                ON contract_prices (customer_id, product_id, is_active, net_price)
                WHERE is_active = true;`
        },
        {
          name: 'Customer Search Optimization',
          sql: `CREATE INDEX IF NOT EXISTS idx_customers_search_optimized
                ON customers (customer_name, customer_code, phone, is_active)
                WHERE is_active = true;`
        }
      ]
      
      for (const index of indexes) {
        try {
          const start = Date.now()
          await supabase.rpc('execute_sql', { sql_statement: index.sql })
          const time = Date.now() - start
          
          results.push({
            name: index.name,
            status: 'success',
            time: `${time}ms`
          })
        } catch (error) {
          results.push({
            name: index.name,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
    }
    
    if (action === 'analyze' || action === 'all') {
      // Run ANALYZE on critical tables
      const tables = ['products', 'customers', 'invoices', 'invoice_details', 'contract_prices']
      
      for (const table of tables) {
        try {
          const start = Date.now()
          await supabase.rpc('execute_sql', { sql_statement: `ANALYZE ${table};` })
          const time = Date.now() - start
          
          results.push({
            name: `ANALYZE ${table}`,
            status: 'success',
            time: `${time}ms`
          })
        } catch (error) {
          results.push({
            name: `ANALYZE ${table}`,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      action,
      results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length
      }
    })
    
  } catch (error) {
    console.error('Database optimization error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Database Optimization API',
    actions: [
      'create_indexes - Create performance indexes',
      'analyze - Run ANALYZE on tables',
      'all - Run both create_indexes and analyze'
    ],
    usage: 'POST /api/debug/optimize with { "action": "all" }'
  })
}
