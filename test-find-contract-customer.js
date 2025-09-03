const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
);

async function findContractCustomer() {
  console.log('🔍 Finding customer for contract price 185,000...');
  
  // Get customer for product_id 1755 (SP000049) with price 185000
  const { data: contract } = await supabase
    .from('contract_prices')
    .select(`
      *,
      customers(customer_id, customer_name, customer_code),
      products(product_code, product_name)
    `)
    .eq('product_id', 1755)
    .eq('net_price', 185000)
    .eq('is_active', true)
    .maybeSingle();
    
  console.log('Found contract:', contract);
  
  if (contract) {
    console.log(`✅ Customer found: ${contract.customers.customer_name} (ID: ${contract.customers.customer_id})`);
    console.log(`📦 Product: ${contract.products.product_code} - ${contract.products.product_name}`);
    console.log(`💰 Contract Price: ${contract.net_price.toLocaleString()} VNĐ`);
  }
}

findContractCustomer().catch(console.error);
