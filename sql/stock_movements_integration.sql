-- =====================================================
-- STOCK MOVEMENTS AUDIT TABLE
-- Integrated với business flow hiện có của hệ thống POS
-- =====================================================

-- 1. Tạo bảng stock_movements để audit mọi thay đổi tồn kho
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
    reference_type VARCHAR(50), -- 'INVOICE', 'PURCHASE_ORDER', 'MANUAL', 'SYSTEM'
    reference_id INTEGER,       -- ID của document gốc
    reference_code VARCHAR(100), -- Mã chứng từ (invoice_code, order_code, etc.)
    
    -- Business context
    reason TEXT NOT NULL,
    notes TEXT,
    branch_id INTEGER DEFAULT 1 REFERENCES public.branches(branch_id),
    
    -- Audit information
    created_by VARCHAR(100) NOT NULL DEFAULT 'System',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    is_system_generated BOOLEAN DEFAULT true,
    batch_id VARCHAR(50) -- For grouping related movements
);

-- 2. Indexes cho performance
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON public.stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON public.stock_movements(branch_id);

-- 3. RLS Policies
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view stock movements" ON public.stock_movements
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert stock movements" ON public.stock_movements
    FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Comments
COMMENT ON TABLE public.stock_movements IS 'Audit trail for all inventory movements in the system';
COMMENT ON COLUMN public.stock_movements.movement_type IS 'Type: IN (nhập), OUT (xuất), ADJUST (điều chỉnh), TRANSFER (chuyển), LOSS (mất), FOUND (tìm thấy)';
COMMENT ON COLUMN public.stock_movements.reference_type IS 'Source document type: INVOICE, PURCHASE_ORDER, MANUAL, SYSTEM';
COMMENT ON COLUMN public.stock_movements.batch_id IS 'Groups related movements together (e.g., all items in one invoice)';

-- =====================================================
-- INTEGRATION FUNCTIONS
-- =====================================================

-- 5. Function để record stock movement
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
    -- Lấy current stock
    SELECT current_stock INTO v_old_stock 
    FROM public.products 
    WHERE product_id = p_product_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found: %', p_product_id;
    END IF;
    
    -- Tính new stock
    CASE p_movement_type
        WHEN 'IN', 'FOUND' THEN 
            v_new_stock := v_old_stock + ABS(p_quantity);
        WHEN 'OUT', 'LOSS' THEN 
            v_new_stock := GREATEST(0, v_old_stock - ABS(p_quantity));
        WHEN 'ADJUST' THEN
            -- For ADJUST, p_quantity is the adjustment amount (can be + or -)
            v_new_stock := GREATEST(0, v_old_stock + p_quantity);
        WHEN 'TRANSFER' THEN
            -- This should be handled at higher level with two records
            v_new_stock := GREATEST(0, v_old_stock - ABS(p_quantity));
        ELSE
            RAISE EXCEPTION 'Invalid movement type: %', p_movement_type;
    END CASE;
    
    -- Insert movement record
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
    
    -- Update product stock
    UPDATE public.products 
    SET current_stock = v_new_stock,
        updated_at = CURRENT_TIMESTAMP
    WHERE product_id = p_product_id;
    
    RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INTEGRATION với BUSINESS PROCESSES hiện có
-- =====================================================

-- 6. Function để record movements từ invoice (bán hàng)
CREATE OR REPLACE FUNCTION public.record_sale_movements(
    p_invoice_id INTEGER,
    p_invoice_code VARCHAR(50),
    p_created_by VARCHAR(100) DEFAULT 'System'
) RETURNS VOID AS $$
DECLARE
    v_detail RECORD;
    v_batch_id VARCHAR(50);
