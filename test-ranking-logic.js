// Test ranking logic với dữ liệu thực từ database
console.log('=== RANKING RULES TEST ===');

// Rules thực tế cho SP000049
const rules = [
  {
    id: 1,
    scope: 'sku',
    target: 'SP000049',
    action_type: 'net',
    action_value: 190000,
    priority: 100,
    min_qty: 1,
    max_qty: 30,
    is_active: true
  },
  {
    id: 672,
    scope: 'sku', 
    target: 'SP000049',
    action_type: 'amount',
    action_value: 5000,
    min_qty: 3,
    max_qty: null,
    priority: 100,
    is_active: true
  }
];

function rankRules(rules) {
  // specificity: sku > category > tag > all
  const specScore = {
    sku: 3,
    category: 2,
    tag: 1,
    all: 0
  };
  
  return [...rules].sort((a, b) => {
    console.log(`Comparing Rule ${a.id} vs Rule ${b.id}:`);
    console.log(`  Priority: ${a.priority} vs ${b.priority}`);
    console.log(`  Scope: ${a.scope}(${specScore[a.scope]}) vs ${b.scope}(${specScore[b.scope]})`);
    console.log(`  ID: ${a.id} vs ${b.id}`);
    
    if (a.priority !== b.priority) {
      const result = b.priority - a.priority;
      console.log(`  → Priority diff: ${result} (${result > 0 ? 'b wins' : 'a wins'})`);
      return result;
    }
    if (specScore[a.scope] !== specScore[b.scope]) {
      const result = specScore[b.scope] - specScore[a.scope];
      console.log(`  → Scope diff: ${result} (${result > 0 ? 'b wins' : 'a wins'})`);
      return result;
    }
    const result = a.id - b.id;
    console.log(`  → ID diff: ${result} (${result > 0 ? 'b wins' : 'a wins'})`);
    return result;
  });
}

console.log('Original rules:', rules.map(r => `${r.id}(${r.action_type})`));

const ranked = rankRules(rules);
console.log('\nRanked rules:', ranked.map(r => `${r.id}(${r.action_type})`));

console.log('\n=== TEST SCENARIOS ===');

function testScenario(qty, description) {
  console.log(`\n--- ${description} (qty=${qty}) ---`);
  
  // Filter applicable rules
  const applicable = rules.filter(r => {
    const minOk = !r.min_qty || qty >= r.min_qty;
    const maxOk = !r.max_qty || qty <= r.max_qty;
    return minOk && maxOk;
  });
  
  console.log('Applicable rules:', applicable.map(r => `${r.id}(${r.action_type}, min:${r.min_qty}, max:${r.max_qty})`));
  
  if (applicable.length === 0) {
    console.log('Result: No applicable rules');
    return;
  }
  
  const rankedApplicable = rankRules(applicable);
  const winner = rankedApplicable[0];
  
  let finalPrice;
  if (winner.action_type === 'net') {
    finalPrice = winner.action_value;
  } else if (winner.action_type === 'amount') {
    finalPrice = 220000 - winner.action_value;
  }
  
  console.log(`Winner: Rule ${winner.id} (${winner.action_type})`);
  console.log(`Final Price: ${finalPrice}₫`);
}

testScenario(1, 'Single item');
testScenario(3, '3 items - both rules apply');
testScenario(10, '10 items - both rules apply');
testScenario(35, 'Over 30 items - only amount rule applies');
