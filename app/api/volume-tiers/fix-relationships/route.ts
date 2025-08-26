import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // First, check current volume_tiers table structure
    const { data: tableInfo, error: tableError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            column_name,
            data_type,
            is_nullable
          FROM information_schema.columns 
          WHERE table_name = 'volume_tiers' 
            AND table_schema = 'public'
          ORDER BY ordinal_position;
        `
      })

    if (tableError) {
      console.error('Table info error:', tableError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to get table info',
        details: tableError 
      }, { status: 500 })
    }

    // Check existing constraints
    const { data: constraints, error: constraintError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            tc.constraint_name,
            tc.constraint_type,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints tc
          LEFT JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          LEFT JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE tc.table_name = 'volume_tiers'
            AND tc.table_schema = 'public';
        `
      })

    // Add foreign key constraints if they don't exist
    const addConstraintsSQL = `
      -- Add foreign key constraint for product_id (if not exists)
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_volume_tiers_product_id' 
            AND table_name = 'volume_tiers'
        ) THEN
          ALTER TABLE volume_tiers 
          ADD CONSTRAINT fk_volume_tiers_product_id 
          FOREIGN KEY (product_id) REFERENCES products(product_id) 
          ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
      END $$;

      -- Add foreign key constraint for category_id (if not exists)
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_volume_tiers_category_id' 
            AND table_name = 'volume_tiers'
        ) THEN
          ALTER TABLE volume_tiers 
          ADD CONSTRAINT fk_volume_tiers_category_id 
          FOREIGN KEY (category_id) REFERENCES product_categories(category_id) 
          ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
      END $$;
    `

    const { data: addResult, error: addError } = await supabase
      .rpc('exec_sql', { sql: addConstraintsSQL })

    // Test the relationships after adding constraints
    const { data: testRelationships, error: testError } = await supabase
      .from('volume_tiers')
      .select(`
        tier_id,
        scope,
        product_id,
        category_id,
        min_qty,
        products(product_code, product_name, sale_price),
        product_categories(category_name)
      `)
      .limit(3)

    return NextResponse.json({
      success: true,
      results: {
        tableInfo,
        existingConstraints: constraints,
        addConstraintsResult: addResult,
        addConstraintsError: addError,
        relationshipTest: {
          success: !testError,
          data: testRelationships,
          error: testError
        }
      }
    })

  } catch (error) {
    console.error('Fix relationships error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Fix failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
