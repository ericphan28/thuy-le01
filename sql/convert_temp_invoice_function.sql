-- =========================================
-- TEMP INVOICE CONVERSION FUNCTION
-- =========================================
-- Date: September 4, 2025
-- Purpose: Convert temp invoice to normal invoice with price comparison

CREATE OR REPLACE FUNCTION public.convert_temp_to_invoice(
    p_temp_invoice_id integer,
    p_actual_delivery_date date DEFAULT CURRENT_DATE,
    p_price_adjustments jsonb DEFAULT NULL, -- [{product_id, new_price}]
    p_payment_method character varying DEFAULT 'cash',
    p_payment_type character varying DEFAULT 'full',
    p_received_amount numeric DEFAULT NULL,
    p_paid_amount numeric DEFAULT NULL,
    p_debt_amount numeric DEFAULT 0,
    p_converted_by character varying DEFAULT 'POS'
) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_temp_invoice invoices%ROWTYPE;
    v_customer customers%ROWTYPE;
    v_detail invoice_details%ROWTYPE;
    v_product products%ROWTYPE;
    v_new_total numeric := 0;
    v_old_total numeric := 0;
    v_price_changes jsonb := '[]'::jsonb;
    v_price_adjustment jsonb;
    v_new_price numeric;
    v_stock_issues text[] := '{}';
    v_warnings text[] := '{}';
    v_new_debt numeric;
    v_change_amount numeric := 0;
    v_conversion_notes text;
