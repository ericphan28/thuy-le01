import { NextRequest, NextResponse } from 'next/server';
import { simulatePrice } from '@/lib/pricing/engine';

export async function GET() {
  console.log('=== DEBUG PRICING API TEST - AFTER FIX ===');
  console.log('Testing SP000049 after disabling tag rules (Rule 667)');
  
  try {
    // Test multiple quantities to verify fix
    const qty1 = await simulatePrice({
      price_book_id: 1,
      sku: 'SP000049',
      qty: 1
    });
    
    const qty10 = await simulatePrice({
      price_book_id: 1,
      sku: 'SP000049', 
      qty: 10
    });
    
    const qty35 = await simulatePrice({
      price_book_id: 1,
      sku: 'SP000049',
      qty: 35
    });
    
    console.log('=== RESULTS AFTER FIX ===');
    console.log('qty=1:', qty1);
    console.log('qty=10:', qty10);
    console.log('qty=35:', qty35);
    
    const result = qty10; // Focus on qty=10 which was broken before
    
    console.log('=== PRICING TEST RESULT ===');
    console.log('Raw result:', JSON.stringify(result, null, 2));
    
    const analysis = {
      sku: 'SP000049',
      expected: {
        listPrice: 220000,
        finalPrice: 190000,
        ruleType: 'net'
      },
      actual: {
        listPrice: result.list_price,
        finalPrice: result.final_price,
        appliedRuleId: result.applied_rule_id,
        appliedReason: result.applied_reason
      },
      status: result.final_price === 190000 ? 'CORRECT' : 'ERROR',
      diagnosis: result.final_price === 190000 
        ? 'Price calculation matches expected result' 
        : `Expected 190,000₫ but got ${result.final_price}₫`
    };
    
    console.log('=== ANALYSIS ===');
    console.log('Status:', analysis.status);
    console.log('Expected Final Price:', analysis.expected.finalPrice);
    console.log('Actual Final Price:', analysis.actual.finalPrice);
    console.log('Applied Rule ID:', analysis.actual.appliedRuleId);
    console.log('Diagnosis:', analysis.diagnosis);
    console.log('================');
    
    return NextResponse.json({
      success: true,
      result,
      analysis
    });
    
  } catch (error: any) {
    console.error('=== PRICING TEST ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
