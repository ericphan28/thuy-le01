-- =====================================================
-- 🧪 TEST SUITE: SUPABASE POS CHECKOUT FUNCTION
-- =====================================================
-- Mục đích: Test function với data thực từ database
-- Ngày: 2025-08-05
-- =====================================================

-- =====================================================
-- 🔍 STEP 1: KIỂM TRA DATA THỰC CÓ SẴN
-- =====================================================

-- 1.1 Xem customers có sẵn (test customer)
SELECT 
    customer_id, 
    customer_code, 
    customer_name, 
    debt_limit, 
    current_debt,
    is_active
FROM customers 
WHERE is_active = true 
ORDER BY customer_id DESC 
LIMIT 10;

-- 1.2 Xem products có sẵn với stock > 0
SELECT 
    product_id, 
    product_code, 
    product_name, 
    sale_price, 
    current_stock,
    cost_price,
    is_active,
    allow_sale
FROM products 
WHERE is_active = true 
AND allow_sale = true 
AND current_stock > 0
ORDER BY current_stock DESC 
LIMIT 10;

-- 1.3 Kiểm tra invoices gần đây để tham khảo
SELECT 
    invoice_id,
    invoice_code,
    customer_name,
    total_amount,
    invoice_date
FROM invoices 
ORDER BY invoice_date DESC 
LIMIT 5;

-- =====================================================
-- 🧪 STEP 2: TEST CASES
-- =====================================================

-- =====================================================
-- TEST 1: SIMPLE CHECKOUT (Cơ bản)
-- =====================================================
-- Mục đích: Test basic functionality với 1 sản phẩm
-- Expected: Success

SELECT 'TEST 1: Simple Checkout' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 833,  -- Customer: Thắng bida (test)
    p_cart_items := '[
        {"product_id": 1, "quantity": 1, "unit_price": 50000}
    ]'::jsonb,
    p_vat_rate := 0,
    p_discount_type := 'percentage',
    p_discount_value := 0,
    p_payment_method := 'cash',
    p_received_amount := 50000,
    p_branch_id := 1,
    p_created_by := 'TEST System'
) as test1_result;

-- =====================================================
-- TEST 2: MULTIPLE ITEMS WITH VAT & DISCOUNT
-- =====================================================
-- Mục đích: Test VAT 10% và discount 5%
-- Expected: Success với calculations đúng

SELECT 'TEST 2: Multiple Items + VAT + Discount' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 2, "unit_price": 50000},
        {"product_id": 2, "quantity": 1, "unit_price": 30000}
    ]'::jsonb,
    p_vat_rate := 10,  -- 10% VAT
    p_discount_type := 'percentage',
    p_discount_value := 5,  -- 5% discount
    p_payment_method := 'cash',
    p_received_amount := 150000,
    p_branch_id := 1,
    p_created_by := 'TEST System'
) as test2_result;

-- Expected calculation:
-- Subtotal: (50000*2) + (30000*1) = 130000
-- Discount 5%: 130000 * 0.05 = 6500
-- After discount: 130000 - 6500 = 123500
-- VAT 10%: 123500 * 0.10 = 12350
-- Total: 123500 + 12350 = 135850

-- =====================================================
-- TEST 3: AMOUNT DISCOUNT TYPE
-- =====================================================
-- Mục đích: Test discount theo số tiền cố định
-- Expected: Success

SELECT 'TEST 3: Amount Discount' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 1, "unit_price": 100000}
    ]'::jsonb,
    p_vat_rate := 8,  -- 8% VAT
    p_discount_type := 'amount',
    p_discount_value := 10000,  -- Giảm 10,000 VND
    p_payment_method := 'card',
    p_received_amount := 100000,
    p_branch_id := 1,
    p_created_by := 'TEST System'
) as test3_result;

-- Expected calculation:
-- Subtotal: 100000
-- Discount: 10000 (fixed amount)
-- After discount: 100000 - 10000 = 90000
-- VAT 8%: 90000 * 0.08 = 7200
-- Total: 90000 + 7200 = 97200

-- =====================================================
-- TEST 4: TRANSFER PAYMENT METHOD
-- =====================================================
-- Mục đích: Test payment method transfer
-- Expected: Success

SELECT 'TEST 4: Transfer Payment' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 1, "unit_price": 75000}
    ]'::jsonb,
    p_vat_rate := 5,  -- 5% VAT
    p_discount_type := 'percentage',
    p_discount_value := 0,  -- No discount
    p_payment_method := 'transfer',
    p_received_amount := 78750,  -- Exact amount
    p_branch_id := 1,
    p_created_by := 'TEST System'
) as test4_result;

-- =====================================================
-- TEST 5: CREDIT SALE (No received amount)
-- =====================================================
-- Mục đích: Test bán chịu (không nhận tiền)
-- Expected: Success, debt increased

