// Test simple POS function call để debug
// Chạy trong browser console của POS page

const testPOSFunction = async () => {
  console.log('🧪 Testing POS Function...')
  
  const supabase = window.supabase || createClient() // Assuming supabase is available
  
  // Test data đơn giản
  const testData = {
    p_customer_id: 1,
    p_cart_items: [{"product_id": 1, "quantity": 1, "unit_price": 10000}],
    p_vat_rate: 0,
    p_discount_type: 'percentage',
    p_discount_value: 0,
    p_payment_method: 'cash',
    p_received_amount: 10000,
    p_paid_amount: 10000,
    p_debt_amount: 0,
    p_payment_type: 'full',
    p_branch_id: 1,
    p_created_by: 'TEST'
  }
  
  console.log('📋 Test Data:', testData)
  
  try {
    const { data, error } = await supabase.rpc('create_pos_invoice', testData)
    
    console.log('✅ Function Response:', { data, error })
    
    if (error) {
      console.error('❌ Error:', error)
    } else {
      console.log('🎉 Success:', data)
    }
  } catch (err) {
    console.error('💥 Exception:', err)
  }
}

// Chạy test
testPOSFunction()
