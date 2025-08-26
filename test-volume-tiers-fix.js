// Test Volume Tiers Service - Manual Relationship Fix Validation

import { VolumeTiersService } from '@/lib/services/volume-tiers-service'

async function testVolumeTiers() {
  console.log('🧪 Testing Volume Tiers Service with manual relationships...')
  
  const service = new VolumeTiersService()
  
  try {
    // Test 1: Get product tiers (should not use relationships)
    console.log('\n1. Testing getProductTiers for product ID 1...')
    const productTiers = await service.getProductTiers(1)
    console.log('Product tiers result:', JSON.stringify(productTiers, null, 2))
    
    // Test 2: Get category tiers (should not use relationships)
    console.log('\n2. Testing getCategoryTiers for category ID 1...')
    const categoryTiers = await service.getCategoryTiers(1)
    console.log('Category tiers result:', JSON.stringify(categoryTiers, null, 2))
    
    // Test 3: Find matching tiers (should work with manual joins)
    console.log('\n3. Testing findMatchingTiers...')
    const matchingTiers = await service.findMatchingTiers(1, 1, 10)
    console.log('Matching tiers result:', JSON.stringify(matchingTiers, null, 2))
    
    // Test 4: Calculate volume price (end-to-end test)
    console.log('\n4. Testing calculateVolumePrice...')
    const volumePrice = await service.calculateVolumePrice(1, 1, 10, 50000)
    console.log('Volume price result:', JSON.stringify(volumePrice, null, 2))
    
    console.log('\n✅ All tests completed successfully!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error('Error details:', error instanceof Error ? error.message : String(error))
  }
}

// Run the test
testVolumeTiers().then(() => {
  console.log('\n🎯 Volume Tiers Service test completed.')
}).catch((error) => {
  console.error('💥 Test runner failed:', error)
})
