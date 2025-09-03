const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
);

async function checkContractPrices() {
  console.log('🔍 Checking contract_prices table...');
  
  const { data: contracts, error } = await supabase
    .from('contract_prices')
    .select('*')
    .limit(5);
    
  console.log('Contract prices:', contracts);
  console.log('Error:', error);
  
  // Find contracts for specific product
  if (contracts && contracts.length > 0) {
    const { data: productContract } = await supabase
      .from('contract_prices')
      .select(`*,
        customers(customer_name),
        products(product_code, product_name)
      `)
      .eq('is_active', true)
      .limit(10);
      
    console.log('Product contracts with details:');
    productContract?.forEach(contract => {
      console.log(`Customer: ${contract.customers?.customer_name}, Product: ${contract.products?.product_code} - ${contract.products?.product_name}, Price: ${contract.net_price}`);
    });
  }
}

checkContractPrices().catch(console.error);
