-- =====================================================
-- RUN STOCK MOVEMENTS MIGRATION
-- Execute this script in Supabase SQL Editor
-- =====================================================

-- Step 1: Check if tables exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'stock_movements') THEN
        RAISE NOTICE 'Creating stock_movements table...';
    ELSE
        RAISE NOTICE 'stock_movements table already exists. Skipping creation.';
    END IF;
END $$;

-- Execute the migration
\i stock_movements_integration.sql

-- Step 2: Verify installation
SELECT 
    'stock_movements' as table_name,
    COUNT(*) as record_count
FROM public.stock_movements
UNION ALL
SELECT 
    'stock_movements_detailed' as view_name,
    COUNT(*) as record_count  
FROM public.stock_movements_detailed
UNION ALL
SELECT 
    'inventory_summary' as view_name,
    COUNT(*) as record_count
FROM public.inventory_summary;

-- Step 3: Test functions
SELECT public.record_stock_movement(
    p_product_id := (SELECT product_id FROM public.products WHERE is_active = true LIMIT 1),
    p_movement_type := 'IN',
    p_quantity := 10,
    p_unit_cost := 50000,
    p_reference_type := 'MANUAL',
    p_reference_code := 'TEST-001',
    p_reason := 'Test migration',
    p_notes := 'Migration test record',
    p_created_by := 'System'
) as test_movement_id;

-- Step 4: Check results
SELECT 
    sm.*,
    p.product_name
FROM public.stock_movements sm
JOIN public.products p ON sm.product_id = p.product_id
WHERE sm.reference_code = 'TEST-001';

COMMIT;
