import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Query để kiểm tra slow queries và missing indexes
    const { data: slowQueries, error } = await supabase.rpc('get_slow_queries')
    
    // Kiểm tra các query patterns phổ biến
    const recommendations = [
      {
        table: 'products',
        issue: 'Large table scan for POS',
        suggestion: 'Composite index on (is_active, allow_sale, product_name)',
        query: 'CREATE INDEX IF NOT EXISTS idx_products_pos_composite ON products (is_active, allow_sale, product_name);'
      },
      {
        table: 'invoices',
        issue: 'Customer lookup slow',
        suggestion: 'Composite index on (customer_id, created_at DESC)',
        query: 'CREATE INDEX IF NOT EXISTS idx_invoices_customer_date ON invoices (customer_id, created_at DESC);'
      },
      {
        table: 'invoice_details',
        issue: 'Invoice detail joins slow',
        suggestion: 'Covering index for invoice details',
        query: 'CREATE INDEX IF NOT EXISTS idx_invoice_details_covering ON invoice_details (invoice_id) INCLUDE (product_id, quantity, unit_price, total_price);'
      },
      {
        table: 'contract_prices',
        issue: 'Contract price lookup slow',
        suggestion: 'Composite index for customer-product lookup',
        query: 'CREATE INDEX IF NOT EXISTS idx_contract_prices_lookup ON contract_prices (customer_id, product_id, is_active);'
      },
      {
        table: 'stock_movements',
        issue: 'Stock tracking slow',
        suggestion: 'Composite index for product stock queries',
        query: 'CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date ON stock_movements (product_id, movement_date DESC);'
      }
    ]
    
    // Kiểm tra table sizes
    const { data: tableSizes } = await supabase.rpc('get_table_sizes')
    
    return NextResponse.json({
      success: true,
      slowQueries: slowQueries || [],
      tableSizes: tableSizes || [],
      recommendations,
      indexOptimizations: [
        'Kiểm tra và tạo missing indexes cho queries thường dùng',
        'Optimize composite indexes cho POS queries',
        'Thêm covering indexes cho invoice lookups',
        'Partition large tables nếu cần',
        'Analyze và vacuum tables định kỳ'
      ]
    })
    
  } catch (error) {
    console.error('Database analysis error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      note: 'Some RPC functions may not exist, this is normal'
    }, { status: 200 }) // Return 200 to avoid errors
  }
}
