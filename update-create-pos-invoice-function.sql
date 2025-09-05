-- Cập nhật function create_pos_invoice để hỗ trợ temp orders
-- Dựa trên schema hiện tại của Supabase

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
    -- NEW PARAMETERS for temp orders
    p_invoice_type character varying DEFAULT 'normal'::character varying,
    p_expected_delivery_date date DEFAULT NULL,
    p_notes text DEFAULT NULL
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
    v_notes_final text;
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

    -- Validate temp order specific requirements
    IF p_invoice_type = 'temp_order' THEN
        IF p_expected_delivery_date IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Phiếu tạm phải có ngày xuất hàng dự kiến',
                'error_code', 'MISSING_DELIVERY_DATE'
            );
        END IF;
        
        IF p_expected_delivery_date <= CURRENT_DATE THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Ngày xuất hàng phải sau hôm nay',
                'error_code', 'INVALID_DELIVERY_DATE'
            );
        END IF;
    END IF;

    -- Calculate subtotal and validate stock (skip stock check for temp orders)
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

        -- Check stock only for normal invoices, not temp orders
        IF p_invoice_type != 'temp_order' AND v_product.current_stock < (v_cart_item->>'quantity')::numeric THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Không đủ hàng: ' || v_product.product_name,
                'error_code', 'INSUFFICIENT_STOCK'
            );
        END IF;

        v_line_total := (v_cart_item->>'unit_price')::numeric * (v_cart_item->>'quantity')::numeric;
        v_subtotal := v_subtotal + v_line_total;
    END LOOP;

    -- Calculate discount
    IF p_discount_type = 'percentage' THEN
        v_discount_amount := v_subtotal * (p_discount_value / 100);
    ELSIF p_discount_type = 'amount' THEN
        v_discount_amount := p_discount_value;
    END IF;

    -- Calculate VAT
    v_vat_amount := (v_subtotal - v_discount_amount) * (p_vat_rate / 100);
    v_total_amount := v_subtotal - v_discount_amount + v_vat_amount;

    -- Generate invoice code based on type
    IF p_invoice_type = 'temp_order' THEN
        v_invoice_code := 'TEMP-' || TO_CHAR(now(), 'YYYYMMDD-') || LPAD(nextval('invoices_invoice_id_seq')::text, 4, '0');
    ELSE
        v_invoice_code := 'INV-' || TO_CHAR(now(), 'YYYYMMDD-') || LPAD(nextval('invoices_invoice_id_seq')::text, 4, '0');
    END IF;

    -- Prepare notes
    v_notes_final := COALESCE(p_notes, '');
    IF p_invoice_type = 'temp_order' THEN
        v_notes_final := 'PHIẾU TẠM - ' || v_notes_final;
    END IF;

    -- Insert invoice
    INSERT INTO invoices (
        invoice_code,
        invoice_date,
        customer_id,
        customer_name,
        branch_id,
        total_amount,
        customer_paid,
        notes,
        status,
        discount_type,
        discount_value,
        vat_rate,
        vat_amount,
        invoice_type,
        expected_delivery_date
    ) VALUES (
        v_invoice_code,
        now(),
        p_customer_id,
        v_customer.customer_name,
        p_branch_id,
        v_total_amount,
        CASE 
            WHEN p_invoice_type = 'temp_order' THEN 0 -- Temp orders have no payment yet
            ELSE COALESCE(p_paid_amount, 0)
        END,
        v_notes_final,
        CASE 
            WHEN p_invoice_type = 'temp_order' THEN 'pending'
            ELSE 'completed'
        END,
        p_discount_type,
        p_discount_value,
        p_vat_rate,
        v_vat_amount,
        p_invoice_type,
        p_expected_delivery_date
    ) RETURNING invoice_id INTO v_invoice_id;

    -- Insert invoice items
    FOR v_cart_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
    LOOP
        INSERT INTO invoice_items (
            invoice_id,
            product_id,
            quantity,
            unit_price,
            total_price
        ) VALUES (
            v_invoice_id,
            (v_cart_item->>'product_id')::integer,
            (v_cart_item->>'quantity')::numeric,
            (v_cart_item->>'unit_price')::numeric,
            (v_cart_item->>'unit_price')::numeric * (v_cart_item->>'quantity')::numeric
        );
    END LOOP;

    -- Update stock only for normal invoices, not temp orders
    IF p_invoice_type != 'temp_order' THEN
        FOR v_cart_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
        LOOP
            UPDATE products 
            SET current_stock = current_stock - (v_cart_item->>'quantity')::numeric,
                updated_at = now()
            WHERE product_id = (v_cart_item->>'product_id')::integer;
        END LOOP;
    END IF;

    -- Handle customer debt only for normal invoices
    IF p_invoice_type != 'temp_order' AND p_debt_amount > 0 THEN
        v_new_debt := v_customer.debt + p_debt_amount;
        
        UPDATE customers 
        SET debt = v_new_debt,
            updated_at = now()
        WHERE customer_id = p_customer_id;

        INSERT INTO debt_tracking (
            customer_id, invoice_id, transaction_type, amount,
            debt_before, debt_after, description, created_by
        ) VALUES (
            p_customer_id, v_invoice_id, 'debt_increase', p_debt_amount,
            v_customer.debt, v_new_debt,
            format('Ghi nợ từ hóa đơn %s', v_invoice_code),
            p_created_by
        );
    END IF;

    -- Return result
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_code', v_invoice_code,
        'invoice_type', p_invoice_type,
        'subtotal', v_subtotal,
        'discount_amount', v_discount_amount,
        'vat_amount', v_vat_amount,
        'total_amount', v_total_amount,
        'customer_paid', CASE 
            WHEN p_invoice_type = 'temp_order' THEN 0 
            ELSE COALESCE(p_paid_amount, 0)
        END,
        'debt_amount', CASE 
            WHEN p_invoice_type = 'temp_order' THEN 0 
            ELSE p_debt_amount
        END,
        'warnings', array_to_json(v_warnings),
        'expected_delivery_date', p_expected_delivery_date
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'error_code', 'FUNCTION_ERROR',
            'sqlstate', SQLSTATE
        );
END;
$$;
