// Test fix for SP000049 pricing issue
// After disabling tag rules, should return 190k instead of 215k

const { createClient } = require('@supabase/supabase-js');

async function testPricingFix() {
  console.log('=== TESTING SP000049 PRICING FIX ===\n');
  
  try {
    // Test with the actual API endpoint
    const testCases = [
      { qty: 1, expected: 190000, description: 'Single item - should use net price rule' },
      { qty: 2, expected: 190000, description: '2 items - should use net price rule' },
      { qty: 10, expected: 190000, description: '10 items - should use net price rule (was 215k before fix)' },
      { qty: 30, expected: 190000, description: 'Max qty for net price rule' },
      { qty: 35, expected: 215000, description: 'Over 30 items - should use amount discount rule' }
    ];
    
    for (const testCase of testCases) {
      console.log(`--- Testing qty=${testCase.qty} ---`);
      console.log(`Expected: ${testCase.expected}₫`);
      console.log(`Description: ${testCase.description}`);
      
      try {
        const response = await fetch('http://localhost:3002/api/pricing/simulate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            price_book_id: 1,
            sku: 'SP000049',
            qty: testCase.qty
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          const actual = result.final_price;
          const status = actual === testCase.expected ? '✅ CORRECT' : '❌ ERROR';
          
          console.log(`Actual: ${actual}₫ ${status}`);
          console.log(`Applied Rule: ${result.applied_rule_id}`);
          console.log(`Reason: ${result.applied_reason}`);
          
          if (actual !== testCase.expected) {
            console.log(`⚠️  Expected ${testCase.expected}₫ but got ${actual}₫`);
          }
        } else {
          console.log('❌ API Error:', response.status);
        }
      } catch (error) {
        console.log('❌ Request failed:', error.message);
      }
      
      console.log('');
    }
    
    console.log('=== FIX SUMMARY ===');
    console.log('✅ Disabled tag rules (Rule 667) to prevent incorrect priority application');
    console.log('✅ SP000049 should now correctly use Rule 1 (net 190k) for qty 1-30');
    console.log('✅ Only Rule 672 (amount discount) should apply for qty > 30');
    console.log('');
    console.log('Expected behavior:');
    console.log('- qty 1-30: 190,000₫ (Rule 1 - net price)');
    console.log('- qty 31+: 215,000₫ (Rule 672 - amount discount)');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testPricingFix();
