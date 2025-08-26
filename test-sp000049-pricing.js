// Test Pricing Logic for SP000049 - #AGR POX (1000DS)
// Based on actual database data from backup_thuyle_complete.sql

console.log('=== SP000049 PRICING ANALYSIS ===');
console.log('Product: #AGR POX (1000DS)');
console.log('Base Price: 220,000₫');
console.log('Sale Price: 220,000₫');
console.log('');

// Price Rules từ database thực tế
const priceRules = [
  {
    rule_id: 1,
    scope: 'sku',
    sku_code: 'SP000049',
    action_type: 'net',
    action_value: 190000.00,
    min_qty: 1.00,
    max_qty: 30.00,
    priority: 100,
    is_active: true,
    notes: 'Updated to support qty=1 - Fixed pricing rule for SP000049'
  },
  {
    rule_id: 672,
    scope: 'sku', 
    sku_code: 'SP000049',
    action_type: 'amount',
    action_value: 5000.00,
    min_qty: 3.00,
    max_qty: null,
    priority: 100,
    is_active: true,
    notes: 'Amount discount rule'
  },
  {
    rule_id: 651,
    scope: 'sku',
    sku_code: 'SP000049', 
    action_type: 'net',
    action_value: 220000.00,
    min_qty: null,
    max_qty: null,
    priority: 100,
    is_active: false,
    notes: 'Disabled - Duplicates rule 1 functionality after rule 1 was updated'
  }
];

// Test scenarios
const scenarios = [
  { qty: 1, expected_rule: 1, expected_price: 190000, description: 'Single item - should use net price 190k' },
  { qty: 2, expected_rule: 1, expected_price: 190000, description: '2 items - should use net price 190k' },
  { qty: 3, expected_rule: 672, expected_price: 215000, description: '3 items - can use amount discount (220k - 5k = 215k)' },
  { qty: 5, expected_rule: 672, expected_price: 215000, description: '5 items - amount discount applies' },
  { qty: 10, expected_rule: 672, expected_price: 215000, description: '10 items - amount discount applies' },
  { qty: 35, expected_rule: null, expected_price: 220000, description: 'Over 30 items - no rules apply, base price' }
];

function testPricing(qty) {
  console.log(`\n--- Testing Quantity: ${qty} ---`);
  
  // Filter active rules
  const activeRules = priceRules.filter(rule => rule.is_active);
  console.log(`Active Rules: ${activeRules.map(r => r.rule_id).join(', ')}`);
  
  // Find applicable rules
  const applicableRules = activeRules.filter(rule => {
    const minQtyOk = !rule.min_qty || qty >= rule.min_qty;
    const maxQtyOk = !rule.max_qty || qty <= rule.max_qty;
    return minQtyOk && maxQtyOk;
  });
  
  console.log(`Applicable Rules: ${applicableRules.map(r => `${r.rule_id}(${r.action_type})`).join(', ')}`);
  
  if (applicableRules.length === 0) {
    console.log(`Result: Base price 220,000₫ (no applicable rules)`);
    return 220000;
  }
  
  // Sort by priority (lower number = higher priority)
  applicableRules.sort((a, b) => a.priority - b.priority);
  
  // Apply rules by action type preference: net > amount > percent
  const netRules = applicableRules.filter(r => r.action_type === 'net');
  const amountRules = applicableRules.filter(r => r.action_type === 'amount');
  const percentRules = applicableRules.filter(r => r.action_type === 'percent');
  
  let finalPrice = 220000; // base price
  let appliedRule = null;
  
  // Apply net rules first (fixed price)
  if (netRules.length > 0) {
    appliedRule = netRules[0];
    finalPrice = appliedRule.action_value;
    console.log(`Applied Rule ${appliedRule.rule_id} (net): Fixed price ${finalPrice}₫`);
  }
  // Then amount rules (discount amount)
  else if (amountRules.length > 0) {
    appliedRule = amountRules[0];
    finalPrice = Math.max(0, 220000 - appliedRule.action_value);
    console.log(`Applied Rule ${appliedRule.rule_id} (amount): 220,000₫ - ${appliedRule.action_value}₫ = ${finalPrice}₫`);
  }
  // Finally percent rules
  else if (percentRules.length > 0) {
    appliedRule = percentRules[0];
    finalPrice = 220000 * (1 - appliedRule.action_value / 100);
    console.log(`Applied Rule ${appliedRule.rule_id} (percent): ${finalPrice}₫`);
  }
  
  console.log(`Result: ${finalPrice}₫ (Rule ${appliedRule?.rule_id || 'none'})`);
  return finalPrice;
}

// Run all test scenarios
scenarios.forEach(scenario => {
  const result = testPricing(scenario.qty);
  const status = result === scenario.expected_price ? '✅ CORRECT' : '❌ ERROR';
  console.log(`Expected: ${scenario.expected_price}₫, Got: ${result}₫ ${status}`);
  console.log(`Description: ${scenario.description}`);
});

console.log('\n=== SUMMARY ===');
console.log('Dữ liệu thực tế cho thấy:');
console.log('- Với qty 1-2: Sử dụng Rule 1 (net 190,000₫)');
console.log('- Với qty 3+: Có thể sử dụng Rule 672 (amount discount 5,000₫) => 215,000₫');
console.log('- Với qty >30: Không có rule nào áp dụng => 220,000₫ base price');
console.log('');
console.log('Giá trong hình cho thấy:');
console.log('- Giá niêm yết: 220,000₫ (base price)');
console.log('- Giá cuối: 215,000₫ (có vẻ như áp dụng amount discount rule)');
console.log('- Quy tắc trong hình: "Giá cố định 190,000₫" (Rule 1)');
console.log('');
console.log('❓ Câu hỏi: Tại sao giá cuối là 215k thay vì 190k?');
console.log('💡 Giải thích có thể:');
console.log('1. Số lượng trong test >= 3 => Rule 672 (amount) được áp dụng');
console.log('2. Hoặc có logic ưu tiên khác trong pricing engine');
console.log('3. Hoặc có rule HOT tag được áp dụng (cần kiểm tra product tags)');
