import { simulatePrice } from './lib/pricing/engine';

console.log('=== PRICING ENGINE TEST ===');
console.log('Testing SP000049 with expected result: 220,000₫ → 190,000₫');
console.log('');

async function testPricing() {
  try {
    const result = await simulatePrice({
      price_book_id: 1,
      sku: 'SP000049',
      qty: 1
    });
    
    console.log('=== TEST RESULT ===');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('');
    console.log('List Price:', result.list_price);
    console.log('Final Price:', result.final_price);
    console.log('Applied Rule ID:', result.applied_rule_id);
    console.log('Applied Reason:', result.applied_reason);
    console.log('===================');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testPricing();
