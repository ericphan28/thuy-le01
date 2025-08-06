-- Test script để kiểm tra function create_pos_invoice với debt management

-- Test 1: Kiểm tra function signature hiện tại
SELECT routine_name, specific_name, routine_type, routine_definition
FROM information_schema.routines 
WHERE routine_name = 'create_pos_invoice';

-- Test 2: Kiểm tra parameters của function
SELECT 
    parameter_name,
    data_type,
    parameter_default,
    parameter_mode
FROM information_schema.parameters 
WHERE specific_name IN (
    SELECT specific_name 
    FROM information_schema.routines 
    WHERE routine_name = 'create_pos_invoice'
)
ORDER BY ordinal_position;

-- Test 3: Test với data đơn giản
SELECT public.create_pos_invoice(
    p_customer_id := 1,
    p_cart_items := '[{"product_id": 1, "quantity": 1, "unit_price": 10000}]'::jsonb,
    p_vat_rate := 0,
    p_discount_type := 'percentage',
    p_discount_value := 0,
    p_payment_method := 'cash',
    p_received_amount := 10000,
    p_paid_amount := 10000,
    p_debt_amount := 0,
    p_payment_type := 'full',
    p_branch_id := 1,
    p_created_by := 'TEST'
);
