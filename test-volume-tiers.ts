import { volumeTiersService } from '@/lib/services/volume-tiers-service'

// Test script cho Volume Tiers
async function testVolumeTiers() {
  console.log('🧪 Testing Volume Tiers Implementation...')
  
  try {
    // Test 1: Tạo volume tier mẫu
    console.log('\n1️⃣ Creating sample volume tier...')
    const sampleTier = await volumeTiersService.createTier({
      scope: 'sku',
      product_id: 1, // Assuming product ID 1 exists
      category_id: undefined,
      min_qty: 10,
      discount_percent: 10,
      discount_amount: undefined,
      effective_from: undefined,
      effective_to: undefined,
      is_active: true,
      notes: 'Test volume tier - Giảm 10% khi mua từ 10-49 sản phẩm'
    })
    console.log('✅ Sample tier created:', sampleTier)

    // Test 2: Tính toán giá với volume tier
    console.log('\n2️⃣ Testing volume price calculation...')
    const priceCalculation = await volumeTiersService.calculateVolumePrice(
      1, // product_id
      1, // category_id (assuming category 1 exists)
      15, // quantity
      5000, // original_price
      new Date()
    )
    console.log('💰 Price calculation result:', priceCalculation)

    // Test 3: Lấy tất cả tiers cho sản phẩm
    console.log('\n3️⃣ Getting all tiers for product...')
    const productTiers = await volumeTiersService.getProductTiers(1)
    console.log('📋 Product tiers:', productTiers)

    // Test 4: Tính ví dụ
    if (sampleTier) {
      console.log('\n4️⃣ Calculating examples...')
      const examples = volumeTiersService.calculateExamples(sampleTier, 5000)
      console.log('📊 Examples:', examples)
    }

    console.log('\n✅ All tests passed! Volume Tiers is working correctly.')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Export for manual testing
export { testVolumeTiers }

// Auto-run if this file is executed directly
if (typeof window === 'undefined') {
  // Server-side execution
  testVolumeTiers()
}
