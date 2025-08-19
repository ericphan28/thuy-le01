-- =====================================================
-- Migration: Add supplier_id support to stock_movements
-- Date: 2025-08-16
-- Safe to run multiple times (idempotent operations)
-- =====================================================

-- 1. Add supplier_id column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='stock_movements' AND column_name='supplier_id'
    ) THEN
        ALTER TABLE public.stock_movements
            ADD COLUMN supplier_id INTEGER REFERENCES public.suppliers(supplier_id);
        RAISE NOTICE 'Added supplier_id column to stock_movements';
    ELSE
        RAISE NOTICE 'supplier_id column already exists.';
    END IF;
END $$;

-- 2. Index on supplier_id
CREATE INDEX IF NOT EXISTS idx_stock_movements_supplier_id ON public.stock_movements(supplier_id);

-- 3. Recreate function with new optional parameter p_supplier_id (default NULL)
CREATE OR REPLACE FUNCTION public.record_stock_movement(
    p_product_id INTEGER,
    p_movement_type VARCHAR(20),
    p_quantity NUMERIC(15,2),
    p_unit_cost NUMERIC(15,2) DEFAULT NULL,
    p_reference_type VARCHAR(50) DEFAULT 'MANUAL',
    p_reference_id INTEGER DEFAULT NULL,
    p_reference_code VARCHAR(100) DEFAULT NULL,
    p_reason TEXT DEFAULT 'System generated',
    p_notes TEXT DEFAULT NULL,
    p_created_by VARCHAR(100) DEFAULT 'System',
    p_batch_id VARCHAR(50) DEFAULT NULL,
    p_supplier_id INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_old_stock NUMERIC(15,2);
    v_new_stock NUMERIC(15,2);
    v_movement_id INTEGER;
BEGIN
    SELECT current_stock INTO v_old_stock FROM public.products WHERE product_id = p_product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found: %', p_product_id;
    END IF;

    CASE p_movement_type
        WHEN 'IN', 'FOUND' THEN v_new_stock := v_old_stock + ABS(p_quantity);
        WHEN 'OUT', 'LOSS' THEN v_new_stock := GREATEST(0, v_old_stock - ABS(p_quantity));
        WHEN 'ADJUST' THEN v_new_stock := GREATEST(0, v_old_stock + p_quantity);
        WHEN 'TRANSFER' THEN v_new_stock := GREATEST(0, v_old_stock - ABS(p_quantity));
        ELSE RAISE EXCEPTION 'Invalid movement type: %', p_movement_type;
    END CASE;

    INSERT INTO public.stock_movements (
        product_id,
        supplier_id,
        movement_type,
        quantity,
        old_stock,
        new_stock,
        unit_cost,
        total_cost,
        reference_type,
        reference_id,
        reference_code,
        reason,
        notes,
        created_by,
        batch_id
    ) VALUES (
        p_product_id,
        p_supplier_id,
        p_movement_type,
        p_quantity,
        v_old_stock,
        v_new_stock,
        p_unit_cost,
        CASE WHEN p_unit_cost IS NOT NULL THEN ABS(p_quantity) * p_unit_cost ELSE NULL END,
        p_reference_type,
        p_reference_id,
        p_reference_code,
        p_reason,
        p_notes,
        p_created_by,
        p_batch_id
    ) RETURNING movement_id INTO v_movement_id;

    UPDATE public.products
    SET current_stock = v_new_stock,
        updated_at = CURRENT_TIMESTAMP
    WHERE product_id = p_product_id;

    RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recreate detailed view including supplier info
DROP VIEW IF EXISTS public.stock_movements_detailed;
CREATE OR REPLACE VIEW public.stock_movements_detailed AS
SELECT 
    sm.*,
    p.product_code,
    p.product_name,
    p.category_id,
    pc.category_name,
    s.supplier_name,
    b.branch_name
FROM public.stock_movements sm
JOIN public.products p ON sm.product_id = p.product_id
LEFT JOIN public.product_categories pc ON p.category_id = pc.category_id
LEFT JOIN public.suppliers s ON sm.supplier_id = s.supplier_id
LEFT JOIN public.branches b ON sm.branch_id = b.branch_id
ORDER BY sm.created_at DESC;

-- 5. (Optional) Smoke test example commented out
-- SELECT public.record_stock_movement(
--   p_product_id := (SELECT product_id FROM public.products LIMIT 1),
--   p_movement_type := 'IN',
--   p_quantity := 1,
--   p_unit_cost := NULL,
--   p_reference_type := 'MANUAL',
--   p_reference_code := 'TEST-SUPPLIER',
--   p_reason := 'Test supplier id column',
--   p_notes := 'Migration smoke test',
--   p_created_by := 'System',
--   p_batch_id := NULL,
--   p_supplier_id := (SELECT supplier_id FROM public.suppliers LIMIT 1)
-- );

-- Done.