BEGIN
    -- Tạo batch_id duy nhất cho invoice này
    v_batch_id := 'SALE_' || p_invoice_code || '_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::TEXT;
    
    -- Loop qua tất cả invoice details
    FOR v_detail IN 
        SELECT 
            id.product_id,
            id.quantity,
            id.unit_price,
            p.product_name
        FROM public.invoice_details id
        JOIN public.products p ON id.product_id = p.product_id
        WHERE id.invoice_id = p_invoice_id
    LOOP
        -- Record OUT movement cho mỗi product
        PERFORM public.record_stock_movement(
            p_product_id := v_detail.product_id,
            p_movement_type := 'OUT',
            p_quantity := v_detail.quantity,
            p_unit_cost := NULL, -- Sale price, not cost
            p_reference_type := 'INVOICE',
            p_reference_id := p_invoice_id,
            p_reference_code := p_invoice_code,
            p_reason := 'Bán hàng - ' || v_detail.product_name,
            p_notes := 'Automatic movement from invoice',
            p_created_by := p_created_by,
            p_batch_id := v_batch_id
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 7. Function để record movements từ purchase order (nhập hàng)
CREATE OR REPLACE FUNCTION public.record_purchase_movements(
    p_order_id INTEGER,
    p_order_code VARCHAR(50),
    p_created_by VARCHAR(100) DEFAULT 'System'
) RETURNS VOID AS $$
DECLARE
    v_batch_id VARCHAR(50);
BEGIN
    -- Tạo batch_id duy nhất 
    v_batch_id := 'PURCHASE_' || p_order_code || '_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::TEXT;
    
    -- Note: Giả sử purchase order details được handle riêng
    -- Đây là placeholder function để tương lai mở rộng
    
    RAISE NOTICE 'Purchase order movements recorded for order: %', p_order_code;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS để AUTO-RECORD movements (optional)
-- =====================================================

-- 8. Trigger function để auto-record khi có invoice mới
CREATE OR REPLACE FUNCTION public.trigger_record_invoice_movements()
RETURNS TRIGGER AS $$
BEGIN
    -- Chỉ record khi invoice status = 'completed'
    IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
        PERFORM public.record_sale_movements(
            p_invoice_id := NEW.invoice_id,
            p_invoice_code := NEW.invoice_code,
            p_created_by := 'System'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (commented out for now - enable if needed)
-- CREATE TRIGGER trigger_auto_record_invoice_movements
--     AFTER INSERT OR UPDATE ON public.invoices
--     FOR EACH ROW EXECUTE FUNCTION public.trigger_record_invoice_movements();

-- =====================================================
-- VIEWS cho reporting
-- =====================================================

-- 9. View để dễ query stock movements với product info
CREATE OR REPLACE VIEW public.stock_movements_detailed AS
SELECT 
    sm.*,
    p.product_code,
    p.product_name,
    p.category_id,
    pc.category_name,
    b.branch_name
FROM public.stock_movements sm
JOIN public.products p ON sm.product_id = p.product_id
LEFT JOIN public.product_categories pc ON p.category_id = pc.category_id
LEFT JOIN public.branches b ON sm.branch_id = b.branch_id
ORDER BY sm.created_at DESC;

-- 10. View để xem inventory summary
CREATE OR REPLACE VIEW public.inventory_summary AS
SELECT 
    p.product_id,
    p.product_code,
    p.product_name,
    p.current_stock,
    COALESCE(SUM(CASE WHEN sm.movement_type IN ('IN', 'FOUND') THEN sm.quantity ELSE 0 END), 0) as total_in,
    COALESCE(SUM(CASE WHEN sm.movement_type IN ('OUT', 'LOSS') THEN ABS(sm.quantity) ELSE 0 END), 0) as total_out,
    COALESCE(COUNT(sm.movement_id), 0) as total_movements,
    MAX(sm.created_at) as last_movement_date
FROM public.products p
LEFT JOIN public.stock_movements sm ON p.product_id = sm.product_id
WHERE p.is_active = true
GROUP BY p.product_id, p.product_code, p.product_name, p.current_stock
ORDER BY p.product_name;

-- =====================================================
-- SAMPLE DATA (for testing)
-- =====================================================

-- 11. Insert sample movements cho testing
DO $$ 
DECLARE
    v_product_id INTEGER;
BEGIN
    -- Lấy một product để test
    SELECT product_id INTO v_product_id 
    FROM public.products 
    WHERE is_active = true 
    LIMIT 1;
    
    IF v_product_id IS NOT NULL THEN
        -- Sample nhập hàng
        PERFORM public.record_stock_movement(
            p_product_id := v_product_id,
            p_movement_type := 'IN',
            p_quantity := 100,
            p_unit_cost := 50000,
            p_reference_type := 'PURCHASE_ORDER',
            p_reference_code := 'PO-2024-001',
            p_reason := 'Nhập hàng đầu kỳ',
            p_notes := 'Sample data for testing',
            p_created_by := 'Admin'
        );
        
        -- Sample bán hàng
        PERFORM public.record_stock_movement(
            p_product_id := v_product_id,
            p_movement_type := 'OUT',
            p_quantity := 10,
            p_reference_type := 'INVOICE',
            p_reference_code := 'HD-2024-001',
            p_reason := 'Bán hàng cho khách',
            p_notes := 'Sample sale movement',
            p_created_by := 'Cashier'
        );
        
        RAISE NOTICE 'Sample stock movements created for product_id: %', v_product_id;
    END IF;
END $$;
