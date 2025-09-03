const { unifiedPricingService } = require('./lib/services/unified-pricing-service.ts');

async function testUnifiedPricing() {
  console.log('🧪 TESTING UNIFIED PRICING SERVICE');
  console.log('='.repeat(60));
  
  const productCode = 'SP000049';
  const quantity = 1;
  const customerId = '1065'; // A HOÀNG HIẾU VỊT
  
  console.log(`📦 Product: ${productCode}`);
  console.log(`👤 Customer: ${customerId} (A HOÀNG HIẾU VỊT)`);
  console.log(`📊 Quantity: ${quantity}`);
  console.log('');
  
  try {
    const result = await unifiedPricingService.calculatePrice(productCode, quantity, {
      customer_id: customerId,
      price_book_id: 1,
      include_contract_pricing: true,
      include_price_rules: true,
      include_volume_tiers: true
    });
    
    console.log('🎯 PRICING RESULT:');
    console.log(`💰 List Price: ${result.list_price.toLocaleString()} VNĐ`);
    console.log(`🏷️ Contract Price: ${result.contract_price ? result.contract_price.toLocaleString() + ' VNĐ' : 'None'}`);
    console.log(`🔧 Rule Price: ${result.rule_price ? result.rule_price.toLocaleString() + ' VNĐ' : 'None'}`);
    console.log(`📈 Volume Tier Price: ${result.volume_tier_price ? result.volume_tier_price.toLocaleString() + ' VNĐ' : 'None'}`);
    console.log('');
    console.log(`⭐ FINAL PRICE: ${result.final_price.toLocaleString()} VNĐ`);
    console.log(`📍 Source: ${result.pricing_source}`);
    console.log(`💵 Savings: ${result.final_savings.toLocaleString()} VNĐ (${result.final_savings_percent.toFixed(1)}%)`);
    
    console.log('');
    console.log('📋 BREAKDOWN:');
    console.log(`- Original: ${result.breakdown.original_price.toLocaleString()} VNĐ`);
    console.log(`- Contract Discount: ${result.breakdown.contract_discount.toLocaleString()} VNĐ`);
    console.log(`- Rule Discount: ${result.breakdown.rule_discount.toLocaleString()} VNĐ`);
    console.log(`- Volume Discount: ${result.breakdown.volume_discount.toLocaleString()} VNĐ`);
    console.log(`- Tax: ${result.breakdown.tax_amount.toLocaleString()} VNĐ`);
    console.log(`- Total: ${result.breakdown.total_amount.toLocaleString()} VNĐ`);
    
    if (result.applied_rule) {
      console.log('');
      console.log('🔧 APPLIED RULE:');
      console.log(`- ID: ${result.applied_rule.id}`);
      console.log(`- Reason: ${result.applied_rule.reason}`);
      console.log(`- Discount: ${result.applied_rule.discount_amount.toLocaleString()} VNĐ (${result.applied_rule.discount_percent.toFixed(1)}%)`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testUnifiedPricing().catch(console.error);
