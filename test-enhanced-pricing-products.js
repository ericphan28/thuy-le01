const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
);

async function getTestProducts() {
  console.log('🔍 ENHANCED PRICING TEST PRODUCTS');
  console.log('='.repeat(50));
  
  // Test products với pricing rules đặc biệt
  const testSKUs = ['SP000049', 'SP000380', 'SP000381', 'SP000384', 'SP000383'];
  
  for (const sku of testSKUs) {
    console.log(`\n📦 Product: ${sku}`);
    console.log('-'.repeat(30));
    
    // Get product info
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('product_id, product_code, product_name, sale_price, current_stock')
      .eq('product_code', sku)
      .single();
    
    if (productError || !product) {
      console.log(`❌ Product not found: ${sku}`);
      continue;
    }
    
    console.log(`Name: ${product.product_name}`);
    console.log(`Sale Price: ${new Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND'}).format(product.sale_price)}`);
    console.log(`Stock: ${product.current_stock}`);
    
    // Get pricing rules for this SKU
    const { data: rules, error: rulesError } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('target', sku)
      .eq('is_active', true);
    
    if (rules && rules.length > 0) {
      console.log('🏷️ Pricing Rules:');
      rules.forEach(rule => {
        console.log(`  - Type: ${rule.action_type}`);
        console.log(`  - Value: ${new Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND'}).format(rule.action_value)}`);
        if (rule.min_qty !== null) console.log(`  - Min Qty: ${rule.min_qty}`);
        if (rule.max_qty !== null) console.log(`  - Max Qty: ${rule.max_qty}`);
        
        // Calculate savings
        if (rule.action_type === 'net') {
          const savings = product.sale_price - rule.action_value;
          if (savings > 0) {
            console.log(`  - 💰 Savings: ${new Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND'}).format(savings)} (${((savings/product.sale_price)*100).toFixed(1)}%)`);
          }
        }
      });
    } else {
      console.log('❌ No active pricing rules found');
    }
  }
  
  // Test một số sản phẩm có volume tiers
  console.log('\n\n📊 VOLUME TIER PRODUCTS');
  console.log('='.repeat(50));
  
  const { data: tierProducts, error: tierError } = await supabase
    .from('volume_tier_products')
    .select(`
      product_id,
      volume_tiers!inner(tier_name, discount_percent, min_quantity, is_active),
      products(product_code, product_name, sale_price, current_stock)
    `)
    .eq('volume_tiers.is_active', true)
    .limit(5);
  
  if (tierProducts && tierProducts.length > 0) {
    tierProducts.forEach(item => {
      if (item.products) {
        console.log(`\n📦 ${item.products.product_code}: ${item.products.product_name}`);
        console.log(`Price: ${new Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND'}).format(item.products.sale_price)}`);
        console.log(`Stock: ${item.products.current_stock}`);
        console.log(`Volume Tier: ${item.volume_tiers.tier_name}`);
        console.log(`Discount: ${item.volume_tiers.discount_percent}% from ${item.volume_tiers.min_quantity} units`);
      }
    });
  } else {
    console.log('❌ No volume tier products found');
  }
  
  console.log('\n\n🚀 READY TO TEST!');
  console.log('='.repeat(50));
  console.log('👉 Open POS: http://localhost:3004/dashboard/pos');
  console.log('👉 Toggle Enhanced Pricing and test above products');
  console.log('👉 Check console for pricing calculation logs');
}

getTestProducts().catch(console.error);
