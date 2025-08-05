-- =====================================================
-- 📋 QUERY CHI TIẾT HÓA ĐƠN: Invoice ID 745
-- =====================================================
-- Lấy thông tin đầy đủ của hóa đơn vừa tạo
-- Bao gồm: Invoice header, details, customer info, products
-- =====================================================

-- =====================================================
-- 1️⃣ THÔNG TIN TỔNG QUAN HÓA ĐƠN
-- =====================================================
SELECT 
    '=== THÔNG TIN HÓA ĐƠN ===' as section,
    i.invoice_id,
    i.invoice_code,
    i.invoice_date,
    i.customer_id,
    i.customer_name,
    i.branch_id,
    i.total_amount,
    i.customer_paid,
    i.status,
    -- Parse VAT/Discount info từ notes JSON
    i.notes::jsonb->>'payment_method' as payment_method,
    i.notes::jsonb->>'vat_rate' as vat_rate,
    i.notes::jsonb->>'vat_amount' as vat_amount,
    i.notes::jsonb->>'discount_type' as discount_type,
    i.notes::jsonb->>'discount_value' as discount_value,
    i.notes::jsonb->>'discount_amount' as discount_amount,
    i.notes::jsonb->>'subtotal_amount' as subtotal_amount,
    i.notes::jsonb->>'change_amount' as change_amount,
    i.notes::jsonb->>'summary' as summary,
    i.created_at,
    i.updated_at
FROM invoices i
WHERE i.invoice_id = 745;

-- =====================================================
-- 2️⃣ CHI TIẾT SẢN PHẨM TRONG HÓA ĐƠN
-- =====================================================
SELECT 
    '=== CHI TIẾT SẢN PHẨM ===' as section,
    id.detail_id,
    id.invoice_code,
    id.product_id,
    id.product_code,
    id.product_name,
    id.quantity,
    id.unit_price,
    id.sale_price,
    id.line_total,
    id.subtotal,
    id.cost_price,
    id.profit_amount,
    
    -- Payment method breakdown
    id.cash_payment,
    id.card_payment,
    id.transfer_payment,
    id.wallet_payment,
    id.points_payment,
    
    -- Discount info
    id.discount_percent,
    id.discount_amount,
    id.total_discount,
    
    id.customer_paid,
    id.status,
    id.created_at
FROM invoice_details id
WHERE id.invoice_id = 745
ORDER BY id.detail_id;

-- =====================================================
-- 3️⃣ THÔNG TIN KHÁCH HÀNG
-- =====================================================
SELECT 
    '=== THÔNG TIN KHÁCH HÀNG ===' as section,
    c.customer_id,
    c.customer_code,
    c.customer_name,
    c.phone,
    c.email,
    c.address,
    c.current_debt,
    c.debt_limit,
    c.total_revenue,
    c.total_profit,
    c.purchase_count,
    c.last_purchase_date,
    ct.type_name as customer_type,
    c.is_active
FROM customers c
LEFT JOIN customer_types ct ON c.customer_type_id = ct.type_id
WHERE c.customer_id = (
    SELECT customer_id FROM invoices WHERE invoice_id = 745
);

-- =====================================================
-- 4️⃣ THÔNG TIN SẢN PHẨM SAU KHI BÁN
-- =====================================================
SELECT 
    '=== TRẠNG THÁI SẢN PHẨM SAU BÁN ===' as section,
    p.product_id,
    p.product_code,
    p.product_name,
    p.current_stock as stock_after_sale,
    p.sale_price,
    p.cost_price,
    p.min_stock,
    p.max_stock,
    pc.category_name,
    p.is_medicine,
    p.requires_prescription,
    p.allow_sale,
    p.is_active,
    p.updated_at as stock_updated_at,
    
    -- Stock status
    CASE 
        WHEN p.current_stock = 0 THEN '🚨 HẾT HÀNG'
        WHEN p.current_stock <= p.min_stock THEN '⚠️ SẮP HẾT'
        WHEN p.current_stock >= p.max_stock THEN '📦 TỒN KHO CAO'
        ELSE '✅ BÌNH THƯỜNG'
    END as stock_status
