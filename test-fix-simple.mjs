// Simple test để verify pricing fix
import { simulatePrice } from './lib/pricing/engine.js';

async function testFix() {
  console.log('=== TESTING PRICING FIX ===\n');
  
  const testCases = [
    { qty: 1, expected: 190000 },
    { qty: 10, expected: 190000 }, // This was 215k before fix
    { qty: 35, expected: 215000 }
  ];
  
  for (const { qty, expected } of testCases) {
    try {
      const result = await simulatePrice({
        price_book_id: 1,
        sku: 'SP000049', 
        qty: qty
      });
      
      const actual = result.final_price;
      const status = actual === expected ? '✅ CORRECT' : '❌ ERROR';
      
      console.log(`qty=${qty}: Expected ${expected}₫, Got ${actual}₫ ${status}`);
      console.log(`  Rule: ${result.applied_rule_id}, Reason: ${result.applied_reason}`);
    } catch (error) {
      console.log(`qty=${qty}: Error - ${error.message}`);
    }
  }
}

testFix().catch(console.error);
