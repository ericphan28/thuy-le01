-- Update create_pos_invoice function to support debt management integration
-- Add support for payment types (full, partial, debt) and debt tracking

-- Ensure we have a sequence for invoice code generation
CREATE SEQUENCE IF NOT EXISTS public.invoice_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

DROP FUNCTION IF EXISTS public.create_pos_invoice(
    integer, jsonb, numeric, character varying, numeric, 
    character varying, numeric, integer, character varying
);

CREATE OR REPLACE FUNCTION public.create_pos_invoice(
    p_customer_id integer,
    p_cart_items jsonb,
    p_vat_rate numeric DEFAULT 0,
    p_discount_type character varying DEFAULT 'percentage',
    p_discount_value numeric DEFAULT 0,
    p_payment_method character varying DEFAULT 'cash',
    p_received_amount numeric DEFAULT NULL,
    p_paid_amount numeric DEFAULT NULL,
    p_debt_amount numeric DEFAULT 0,
    p_payment_type character varying DEFAULT 'full',
    p_branch_id integer DEFAULT 1,
    p_created_by character varying DEFAULT 'POS'
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice_id integer;
    v_invoice_code varchar(20);
    v_customer customers%ROWTYPE;
    v_product products%ROWTYPE;
    v_subtotal numeric := 0;
    v_discount_amount numeric := 0;
    v_vat_amount numeric := 0;
    v_total_amount numeric := 0;
    v_change_amount numeric := 0;
    v_cart_item jsonb;
    v_line_total numeric;
    v_warnings text[] := '{}';
    v_new_debt numeric;
    v_debt_warning text;
BEGIN
    -- Validate customer
    SELECT * INTO v_customer FROM customers WHERE customer_id = p_customer_id AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Khách hàng không tồn tại hoặc không hoạt động',
            'error_code', 'CUSTOMER_NOT_FOUND'
        );
    END IF;

    -- Calculate subtotal and validate stock
    FOR v_cart_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
    LOOP
        SELECT * INTO v_product FROM products 
        WHERE product_id = (v_cart_item->>'product_id')::integer;
        
        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Sản phẩm không tồn tại: ' || (v_cart_item->>'product_id'),
                'error_code', 'PRODUCT_NOT_FOUND'
            );
        END IF;

        -- Check stock
        IF v_product.current_stock < (v_cart_item->>'quantity')::numeric THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Không đủ hàng: ' || v_product.product_name,
                'error_code', 'INSUFFICIENT_STOCK'
            );
        END IF;

        v_line_total := (v_cart_item->>'quantity')::numeric * (v_cart_item->>'unit_price')::numeric;
        v_subtotal := v_subtotal + v_line_total;
    END LOOP;

    -- Calculate discount
    IF p_discount_type = 'percentage' THEN
        v_discount_amount := v_subtotal * (p_discount_value / 100);
    ELSE
        v_discount_amount := LEAST(p_discount_value, v_subtotal);
    END IF;

    -- Calculate VAT and total
    v_vat_amount := (v_subtotal - v_discount_amount) * (p_vat_rate / 100);
    v_total_amount := v_subtotal - v_discount_amount + v_vat_amount;

    -- Calculate debt after transaction
    v_new_debt := v_customer.current_debt + COALESCE(p_debt_amount, 0);
    
    -- Generate debt warning if exceeds limit (warning only, not blocking)
    IF v_new_debt > v_customer.debt_limit THEN
        v_debt_warning := format(
            'Cảnh báo: Công nợ sau giao dịch (%s) vượt hạn mức (%s) là %s',
            to_char(v_new_debt, 'FM999,999,999,999'),
            to_char(v_customer.debt_limit, 'FM999,999,999,999'),
            to_char(v_new_debt - v_customer.debt_limit, 'FM999,999,999,999')
        );
        v_warnings := array_append(v_warnings, v_debt_warning);
    END IF;

    -- Validate payment for cash transactions
    IF p_payment_method = 'cash' AND p_payment_type = 'full' THEN
        IF COALESCE(p_received_amount, 0) < v_total_amount THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Số tiền thanh toán không đủ',
                'error_code', 'INSUFFICIENT_PAYMENT'
            );
        END IF;
        v_change_amount := COALESCE(p_received_amount, 0) - v_total_amount;
    END IF;

    -- Generate invoice code (sử dụng invoice_code_seq riêng biệt)
    v_invoice_code := 'INV' || to_char(CURRENT_DATE, 'YYMMDD') || 
                      LPAD(nextval('invoice_code_seq')::text, 4, '0');

    -- Create invoice
    INSERT INTO invoices (
        invoice_code, customer_id, customer_name, total_amount, 
        customer_paid, invoice_date, branch_id, notes,
        vat_rate, vat_amount, discount_type, discount_value,
        status, created_at
    ) VALUES (
        v_invoice_code, p_customer_id, v_customer.customer_name, v_total_amount,
        COALESCE(p_paid_amount, CASE WHEN p_payment_type = 'full' THEN v_total_amount ELSE 0 END),
        CURRENT_TIMESTAMP, p_branch_id,
        CASE WHEN p_payment_type != 'full' THEN 
            format('Thanh toán %s: %s VND, Ghi nợ: %s VND, Phương thức: %s', 
                   p_payment_type,
                   COALESCE(p_paid_amount, 0), 
                   COALESCE(p_debt_amount, 0),
                   p_payment_method)
        ELSE format('Thanh toán đầy đủ - Phương thức: %s', p_payment_method) END,
        p_vat_rate, v_vat_amount, p_discount_type, p_discount_value,
        CASE WHEN p_debt_amount > 0 THEN 'partial' ELSE 'completed' END,
        CURRENT_TIMESTAMP
    ) RETURNING invoice_id INTO v_invoice_id;

    -- Create invoice details
    FOR v_cart_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
    LOOP
        SELECT * INTO v_product FROM products 
        WHERE product_id = (v_cart_item->>'product_id')::integer;
        
        INSERT INTO invoice_details (
            invoice_id, product_id, invoice_code, product_code, product_name,
            customer_code, customer_name, branch_id, invoice_date,
            quantity, unit_price, sale_price, line_total, subtotal,
            customer_id, created_at
        ) VALUES (
            v_invoice_id,
            (v_cart_item->>'product_id')::integer,
            v_invoice_code,
            v_product.product_code,
            v_product.product_name,
            v_customer.customer_code,
            v_customer.customer_name,
            p_branch_id,
            CURRENT_TIMESTAMP,
            (v_cart_item->>'quantity')::numeric,
            (v_cart_item->>'unit_price')::numeric,
            (v_cart_item->>'unit_price')::numeric,
            (v_cart_item->>'quantity')::numeric * (v_cart_item->>'unit_price')::numeric,
            (v_cart_item->>'quantity')::numeric * (v_cart_item->>'unit_price')::numeric,
            p_customer_id,
            CURRENT_TIMESTAMP
        );

        -- Update product stock
        UPDATE products 
        SET current_stock = current_stock - (v_cart_item->>'quantity')::numeric
        WHERE product_id = (v_cart_item->>'product_id')::integer;
    END LOOP;

    -- Update customer debt if applicable
    IF p_debt_amount > 0 THEN
        UPDATE customers 
        SET current_debt = current_debt + p_debt_amount,
            last_purchase_date = CURRENT_TIMESTAMP
        WHERE customer_id = p_customer_id;
    END IF;

    -- Create debt transaction record if debt involved
    IF p_debt_amount > 0 THEN
        INSERT INTO debt_transactions (
            customer_id, invoice_id, transaction_type, amount,
            old_debt, new_debt, payment_method, notes, created_by
        ) VALUES (
            p_customer_id, v_invoice_id, 'debt_increase', p_debt_amount,
            v_customer.current_debt, v_new_debt, p_payment_method,
            format('Ghi nợ từ hóa đơn %s (%s)', v_invoice_code, p_payment_type),
            p_created_by
        );
    END IF;

    -- Return success with comprehensive information
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_code', v_invoice_code,
        'customer_name', v_customer.customer_name,
        'totals', jsonb_build_object(
            'subtotal_amount', v_subtotal,
            'discount_amount', v_discount_amount,
            'vat_amount', v_vat_amount,
            'total_amount', v_total_amount,
            'paid_amount', COALESCE(p_paid_amount, CASE WHEN p_payment_type = 'full' THEN v_total_amount ELSE 0 END),
            'debt_amount', COALESCE(p_debt_amount, 0),
            'change_amount', v_change_amount
        ),
        'payment_info', jsonb_build_object(
            'method', p_payment_method,
            'type', p_payment_type,
            'received_amount', p_received_amount
        ),
        'customer_info', jsonb_build_object(
            'customer_id', v_customer.customer_id,
            'customer_name', v_customer.customer_name,
            'previous_debt', v_customer.current_debt,
            'new_debt', v_new_debt,
            'debt_limit', v_customer.debt_limit
        ),
        'warnings', v_warnings,
        'summary', format(
            'Hóa đơn %s - Khách hàng: %s - Tổng: %s - Thanh toán: %s',
            v_invoice_code,
            v_customer.customer_name,
            to_char(v_total_amount, 'FM999,999,999,999'),
            p_payment_type
        )
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Lỗi hệ thống: ' || SQLERRM,
            'error_code', 'SYSTEM_ERROR'
        );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_pos_invoice TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.create_pos_invoice IS 
'Enhanced POS Checkout Function with debt management integration. 
Supports full, partial, and debt payment types with warning system for debt limit exceeding.';