FROM products p
LEFT JOIN product_categories pc ON p.category_id = pc.category_id
WHERE p.product_id IN (
    SELECT DISTINCT product_id 
    FROM invoice_details 
    WHERE invoice_id = 745
)
ORDER BY p.product_name;

-- =====================================================
-- 5️⃣ TỔNG KẾT TÍNH TOÁN
-- =====================================================
SELECT 
    '=== TỔNG KẾT TÍNH TOÁN ===' as section,
    
    -- Invoice totals
    i.total_amount as final_total,
    i.customer_paid as amount_paid,
    (i.customer_paid - i.total_amount) as change_amount,
    
    -- Parsed from notes
    (i.notes::jsonb->>'subtotal_amount')::numeric as subtotal,
    (i.notes::jsonb->>'discount_amount')::numeric as discount_amount,
    (i.notes::jsonb->>'vat_amount')::numeric as vat_amount,
    
    -- Calculated from details
    SUM(id.quantity) as total_quantity,
    COUNT(id.detail_id) as total_items,
    SUM(id.line_total) as calculated_subtotal,
    SUM(id.profit_amount) as total_profit,
    
    -- Payment breakdown
    SUM(id.cash_payment) as total_cash,
    SUM(id.card_payment) as total_card,
    SUM(id.transfer_payment) as total_transfer,
    
    -- Verification
    CASE 
        WHEN SUM(id.line_total) = (i.notes::jsonb->>'subtotal_amount')::numeric 
        THEN '✅ SUBTOTAL MATCH'
        ELSE '❌ SUBTOTAL MISMATCH'
    END as subtotal_verification,
    
    CASE 
        WHEN i.total_amount = (
            (i.notes::jsonb->>'subtotal_amount')::numeric - 
            (i.notes::jsonb->>'discount_amount')::numeric + 
            (i.notes::jsonb->>'vat_amount')::numeric
        )
        THEN '✅ TOTAL CALCULATION CORRECT'
        ELSE '❌ TOTAL CALCULATION ERROR'
    END as calculation_verification

FROM invoices i
JOIN invoice_details id ON i.invoice_id = id.invoice_id
WHERE i.invoice_id = 745
GROUP BY 
    i.invoice_id, i.total_amount, i.customer_paid, 
    i.notes::jsonb->>'subtotal_amount',
    i.notes::jsonb->>'discount_amount',
    i.notes::jsonb->>'vat_amount';

-- =====================================================
-- 6️⃣ LỊCH SỬ THAY ĐỔI STOCK
-- =====================================================
-- Hiển thị products đã được update gần đây (trong 1 giờ qua)
SELECT 
    '=== LỊCH SỬ THAY ĐỔI STOCK ===' as section,
    p.product_id,
    p.product_code,
    p.product_name,
    p.current_stock,
    p.updated_at,
    
    -- Estimate stock before sale (có thể không chính xác 100%)
    p.current_stock + COALESCE(sold.quantity_sold, 0) as estimated_stock_before,
    COALESCE(sold.quantity_sold, 0) as quantity_sold_in_invoice,
    
    EXTRACT(EPOCH FROM (NOW() - p.updated_at))/60 as minutes_since_update
FROM products p
LEFT JOIN (
    SELECT product_id, SUM(quantity) as quantity_sold
    FROM invoice_details 
    WHERE invoice_id = 745
    GROUP BY product_id
) sold ON p.product_id = sold.product_id
WHERE p.updated_at > NOW() - INTERVAL '2 hours'
AND p.product_id IN (
    SELECT DISTINCT product_id 
    FROM invoice_details 
    WHERE invoice_id = 745
)
ORDER BY p.updated_at DESC;

