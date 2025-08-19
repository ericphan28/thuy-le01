-- Simple Stock Movements Migration for Testing
-- Run this in Supabase SQL Editor

-- 1. Create stock_movements table
CREATE TABLE IF NOT EXISTS public.stock_movements (
    movement_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES public.products(product_id),
    supplier_id INTEGER REFERENCES public.suppliers(supplier_id),
    
    -- Movement details
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUST', 'TRANSFER', 'LOSS', 'FOUND')),
    quantity NUMERIC(15,2) NOT NULL CHECK (quantity != 0),
    old_stock NUMERIC(15,2) NOT NULL,
    new_stock NUMERIC(15,2) NOT NULL,
    
    -- Costing information
    unit_cost NUMERIC(15,2),
    total_cost NUMERIC(15,2),
    
    -- Reference information
    reference_type VARCHAR(50) DEFAULT 'MANUAL',
    reference_id INTEGER,
    reference_code VARCHAR(100),
    
    -- Business context
    reason TEXT NOT NULL,
    notes TEXT,
    branch_id INTEGER DEFAULT 1,
    
    -- Audit information
    created_by VARCHAR(100) NOT NULL DEFAULT 'System',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    is_system_generated BOOLEAN DEFAULT true,
    batch_id VARCHAR(50)
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);

-- 3. Enable RLS
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
CREATE POLICY "Allow authenticated users to view stock movements" ON public.stock_movements
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert stock movements" ON public.stock_movements
    FOR INSERT TO authenticated WITH CHECK (true);

-- 5. Create basic function for recording movements
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
    -- Get current stock
    SELECT current_stock INTO v_old_stock 
    FROM public.products 
    WHERE product_id = p_product_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found: %', p_product_id;
    END IF;
    
    -- Calculate new stock
    CASE p_movement_type
        WHEN 'IN', 'FOUND' THEN 
            v_new_stock := v_old_stock + ABS(p_quantity);
        WHEN 'OUT', 'LOSS' THEN 
            v_new_stock := GREATEST(0, v_old_stock - ABS(p_quantity));
        WHEN 'ADJUST' THEN
            v_new_stock := GREATEST(0, v_old_stock + p_quantity);
        WHEN 'TRANSFER' THEN
            v_new_stock := GREATEST(0, v_old_stock - ABS(p_quantity));
        ELSE
            RAISE EXCEPTION 'Invalid movement type: %', p_movement_type;
    END CASE;
    
    -- Insert movement record
    INSERT INTO public.stock_movements (
        product_id, supplier_id, movement_type, quantity, old_stock, new_stock,
        unit_cost, total_cost, reference_type, reference_id, reference_code,
        reason, notes, created_by, batch_id
    ) VALUES (
        p_product_id, p_supplier_id, p_movement_type, p_quantity, v_old_stock, v_new_stock,
        p_unit_cost, 
        CASE WHEN p_unit_cost IS NOT NULL THEN ABS(p_quantity) * p_unit_cost ELSE NULL END,
        p_reference_type, p_reference_id, p_reference_code,
        p_reason, p_notes, p_created_by, p_batch_id
    ) RETURNING movement_id INTO v_movement_id;
    
    -- Update product stock
    UPDATE public.products 
    SET current_stock = v_new_stock, updated_at = CURRENT_TIMESTAMP
    WHERE product_id = p_product_id;
    
    RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Create detailed view
CREATE OR REPLACE VIEW public.stock_movements_detailed AS
SELECT 
    sm.*,
    p.product_code,
    p.product_name,
    p.category_id,
    pc.category_name,
    'Chi nhánh chính' as branch_name
FROM public.stock_movements sm
JOIN public.products p ON sm.product_id = p.product_id
LEFT JOIN public.product_categories pc ON p.category_id = pc.category_id
ORDER BY sm.created_at DESC;

-- 7. Create sample data for testing
INSERT INTO public.stock_movements (
    product_id, movement_type, quantity, old_stock, new_stock,
    unit_cost, total_cost, reference_type, reference_code,
    reason, notes, created_by
) 
SELECT 
    p.product_id,
    'IN',
    100.00,
    p.current_stock,
    p.current_stock + 100,
    50000,
    5000000,
    'MANUAL',
    'INIT-001',
    'Nhập kho đầu kỳ',
    'Dữ liệu khởi tạo hệ thống',
    'Admin'
FROM public.products p
WHERE p.is_active = true
LIMIT 5
ON CONFLICT DO NOTHING;

-- Done!
SELECT 'Stock movements system installed successfully!' as status;
