import { createClient } from '@supabase/supabase-js';

// Create direct Supabase client for testing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testPricingDirect() {
  console.log('=== DIRECT PRICING TEST ===');
  console.log('Testing SP000049 with expected result: 220,000₫ → 190,000₫');
  console.log('');

  try {
    // Get product information
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('product_code, product_name, sale_price, base_price, category_id')
      .eq('product_code', 'SP000049')
      .single();

    if (productError) {
      console.error('Product error:', productError);
      return;
    }

    console.log('Product found:');
    console.log('- Code:', product.product_code);
    console.log('- Name:', product.product_name);
    console.log('- Sale Price:', product.sale_price);
    console.log('- Base Price:', product.base_price);
    console.log('');

    // Get price rules for this product
    const { data: rules, error: rulesError } = await supabase
      .from('price_rules')
      .select('*')
      .eq('price_book_id', 1)
      .or(`scope.eq.all,scope.eq.sku,scope.eq.category,scope.eq.tag`)
      .order('priority', { ascending: false });

    if (rulesError) {
      console.error('Rules error:', rulesError);
      return;
    }

    console.log(`Found ${rules.length} price rules:`);
    
    // Filter rules that apply to this product
    const applicableRules = rules.filter(rule => {
      if (rule.scope === 'all') return true;
      if (rule.scope === 'sku' && rule.scope_value === product.product_code) return true;
      if (rule.scope === 'category' && rule.scope_value === product.category_id?.toString()) return true;
      return false;
    });

    console.log(`Applicable rules: ${applicableRules.length}`);
    
    applicableRules.forEach(rule => {
      console.log(`- Rule ID ${rule.rule_id}:`);
      console.log(`  Scope: ${rule.scope} = ${rule.scope_value}`);
      console.log(`  Action: ${rule.action_type} = ${rule.action_value}`);
      console.log(`  Priority: ${rule.priority}`);
    });

    if (applicableRules.length === 0) {
      console.log('❌ No applicable rules found!');
      console.log('Expected: Rule with scope=sku, scope_value=SP000049, action_type=net, action_value=190000');
      return;
    }

    // Find the highest priority rule
    const topRule = applicableRules.sort((a, b) => b.priority - a.priority)[0];
    console.log('');
    console.log('Top priority rule:');
    console.log('- Rule ID:', topRule.rule_id);
    console.log('- Action Type:', topRule.action_type);
    console.log('- Action Value:', topRule.action_value);
    console.log('');

    // Apply rule
    const basePrice = product.sale_price || product.base_price || 0;
    let finalPrice = basePrice;

    console.log('Price calculation:');
    console.log('- Base Price:', basePrice);
    
    if (topRule.action_type === 'net') {
      finalPrice = Math.max(0, topRule.action_value);
      console.log('- Applied NET rule:', topRule.action_value);
      console.log('- Final Price:', finalPrice);
    } else if (topRule.action_type === 'percent') {
      finalPrice = Math.max(0, basePrice * (1 - topRule.action_value / 100));
      console.log('- Applied PERCENT rule:', `${topRule.action_value}%`);
      console.log('- Final Price:', finalPrice);
    } else if (topRule.action_type === 'amount') {
      finalPrice = Math.max(0, basePrice - topRule.action_value);
      console.log('- Applied AMOUNT rule:', `-${topRule.action_value}`);
      console.log('- Final Price:', finalPrice);
    }

    console.log('');
    console.log('=== RESULT ===');
    console.log(`Expected: 220,000₫ → 190,000₫ (net rule)`);
    console.log(`Actual: ${basePrice}₫ → ${finalPrice}₫`);
    
    if (finalPrice === 190000) {
      console.log('✅ CORRECT: Price calculation matches expected result!');
    } else {
      console.log('❌ ERROR: Price calculation does not match expected result!');
      console.log('Troubleshooting:');
      console.log('- Check if rule exists with scope=sku, scope_value=SP000049');
      console.log('- Check if rule has action_type=net, action_value=190000');
      console.log('- Check rule priority and make sure it\'s the highest');
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testPricingDirect();