SELECT 'TEST 5: Credit Sale' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 1, "unit_price": 60000}
    ]'::jsonb,
    p_vat_rate := 10,
    p_discount_type := 'percentage',
    p_discount_value := 0,
    p_payment_method := 'cash',
    p_received_amount := NULL,  -- No payment - credit sale
    p_branch_id := 1,
    p_created_by := 'TEST System'
) as test5_result;

-- =====================================================
-- TEST 6: ERROR CASE - INVALID CUSTOMER
-- =====================================================
-- Mục đích: Test error handling
-- Expected: Error với customer not found

SELECT 'TEST 6: Invalid Customer' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 99999,  -- Invalid customer ID
    p_cart_items := '[
        {"product_id": 1, "quantity": 1, "unit_price": 50000}
    ]'::jsonb,
    p_vat_rate := 0,
    p_discount_type := 'percentage',
    p_discount_value := 0,
    p_payment_method := 'cash',
    p_received_amount := 50000
) as test6_result;

-- =====================================================
-- TEST 7: ERROR CASE - INSUFFICIENT STOCK
-- =====================================================
-- Mục đích: Test stock validation
-- Expected: Error với insufficient stock

SELECT 'TEST 7: Insufficient Stock' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 999999, "unit_price": 50000}
    ]'::jsonb,
    p_vat_rate := 0,
    p_discount_type := 'percentage',
    p_discount_value := 0,
    p_payment_method := 'cash',
    p_received_amount := 50000
) as test7_result;

-- =====================================================
-- TEST 8: ERROR CASE - INSUFFICIENT PAYMENT
-- =====================================================
-- Mục đích: Test payment validation
-- Expected: Error với insufficient payment

SELECT 'TEST 8: Insufficient Payment' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 1, "unit_price": 50000}
    ]'::jsonb,
    p_vat_rate := 10,  -- VAT will make total > received
    p_discount_type := 'percentage',
    p_discount_value := 0,
    p_payment_method := 'cash',
    p_received_amount := 50000,  -- Not enough for VAT
    p_branch_id := 1,
    p_created_by := 'TEST System'
) as test8_result;

-- =====================================================
-- TEST 9: ERROR CASE - INVALID VAT RATE
-- =====================================================
-- Mục đích: Test VAT validation
-- Expected: Error với invalid VAT rate

SELECT 'TEST 9: Invalid VAT Rate' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 1, "unit_price": 50000}
    ]'::jsonb,
    p_vat_rate := 15,  -- Invalid VAT rate
    p_discount_type := 'percentage',
    p_discount_value := 0,
    p_payment_method := 'cash',
    p_received_amount := 50000
) as test9_result;

-- =====================================================
-- TEST 10: LARGE TRANSACTION
-- =====================================================
-- Mục đích: Test với nhiều sản phẩm
-- Expected: Success

SELECT 'TEST 10: Large Transaction' as test_name;

SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 3, "unit_price": 50000},
        {"product_id": 2, "quantity": 2, "unit_price": 30000},
        {"product_id": 3, "quantity": 1, "unit_price": 80000},
        {"product_id": 4, "quantity": 5, "unit_price": 20000}
    ]'::jsonb,
    p_vat_rate := 10,
    p_discount_type := 'percentage',
    p_discount_value := 10,  -- 10% discount
    p_payment_method := 'cash',
    p_received_amount := 400000,
    p_branch_id := 1,
    p_created_by := 'TEST System'
) as test10_result;

-- =====================================================
-- 📊 VERIFICATION QUERIES
-- =====================================================

-- Kiểm tra invoices vừa tạo
SELECT 'Recently Created Invoices:' as info;

SELECT 
    invoice_id,
    invoice_code,
    customer_name,
    total_amount,
    customer_paid,
    notes::jsonb->>'payment_method' as payment_method,
    notes::jsonb->>'vat_rate' as vat_rate,
    notes::jsonb->>'discount_amount' as discount_amount,
    invoice_date
FROM invoices 
WHERE invoice_date > NOW() - INTERVAL '1 hour'
ORDER BY invoice_date DESC;

-- Kiểm tra invoice details
SELECT 'Recently Created Invoice Details:' as info;

SELECT 
    id.invoice_code,
    id.product_name,
    id.quantity,
    id.unit_price,
    id.line_total,
    id.cash_payment,
    id.card_payment,
    id.transfer_payment
FROM invoice_details id
JOIN invoices i ON id.invoice_id = i.invoice_id
WHERE i.invoice_date > NOW() - INTERVAL '1 hour'
ORDER BY id.invoice_code, id.detail_id;

-- Kiểm tra stock changes
SELECT 'Product Stock Changes:' as info;

SELECT 
    product_id,
    product_name,
    current_stock,
    updated_at
FROM products 
WHERE updated_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;

-- Kiểm tra customer debt changes
SELECT 'Customer Debt Changes:' as info;

SELECT 
    customer_id,
    customer_name,
    current_debt,
    total_revenue,
    purchase_count,
    last_purchase_date,
    updated_at
FROM customers 
WHERE customer_id = 833;  -- Test customer
