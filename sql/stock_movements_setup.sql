-- Stock Movements Table
-- Tracks all inventory movements (IN/OUT)

CREATE TABLE IF NOT EXISTS public.stock_movements (
    movement_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES public.products(product_id),
    movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('IN', 'OUT')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost DECIMAL(15,2),
    total_cost DECIMAL(15,2),
    reason TEXT NOT NULL,
    reference_no VARCHAR(50),
    notes TEXT,
    created_by VARCHAR(100) NOT NULL DEFAULT 'System',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);

-- RLS Policies
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view stock movements" ON public.stock_movements
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert stock movements" ON public.stock_movements
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update stock movements" ON public.stock_movements
    FOR UPDATE TO authenticated USING (true);

-- Function to automatically update total_cost
CREATE OR REPLACE FUNCTION calculate_movement_total_cost()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.unit_cost IS NOT NULL THEN
        NEW.total_cost = NEW.quantity * NEW.unit_cost;
    END IF;
    
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to calculate total cost
CREATE TRIGGER trigger_calculate_movement_total_cost
    BEFORE INSERT OR UPDATE ON public.stock_movements
    FOR EACH ROW EXECUTE FUNCTION calculate_movement_total_cost();

-- Function to update product stock after movement
CREATE OR REPLACE FUNCTION update_product_stock_after_movement()
RETURNS TRIGGER AS $$
BEGIN
    -- Update product current_stock based on movement type
    IF NEW.movement_type = 'IN' THEN
        UPDATE public.products 
        SET current_stock = current_stock + NEW.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE product_id = NEW.product_id;
    ELSIF NEW.movement_type = 'OUT' THEN
        UPDATE public.products 
        SET current_stock = GREATEST(0, current_stock - NEW.quantity),
            updated_at = CURRENT_TIMESTAMP
        WHERE product_id = NEW.product_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update product stock automatically
CREATE TRIGGER trigger_update_product_stock_after_movement
    AFTER INSERT ON public.stock_movements
    FOR EACH ROW EXECUTE FUNCTION update_product_stock_after_movement();

-- Insert some sample data
INSERT INTO public.stock_movements (
    product_id,
    movement_type,
    quantity,
    unit_cost,
    reason,
    reference_no,
    created_by
) VALUES 
(1, 'IN', 50, 25000000, 'Nhập hàng đầu kỳ', 'INIT-001', 'Admin'),
(2, 'IN', 30, 20000000, 'Nhập hàng đầu kỳ', 'INIT-002', 'Admin'),
(1, 'OUT', 5, NULL, 'Bán hàng', 'SALE-001', 'Cashier'),
(2, 'OUT', 3, NULL, 'Bán hàng', 'SALE-002', 'Cashier');

COMMENT ON TABLE public.stock_movements IS 'Tracks all inventory movements including stock ins and outs';
COMMENT ON COLUMN public.stock_movements.movement_type IS 'Type of movement: IN for stock in, OUT for stock out';
COMMENT ON COLUMN public.stock_movements.quantity IS 'Quantity moved (always positive)';
COMMENT ON COLUMN public.stock_movements.unit_cost IS 'Cost per unit for IN movements';
COMMENT ON COLUMN public.stock_movements.total_cost IS 'Total cost calculated automatically';
COMMENT ON COLUMN public.stock_movements.reason IS 'Reason for the stock movement';
COMMENT ON COLUMN public.stock_movements.reference_no IS 'Reference document number (PO, Invoice, etc)';
