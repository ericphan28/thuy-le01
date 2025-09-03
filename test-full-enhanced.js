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

async function testFullEnhancedPricing() {
  console.log('🚀 FULL ENHANCED PRICING TEST WITH CONTRACT');
  console.log('='.repeat(60));
  
  const customerId = '1065'; // A HOÀNG HIẾU VỊT
  const productCode = 'SP000049'; // #AGR POX (1000DS)
  
  console.log(`👤 Customer: A HOÀNG HIẾU VỊT (ID: ${customerId})`);
  console.log(`📦 Product: ${productCode} - #AGR POX (1000DS)`);
  console.log('');
  
  // Step 1: Contract pricing
  console.log('🏷️ Step 1: Contract Price Lookup');
  const contractPrice = await getContractPrice(productCode, customerId);
  console.log(`Contract Price: ${contractPrice ? contractPrice.toLocaleString() + ' VNĐ' : 'None'}`);
  
  // Step 2: API pricing  
  console.log('\n🔧 Step 2: API Pricing Lookup');
  try {
    const response = await fetch('http://localhost:3002/api/pricing/simulate', {
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
      console.log(`API Price: ${apiResult.finalPrice?.toLocaleString()} VNĐ`);
      
      // Step 3: Enhanced Pricing logic
      console.log('\n💡 Step 3: Enhanced Pricing Decision');
      
      let finalPrice = apiResult.finalPrice; // Default to API price
      let pricingSource = 'api_rules';
      
      if (contractPrice) {
        finalPrice = contractPrice; // Contract price has highest priority
        pricingSource = 'contract';
        console.log('✅ Contract price found - using contract pricing!');
      } else {
        console.log('📊 No contract - using API pricing');
      }
      
      console.log('\n🎯 FINAL RESULT:');
      console.log(`💰 Final Price: ${finalPrice.toLocaleString()} VNĐ`);
      console.log(`📍 Source: ${pricingSource}`);
      
      if (contractPrice && apiResult.finalPrice) {
        const savings = Math.abs(contractPrice - apiResult.finalPrice);
        if (contractPrice < apiResult.finalPrice) {
          console.log(`💵 Customer saves: ${savings.toLocaleString()} VNĐ with contract!`);
        } else {
          console.log(`📈 Contract price is ${savings.toLocaleString()} VNĐ higher than rules`);
        }
      }
      
    } else {
      console.log('❌ API pricing failed:', response.status);
    }
  } catch (error) {
    console.log('❌ API pricing error:', error.message);
  }
}

testFullEnhancedPricing().catch(console.error);
