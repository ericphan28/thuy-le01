const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
);

async function checkContract() {
  // Get contract with customer info
  const { data: contracts } = await supabase
    .from('pricing_contracts')
    .select(`
      *,
      customers(customer_id, customer_name, customer_code)
    `)
    .eq('contract_id', 1);
    
  console.log('📋 Contract 1 info:', JSON.stringify(contracts, null, 2));
  
  if (contracts && contracts.length > 0) {
    const contract = contracts[0];
    console.log('Customer info:', contract.customers);
    
    // Test contract items
    const { data: items } = await supabase
      .from('pricing_contract_items')
      .select('*')
      .eq('contract_id', 1)
      .eq('product_code', 'SP000049');
      
    console.log('Contract items for SP000049:', items);
  }
}

checkContract().catch(console.error);
