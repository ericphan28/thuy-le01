-- 📊 INVOICE SCHEMA ENHANCEMENT - Add VAT and Discount Tracking
-- Thêm các field để lưu trữ thông tin VAT và discount riêng biệt

-- 1. Thêm columns vào invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash';

-- 2. Thêm comments để giải thích ý nghĩa các field
COMMENT ON COLUMN invoices.subtotal_amount IS 'Tổng tiền trước khi áp dụng giảm giá và VAT';
COMMENT ON COLUMN invoices.discount_type IS 'Loại giảm giá: percentage hoặc amount';
COMMENT ON COLUMN invoices.discount_value IS 'Giá trị giảm giá (% hoặc số tiền)';
COMMENT ON COLUMN invoices.discount_amount IS 'Số tiền giảm giá thực tế';
COMMENT ON COLUMN invoices.vat_rate IS 'Tỷ lệ VAT (%)';
COMMENT ON COLUMN invoices.vat_amount IS 'Số tiền VAT';
COMMENT ON COLUMN invoices.payment_method IS 'Phương thức thanh toán: cash, card, transfer';

-- 3. Thêm indexes để tối ưu truy vấn báo cáo
CREATE INDEX IF NOT EXISTS idx_invoices_discount_type ON invoices(discount_type);
CREATE INDEX IF NOT EXISTS idx_invoices_vat_rate ON invoices(vat_rate);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_method ON invoices(payment_method);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);

-- 4. Thêm constraints để đảm bảo dữ liệu hợp lệ
ALTER TABLE invoices 
ADD CONSTRAINT chk_discount_type CHECK (discount_type IN ('percentage', 'amount')),
ADD CONSTRAINT chk_discount_value CHECK (discount_value >= 0),
ADD CONSTRAINT chk_discount_amount CHECK (discount_amount >= 0),
ADD CONSTRAINT chk_vat_rate CHECK (vat_rate >= 0 AND vat_rate <= 100),
ADD CONSTRAINT chk_vat_amount CHECK (vat_amount >= 0),
ADD CONSTRAINT chk_payment_method CHECK (payment_method IN ('cash', 'card', 'transfer'));

-- 5. Tạo view để báo cáo VAT và discount
CREATE OR REPLACE VIEW vw_invoice_summary AS
SELECT 
    invoice_code,
    invoice_date,
    customer_name,
    subtotal_amount,
    discount_type,
    discount_value,
    discount_amount,
    vat_rate,
    vat_amount,
    total_amount,
    payment_method,
    status,
    -- Computed fields
    CASE 
        WHEN discount_type = 'percentage' THEN CONCAT(discount_value::TEXT, '%')
        ELSE CONCAT(discount_value::TEXT, ' VND')
    END as discount_display,
    ROUND((discount_amount / NULLIF(subtotal_amount, 0)) * 100, 2) as actual_discount_percentage,
    ROUND((vat_amount / NULLIF(subtotal_amount - discount_amount, 0)) * 100, 2) as actual_vat_percentage
FROM invoices
WHERE status = 'completed'
ORDER BY invoice_date DESC;

-- 6. Tạo view để báo cáo tổng hợp VAT và discount theo ngày
CREATE OR REPLACE VIEW vw_daily_vat_discount_report AS
SELECT 
    DATE(invoice_date) as report_date,
    COUNT(*) as total_invoices,
    SUM(subtotal_amount) as total_subtotal,
    SUM(discount_amount) as total_discount,
    SUM(vat_amount) as total_vat,
    SUM(total_amount) as total_revenue,
    AVG(vat_rate) as avg_vat_rate,
    COUNT(CASE WHEN discount_amount > 0 THEN 1 END) as invoices_with_discount,
    -- Payment method breakdown
    COUNT(CASE WHEN payment_method = 'cash' THEN 1 END) as cash_payments,
    COUNT(CASE WHEN payment_method = 'card' THEN 1 END) as card_payments,
    COUNT(CASE WHEN payment_method = 'transfer' THEN 1 END) as transfer_payments
FROM invoices
WHERE status = 'completed'
GROUP BY DATE(invoice_date)
ORDER BY report_date DESC;

-- 7. Function để tính toán lại VAT và discount cho các invoice cũ (migration)
CREATE OR REPLACE FUNCTION migrate_existing_invoices()
RETURNS void AS $$
BEGIN
    -- Update existing invoices with default values where missing
    UPDATE invoices 
    SET 
        subtotal_amount = COALESCE(subtotal_amount, total_amount),
        discount_type = COALESCE(discount_type, 'percentage'),
        discount_value = COALESCE(discount_value, 0),
        discount_amount = COALESCE(discount_amount, 0),
        vat_rate = COALESCE(vat_rate, 0),
        vat_amount = COALESCE(vat_amount, 0),
        payment_method = COALESCE(payment_method, 'cash')
    WHERE subtotal_amount IS NULL 
       OR discount_type IS NULL 
       OR payment_method IS NULL;
       
    RAISE NOTICE 'Migration completed for existing invoices';
END;
$$ LANGUAGE plpgsql;

-- Run migration
SELECT migrate_existing_invoices();

-- 8. Grants for application user (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON invoices TO your_app_user;
-- GRANT SELECT ON vw_invoice_summary TO your_app_user;
-- GRANT SELECT ON vw_daily_vat_discount_report TO your_app_user;