BEGIN
    -- Get temp invoice
    SELECT * INTO v_temp_invoice 
    FROM invoices 
    WHERE invoice_id = p_temp_invoice_id 
    AND invoice_type = 'temp_order'
    AND status IN ('temp_pending', 'temp_confirmed', 'temp_ready');
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Phiếu tạm không tồn tại hoặc không thể chuyển đổi',
            'error_code', 'TEMP_INVOICE_NOT_FOUND'
        );
    END IF;

    -- Get customer
    SELECT * INTO v_customer 
    FROM customers 
    WHERE customer_id = v_temp_invoice.customer_id;

    -- Check stock and calculate price changes for each item
    FOR v_detail IN 
        SELECT * FROM invoice_details 
        WHERE invoice_id = p_temp_invoice_id
    LOOP
        SELECT * INTO v_product 
        FROM products 
        WHERE product_id = v_detail.product_id;
        
        -- Check if we have enough stock
        IF v_product.current_stock < v_detail.quantity THEN
            v_stock_issues := array_append(v_stock_issues,
                format('Sản phẩm %s: Tồn kho (%s) < Yêu cầu (%s)',
                       v_product.product_name, v_product.current_stock, v_detail.quantity));
        END IF;

        -- Calculate price (check for manual adjustment first, then current price)
        v_new_price := v_detail.unit_price; -- Default to original price
        
        -- Check if there's a manual price adjustment for this product
        IF p_price_adjustments IS NOT NULL THEN
            FOR v_price_adjustment IN 
                SELECT * FROM jsonb_array_elements(p_price_adjustments)
            LOOP
                IF (v_price_adjustment->>'product_id')::integer = v_detail.product_id THEN
                    v_new_price := (v_price_adjustment->>'new_price')::numeric;
                    EXIT;
                END IF;
            END LOOP;
        ELSE
            -- Use current sale price from products table
            v_new_price := v_product.sale_price;
        END IF;

        -- Track price changes
        IF v_new_price != v_detail.unit_price THEN
            v_price_changes := v_price_changes || jsonb_build_object(
                'product_id', v_detail.product_id,
                'product_code', v_detail.product_code,
                'product_name', v_detail.product_name,
                'old_price', v_detail.unit_price,
                'new_price', v_new_price,
                'price_change', v_new_price - v_detail.unit_price,
                'quantity', v_detail.quantity,
                'line_old_total', v_detail.line_total,
                'line_new_total', v_detail.quantity * v_new_price
            );
        END IF;

        v_old_total := v_old_total + v_detail.line_total;
        v_new_total := v_new_total + (v_detail.quantity * v_new_price);
    END LOOP;

    -- Return error if stock issues
    IF array_length(v_stock_issues, 1) > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Không đủ hàng trong kho',
            'error_code', 'INSUFFICIENT_STOCK',
            'stock_issues', v_stock_issues
        );
    END IF;

    -- Validate payment for cash transactions
    IF p_payment_method = 'cash' AND p_payment_type = 'full' THEN
        IF COALESCE(p_received_amount, 0) < v_new_total THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Số tiền thanh toán không đủ',
                'error_code', 'INSUFFICIENT_PAYMENT'
            );
        END IF;
        v_change_amount := COALESCE(p_received_amount, 0) - v_new_total;
    END IF;

    -- Create conversion notes
    v_conversion_notes := format(
        'Chuyển đổi từ phiếu tạm %s. Giá gốc: %s, Giá mới: %s. Chênh lệch: %s (%s%%)',
        v_temp_invoice.invoice_code,
        to_char(v_old_total, 'FM999,999,999,999'),
        to_char(v_new_total, 'FM999,999,999,999'),
        to_char(v_new_total - v_old_total, 'FM999,999,999,999'),
        CASE WHEN v_old_total > 0 THEN 
            round(((v_new_total - v_old_total) / v_old_total * 100)::numeric, 2)
        ELSE 0 END
    );

    -- Calculate debt
    v_new_debt := v_customer.current_debt + COALESCE(p_debt_amount, 0);

    -- Add debt warning if needed
    IF v_new_debt > v_customer.debt_limit THEN
        v_warnings := array_append(v_warnings,
            format('Cảnh báo: Công nợ sau giao dịch (%s) vượt hạn mức (%s)',
                   to_char(v_new_debt, 'FM999,999,999,999'),
                   to_char(v_customer.debt_limit, 'FM999,999,999,999')));
    END IF;

    -- Update the temp invoice to become a normal invoice
    UPDATE invoices SET
        invoice_type = 'normal',
        total_amount = v_new_total,
        customer_paid = COALESCE(p_paid_amount, CASE WHEN p_payment_type = 'full' THEN v_new_total ELSE 0 END),
        status = CASE WHEN p_debt_amount > 0 THEN 'partial' ELSE 'completed' END,
        actual_delivery_date = p_actual_delivery_date,
        notes = COALESCE(notes, '') || E'\n' || v_conversion_notes,
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id = p_temp_invoice_id;

    -- Update invoice details with new prices
    FOR v_detail IN 
        SELECT * FROM invoice_details 
        WHERE invoice_id = p_temp_invoice_id
    LOOP
        -- Get new price
        v_new_price := v_detail.unit_price; -- Default
        
        IF p_price_adjustments IS NOT NULL THEN
            FOR v_price_adjustment IN 
                SELECT * FROM jsonb_array_elements(p_price_adjustments)
            LOOP
                IF (v_price_adjustment->>'product_id')::integer = v_detail.product_id THEN
                    v_new_price := (v_price_adjustment->>'new_price')::numeric;
                    EXIT;
                END IF;
            END LOOP;
        ELSE
            SELECT sale_price INTO v_new_price 
            FROM products 
            WHERE product_id = v_detail.product_id;
        END IF;

        -- Update invoice detail
        UPDATE invoice_details SET
            unit_price = v_new_price,
            sale_price = v_new_price,
            line_total = quantity * v_new_price,
            subtotal = quantity * v_new_price
        WHERE detail_id = v_detail.detail_id;

        -- Deduct stock
        UPDATE products 
        SET current_stock = current_stock - v_detail.quantity
        WHERE product_id = v_detail.product_id;
    END LOOP;

    -- Update customer debt if applicable
    IF p_debt_amount > 0 THEN
        UPDATE customers 
        SET current_debt = current_debt + p_debt_amount,
            last_purchase_date = CURRENT_TIMESTAMP
        WHERE customer_id = v_temp_invoice.customer_id;

        -- Create debt transaction record
        INSERT INTO debt_transactions (
            customer_id, invoice_id, transaction_type, amount,
            old_debt, new_debt, payment_method, notes, created_by
        ) VALUES (
            v_temp_invoice.customer_id, p_temp_invoice_id, 'debt_increase', p_debt_amount,
            v_customer.current_debt, v_new_debt, p_payment_method,
            format('Ghi nợ từ chuyển đổi phiếu tạm %s', v_temp_invoice.invoice_code),
            p_converted_by
        );
    END IF;

    -- Return success
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', p_temp_invoice_id,
        'invoice_code', v_temp_invoice.invoice_code,
        'conversion_summary', jsonb_build_object(
            'old_total', v_old_total,
            'new_total', v_new_total,
            'price_change', v_new_total - v_old_total,
            'price_changes', v_price_changes,
            'actual_delivery_date', p_actual_delivery_date
        ),
        'payment_info', jsonb_build_object(
            'method', p_payment_method,
            'type', p_payment_type,
            'received_amount', p_received_amount,
            'change_amount', v_change_amount
        ),
        'customer_info', jsonb_build_object(
            'customer_id', v_customer.customer_id,
            'customer_name', v_customer.customer_name,
            'previous_debt', v_customer.current_debt,
            'new_debt', v_new_debt
        ),
        'warnings', v_warnings,
        'message', format(
            'Đã chuyển đổi phiếu tạm %s thành hóa đơn chính thức. Tổng tiền: %s',
            v_temp_invoice.invoice_code,
            to_char(v_new_total, 'FM999,999,999,999')
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

-- Function comment
COMMENT ON FUNCTION public.convert_temp_to_invoice(
    p_temp_invoice_id integer, p_actual_delivery_date date, p_price_adjustments jsonb,
    p_payment_method character varying, p_payment_type character varying,
    p_received_amount numeric, p_paid_amount numeric, p_debt_amount numeric,
    p_converted_by character varying
) IS 'Convert temp invoice to normal invoice with price comparison and stock deduction.
Supports price adjustments and validates stock availability before conversion.';

COMMIT;
