import { NextRequest, NextResponse } from 'next/server'
import { VolumeTiersService } from '@/lib/services/volume-tiers-service'

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing Volume Tiers Service with manual relationships...')
    
    const service = new VolumeTiersService()
    const results: any = {
      success: true,
      tests: {}
    }
    
    // Test 1: Basic service instantiation
    results.tests.instantiation = {
      success: true,
      message: 'Service instantiated successfully'
    }
    
    // Test 2: Get product tiers for a sample product
    try {
      console.log('Testing getProductTiers...')
      const productTiers = await service.getProductTiers(1)
      results.tests.productTiers = {
        success: true,
        data: productTiers,
        count: productTiers.length
      }
    } catch (error) {
      results.tests.productTiers = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
    
    // Test 3: Get category tiers for a sample category
    try {
      console.log('Testing getCategoryTiers...')
      const categoryTiers = await service.getCategoryTiers(1)
      results.tests.categoryTiers = {
        success: true,
        data: categoryTiers,
        count: categoryTiers.length
      }
    } catch (error) {
      results.tests.categoryTiers = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
    
    // Test 4: Find matching tiers
    try {
      console.log('Testing findMatchingTiers...')
      const matchingTiers = await service.findMatchingTiers(1, 1, 10)
      results.tests.findMatching = {
        success: true,
        data: matchingTiers,
        count: matchingTiers.length
      }
    } catch (error) {
      results.tests.findMatching = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
    
    // Test 5: Calculate volume price
    try {
      console.log('Testing calculateVolumePrice...')
      const volumePrice = await service.calculateVolumePrice(1, 1, 10, 50000)
      results.tests.calculatePrice = {
        success: true,
        data: volumePrice,
        hasDiscount: volumePrice !== null
      }
    } catch (error) {
      results.tests.calculatePrice = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
    
    // Summary
    const passedTests = Object.values(results.tests).filter((t: any) => t.success).length
    const totalTests = Object.keys(results.tests).length
    
    results.summary = {
      passed: passedTests,
      total: totalTests,
      success: passedTests === totalTests,
      message: `${passedTests}/${totalTests} tests passed`
    }
    
    console.log('✅ All volume tiers tests completed!')
    
    return NextResponse.json(results)
    
  } catch (error) {
    console.error('❌ Volume tiers test failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
