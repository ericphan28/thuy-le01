const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
);

async function testContractPricing() {
  console.log('🧪 TESTING CONTRACT PRICING INTEGRATION');
  console.log('='.repeat(60));
  
  // Simulate Enhanced Pricing Service contract check
  async function getContractPrice(productCode, customerId) {
    try {
      const { data, error } = await supabase
        .from('pricing_contracts')
        .select(`
          contract_id,
          pricing_contract_items!inner(
            product_code,
            contract_price
          )
        `)
        .eq('customer_id', customerId)
        .eq('is_active', true)
        .eq('pricing_contract_items.product_code', productCode)
        .maybeSingle()

      if (error) {
        console.error('Contract price lookup error:', error)
        return null
      }

      return data?.pricing_contract_items?.[0]?.contract_price || null
    } catch (error) {
      console.error('Contract price service error:', error)
      return null
    }
  }
  
  // Test with A HOANG HIẾU VIT customer
  console.log('👤 Testing customer: A HOANG HIẾU VIT');
  
  // Find customer
  const { data: customers } = await supabase
    .from('customers')
    .select('customer_id, customer_name')
    .ilike('customer_name', '%HOANG HIẾU VIT%')
    .limit(1);
    
  if (customers && customers.length > 0) {
    const customer = customers[0];
    console.log('Found customer:', customer);
    
    // Test contract pricing for SP000049
    const contractPrice = await getContractPrice('SP000049', customer.customer_id);
    console.log(`🏷️ Contract price for SP000049: ${contractPrice}`);
    
    if (contractPrice) {
      console.log('✅ Contract pricing working correctly!');
      console.log(`💰 Expected: 185,000 VNĐ, Got: ${contractPrice.toLocaleString()} VNĐ`);
    } else {
      console.log('❌ Contract pricing not found');
    }
  } else {
    console.log('❌ Customer not found');
  }
}

testContractPricing().catch(console.error);
