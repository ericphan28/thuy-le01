-- =========================================
-- TEMP INVOICES ENHANCEMENT - DATABASE SCHEMA
-- =========================================
-- Date: September 4, 2025
-- Purpose: Extend invoices table to support temporary invoices (pre-orders)

-- 1. Add new columns to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
ADD COLUMN IF NOT EXISTS actual_delivery_date DATE;

-- 2. Add constraint for valid invoice types
ALTER TABLE invoices 
DROP CONSTRAINT IF EXISTS chk_invoice_type_valid;

ALTER TABLE invoices 
ADD CONSTRAINT chk_invoice_type_valid 
CHECK (invoice_type IN ('normal', 'temp_order'));

-- 3. Update existing invoices to have normal type
UPDATE invoices 
SET invoice_type = 'normal' 
WHERE invoice_type IS NULL;

-- 4. Create index for temp invoice management
CREATE INDEX IF NOT EXISTS idx_invoices_temp_management 
ON invoices(invoice_type, expected_delivery_date, status);

-- 5. Create index for temp invoice queries
CREATE INDEX IF NOT EXISTS idx_invoices_temp_delivery_date 
ON invoices(expected_delivery_date, invoice_type) 
WHERE invoice_type = 'temp_order';

-- 6. Add comments for documentation
COMMENT ON COLUMN invoices.invoice_type IS 'Loại hóa đơn: normal (thường) hoặc temp_order (phiếu tạm)';
COMMENT ON COLUMN invoices.expected_delivery_date IS 'Ngày dự kiến xuất hàng (cho phiếu tạm)';
COMMENT ON COLUMN invoices.actual_delivery_date IS 'Ngày xuất hàng thực tế';

-- 7. Create view for temp invoices only
CREATE OR REPLACE VIEW temp_invoices AS
SELECT 
    invoice_id,
    invoice_code,
    invoice_date,
    customer_id,
    customer_name,
    total_amount,
    customer_paid,
    status,
    expected_delivery_date,
    actual_delivery_date,
    notes,
    created_at,
    updated_at,
    vat_rate,
    vat_amount,
    discount_type,
    discount_value
FROM invoices 
WHERE invoice_type = 'temp_order';

-- 8. Create view for normal invoices only  
CREATE OR REPLACE VIEW normal_invoices AS
SELECT 
    invoice_id,
    invoice_code,
    invoice_date,
    customer_id,
    customer_name,
    total_amount,
    customer_paid,
    status,
    notes,
    created_at,
    updated_at,
    vat_rate,
    vat_amount,
    discount_type,
    discount_value
FROM invoices 
WHERE invoice_type = 'normal';

-- 9. Grant permissions
GRANT SELECT ON temp_invoices TO PUBLIC;
GRANT SELECT ON normal_invoices TO PUBLIC;

-- 10. Add sample statuses for temp invoices
-- These will be used in application logic:
-- temp_pending: Phiếu tạm vừa tạo, chờ xác nhận
-- temp_confirmed: Đã xác nhận, chuẩn bị hàng
-- temp_ready: Sẵn sàng xuất hàng
-- completed: Đã chuyển thành hóa đơn chính thức

-- 11. Update status constraint to include temp statuses
ALTER TABLE invoices 
DROP CONSTRAINT IF EXISTS chk_invoices_status_valid;

-- Note: We'll handle status validation in application logic for flexibility

COMMIT;

-- =========================================
-- VERIFICATION QUERIES
-- =========================================

-- Check new columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'invoices' 
AND column_name IN ('invoice_type', 'expected_delivery_date', 'actual_delivery_date');

-- Check constraints
SELECT constraint_name, check_clause
FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%invoice%type%';

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes 
WHERE tablename = 'invoices' 
AND indexname LIKE '%temp%';

-- Check views
SELECT viewname, definition 
FROM pg_views 
WHERE viewname IN ('temp_invoices', 'normal_invoices');

-- Sample data verification
SELECT 
    COUNT(*) as total_invoices,
    COUNT(CASE WHEN invoice_type = 'normal' THEN 1 END) as normal_invoices,
    COUNT(CASE WHEN invoice_type = 'temp_order' THEN 1 END) as temp_invoices
FROM invoices;
