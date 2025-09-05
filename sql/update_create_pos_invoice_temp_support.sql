-- =========================================
-- UPDATE create_pos_invoice FUNCTION FOR TEMP INVOICES
-- =========================================
-- Date: September 4, 2025
-- Purpose: Extend create_pos_invoice function to support temp invoices

CREATE OR REPLACE FUNCTION public.create_pos_invoice(
    p_customer_id integer, 
    p_cart_items jsonb, 
    p_vat_rate numeric DEFAULT 0, 
    p_discount_type character varying DEFAULT 'percentage'::character varying, 
    p_discount_value numeric DEFAULT 0, 
    p_payment_method character varying DEFAULT 'cash'::character varying, 
    p_received_amount numeric DEFAULT NULL::numeric, 
    p_paid_amount numeric DEFAULT NULL::numeric, 
    p_debt_amount numeric DEFAULT 0, 
    p_payment_type character varying DEFAULT 'full'::character varying, 
    p_branch_id integer DEFAULT 1, 
    p_created_by character varying DEFAULT 'POS'::character varying,
    -- NEW PARAMETERS FOR TEMP INVOICES
    p_invoice_type character varying DEFAULT 'normal'::character varying,
    p_expected_delivery_date date DEFAULT NULL
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
    v_final_status varchar(50);
    v_temp_code_prefix varchar(10);
BEGIN
    -- Validate invoice type
    IF p_invoice_type NOT IN ('normal', 'temp_order') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Loại hóa đơn không hợp lệ',
            'error_code', 'INVALID_INVOICE_TYPE'
        );
    END IF;

    -- Validate temp order requirements
    IF p_invoice_type = 'temp_order' THEN
        IF p_expected_delivery_date IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Ngày dự kiến xuất hàng là bắt buộc cho phiếu tạm',
                'error_code', 'MISSING_DELIVERY_DATE'
            );
        END IF;
        
        IF p_expected_delivery_date <= CURRENT_DATE THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Ngày dự kiến xuất hàng phải sau hôm nay',
                'error_code', 'INVALID_DELIVERY_DATE'
            );
        END IF;
    END IF;

    -- Validate customer
    SELECT * INTO v_customer FROM customers WHERE customer_id = p_customer_id AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Khách hàng không tồn tại hoặc không hoạt động',
            'error_code', 'CUSTOMER_NOT_FOUND'
        );
    END IF;

    -- Calculate subtotal and validate stock (but don't deduct for temp orders)
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

        -- Check stock (warning for temp orders, blocking for normal orders)
        IF v_product.current_stock < (v_cart_item->>'quantity')::numeric THEN
            IF p_invoice_type = 'normal' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Không đủ hàng: ' || v_product.product_name,
                    'error_code', 'INSUFFICIENT_STOCK'
                );
            ELSE
                -- For temp orders, add warning but continue
                v_warnings := array_append(v_warnings, 
                    format('Cảnh báo: Tồn kho hiện tại (%s) không đủ cho sản phẩm %s (đặt: %s)',
                           v_product.current_stock, v_product.product_name, (v_cart_item->>'quantity')::numeric));
            END IF;
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

    -- Validate payment for cash transactions (only for normal invoices)
    IF p_invoice_type = 'normal' AND p_payment_method = 'cash' AND p_payment_type = 'full' THEN
        IF COALESCE(p_received_amount, 0) < v_total_amount THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Số tiền thanh toán không đủ',
                'error_code', 'INSUFFICIENT_PAYMENT'
            );
        END IF;
        v_change_amount := COALESCE(p_received_amount, 0) - v_total_amount;
    END IF;

    -- Determine invoice code prefix and status based on type
    IF p_invoice_type = 'temp_order' THEN
        v_temp_code_prefix := 'TMP';
        v_final_status := 'temp_pending';
    ELSE
        v_temp_code_prefix := 'INV';
        v_final_status := CASE WHEN p_debt_amount > 0 THEN 'partial' ELSE 'completed' END;
    END IF;

    -- Generate invoice code
    v_invoice_code := v_temp_code_prefix || to_char(CURRENT_DATE, 'YYMMDD') || 
                      LPAD(nextval('invoice_code_seq')::text, 4, '0');

    -- Create invoice
    INSERT INTO invoices (
        invoice_code, customer_id, customer_name, total_amount, 
        customer_paid, invoice_date, branch_id, notes,
        vat_rate, vat_amount, discount_type, discount_value,
        status, created_at,
        -- NEW FIELDS
        invoice_type, expected_delivery_date
    ) VALUES (
        v_invoice_code, p_customer_id, v_customer.customer_name, v_total_amount,
        -- For temp orders, customer_paid is always 0 initially
        CASE WHEN p_invoice_type = 'temp_order' THEN 0 
             ELSE COALESCE(p_paid_amount, CASE WHEN p_payment_type = 'full' THEN v_total_amount ELSE 0 END) END,
        CURRENT_TIMESTAMP, p_branch_id,
        CASE 
            WHEN p_invoice_type = 'temp_order' THEN 
                format('PHIẾU TẠM - Ngày xuất dự kiến: %s. %s', 
                       to_char(p_expected_delivery_date, 'DD/MM/YYYY'),
                       COALESCE(p_created_by || ' notes', ''))
            WHEN p_payment_type != 'full' THEN 
                format('Thanh toán %s: %s VND, Ghi nợ: %s VND, Phương thức: %s', 
                       p_payment_type,
                       COALESCE(p_paid_amount, 0), 
                       COALESCE(p_debt_amount, 0),
                       p_payment_method)
            ELSE format('Thanh toán đầy đủ - Phương thức: %s', p_payment_method) 
        END,
        p_vat_rate, v_vat_amount, p_discount_type, p_discount_value,
        v_final_status,
        CURRENT_TIMESTAMP,
        -- NEW VALUES
        p_invoice_type, p_expected_delivery_date
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

        -- Update product stock ONLY for normal invoices, not for temp orders
        IF p_invoice_type = 'normal' THEN
            UPDATE products 
            SET current_stock = current_stock - (v_cart_item->>'quantity')::numeric
            WHERE product_id = (v_cart_item->>'product_id')::integer;
        END IF;
    END LOOP;

    -- Update customer debt ONLY for normal invoices with debt
    IF p_invoice_type = 'normal' AND p_debt_amount > 0 THEN
        UPDATE customers 
        SET current_debt = current_debt + p_debt_amount,
            last_purchase_date = CURRENT_TIMESTAMP
        WHERE customer_id = p_customer_id;

        -- Create debt transaction record
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
        'invoice_type', p_invoice_type,
        'customer_name', v_customer.customer_name,
        'expected_delivery_date', p_expected_delivery_date,
        'totals', jsonb_build_object(
            'subtotal_amount', v_subtotal,
            'discount_amount', v_discount_amount,
            'vat_amount', v_vat_amount,
            'total_amount', v_total_amount,
            'paid_amount', CASE WHEN p_invoice_type = 'temp_order' THEN 0 
                               ELSE COALESCE(p_paid_amount, CASE WHEN p_payment_type = 'full' THEN v_total_amount ELSE 0 END) END,
            'debt_amount', CASE WHEN p_invoice_type = 'temp_order' THEN 0 ELSE COALESCE(p_debt_amount, 0) END,
            'change_amount', v_change_amount
        ),
        'payment_info', jsonb_build_object(
            'method', p_payment_method,
            'type', CASE WHEN p_invoice_type = 'temp_order' THEN 'temp_order' ELSE p_payment_type END,
            'received_amount', p_received_amount
        ),
        'customer_info', jsonb_build_object(
            'customer_id', v_customer.customer_id,
            'customer_name', v_customer.customer_name,
            'previous_debt', v_customer.current_debt,
            'new_debt', CASE WHEN p_invoice_type = 'temp_order' THEN v_customer.current_debt ELSE v_new_debt END,
            'debt_limit', v_customer.debt_limit
        ),
        'warnings', v_warnings,
        'summary', format(
            '%s %s - Khách hàng: %s - Tổng: %s%s',
            CASE WHEN p_invoice_type = 'temp_order' THEN 'Phiếu tạm' ELSE 'Hóa đơn' END,
            v_invoice_code,
            v_customer.customer_name,
            to_char(v_total_amount, 'FM999,999,999,999'),
            CASE WHEN p_invoice_type = 'temp_order' THEN 
                format(' - Xuất: %s', to_char(p_expected_delivery_date, 'DD/MM/YYYY'))
            ELSE format(' - Thanh toán: %s', p_payment_type) END
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

-- Update function comment
COMMENT ON FUNCTION public.create_pos_invoice(
    p_customer_id integer, p_cart_items jsonb, p_vat_rate numeric, 
    p_discount_type character varying, p_discount_value numeric, 
    p_payment_method character varying, p_received_amount numeric, 
    p_paid_amount numeric, p_debt_amount numeric, p_payment_type character varying, 
    p_branch_id integer, p_created_by character varying,
    p_invoice_type character varying, p_expected_delivery_date date
) IS 'Enhanced POS Checkout Function with temp invoice support. 
Supports normal invoices (immediate) and temp_order (pre-order) with expected delivery dates.
For temp orders: no stock deduction, no payment required, customer_paid = 0.';

COMMIT;
