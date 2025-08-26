// Test script cho SP000049 pricing issue
const { simulatePrice } = require('./lib/pricing/engine.ts')

async function testSP000049() {
  console.log('🚀 Testing SP000049 pricing...')
  
  try {
    const result = await simulatePrice({
      price_book_id: 1,
      sku: 'SP000049',
      qty: 1,
      when: new Date()
    })
    
    console.log('📊 Test result:', result)
    
    // Expected: 220k → 190k (net price rule)
    console.log('✅ Expected: 220,000 → 190,000 (net rule)')
    console.log('🎯 Actual:', `${result.list_price} → ${result.final_price}`)
    
    if (result.final_price === 190000) {
      console.log('✅ PASS: Pricing calculation correct!')
    } else {
      console.log('❌ FAIL: Expected 190,000 but got', result.final_price)
    }
    
  } catch (error) {
    console.error('❌ Error testing pricing:', error)
  }
}

// Run the test
testSP000049()
