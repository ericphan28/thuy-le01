-- =====================================================
-- 🔄 SIMPLE MIGRATION: Add VAT & Discount Columns
-- =====================================================
-- Purpose: Add 4 essential VAT/discount columns to invoices table
-- Date: 2025-08-05
-- =====================================================

-- Add the 4 essential columns for VAT and discount
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(15,2) DEFAULT 0;

-- Add basic constraints (PostgreSQL doesn't support IF NOT EXISTS with ADD CONSTRAINT)
ALTER TABLE public.invoices 
ADD CONSTRAINT chk_invoices_vat_rate_range 
    CHECK (vat_rate >= 0 AND vat_rate <= 100);

ALTER TABLE public.invoices 
ADD CONSTRAINT chk_invoices_vat_amount_positive 
    CHECK (vat_amount >= 0);

ALTER TABLE public.invoices 
ADD CONSTRAINT chk_invoices_discount_type_valid 
    CHECK (discount_type IN ('percentage', 'amount'));

ALTER TABLE public.invoices 
ADD CONSTRAINT chk_invoices_discount_value_positive 
    CHECK (discount_value >= 0);

-- Add column comments
COMMENT ON COLUMN public.invoices.discount_type IS 'Loại giảm giá: percentage (%) hoặc amount (số tiền)';
COMMENT ON COLUMN public.invoices.discount_value IS 'Giá trị giảm giá (% hoặc số tiền tùy theo type)';
COMMENT ON COLUMN public.invoices.vat_rate IS 'Tỷ lệ VAT (%) - 0, 5, 8, 10';
COMMENT ON COLUMN public.invoices.vat_amount IS 'Số tiền VAT tính được';

-- Verification
SELECT 'Migration completed successfully!' AS status;
SELECT COUNT(*) AS total_invoices FROM public.invoices;
