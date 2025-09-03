-- DATABASE PERFORMANCE OPTIMIZATION SCRIPT
-- Dựa trên analysis của backup_thuyle_complete.sql

-- =============================================
-- 1. MISSING COMPOSITE INDEXES FOR POS
-- =============================================

-- POS Products Query Optimization
CREATE INDEX IF NOT EXISTS idx_products_pos_optimized 
ON products (is_active, allow_sale, product_name) 
WHERE is_active = true AND allow_sale = true;

-- POS Search Optimization  
CREATE INDEX IF NOT EXISTS idx_products_search_optimized
ON products (product_code, product_name, is_active, allow_sale)
WHERE is_active = true AND allow_sale = true;

-- Stock check optimization
CREATE INDEX IF NOT EXISTS idx_products_stock_check
ON products (product_id, current_stock, is_active)
WHERE is_active = true AND current_stock > 0;

-- =============================================
-- 2. INVOICE PERFORMANCE OPTIMIZATION
-- =============================================

-- Recent invoices with customer join
CREATE INDEX IF NOT EXISTS idx_invoices_recent_with_customer
ON invoices (created_at DESC, customer_id, invoice_code)
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';

-- Invoice details covering index
CREATE INDEX IF NOT EXISTS idx_invoice_details_covering
ON invoice_details (invoice_id, product_id, quantity, unit_price, total_price);

-- Customer invoice history
CREATE INDEX IF NOT EXISTS idx_invoices_customer_history
ON invoices (customer_id, created_at DESC, total_amount, paid_amount);

-- =============================================
-- 3. CONTRACT PRICING OPTIMIZATION
-- =============================================

-- Contract price lookup (for Enhanced Pricing)
CREATE INDEX IF NOT EXISTS idx_contract_prices_enhanced_lookup
ON contract_prices (customer_id, product_id, is_active, net_price)
WHERE is_active = true;

-- Product-based contract lookup
CREATE INDEX IF NOT EXISTS idx_contract_prices_product_lookup  
ON contract_prices (product_id, is_active, customer_id)
WHERE is_active = true;

-- =============================================
-- 4. PRICING RULES OPTIMIZATION
-- =============================================

-- Active price rules lookup
CREATE INDEX IF NOT EXISTS idx_price_rules_active_lookup
ON price_rules (price_book_id, is_active, priority DESC, apply_to)
WHERE is_active = true;

-- Product-specific rules
CREATE INDEX IF NOT EXISTS idx_price_rules_product_specific
ON price_rules (apply_to, price_book_id, is_active)
WHERE is_active = true AND apply_to != 'all';

-- =============================================
-- 5. VOLUME TIERS OPTIMIZATION  
-- =============================================

-- Volume tiers lookup by product/category
CREATE INDEX IF NOT EXISTS idx_volume_tiers_lookup
ON volume_tiers (product_id, category_id, min_quantity, is_active)
WHERE is_active = true;

-- =============================================
-- 6. STOCK MOVEMENTS OPTIMIZATION
-- =============================================

-- Product stock history
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_recent
ON stock_movements (product_id, movement_date DESC, movement_type)
WHERE movement_date >= CURRENT_DATE - INTERVAL '90 days';

-- Current stock calculation
CREATE INDEX IF NOT EXISTS idx_stock_movements_current_calc
ON stock_movements (product_id, movement_date DESC, quantity_change);

-- =============================================
-- 7. CUSTOMERS OPTIMIZATION
-- =============================================

-- Customer search optimization
CREATE INDEX IF NOT EXISTS idx_customers_search_optimized
ON customers (customer_name, customer_code, phone, is_active)
WHERE is_active = true;

-- Debt management
CREATE INDEX IF NOT EXISTS idx_customers_debt_management
ON customers (current_debt, debt_limit, is_active)
WHERE is_active = true AND current_debt > 0;

-- =============================================
-- 8. MAINTENANCE COMMANDS
-- =============================================

-- Update table statistics
ANALYZE products;
ANALYZE customers;
ANALYZE invoices;
ANALYZE invoice_details;
ANALYZE contract_prices;
ANALYZE price_rules;
ANALYZE volume_tiers;
ANALYZE stock_movements;

-- Vacuum for better performance
VACUUM ANALYZE products;
VACUUM ANALYZE customers;
VACUUM ANALYZE invoices;
VACUUM ANALYZE invoice_details;

-- =============================================
-- 9. CHECK EXISTING INDEXES
-- =============================================

-- Query to check if indexes exist
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('products', 'customers', 'invoices', 'invoice_details', 'contract_prices', 'price_rules', 'volume_tiers')
ORDER BY tablename, indexname;

-- Check index usage statistics  
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats 
WHERE schemaname = 'public' 
    AND tablename IN ('products', 'customers', 'invoices', 'invoice_details')
ORDER BY tablename, attname;

-- =============================================
-- 10. PERFORMANCE MONITORING
-- =============================================

-- Enable query logging (if needed)
-- SET log_statement = 'all';
-- SET log_duration = on;
-- SET log_min_duration_statement = 1000; -- Log queries > 1 second

-- Check slow queries (requires pg_stat_statements extension)
-- SELECT query, calls, total_time, mean_time, rows 
-- FROM pg_stat_statements 
-- ORDER BY mean_time DESC 
-- LIMIT 10;