-- =====================================================
-- 7️⃣ KIỂM TRA FUNCTION RESULT (nếu có)
-- =====================================================
-- Simulate function call với cart items thực từ invoice 745
WITH invoice_data AS (
    SELECT 
        i.customer_id,
        i.notes::jsonb->>'payment_method' as payment_method,
        (i.notes::jsonb->>'vat_rate')::numeric as vat_rate,
        i.notes::jsonb->>'discount_type' as discount_type,
        (i.notes::jsonb->>'discount_value')::numeric as discount_value,
        i.customer_paid,
        
        -- Reconstruct cart items từ invoice_details
        jsonb_agg(
            jsonb_build_object(
                'product_id', id.product_id,
                'quantity', id.quantity,
                'unit_price', id.unit_price
            )
        ) as cart_items
    FROM invoices i
    JOIN invoice_details id ON i.invoice_id = id.invoice_id
    WHERE i.invoice_id = 745
    GROUP BY i.customer_id, i.notes, i.customer_paid
)
SELECT 
    '=== FUNCTION VALIDATION TEST ===' as section,
    inv.customer_id,
    inv.cart_items,
    inv.vat_rate,
    inv.discount_type,
    inv.discount_value,
    inv.payment_method,
    inv.customer_paid,
    
    -- Function validation would check these conditions:
    CASE 
        WHEN inv.customer_id IS NULL THEN '❌ Customer ID is NULL'
        WHEN jsonb_array_length(inv.cart_items) = 0 THEN '❌ Empty cart'
        WHEN inv.vat_rate NOT IN (0, 5, 8, 10) THEN '❌ Invalid VAT rate'
        WHEN inv.discount_type NOT IN ('percentage', 'amount') THEN '❌ Invalid discount type'
        WHEN inv.payment_method NOT IN ('cash', 'card', 'transfer') THEN '❌ Invalid payment method'
        ELSE '✅ All validations would PASS'
    END as validation_status
FROM invoice_data inv;

-- =====================================================
-- 8️⃣ FUNCTION ERROR TESTING
-- =====================================================
-- Test various error scenarios that function handles
SELECT '=== ERROR SCENARIO TESTS ===' as section;

-- Test 1: Empty cart (như query trước)
SELECT 
    'Test 1: Empty Cart' as test_case,
    public.create_pos_invoice(
        p_customer_id := 833,
        p_cart_items := '[]'::jsonb,
        p_vat_rate := 0,
        p_discount_type := 'percentage',
        p_discount_value := 0,
        p_payment_method := 'cash'
    ) as result;

-- Test 2: Invalid VAT rate
SELECT 
    'Test 2: Invalid VAT Rate' as test_case,
    public.create_pos_invoice(
        p_customer_id := 833,
        p_cart_items := '[{"product_id": 1, "quantity": 1, "unit_price": 50000}]'::jsonb,
        p_vat_rate := 15, -- Invalid VAT
        p_discount_type := 'percentage',
        p_discount_value := 0,
        p_payment_method := 'cash'
    ) as result;

-- Test 3: Invalid discount type
SELECT 
    'Test 3: Invalid Discount Type' as test_case,
    public.create_pos_invoice(
        p_customer_id := 833,
        p_cart_items := '[{"product_id": 1, "quantity": 1, "unit_price": 50000}]'::jsonb,
        p_vat_rate := 0,
        p_discount_type := 'invalid_type', -- Invalid discount type
        p_discount_value := 0,
        p_payment_method := 'cash'
    ) as result;

-- Test 4: Invalid payment method
SELECT 
    'Test 4: Invalid Payment Method' as test_case,
    public.create_pos_invoice(
        p_customer_id := 833,
        p_cart_items := '[{"product_id": 1, "quantity": 1, "unit_price": 50000}]'::jsonb,
        p_vat_rate := 0,
        p_discount_type := 'percentage',
        p_discount_value := 0,
        p_payment_method := 'crypto' -- Invalid payment method
    ) as result;
