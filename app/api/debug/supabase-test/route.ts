import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'

export async function GET() {
  try {
    console.log('Testing Supabase connection...')
    console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('SUPABASE_ANON_KEY exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    
    const supabase = createClient()
    
    // Test simple query
    const { data, error, count } = await supabase
      .from('products')
      .select('product_id, product_name', { count: 'exact' })
      .eq('is_active', true)
      .limit(5)
    
    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
    }
    
    return NextResponse.json({
      success: true,
      message: 'Supabase connection successful',
      totalProducts: count,
      sampleProducts: data,
      env: {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonymousKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      }
    })
    
  } catch (error: any) {
    console.error('Connection test failed:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      stack: error.stack
    })
  }
}
