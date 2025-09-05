-- Update create_pos_invoice function to support temp orders
CREATE OR REPLACE FUNCTION create_pos_invoice(
    p_customer_id INTEGER,
    p_cart_items JSONB,
    p_vat_rate DECIMAL(5,2) DEFAULT 10.00,
    p_discount_type VARCHAR DEFAULT 'none',
    p_discount_value DECIMAL(10,2) DEFAULT 0,
    p_payment_method VARCHAR DEFAULT 'cash',
    p_received_amount DECIMAL(10,2) DEFAULT NULL,
    p_paid_amount DECIMAL(10,2) DEFAULT 0,
    p_debt_amount DECIMAL(10,2) DEFAULT 0,
    p_payment_type VARCHAR DEFAULT 'full',
    p_branch_id INTEGER DEFAULT 1,
    p_created_by VARCHAR DEFAULT 'System',
    -- NEW PARAMETERS for temp orders
    p_invoice_type VARCHAR DEFAULT 'normal',
    p_expected_delivery_date DATE DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_invoice_id INTEGER;
    v_subtotal DECIMAL(10,2) := 0;
    v_discount_amount DECIMAL(10,2) := 0;
    v_tax_amount DECIMAL(10,2) := 0;
    v_total DECIMAL(10,2) := 0;
    v_item JSONB;
    v_result JSONB;
    v_table_name VARCHAR;
BEGIN
    -- Calculate totals from cart items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
    LOOP
        v_subtotal := v_subtotal + ((v_item->>'unit_price')::DECIMAL * (v_item->>'quantity')::INTEGER);
    END LOOP;
    
    -- Calculate discount
    IF p_discount_type = 'percentage' THEN
        v_discount_amount := v_subtotal * (p_discount_value / 100);
    ELSIF p_discount_type = 'fixed' THEN
        v_discount_amount := p_discount_value;
    END IF;
    
    -- Calculate tax
    v_tax_amount := (v_subtotal - v_discount_amount) * (p_vat_rate / 100);
    v_total := v_subtotal - v_discount_amount + v_tax_amount;
    
    -- Determine table based on invoice type
    IF p_invoice_type = 'temp_order' THEN
        v_table_name := 'temp_invoices';
    ELSE
        v_table_name := 'invoices';
    END IF;
    
    -- Insert invoice based on type
    IF p_invoice_type = 'temp_order' THEN
        -- Insert into temp_invoices table
        INSERT INTO temp_invoices (
            customer_id,
            invoice_number,
            invoice_date,
            expected_delivery_date,
            subtotal,
            discount_type,
            discount_value,
            discount_amount,
            vat_rate,
            tax_amount,
            total,
            notes,
            status,
            created_by,
            branch_id
        ) VALUES (
            p_customer_id,
            'TEMP-' || TO_CHAR(NOW(), 'YYYYMMDD-') || LPAD(NEXTVAL('temp_invoice_sequence')::TEXT, 4, '0'),
            CURRENT_DATE,
            p_expected_delivery_date,
            v_subtotal,
            p_discount_type,
            p_discount_value,
            v_discount_amount,
            p_vat_rate,
            v_tax_amount,
            v_total,
            p_notes,
            'pending',
            p_created_by,
            p_branch_id
        ) RETURNING temp_invoice_id INTO v_invoice_id;
        
        -- Insert temp invoice items
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
        LOOP
            INSERT INTO temp_invoice_items (
                temp_invoice_id,
                product_id,
                quantity,
                unit_price,
                total_price
            ) VALUES (
                v_invoice_id,
                (v_item->>'product_id')::INTEGER,
                (v_item->>'quantity')::INTEGER,
                (v_item->>'unit_price')::DECIMAL,
                (v_item->>'unit_price')::DECIMAL * (v_item->>'quantity')::INTEGER
            );
        END LOOP;
        
    ELSE
        -- Insert into regular invoices table (existing logic)
        INSERT INTO invoices (
            customer_id,
            invoice_number,
            invoice_date,
            subtotal,
            discount_type,
            discount_value,
            discount_amount,
            vat_rate,
            tax_amount,
            total,
            payment_method,
            received_amount,
            paid_amount,
            debt_amount,
            payment_type,
            branch_id,
            created_by
        ) VALUES (
            p_customer_id,
            'INV-' || TO_CHAR(NOW(), 'YYYYMMDD-') || LPAD(NEXTVAL('invoice_sequence')::TEXT, 4, '0'),
            CURRENT_DATE,
            v_subtotal,
            p_discount_type,
            p_discount_value,
            v_discount_amount,
            p_vat_rate,
            v_tax_amount,
            v_total,
            p_payment_method,
            p_received_amount,
            p_paid_amount,
            p_debt_amount,
            p_payment_type,
            p_branch_id,
            p_created_by
        ) RETURNING invoice_id INTO v_invoice_id;
        
        -- Insert invoice items
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
        LOOP
            INSERT INTO invoice_items (
                invoice_id,
                product_id,
                quantity,
                unit_price,
                total_price
            ) VALUES (
                v_invoice_id,
                (v_item->>'product_id')::INTEGER,
                (v_item->>'quantity')::INTEGER,
                (v_item->>'unit_price')::DECIMAL,
                (v_item->>'unit_price')::DECIMAL * (v_item->>'quantity')::INTEGER
            );
        END LOOP;
    END IF;
    
    -- Return success result
    v_result := jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_type', p_invoice_type,
        'table_used', v_table_name,
        'subtotal', v_subtotal,
        'discount_amount', v_discount_amount,
        'tax_amount', v_tax_amount,
        'total', v_total
    );
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'error_detail', SQLSTATE
        );
END;
$$ LANGUAGE plpgsql;
