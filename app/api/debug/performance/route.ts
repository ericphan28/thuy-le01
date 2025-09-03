import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Test various queries with timing
    const tests = []
    
    // Test 1: Products query (POS page)
    const startProducts = Date.now()
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('product_id, product_code, product_name, sale_price, base_price, current_stock, category_id, is_active, allow_sale')
      .eq('is_active', true)
      .eq('allow_sale', true)
      .order('product_name')
      .range(0, 19) // First 20 items
    const productsTime = Date.now() - startProducts
    
    tests.push({
      name: 'Products Query (POS)',
      time: productsTime,
      count: products?.length || 0,
      error: productsError?.message
    })
    
    // Test 2: Customers query
    const startCustomers = Date.now()
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('customer_id, customer_name, customer_code, phone, current_debt, debt_limit')
      .eq('is_active', true)
      .order('customer_name')
      .limit(50)
    const customersTime = Date.now() - startCustomers
    
    tests.push({
      name: 'Customers Query',
      time: customersTime,
      count: customers?.length || 0,
      error: customersError?.message
    })
    
    // Test 3: Recent invoices query
    const startInvoices = Date.now()
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select(`
        invoice_id,
        invoice_code,
        customer_id,
        total_amount,
        paid_amount,
        debt_amount,
        created_at,
        customers!inner(customer_name)
      `)
      .order('created_at', { ascending: false })
      .limit(20)
    const invoicesTime = Date.now() - startInvoices
    
    tests.push({
      name: 'Recent Invoices Query',
      time: invoicesTime,
      count: invoices?.length || 0,
      error: invoicesError?.message
    })
    
    // Test 4: Invoice details for a specific invoice
    const startInvoiceDetails = Date.now()
    const { data: invoiceDetails, error: detailsError } = await supabase
      .from('invoice_details')
      .select(`
        detail_id,
        invoice_id,
        product_id,
        product_code,
        product_name,
        quantity,
        unit_price,
        total_price,
        products!inner(product_name, current_stock)
      `)
      .limit(100)
    const invoiceDetailsTime = Date.now() - startInvoiceDetails
    
    tests.push({
      name: 'Invoice Details Query',
      time: invoiceDetailsTime,
      count: invoiceDetails?.length || 0,
      error: detailsError?.message
    })
    
    // Test 5: Contract pricing query
    const startContract = Date.now()
    const { data: contractPrices, error: contractError } = await supabase
      .from('contract_prices')
      .select(`
        contract_id,
        customer_id,
        product_id,
        net_price,
        is_active,
        customers!inner(customer_name),
        products!inner(product_code, product_name)
      `)
      .eq('is_active', true)
      .limit(50)
    const contractTime = Date.now() - startContract
    
    tests.push({
      name: 'Contract Prices Query',
      time: contractTime,
      count: contractPrices?.length || 0,
      error: contractError?.message
    })
    
    // Test 6: Database stats
    const startStats = Date.now()
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
    
    const { count: totalCustomers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
    
    const { count: totalInvoices } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
    
    const statsTime = Date.now() - startStats
    
    tests.push({
      name: 'Database Counts',
      time: statsTime,
      count: `P:${totalProducts}, C:${totalCustomers}, I:${totalInvoices}`,
      error: null
    })
    
    // Calculate total time
    const totalTime = tests.reduce((sum, test) => sum + test.time, 0)
    
    return NextResponse.json({
      success: true,
      totalTime,
      tests,
      recommendations: {
        slow: tests.filter(t => t.time > 1000),
        fast: tests.filter(t => t.time < 200),
        errors: tests.filter(t => t.error)
      }
    })
    
  } catch (error) {
    console.error('Performance test error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
