const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
);

// Simulate Enhanced Pricing Service contract check
async function getContractPrice(productCode, customerId) {
  try {
    // Get product_id first
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('product_id')
      .eq('product_code', productCode)
      .maybeSingle()

    if (productError || !product) {
      console.error('Product lookup error:', productError)
      return null
    }

    console.log(`📦 Found product ${productCode} with ID: ${product.product_id}`);

    // Check contract price by product_id and customer_id
    const { data, error } = await supabase
      .from('contract_prices')
      .select('net_price')
      .eq('customer_id', parseInt(customerId))
      .eq('product_id', product.product_id)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.error('Contract price lookup error:', error)
      return null
    }

    return data?.net_price || null
  } catch (error) {
    console.error('Contract price service error:', error)
    return null
  }
}

async function testEnhancedContractPricing() {
  console.log('🧪 TESTING ENHANCED PRICING SERVICE WITH CONTRACT');
  console.log('='.repeat(60));
  
  const customerId = '1065'; // A HOÀNG HIẾU VỊT
  const productCode = 'SP000049'; // #AGR POX (1000DS)
  
  console.log(`👤 Customer ID: ${customerId}`);
  console.log(`📦 Product Code: ${productCode}`);
  console.log('');
  
  // Test contract pricing lookup
  console.log('🔍 Step 1: Contract Price Lookup');
  const contractPrice = await getContractPrice(productCode, customerId);
  
  if (contractPrice) {
    console.log(`✅ Contract price found: ${contractPrice.toLocaleString()} VNĐ`);
  } else {
    console.log('❌ No contract price found');
  }
  
  // Test API pricing for comparison
  console.log('\\n🔍 Step 2: API Pricing Lookup');
  try {
    const response = await fetch('http://localhost:3000/api/pricing/simulate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sku: productCode,
        qty: 1,
        when: new Date().toISOString(),
        customer_id: customerId
      })
    });

    if (response.ok) {
      const apiResult = await response.json();
      console.log(`📊 API result: ${apiResult.finalPrice?.toLocaleString()} VNĐ`);
      
      if (contractPrice && apiResult.finalPrice) {
        console.log('\\n📈 PRICING COMPARISON:');
        console.log(`🏷️  Contract Price: ${contractPrice.toLocaleString()} VNĐ`);
        console.log(`🔧 API Price: ${apiResult.finalPrice.toLocaleString()} VNĐ`);
        console.log(`💡 Enhanced Pricing should use: ${Math.min(contractPrice, apiResult.finalPrice).toLocaleString()} VNĐ`);
        
        if (contractPrice < apiResult.finalPrice) {
          console.log('✅ Contract price is better - should be prioritized!');
        } else {
          console.log('🔧 API price is better');
        }
      }
    } else {
      console.log('❌ API pricing failed');
    }
  } catch (error) {
    console.log('❌ API pricing error:', error.message);
  }
}

testEnhancedContractPricing().catch(console.error);
