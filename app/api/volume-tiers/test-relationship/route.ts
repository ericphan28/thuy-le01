import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Test 1: Basic volume_tiers query
    console.log('Testing basic volume_tiers query...')
    const { data: basicTiers, error: basicError } = await supabase
      .from('volume_tiers')
      .select('*')
      .limit(5)
    
    if (basicError) {
      console.error('Basic query error:', basicError)
      return NextResponse.json({ 
        success: false, 
        error: 'Basic query failed',
        details: basicError 
      }, { status: 500 })
    }

    // Test 2: Check if relationships work with explicit joins
    console.log('Testing manual joins...')
    const { data: manualJoin, error: joinError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            vt.*,
            p.product_code,
            p.product_name,
            p.sale_price,
            pc.category_name
          FROM volume_tiers vt
          LEFT JOIN products p ON vt.product_id = p.product_id
          LEFT JOIN product_categories pc ON vt.category_id = pc.category_id
          WHERE vt.is_active = true
          LIMIT 5
        `
      })

    // Test 3: Try the original problematic query
    console.log('Testing problematic relationship query...')
    const { data: relationshipData, error: relationshipError } = await supabase
      .from('volume_tiers')
      .select(`
        *,
        products(product_code, product_name, sale_price),
        product_categories(category_name)
      `)
      .eq('is_active', true)
      .limit(5)

    return NextResponse.json({
      success: true,
      tests: {
        basic: {
          success: !basicError,
          data: basicTiers,
          error: basicError
        },
        manualJoin: {
          success: !joinError,
          data: manualJoin,
          error: joinError
        },
        relationship: {
          success: !relationshipError,
          data: relationshipData,
          error: relationshipError
        }
      }
    })

  } catch (error) {
    console.error('Test API error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Test failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
