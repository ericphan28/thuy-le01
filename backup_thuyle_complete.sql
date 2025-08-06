--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: adjust_customer_debt(integer, numeric, character varying, text, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_customer_debt(p_customer_id integer, p_adjustment_amount numeric, p_adjustment_type character varying, p_reason text, p_created_by character varying DEFAULT 'system'::character varying) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_current_debt NUMERIC;
    v_new_debt NUMERIC;
    v_customer_record customers%ROWTYPE;
    v_transaction_id INTEGER;
    v_transaction_type VARCHAR;
    v_actual_amount NUMERIC;
BEGIN
    -- Validate input
    IF p_customer_id IS NULL OR p_adjustment_amount IS NULL OR p_adjustment_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Invalid input parameters',
            'error_code', 'INVALID_INPUT'
        );
    END IF;
    
    -- Validate adjustment type
    IF p_adjustment_type NOT IN ('increase', 'decrease', 'writeoff') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Invalid adjustment type',
            'error_code', 'INVALID_ADJUSTMENT_TYPE'
        );
    END IF;
    
    -- Get customer record
    SELECT * INTO v_customer_record 
    FROM customers 
    WHERE customer_id = p_customer_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Customer not found or inactive',
            'error_code', 'CUSTOMER_NOT_FOUND'
        );
    END IF;
    
    v_current_debt := v_customer_record.current_debt;
    
    -- Calculate new debt based on adjustment type
    CASE p_adjustment_type
        WHEN 'increase' THEN
            v_new_debt := v_current_debt + p_adjustment_amount;
            v_actual_amount := p_adjustment_amount;
            v_transaction_type := 'debt_increase';
        WHEN 'decrease' THEN
            v_new_debt := GREATEST(0, v_current_debt - p_adjustment_amount);
            v_actual_amount := -(LEAST(p_adjustment_amount, v_current_debt));
            v_transaction_type := 'debt_adjustment';
        WHEN 'writeoff' THEN
            v_new_debt := 0;
            v_actual_amount := -v_current_debt;
            v_transaction_type := 'debt_writeoff';
    END CASE;
    
    -- Update customer debt
    UPDATE customers 
    SET 
        current_debt = v_new_debt,
        updated_at = NOW()
    WHERE customer_id = p_customer_id;
    
    -- Record transaction
    INSERT INTO debt_transactions (
        customer_id, transaction_type, amount, old_debt, new_debt,
        notes, created_by, created_at
    ) VALUES (
        p_customer_id, v_transaction_type, v_actual_amount, 
        v_current_debt, v_new_debt, p_reason, p_created_by, NOW()
    ) RETURNING transaction_id INTO v_transaction_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'customer_id', p_customer_id,
        'customer_name', v_customer_record.customer_name,
        'adjustment_type', p_adjustment_type,
        'old_debt', v_current_debt,
        'adjustment_amount', v_actual_amount,
        'new_debt', v_new_debt,
        'reason', p_reason,
        'created_at', NOW(),
        'message', format('Đã %s công nợ %s VND cho %s. Nợ hiện tại: %s VND', 
            CASE p_adjustment_type 
                WHEN 'increase' THEN 'tăng'
                WHEN 'decrease' THEN 'giảm'
                WHEN 'writeoff' THEN 'xóa'
            END,
            ABS(v_actual_amount), v_customer_record.customer_name, v_new_debt)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Database error occurred',
            'error_code', 'DATABASE_ERROR',
            'error_message', SQLERRM
        );
END;
$$;


--
-- Name: FUNCTION adjust_customer_debt(p_customer_id integer, p_adjustment_amount numeric, p_adjustment_type character varying, p_reason text, p_created_by character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.adjust_customer_debt(p_customer_id integer, p_adjustment_amount numeric, p_adjustment_type character varying, p_reason text, p_created_by character varying) IS 'Điều chỉnh công nợ khách hàng (tăng/giảm/xóa nợ) với lý do rõ ràng';


--
-- Name: create_pos_invoice(integer, jsonb, numeric, character varying, numeric, character varying, numeric, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_pos_invoice(p_customer_id integer, p_cart_items jsonb, p_vat_rate numeric DEFAULT 0, p_discount_type character varying DEFAULT 'percentage'::character varying, p_discount_value numeric DEFAULT 0, p_payment_method character varying DEFAULT 'cash'::character varying, p_received_amount numeric DEFAULT NULL::numeric, p_branch_id integer DEFAULT 1, p_created_by character varying DEFAULT 'POS'::character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Variables for invoice creation
    v_invoice_id INTEGER;
    v_invoice_code VARCHAR(50);
    v_customer_record customers%ROWTYPE;
    v_cart_item JSONB;
    v_product_record products%ROWTYPE;
    
    -- Calculation variables
    v_subtotal NUMERIC := 0;
    v_discount_amount NUMERIC := 0;
    v_after_discount NUMERIC := 0;
    v_vat_amount NUMERIC := 0;
    v_total_amount NUMERIC := 0;
    v_change_amount NUMERIC := 0;
    
    -- Business validation variables
    v_total_debt_after NUMERIC := 0;
    v_item_count INTEGER := 0;
    v_total_quantity NUMERIC := 0;
    
    -- Error tracking
    v_error_messages TEXT[] := ARRAY[]::TEXT[];
    v_warnings TEXT[] := ARRAY[]::TEXT[];
    
    -- Invoice details array
    v_invoice_details JSONB[] := ARRAY[]::JSONB[];
    v_stock_updates JSONB[] := ARRAY[]::JSONB[];
    
BEGIN
    -- =====================================================
    -- 🔍 PHASE 1: INPUT VALIDATION & SETUP
    -- =====================================================
    
    -- Validate required parameters
    IF p_customer_id IS NULL OR p_cart_items IS NULL OR jsonb_array_length(p_cart_items) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid input: customer_id and cart_items are required',
            'error_code', 'INVALID_INPUT'
        );
    END IF;
    
    -- Validate VAT rate
    IF p_vat_rate NOT IN (0, 5, 8, 10) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid VAT rate. Must be 0, 5, 8, or 10',
            'error_code', 'INVALID_VAT_RATE'
        );
    END IF;
    
    -- Validate discount type
    IF p_discount_type NOT IN ('percentage', 'amount') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid discount type. Must be percentage or amount',
            'error_code', 'INVALID_DISCOUNT_TYPE'
        );
    END IF;
    
    -- Validate payment method
    IF p_payment_method NOT IN ('cash', 'card', 'transfer') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid payment method. Must be cash, card, or transfer',
            'error_code', 'INVALID_PAYMENT_METHOD'
        );
    END IF;
    
    -- =====================================================
    -- 🔍 PHASE 2: CUSTOMER VALIDATION
    -- =====================================================
    
    -- Get customer record
    SELECT * INTO v_customer_record 
    FROM customers 
    WHERE customer_id = p_customer_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Customer not found or inactive',
            'error_code', 'CUSTOMER_NOT_FOUND'
        );
    END IF;
    
    -- =====================================================
    -- 🔍 PHASE 3: CART VALIDATION & CALCULATION
    -- =====================================================
    
    -- Process each cart item
    FOR v_cart_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
    LOOP
        -- Validate cart item structure
        IF NOT (v_cart_item ? 'product_id' AND v_cart_item ? 'quantity' AND v_cart_item ? 'unit_price') THEN
            v_error_messages := array_append(v_error_messages, 
                'Invalid cart item structure. Required: product_id, quantity, unit_price');
            CONTINUE;
        END IF;
        
        -- Get product record
        SELECT * INTO v_product_record 
        FROM products 
        WHERE product_id = (v_cart_item->>'product_id')::INTEGER 
        AND is_active = true 
        AND allow_sale = true;
        
        IF NOT FOUND THEN
            v_error_messages := array_append(v_error_messages, 
                format('Product ID %s not found or not available for sale', v_cart_item->>'product_id'));
            CONTINUE;
        END IF;
        
        -- Validate stock availability
        IF v_product_record.current_stock < (v_cart_item->>'quantity')::NUMERIC THEN
            v_error_messages := array_append(v_error_messages, 
                format('Insufficient stock for %s. Available: %s, Requested: %s', 
                    v_product_record.product_name, 
                    v_product_record.current_stock, 
                    v_cart_item->>'quantity'));
            CONTINUE;
        END IF;
        
        -- Check prescription requirement
        IF v_product_record.requires_prescription THEN
            v_warnings := array_append(v_warnings, 
                format('Product %s requires prescription - ensure compliance', v_product_record.product_name));
        END IF;
        
        -- Calculate line totals
        DECLARE
            v_line_quantity NUMERIC := (v_cart_item->>'quantity')::NUMERIC;
            v_line_unit_price NUMERIC := (v_cart_item->>'unit_price')::NUMERIC;
            v_line_total NUMERIC := v_line_quantity * v_line_unit_price;
        BEGIN
            -- Add to subtotal
            v_subtotal := v_subtotal + v_line_total;
            v_total_quantity := v_total_quantity + v_line_quantity;
            v_item_count := v_item_count + 1;
            
            -- Store invoice detail data
            v_invoice_details := array_append(v_invoice_details, jsonb_build_object(
                'product_id', v_product_record.product_id,
                'product_code', v_product_record.product_code,
                'product_name', v_product_record.product_name,
                'quantity', v_line_quantity,
                'unit_price', v_line_unit_price,
                'line_total', v_line_total,
                'cost_price', COALESCE(v_product_record.cost_price, 0),
                'profit_amount', (v_line_unit_price - COALESCE(v_product_record.cost_price, 0)) * v_line_quantity
            ));
            
            -- Store stock update data
            v_stock_updates := array_append(v_stock_updates, jsonb_build_object(
                'product_id', v_product_record.product_id,
                'old_stock', v_product_record.current_stock,
                'quantity_sold', v_line_quantity,
                'new_stock', v_product_record.current_stock - v_line_quantity
            ));
        END;
    END LOOP;
    
    -- Check if we have any valid items
    IF array_length(v_invoice_details, 1) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No valid items in cart',
            'error_details', v_error_messages,
            'error_code', 'NO_VALID_ITEMS'
        );
    END IF;
    
    -- Return errors if any critical validation failed
    IF array_length(v_error_messages, 1) > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Validation failed',
            'error_details', v_error_messages,
            'error_code', 'VALIDATION_FAILED'
        );
    END IF;
    
    -- =====================================================
    -- 🔍 PHASE 4: FINANCIAL CALCULATIONS
    -- =====================================================
    
    -- Calculate discount
    IF p_discount_type = 'percentage' THEN
        v_discount_amount := (v_subtotal * p_discount_value) / 100;
    ELSE
        v_discount_amount := LEAST(p_discount_value, v_subtotal);
    END IF;
    
    -- Calculate amounts
    v_after_discount := v_subtotal - v_discount_amount;
    v_vat_amount := v_after_discount * (p_vat_rate / 100);
    v_total_amount := v_after_discount + v_vat_amount;
    
    -- Calculate change if received amount provided
    IF p_received_amount IS NOT NULL THEN
        v_change_amount := p_received_amount - v_total_amount;
        IF v_change_amount < 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Insufficient payment. Required: %s, Received: %s', v_total_amount, p_received_amount),
                'error_code', 'INSUFFICIENT_PAYMENT'
            );
        END IF;
    END IF;
    
    -- =====================================================
    -- 🔍 PHASE 5: DEBT LIMIT VALIDATION
    -- =====================================================
    
    -- Calculate debt after this transaction
    v_total_debt_after := v_customer_record.current_debt + 
        CASE 
            WHEN p_received_amount IS NULL THEN v_total_amount
            WHEN p_received_amount < v_total_amount THEN (v_total_amount - p_received_amount)
            ELSE 0
        END;
    
    -- Check debt limit
    IF v_total_debt_after > v_customer_record.debt_limit THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Customer debt limit exceeded. Limit: %s, New total would be: %s', 
                v_customer_record.debt_limit, v_total_debt_after),
            'error_code', 'DEBT_LIMIT_EXCEEDED'
        );
    END IF;
    
    -- =====================================================
    -- 🔍 PHASE 6: CREATE INVOICE (TRANSACTION START)
    -- =====================================================
    
    -- Generate unique invoice code
    v_invoice_code := 'HD' || extract(epoch from now())::bigint;
    
    -- 🔥 FINAL: Clean notes format without redundant "POS" prefix
    INSERT INTO invoices (
        invoice_code,
        invoice_date,
        customer_id,
        customer_name,
        branch_id,
        total_amount,
        customer_paid,
        discount_type,
        discount_value,
        vat_rate,
        vat_amount,
        notes,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_invoice_code,
        NOW(),
        p_customer_id,
        v_customer_record.customer_name,
        p_branch_id,
        v_total_amount,
        COALESCE(p_received_amount, 0),
        p_discount_type,
        p_discount_value,
        p_vat_rate,
        v_vat_amount,
        -- ✅ CLEAN: No redundant "POS" prefix, just meaningful info
        CASE 
            WHEN p_discount_value > 0 AND p_vat_rate > 0 THEN
                format('%s | %s items | Giảm %s | VAT %s%%',
                    CASE p_payment_method 
                        WHEN 'cash' THEN 'Tiền mặt'
                        WHEN 'card' THEN 'Thẻ'
                        WHEN 'transfer' THEN 'Chuyển khoản'
                        ELSE p_payment_method
                    END,
                    v_item_count,
                    CASE 
                        WHEN p_discount_type = 'percentage' THEN p_discount_value || '%'
                        ELSE (p_discount_value::INTEGER / 1000) || 'k'
                    END,
                    p_vat_rate
                )
            WHEN p_discount_value > 0 THEN
                format('%s | %s items | Giảm %s',
                    CASE p_payment_method 
                        WHEN 'cash' THEN 'Tiền mặt'
                        WHEN 'card' THEN 'Thẻ'
                        WHEN 'transfer' THEN 'Chuyển khoản'
                        ELSE p_payment_method
                    END,
                    v_item_count,
                    CASE 
                        WHEN p_discount_type = 'percentage' THEN p_discount_value || '%'
                        ELSE (p_discount_value::INTEGER / 1000) || 'k'
                    END
                )
            WHEN p_vat_rate > 0 THEN
                format('%s | %s items | VAT %s%%',
                    CASE p_payment_method 
                        WHEN 'cash' THEN 'Tiền mặt'
                        WHEN 'card' THEN 'Thẻ'
                        WHEN 'transfer' THEN 'Chuyển khoản'
                        ELSE p_payment_method
                    END,
                    v_item_count,
                    p_vat_rate
                )
            ELSE
                format('%s | %s items',
                    CASE p_payment_method 
                        WHEN 'cash' THEN 'Tiền mặt'
                        WHEN 'card' THEN 'Thẻ'
                        WHEN 'transfer' THEN 'Chuyển khoản'
                        ELSE p_payment_method
                    END,
                    v_item_count
                )
        END,
        'completed',
        NOW(),
        NOW()
    ) RETURNING invoice_id INTO v_invoice_id;
    
    -- =====================================================
    -- 🔍 PHASE 7: CREATE INVOICE DETAILS
    -- =====================================================
    
    -- Insert invoice details for each cart item
    FOR i IN 1..array_length(v_invoice_details, 1)
    LOOP
        DECLARE
            v_detail JSONB := v_invoice_details[i];
        BEGIN
            INSERT INTO invoice_details (
                invoice_id, product_id, invoice_code, product_code, product_name,
                customer_name, customer_id, branch_id, invoice_date,
                quantity, unit_price, sale_price, line_total, subtotal,
                cost_price, profit_amount,
                cash_payment, card_payment, transfer_payment, wallet_payment, points_payment, customer_paid,
                discount_percent, discount_amount, total_discount, status, created_at
            ) VALUES (
                v_invoice_id, (v_detail->>'product_id')::INTEGER, v_invoice_code,
                v_detail->>'product_code', v_detail->>'product_name',
                v_customer_record.customer_name, p_customer_id, p_branch_id, NOW(),
                (v_detail->>'quantity')::NUMERIC, (v_detail->>'unit_price')::NUMERIC,
                (v_detail->>'unit_price')::NUMERIC, (v_detail->>'line_total')::NUMERIC,
                (v_detail->>'line_total')::NUMERIC, (v_detail->>'cost_price')::NUMERIC,
                (v_detail->>'profit_amount')::NUMERIC,
                CASE WHEN p_payment_method = 'cash' THEN (v_detail->>'line_total')::NUMERIC ELSE 0 END,
                CASE WHEN p_payment_method = 'card' THEN (v_detail->>'line_total')::NUMERIC ELSE 0 END,
                CASE WHEN p_payment_method = 'transfer' THEN (v_detail->>'line_total')::NUMERIC ELSE 0 END,
                0, 0, COALESCE(p_received_amount, 0), 0, 0, 0, 'completed', NOW()
            );
        END;
    END LOOP;
    
    -- =====================================================
    -- 🔍 PHASE 8: UPDATE PRODUCT STOCK
    -- =====================================================
    
    -- Update stock for each product
    FOR i IN 1..array_length(v_stock_updates, 1)
    LOOP
        DECLARE
            v_stock_update JSONB := v_stock_updates[i];
        BEGIN
            UPDATE products 
            SET current_stock = (v_stock_update->>'new_stock')::NUMERIC, updated_at = NOW()
            WHERE product_id = (v_stock_update->>'product_id')::INTEGER;
        END;
    END LOOP;
    
    -- =====================================================
    -- 🔍 PHASE 9: UPDATE CUSTOMER STATISTICS
    -- =====================================================
    
    -- Update customer record
    UPDATE customers 
    SET 
        current_debt = v_total_debt_after,
        total_revenue = total_revenue + v_total_amount,
        total_profit = total_profit + (
            SELECT SUM((detail->>'profit_amount')::NUMERIC) 
            FROM unnest(v_invoice_details) AS detail
        ),
        purchase_count = purchase_count + 1,
        last_purchase_date = NOW(),
        updated_at = NOW()
    WHERE customer_id = p_customer_id;
    
    -- =====================================================
    -- 🔍 PHASE 10: SUCCESS RESPONSE
    -- =====================================================
    
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_code', v_invoice_code,
        'customer_id', p_customer_id,
        'customer_name', v_customer_record.customer_name,
        'totals', jsonb_build_object(
            'subtotal', v_subtotal,
            'discount_amount', v_discount_amount,
            'vat_amount', v_vat_amount,
            'total_amount', v_total_amount,
            'received_amount', p_received_amount,
            'change_amount', v_change_amount
        ),
        'summary', jsonb_build_object(
            'item_count', v_item_count,
            'total_quantity', v_total_quantity,
            'payment_method', p_payment_method,
            'vat_rate', p_vat_rate,
            'discount_type', p_discount_type,
            'discount_value', p_discount_value
        ),
        'customer_info', jsonb_build_object(
            'new_debt', v_total_debt_after,
            'debt_limit', v_customer_record.debt_limit,
            'debt_remaining', v_customer_record.debt_limit - v_total_debt_after
        ),
        'warnings', v_warnings,
        'created_at', NOW(),
        'message', format('Invoice %s created successfully for %s VND', v_invoice_code, v_total_amount)
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Database error occurred',
            'error_code', 'DATABASE_ERROR',
            'error_message', SQLERRM,
            'error_state', SQLSTATE,
            'debug_info', jsonb_build_object(
                'customer_id', p_customer_id,
                'invoice_code', v_invoice_code,
                'calculated_total', v_total_amount,
                'items_processed', array_length(v_invoice_details, 1)
            )
        );
END;
$$;


--
-- Name: FUNCTION create_pos_invoice(p_customer_id integer, p_cart_items jsonb, p_vat_rate numeric, p_discount_type character varying, p_discount_value numeric, p_payment_method character varying, p_received_amount numeric, p_branch_id integer, p_created_by character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_pos_invoice(p_customer_id integer, p_cart_items jsonb, p_vat_rate numeric, p_discount_type character varying, p_discount_value numeric, p_payment_method character varying, p_received_amount numeric, p_branch_id integer, p_created_by character varying) IS 'FINAL POS Checkout Function: Clean, efficient invoice creation with dedicated VAT/discount columns.
Uses meaningful notes format without redundant prefixes. Handles complete business logic validation.';


--
-- Name: get_debt_dashboard_stats(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_debt_dashboard_stats(date_from date DEFAULT (CURRENT_DATE - '30 days'::interval), date_to date DEFAULT CURRENT_DATE) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'period_info', json_build_object(
            'date_from', date_from,
            'date_to', date_to,
            'total_days', (date_to - date_from + 1)
        ),
        'debt_overview', json_build_object(
            'total_customers_with_debt', (
                SELECT COUNT(*) FROM customers WHERE current_debt > 0 AND is_active = true
            ),
            'total_debt_amount', (
                SELECT COALESCE(SUM(current_debt), 0) FROM customers WHERE current_debt > 0 AND is_active = true
            ),
            'total_credit_amount', (
                SELECT COALESCE(SUM(ABS(current_debt)), 0) FROM customers WHERE current_debt < 0 AND is_active = true
            ),
            'customers_over_limit', (
                SELECT COUNT(*) FROM customers WHERE current_debt > debt_limit AND debt_limit > 0 AND is_active = true
            ),
            'avg_debt_per_customer', (
                SELECT COALESCE(AVG(current_debt), 0) FROM customers WHERE current_debt > 0 AND is_active = true
            )
        ),
        'recent_transactions', json_build_object(
            'total_payments', (
                SELECT COUNT(*) FROM debt_transactions 
                WHERE transaction_type = 'debt_payment' 
                AND created_at BETWEEN date_from AND date_to
            ),
            'total_payment_amount', (
                SELECT COALESCE(SUM(ABS(amount)), 0) FROM debt_transactions 
                WHERE transaction_type = 'debt_payment' 
                AND created_at BETWEEN date_from AND date_to
            ),
            'total_increases', (
                SELECT COUNT(*) FROM debt_transactions 
                WHERE transaction_type = 'debt_increase' 
                AND created_at BETWEEN date_from AND date_to
            ),
            'total_increase_amount', (
                SELECT COALESCE(SUM(amount), 0) FROM debt_transactions 
                WHERE transaction_type = 'debt_increase' 
                AND created_at BETWEEN date_from AND date_to
            )
        ),
        'top_debtors', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'customer_name', customer_name,
                    'customer_code', customer_code,
                    'current_debt', current_debt,
                    'debt_limit', debt_limit,
                    'risk_level', risk_level,
                    'days_since_last_purchase', days_since_last_purchase
                ) ORDER BY current_debt DESC
            ), '[]'::json)
            FROM debt_summary
            WHERE current_debt > 0
            LIMIT 10
        ),
        'payment_trends', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'date', payment_date,
                    'payment_count', payment_count,
                    'payment_amount', payment_amount
                ) ORDER BY payment_date
            ), '[]'::json)
            FROM (
                SELECT 
                    DATE(created_at) as payment_date,
                    COUNT(*) as payment_count,
                    SUM(ABS(amount)) as payment_amount
                FROM debt_transactions
                WHERE transaction_type = 'debt_payment'
                AND created_at BETWEEN date_from AND date_to
                GROUP BY DATE(created_at)
                ORDER BY DATE(created_at)
            ) payment_trends
        )
    ) INTO result;
    
    RETURN result;
END;
$$;


--
-- Name: FUNCTION get_debt_dashboard_stats(date_from date, date_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_debt_dashboard_stats(date_from date, date_to date) IS 'Lấy thống kê tổng quan cho dashboard quản lý công nợ';


--
-- Name: get_financial_summary(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_financial_summary(date_from date DEFAULT (CURRENT_DATE - '30 days'::interval), date_to date DEFAULT CURRENT_DATE) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'period', json_build_object(
      'from', date_from,
      'to', date_to,
      'days', (date_to - date_from + 1)
    ),
    'revenue_summary', json_build_object(
      'gross_revenue', COALESCE(SUM(id.line_total), 0),
      'total_cost', COALESCE(SUM(id.cost_price * id.quantity), 0),
      'gross_profit', COALESCE(SUM(id.line_total - (id.cost_price * id.quantity)), 0),
      'profit_margin_percent', CASE 
        WHEN SUM(id.line_total) > 0 THEN 
          ROUND((SUM(id.line_total - (id.cost_price * id.quantity)) / SUM(id.line_total) * 100)::NUMERIC, 2)
        ELSE 0 
      END,
      'total_orders', COUNT(DISTINCT i.invoice_id),
      'total_customers', COUNT(DISTINCT i.customer_id)
    ),
    'payment_breakdown', json_build_object(
      'cash_total', COALESCE(SUM(id.cash_payment), 0),
      'card_total', COALESCE(SUM(id.card_payment), 0),
      'transfer_total', COALESCE(SUM(id.transfer_payment), 0),
      'wallet_total', COALESCE(SUM(id.wallet_payment), 0),
      'points_total', COALESCE(SUM(id.points_payment), 0)
    ),
    'top_revenue_products', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'product_name', product_name,
          'revenue', revenue,
          'quantity_sold', quantity_sold,
          'gross_profit', gross_profit,
          'profit_margin', profit_margin
        )
      ), '[]'::json)
      FROM (
        SELECT 
          id.product_name,
          SUM(id.line_total) as revenue,
          SUM(id.quantity) as quantity_sold,
          SUM(id.line_total - (id.cost_price * id.quantity)) as gross_profit,
          CASE 
            WHEN SUM(id.line_total) > 0 THEN 
              ROUND((SUM(id.line_total - (id.cost_price * id.quantity)) / SUM(id.line_total) * 100)::NUMERIC, 2)
            ELSE 0 
          END as profit_margin
        FROM invoice_details id
        WHERE id.invoice_date BETWEEN date_from AND date_to
        GROUP BY id.product_name
        ORDER BY SUM(id.line_total) DESC
        LIMIT 10
      ) top_products
    ),
    'top_customers', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'customer_name', customer_name,
          'total_spent', total_spent,
          'order_count', order_count,
          'avg_order_value', avg_order_value
        )
      ), '[]'::json)
      FROM (
        SELECT 
          i.customer_name,
          SUM(i.total_amount) as total_spent,
          COUNT(*) as order_count,
          ROUND(AVG(i.total_amount), 0) as avg_order_value
        FROM invoices i
        WHERE i.invoice_date BETWEEN date_from AND date_to
        GROUP BY i.customer_name
        ORDER BY SUM(i.total_amount) DESC
        LIMIT 10
      ) top_customers
    )
  ) INTO result
  FROM invoices i
  LEFT JOIN invoice_details id ON i.invoice_id = id.invoice_id
  WHERE i.invoice_date BETWEEN date_from AND date_to;
  
  RETURN result;
END;
$$;


--
-- Name: get_inventory_alerts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inventory_alerts() RETURNS TABLE(product_id integer, product_code text, product_name text, category_name text, current_stock numeric, min_stock numeric, max_stock numeric, alert_type text, alert_priority integer, suggested_action text, is_medicine boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.product_id,
    p.product_code::TEXT,
    p.product_name::TEXT,
    COALESCE(pc.category_name, 'Chưa phân loại')::TEXT as category_name,
    p.current_stock,
    p.min_stock,
    p.max_stock,
    CASE 
      WHEN p.current_stock = 0 THEN 'Hết hàng'
      WHEN p.current_stock <= p.min_stock THEN 'Sắp hết hàng'
      WHEN p.current_stock >= p.max_stock THEN 'Tồn kho cao'
      ELSE 'Bình thường'
    END as alert_type,
    CASE 
      WHEN p.current_stock = 0 THEN 1
      WHEN p.current_stock <= p.min_stock THEN 2
      WHEN p.current_stock >= p.max_stock THEN 3
      ELSE 4
    END as alert_priority,
    CASE 
      WHEN p.current_stock = 0 THEN 'Cần nhập hàng ngay lập tức'
      WHEN p.current_stock <= p.min_stock THEN 'Cần lên kế hoạch nhập hàng'
      WHEN p.current_stock >= p.max_stock THEN 'Cân nhắc khuyến mãi hoặc giảm nhập'
      ELSE 'Không cần hành động'
    END as suggested_action,
    p.is_medicine
  FROM products p
  LEFT JOIN product_categories pc ON p.category_id = pc.category_id
  WHERE 
    p.is_active = true
    AND p.allow_sale = true
    AND (p.current_stock = 0 OR 
         p.current_stock <= p.min_stock OR 
         p.current_stock >= p.max_stock)
  ORDER BY 
    CASE 
      WHEN p.current_stock = 0 THEN 1
      WHEN p.current_stock <= p.min_stock THEN 2
      WHEN p.current_stock >= p.max_stock THEN 3
      ELSE 4
    END,
    p.is_medicine DESC, -- Thuốc ưu tiên cao hơn
    p.product_name;
END;
$$;


--
-- Name: get_medicine_analytics(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_medicine_analytics(date_from date DEFAULT (CURRENT_DATE - '30 days'::interval)) RETURNS TABLE(product_id integer, product_code text, product_name text, requires_prescription boolean, current_stock numeric, quantity_sold numeric, revenue numeric, expiry_tracking boolean, storage_condition text, stock_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.product_id,
    p.product_code::TEXT,
    p.product_name::TEXT,
    p.requires_prescription,
    p.current_stock,
    COALESCE(sales.quantity_sold, 0) as quantity_sold,
    COALESCE(sales.revenue, 0) as revenue,
    p.expiry_tracking,
    p.storage_condition::TEXT,
    CASE 
      WHEN p.current_stock = 0 THEN 'Hết hàng'
      WHEN p.current_stock <= p.min_stock THEN 'Sắp hết hàng'
      WHEN p.current_stock >= p.max_stock THEN 'Tồn kho cao'
      ELSE 'Bình thường'
    END as stock_status
  FROM products p
  LEFT JOIN (
    SELECT 
      id.product_id,
      SUM(id.quantity) as quantity_sold,
      SUM(id.line_total) as revenue
    FROM invoice_details id
    WHERE id.invoice_date >= date_from
    GROUP BY id.product_id
  ) sales ON p.product_id = sales.product_id
  WHERE 
    p.is_medicine = true
    AND p.is_active = true
  ORDER BY 
    p.requires_prescription DESC,
    COALESCE(sales.revenue, 0) DESC,
    p.product_name;
END;
$$;


--
-- Name: get_pharmacy_dashboard_stats(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pharmacy_dashboard_stats(date_from date DEFAULT (CURRENT_DATE - '30 days'::interval), date_to date DEFAULT CURRENT_DATE) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'period_info', json_build_object(
      'date_from', date_from,
      'date_to', date_to,
      'total_days', (date_to - date_from + 1)
    ),
    'revenue_stats', json_build_object(
      'total_revenue', COALESCE(SUM(id.line_total), 0),
      'total_orders', COUNT(DISTINCT i.invoice_id),
      'total_customers', COUNT(DISTINCT i.customer_id),
      'total_products_sold', COALESCE(SUM(id.quantity), 0),
      'avg_order_value', CASE 
        WHEN COUNT(DISTINCT i.invoice_id) > 0 THEN 
          ROUND(COALESCE(SUM(id.line_total), 0) / COUNT(DISTINCT i.invoice_id), 0)
        ELSE 0 
      END,
      'avg_daily_revenue', CASE 
        WHEN (date_to - date_from + 1) > 0 THEN 
          ROUND(COALESCE(SUM(id.line_total), 0) / (date_to - date_from + 1), 0)
        ELSE 0 
      END
    ),
    'top_products', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'product_name', product_name,
          'total_quantity', total_qty,
          'total_revenue', total_rev,
          'order_count', order_count
        )
      ), '[]'::json)
      FROM (
        SELECT 
          id.product_name,
          SUM(id.quantity) as total_qty,
          SUM(id.line_total) as total_rev,
          COUNT(DISTINCT id.invoice_id) as order_count
        FROM invoice_details id
        WHERE id.invoice_date BETWEEN date_from AND date_to
        GROUP BY id.product_name
        ORDER BY SUM(id.line_total) DESC
        LIMIT 5
      ) top_products
    ),
    'revenue_by_day', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'date', day_revenue.date,
          'revenue', day_revenue.daily_revenue,
          'order_count', day_revenue.order_count
        ) ORDER BY day_revenue.date
      ), '[]'::json)
      FROM (
        SELECT 
          DATE(id.invoice_date) as date,
          SUM(id.line_total) as daily_revenue,
          COUNT(DISTINCT id.invoice_id) as order_count
        FROM invoice_details id
        WHERE id.invoice_date BETWEEN date_from AND date_to
        GROUP BY DATE(id.invoice_date)
        ORDER BY DATE(id.invoice_date)
      ) day_revenue
    )
  ) INTO result
  FROM invoices i
  LEFT JOIN invoice_details id ON i.invoice_id = id.invoice_id
  WHERE i.invoice_date BETWEEN date_from AND date_to;
  
  RETURN result;
END;
$$;


--
-- Name: get_setting_value(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_setting_value(p_setting_key character varying, p_branch_id integer DEFAULT NULL::integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    setting_value TEXT;
BEGIN
    -- Try to get branch-specific setting first
    IF p_branch_id IS NOT NULL THEN
        SELECT bs.setting_value INTO setting_value
        FROM public.branch_settings bs
        WHERE bs.setting_key = p_setting_key 
        AND bs.branch_id = p_branch_id;
        
        IF setting_value IS NOT NULL THEN
            RETURN setting_value;
        END IF;
    END IF;
    
    -- Fallback to system setting
    SELECT COALESCE(ss.setting_value, ss.default_value) INTO setting_value
    FROM public.system_settings ss
    WHERE ss.setting_key = p_setting_key 
    AND ss.is_active = true;
    
    RETURN setting_value;
END;
$$;


--
-- Name: get_settings_by_category(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_settings_by_category(p_category character varying, p_branch_id integer DEFAULT NULL::integer) RETURNS TABLE(setting_key character varying, setting_value text, setting_type character varying, display_name character varying, description text, validation_rules jsonb, is_required boolean, display_order integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ss.setting_key,
        COALESCE(
            (SELECT bs.setting_value 
             FROM public.branch_settings bs 
             WHERE bs.setting_key = ss.setting_key 
             AND bs.branch_id = p_branch_id),
            ss.setting_value,
            ss.default_value
        ) as setting_value,
        ss.setting_type,
        ss.display_name,
        ss.description,
        ss.validation_rules,
        ss.is_required,
        ss.display_order
    FROM public.system_settings ss
    WHERE ss.category = p_category
    AND ss.is_active = true
    ORDER BY ss.display_order, ss.display_name;
END;
$$;


--
-- Name: pay_customer_debt(integer, numeric, character varying, text, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pay_customer_debt(p_customer_id integer, p_payment_amount numeric, p_payment_method character varying DEFAULT 'cash'::character varying, p_notes text DEFAULT NULL::text, p_created_by character varying DEFAULT 'system'::character varying) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_current_debt NUMERIC;
    v_new_debt NUMERIC;
    v_customer_record customers%ROWTYPE;
    v_transaction_id INTEGER;
BEGIN
    -- Validate input
    IF p_customer_id IS NULL OR p_payment_amount IS NULL OR p_payment_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Invalid input parameters',
            'error_code', 'INVALID_INPUT'
        );
    END IF;
    
    -- Get customer record
    SELECT * INTO v_customer_record 
    FROM customers 
    WHERE customer_id = p_customer_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Customer not found or inactive',
            'error_code', 'CUSTOMER_NOT_FOUND'
        );
    END IF;
    
    v_current_debt := v_customer_record.current_debt;
    
    -- Validate payment amount
    IF p_payment_amount > v_current_debt THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Payment amount exceeds current debt',
            'error_code', 'PAYMENT_EXCEEDS_DEBT',
            'current_debt', v_current_debt,
            'payment_amount', p_payment_amount
        );
    END IF;
    
    -- Calculate new debt
    v_new_debt := v_current_debt - p_payment_amount;
    
    -- Update customer debt
    UPDATE customers 
    SET 
        current_debt = v_new_debt,
        updated_at = NOW()
    WHERE customer_id = p_customer_id;
    
    -- Record transaction in debt_transactions
    INSERT INTO debt_transactions (
        customer_id, transaction_type, amount, old_debt, new_debt,
        payment_method, notes, created_by, created_at
    ) VALUES (
        p_customer_id, 'debt_payment', -p_payment_amount, 
        v_current_debt, v_new_debt, p_payment_method, 
        COALESCE(p_notes, 'Thu tiền nợ từ ' || v_customer_record.customer_name),
        p_created_by, NOW()
    ) RETURNING transaction_id INTO v_transaction_id;
    
    -- Create invoice record for payment tracking
    INSERT INTO invoices (
        invoice_code, invoice_date, customer_id, customer_name, 
        total_amount, customer_paid, status, notes, created_at
    ) VALUES (
        'PAY' || extract(epoch from now())::bigint,
        NOW(), p_customer_id, v_customer_record.customer_name,
        p_payment_amount, p_payment_amount, 'debt_payment',
        'Thu tiền nợ - ' || COALESCE(p_notes, 'Thanh toán công nợ'),
        NOW()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'customer_id', p_customer_id,
        'customer_name', v_customer_record.customer_name,
        'old_debt', v_current_debt,
        'payment_amount', p_payment_amount,
        'new_debt', v_new_debt,
        'payment_method', p_payment_method,
        'created_at', NOW(),
        'message', format('Đã thu %s VND từ %s. Nợ còn lại: %s VND', 
            p_payment_amount, v_customer_record.customer_name, v_new_debt)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Database error occurred',
            'error_code', 'DATABASE_ERROR',
            'error_message', SQLERRM
        );
END;
$$;


--
-- Name: FUNCTION pay_customer_debt(p_customer_id integer, p_payment_amount numeric, p_payment_method character varying, p_notes text, p_created_by character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.pay_customer_debt(p_customer_id integer, p_payment_amount numeric, p_payment_method character varying, p_notes text, p_created_by character varying) IS 'Thu tiền công nợ từ khách hàng với validation và logging đầy đủ';


--
-- Name: search_customers_with_stats(text, integer, integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_customers_with_stats(search_term text DEFAULT ''::text, customer_type_filter integer DEFAULT NULL::integer, limit_count integer DEFAULT 50, date_from date DEFAULT (CURRENT_DATE - '90 days'::interval)) RETURNS TABLE(customer_id integer, customer_code text, customer_name text, customer_type_name text, phone text, email text, address text, total_orders bigint, total_spent numeric, avg_order_value numeric, last_purchase_date timestamp without time zone, days_since_last_purchase integer, customer_segment text, is_active boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.customer_id,
    c.customer_code::TEXT,
    c.customer_name::TEXT,
    COALESCE(ct.type_name, 'Khách lẻ')::TEXT as customer_type_name,
    c.phone::TEXT,
    c.email::TEXT,
    c.address::TEXT,
    COALESCE(stats.order_count, 0) as total_orders,
    COALESCE(stats.total_spent, 0) as total_spent,
    COALESCE(stats.avg_order_value, 0) as avg_order_value,
    stats.last_purchase_date,
    CASE 
      WHEN stats.last_purchase_date IS NULL THEN NULL
      ELSE (CURRENT_DATE - DATE(stats.last_purchase_date))::INTEGER
    END as days_since_last_purchase,
    CASE 
      WHEN COALESCE(stats.total_spent, 0) >= 10000000 THEN 'VIP'
      WHEN COALESCE(stats.total_spent, 0) >= 5000000 THEN 'Khách hàng thân thiết'
      WHEN COALESCE(stats.order_count, 0) >= 10 THEN 'Khách hàng thường xuyên'
      WHEN stats.last_purchase_date IS NULL OR 
           stats.last_purchase_date < CURRENT_DATE - INTERVAL '90 days' THEN 'Khách hàng ngủ'
      ELSE 'Khách hàng mới'
    END as customer_segment,
    c.is_active
  FROM customers c
  LEFT JOIN customer_types ct ON c.customer_type_id = ct.type_id
  LEFT JOIN (
    SELECT 
      i.customer_id,
      COUNT(*) as order_count,
      SUM(i.total_amount) as total_spent,
      ROUND(AVG(i.total_amount), 0) as avg_order_value,
      MAX(i.invoice_date) as last_purchase_date
    FROM invoices i
    WHERE i.invoice_date >= date_from
    GROUP BY i.customer_id
  ) stats ON c.customer_id = stats.customer_id
  WHERE 
    (search_term = '' OR 
     c.customer_name ILIKE '%' || search_term || '%' OR 
     c.customer_code ILIKE '%' || search_term || '%' OR
     c.phone ILIKE '%' || search_term || '%')
    AND (customer_type_filter IS NULL OR c.customer_type_id = customer_type_filter)
  ORDER BY 
    COALESCE(stats.total_spent, 0) DESC, 
    c.customer_name
  LIMIT limit_count;
END;
$$;


--
-- Name: search_debt_customers(text, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_debt_customers(search_term text DEFAULT ''::text, debt_status_filter character varying DEFAULT ''::character varying, risk_level_filter character varying DEFAULT ''::character varying, limit_count integer DEFAULT 50) RETURNS TABLE(customer_id integer, customer_code text, customer_name text, phone text, current_debt numeric, debt_limit numeric, remaining_credit numeric, debt_status text, risk_level text, collection_priority integer, days_since_last_purchase integer, last_purchase_date timestamp without time zone, total_revenue numeric, purchase_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ds.customer_id,
        ds.customer_code::TEXT,
        ds.customer_name::TEXT,
        ds.phone::TEXT,
        ds.current_debt,
        ds.debt_limit,
        ds.remaining_credit,
        ds.debt_status::TEXT,
        ds.risk_level::TEXT,
        ds.collection_priority,
        ds.days_since_last_purchase,
        ds.last_purchase_date,
        ds.total_revenue,
        ds.purchase_count
    FROM debt_summary ds
    WHERE 
        (search_term = '' OR 
         ds.customer_name ILIKE '%' || search_term || '%' OR 
         ds.customer_code ILIKE '%' || search_term || '%' OR
         ds.phone ILIKE '%' || search_term || '%')
        AND (debt_status_filter = '' OR debt_status_filter = 'all' OR
             (debt_status_filter = 'overdue' AND ds.debt_status = 'Vượt hạn mức nợ') OR
             (debt_status_filter = 'normal' AND ds.debt_status = 'Nợ trong hạn mức') OR
             (debt_status_filter = 'credit' AND ds.debt_status = 'Cửa hàng nợ khách') OR
             (debt_status_filter = 'none' AND ds.debt_status = 'Không nợ'))
        AND (risk_level_filter = '' OR risk_level_filter = 'all' OR
             (risk_level_filter = 'high' AND ds.risk_level = 'Rủi ro cao') OR
             (risk_level_filter = 'medium' AND ds.risk_level = 'Rủi ro trung bình') OR
             (risk_level_filter = 'low' AND ds.risk_level = 'Rủi ro thấp') OR
             (risk_level_filter = 'none' AND ds.risk_level = 'Không rủi ro'))
    ORDER BY ds.collection_priority ASC, ds.current_debt DESC
    LIMIT limit_count;
END;
$$;


--
-- Name: FUNCTION search_debt_customers(search_term text, debt_status_filter character varying, risk_level_filter character varying, limit_count integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_debt_customers(search_term text, debt_status_filter character varying, risk_level_filter character varying, limit_count integer) IS 'Tìm kiếm khách hàng có công nợ với các bộ lọc nâng cao';


--
-- Name: search_products_with_stats(text, integer, integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_products_with_stats(search_term text DEFAULT ''::text, category_filter integer DEFAULT NULL::integer, limit_count integer DEFAULT 50, date_from date DEFAULT (CURRENT_DATE - '30 days'::interval)) RETURNS TABLE(product_id integer, product_code text, product_name text, category_name text, current_stock numeric, sale_price numeric, is_medicine boolean, requires_prescription boolean, quantity_sold numeric, revenue numeric, order_count bigint, last_sale_date timestamp without time zone, stock_status text, is_active boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.product_id,
    p.product_code::TEXT,
    p.product_name::TEXT,
    COALESCE(pc.category_name, 'Chưa phân loại')::TEXT as category_name,
    p.current_stock,
    p.sale_price,
    p.is_medicine,
    p.requires_prescription,
    COALESCE(sales.quantity_sold, 0) as quantity_sold,
    COALESCE(sales.revenue, 0) as revenue,
    COALESCE(sales.order_count, 0) as order_count,
    sales.last_sale_date,
    CASE 
      WHEN p.current_stock = 0 THEN 'Hết hàng'
      WHEN p.current_stock <= p.min_stock THEN 'Sắp hết hàng'
      WHEN p.current_stock >= p.max_stock THEN 'Tồn kho cao'
      ELSE 'Bình thường'
    END as stock_status,
    p.is_active
  FROM products p
  LEFT JOIN product_categories pc ON p.category_id = pc.category_id
  LEFT JOIN (
    SELECT 
      id.product_id,
      SUM(id.quantity) as quantity_sold,
      SUM(id.line_total) as revenue,
      COUNT(DISTINCT id.invoice_id) as order_count,
      MAX(id.invoice_date) as last_sale_date
    FROM invoice_details id
    WHERE id.invoice_date >= date_from
    GROUP BY id.product_id
  ) sales ON p.product_id = sales.product_id
  WHERE 
    (search_term = '' OR 
     p.product_name ILIKE '%' || search_term || '%' OR 
     p.product_code ILIKE '%' || search_term || '%')
    AND (category_filter IS NULL OR p.category_id = category_filter)
  ORDER BY 
    COALESCE(sales.revenue, 0) DESC, 
    p.product_name
  LIMIT limit_count;
END;
$$;


--
-- Name: set_setting_value(character varying, text, integer, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_setting_value(p_setting_key character varying, p_new_value text, p_branch_id integer DEFAULT NULL::integer, p_changed_by character varying DEFAULT 'system'::character varying, p_change_reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    old_value TEXT;
    is_valid BOOLEAN := true;
BEGIN
    -- Get current value for logging
    old_value := public.get_setting_value(p_setting_key, p_branch_id);
    
    -- Update setting
    IF p_branch_id IS NOT NULL THEN
        -- Branch-specific setting
        INSERT INTO public.branch_settings (branch_id, setting_key, setting_value, created_by)
        VALUES (p_branch_id, p_setting_key, p_new_value, p_changed_by)
        ON CONFLICT (branch_id, setting_key) 
        DO UPDATE SET 
            setting_value = p_new_value,
            created_by = p_changed_by,
            updated_at = CURRENT_TIMESTAMP;
    ELSE
        -- System setting
        UPDATE public.system_settings
        SET setting_value = p_new_value,
            updated_at = CURRENT_TIMESTAMP
        WHERE setting_key = p_setting_key;
    END IF;
    
    -- Log the change
    INSERT INTO public.settings_change_log (
        setting_key, old_value, new_value, changed_by, 
        change_reason, branch_id
    ) VALUES (
        p_setting_key, old_value, p_new_value, p_changed_by,
        p_change_reason, p_branch_id
    );
    
    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: validate_setting_value(character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_setting_value(p_setting_key character varying, p_value text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
    setting_type VARCHAR(50);
    validation_rules JSONB;
    is_valid BOOLEAN := true;
BEGIN
    -- Get setting metadata
    SELECT ss.setting_type, ss.validation_rules
    INTO setting_type, validation_rules
    FROM public.system_settings ss
    WHERE ss.setting_key = p_setting_key;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Basic type validation
    CASE setting_type
        WHEN 'number' THEN
            BEGIN
                PERFORM p_value::NUMERIC;
            EXCEPTION WHEN OTHERS THEN
                RETURN false;
            END;
        WHEN 'boolean' THEN
            IF p_value NOT IN ('true', 'false') THEN
                RETURN false;
            END IF;
        WHEN 'email' THEN
            IF p_value !~ '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$' THEN
                RETURN false;
            END IF;
        WHEN 'json' THEN
            BEGIN
                PERFORM p_value::JSONB;
            EXCEPTION WHEN OTHERS THEN
                RETURN false;
            END;
    END CASE;
    
    -- Additional validation rules can be added here
    -- based on validation_rules JSONB field
    
    RETURN is_valid;
END;
$_$;


--
-- Name: verify_public_schema_reset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_public_schema_reset() RETURNS TABLE(object_type text, object_count bigint, status text, details text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 'Tables' as object_type,
           COUNT(*) as object_count,
           CASE WHEN COUNT(*) = 0 THEN '✅ CLEAN' ELSE '❌ REMAINING' END as status,
           string_agg(c.relname, ', ') as details
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relkind = 'r';
    
    RETURN QUERY
    SELECT 'Views' as object_type,
           COUNT(*) as object_count,
           CASE WHEN COUNT(*) = 0 THEN '✅ CLEAN' ELSE '❌ REMAINING' END as status,
           string_agg(c.relname, ', ') as details
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relkind IN ('v', 'm');
    
    RETURN QUERY
    SELECT 'Functions' as object_type,
           COUNT(*) as object_count,
           CASE WHEN COUNT(*) <= 1 THEN '✅ CLEAN' ELSE '❌ REMAINING' END as status,
           string_agg(p.proname, ', ') as details
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public';
    
    RETURN QUERY
    SELECT 'Sequences' as object_type,
           COUNT(*) as object_count,
           CASE WHEN COUNT(*) = 0 THEN '✅ CLEAN' ELSE '❌ REMAINING' END as status,
           string_agg(c.relname, ', ') as details
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relkind = 'S';
    
    RETURN QUERY
    SELECT 'Custom Types' as object_type,
           COUNT(*) as object_count,
           CASE WHEN COUNT(*) = 0 THEN '✅ CLEAN' ELSE '❌ REMAINING' END as status,
           string_agg(t.typname, ', ') as details
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
    AND t.typtype IN ('c', 'e', 'd')
    AND t.typname NOT LIKE 'pg_%'
    AND t.typname NOT LIKE '_%';
    
    RETURN QUERY
    SELECT 'Triggers' as object_type,
           COUNT(*) as object_count,
           CASE WHEN COUNT(*) = 0 THEN '✅ CLEAN' ELSE '❌ REMAINING' END as status,
           string_agg(t.tgname, ', ') as details
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND NOT t.tgisinternal;
    
    RETURN QUERY
    SELECT 'Policies (RLS)' as object_type,
           COUNT(*) as object_count,
           CASE WHEN COUNT(*) = 0 THEN '✅ CLEAN' ELSE '❌ REMAINING' END as status,
           string_agg(pol.polname, ', ') as details
    FROM pg_policy pol
    JOIN pg_class c ON pol.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public';
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: branch_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_settings (
    branch_setting_id integer NOT NULL,
    branch_id integer NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text,
    created_by character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: branch_settings_branch_setting_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branch_settings_branch_setting_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_settings_branch_setting_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_settings_branch_setting_id_seq OWNED BY public.branch_settings.branch_setting_id;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    branch_id integer NOT NULL,
    branch_code character varying(50) NOT NULL,
    branch_name character varying(255) NOT NULL,
    address text,
    phone character varying(20),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: branches_branch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branches_branch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branches_branch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branches_branch_id_seq OWNED BY public.branches.branch_id;


--
-- Name: customer_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_types (
    type_id integer NOT NULL,
    type_code character varying(20) NOT NULL,
    type_name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: customer_types_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_types_type_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_types_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_types_type_id_seq OWNED BY public.customer_types.type_id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    customer_id integer NOT NULL,
    customer_code character varying(50) NOT NULL,
    customer_name character varying(255) NOT NULL,
    customer_type_id integer DEFAULT 1,
    branch_created_id integer DEFAULT 1,
    phone character varying(20),
    email character varying(255),
    address text,
    company_name character varying(255),
    tax_code character varying(50),
    id_number character varying(50),
    gender character varying(10),
    debt_limit numeric(15,2) DEFAULT 0,
    current_debt numeric(15,2) DEFAULT 0,
    total_revenue numeric(15,2) DEFAULT 0,
    total_profit numeric(15,2) DEFAULT 0,
    purchase_count integer DEFAULT 0,
    last_purchase_date timestamp without time zone,
    status integer DEFAULT 1,
    notes text,
    created_by character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_customers_customer_code_not_empty CHECK ((length(TRIM(BOTH FROM customer_code)) > 0))
);


--
-- Name: customers_customer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_customer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_customer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_customer_id_seq OWNED BY public.customers.customer_id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    invoice_id integer NOT NULL,
    invoice_code character varying(50) NOT NULL,
    invoice_date timestamp without time zone NOT NULL,
    return_code character varying(50),
    customer_id integer,
    customer_name character varying(255) NOT NULL,
    branch_id integer DEFAULT 1,
    total_amount numeric(15,2) NOT NULL,
    customer_paid numeric(15,2) DEFAULT 0 NOT NULL,
    notes text,
    status character varying(50) DEFAULT 'completed'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    discount_type character varying(20) DEFAULT 'percentage'::character varying,
    discount_value numeric(10,2) DEFAULT 0,
    vat_rate numeric(5,2) DEFAULT 0,
    vat_amount numeric(15,2) DEFAULT 0,
    CONSTRAINT chk_invoices_discount_type_valid CHECK (((discount_type)::text = ANY ((ARRAY['percentage'::character varying, 'amount'::character varying])::text[]))),
    CONSTRAINT chk_invoices_discount_value_positive CHECK ((discount_value >= (0)::numeric)),
    CONSTRAINT chk_invoices_invoice_code_not_empty CHECK ((length(TRIM(BOTH FROM invoice_code)) > 0)),
    CONSTRAINT chk_invoices_vat_amount_positive CHECK ((vat_amount >= (0)::numeric)),
    CONSTRAINT chk_invoices_vat_rate_range CHECK (((vat_rate >= (0)::numeric) AND (vat_rate <= (100)::numeric))),
    CONSTRAINT invoices_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


--
-- Name: COLUMN invoices.discount_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.discount_type IS 'Loại giảm giá: percentage (%) hoặc amount (số tiền)';


--
-- Name: COLUMN invoices.discount_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.discount_value IS 'Giá trị giảm giá (% hoặc số tiền tùy theo type)';


--
-- Name: COLUMN invoices.vat_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.vat_rate IS 'Tỷ lệ VAT (%) - 0, 5, 8, 10';


--
-- Name: COLUMN invoices.vat_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.vat_amount IS 'Số tiền VAT tính được';


--
-- Name: dashboard_quick_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dashboard_quick_stats AS
 SELECT count(DISTINCT invoice_id) AS total_orders_today,
    COALESCE(sum(total_amount), (0)::numeric) AS total_revenue_today,
    count(DISTINCT customer_id) AS unique_customers_today,
    COALESCE(avg(total_amount), (0)::numeric) AS avg_order_value_today
   FROM public.invoices i
  WHERE (date(invoice_date) = CURRENT_DATE);


--
-- Name: debt_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.debt_summary AS
 SELECT customer_id,
    customer_code,
    customer_name,
    phone,
    email,
    current_debt,
    debt_limit,
    (debt_limit - current_debt) AS remaining_credit,
    last_purchase_date,
    total_revenue,
    purchase_count,
        CASE
            WHEN (current_debt = (0)::numeric) THEN 'Không nợ'::text
            WHEN ((current_debt > (0)::numeric) AND (current_debt <= debt_limit)) THEN 'Nợ trong hạn mức'::text
            WHEN (current_debt > debt_limit) THEN 'Vượt hạn mức nợ'::text
            WHEN (current_debt < (0)::numeric) THEN 'Cửa hàng nợ khách'::text
            ELSE 'Khác'::text
        END AS debt_status,
        CASE
            WHEN (current_debt > debt_limit) THEN 1
            WHEN (current_debt > (debt_limit * 0.8)) THEN 2
            WHEN (current_debt > (0)::numeric) THEN 3
            ELSE 4
        END AS collection_priority,
        CASE
            WHEN (last_purchase_date IS NULL) THEN NULL::integer
            ELSE (CURRENT_DATE - date(last_purchase_date))
        END AS days_since_last_purchase,
        CASE
            WHEN (current_debt > debt_limit) THEN 'Rủi ro cao'::text
            WHEN (current_debt > (debt_limit * 0.8)) THEN 'Rủi ro trung bình'::text
            WHEN (current_debt > (0)::numeric) THEN 'Rủi ro thấp'::text
            WHEN (current_debt = (0)::numeric) THEN 'Không rủi ro'::text
            ELSE 'Cần xem xét'::text
        END AS risk_level,
    is_active,
    created_at,
    updated_at
   FROM public.customers c
  WHERE (is_active = true)
  ORDER BY
        CASE
            WHEN (current_debt > debt_limit) THEN 1
            WHEN (current_debt > (debt_limit * 0.8)) THEN 2
            WHEN (current_debt > (0)::numeric) THEN 3
            ELSE 4
        END, (abs(current_debt)) DESC;


--
-- Name: VIEW debt_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.debt_summary IS 'Tổng quan công nợ khách hàng với phân loại rủi ro và ưu tiên thu nợ';


--
-- Name: debt_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debt_transactions (
    transaction_id integer NOT NULL,
    customer_id integer,
    transaction_type character varying(20) NOT NULL,
    amount numeric(15,2) NOT NULL,
    old_debt numeric(15,2) NOT NULL,
    new_debt numeric(15,2) NOT NULL,
    payment_method character varying(20),
    notes text,
    invoice_id integer,
    created_by character varying(100),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: debt_transactions_history; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.debt_transactions_history AS
 SELECT dt.transaction_id,
    dt.customer_id,
    c.customer_code,
    c.customer_name,
    c.phone,
    dt.transaction_type,
    dt.amount,
    dt.old_debt,
    dt.new_debt,
    dt.payment_method,
    dt.notes,
    dt.invoice_id,
        CASE
            WHEN (dt.invoice_id IS NOT NULL) THEN i.invoice_code
            ELSE NULL::character varying
        END AS invoice_code,
    dt.created_by,
    dt.created_at,
        CASE
            WHEN ((dt.transaction_type)::text = 'debt_increase'::text) THEN 'Tăng nợ'::text
            WHEN ((dt.transaction_type)::text = 'debt_payment'::text) THEN 'Thu nợ'::text
            WHEN ((dt.transaction_type)::text = 'debt_adjustment'::text) THEN 'Điều chỉnh'::text
            WHEN ((dt.transaction_type)::text = 'debt_writeoff'::text) THEN 'Xóa nợ'::text
            ELSE 'Khác'::text
        END AS transaction_display,
        CASE
            WHEN ((dt.transaction_type)::text = 'debt_increase'::text) THEN 'red'::text
            WHEN ((dt.transaction_type)::text = 'debt_payment'::text) THEN 'green'::text
            WHEN ((dt.transaction_type)::text = 'debt_adjustment'::text) THEN 'blue'::text
            WHEN ((dt.transaction_type)::text = 'debt_writeoff'::text) THEN 'orange'::text
            ELSE 'gray'::text
        END AS transaction_color
   FROM ((public.debt_transactions dt
     LEFT JOIN public.customers c ON ((dt.customer_id = c.customer_id)))
     LEFT JOIN public.invoices i ON ((dt.invoice_id = i.invoice_id)))
  ORDER BY dt.created_at DESC;


--
-- Name: VIEW debt_transactions_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.debt_transactions_history IS 'Lịch sử giao dịch công nợ với thông tin khách hàng và hóa đơn liên quan';


--
-- Name: debt_transactions_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.debt_transactions_transaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: debt_transactions_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.debt_transactions_transaction_id_seq OWNED BY public.debt_transactions.transaction_id;


--
-- Name: financial_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_transactions (
    transaction_id integer NOT NULL,
    transaction_code character varying(50) NOT NULL,
    transaction_date timestamp without time zone NOT NULL,
    transaction_type character varying(100) NOT NULL,
    payer_receiver character varying(200) NOT NULL,
    amount numeric(15,2) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: financial_transactions_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financial_transactions_transaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financial_transactions_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financial_transactions_transaction_id_seq OWNED BY public.financial_transactions.transaction_id;


--
-- Name: invoice_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_details (
    detail_id integer NOT NULL,
    invoice_id integer,
    product_id integer,
    invoice_code character varying(50) NOT NULL,
    product_code character varying(50) NOT NULL,
    product_name character varying(500) NOT NULL,
    customer_code character varying(50),
    customer_name character varying(255) NOT NULL,
    branch_id integer DEFAULT 1,
    delivery_code character varying(50),
    pickup_address text,
    reconciliation_code character varying(50),
    invoice_date timestamp without time zone NOT NULL,
    created_date timestamp without time zone,
    updated_date timestamp without time zone,
    order_code character varying(50),
    customer_phone character varying(20),
    customer_address text,
    customer_region character varying(100),
    customer_ward text,
    receiver_name character varying(255),
    receiver_phone character varying(20),
    receiver_address text,
    receiver_region character varying(100),
    receiver_ward text,
    sales_channel character varying(100),
    creator character varying(100),
    delivery_partner text,
    delivery_service text,
    weight_gram numeric(10,2) DEFAULT 0,
    length_cm numeric(8,2) DEFAULT 0,
    width_cm numeric(8,2) DEFAULT 0,
    height_cm numeric(8,2) DEFAULT 0,
    delivery_fee numeric(12,2) DEFAULT 0,
    notes text,
    subtotal numeric(15,2) NOT NULL,
    total_discount numeric(15,2) DEFAULT 0,
    customer_paid numeric(15,2) DEFAULT 0,
    cash_payment numeric(15,2) DEFAULT 0,
    card_payment numeric(15,2) DEFAULT 0,
    transfer_payment numeric(15,2) DEFAULT 0,
    wallet_payment numeric(15,2) DEFAULT 0,
    points_payment numeric(15,2) DEFAULT 0,
    unit character varying(50),
    status character varying(50),
    barcode character varying(100),
    brand character varying(255),
    product_notes text,
    quantity numeric(12,2) NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0,
    sale_price numeric(15,2) NOT NULL,
    line_total numeric(15,2) NOT NULL,
    cost_price numeric(15,2) DEFAULT 0,
    profit_amount numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    customer_id integer,
    CONSTRAINT chk_invoice_details_discount_percent_range CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT chk_invoice_details_invoice_code_not_empty CHECK ((length(TRIM(BOTH FROM invoice_code)) > 0)),
    CONSTRAINT chk_invoice_details_positive_line_total CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT chk_invoice_details_positive_quantity CHECK ((quantity > (0)::numeric)),
    CONSTRAINT chk_invoice_details_positive_unit_price CHECK ((unit_price >= (0)::numeric)),
    CONSTRAINT chk_invoice_details_product_code_not_empty CHECK ((length(TRIM(BOTH FROM product_code)) > 0)),
    CONSTRAINT invoice_details_line_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT invoice_details_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT invoice_details_sale_price_check CHECK ((sale_price >= (0)::numeric)),
    CONSTRAINT invoice_details_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT invoice_details_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: invoice_details_detail_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_details_detail_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_details_detail_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_details_detail_id_seq OWNED BY public.invoice_details.detail_id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    product_id integer NOT NULL,
    product_code character varying(50) NOT NULL,
    product_name character varying(500) NOT NULL,
    category_id integer,
    base_unit_id integer DEFAULT 6,
    barcode character varying(100),
    product_type character varying(50) DEFAULT 'Hàng hóa'::character varying,
    brand character varying(255),
    origin character varying(255),
    description text,
    image_url character varying(500),
    image_urls text,
    base_price numeric(15,2) DEFAULT 0,
    cost_price numeric(15,2) DEFAULT 0,
    sale_price numeric(15,2) DEFAULT 0,
    current_stock numeric(15,2) DEFAULT 0,
    reserved_stock numeric(10,2) DEFAULT 0,
    available_stock numeric(10,2) DEFAULT 0,
    min_stock numeric(15,2) DEFAULT 0,
    max_stock numeric(15,2) DEFAULT 0,
    is_medicine boolean DEFAULT false,
    requires_prescription boolean DEFAULT false,
    storage_condition character varying(255),
    expiry_tracking boolean DEFAULT false,
    allow_sale boolean DEFAULT true,
    track_serial boolean DEFAULT false,
    conversion_rate numeric(10,4) DEFAULT 1.0,
    unit_attributes text,
    related_product_codes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_products_product_code_not_empty CHECK ((length(TRIM(BOTH FROM product_code)) > 0))
);


--
-- Name: invoice_details_normalized; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.invoice_details_normalized AS
 SELECT id.detail_id,
    id.invoice_code,
    id.product_code,
    id.product_name,
    id.quantity,
    id.unit_price,
    id.line_total,
    id.invoice_date,
    c.customer_id,
    c.customer_code,
    c.customer_name,
    c.phone AS customer_phone,
    c.address AS customer_address,
    p.product_id,
    p.product_name AS product_full_name,
    p.category_id,
    p.sale_price AS product_sale_price
   FROM ((public.invoice_details id
     LEFT JOIN public.customers c ON ((id.customer_id = c.customer_id)))
     LEFT JOIN public.products p ON ((id.product_id = p.product_id)));


--
-- Name: invoices_invoice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_invoice_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_invoice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_invoice_id_seq OWNED BY public.invoices.invoice_id;


--
-- Name: invoices_normalized; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.invoices_normalized AS
 SELECT i.invoice_id,
    i.invoice_code,
    i.invoice_date,
    i.total_amount,
    i.customer_paid,
    i.status,
    c.customer_id,
    c.customer_code,
    c.customer_name,
    c.phone AS customer_phone,
    c.address AS customer_address,
    count(id.detail_id) AS detail_count,
    COALESCE(sum(id.line_total), (0)::numeric) AS calculated_total
   FROM ((public.invoices i
     LEFT JOIN public.customers c ON ((i.customer_id = c.customer_id)))
     LEFT JOIN public.invoice_details id ON (((i.invoice_code)::text = (id.invoice_code)::text)))
  GROUP BY i.invoice_id, i.invoice_code, i.invoice_date, i.total_amount, i.customer_paid, i.status, c.customer_id, c.customer_code, c.customer_name, c.phone, c.address;


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    category_id integer NOT NULL,
    category_code character varying(50),
    category_name character varying(255) NOT NULL,
    parent_category_id integer,
    level_path character varying(500),
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: low_stock_products; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.low_stock_products AS
 SELECT p.product_id,
    p.product_code,
    p.product_name,
    pc.category_name,
    p.current_stock,
    p.min_stock,
    p.is_medicine,
    p.requires_prescription
   FROM (public.products p
     LEFT JOIN public.product_categories pc ON ((p.category_id = pc.category_id)))
  WHERE ((p.is_active = true) AND (p.allow_sale = true) AND ((p.current_stock <= p.min_stock) OR (p.current_stock = (0)::numeric)))
  ORDER BY
        CASE
            WHEN (p.current_stock = (0)::numeric) THEN (0)::numeric
            ELSE p.current_stock
        END, p.is_medicine DESC;


--
-- Name: product_categories_category_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_categories_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_categories_category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_categories_category_id_seq OWNED BY public.product_categories.category_id;


--
-- Name: product_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_units (
    product_unit_id integer NOT NULL,
    product_id integer,
    unit_id integer,
    conversion_rate numeric(10,4) DEFAULT 1.0 NOT NULL,
    selling_price numeric(15,2),
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: product_units_product_unit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_units_product_unit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_units_product_unit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_units_product_unit_id_seq OWNED BY public.product_units.product_unit_id;


--
-- Name: products_product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_product_id_seq OWNED BY public.products.product_id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    order_id integer NOT NULL,
    order_code character varying(50) NOT NULL,
    order_date timestamp without time zone NOT NULL,
    customer_name character varying(255) NOT NULL,
    customer_debt numeric(15,2) DEFAULT 0,
    customer_paid numeric(15,2) DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: purchase_orders_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_orders_order_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_orders_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_orders_order_id_seq OWNED BY public.purchase_orders.order_id;


--
-- Name: sales_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_channels (
    channel_id integer NOT NULL,
    channel_code character varying(20) NOT NULL,
    channel_name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sales_channels_channel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_channels_channel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_channels_channel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_channels_channel_id_seq OWNED BY public.sales_channels.channel_id;


--
-- Name: settings_change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings_change_log (
    log_id bigint NOT NULL,
    setting_key character varying(100) NOT NULL,
    old_value text,
    new_value text,
    changed_by character varying(100),
    change_reason text,
    branch_id integer,
    ip_address inet,
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: settings_change_log_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settings_change_log_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settings_change_log_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settings_change_log_log_id_seq OWNED BY public.settings_change_log.log_id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    supplier_id integer NOT NULL,
    supplier_code character varying(50) NOT NULL,
    supplier_name character varying(255) NOT NULL,
    phone character varying(20),
    email character varying(255),
    address text,
    contact_person character varying(255),
    tax_code character varying(50),
    payment_terms integer DEFAULT 0,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: suppliers_supplier_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_supplier_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_supplier_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_supplier_id_seq OWNED BY public.suppliers.supplier_id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    setting_id integer NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text,
    setting_type character varying(50) DEFAULT 'string'::character varying,
    category character varying(100) NOT NULL,
    display_name character varying(200) NOT NULL,
    description text,
    default_value text,
    validation_rules jsonb DEFAULT '{}'::jsonb,
    is_required boolean DEFAULT false,
    is_system boolean DEFAULT false,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: system_info; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.system_info AS
 SELECT 'database_version'::text AS info_key,
    version() AS info_value,
    'System'::text AS category
UNION ALL
 SELECT 'total_settings'::text AS info_key,
    (count(*))::text AS info_value,
    'Settings'::text AS category
   FROM public.system_settings
UNION ALL
 SELECT 'active_branches'::text AS info_key,
    (count(*))::text AS info_value,
    'Branches'::text AS category
   FROM public.branches
  WHERE (branches.is_active = true)
UNION ALL
 SELECT 'setup_date'::text AS info_key,
    (min(system_settings.created_at))::text AS info_value,
    'System'::text AS category
   FROM public.system_settings;


--
-- Name: system_settings_setting_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_setting_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_setting_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_setting_id_seq OWNED BY public.system_settings.setting_id;


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    unit_id integer NOT NULL,
    unit_code character varying(20) NOT NULL,
    unit_name character varying(100) NOT NULL,
    unit_symbol character varying(10),
    is_base_unit boolean DEFAULT false,
    conversion_rate numeric(10,4) DEFAULT 1.0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: units_unit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.units_unit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: units_unit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.units_unit_id_seq OWNED BY public.units.unit_id;


--
-- Name: branch_settings branch_setting_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_settings ALTER COLUMN branch_setting_id SET DEFAULT nextval('public.branch_settings_branch_setting_id_seq'::regclass);


--
-- Name: branches branch_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches ALTER COLUMN branch_id SET DEFAULT nextval('public.branches_branch_id_seq'::regclass);


--
-- Name: customer_types type_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types ALTER COLUMN type_id SET DEFAULT nextval('public.customer_types_type_id_seq'::regclass);


--
-- Name: customers customer_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN customer_id SET DEFAULT nextval('public.customers_customer_id_seq'::regclass);


--
-- Name: debt_transactions transaction_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_transactions ALTER COLUMN transaction_id SET DEFAULT nextval('public.debt_transactions_transaction_id_seq'::regclass);


--
-- Name: financial_transactions transaction_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions ALTER COLUMN transaction_id SET DEFAULT nextval('public.financial_transactions_transaction_id_seq'::regclass);


--
-- Name: invoice_details detail_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details ALTER COLUMN detail_id SET DEFAULT nextval('public.invoice_details_detail_id_seq'::regclass);


--
-- Name: invoices invoice_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN invoice_id SET DEFAULT nextval('public.invoices_invoice_id_seq'::regclass);


--
-- Name: product_categories category_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories ALTER COLUMN category_id SET DEFAULT nextval('public.product_categories_category_id_seq'::regclass);


--
-- Name: product_units product_unit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units ALTER COLUMN product_unit_id SET DEFAULT nextval('public.product_units_product_unit_id_seq'::regclass);


--
-- Name: products product_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN product_id SET DEFAULT nextval('public.products_product_id_seq'::regclass);


--
-- Name: purchase_orders order_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN order_id SET DEFAULT nextval('public.purchase_orders_order_id_seq'::regclass);


--
-- Name: sales_channels channel_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_channels ALTER COLUMN channel_id SET DEFAULT nextval('public.sales_channels_channel_id_seq'::regclass);


--
-- Name: settings_change_log log_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings_change_log ALTER COLUMN log_id SET DEFAULT nextval('public.settings_change_log_log_id_seq'::regclass);


--
-- Name: suppliers supplier_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN supplier_id SET DEFAULT nextval('public.suppliers_supplier_id_seq'::regclass);


--
-- Name: system_settings setting_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN setting_id SET DEFAULT nextval('public.system_settings_setting_id_seq'::regclass);


--
-- Name: units unit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units ALTER COLUMN unit_id SET DEFAULT nextval('public.units_unit_id_seq'::regclass);


--
-- Data for Name: branch_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.branch_settings (branch_setting_id, branch_id, setting_key, setting_value, created_by, created_at, updated_at) FROM stdin;
1	1	branch_name	Chi nhánh trung tâm	system	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
2	1	operating_hours	08:00-18:00	system	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
3	1	max_daily_sales	100000000	system	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
4	1	printer_name	default	system	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.branches (branch_id, branch_code, branch_name, address, phone, is_active, created_at, updated_at) FROM stdin;
1	CT	Chi nhánh trung tâm	\N	\N	t	2025-07-28 19:04:40.502926	2025-07-28 19:04:40.502926
\.


--
-- Data for Name: customer_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_types (type_id, type_code, type_name, description, is_active, created_at) FROM stdin;
1	CN	Cá nhân	Khách hàng cá nhân	t	2025-07-28 19:04:40.502926
2	DN	Doanh nghiệp	Khách hàng doanh nghiệp	t	2025-07-28 19:04:40.502926
3	DL	Đại lý	Đại lý phân phối	t	2025-07-28 19:04:40.502926
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (customer_id, customer_code, customer_name, customer_type_id, branch_created_id, phone, email, address, company_name, tax_code, id_number, gender, debt_limit, current_debt, total_revenue, total_profit, purchase_count, last_purchase_date, status, notes, created_by, is_active, created_at, updated_at) FROM stdin;
831	KH000423	ANH HẢI (TUẤN)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	120000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-26 03:31:11.68	2025-07-29 06:48:10.46569
834	KH000420	CHỊ LIỄU - LONG THÀNH	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	10760000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-25 09:38:10.697	2025-07-29 06:48:10.46569
836	KH000418	ANH KHÁNH - TAM HOÀNG - SOKLU 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	10490000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-23 04:12:38.577	2025-07-29 06:48:10.46569
837	KH000417	EM HẢI - TÂN PHÚ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5392000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-22 08:51:47.45	2025-07-29 06:48:10.46569
838	KH000416	ANH LÂM - TRẠI 5	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	3860000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-22 01:57:51.242	2025-07-29 06:48:10.46569
839	KH000415	CHÚ PHƯỚC VỊNH - NINH PHÁT	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2800000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-21 08:33:50.583	2025-07-29 06:48:10.46569
840	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	8360000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-18 07:50:36.279	2025-07-29 06:48:10.46569
841	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	7340000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-18 00:03:30.92	2025-07-29 06:48:10.46569
842	KH000412	ANH THẾ - VÕ DÕNG	1	1	382021323	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2520000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-17 03:37:13.802	2025-07-29 06:48:10.46569
843	KH000411	CHÚ MẪN - CÚT - VÕ DÕNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	650000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-17 01:19:20.98	2025-07-29 06:48:10.46569
844	KH000410	ANH PHONG - VĨNH TÂN	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	28265000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-16 08:34:05.807	2025-07-29 06:48:10.46569
845	KH000409	CHỊ VY - LÂM ĐỒNG	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	8515000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-15 08:29:28.089	2025-07-29 06:48:10.46569
846	KH000408	ANH KHÔI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	12710000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-15 00:03:30.213	2025-07-29 06:48:10.46569
847	KH000407	ANH NAM - CẦU QUÂN Y	1	1	965890082	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5800000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-14 09:19:11.629	2025-07-29 06:48:10.46569
848	KH000406	CHÚ HOÀ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	970000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-14 09:13:59.223	2025-07-29 06:48:10.46569
849	KH000405	ANH HẢI HÀO LÔ MỚI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	6140000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-14 04:42:49.299	2025-07-29 06:48:10.46569
850	KH000404	ANH QUỐC - DẦU GIÂY	1	1	934507597	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	11320000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-14 04:13:36.496	2025-07-29 06:48:10.46569
851	KH000403	TIẾN CHÍCH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	840000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-13 23:39:06.026	2025-07-29 06:48:10.46569
852	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	12810000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-12 08:46:41.427	2025-07-29 06:48:10.46569
853	KH000401	ANH ÂN - PHÚ TÚC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	220000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-12 01:01:38.589	2025-07-29 06:48:10.46569
854	KH000400	ANH TỨ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	470000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-12 00:22:51.243	2025-07-29 06:48:10.46569
855	KH000399	ANH THIÊN - TÍN NGHĨA - LÔ MỚI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1260000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-11 08:14:24.81	2025-07-29 06:48:10.46569
856	KH000398	TRUNG - BƯU ĐIỆN - LÔ 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	7670000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-10 00:10:52.99	2025-07-29 06:48:10.46569
857	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	6910000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-09 03:36:58.162	2025-07-29 06:48:10.46569
858	KH000396	ANH RÒN - DỐC MƠ	1	1	355841749	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1560000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-08 23:42:26.543	2025-07-29 06:48:10.46569
859	KH000395	ANH QUẢNG - LONG THÀNH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	14510000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-08 07:47:42.847	2025-07-29 06:48:10.46569
860	KH000394	ANH TUÝ (KIM PHÁT)	1	1	966098452	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1560000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-08 00:46:50.886	2025-07-29 06:48:10.46569
861	KH000393	CHÚ PHÁT - DỐC MƠ	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	4330000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-08 00:02:12.807	2025-07-29 06:48:10.46569
862	KH000392	HOÀ MEGA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	21890000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-07 09:32:39.799	2025-07-29 06:48:10.46569
863	KH000391	NGUYỆT SƠN LÂM	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	950000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-06 01:35:14.217	2025-07-29 06:48:10.46569
864	KH000390	ANH TÀI - MARTINO (BÀ NGOẠI)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5260000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-05 01:58:55.07	2025-07-29 06:48:10.46569
865	KH000388	ANH HỌC (LONG)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	21950000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-02 01:25:47.08	2025-07-29 06:48:10.46569
866	KH000387	ANH TÂN - LỘC HOÀ	1	1	0908 996 494	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	12000000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-29 00:13:13.737	2025-07-29 06:48:10.46569
867	KH000386	CHỊ MẪN - VÕ DÕNG	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	450000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-28 01:13:32.966	2025-07-29 06:48:10.46569
868	KH000385	QUYỀN - TAM HOÀNG LÔ MỚI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	75970000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-27 10:11:17.632	2025-07-29 06:48:10.46569
869	KH000384	ANH HỌC - CTY TIẾN THẠNH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	7050000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-27 09:39:53.817	2025-07-29 06:48:10.46569
870	KH000383	Anh Phúc - Cám	1	1	0909 319 424	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1500000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-06-25 01:17:58.34	2025-07-29 06:48:10.46569
871	KH000382	ANH CHÁNH CÚT ĐẺ	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	14300000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-24 09:28:57.983	2025-07-29 06:48:10.46569
872	KH000380	ANH BÍCH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2960000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-23 09:34:47.183	2025-07-29 06:48:10.46569
874	KH000378	QUÂN BIOFRAM	1	1	373994326	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1800000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-18 09:18:00.912	2025-07-29 06:48:10.46569
876	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	56640000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-16 07:58:44.646	2025-07-29 06:48:10.46569
877	KH000375	ANH DANH - GÀ TRE - VÔ NHIỄM 4K	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5890000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-16 00:11:47.457	2025-07-29 06:48:10.46569
878	KH000374	ANH TÈO - VÔ NHIỄM	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	29400000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-16 00:07:52.333	2025-07-29 06:48:10.46569
879	KH000373	MI TIGERVET	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	22490000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-14 08:11:55.72	2025-07-29 06:48:10.46569
880	KH000372	ANH HẢI (KẾ)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	6250000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-13 04:30:52.303	2025-07-29 06:48:10.591439
881	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	36420000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-11 23:43:31.723	2025-07-29 06:48:10.591439
882	KH000370	ANH PHONG - CTY GREENTECH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5040000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-10 09:13:40.759	2025-07-29 06:48:10.591439
883	KH000369	ANH HẢI CJ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5430000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-10 08:29:24.857	2025-07-29 06:48:10.591439
884	KH000368	CÔ LUÂN - BÀU HÀM	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	800000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-10 08:20:30.85	2025-07-29 06:48:10.591439
875	KH000377	NHUNG VIETVET	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	102664000.00	198096.77	1	2025-08-05 08:15:45.23856	1	\N	Ngọc Bích	t	2025-06-18 03:48:41.41	2025-08-05 08:15:45.23856
873	KH000379	THÚ Y KHANH THUỶ - VĨNH CỬU	1	1	907656669	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	3822648.00	593096.77	1	2025-08-05 08:24:29.140906	1	\N	Ngọc Bích	t	2025-06-18 09:19:52.027	2025-08-05 08:24:29.140906
833	KH000421	Thắng bida (test)	1	1	907136029	ericphan28@gmail.com	Bida Thiên Long 2, Gia Kiệm	\N	\N	\N	\N	50000000.00	20000000.00	170000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-07-25 23:53:02.183	2025-08-05 15:39:21.892108
835	KH000419	CHỊ TRINH - VĨNH AN	1	1	0888 445 792	\N	\N	\N	\N	\N	Nữ	50000000.00	66000000.00	8270000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-07-24 03:06:17.607	2025-08-06 00:22:22.592333
885	KH000367	ANH THỨC - TAM HOÀNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	46205000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-07 07:45:06.42	2025-07-29 06:48:10.591439
886	KH000366	CHỊ QUY - BÌNH DƯƠNG - LÔ MỚI	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	77740000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-07 04:34:44.966	2025-07-29 06:48:10.591439
887	KH000365	ANH HUY - GÀ - ĐỨC HUY	1	1	0972 612 063	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	18480000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-05 03:43:35.857	2025-07-29 06:48:10.591439
888	KH000364	ANH TRUYỀN - GIA PHÁT 3 - NHẬP 3/6	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	13880000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-04 01:16:55.463	2025-07-29 06:48:10.591439
889	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	31340000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-03 23:50:48.94	2025-07-29 06:48:10.591439
890	KH000362	TRẢ HÀNG TOÀN THẮNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	33436161.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-06-02 09:13:35.74	2025-07-29 06:48:10.591439
891	KH000361	Anh Duy(Trại Mới)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	30680000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-06-01 07:36:06.33	2025-07-29 06:48:10.591439
892	KH000360	ANH HOAN - XUÂN BẮC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	26795000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-30 09:10:15.637	2025-07-29 06:48:10.591439
893	KH000359	CÔ LAN - BÌNH LỘC	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	800000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-28 07:57:15.6	2025-07-29 06:48:10.591439
894	KH000358	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	1	0938 379 243	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	24270000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-28 05:00:43.38	2025-07-29 06:48:10.591439
895	KH000357	CƯỜNG UNITEX	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	12770000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-27 00:42:56.552	2025-07-29 06:48:10.591439
896	KH000356	ANH HÙNG CHÍCH - ĐỨC HUY	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	850000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-27 00:05:47.547	2025-07-29 06:48:10.591439
897	KH000355	ANH DANH-GÁ ÁC- ĐỨC HUY	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	4630000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-24 08:01:49.556	2025-07-29 06:48:10.591439
898	KH000354	ANH ĐEN - GÀ - VÔ NHIỄM 2K	1	1	979177164	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	8950000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-24 07:30:42.917	2025-07-29 06:48:10.591439
899	KH000353	KHẢI GIA KIỆM	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	43430000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-24 03:45:20.947	2025-07-29 06:48:10.591439
900	KH000352	ANH TÂN - TÍN NGHĨA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	9100000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-22 07:57:40.306	2025-07-29 06:48:10.591439
901	KH000351	ANH TRUYỀN - GIA PHÁT 4	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	26490000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-21 00:27:17.092	2025-07-29 06:48:10.591439
902	KH000350	ANH TRUYỀN - GIA PHÁT 5	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	18980000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-21 00:25:05.923	2025-07-29 06:48:10.591439
903	KH000349	DUY INTER GREEN PHARMA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	760000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-20 08:55:44.777	2025-07-29 06:48:10.591439
904	KH000348	Em Hòa TYX	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	7050000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-05-20 04:34:59.027	2025-07-29 06:48:10.591439
905	KH000347	ANH DUY - PHƯƠNG LÂM	1	1	0979 950 470	\N	129 CÀ PHÊ TRUNG NGUYÊN	\N	\N	\N	Nam	50000000.00	0.00	45070000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-18 03:18:55.892	2025-07-29 06:48:10.591439
906	KH000346	ANH CHÍNH - VÔ NHIỄM	1	1	397325329	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	39400000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-16 11:20:03.37	2025-07-29 06:48:10.591439
907	KH000345	ANH HUY CÁM KYODO	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	7480000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-16 07:49:25.84	2025-07-29 06:48:10.591439
908	KH000344	CHỊ TÂM - NINH PHÁT	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	1280000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-16 02:49:32.926	2025-07-29 06:48:10.591439
909	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	1	0866 086 412	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	13680000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-16 01:41:50.959	2025-07-29 06:48:10.591439
910	KH000342	ANH HÀO	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	19400000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-16 01:38:42.102	2025-07-29 06:48:10.591439
911	KH000341	ANH LÂM (BỘ) - 13K	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	24661000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-12 23:48:00.94	2025-07-29 06:48:10.591439
912	KH000340	CÔ VỠI - XUÂN BẮC	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	26370000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-10 03:20:09.003	2025-07-29 06:48:10.591439
913	KH000339	ANH HỌC - XUÂN THỌ - VACCINE	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	24190000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-07 01:09:42.933	2025-07-29 06:48:10.591439
914	KH000338	KHẢI ( KHÁCH LẺ)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	3600000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-06 07:41:52.893	2025-07-29 06:48:10.591439
915	KH000337	CỬA HÀNG THỊNH VƯỢNG ( CHỊ CÚC)	1	1	0343 385 332	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	4400000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-05 07:50:09.233	2025-07-29 06:48:10.591439
916	KH000336	ANH HỌC - XUÂN THỌ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	37060000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-05 02:55:55.062	2025-07-29 06:48:10.591439
917	KH000335	ANH VŨ CÁM ODON	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	18830000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-03 23:49:01.31	2025-07-29 06:48:10.591439
918	KH000334	TIẾN CHÍCH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	230000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-03 09:45:07.66	2025-07-29 06:48:10.591439
919	KH000333	HOÀ THÚ Y XANH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1500000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-05-02 09:54:48.367	2025-07-29 06:48:10.591439
920	KH000332	KHÁNH EMIVET	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	6680000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-30 03:45:19.806	2025-07-29 06:48:10.591439
921	KH000331	ANH TI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	8930000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-29 07:36:47.806	2025-07-29 06:48:10.591439
922	KH000330	HUY - NINH PHÁT	1	1	379874873	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2700000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-28 02:39:50.727	2025-07-29 06:48:10.591439
923	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	122950000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-25 07:46:26.879	2025-07-29 06:48:10.591439
924	KH000328	ANH CU - TAM HOÀNG - HƯNG LỘC LÔ MỚI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	171540000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-25 07:38:54.45	2025-07-29 06:48:10.591439
926	KH000326	ĐẠI LÝ GẤU - BÀU CÁ	1	1	797530328	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	3440000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-22 09:28:48.346	2025-07-29 06:48:10.591439
927	KH000325	CÔ LAN PHƯỚC - NINH PHÁT	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	117780000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-22 09:04:36.9	2025-07-29 06:48:10.591439
928	KH000323	ANH LỘC-LÂM ĐỒNG	1	1	0386 852 479	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	13650000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-16 07:38:56.23	2025-07-29 06:48:10.591439
929	KH000322	A SỸ - AN LỘC	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	480000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-13 07:45:42.44	2025-07-29 06:48:10.591439
930	KH000321	TUẤN NGÔ - SOKLU	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	21645000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-12 04:49:56.053	2025-07-29 06:48:10.77834
931	KH000320	ANH THẢO - SƠN MAI	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	850000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-11 10:32:16.503	2025-07-29 06:48:10.77834
932	KH000319	ANH KHÁNH - VỊT - SOKLU	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2400000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-04-09 11:40:07.306	2025-07-29 06:48:10.77834
933	KH000318	Đ.Lý Công Học	1	1	0384 729 292	\N	437 Hùng Vương	\N	\N	\N	Nam	50000000.00	0.00	690000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-04-08 08:37:58.739	2025-07-29 06:48:10.77834
934	KH000317	CÔ THẢO - GÀ ĐẺ  - ĐỨC HUY 12K	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	118350000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-08 08:16:00.267	2025-07-29 06:48:10.77834
935	KH000316	ANH HẠNH - VÔ NHIỄM	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1680000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-02 02:48:37.187	2025-07-29 06:48:10.77834
936	KH000315	ANH VŨ - GÀ ĐẺ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	11480000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-04-01 00:08:28.887	2025-07-29 06:48:10.77834
937	KH000314	ANH TUẤN - VỊT - TÍN NGHĨA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1800000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-29 02:00:34.567	2025-07-29 06:48:10.77834
938	KH000313	ANH NAM NOVA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-27 07:46:12.087	2025-07-29 06:48:10.77834
939	KH000312	ANH THÁI - VỊT - LÔ 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	37760000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-27 00:13:58.703	2025-07-29 06:48:10.77834
940	KH000310	ĐÔNG CHÍCH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	570000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-26 09:33:55.289	2025-07-29 06:48:10.77834
941	KH000309	CÔ THẾ MARTINO	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	12630000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-25 00:14:26.463	2025-07-29 06:48:10.77834
942	KH000308	ANH TRUYỀN  - TAM HOÀNG - GIA PHÁT 1	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	36850000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-24 09:13:36.363	2025-07-29 06:48:10.77834
943	KH000307	THÚ Y ĐÌNH HIỀN	1	1	0984 728 172	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	21280000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-22 10:23:00.1	2025-07-29 06:48:10.77834
944	KH000306	HOÀNG HIẾU  -  DÊ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	3150000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-03-22 08:55:30.896	2025-07-29 06:48:10.77834
945	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	66515000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-18 09:25:52.143	2025-07-29 06:48:10.77834
946	KH000304	ANH SƠN CÁM	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	540000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-15 10:28:10.02	2025-07-29 06:48:10.77834
947	KH000303	ANH LÂM (6K) - TRẠI 3	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	55750000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-15 03:33:54.44	2025-07-29 06:48:10.77834
948	KH000302	ANH SƠN BỘ  - LÔ 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	52125000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-14 00:20:21.663	2025-07-29 06:48:10.77834
949	KH000301	HÙNG CHÍCH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	36715000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-13 01:39:05.376	2025-07-29 06:48:10.77834
950	KH000300	ANH LÂM  FIVEVET	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	15184000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-12 09:38:03.469	2025-07-29 06:48:10.77834
951	KH000299	ANH PHƯƠNG - BÀU CÁ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	11435000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-12 07:43:00.227	2025-07-29 06:48:10.77834
952	KH000298	ANH LUÂN CÁM CARGIL	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	17280000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-12 00:39:38.603	2025-07-29 06:48:10.77834
953	KH000297	ĐÔNG CÁM	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2160000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-11 08:03:51.139	2025-07-29 06:48:10.77834
954	KH000296	KHẢI HAIDER - BÀU CẠN LÔ 20k	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	165725000.00	0.00	0	\N	1	Công nợ trừ ra 10.800.000	Ngọc Bích	t	2025-03-11 00:22:11.473	2025-07-29 06:48:10.77834
955	KH000295	QUYỀN - TAM HOÀNG	1	1	908724693	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	88580000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-10 10:04:57.45	2025-07-29 06:48:10.77834
956	KH000294	ANH DUY - BÀU SẬY	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	9600000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-10 02:30:49.39	2025-07-29 06:48:10.77834
957	KH000293	CHỊ LOAN -BỐT ĐỎ	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	83220000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-08 08:52:24.707	2025-07-29 06:48:10.77834
958	KH000292	ANH THUỲ - XUÂN BẮC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	59580000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-08 08:30:04.72	2025-07-29 06:48:10.77834
959	KH000291	HẢI CÁM HAIDER	1	1	0379 992 264	\N	\N	\N	\N	\N	\N	50000000.00	0.00	5000000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-03-06 10:43:28.312	2025-07-29 06:48:10.77834
960	KH000290	CÔNG TY NOVAVETTER	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	550000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-06 09:40:56.582	2025-07-29 06:48:10.77834
961	KH000289	CÔ THANH - VỊT XIÊM	1	1	989372817	\N	Nga tư cây đua qua chợ  phương lâm	\N	\N	\N	Nữ	50000000.00	0.00	4400000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-05 23:53:56.467	2025-07-29 06:48:10.77834
962	KH000288	CÔ TUYẾT THU (5K) - LÔ SONG HÀNH	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	41780000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-04 08:31:43.84	2025-07-29 06:48:10.77834
963	KH000287	CHỊ QUÝ - TÂN PHÚ	1	1	388694253	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	34200000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-04 08:13:50.843	2025-07-29 06:48:10.77834
964	KH000286	ANH HÀNH - XUÂN BẮC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	95680000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-04 07:38:59.286	2025-07-29 06:48:10.77834
965	KH000285	ANH HƯNG - ANH HỌC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	80855000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-04 04:08:56.05	2025-07-29 06:48:10.77834
966	KH000284	ANH THANH - XUÂN BẮC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	17060000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-04 00:19:25.603	2025-07-29 06:48:10.77834
967	KH000283	ANH ĐỨC - VÔ NHIỄM	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	8770000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-03 08:42:27.177	2025-07-29 06:48:10.77834
968	KH000282	ANH VŨ - VÕ DÕNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2200000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-02 00:12:14.847	2025-07-29 06:48:10.77834
969	KH000281	UY CHÍCH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	190000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-01 02:21:38.473	2025-07-29 06:48:10.77834
970	KH000280	ANH LIÊM - LÔ MỚI (6K)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	45765000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-03-01 00:44:41.587	2025-07-29 06:48:10.77834
971	KH000279	ANH BÌNH - BÀU CÁ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	3430000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-28 09:41:54.983	2025-07-29 06:48:10.77834
972	KH000278	TUYỂN CHÍCH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	3720000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-28 07:56:45.91	2025-07-29 06:48:10.77834
973	KH000277	ANH TÍN - XUÂN TRƯỜNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	250000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-28 07:43:17.529	2025-07-29 06:48:10.77834
974	KH000276	MẪU XÉT NGHIỆP	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-28 02:36:29.933	2025-07-29 06:48:10.77834
975	KH000275	ANH DANH - VỊT	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	18460000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-27 23:43:07.177	2025-07-29 06:48:10.77834
976	KH000274	CÔ THU - DẦU GIÂY	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	3220000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-25 08:54:56.693	2025-07-29 06:48:10.77834
977	KH000273	ANH PHÚ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-25 04:22:33.29	2025-07-29 06:48:10.77834
978	KH000272	CÔ QUYỀN - KIM THƯỢNG	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	27870000.00	0.00	0	\N	1	Cô Quyền xin nợ lại 30/5 cô gửi 20 triệu	Ngọc Bích	t	2025-02-24 04:12:28.153	2025-07-29 06:48:10.77834
979	KH000271	ANH SƠN - VÕ DÕNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2700000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-23 03:52:48.087	2025-07-29 06:48:10.77834
1080	KH000162	CÔNG ARIVIET	1	1	036 2043411	\N	\N	\N	\N	\N	\N	50000000.00	0.00	590290000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.317	2025-07-29 06:48:11.269044
1081	KH000161	ANH HƯNG ARIVIET	1	1	092 8736868	\N	\N	\N	\N	\N	\N	50000000.00	0.00	126455000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.317	2025-07-29 06:48:11.269044
1082	KH000159	CHỊ NHUNG VIETVET	1	1	096 1415715	\N	\N	\N	\N	\N	\N	50000000.00	0.00	450671000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.312	2025-07-29 06:48:11.269044
1083	KH000158	ĐẠT TOÀN THẮNG	1	1	097 5657433	\N	\N	\N	\N	\N	\N	50000000.00	0.00	69998169.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.312	2025-07-29 06:48:11.269044
1084	KH000157	ANH LẬP - CÁM HEDER	1	1	093 2092590	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.312	2025-07-29 06:48:11.269044
1085	KH000156	ANH TÌNH - XUÂN BẮC	1	1	097 3467468	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.31	2025-07-29 06:48:11.269044
1086	KH000155	CHÚ CƯỜNG - XUÂN BẮC	1	1	090 9229513	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.31	2025-07-29 06:48:11.269044
1087	KH000154	CÔ LIÊN - XUÂN BẮC	1	1	033 5591144	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.31	2025-07-29 06:48:11.269044
1088	KH000153	CÔ PHƯƠNG - XUÂN TRƯỜNG	1	1	090 9792992	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.307	2025-07-29 06:48:11.269044
1089	KH000152	ANH CÔNG - NINH PHÁT	1	1	079 2300396	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	cuối tháng 5 trả 1tr	Thu Y Thuy Trang	t	2024-12-10 11:38:52.307	2025-07-29 06:48:11.269044
1090	KH000151	ANH TOÀN - VĨNH TÂN	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.307	2025-07-29 06:48:11.269044
1091	KH000150	ANH ĐỨC - VĨNH TÂN	1	1	093 8391279	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.307	2025-07-29 06:48:11.269044
1092	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	1	037 7562768	\N	\N	\N	\N	\N	\N	50000000.00	0.00	282805000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.303	2025-07-29 06:48:11.269044
980	KH000270	CHỊ PHỤNG - KHÁCH LẺ	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	350000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-22 07:34:32.467	2025-07-29 06:48:10.895946
981	KH000269	CHỊ LOAN - VỊT - DỐC MƠ	1	1	909143382	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	800000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-22 03:38:39.14	2025-07-29 06:48:10.895946
982	KH000268	ANH LỢI	1	1	0925 731 741	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	150450000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-20 03:50:55.972	2025-07-29 06:48:10.895946
983	KH000267	TỐNG ĐỨC HIẾU	1	1	0938 285 916	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-02-19 03:40:15.62	2025-07-29 06:48:10.895946
984	KH000266	ANH HƯNG - PHỤNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	83690000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-18 07:51:57.04	2025-07-29 06:48:10.895946
985	KH000265	Chị Vân - Vịt	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	180000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-02-17 10:58:03.372	2025-07-29 06:48:10.895946
986	KH000264	VACCINE VỊT	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	12360000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-17 02:33:18.569	2025-07-29 06:48:10.895946
987	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	24130000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-16 09:38:28.877	2025-07-29 06:48:10.895946
988	KH000262	LONG - BIÊN HOÀ 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	35650000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-16 02:56:41.893	2025-07-29 06:48:10.895946
989	KH000261	ANH ĐIỆP - PHÚC NHẠC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	360000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-15 23:52:05.91	2025-07-29 06:48:10.895946
990	KH000259	ANH HIẾU - DÊ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	41710000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-12 09:10:38.09	2025-07-29 06:48:10.895946
991	KH000258	ANH LÂM (BỘ)  -  TAM HOÀNG 12K SUỐI ĐÁ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	21364000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-11 10:56:01.38	2025-07-29 06:48:10.895946
992	KH000257	XUÂN ( THUÊ NGÁT)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	148130000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-08 07:53:06.927	2025-07-29 06:48:10.895946
993	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	133110000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-05 10:36:22.062	2025-07-29 06:48:10.895946
994	KH000255	ANH CU - TAM HOÀNG - HƯNG LỘC - LÔ 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	106050000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-03 09:11:30.597	2025-07-29 06:48:10.895946
995	KH000254	CÔ HƯƠNG - MARTINO	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	11690000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-02-03 04:44:56.317	2025-07-29 06:48:10.895946
996	KH000253	ANH PHONG - SUỐI ĐÁ 3	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	23760000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-02-03 00:26:52.539	2025-07-29 06:48:10.895946
997	KH000252	CHÚ SỸ - AN LỘC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2910000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-26 02:52:12.84	2025-07-29 06:48:10.895946
998	KH000251	TRẠI HEO - KHÁCH LẺ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	11320000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-24 08:56:15.927	2025-07-29 06:48:10.895946
999	KH000250	ANH HƯNG LÔ MỚI - MARTINO	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1430000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-24 08:48:55.17	2025-07-29 06:48:10.895946
1000	KH000249	CHÚ QUYẾN	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-24 03:21:05.739	2025-07-29 06:48:10.895946
1001	KH000248	NGA - THÀNH CÔNG	1	1	154623	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	988000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-24 00:56:08.803	2025-07-29 06:48:10.895946
1002	KH000247	ANH THUẬN - BÌNH THUẬN	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5750000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-22 08:10:15.637	2025-07-29 06:48:10.895946
1003	KH000246	ANH CƯƠNG - ĐỨC HUY - LÔ 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	137050000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-22 01:16:41.843	2025-07-29 06:48:10.895946
1004	KH000245	HẢI GÀ GIỐNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	7440000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-21 07:42:00.502	2025-07-29 06:48:10.895946
1005	KH000244	ANH HƯNG - TRẠI CHÚ HÙNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	55850000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-20 01:11:46.417	2025-07-29 06:48:10.895946
1006	KH000243	THUỲ TRANG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	11680290.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-19 01:33:32.859	2025-07-29 06:48:10.895946
1007	KH000242	Em Nam Agrviet	1	1	90878	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	8430000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-01-18 09:36:54.127	2025-07-29 06:48:10.895946
1008	KH000241	ANH LIÊM - ĐẠI LÝ KHÁNH HÂN	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	850000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-18 07:45:52.843	2025-07-29 06:48:10.895946
1009	KH000240	ANH TRƯỜNG - CẦU CƯỜNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5220000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-18 03:40:34.209	2025-07-29 06:48:10.895946
1010	KH000239	ANH TUẤN - LẠC SƠN	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5600000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-17 08:37:53.846	2025-07-29 06:48:10.895946
1011	KH000238	HẢI - TRẢNG BOM	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	38775000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-16 02:33:40.937	2025-07-29 06:48:10.895946
1012	KH000237	CHÚ KHUYẾN - XUÂN TÂY	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	17880000.00	0.00	0	\N	1	Ngày 7/5-2/5 Đạt thu về.	Ngọc Bích	t	2025-01-14 09:30:08.372	2025-07-29 06:48:10.895946
1013	KH000235	CÔ HOA - BÀU CẠN	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	51130000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-12 11:51:06.939	2025-07-29 06:48:10.895946
1014	KH000234	CÔ LINH - TRẢNG BOM	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	4000000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-12 04:24:13.447	2025-07-29 06:48:10.895946
1015	KH000233	Đ.Lý Nguyễn Quốc (Em Vân)	1	1	379710537	\N	Tổ 1 Thanh Hòa	\N	\N	\N	Nam	50000000.00	0.00	1625000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-01-11 08:39:51.907	2025-07-29 06:48:10.895946
1016	KH000232	CÔ TUYẾT THU - ANH LỘC	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	33330000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-09 23:37:52.86	2025-07-29 06:48:10.895946
1017	KH000231	CHỊ THU - VỊT ĐẺ - DẦU GIÂY	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	6260000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-09 02:08:15.236	2025-07-29 06:48:10.895946
1018	KH000229	ANH DANH - GÀ ÁC - VÕ DÕNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	14600000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-07 00:33:05.573	2025-07-29 06:48:10.895946
1019	KH000228	ANH TRUYỀN - HƯNG LỘC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	19900000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-06 23:30:12.417	2025-07-29 06:48:10.895946
1020	KH000227	Phan Văn Việt	1	1	981949249	\N	Số 12A, ấp Bình Đức	\N	\N	\N	Nam	50000000.00	0.00	43500000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2025-01-06 04:28:39.25	2025-07-29 06:48:10.895946
1021	KH000226	ANH KÍNH GÀ - HƯNG NGHĨA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	22810000.00	0.00	0	\N	1	Đang đợi tiền gia công ANT	Ngọc Bích	t	2025-01-05 08:20:53.827	2025-07-29 06:48:10.895946
1022	KH000225	EM NGHĨA THÁI BÌNH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	6900000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-04 08:50:54.687	2025-07-29 06:48:10.895946
1023	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	333250000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-04 01:28:28.31	2025-07-29 06:48:10.895946
1024	KH000223	TOÀN CHÍCH	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	2330000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-04 00:07:41.207	2025-07-29 06:48:10.895946
1025	KH000222	CÔ NGA VỊT - SUỐI NHO	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	105500000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-03 23:39:19.743	2025-07-29 06:48:10.895946
1026	KH000221	HUYỀN TIGERVET	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	806835000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-03 08:29:35.069	2025-07-29 06:48:10.895946
1027	KH000219	XUẤT HÀNG NHẬP KHO	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	946000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-02 03:41:05.326	2025-07-29 06:48:10.895946
1028	KH000218	A VŨ - GÀ ĐẺ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	4280000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-02 03:36:04.806	2025-07-29 06:48:10.895946
1029	KH000217	ANH THIÊN - TÍN NGHĨA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	18477000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-02 00:29:20.93	2025-07-29 06:48:10.895946
1130	KH0000109	ĐẠI LÝ HOÀNG YẾN - XÃ LỘ 25	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	18200000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.023	2025-07-29 06:48:11.450257
1131	KH0000108	ĐẠI LÝ TUẤN PHÁT	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	47890000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.02	2025-07-29 06:48:11.450257
1132	KH0000107	ANH NHẬT - CÚT	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	4080000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.02	2025-07-29 06:48:11.450257
1133	KH0000106	TRINH - HIPPRA	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	105530000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.02	2025-07-29 06:48:11.450257
1030	KH000216	CHÚ HÙNG - VÕ DÕNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	28020000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2025-01-01 09:35:21.013	2025-07-29 06:48:11.089188
1031	KH000215	EM HOÀNG CHÍCH LONG KHÁNH	1	1	399894668	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	33260000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-31 12:05:06.893	2025-07-29 06:48:11.089188
1032	KH000214	ANH LÂM (5K) - TRẠI 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	88540000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-31 09:16:10.083	2025-07-29 06:48:11.089188
1033	KH000213	CHỊ THÚY - VỊT - BÌNH LỘC	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-31 02:32:42.873	2025-07-29 06:48:11.089188
1034	KH000212	CHỊ DUNG - SOKLU	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	39060000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-30 04:22:13.797	2025-07-29 06:48:11.089188
1035	KH000211	SÁNG YẾN - NINH BÌNH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5325000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-27 08:35:24.5	2025-07-29 06:48:11.089188
1036	KH000210	CHÚ CHƯƠNG - VỊT XIÊM	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2290000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-27 07:29:28.04	2025-07-29 06:48:11.089188
1037	KH000209	ANH THIỆN - TAM HOÀNG - PHÚ TÚC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	89780000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-27 01:48:53.799	2025-07-29 06:48:11.089188
1038	KH000208	ANH TIÊN - KIM THƯỢNG (25/12)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	52470000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-25 03:10:50.907	2025-07-29 06:48:11.089188
1039	KH000207	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 3	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	44450000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-24 03:49:40.979	2025-07-29 06:48:11.089188
1040	KH000206	Đ.LÝ  DUNG TÙNG - TÂN PHÚ	1	1	0339 151 423	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	16000000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-23 03:49:38.22	2025-07-29 06:48:11.089188
1041	KH000205	KHẢI ( CÔ CHUNG)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	49365000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-23 01:22:00.217	2025-07-29 06:48:11.089188
1042	KH000204	ANH BÌNH - CÁM UP	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	4200000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-20 01:40:58.563	2025-07-29 06:48:11.089188
1043	KH000203	HÀ HOÀNG	1	1	1234	\N	\N	\N	\N	\N	\N	50000000.00	0.00	59870000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-19 23:49:52.427	2025-07-29 06:48:11.089188
1044	KH000202	THUỐC THÚ Y VIỆT HƯNG - BẢO LỘC	1	1	134	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-19 04:15:33.173	2025-07-29 06:48:11.089188
1045	KH000201	Anh Hướng	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	6810000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-19 00:53:11.193	2025-07-29 06:48:11.089188
1046	KH000200	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	127260000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-18 12:44:33.969	2025-07-29 06:48:11.089188
1047	KH000199	TRÌNH CHÍCH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	30719000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-17 07:42:22.517	2025-07-29 06:48:11.089188
1048	KH000198	ANH TRIỆU - GIA KIỆM	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	279915000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-17 07:40:58.767	2025-07-29 06:48:11.089188
1049	KH000196	CHÚ THANH - PHÚ TÚC	1	1	091 1619654	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	900000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-16 00:46:42.39	2025-07-29 06:48:11.089188
1050	KH000195	EM HOÀNG AGRIVIET	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	75544498.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-14 09:06:38.099	2025-07-29 06:48:11.089188
1051	KH000194	ANH HUYẾN - CÚT	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	46943000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-14 00:10:50.9	2025-07-29 06:48:11.089188
1052	KH000193	TRẠI GÀ ĐẺ - LONG THÀNH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	52860000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-13 23:44:38.397	2025-07-29 06:48:11.089188
1053	KH000192	ANH AN - CÚT	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	29970000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-13 07:39:17.132	2025-07-29 06:48:11.089188
1054	KH000191	ANH DANH -  GÀ RI - VÕ DÕNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	29860000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-13 00:48:57.24	2025-07-29 06:48:11.089188
1055	KH000190	TRƯỜNG CHÍCH	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	230000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-12 23:52:18.383	2025-07-29 06:48:11.089188
1056	KH000189	ANH TIẾN -  VỊT - SOKLU	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	47475000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-12 23:46:03.03	2025-07-29 06:48:11.089188
1057	KH000188	KHÁCH LẺ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	108853000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-12 01:00:51.297	2025-07-29 06:48:11.089188
1058	KH000187	ANH PHONG - SUỐI ĐÁ 1	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	82440000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-11 00:26:30.27	2025-07-29 06:48:11.089188
1059	KH000185	Đại lý TTY An Bình - Bình Dương	1	1	0977 102 842	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	33182000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-11 00:00:15.027	2025-07-29 06:48:11.089188
1060	KH000184	ĐINH QUỐC TUẤN	1	1	\N	\N	ĐƯỜNG CÂY XOÀI ĐÔI - ẤP CÂY XĂNG - PHÚ TÚC - ĐỊNH QUÁN - ĐỒNG NAI	\N	\N	\N	Nam	50000000.00	0.00	17510000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-10 23:59:01.642	2025-07-29 06:48:11.089188
1061	KH000181	CÔ TUYẾT THU-LÔ 10K-PHÚ CƯỜNG	1	1	097 1214845	\N	\N	\N	\N	\N	\N	50000000.00	0.00	30330000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.337	2025-07-29 06:48:11.089188
1062	KH000180	CHỊ HƯƠNG-THÀNH AN	1	1	093 8916598	\N	\N	\N	\N	\N	\N	50000000.00	0.00	91360000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.337	2025-07-29 06:48:11.089188
1063	KH000179	A LẮM-NOVA	1	1	097 8713827	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	Cu Quyền có tiền sơn mai gửi 20 triệu	Thu Y Thuy Trang	t	2024-12-10 11:38:52.333	2025-07-29 06:48:11.089188
1064	KH000178	TUẤN KĨ THUẬT - ANT	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.333	2025-07-29 06:48:11.089188
1065	KH000177	A HOÀNG HIẾU VỊT	1	1	086 2125212	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.333	2025-07-29 06:48:11.089188
1066	KH000176	ANH LONG- BƯU ĐIỆN	1	1	091 7412252	\N	\N	\N	\N	\N	\N	50000000.00	0.00	75965000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.33	2025-07-29 06:48:11.089188
1067	KH000175	ANH PHONG - SUNJIN	1	1	070 4460680	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.33	2025-07-29 06:48:11.089188
1068	KH000174	ANH COI CARGILL	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.33	2025-07-29 06:48:11.089188
1069	KH000173	CHỊ HẰNG - BÌNH THUẬN	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.327	2025-07-29 06:48:11.089188
1070	KH000172	ANH TRƯỜNG - NINH PHÁT	1	1	090 8410337	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.327	2025-07-29 06:48:11.089188
1071	KH000171	ANH KHỞI	1	1	090 7919889	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.327	2025-07-29 06:48:11.089188
1072	KH000170	ANH PHƯƠNG - PHÚ TÚC	1	1	035 9845240	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.327	2025-07-29 06:48:11.089188
1073	KH000169	VINH - CÚT	1	1	037 5771017	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.323	2025-07-29 06:48:11.089188
1074	KH000168	HIỆP - LAN	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.323	2025-07-29 06:48:11.089188
1075	KH000167	ANH HƯNG - TÂY NINH	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.323	2025-07-29 06:48:11.089188
1077	KH000165	ANH SƠN - BÌNH DƯƠNG(GIA CÔNG GÀ)	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.319	2025-07-29 06:48:11.089188
1078	KH000164	ANH HIẾN - CÂY GÁO	1	1	096 1171820	\N	\N	\N	\N	\N	\N	50000000.00	0.00	38260000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.319	2025-07-29 06:48:11.089188
1079	KH000163	CHÚ QUANG BỐT ĐỎ	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.317	2025-07-29 06:48:11.089188
1180	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	1	0382 483 443	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	46786000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.963	2025-07-29 06:48:11.558485
1181	KH0000051	ANH KHÁNH - TAM HOÀNG - SOKLU	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	149300000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.963	2025-07-29 06:48:11.558485
1182	KH0000050	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	68330000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.963	2025-07-29 06:48:11.558485
1093	KH000148	ANH SANG - SUỐI CÁT	1	1	096 5088906	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.303	2025-07-29 06:48:11.269044
1094	KH000147	CHÚ TÀI - LONG KHÁNH	1	1	091 4703793	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.303	2025-07-29 06:48:11.269044
1095	KH000146	ANH DŨNG - CÂY XĂNG THANH SƠN	1	1	097 4372815	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.3	2025-07-29 06:48:11.269044
1096	KH000145	CHỊ KIỀU LINH	1	1	078 4406680	\N	\N	\N	\N	\N	\N	50000000.00	0.00	7240000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.3	2025-07-29 06:48:11.269044
1097	KH000143	ANH QUANG - PHƯƠNG LÂM	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.296	2025-07-29 06:48:11.269044
1098	KH000142	ANH MẠNH - NINH PHÁT	1	1	090 9504494	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.296	2025-07-29 06:48:11.269044
1099	KH000141	ANH BẢO - NINH PHÁT	1	1	094 4128500	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.296	2025-07-29 06:48:11.269044
1100	KH000140	CHÁNH CHÍCH	1	1	038 6595245	\N	\N	\N	\N	\N	\N	50000000.00	0.00	440000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.296	2025-07-29 06:48:11.269044
1101	KH000139	ANH MINH	1	1	039 6367027	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.292	2025-07-29 06:48:11.269044
1102	KH000138	ANH HƯNG - SƠN MAI	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	9000000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.292	2025-07-29 06:48:11.269044
1103	KH000137	CHỊ LIÊN - VỊT - THANH SƠN	1	1	033 6871319	\N	\N	\N	\N	\N	\N	50000000.00	0.00	2920000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.292	2025-07-29 06:48:11.269044
1104	KH000136	ANH ĐỨC - TRANG BOM	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	90000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.29	2025-07-29 06:48:11.269044
1105	KH000135	CHỊ VY - A.ĐIỆN	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	11110000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.29	2025-07-29 06:48:11.269044
1106	KH000134	HẰNG - TRẢNG BOM	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.29	2025-07-29 06:48:11.269044
1107	KH000132	ANH TIẾN - KIM ĐÌNH	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.287	2025-07-29 06:48:11.269044
1108	KH000131	CÔ CƯỜNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.287	2025-07-29 06:48:11.269044
1109	KH000130	ANH THẾ - ĐÔNG PHƯƠNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.287	2025-07-29 06:48:11.269044
1110	KH000129	ANH TOẢN - BÌNH THUẬN	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.283	2025-07-29 06:48:11.269044
1111	KH000128	TUẤN CHÍCH	1	1	035 3051196	\N	\N	\N	\N	\N	\N	50000000.00	0.00	60798000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.283	2025-07-29 06:48:11.269044
1112	KH000127	ANH VŨ - BÌNH MINH	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	12590000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.283	2025-07-29 06:48:11.269044
1113	KH000122	ANH TÀI - GÀ TA - MARTINO	1	1	079 8218671	\N	\N	\N	\N	\N	\N	50000000.00	0.00	23240000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.277	2025-07-29 06:48:11.269044
1114	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	20320000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.277	2025-07-29 06:48:11.269044
1115	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	77990000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.273	2025-07-29 06:48:11.269044
1116	KH000125	CHÚ HÙNG - BÀU CÁ	1	1	090 2955110	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	68620000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-10 07:24:29.392	2025-07-29 06:48:11.269044
1117	KH000124	ANH HƯNG - GÀ - SUỐI ĐÁ	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	136600000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-10 04:42:29.542	2025-07-29 06:48:11.269044
1118	KH000123	CHỊ THÚY THANH - TAM HOÀNG	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	48380000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-10 03:36:02.89	2025-07-29 06:48:11.269044
1119	KH000121	ANH PHỤNG - SOKLU	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	3950000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-09 23:52:53.162	2025-07-29 06:48:11.269044
1120	KH000120	CÔ TUYẾT THU (7K) - SONG HÀNH	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	25930000.00	0.00	0	\N	1	\N	Ngọc Bích	t	2024-12-09 07:29:38.413	2025-07-29 06:48:11.269044
1121	KH0000119	ANH HỒNG CÁM US	1	1	035 4690964	\N	\N	\N	\N	\N	\N	50000000.00	0.00	25000000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.032	2025-07-29 06:48:11.269044
1122	KH0000118	TÚ GÀ TA	1	1	098 7099185	\N	\N	\N	\N	\N	\N	50000000.00	0.00	26410000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.03	2025-07-29 06:48:11.269044
1123	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	112220000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.03	2025-07-29 06:48:11.269044
1124	KH0000116	CÔ MAI - GÀ ĐẺ - AN LỘC	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	8980000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.03	2025-07-29 06:48:11.269044
1125	KH0000115	CÔ MAI - GÀ ĐẺ - CÂY GÁO	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	12320000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.026	2025-07-29 06:48:11.269044
1126	KH0000114	EM TÀI - CÁM - TOGET	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	8210000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.026	2025-07-29 06:48:11.269044
1127	KH0000113	TÚ CHÍCH	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.026	2025-07-29 06:48:11.269044
1128	KH0000112	ANH PHƯỚC - VỊT XIM - XÃ LỘ 25	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.023	2025-07-29 06:48:11.269044
1129	KH0000110	SÁNG TẰNG HAID	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	104665000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.023	2025-07-29 06:48:11.269044
1134	KH0000105	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	23960000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.017	2025-07-29 06:48:11.450257
1135	KH0000104	TÂM UNITEK	1	1	357764504	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	495880000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.017	2025-07-29 06:48:11.450257
1136	KH0000103	ANH GIA CHÍCH	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	7635000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.017	2025-07-29 06:48:11.450257
1137	KH0000102	ĐẠI LÝ KHOAN DUY	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	52670000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.013	2025-07-29 06:48:11.450257
1138	KH0000101	ĐẠI LÝ VĂN THANH	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	202310000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.013	2025-07-29 06:48:11.450257
1139	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	128630000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.013	2025-07-29 06:48:11.450257
1140	KH0000099	ANH LONG - VỊT - BIÊN HOÀ	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	40440000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.013	2025-07-29 06:48:11.450257
1141	KH0000097	ANH NGÀ - VỊT - PHÚ TÚC	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.009	2025-07-29 06:48:11.450257
1142	KH0000096	ANH TUẤN - VỊT - AN LỘC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.009	2025-07-29 06:48:11.450257
1143	KH0000095	CÔ HOA - VỊT - LỘC THỌ ( SUỐI NHO)	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.006	2025-07-29 06:48:11.450257
1144	KH0000094	CÔ NGÁT - VỊT - VÕ DÕNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	1560000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.006	2025-07-29 06:48:11.450257
1145	KH0000093	CHỊ YẾN - VỊT - BÌNH LỘC	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.006	2025-07-29 06:48:11.450257
1146	KH0000092	ANH QUẢNG - BÌNH (THUỶ VIÊN)	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.003	2025-07-29 06:48:11.450257
1147	KH0000091	TUẤN ANH - BẢO LỘC	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	13270000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.003	2025-07-29 06:48:11.450257
1148	KH0000090	ANH BỐI - NINH PHÁT	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50.003	2025-07-29 06:48:11.450257
1149	KH0000088	CÔ TRỌNG - VỊT - X.TRƯỜNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50	2025-07-29 06:48:11.450257
1150	KH0000087	ANH THUẬN - VỊT - TRẢNG BOM	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50	2025-07-29 06:48:11.450257
1151	KH0000086	CÔ HIỀN - VỊT - TRẢNG BOM	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:50	2025-07-29 06:48:11.450257
1152	KH0000084	ANH ĐIỀN - VỊT-P.THỊNH (P.LÂM)	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.996	2025-07-29 06:48:11.450257
1153	KH0000083	CÔ LOAN - VỊT - AN LỘC	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	29400000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.996	2025-07-29 06:48:11.450257
1154	KH0000082	ANH THÁI - VỊT - PHÚC NHẠC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	42320000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.993	2025-07-29 06:48:11.450257
1155	KH0000080	ANH PHONG - VỊT (NHÀ)	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	168440000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.993	2025-07-29 06:48:11.450257
1156	KH0000079	ANH QUÂN CÁM BOSS	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	13745000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.993	2025-07-29 06:48:11.450257
1157	KH0000078	ANH KHỎE  - TAM HOÀNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	103963000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.99	2025-07-29 06:48:11.450257
1158	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	149985000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.99	2025-07-29 06:48:11.450257
1159	KH0000076	EM SƠN - ECOVET	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	195039000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.99	2025-07-29 06:48:11.450257
1160	KH0000075	ANH CHÍNH - GÀ TA - MARTINO	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.987	2025-07-29 06:48:11.450257
1161	KH0000074	CHÚ THÀNH - GÀ TRE	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	10650000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.987	2025-07-29 06:48:11.450257
1162	KH0000073	CHÚ DŨNG - GÀ TA - THANH SƠN	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	104580000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.987	2025-07-29 06:48:11.450257
1163	KH0000072	ANH HẢI - GÀ TA - PHÚC TÚC	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.983	2025-07-29 06:48:11.450257
1164	KH0000071	CÔ XUYÊN THOA - GÀ TA - ĐỨC LONG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.983	2025-07-29 06:48:11.450257
1165	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	115950000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.983	2025-07-29 06:48:11.450257
1166	KH0000069	ANH HIỂN - GÀ TA - PHÚ TÚC	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	1250000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.983	2025-07-29 06:48:11.450257
1167	KH0000067	CHÚ MINH - GÀ TA- NINH PHÁT	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	16820000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.98	2025-07-29 06:48:11.450257
1168	KH0000066	CÔ THỌ - GÀ TA - SUỐI NHO	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	6550000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.98	2025-07-29 06:48:11.450257
1169	KH0000065	ANH QUÂN CÁM GOLD COIN - GA TA	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	30490000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.977	2025-07-29 06:48:11.450257
1171	KH0000063	CHÚ ĐÔNG - TAM HOÀNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	94010000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.977	2025-07-29 06:48:11.450257
1172	KH0000061	CHỊ TRANG-TAM HOÀNG-NAGOA	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	46960000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.973	2025-07-29 06:48:11.450257
1173	KH0000060	ANH BIỂN - TAM HOÀNG - CÂY GÁO	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	182150000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.973	2025-07-29 06:48:11.450257
1174	KH0000059	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	70340000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.973	2025-07-29 06:48:11.450257
1175	KH0000058	ANH PHÙNG - TAM HOÀNG-NINH PHÁT	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	42456500.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.969	2025-07-29 06:48:11.450257
1176	KH0000057	ANH SỸ -TAM HOÀNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	176240000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.969	2025-07-29 06:48:11.450257
1177	KH0000055	ANH SƠN ( BỘ) - TAM HOÀNG	1	1	0385 410 545	\N	\N	\N	\N	\N	\N	50000000.00	0.00	104878000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.967	2025-07-29 06:48:11.450257
1178	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	52210000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.967	2025-07-29 06:48:11.450257
1179	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	118420000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.967	2025-07-29 06:48:11.450257
1170	KH0000064	CHÚ CHIỂU - GÀ TA - ĐỨC LONG	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	600000.00	185096.77	1	2025-08-05 08:00:19.181657	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.977	2025-08-05 08:00:19.181657
1183	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	149200000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.963	2025-07-29 06:48:11.558485
1184	KH0000048	CÔ CHƯNG - TAM HOÀNG - NAGOA	1	1	\N	\N	\N	\N	\N	\N	\N	50000000.00	0.00	133150000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.959	2025-07-29 06:48:11.558485
1185	KH0000047	ANH LÂM (8K) - TRẠI 4	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	124220000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.959	2025-07-29 06:48:11.558485
1186	KH0000046	ANH LIÊM - VỊT (3K)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	111425000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.959	2025-07-29 06:48:11.558485
1187	KH0000045	ANH LÂM - GÀ TA (4K)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	2700000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.957	2025-07-29 06:48:11.558485
1188	KH0000044	ANH HIỂN - BÀU SẬY	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	126455000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.957	2025-07-29 06:48:11.558485
1189	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	351645000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.957	2025-07-29 06:48:11.558485
1190	KH0000042	CHỊ QUYÊN - VỊT	1	1	0868 115 339	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	172705000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.953	2025-07-29 06:48:11.558485
1191	KH0000041	ANH THÀNH - XUYÊN MỘC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	80040000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.953	2025-07-29 06:48:11.558485
1192	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	100530000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.953	2025-07-29 06:48:11.558485
1193	KH0000038	ANH HUY - THẢO TRANG - CÚT	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	16170000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.95	2025-07-29 06:48:11.558485
1194	KH0000037	ANH DŨNG - VỊT	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	108860000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.95	2025-07-29 06:48:11.558485
1195	KH0000036	ANH PHONG - SUỐI ĐÁ 2	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	148180000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.95	2025-07-29 06:48:11.558485
1196	KH0000035	ANH VŨ - BÌNH LỘC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	61810000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.947	2025-07-29 06:48:11.558485
1197	KH0000034	ANH TUYÊN - MARTINO	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	33460000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.947	2025-07-29 06:48:11.558485
1198	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	260328000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.947	2025-07-29 06:48:11.558485
1199	KH0000032	ANH HÙNG - CẦU CƯỜNG	1	1	0355 657 789	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	18195000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.943	2025-07-29 06:48:11.558485
1200	KH0000031	CÔ BÌNH - AN LỘC	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	33115000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.943	2025-07-29 06:48:11.558485
1201	KH0000030	ANH KHẢI - SOKLU	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	47620000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.943	2025-07-29 06:48:11.558485
1202	KH0000029	ANH HIỆP (BỘ)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	35950000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.943	2025-07-29 06:48:11.558485
1203	KH0000028	CHỊ LOAN ( ĐỊNH)	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	223740000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.939	2025-07-29 06:48:11.558485
1204	KH0000027	ANH HỌC	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	92150000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.939	2025-07-29 06:48:11.558485
1205	KH0000026	TUYẾN DONAVET	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	93105000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.939	2025-07-29 06:48:11.558485
1206	KH0000025	ANH NGHĨA - SOKLU	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	40020000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.937	2025-07-29 06:48:11.558485
1207	KH0000023	XUÂN - VỊT ( THUÊ TRUYỀN)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	8230000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.937	2025-07-29 06:48:11.558485
1208	KH0000022	ANH SỸ - VỊT	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	216080000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.933	2025-07-29 06:48:11.558485
1209	KH0000021	XUÂN - VỊT ( NHÀ)	1	1	0393 776 435	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	83570000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.933	2025-07-29 06:48:11.558485
1210	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	1	0332 580 789	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	125860000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.933	2025-07-29 06:48:11.558485
1211	KH0000019	ANH PHONG - BÀU SẬY	1	1	0333 619 566	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	160910000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.933	2025-07-29 06:48:11.558485
1212	KH0000018	KHẢI 8.500 CON - XUYÊN MỘC	1	1	0333 057 272	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	63045000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.93	2025-07-29 06:48:11.558485
1213	KH0000017	ANH TUYỀN - BÀU SẬY	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	131770000.00	0.00	0	\N	1	Hẹn cuối  lứa đang nuôi thanh toán	Thu Y Thuy Trang	t	2024-12-09 07:13:49.93	2025-07-29 06:48:11.558485
1214	KH0000016	ANH ĐEN GÀ TRE	1	1	0338 526 155	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	5620000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.93	2025-07-29 06:48:11.558485
1215	KH0000015	ANH TÂM ( ANH CÔNG)	1	1	0977 069 747	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	203445000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.927	2025-07-29 06:48:11.558485
1216	KH0000014	ANH HƯNG - MARTINO	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	147544000.00	0.00	0	\N	1	11/5 hẹn trả thêm công nợ	Thu Y Thuy Trang	t	2024-12-09 07:13:49.927	2025-07-29 06:48:11.558485
1217	KH000002	TRUNG - BƯU ĐIỆN - VỊT	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	124725000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.923	2025-07-29 06:48:11.558485
1218	KH000004	ANH DUY - TÍN NGHĨA	1	1	0965 258 830	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	37030000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.923	2025-07-29 06:48:11.558485
1219	KH000005	ANH CƯƠNG - ĐỨC HUY	1	1	0352 636 667	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	78110000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.923	2025-07-29 06:48:11.558485
1220	KH000006	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	1	0778 197 356	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	112294500.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.92	2025-07-29 06:48:11.558485
1221	KH000007	CHÚ PHƯỚC - TAM HOÀNG	1	1	0387 248 768	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	102020000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.92	2025-07-29 06:48:11.558485
1222	KH000008	ANH TIÊN - ĐỨC HUY	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	45055000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.92	2025-07-29 06:48:11.558485
1223	KH000009	ANH LÂM - GÀ TRE MARTINO(6k)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	14640000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.917	2025-07-29 06:48:11.558485
1224	KH000010	KHẢI HAIDER - BÀU CẠN	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	131040000.00	0.00	0	\N	1	xin công nợ vào lứa tới lô 20k vịt bầu cạn	Thu Y Thuy Trang	t	2024-12-09 07:13:49.917	2025-07-29 06:48:11.558485
1225	KH000011	CHÚ DŨNG - ĐỐNG ĐA	1	1	0913 940 214	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	200190000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.917	2025-07-29 06:48:11.558485
1226	KH000012	ANH LÂM (5k) - TRẠI 1	1	1	0386 209 400	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	111530000.00	0.00	0	\N	1	\N	Thu Y Thuy Trang	t	2024-12-09 07:13:49.912	2025-07-29 06:48:11.558485
1228	KH_WALK_IN	Khách lẻ	1	1	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0	\N	1	\N	\N	t	2025-07-30 04:51:20.635148	2025-07-30 04:51:20.635148
1076	KH000166	ANH CHIẾN-KHÁNH	1	1	039 6790740	\N	\N	\N	\N	\N	\N	50000000.00	0.00	1890000.00	440000.00	1	2025-08-05 02:31:51.073582	1	\N	Thu Y Thuy Trang	t	2024-12-10 11:38:52.319	2025-08-05 02:31:51.073582
830	KH000424	CHỊ TRINH - VĨNH CỬU 4K	1	1	\N	\N	\N	\N	\N	\N	Nữ	50000000.00	0.00	1018500.00	338193.54	1	2025-08-05 08:04:12.175956	1	\N	Ngọc Bích	t	2025-07-28 03:43:08.569	2025-08-05 08:04:12.175956
832	KH000422	ANH HẢI (THUÝ)	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	1038500.00	198096.77	1	2025-08-05 08:23:16.964938	1	\N	Ngọc Bích	t	2025-07-26 00:11:29.56	2025-08-05 08:23:16.964938
925	KH000327	ANH THUỶ - VỊT - ĐỨC HUY	1	1	\N	\N	\N	\N	\N	\N	Nam	50000000.00	0.00	3883000.00	230096.77	1	2025-08-05 08:53:57.727982	1	\N	Ngọc Bích	t	2025-04-24 09:57:30.95	2025-08-05 08:53:57.727982
\.


--
-- Data for Name: debt_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.debt_transactions (transaction_id, customer_id, transaction_type, amount, old_debt, new_debt, payment_method, notes, invoice_id, created_by, created_at) FROM stdin;
1	833	debt_increase	50000000.00	0.00	50000000.00	\N	muon tien ngaoi	\N	POS System	2025-08-05 15:37:46.449526
2	833	debt_payment	-30000000.00	50000000.00	20000000.00	cash	trả nợ, con thiêu s  20tr	\N	POS System	2025-08-05 15:39:21.892108
3	835	debt_increase	65000000.00	0.00	65000000.00	\N	trả tiền	\N	POS System	2025-08-05 15:41:29.381201
4	835	debt_adjustment	-1200000.00	65000000.00	63800000.00	\N	gí mãi mới trả	\N	POS System	2025-08-05 15:44:10.237439
5	835	debt_increase	1500000.00	63800000.00	65300000.00	\N	lấy thêm thuốc	\N	debt_page_user	2025-08-06 00:18:48.385224
6	835	debt_increase	700000.00	65300000.00	66000000.00	\N	lấy thêm thuốc	\N	debt_page_user	2025-08-06 00:22:22.592333
\.


--
-- Data for Name: financial_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.financial_transactions (transaction_id, transaction_code, transaction_date, transaction_type, payer_receiver, amount, notes, created_at) FROM stdin;
1	TT001096	2025-07-28 08:06:00	Phiếu thu Tiền khách trả	ANH KHẢI - SOKLU	13700000.00	\N	2025-07-30 00:55:03.576
2	TT001095	2025-07-28 07:57:00	Phiếu thu Tiền khách trả	ANH KHÁNH - VỊT - SOKLU	1300000.00	\N	2025-07-30 00:55:03.576
3	TT001094	2025-07-28 07:43:00	Phiếu thu Tiền khách trả	CHÚ PHƯỚC VỊNH - NINH PHÁT	2800000.00	\N	2025-07-30 00:55:03.576
4	TT001093	2025-07-28 06:40:59.999	Phiếu thu Tiền khách trả	THƯƠNG CHÍCH - TRẢNG BOM	1410000.00	\N	2025-07-30 00:55:03.576
5	TTHD005335	2025-07-27 18:23:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	230000.00	\N	2025-07-30 00:55:03.576
6	TT001092	2025-07-27 14:45:00	Phiếu thu Tiền khách trả	HẢI - TRẢNG BOM	2000000.00	\N	2025-07-30 00:55:03.576
7	TT001091	2025-07-27 09:40:59.999	Phiếu thu Tiền khách trả	CÔNG ARIVIET	4000000.00	\N	2025-07-30 00:55:03.576
8	TT001090	2025-07-26 16:34:59.999	Phiếu thu Tiền khách trả	ANH TIẾN -  VỊT - SOKLU	1430000.00	\N	2025-07-30 00:55:03.576
9	TT001089	2025-07-26 14:57:00	Phiếu thu Tiền khách trả	SÁNG TẰNG HAID	10505000.00	\N	2025-07-30 00:55:03.576
10	TT001088	2025-07-26 09:46:59.999	Phiếu thu Tiền khách trả	ANH LÂM - TAM HOÀNG - NINH PHÁT	2200000.00	\N	2025-07-30 00:55:03.576
11	TTHD005307	2025-07-26 09:35:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	150000.00	\N	2025-07-30 00:55:03.576
12	TTHD005302	2025-07-26 08:08:00	Phiếu thu Tiền khách trả	CHÚ THÀNH - GÀ TRE	220000.00	\N	2025-07-30 00:55:03.576
13	TT001087	2025-07-26 07:07:00	Phiếu thu Tiền khách trả	ANH KHÁNH - TAM HOÀNG - SOKLU	39110000.00	\N	2025-07-30 00:55:03.576
14	TTHD005290	2025-07-26 06:43:00	Phiếu thu Tiền khách trả	Thắng bida (test)	170000.00	\N	2025-07-30 00:55:03.576
15	PC000324	2025-07-25 16:37:28.342	Phiếu chi Tiền trả NCC	NGUYÊN MSD	-35280000.00	\N	2025-07-30 00:55:03.576
16	PCPN000610	2025-07-25 16:19:10.15	Phiếu chi Tiền trả NCC	CƯỜNG THỊNH	-660000.00	\N	2025-07-30 00:55:03.576
17	PCPN000609	2025-07-25 15:03:49.883	Phiếu chi Tiền trả NCC	KIM TƯƠI	-2352000.00	\N	2025-07-30 00:55:03.576
18	PCPN000605	2025-07-25 14:56:03.143	Phiếu chi Tiền trả NCC	CÔNG AGRIVIET	-4000000.00	\N	2025-07-30 00:55:03.576
19	TT001086	2025-07-25 14:50:00	Phiếu thu Tiền khách trả	TÂM UNITEK	11600000.00	\N	2025-07-30 00:55:03.576
20	TT001085	2025-07-25 11:48:59.999	Phiếu thu Tiền khách trả	HẢI - TRẢNG BOM	7380000.00	\N	2025-07-30 00:55:03.576
21	TT001084	2025-07-25 11:10:59.999	Phiếu thu Tiền khách trả	ANH TÂM ( ANH CÔNG)	10000000.00	\N	2025-07-30 00:55:03.576
22	TT001083	2025-07-25 11:09:00	Phiếu thu Tiền khách trả	ANH TÂM - MARTINO - VỊT (NHÀ)	75875000.00	\N	2025-07-30 00:55:03.576
23	TT001082	2025-07-25 11:06:00	Phiếu thu Tiền khách trả	ANH TÂM ( NHÀ) - LÔ 2	59285000.00	\N	2025-07-30 00:55:03.576
24	PC000323	2025-07-25 10:18:07.477	Phiếu chi Tiền trả NCC	TTY BẢO BẢO	-108800000.00	\N	2025-07-30 00:55:03.576
25	TTHD005269	2025-07-25 09:24:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	200000.00	\N	2025-07-30 00:55:03.576
26	TT001081	2025-07-24 17:35:00	Phiếu thu Tiền khách trả	CÔNG ARIVIET	14500000.00	\N	2025-07-30 00:55:03.576
27	TT001080	2025-07-24 17:29:59.999	Phiếu thu Tiền khách trả	THƯƠNG CHÍCH - TRẢNG BOM	2600000.00	\N	2025-07-30 00:55:03.576
28	TTHD005247	2025-07-24 16:44:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	100000.00	\N	2025-07-30 00:55:03.576
29	TTHD005244	2025-07-24 15:08:59.999	Phiếu thu Tiền khách trả	TUẤN NGÔ - SOKLU	1235000.00	\N	2025-07-30 00:55:03.576
30	TT001079	2025-07-24 15:04:00	Phiếu thu Tiền khách trả	CÔ LAN ( TUẤN) - TAM HOÀNG	44400000.00	\N	2025-07-30 00:55:03.577
31	TTHD005241.01	2025-07-24 14:32:00	Phiếu thu Tiền khách trả	ANH HIẾU - DÊ	140000.00	\N	2025-07-30 00:55:03.577
32	TT001078	2025-07-24 11:08:00	Phiếu thu Tiền khách trả	EM SƠN - ECOVET	20000000.00	\N	2025-07-30 00:55:03.577
33	TT001077	2025-07-24 07:30:00	Phiếu thu Tiền khách trả	ANH LÂM  FIVEVET	2920000.00	\N	2025-07-30 00:55:03.577
34	TT001076	2025-07-24 07:30:00	Phiếu thu Tiền khách trả	CHỊ HUYỀN - VÕ DÕNG	20000000.00	\N	2025-07-30 00:55:03.577
35	TTHD005231.02	2025-07-24 07:17:00	Phiếu thu Tiền khách trả	ANH HỌC	2100000.00	\N	2025-07-30 00:55:03.577
36	PC000322	2025-07-23 17:08:00.223	Phiếu chi Tiền trả NCC	ĐẠI LÝ THÀNH AN	-115000.00	\N	2025-07-30 00:55:03.577
37	TT001075	2025-07-23 17:06:59.999	Phiếu thu Tiền khách trả	CHỊ HƯƠNG-THÀNH AN	115000.00	\N	2025-07-30 00:55:03.577
38	TTHD005220	2025-07-23 17:00:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	800000.00	\N	2025-07-30 00:55:03.577
39	TT001074	2025-07-23 15:52:00	Phiếu thu Tiền khách trả	ANH LỢI	30000000.00	\N	2025-07-30 00:55:03.577
40	PC000321	2025-07-23 14:31:47.442	Phiếu chi Tiền trả NCC	HẢI CJ	-4004000.00	\N	2025-07-30 00:55:03.577
41	TTHD005213	2025-07-23 14:23:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	230000.00	\N	2025-07-30 00:55:03.577
42	TT001073	2025-07-23 14:19:00	Phiếu thu Tiền khách trả	ANH TIẾN -  VỊT - SOKLU	9245000.00	\N	2025-07-30 00:55:03.577
43	PC000320	2025-07-23 11:22:00.1	Phiếu chi Tiền trả NCC	CÔNG TY VIETVET	-130530000.00	\N	2025-07-30 00:55:03.577
44	TT001072	2025-07-23 10:44:00	Phiếu thu Tiền khách trả	THUỲ TRANG	1795000.00	\N	2025-07-30 00:55:03.577
45	TTHD005206	2025-07-23 10:31:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	100000.00	\N	2025-07-30 00:55:03.577
46	PCPN000603	2025-07-23 10:30:30.74	Phiếu chi Tiền trả NCC	THUỲ TRANG	-665000.00	\N	2025-07-30 00:55:03.577
47	TT001071	2025-07-23 07:17:00	Phiếu thu Tiền khách trả	TRUNG - BƯU ĐIỆN - VỊT	30000000.00	\N	2025-07-30 00:55:03.577
48	TT001070	2025-07-23 07:15:00	Phiếu thu Tiền khách trả	TRUNG - BƯU ĐIỆN - LÔ MỚI	26020000.00	\N	2025-07-30 00:55:03.577
49	TT001069	2025-07-23 06:33:00	Phiếu thu Tiền khách trả	TÂM UNITEK	6610000.00	\N	2025-07-30 00:55:03.577
50	TT001068	2025-07-22 17:28:00	Phiếu thu Tiền khách trả	CÔ PHƯỢNG - BÌNH LỘC	8000000.00	\N	2025-07-30 00:55:03.577
51	TTHD005184	2025-07-22 17:26:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	200000.00	\N	2025-07-30 00:55:03.8
52	TT001067	2025-07-22 15:27:59.999	Phiếu thu Tiền khách trả	CÔNG ARIVIET	16000000.00	\N	2025-07-30 00:55:03.8
53	TTHD005180	2025-07-22 15:27:00	Phiếu thu Tiền khách trả	ANH HỌC	3400000.00	\N	2025-07-30 00:55:03.8
54	TT001066	2025-07-22 14:19:00	Phiếu thu Tiền khách trả	HÀ HOÀNG	420000.00	\N	2025-07-30 00:55:03.8
55	PCPN000600	2025-07-22 07:06:56.92	Phiếu chi Tiền trả NCC	THUỲ TRANG	-850000.00	\N	2025-07-30 00:55:03.8
56	TTHD005156	2025-07-22 06:49:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	10000.00	\N	2025-07-30 00:55:03.8
57	TT001065	2025-07-21 17:41:00	Phiếu thu Tiền khách trả	CHỊ VY - LÂM ĐỒNG	8515000.00	\N	2025-07-30 00:55:03.8
58	TTHD005143	2025-07-21 15:26:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	820000.00	\N	2025-07-30 00:55:03.8
59	TTHD005137	2025-07-21 09:17:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	60000.00	\N	2025-07-30 00:55:03.8
60	PC000319	2025-07-21 07:59:00.167	Phiếu chi Tiền trả NCC	THÀNH CÔNG	-11600000.00	\N	2025-07-30 00:55:03.8
61	TT001064	2025-07-20 17:21:00	Phiếu thu Tiền khách trả	TÂM UNITEK	27000000.00	\N	2025-07-30 00:55:03.8
62	TTHD005120.01	2025-07-20 14:42:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	240000.00	\N	2025-07-30 00:55:03.8
63	TTHD005118	2025-07-20 11:45:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	120000.00	\N	2025-07-30 00:55:03.8
64	TT001063	2025-07-20 11:18:00	Phiếu thu Tiền khách trả	ANH HIỂN - BÀU SẬY	45570000.00	\N	2025-07-30 00:55:03.8
65	TTHD005116	2025-07-20 11:06:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	50000.00	\N	2025-07-30 00:55:03.8
66	TT001062	2025-07-19 17:44:00	Phiếu thu Tiền khách trả	CƯỜNG UNITEX	1080000.00	\N	2025-07-30 00:55:03.8
67	PC000318	2025-07-19 17:42:00.243	Phiếu chi Tiền trả NCC	ĐẠI LÝ THÀNH AN	-13689100.00	\N	2025-07-30 00:55:03.8
68	TT001061	2025-07-19 17:39:59.999	Phiếu thu Tiền khách trả	ANH QUANG- GÀ TA- LẠC SƠN	29950000.00	\N	2025-07-30 00:55:03.8
69	TT001060	2025-07-19 17:39:00	Phiếu thu Tiền khách trả	ANH HÀNH - XUÂN BẮC	17000000.00	\N	2025-07-30 00:55:03.8
70	TT001059	2025-07-19 17:38:00	Phiếu thu Tiền khách trả	ANH THẾ - VÕ DÕNG	670000.00	\N	2025-07-30 00:55:03.8
71	TT001058	2025-07-19 17:32:00	Phiếu thu Tiền khách trả	ANH HƯNG ARIVIET	40000000.00	\N	2025-07-30 00:55:03.8
72	TT001057	2025-07-19 14:38:00	Phiếu thu Tiền khách trả	ANH HÀO	9400000.00	\N	2025-07-30 00:55:03.8
73	TT001056	2025-07-19 14:38:00	Phiếu thu Tiền khách trả	ANH HẢI HÀO LÔ MỚI	900000.00	\N	2025-07-30 00:55:03.8
74	TTHD005104	2025-07-19 10:53:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	50000.00	\N	2025-07-30 00:55:03.8
75	PCPN000593	2025-07-19 10:22:26.577	Phiếu chi Tiền trả NCC	THUỲ TRANG	-385000.00	\N	2025-07-30 00:55:03.8
76	TTHD005095	2025-07-19 08:44:00	Phiếu thu Tiền khách trả	TUYẾN DONAVET	100000.00	\N	2025-07-30 00:55:03.8
77	TTHD005093	2025-07-19 07:54:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	10000.00	\N	2025-07-30 00:55:03.8
78	PC000317	2025-07-19 07:45:26.003	Phiếu chi Tiền trả NCC	CÔNG TY NOVAVETTER	-10280000.00	\N	2025-07-30 00:55:03.8
79	PC000316	2025-07-19 07:44:26.243	Phiếu chi Tiền trả NCC	ĐẠI LÝ KHOAN DUY	-4650000.00	\N	2025-07-30 00:55:03.8
80	PC000315	2025-07-19 07:43:33.792	Phiếu chi Tiền trả NCC	CÔNG TY TOPCIN	-4513000.00	\N	2025-07-30 00:55:03.8
81	PC000314	2025-07-19 07:40:14.833	Phiếu chi Tiền trả NCC	MẠNH ĐỨC HUY	-2250000.00	\N	2025-07-30 00:55:03.8
82	PC000313	2025-07-19 07:39:17.74	Phiếu chi Tiền trả NCC	TRẦN GIA	-220000.00	\N	2025-07-30 00:55:03.8
83	PC000312	2025-07-19 07:24:34.813	Phiếu chi Tiền trả NCC	CÔNG TY HTC SÔNG HÔNG	-350000.00	\N	2025-07-30 00:55:03.8
84	PC000311	2025-07-19 07:24:06.026	Phiếu chi Tiền trả NCC	GIANG CEFOTAXIN	-55200000.00	\N	2025-07-30 00:55:03.8
85	PC000310	2025-07-19 07:12:49.863	Phiếu chi Tiền trả NCC	TÂM UNITEX	-3690000.00	\N	2025-07-30 00:55:03.8
86	PC000309	2025-07-19 06:48:00.529	Phiếu chi Tiền trả NCC	THƯƠNG W.S.P	-3528000.00	\N	2025-07-30 00:55:03.8
87	TT001054	2025-07-19 06:45:00	Phiếu thu Tiền khách trả	THƯƠNG CHÍCH - TRẢNG BOM	2000000.00	\N	2025-07-30 00:55:03.8
88	TT001053	2025-07-19 06:43:59.999	Phiếu thu Tiền khách trả	EM HOÀNG CHÍCH LONG KHÁNH	1340000.00	\N	2025-07-30 00:55:03.8
89	TT001052	2025-07-19 06:42:00	Phiếu thu Tiền khách trả	ANH PHONG - VĨNH TÂN	28265000.00	\N	2025-07-30 00:55:03.8
90	TT001051	2025-07-18 17:12:00	Phiếu thu Tiền khách trả	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	50000000.00	\N	2025-07-30 00:55:03.8
91	TT001050	2025-07-18 17:10:59.999	Phiếu thu Tiền khách trả	ANH THÁI - VỊT - PHÚC NHẠC	24680000.00	\N	2025-07-30 00:55:03.8
92	TTHD005080	2025-07-18 16:34:59.999	Phiếu thu Tiền khách trả	ANH ĐỨC - VÔ NHIỄM	450000.00	\N	2025-07-30 00:55:03.8
93	TTHD005076	2025-07-18 15:36:59.999	Phiếu thu Tiền khách trả	HẢI - TRẢNG BOM	3150000.00	\N	2025-07-30 00:55:03.8
94	TT001049	2025-07-18 14:51:00	Phiếu thu Tiền khách trả	ANH TIÊN - ĐỨC HUY	10000000.00	\N	2025-07-30 00:55:03.8
95	TT001048	2025-07-18 14:50:00	Phiếu thu Tiền khách trả	ANH QUẢNG - LONG THÀNH	5200000.00	\N	2025-07-30 00:55:03.8
96	TTHD005061	2025-07-18 09:04:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	120000.00	\N	2025-07-30 00:55:03.8
97	TTHD005058	2025-07-18 08:47:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	380000.00	\N	2025-07-30 00:55:03.8
98	TT001047	2025-07-18 07:49:00	Phiếu thu Tiền khách trả	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	10000000.00	\N	2025-07-30 00:55:03.8
99	PC000308	2025-07-17 16:45:17.683	Phiếu chi Tiền trả NCC	TRINH - HIPPRA	-7000000.00	\N	2025-07-30 00:55:03.8
100	TT001046	2025-07-17 16:43:00	Phiếu thu Tiền khách trả	TRINH - HIPPRA	7000000.00	\N	2025-07-30 00:55:03.8
101	TT001045	2025-07-17 14:26:00	Phiếu thu Tiền khách trả	ANH VŨ - BÌNH LỘC	20410000.00	\N	2025-07-30 00:55:04.013
102	TT001044	2025-07-17 11:10:00	Phiếu thu Tiền khách trả	ANH THẾ - VÕ DÕNG	1850000.00	\N	2025-07-30 00:55:04.013
103	TT001043	2025-07-17 08:15:00	Phiếu thu Tiền khách trả	ANH HẢI (KẾ)	1400000.00	\N	2025-07-30 00:55:04.013
104	TT001042	2025-07-17 08:15:00	Phiếu thu Tiền khách trả	MI TIGERVET	4500000.00	\N	2025-07-30 00:55:04.013
105	TT001041	2025-07-17 08:10:59.999	Phiếu thu Tiền khách trả	CHÚ MẪN - CÚT - VÕ DÕNG	650000.00	\N	2025-07-30 00:55:04.013
106	TTHD005030	2025-07-17 08:06:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	250000.00	\N	2025-07-30 00:55:04.013
107	TT001040	2025-07-16 16:54:59.999	Phiếu thu Tiền khách trả	TRINH - HIPPRA	350000.00	\N	2025-07-30 00:55:04.013
108	PC000307	2025-07-16 16:51:33.59	Phiếu chi Tiền trả NCC	TRINH - HIPPRA	-350000.00	\N	2025-07-30 00:55:04.013
109	TTHD005024	2025-07-16 16:47:59.999	Phiếu thu Tiền khách trả	NGUYỆT SƠN LÂM	350000.00	\N	2025-07-30 00:55:04.013
110	TTHD005020	2025-07-16 16:12:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	440000.00	\N	2025-07-30 00:55:04.013
111	TT001039	2025-07-16 15:08:59.999	Phiếu thu Tiền khách trả	CÔ VỠI - XUÂN BẮC	10000000.00	\N	2025-07-30 00:55:04.013
112	TT001038	2025-07-16 14:41:00	Phiếu thu Tiền khách trả	ANH HÀO	10000000.00	\N	2025-07-30 00:55:04.013
113	PC000306	2025-07-16 11:34:00.282	Phiếu chi Tiền trả NCC	CÔNG TY VIETVET	-15600000.00	\N	2025-07-30 00:55:04.013
114	PC000305	2025-07-16 11:31:34.99	Phiếu chi Tiền trả NCC	CÔNG TY VIETVET	-77952500.00	\N	2025-07-30 00:55:04.013
115	TT001037	2025-07-16 11:08:00	Phiếu thu Tiền khách trả	CHỊ NHUNG VIETVET	19388500.00	\N	2025-07-30 00:55:04.013
116	TT001036	2025-07-16 08:00:00	Phiếu thu Tiền khách trả	CHÚ DŨNG - ĐỐNG ĐA	70000000.00	\N	2025-07-30 00:55:04.013
117	TT001035	2025-07-16 07:50:00	Phiếu thu Tiền khách trả	CHỊ LOAN ( ĐỊNH)	48380000.00	\N	2025-07-30 00:55:04.013
118	TTHD005008	2025-07-16 07:41:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	120000.00	\N	2025-07-30 00:55:04.013
119	TTHD005004	2025-07-16 06:49:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	50000.00	\N	2025-07-30 00:55:04.013
120	TT001034	2025-07-15 16:12:00	Phiếu thu Tiền khách trả	CÔNG ARIVIET	10000000.00	\N	2025-07-30 00:55:04.013
121	PCPN000575	2025-07-15 15:44:01.037	Phiếu chi Tiền trả NCC	CÔNG TY THAI HOA VET	-19840000.00	\N	2025-07-30 00:55:04.013
122	TTHD004990	2025-07-15 14:23:59.999	Phiếu thu Tiền khách trả	HẢI - TRẢNG BOM	2040000.00	\N	2025-07-30 00:55:04.013
123	TT001033	2025-07-15 11:42:59.999	Phiếu thu Tiền khách trả	TRẠI GÀ ĐẺ - LONG THÀNH	3150000.00	\N	2025-07-30 00:55:04.013
124	TT001032	2025-07-15 11:34:00	Phiếu thu Tiền khách trả	KHẢI GIA KIỆM	38840000.00	\N	2025-07-30 00:55:04.013
125	TT001031	2025-07-15 11:32:00	Phiếu thu Tiền khách trả	THƯƠNG CHÍCH - TRẢNG BOM	2000000.00	\N	2025-07-30 00:55:04.013
126	TTHD004986	2025-07-15 10:53:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	120000.00	\N	2025-07-30 00:55:04.013
127	PCPN000574	2025-07-15 08:52:41.59	Phiếu chi Tiền trả NCC	TIỆM ĐOÁN	-140000.00	\N	2025-07-30 00:55:04.013
128	TTHD004981	2025-07-15 08:48:00	Phiếu thu Tiền khách trả	CHÚ THÀNH - GÀ TRE	610000.00	\N	2025-07-30 00:55:04.013
129	TTDH000907	2025-07-15 08:48:00	Phiếu thu Tiền khách trả	ANH HIẾU - DÊ	1600000.00	\N	2025-07-30 00:55:04.013
130	TT001030	2025-07-15 08:21:00	Phiếu thu Tiền khách trả	CHÚ HUỲNH - XÃ LỘ 25	10680000.00	\N	2025-07-30 00:55:04.013
131	TT001029	2025-07-15 08:19:59.999	Phiếu thu Tiền khách trả	ANH TRIỆU - GIA KIỆM	50000000.00	\N	2025-07-30 00:55:04.013
132	TT001028	2025-07-15 07:44:00	Phiếu thu Tiền khách trả	CÔNG ARIVIET	2550000.00	\N	2025-07-30 00:55:04.013
133	PCPN000573	2025-07-15 07:41:10.439	Phiếu chi Tiền trả NCC	CÔNG AGRIVIET	-2550000.00	\N	2025-07-30 00:55:04.013
134	TT001027	2025-07-15 07:27:00	Phiếu thu Tiền khách trả	ANH PHONG - VỊT (NHÀ)	27480000.00	\N	2025-07-30 00:55:04.013
135	TT001026	2025-07-15 07:25:00	Phiếu thu Tiền khách trả	ANH PHONG - BÀU SẬY	51870000.00	\N	2025-07-30 00:55:04.013
136	TT001025	2025-07-15 06:55:00	Phiếu thu Tiền khách trả	ANH DŨNG - VỊT	23920000.00	\N	2025-07-30 00:55:04.013
137	TT001024	2025-07-15 06:49:59.999	Phiếu thu Tiền khách trả	ANH NAM - CẦU QUÂN Y	5800000.00	\N	2025-07-30 00:55:04.013
138	TT001023	2025-07-14 17:12:00	Phiếu thu Tiền khách trả	ANH HƯNG - ANH HỌC	20000000.00	\N	2025-07-30 00:55:04.013
139	TT001022	2025-07-14 17:10:59.999	Phiếu thu Tiền khách trả	ANH HƯNG LÔ MỚI - MARTINO	1430000.00	\N	2025-07-30 00:55:04.013
140	TTHD004970	2025-07-14 17:05:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	80000.00	\N	2025-07-30 00:55:04.013
141	TT001021	2025-07-14 16:59:00	Phiếu thu Tiền khách trả	ANH HƯNG - GÀ - SUỐI ĐÁ	40000000.00	\N	2025-07-30 00:55:04.013
142	TT001020	2025-07-14 16:50:59.999	Phiếu thu Tiền khách trả	ANH HẢI CJ	1710000.00	\N	2025-07-30 00:55:04.013
143	PCPN000572	2025-07-14 16:47:20.787	Phiếu chi Tiền trả NCC	THÚ Y XANH	-4468800.00	\N	2025-07-30 00:55:04.013
144	TT001019	2025-07-14 16:18:59.999	Phiếu thu Tiền khách trả	ANH HẢI HÀO LÔ MỚI	2210000.00	\N	2025-07-30 00:55:04.013
145	TT001018	2025-07-14 16:05:00	Phiếu thu Tiền khách trả	CHÚ HÙNG - BÀU CÁ	10000000.00	\N	2025-07-30 00:55:04.013
146	TT001017	2025-07-14 16:02:59.999	Phiếu thu Tiền khách trả	CÔ HOA - BÀU CẠN	15100000.00	\N	2025-07-30 00:55:04.013
147	TT001016	2025-07-14 16:02:59.999	Phiếu thu Tiền khách trả	ANH VŨ CÁM ODON	2340000.00	\N	2025-07-30 00:55:04.013
148	TT001015	2025-07-14 15:59:59.999	Phiếu thu Tiền khách trả	ANH QUỐC - DẦU GIÂY	5600000.00	\N	2025-07-30 00:55:04.013
149	TTHD004960	2025-07-14 15:10:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	120000.00	\N	2025-07-30 00:55:04.013
150	TT001014	2025-07-14 14:48:59.999	Phiếu thu Tiền khách trả	ĐẠI LÝ TIÊN PHÚC	4690000.00	\N	2025-07-30 00:55:04.013
151	TT001013	2025-07-14 11:15:00	Phiếu thu Tiền khách trả	ANH DŨNG - CÂY XĂNG THANH SƠN	30000000.00	\N	2025-07-30 00:55:04.221
152	TT001012	2025-07-14 10:05:59.999	Phiếu thu Tiền khách trả	ĐẠI LÝ TUẤN PHÁT	6480000.00	\N	2025-07-30 00:55:04.221
153	TTHD004950	2025-07-14 07:28:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	60000.00	\N	2025-07-30 00:55:04.221
154	TT001011	2025-07-14 06:24:00	Phiếu thu Tiền khách trả	TIẾN CHÍCH	840000.00	\N	2025-07-30 00:55:04.221
155	TT001010	2025-07-13 16:44:59.999	Phiếu thu Tiền khách trả	ANH TRƯỜNG - CẦU CƯỜNG	400000.00	\N	2025-07-30 00:55:04.221
156	TTHD004937	2025-07-13 16:41:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	80000.00	\N	2025-07-30 00:55:04.221
157	TT001009	2025-07-13 06:26:00	Phiếu thu Tiền khách trả	ANH THIÊN - TÍN NGHĨA - LÔ MỚI	1260000.00	\N	2025-07-30 00:55:04.221
158	TT001008	2025-07-12 18:24:59.999	Phiếu thu Tiền khách trả	XUÂN ( THUÊ NGÁT)	72700000.00	\N	2025-07-30 00:55:04.221
159	TT001007	2025-07-12 18:24:00	Phiếu thu Tiền khách trả	XUÂN - VỊT ( NHÀ)	8185000.00	\N	2025-07-30 00:55:04.221
160	TTHD004912	2025-07-12 09:20:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	20000.00	\N	2025-07-30 00:55:04.221
161	TTHD004910	2025-07-12 08:57:00	Phiếu thu Tiền khách trả	ANH GIA CHÍCH	200000.00	\N	2025-07-30 00:55:04.221
162	TTHD004909	2025-07-12 08:51:59.999	Phiếu thu Tiền khách trả	ANH ĐỨC - VÔ NHIỄM	450000.00	\N	2025-07-30 00:55:04.221
163	TTHD004902	2025-07-12 07:05:00	Phiếu thu Tiền khách trả	ANH TỨ	470000.00	\N	2025-07-30 00:55:04.221
164	TT001006	2025-07-12 06:30:00	Phiếu thu Tiền khách trả	ANH QUÂN CÁM GOLD COIN - GA TA	11160000.00	\N	2025-07-30 00:55:04.221
165	TTHD004897	2025-07-11 17:05:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	90000.00	\N	2025-07-30 00:55:04.221
166	TTHD004885	2025-07-11 08:55:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	70000.00	\N	2025-07-30 00:55:04.221
167	PC000304	2025-07-11 07:55:00.422	Phiếu chi Tiền trả NCC	ĐẠI LÝ THÀNH AN	-26500000.00	\N	2025-07-30 00:55:04.221
168	TT001005	2025-07-11 06:40:00	Phiếu thu Tiền khách trả	HÀ HOÀNG	1050000.00	\N	2025-07-30 00:55:04.221
169	TT001004	2025-07-10 17:58:00	Phiếu thu Tiền khách trả	TÂM UNITEK	56200000.00	\N	2025-07-30 00:55:04.221
170	PC000303	2025-07-10 17:35:17.403	Phiếu chi Tiền trả NCC	ĐẠI LÝ THÀNH AN	-2550000.00	\N	2025-07-30 00:55:04.221
171	TT001003	2025-07-10 17:32:59.999	Phiếu thu Tiền khách trả	CHỊ HƯƠNG-THÀNH AN	2550000.00	\N	2025-07-30 00:55:04.221
172	TTHD004872	2025-07-10 16:57:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	30000.00	\N	2025-07-30 00:55:04.221
173	TT001002	2025-07-10 15:46:00	Phiếu thu Tiền khách trả	CHỊ QUY - BÌNH DƯƠNG	64120000.00	\N	2025-07-30 00:55:04.221
174	TTHD004863	2025-07-10 14:48:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	100000.00	\N	2025-07-30 00:55:04.221
175	TT001001	2025-07-10 10:34:00	Phiếu thu Tiền khách trả	HUYỀN TIGERVET	11500000.00	\N	2025-07-30 00:55:04.221
176	TTHD004854	2025-07-10 10:09:00	Phiếu thu Tiền khách trả	TUYẾN DONAVET	230000.00	\N	2025-07-30 00:55:04.221
177	PC000302	2025-07-10 08:35:00.399	Phiếu chi Tiền trả NCC	CÔNG TY HTC SÔNG HÔNG	-2500000.00	\N	2025-07-30 00:55:04.221
178	TTHD004851	2025-07-10 06:43:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	10000.00	\N	2025-07-30 00:55:04.221
179	TT001000	2025-07-09 17:00:59.999	Phiếu thu Tiền khách trả	ANH TRƯỜNG - CẦU CƯỜNG	490000.00	\N	2025-07-30 00:55:04.221
180	TT000999	2025-07-09 16:37:00	Phiếu thu Tiền khách trả	LONG - BIÊN HOÀ 2	28200000.00	\N	2025-07-30 00:55:04.221
181	PCPN000562	2025-07-09 16:34:12.92	Phiếu chi Tiền trả NCC	CÔNG TY HTC SÔNG HÔNG	-530000.00	\N	2025-07-30 00:55:04.221
182	TTHD004837	2025-07-09 15:24:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	40000.00	\N	2025-07-30 00:55:04.221
183	PC000301	2025-07-09 15:09:00.212	Phiếu chi Tiền trả NCC	CÔNG TY VIETVET	-97675000.00	\N	2025-07-30 00:55:04.221
184	PC000300	2025-07-09 11:27:00.577	Phiếu chi Tiền trả NCC	TTY BẢO BẢO	-95150000.00	\N	2025-07-30 00:55:04.221
185	TTHD004828	2025-07-09 09:40:59.999	Phiếu thu Tiền khách trả	Unknown	1000000.00	\N	2025-07-30 00:55:04.221
186	TT000998	2025-07-09 06:46:59.999	Phiếu thu Tiền khách trả	ĐẠI LÝ TIÊN PHÚC	9425000.00	\N	2025-07-30 00:55:04.221
187	TTHD004816	2025-07-09 06:40:00	Phiếu thu Tiền khách trả	ANH GIA CHÍCH	220000.00	\N	2025-07-30 00:55:04.221
188	TT000997	2025-07-08 16:54:00	Phiếu thu Tiền khách trả	HUYỀN TIGERVET	30000000.00	\N	2025-07-30 00:55:04.221
189	PC000299	2025-07-08 16:45:03.702	Phiếu chi Tiền trả NCC	TRINH - HIPPRA	-5650000.00	\N	2025-07-30 00:55:04.221
190	TT000996	2025-07-08 16:44:00	Phiếu thu Tiền khách trả	TRINH - HIPPRA	5650000.00	\N	2025-07-30 00:55:04.221
191	TT000995	2025-07-08 15:59:00	Phiếu thu Tiền khách trả	ANH QUẢNG - LONG THÀNH	1260000.00	\N	2025-07-30 00:55:04.221
192	TT000994	2025-07-08 15:58:00	Phiếu thu Tiền khách trả	ANH HẢI CJ	480000.00	\N	2025-07-30 00:55:04.221
193	TTHD004807	2025-07-08 15:10:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	500000.00	\N	2025-07-30 00:55:04.221
194	PC000298	2025-07-08 14:58:30.209	Phiếu chi Tiền trả NCC	THƯƠNG W.S.P	-4410000.00	\N	2025-07-30 00:55:04.221
195	TT000993	2025-07-08 10:57:00	Phiếu thu Tiền khách trả	ANH HẢI (KẾ)	1350000.00	\N	2025-07-30 00:55:04.221
196	TT000992	2025-07-08 10:54:00	Phiếu thu Tiền khách trả	ANH LÂM - TAM HOÀNG - NINH PHÁT	2707500.00	\N	2025-07-30 00:55:04.221
197	TT000991	2025-07-08 10:27:00	Phiếu thu Tiền khách trả	ĐẠI LÝ TUẤN PHÁT	2750000.00	\N	2025-07-30 00:55:04.221
198	TT000990	2025-07-08 09:33:00	Phiếu thu Tiền khách trả	ANH HIẾN - CÂY GÁO	20000000.00	\N	2025-07-30 00:55:04.221
199	TT000989	2025-07-08 09:16:00	Phiếu thu Tiền khách trả	HOÀ MEGA	1000000.00	\N	2025-07-30 00:55:04.221
200	PC000297	2025-07-08 08:06:00.353	Phiếu chi Tiền trả NCC	CÔNG TY THAI HOA VET	-15532000.00	\N	2025-07-30 00:55:04.221
201	TT000988	2025-07-08 07:59:00	Phiếu thu Tiền khách trả	THÚ Y ĐÌNH HIỀN	2910000.00	\N	2025-07-30 00:55:04.426
202	TTHD004786	2025-07-08 07:02:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	440000.00	\N	2025-07-30 00:55:04.426
203	PCPN000553	2025-07-07 16:58:08.43	Phiếu chi Tiền trả NCC	CÔNG TY HTC SÔNG HÔNG	-345000.00	\N	2025-07-30 00:55:04.426
204	TT000987	2025-07-07 16:53:00	Phiếu thu Tiền khách trả	QUÂN BIOFRAM	480000.00	\N	2025-07-30 00:55:04.426
205	TT000986	2025-07-07 15:30:00	Phiếu thu Tiền khách trả	ANH HÙNG - CẦU CƯỜNG	6870000.00	\N	2025-07-30 00:55:04.426
206	TT000985	2025-07-07 14:42:59.999	Phiếu thu Tiền khách trả	QUYỀN - TAM HOÀNG	88580000.00	\N	2025-07-30 00:55:04.426
207	TTHD004767	2025-07-07 09:46:00	Phiếu thu Tiền khách trả	Unknown	130000.00	\N	2025-07-30 00:55:04.426
208	TTHD004762	2025-07-07 07:54:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	450000.00	\N	2025-07-30 00:55:04.426
209	TT000984	2025-07-07 07:24:00	Phiếu thu Tiền khách trả	TÂM UNITEK	13900000.00	\N	2025-07-30 00:55:04.426
210	TTHD004752.01	2025-07-06 18:24:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	450000.00	\N	2025-07-30 00:55:04.426
211	TTHD004751.01	2025-07-06 16:36:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	30000.00	\N	2025-07-30 00:55:04.426
212	PC000296	2025-07-06 16:03:00.99	Phiếu chi Tiền trả NCC	CÔNG TY AGRIVIET	-109979000.00	\N	2025-07-30 00:55:04.426
213	TT000983	2025-07-06 10:56:00	Phiếu thu Tiền khách trả	ANH LÂM (8K) - TRẠI 4	75540000.00	\N	2025-07-30 00:55:04.426
214	PC000295	2025-07-06 09:38:38.849	Phiếu chi Tiền trả NCC	ĐẠI LÝ THÀNH AN	-465000.00	\N	2025-07-30 00:55:04.426
215	TT000982	2025-07-06 09:36:59.999	Phiếu thu Tiền khách trả	CHỊ HƯƠNG-THÀNH AN	465000.00	\N	2025-07-30 00:55:04.426
216	TT000981	2025-07-06 09:32:00	Phiếu thu Tiền khách trả	NGUYỆT SƠN LÂM	600000.00	\N	2025-07-30 00:55:04.426
217	PC000294	2025-07-06 08:21:00.833	Phiếu chi Tiền trả NCC	CÔNG AGRIVIET	-1100000.00	\N	2025-07-30 00:55:04.426
218	TTHD004739	2025-07-06 06:49:00	Phiếu thu Tiền khách trả	ANH PHÙNG - TAM HOÀNG-NINH PHÁT	1805000.00	\N	2025-07-30 00:55:04.426
219	TTHD004736	2025-07-06 06:26:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	20000.00	\N	2025-07-30 00:55:04.426
220	TTHD004735	2025-07-05 17:22:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	50000.00	\N	2025-07-30 00:55:04.426
221	TT000980	2025-07-05 15:42:00	Phiếu thu Tiền khách trả	ANH TRƯỜNG - CẦU CƯỜNG	680000.00	\N	2025-07-30 00:55:04.426
222	TT000979	2025-07-05 14:35:00	Phiếu thu Tiền khách trả	ANH PHONG - CTY GREENTECH	2520000.00	\N	2025-07-30 00:55:04.426
223	TTDH000880	2025-07-05 09:40:00	Phiếu thu Tiền khách trả	ANH HIẾU - DÊ	550000.00	\N	2025-07-30 00:55:04.426
224	TT000978	2025-07-05 09:14:00	Phiếu thu Tiền khách trả	CỬA HÀNG THỊNH VƯỢNG ( CHỊ CÚC)	4400000.00	\N	2025-07-30 00:55:04.426
225	TT000977	2025-07-05 09:07:00	Phiếu thu Tiền khách trả	HÀ HOÀNG	840000.00	\N	2025-07-30 00:55:04.426
226	PCPN000549	2025-07-05 08:52:25.643	Phiếu chi Tiền trả NCC	CÔNG TY HTC SÔNG HÔNG	-60000.00	\N	2025-07-30 00:55:04.426
227	TT000976	2025-07-05 08:42:59.999	Phiếu thu Tiền khách trả	ANH VŨ - GÀ ĐẺ	350000.00	\N	2025-07-30 00:55:04.426
228	PC000293	2025-07-04 18:00:02.389	Phiếu chi Tiền trả NCC	ĐẠI LÝ THÀNH AN	-1190000.00	\N	2025-07-30 00:55:04.426
229	TT000975	2025-07-04 17:45:59.999	Phiếu thu Tiền khách trả	CHỊ HƯƠNG-THÀNH AN	1190000.00	\N	2025-07-30 00:55:04.426
230	TTHD004703	2025-07-04 17:21:00	Phiếu thu Tiền khách trả	ANH HUYẾN - CÚT	760000.00	\N	2025-07-30 00:55:04.426
231	TT000974	2025-07-04 16:09:59.999	Phiếu thu Tiền khách trả	TUẤN NGÔ - SOKLU	7000000.00	\N	2025-07-30 00:55:04.426
232	TT000973	2025-07-04 15:01:00	Phiếu thu Tiền khách trả	ANH HIẾU - DÊ	2950000.00	\N	2025-07-30 00:55:04.426
233	PC000292	2025-07-03 17:38:00.089	Phiếu chi Tiền trả NCC	CÔNG TY HTC SÔNG HÔNG	-120000.00	\N	2025-07-30 00:55:04.426
234	TT000972	2025-07-03 17:35:00	Phiếu thu Tiền khách trả	ĐẠI LÝ TIÊN PHÚC	2375000.00	\N	2025-07-30 00:55:04.426
235	PC000291	2025-07-03 17:33:52.396	Phiếu chi Tiền trả NCC	ĐẠI LÝ TIÊN PHÚC	-2375000.00	\N	2025-07-30 00:55:04.426
236	TT000971	2025-07-03 17:32:00	Phiếu thu Tiền khách trả	CÔNG ARIVIET	3500000.00	\N	2025-07-30 00:55:04.426
237	PC000290	2025-07-03 17:26:13.46	Phiếu chi Tiền trả NCC	ĐẠI LÝ THÀNH AN	-5070000.00	\N	2025-07-30 00:55:04.426
238	TT000970	2025-07-03 17:10:59.999	Phiếu thu Tiền khách trả	CHỊ HƯƠNG-THÀNH AN	5070000.00	\N	2025-07-30 00:55:04.426
239	TT000969	2025-07-03 17:09:00	Phiếu thu Tiền khách trả	ANH HẢI CJ	1240000.00	\N	2025-07-30 00:55:04.426
240	TT000968	2025-07-03 17:08:00	Phiếu thu Tiền khách trả	CÔNG ARIVIET	15600000.00	\N	2025-07-30 00:55:04.426
241	TTHD004682	2025-07-03 15:07:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	230000.00	\N	2025-07-30 00:55:04.426
242	PCPN000542	2025-07-03 15:05:54.303	Phiếu chi Tiền trả NCC	CÔNG TY HTC SÔNG HÔNG	-2250000.00	\N	2025-07-30 00:55:04.426
243	TT000967	2025-07-03 14:51:00	Phiếu thu Tiền khách trả	ANH KHÁNH - TAM HOÀNG - SOKLU	50000000.00	\N	2025-07-30 00:55:04.426
244	TT000966	2025-07-03 14:39:59.999	Phiếu thu Tiền khách trả	ANH HIẾU - DÊ	1320000.00	\N	2025-07-30 00:55:04.426
245	TTHD004676	2025-07-03 14:16:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	210000.00	\N	2025-07-30 00:55:04.426
246	PC000289	2025-07-03 11:24:00.87	Phiếu chi Tiền trả NCC	CÔNG TY VIETVET	-82598000.00	\N	2025-07-30 00:55:04.426
247	TT000965	2025-07-03 11:19:59.999	Phiếu thu Tiền khách trả	CHỊ NHUNG VIETVET	40000000.00	\N	2025-07-30 00:55:04.426
248	PC000288	2025-07-03 09:23:00.682	Phiếu chi Tiền trả NCC	TIGERVET	-365793000.00	\N	2025-07-30 00:55:04.426
249	PC000287	2025-07-03 09:20:00.677	Phiếu chi Tiền trả NCC	CÔNG TY VIETVET	-15105000.00	\N	2025-07-30 00:55:04.426
250	PC000286	2025-07-03 09:17:42.063	Phiếu chi Tiền trả NCC	CÔNG TY AGRIVIET	-25303040.00	\N	2025-07-30 00:55:04.426
251	PC000285	2025-07-03 09:16:00.639	Phiếu chi Tiền trả NCC	CÔNG TY AGRIVIET	-53500000.00	\N	2025-07-30 00:55:04.636
252	PC000284	2025-07-03 09:15:57.09	Phiếu chi Tiền trả NCC	CÔNG TY AGRIVIET	-30301200.00	\N	2025-07-30 00:55:04.636
253	PC000283	2025-07-03 09:15:00.193	Phiếu chi Tiền trả NCC	CÔNG TY AGRIVIET	-64982340.00	\N	2025-07-30 00:55:04.636
254	PC000282	2025-07-02 17:37:55.607	Phiếu chi Tiền trả NCC	ĐẠI LÝ THÀNH AN	-3120000.00	\N	2025-07-30 00:55:04.636
255	PCPN000539	2025-07-02 17:36:58.883	Phiếu chi Tiền trả NCC	CÔNG TY VIETVET	-48600000.00	\N	2025-07-30 00:55:04.636
256	PC000281	2025-07-02 17:29:00.346	Phiếu chi Tiền trả NCC	ĐẠI LÝ THÀNH AN	-3500000.00	\N	2025-07-30 00:55:04.636
257	TT000964	2025-07-02 17:21:00	Phiếu thu Tiền khách trả	CHỊ HƯƠNG-THÀNH AN	3500000.00	\N	2025-07-30 00:55:04.636
258	TTHD004658	2025-07-02 16:50:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	200000.00	\N	2025-07-30 00:55:04.636
259	PC000280	2025-07-02 16:50:01.136	Phiếu chi Tiền trả NCC	CÔNG TY VIETVET	-54008000.00	\N	2025-07-30 00:55:04.636
260	PC000279	2025-07-02 16:49:07.659	Phiếu chi Tiền trả NCC	CÔNG TY VIETVET	-67568750.00	\N	2025-07-30 00:55:04.636
261	PC000278	2025-07-02 16:37:00.103	Phiếu chi Tiền trả NCC	MEGA VET	-100000000.00	\N	2025-07-30 00:55:04.636
262	PCPN000538	2025-07-02 14:56:08.279	Phiếu chi Tiền trả NCC	NHUNG VIETVET	-1950000.00	\N	2025-07-30 00:55:04.636
263	TT000963	2025-07-02 14:55:59.999	Phiếu thu Tiền khách trả	CHỊ NHUNG VIETVET	1950000.00	\N	2025-07-30 00:55:04.636
264	TT000962	2025-07-02 14:51:00	Phiếu thu Tiền khách trả	QUÂN BIOFRAM	1320000.00	\N	2025-07-30 00:55:04.636
265	TT000961	2025-07-02 14:48:00	Phiếu thu Tiền khách trả	ANH HIẾU - DÊ	1100000.00	\N	2025-07-30 00:55:04.636
266	TT000960	2025-07-02 14:16:00	Phiếu thu Tiền khách trả	CHÁNH CHÍCH	5000000.00	\N	2025-07-30 00:55:04.636
267	TT000959	2025-07-02 09:53:00	Phiếu thu Tiền khách trả	ĐẠI LÝ GẤU - BÀU CÁ	1540000.00	\N	2025-07-30 00:55:04.636
268	TT000958	2025-07-02 07:50:59.999	Phiếu thu Tiền khách trả	TÂM UNITEK	5000000.00	\N	2025-07-30 00:55:04.636
269	TT000957	2025-07-02 07:50:00	Phiếu thu Tiền khách trả	CHỊ VY - A.ĐIỆN	2550000.00	\N	2025-07-30 00:55:04.636
270	TTHD004634	2025-07-02 06:52:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	350000.00	\N	2025-07-30 00:55:04.636
271	TT000956	2025-07-01 17:05:00	Phiếu thu Tiền khách trả	A VŨ - GÀ ĐẺ	2140000.00	\N	2025-07-30 00:55:04.636
272	TT000955	2025-07-01 16:41:00	Phiếu thu Tiền khách trả	ANH LÂM - TAM HOÀNG - NINH PHÁT	4034000.00	\N	2025-07-30 00:55:04.636
273	TTHD004625	2025-07-01 16:38:00	Phiếu thu Tiền khách trả	HẢI - TRẢNG BOM	860000.00	\N	2025-07-30 00:55:04.636
274	TT000954	2025-07-01 14:57:00	Phiếu thu Tiền khách trả	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	48530000.00	\N	2025-07-30 00:55:04.636
275	TT000953	2025-07-01 14:55:59.999	Phiếu thu Tiền khách trả	ANH HÙNG - BỘ - TAM HOÀNG	16386000.00	\N	2025-07-30 00:55:04.636
276	TTHD004622	2025-07-01 14:48:59.999	Phiếu thu Tiền khách trả	KHÁCH LẺ	160000.00	\N	2025-07-30 00:55:04.636
277	TTHD004615.01	2025-07-01 09:46:00	Phiếu thu Tiền khách trả	KHÁCH LẺ	280000.00	\N	2025-07-30 00:55:04.636
278	PC000277	2025-07-01 06:59:55.253	Phiếu chi Tiền trả NCC	CÔNG AGRIVIET	-1080000.00	\N	2025-07-30 00:55:04.636
279	PC000276	2025-07-01 06:58:33.607	Phiếu chi Tiền trả NCC	VACCINE VỊT	-54505000.00	\N	2025-07-30 00:55:04.636
280	PC000275	2025-07-01 06:57:51.626	Phiếu chi Tiền trả NCC	TTY BẢO BẢO	-41300000.00	\N	2025-07-30 00:55:04.636
281	TT000952	2025-07-01 06:53:00	Phiếu thu Tiền khách trả	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	27000000.00	\N	2025-07-30 00:55:04.636
\.


--
-- Data for Name: invoice_details; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_details (detail_id, invoice_id, product_id, invoice_code, product_code, product_name, customer_code, customer_name, branch_id, delivery_code, pickup_address, reconciliation_code, invoice_date, created_date, updated_date, order_code, customer_phone, customer_address, customer_region, customer_ward, receiver_name, receiver_phone, receiver_address, receiver_region, receiver_ward, sales_channel, creator, delivery_partner, delivery_service, weight_gram, length_cm, width_cm, height_cm, delivery_fee, notes, subtotal, total_discount, customer_paid, cash_payment, card_payment, transfer_payment, wallet_payment, points_payment, unit, status, barcode, brand, product_notes, quantity, unit_price, discount_percent, discount_amount, sale_price, line_total, cost_price, profit_amount, created_at, customer_id) FROM stdin;
1423	7	1699	HD005348	SP000107	AGR LIVERSOL (1lit)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	720000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	120000.00	0.00	0.00	120000.00	720000.00	0.00	0.00	2025-07-30 01:20:32.586738	1208
1424	7	1903	HD005348	SP000620	AGR MELOCID (1kg)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	350000.00	0.00	0.00	350000.00	700000.00	0.00	0.00	2025-07-30 01:20:32.586738	1208
1425	8	1635	HD005347	SP000173	#TEMBUSU CHẾT (250ml)	KH0000032	ANH HÙNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	400000.00	0.00	0.00	400000.00	1600000.00	0.00	0.00	2025-07-30 01:20:32.586738	1199
1426	9	1787	HD005346	SP000738	AN-DINE ( lít)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	180000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	180000.00	0.00	0.00	180000.00	180000.00	0.00	0.00	2025-07-30 01:20:32.586738	1048
1427	10	1520	HD005345.02	SP000291	VV COLIS 50 WSP (1Kg)	KH0000014	ANH HƯNG - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:32.586738	1216
1428	11	1637	HD005344	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1050000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	350000.00	0.00	0.00	350000.00	1050000.00	0.00	0.00	2025-07-30 01:20:32.586738	852
1429	11	1942	HD005344	SP000578	#DỊCH TẢ HANVET	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	70000.00	0.00	0.00	70000.00	210000.00	0.00	0.00	2025-07-30 01:20:32.586738	852
1430	11	1626	HD005344	SP000182	CEFOTAXIM (Bột 2g)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				50.00	30000.00	0.00	0.00	30000.00	1500000.00	0.00	0.00	2025-07-30 01:20:32.586738	852
1431	12	1812	HD005343.01	SP000712	MG MAKROVIL 480ml (chai)	KH000404	ANH QUỐC - DẦU GIÂY	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	980000.00	0.00	0.00	980000.00	1960000.00	0.00	0.00	2025-07-30 01:20:32.586738	850
1432	12	1673	HD005343.01	SP000134	VAC PAC PLUS (5g)	KH000404	ANH QUỐC - DẦU GIÂY	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	30000.00	0.00	0.00	30000.00	150000.00	0.00	0.00	2025-07-30 01:20:32.586738	850
1433	12	1873	HD005343.01	SP000650	MG VIR 118 (IB BIẾN CHỦNG) 1000ds	KH000404	ANH QUỐC - DẦU GIÂY	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	400000.00	0.00	0.00	400000.00	2000000.00	0.00	0.00	2025-07-30 01:20:32.586738	850
1434	12	1875	HD005343.01	SP000648	MG VIR 220 1000ds ( TẢ )	KH000404	ANH QUỐC - DẦU GIÂY	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:32.586738	850
1435	12	1874	HD005343.01	SP000649	MG VIR 220 2000ds (TẢ)	KH000404	ANH QUỐC - DẦU GIÂY	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	260000.00	0.00	0.00	260000.00	520000.00	0.00	0.00	2025-07-30 01:20:32.586738	850
1436	13	1873	HD005342.01	SP000650	MG VIR 118 (IB BIẾN CHỦNG) 1000ds	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	8000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	400000.00	0.00	0.00	400000.00	8000000.00	0.00	0.00	2025-07-30 01:20:32.586738	862
1437	13	1797	HD005342.01	SP000727	MG VIR 220 5000ds ( TẢ )	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	560000.00	0.00	0.00	560000.00	2240000.00	0.00	0.00	2025-07-30 01:20:32.586738	862
1438	14	1595	HD005341	SP000213	CID 2000 (5lit)	KH000319	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1100000.00	0.00	0.00	1100000.00	1100000.00	0.00	0.00	2025-07-30 01:20:32.586738	932
1439	14	1681	HD005341	SP000125	AGR ANTISEPTIC (1lit)	KH000319	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:32.586738	932
1440	15	1955	HD005340	SP000565	#CÚM H5 + H9 (250ml)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	200000.00	0.00	0.00	200000.00	2200000.00	0.00	0.00	2025-07-30 01:20:32.586738	993
1441	16	1942	HD005339.01	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	70000.00	0.00	0.00	70000.00	350000.00	0.00	0.00	2025-07-30 01:20:32.586738	1189
1442	16	1626	HD005339.01	SP000182	CEFOTAXIM (Bột 2g)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				70.00	30000.00	0.00	0.00	30000.00	2100000.00	0.00	0.00	2025-07-30 01:20:32.586738	1189
1443	16	1637	HD005339.01	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	350000.00	0.00	0.00	350000.00	1750000.00	0.00	0.00	2025-07-30 01:20:32.586738	1189
1444	17	1962	HD005338	SP000558	AGR BUTASAL ATP GOLD 100ml	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	120000.00	0.00	0.00	120000.00	240000.00	0.00	0.00	2025-07-30 01:20:32.586738	1198
1445	17	1541	HD005338	SP000268	VV ANALGIN (100ml)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	70000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	35000.00	0.00	0.00	35000.00	70000.00	0.00	0.00	2025-07-30 01:20:32.586738	1198
1446	17	1622	HD005338	SP000186	#CIRCO (2000DS)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:32.586738	1198
1447	17	1836	HD005338	SP000688	KHÁNG THỂ NẮP XANH	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	160000.00	0.00	0.00	160000.00	480000.00	0.00	0.00	2025-07-30 01:20:32.586738	1198
1448	17	1445	HD005338	SP000370	TC BIO LAC PLUS MAX (Hộp 1Kg)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	760000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	380000.00	0.00	0.00	380000.00	760000.00	0.00	0.00	2025-07-30 01:20:32.586738	1198
1449	17	1465	HD005338	SP000349	VV METIOSITOL TAV (1Lit)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	250000.00	0.00	0.00	250000.00	750000.00	0.00	0.00	2025-07-30 01:20:32.586738	1198
1450	17	1893	HD005338	SP000630	AGR PHOSRENOL (1 kg)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1980000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	660000.00	0.00	0.00	660000.00	1980000.00	0.00	0.00	2025-07-30 01:20:32.586738	1198
1451	18	1759	HD005337	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:32.586738	923
1452	18	1886	HD005337	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	480000.00	0.00	0.00	480000.00	4320000.00	0.00	0.00	2025-07-30 01:20:32.586738	923
1453	19	1886	HD005336	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	480000.00	0.00	0.00	480000.00	3840000.00	0.00	0.00	2025-07-30 01:20:32.586738	1183
1454	20	1439	HD005335	SP000376	XI LANH KANGDA (1ml)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	230000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	230000.00	0.00	0.00	230000.00	230000.00	0.00	0.00	2025-07-30 01:20:32.586738	1057
1455	21	1432	HD005334	SP000383	KIM 9x13 (Vỉ)	KH0000019	ANH PHONG - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:32.586738	1211
1456	22	2085	HD005333	SP000427	#INTERFRON(100ML)	KH000238	HẢI - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	350000.00	0.00	150000.00	200000.00	2000000.00	0.00	0.00	2025-07-30 01:20:32.586738	1011
1457	23	1491	HD005332	SP000323	VV MONOSULTRIM 60 (1KG)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1300000.00	0.00	0.00	1300000.00	2600000.00	0.00	0.00	2025-07-30 01:20:32.586738	881
1458	23	1509	HD005332	SP000304	VV CHYMOSIN (1Lit)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	600000.00	0.00	0.00	600000.00	1800000.00	0.00	0.00	2025-07-30 01:20:32.877009	881
1459	23	1497	HD005332	SP000317	VV TILMI 250 ORAL (1Lit)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	800000.00	0.00	0.00	800000.00	2400000.00	0.00	0.00	2025-07-30 01:20:32.877009	881
1460	24	1639	HD005331	SP000169	#REO VIRUT (500DS)	KH0000019	ANH PHONG - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	150000.00	0.00	0.00	150000.00	1800000.00	0.00	0.00	2025-07-30 01:20:32.877009	1211
1461	24	1634	HD005331	SP000174	#RỤT MỎ SINDER (250ml)	KH0000019	ANH PHONG - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	150000.00	0.00	0.00	150000.00	1800000.00	0.00	0.00	2025-07-30 01:20:32.877009	1211
1462	25	1874	HD005330	SP000649	MG VIR 220 2000ds (TẢ)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	260000.00	0.00	0.00	260000.00	520000.00	0.00	0.00	2025-07-30 01:20:32.877009	1032
1463	26	1750	HD005329	SP000054	AGR GENTACIN (100ml)	KH000205	KHẢI ( CÔ CHUNG)	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1530000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				18.00	85000.00	0.00	0.00	85000.00	1530000.00	0.00	0.00	2025-07-30 01:20:32.877009	1041
1464	26	1631	HD005329	SP000177	#RỤT MỎ RINGPU (250ml)	KH000205	KHẢI ( CÔ CHUNG)	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	140000.00	0.00	0.00	140000.00	1400000.00	0.00	0.00	2025-07-30 01:20:32.877009	1041
1465	26	1541	HD005329	SP000268	VV ANALGIN (100ml)	KH000205	KHẢI ( CÔ CHUNG)	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	30000.00	0.00	0.00	30000.00	300000.00	0.00	0.00	2025-07-30 01:20:32.877009	1041
1466	26	2078	HD005329	SP000435	VV CHYMOSIN (100ml)	KH000205	KHẢI ( CÔ CHUNG)	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	85000.00	0.00	0.00	85000.00	850000.00	0.00	0.00	2025-07-30 01:20:32.877009	1041
1467	26	1626	HD005329	SP000182	CEFOTAXIM (Bột 2g)	KH000205	KHẢI ( CÔ CHUNG)	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				140.00	25000.00	0.00	0.00	25000.00	3500000.00	0.00	0.00	2025-07-30 01:20:32.877009	1041
1468	27	1942	HD005328	SP000578	#DỊCH TẢ HANVET	KH0000080	ANH PHONG - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	70000.00	0.00	0.00	70000.00	420000.00	0.00	0.00	2025-07-30 01:20:32.877009	1155
1469	28	1709	HD005327	SP000096	AGR ALL-LYTE (5Kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:32.877009	1176
1470	29	1489	HD005326	SP000325	VV NORLOX 50 (1Kg)	KH000377	NHUNG VIETVET	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	750000.00	0.00	0.00	750000.00	6750000.00	0.00	0.00	2025-07-30 01:20:32.877009	875
1471	30	1774	HD005325	SP000013	NOVAVETER NEO TATIN (1Kg)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:32.877009	852
1472	31	1622	HD005324	SP000186	#CIRCO (2000DS)	KH0000080	ANH PHONG - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	350000.00	0.00	0.00	350000.00	2100000.00	0.00	0.00	2025-07-30 01:20:32.877009	1155
1473	31	1942	HD005324	SP000578	#DỊCH TẢ HANVET	KH0000080	ANH PHONG - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	70000.00	0.00	0.00	70000.00	420000.00	0.00	0.00	2025-07-30 01:20:32.877009	1155
1474	32	1942	HD005323	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	70000.00	0.00	0.00	70000.00	350000.00	0.00	0.00	2025-07-30 01:20:32.877009	1189
1475	32	1637	HD005323	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	350000.00	0.00	0.00	350000.00	1750000.00	0.00	0.00	2025-07-30 01:20:32.877009	1189
1476	32	1626	HD005323	SP000182	CEFOTAXIM (Bột 2g)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				70.00	30000.00	0.00	0.00	30000.00	2100000.00	0.00	0.00	2025-07-30 01:20:32.877009	1189
1477	33	1647	HD005322	SP000161	#TABIC M.B (2000DS)	KH000203	HÀ HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1680000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	420000.00	0.00	0.00	420000.00	1680000.00	0.00	0.00	2025-07-30 01:20:32.877009	1043
1478	34	1911	HD005321	SP000610	NOVA - RỤT MỎ SINDER (500ml)	KH0000025	ANH NGHĨA - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	300000.00	0.00	0.00	300000.00	1800000.00	0.00	0.00	2025-07-30 01:20:32.877009	1206
1479	34	1891	HD005321	VIÊM GAN HANVET	VIÊM GAN HANVET	KH0000025	ANH NGHĨA - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	80000.00	0.00	0.00	80000.00	960000.00	0.00	0.00	2025-07-30 01:20:32.877009	1206
1480	34	1638	HD005321	SP000170	#REO VIRUT (1000DS)	KH0000025	ANH NGHĨA - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	250000.00	0.00	0.00	250000.00	1500000.00	0.00	0.00	2025-07-30 01:20:32.877009	1206
1481	35	1760	HD005320	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	280000.00	0.00	0.00	280000.00	2240000.00	0.00	0.00	2025-07-30 01:20:32.877009	923
1482	35	2083	HD005320	SP000429	#HIPPRAVIAR- SHS	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.865	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				19.00	240000.00	0.00	0.00	240000.00	4560000.00	0.00	0.00	2025-07-30 01:20:32.877009	923
1483	36	1715	HD005319	SP000090	AGR--SULFA PLUS (1Kg)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	950000.00	0.00	0.00	950000.00	4750000.00	0.00	0.00	2025-07-30 01:20:32.877009	1080
1484	37	1773	HD005318	SP000014	INTERGREEN ASPISURE 50% (1Kg)	KH000395	ANH QUẢNG - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:32.877009	859
1485	37	1856	HD005318	SP000667	MG REVIVAL LIQUID (lít)	KH000395	ANH QUẢNG - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	500000.00	0.00	0.00	500000.00	1000000.00	0.00	0.00	2025-07-30 01:20:32.877009	859
1486	38	1475	HD005317	SP000339	VV DOXI TAV 50 (1Kg)	KH000388	ANH HỌC (LONG)	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	1700000.00	0.00	0.00	1700000.00	6800000.00	0.00	0.00	2025-07-30 01:20:32.877009	865
1487	39	2030	HD005316	SP000484	AGR - FLOCOL ORAL (lít)	KH000209	ANH THIỆN - TAM HOÀNG - PHÚ TÚC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	950000.00	0.00	0.00	950000.00	1900000.00	0.00	0.00	2025-07-30 01:20:32.877009	1037
1488	39	1690	HD005316	SP000116	AGR ANTIGUM PLUS (1Kg)	KH000209	ANH THIỆN - TAM HOÀNG - PHÚ TÚC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	120000.00	0.00	0.00	120000.00	1200000.00	0.00	0.00	2025-07-30 01:20:32.877009	1037
2783	723	1548	HD004620	SP000261	VV CEFTI-S - NEW (250ml)	KH0000044	ANH HIỂN - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	390000.00	0.00	0.00	390000.00	5850000.00	0.00	0.00	2025-07-30 01:20:39.033025	1188
1489	39	1807	HD005316	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000209	ANH THIỆN - TAM HOÀNG - PHÚ TÚC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	0.00	250000.00	2500000.00	0.00	0.00	2025-07-30 01:20:32.877009	1037
1490	39	1709	HD005316	SP000096	AGR ALL-LYTE (5Kg)	KH000209	ANH THIỆN - TAM HOÀNG - PHÚ TÚC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	450000.00	0.00	0.00	450000.00	1350000.00	0.00	0.00	2025-07-30 01:20:32.877009	1037
1491	39	1706	HD005316	SP000099	AGR SORBIMIN (5lit)	KH000209	ANH THIỆN - TAM HOÀNG - PHÚ TÚC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	650000.00	0.00	0.00	650000.00	1950000.00	0.00	0.00	2025-07-30 01:20:32.877009	1037
1492	39	1810	HD005316	SP000714	MG PARADOL K-C (kg)	KH000209	ANH THIỆN - TAM HOÀNG - PHÚ TÚC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	200000.00	0.00	0.00	200000.00	1000000.00	0.00	0.00	2025-07-30 01:20:32.877009	1037
1493	40	1630	HD005315.01	SP000178	#CÚM AVAC RE5 (250ml)	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	200000.00	0.00	0.00	200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:32.877009	857
1494	40	1872	HD005315.01	SP000651	MG VIR 102 1000ds (Đậu)	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	630000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	210000.00	0.00	0.00	210000.00	630000.00	0.00	0.00	2025-07-30 01:20:32.877009	857
1495	41	1859	HD005314	SP000664	MG FLOR-VM 30% (lít)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1400000.00	0.00	0.00	1400000.00	1400000.00	0.00	0.00	2025-07-30 01:20:32.877009	906
1496	41	1848	HD005314	SP000676	MG DOXY-VM (kg) hộp	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	2000000.00	0.00	0.00	2000000.00	2000000.00	0.00	0.00	2025-07-30 01:20:32.877009	906
1497	42	2079	HD005313.01	SP000434	CƯỚC XE	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	70000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	70000.00	0.00	0.00	70000.00	70000.00	0.00	0.00	2025-07-30 01:20:32.877009	1129
1498	42	1634	HD005313.01	SP000174	#RỤT MỎ SINDER (250ml)	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1620000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				18.00	90000.00	0.00	0.00	90000.00	1620000.00	0.00	0.00	2025-07-30 01:20:32.877009	1129
1499	42	1891	HD005313.01	VIÊM GAN HANVET	VIÊM GAN HANVET	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	630000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	70000.00	0.00	0.00	70000.00	630000.00	0.00	0.00	2025-07-30 01:20:32.877009	1129
1500	42	1622	HD005313.01	SP000186	#CIRCO (2000DS)	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	290000.00	0.00	0.00	290000.00	2320000.00	0.00	0.00	2025-07-30 01:20:32.877009	1129
1501	42	1635	HD005313.01	SP000173	#TEMBUSU CHẾT (250ml)	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2655000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	295000.00	0.00	0.00	295000.00	2655000.00	0.00	0.00	2025-07-30 01:20:32.877009	1129
1502	42	1639	HD005313.01	SP000169	#REO VIRUT (500DS)	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1530000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				18.00	85000.00	0.00	0.00	85000.00	1530000.00	0.00	0.00	2025-07-30 01:20:32.877009	1129
1503	43	1630	HD005312.01	SP000178	#CÚM AVAC RE5 (250ml)	KH000296	KHẢI HAIDER - BÀU CẠN LÔ 20k	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				40.00	180000.00	0.00	0.00	180000.00	7200000.00	0.00	0.00	2025-07-30 01:20:32.877009	954
1504	44	1516	HD005311	SP000296	VV FLUCONAZOL (1Lit)	KH0000114	EM TÀI - CÁM - TOGET	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	350000.00	0.00	0.00	350000.00	700000.00	0.00	0.00	2025-07-30 01:20:32.877009	1126
1505	45	1692	HD005310.01	SP000114	AGR BROM- MAX (1Kg)	KH000423	ANH HẢI (TUẤN)	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	120000.00	0.00	0.00	120000.00	480000.00	0.00	0.00	2025-07-30 01:20:32.877009	831
1506	45	1491	HD005310.01	SP000323	VV MONOSULTRIM 60 (1KG)	KH000423	ANH HẢI (TUẤN)	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1300000.00	0.00	0.00	1300000.00	2600000.00	0.00	0.00	2025-07-30 01:20:32.877009	831
1507	45	1507	HD005310.01	SP000306	VV DOXICLIN 50 WSP (1Kg)	KH000423	ANH HẢI (TUẤN)	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1400000.00	0.00	0.00	1400000.00	2800000.00	0.00	0.00	2025-07-30 01:20:32.877009	831
1508	45	1465	HD005310.01	SP000349	VV METIOSITOL TAV (1Lit)	KH000423	ANH HẢI (TUẤN)	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	250000.00	0.00	0.00	250000.00	750000.00	0.00	0.00	2025-07-30 01:20:33.130602	831
1509	46	1850	HD005309	SP000674	MG VILLI SUPPORT L (lít)	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	450000.00	0.00	0.00	450000.00	1800000.00	0.00	0.00	2025-07-30 01:20:33.130602	862
1510	47	1497	HD005308	SP000317	VV TILMI 250 ORAL (1Lit)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	800000.00	0.00	0.00	800000.00	1600000.00	0.00	0.00	2025-07-30 01:20:33.130602	1189
1511	48	2036	HD005307	SP000478	VV MONOSULTRIM (100G)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:33.130602	1057
1512	48	1854	HD005307	SP000669	AGR LACTO - MAX (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	20000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	20000.00	0.00	0.00	20000.00	20000.00	0.00	0.00	2025-07-30 01:20:33.130602	1057
1513	49	1538	HD005306	SP000272	VV FOSTOSAL (100ML)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	70000.00	0.00	0.00	70000.00	560000.00	0.00	0.00	2025-07-30 01:20:33.130602	852
1514	49	1541	HD005306	SP000268	VV ANALGIN (100ml)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	175000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	35000.00	0.00	0.00	35000.00	175000.00	0.00	0.00	2025-07-30 01:20:33.130602	852
1515	49	1547	HD005306	SP000262	VV CEFAXIM (250ml)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	300000.00	0.00	0.00	300000.00	900000.00	0.00	0.00	2025-07-30 01:20:33.130602	852
1516	50	1650	HD005305	SP000157	HANTOX 200 (1lit)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:33.130602	1123
1517	50	1737	HD005305	SP000067	AGR AVITOXIN (1lit)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:33.130602	1123
1518	51	1942	HD005304.01	SP000578	#DỊCH TẢ HANVET	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	70000.00	0.00	0.00	70000.00	350000.00	0.00	0.00	2025-07-30 01:20:33.130602	945
1519	51	1619	HD005304.01	SP000189	VMD SEPTRYL 240 - Vemedim (100ml)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	40000.00	0.00	0.00	40000.00	160000.00	0.00	0.00	2025-07-30 01:20:33.130602	945
1520	51	1894	HD005304.01	SP000629	CEFTIFI (500ml)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	210000.00	0.00	0.00	210000.00	420000.00	0.00	0.00	2025-07-30 01:20:33.130602	945
1521	51	1541	HD005304.01	SP000268	VV ANALGIN (100ml)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	70000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	35000.00	0.00	0.00	35000.00	70000.00	0.00	0.00	2025-07-30 01:20:33.130602	945
1522	52	2077	HD005303	SP000436	CATOSAL 10% 100ml	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	300000.00	0.00	0.00	300000.00	6000000.00	0.00	0.00	2025-07-30 01:20:33.130602	1048
1523	52	1919	HD005303	SP000602	GLUCONAMIC KC (100ml)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				30.00	80000.00	0.00	0.00	80000.00	2400000.00	0.00	0.00	2025-07-30 01:20:33.130602	1048
1524	53	1504	HD005302	SP000309	VV FLOCOL 50 WSP (100g)	KH0000074	CHÚ THÀNH - GÀ TRE	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	110000.00	0.00	0.00	110000.00	220000.00	0.00	0.00	2025-07-30 01:20:33.130602	1161
1525	54	1601	HD005301	SP000207	HEPARENOL (1lit)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	400000.00	0.00	0.00	400000.00	1600000.00	0.00	0.00	2025-07-30 01:20:33.130602	885
1526	55	1547	HD005300	SP000262	VV CEFAXIM (250ml)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2610000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	290000.00	0.00	0.00	290000.00	2610000.00	0.00	0.00	2025-07-30 01:20:33.130602	1208
1527	56	1637	HD005299	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4290000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				33.00	130000.00	0.00	0.00	130000.00	4290000.00	0.00	0.00	2025-07-30 01:20:33.130602	1135
1528	57	1755	HD005298	SP000049	#AGR POX (1000DS)	KH000422	ANH HẢI (THUÝ)	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:33.130602	832
1529	58	1755	HD005297	SP000049	#AGR POX (1000DS)	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1980000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	220000.00	0.00	0.00	220000.00	1980000.00	0.00	0.00	2025-07-30 01:20:33.130602	1179
1530	59	1637	HD005296	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	350000.00	0.00	0.00	350000.00	7000000.00	0.00	0.00	2025-07-30 01:20:33.130602	1023
1531	59	1626	HD005296	SP000182	CEFOTAXIM (Bột 2g)	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				80.00	30000.00	0.00	0.00	30000.00	2400000.00	0.00	0.00	2025-07-30 01:20:33.130602	1023
1532	60	1585	HD005295	SP000223	#TG AI H9 (500ml)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1100000.00	0.00	0.00	1100000.00	1100000.00	0.00	0.00	2025-07-30 01:20:33.130602	1203
1533	61	2083	HD005294	SP000429	#HIPPRAVIAR- SHS	KH000284	ANH THANH - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	240000.00	0.00	0.00	240000.00	2640000.00	0.00	0.00	2025-07-30 01:20:33.130602	966
1534	62	1585	HD005293	SP000223	#TG AI H9 (500ml)	KH0000037	ANH DŨNG - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	1100000.00	0.00	0.00	1100000.00	4400000.00	0.00	0.00	2025-07-30 01:20:33.130602	1194
1535	63	1836	HD005292	SP000688	KHÁNG THỂ NẮP XANH	KH0000027	ANH HỌC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	160000.00	0.00	0.00	160000.00	960000.00	0.00	0.00	2025-07-30 01:20:33.130602	1204
1536	64	1683	HD005291.02	SP000123	AGR SEPTICA (1lit)	KH000006	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:33.130602	1220
1537	64	1808	HD005291.02	SP000716	MG TC5 PLUS ( lít)	KH000006	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:33.130602	1220
1538	64	1477	HD005291.02	SP000337	VV BENGLUXIDE (1Lit)	KH000006	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:33.130602	1220
1539	64	1737	HD005291.02	SP000067	AGR AVITOXIN (1lit)	KH000006	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	450000.00	0.00	0.00	450000.00	1800000.00	0.00	0.00	2025-07-30 01:20:33.130602	1220
1540	65	1538	HD005290	SP000272	VV FOSTOSAL (100ML)	KH000421	Thắng bida (test)	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	70000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	70000.00	0.00	0.00	70000.00	70000.00	0.00	0.00	2025-07-30 01:20:33.130602	833
1541	65	1777	HD005290	SP000010	NOVAVETER VIT 5B MAX (1Kg)	KH000421	Thắng bida (test)	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:33.130602	833
1542	66	1874	HD005288	SP000649	MG VIR 220 2000ds (TẢ)	KH000416	ANH LÂM - TRẠI 5	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	260000.00	0.00	0.00	260000.00	520000.00	0.00	0.00	2025-07-30 01:20:33.130602	838
1543	67	1432	HD005287	SP000383	KIM 9x13 (Vỉ)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:33.130602	987
1544	67	1525	HD005287	SP000286	VV PARA 10WSP (1Kg)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:33.130602	987
1545	67	1622	HD005287	SP000186	#CIRCO (2000DS)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	320000.00	0.00	0.00	320000.00	640000.00	0.00	0.00	2025-07-30 01:20:33.130602	987
1546	67	1942	HD005287	SP000578	#DỊCH TẢ HANVET	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	60000.00	0.00	0.00	60000.00	300000.00	0.00	0.00	2025-07-30 01:20:33.130602	987
1547	68	1512	HD005286	SP000301	VV AMOXIN 50 WSP (1Kg)	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	700000.00	0.00	0.00	700000.00	1400000.00	0.00	0.00	2025-07-30 01:20:33.130602	1178
1548	69	1640	HD005285	SP000168	#DỊCH TẢ VỊT-NAVETCO (1000DS)	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	70000.00	0.00	0.00	70000.00	420000.00	0.00	0.00	2025-07-30 01:20:33.130602	1192
1549	69	1626	HD005285	SP000182	CEFOTAXIM (Bột 2g)	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	\N	\N	\N	1970-01-01 00:00:45.864	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				60.00	30000.00	0.00	0.00	30000.00	1800000.00	0.00	0.00	2025-07-30 01:20:33.130602	1192
1550	70	1630	HD005283	SP000178	#CÚM AVAC RE5 (250ml)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				23.00	200000.00	0.00	0.00	200000.00	4600000.00	0.00	0.00	2025-07-30 01:20:33.130602	923
1551	71	1892	HD005282.01	SP000631	VV CEPHAXIN 50 WSP (100g)	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	780000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	130000.00	0.00	0.00	130000.00	780000.00	0.00	0.00	2025-07-30 01:20:33.130602	849
1552	71	1790	HD005282.01	SP000734	NOVICID ESL ( 5 LÍT)	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:33.130602	849
1553	71	1500	HD005282.01	SP000314	VV CEPHAXIN 50 WSP (1Kg)	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1300000.00	0.00	0.00	1300000.00	1300000.00	0.00	0.00	2025-07-30 01:20:33.130602	849
1554	72	1881	HD005281	SP000642	TYLOSIN 750g	KH000420	CHỊ LIỄU - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1000000.00	0.00	0.00	1000000.00	3000000.00	0.00	0.00	2025-07-30 01:20:33.130602	834
1555	72	1476	HD005281	SP000338	VV SULTRIM 50 TAV (1Kg)	KH000420	CHỊ LIỄU - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1400000.00	0.00	0.00	1400000.00	2800000.00	0.00	0.00	2025-07-30 01:20:33.130602	834
1556	72	1538	HD005281	SP000272	VV FOSTOSAL (100ML)	KH000420	CHỊ LIỄU - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	70000.00	0.00	0.00	70000.00	700000.00	0.00	0.00	2025-07-30 01:20:33.130602	834
1557	72	1788	HD005281	SP000737	NANO ĐỒNG (LÍT)	KH000420	CHỊ LIỄU - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	780000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	260000.00	0.00	0.00	260000.00	780000.00	0.00	0.00	2025-07-30 01:20:33.130602	834
1558	72	1889	HD005281	SP000633	DEXA - BROM	KH000420	CHỊ LIỄU - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	60000.00	0.00	0.00	60000.00	420000.00	0.00	0.00	2025-07-30 01:20:33.354502	834
1559	72	1789	HD005281	SP000736	MARTYLAN (MARPHAVET)	KH000420	CHỊ LIỄU - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	150000.00	0.00	0.00	150000.00	1500000.00	0.00	0.00	2025-07-30 01:20:33.354502	834
1560	72	1890	HD005281	SP000632	LINCOPEC ( VIỆT ANH)	KH000420	CHỊ LIỄU - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				13.00	120000.00	0.00	0.00	120000.00	1560000.00	0.00	0.00	2025-07-30 01:20:33.354502	834
1561	73	1726	HD005280	SP000079	AGR ENROSOL 20 (1lit)	KH000398	TRUNG - BƯU ĐIỆN - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	500000.00	0.00	0.00	500000.00	1000000.00	0.00	0.00	2025-07-30 01:20:33.354502	856
1562	74	1635	HD005279	SP000173	#TEMBUSU CHẾT (250ml)	KH0000076	EM SƠN - ECOVET	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	290000.00	0.00	0.00	290000.00	4350000.00	0.00	0.00	2025-07-30 01:20:33.354502	1159
1563	75	1737	HD005278	SP000067	AGR AVITOXIN (1lit)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	450000.00	0.00	0.00	450000.00	2700000.00	0.00	0.00	2025-07-30 01:20:33.354502	885
1564	75	1601	HD005278	SP000207	HEPARENOL (1lit)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	400000.00	0.00	0.00	400000.00	800000.00	0.00	0.00	2025-07-30 01:20:33.354502	885
1565	76	1534	HD005277	SP000276	VV VITLYTE C (1Kg)	KH0000114	EM TÀI - CÁM - TOGET	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	80000.00	0.00	0.00	80000.00	320000.00	0.00	0.00	2025-07-30 01:20:33.354502	1126
1566	76	1432	HD005277	SP000383	KIM 9x13 (Vỉ)	KH0000114	EM TÀI - CÁM - TOGET	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:33.354502	1126
1567	76	1520	HD005277	SP000291	VV COLIS 50 WSP (1Kg)	KH0000114	EM TÀI - CÁM - TOGET	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:33.354502	1126
1568	76	1505	HD005277	SP000308	VV FLOCOL 50 WSP (1Kg)	KH0000114	EM TÀI - CÁM - TOGET	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1200000.00	0.00	0.00	1200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:33.354502	1126
1569	77	1835	HD005276	SP000689	MG MEGA-BIO	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	150000.00	0.00	0.00	150000.00	150000.00	0.00	0.00	2025-07-30 01:20:33.354502	909
1570	77	1516	HD005276	SP000296	VV FLUCONAZOL (1Lit)	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:33.354502	909
1571	78	1836	HD005275.01	SP000688	KHÁNG THỂ NẮP XANH	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	160000.00	0.00	0.00	160000.00	640000.00	0.00	0.00	2025-07-30 01:20:33.354502	852
1572	78	1547	HD005275.01	SP000262	VV CEFAXIM (250ml)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	300000.00	0.00	0.00	300000.00	900000.00	0.00	0.00	2025-07-30 01:20:33.354502	852
1573	78	1538	HD005275.01	SP000272	VV FOSTOSAL (100ML)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	70000.00	0.00	0.00	70000.00	350000.00	0.00	0.00	2025-07-30 01:20:33.354502	852
1574	78	1541	HD005275.01	SP000268	VV ANALGIN (100ml)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	175000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	35000.00	0.00	0.00	35000.00	175000.00	0.00	0.00	2025-07-30 01:20:33.354502	852
1575	78	1774	HD005275.01	SP000013	NOVAVETER NEO TATIN (1Kg)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:33.354502	852
1576	79	1547	HD005274	SP000262	VV CEFAXIM (250ml)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1740000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	290000.00	0.00	0.00	290000.00	1740000.00	0.00	0.00	2025-07-30 01:20:33.354502	1208
1577	79	2078	HD005274	SP000435	VV CHYMOSIN (100ml)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	100000.00	0.00	0.00	100000.00	600000.00	0.00	0.00	2025-07-30 01:20:33.354502	1208
1578	79	1836	HD005274	SP000688	KHÁNG THỂ NẮP XANH	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2275000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				13.00	175000.00	0.00	0.00	175000.00	2275000.00	0.00	0.00	2025-07-30 01:20:33.354502	1208
1579	80	1500	HD005273.02	SP000314	VV CEPHAXIN 50 WSP (1Kg)	KH000238	HẢI - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1150000.00	0.00	0.00	1150000.00	2300000.00	0.00	0.00	2025-07-30 01:20:33.354502	1011
1580	80	1470	HD005273.02	SP000344	VV ANTIVIUS-TAV (1Lit)	KH000238	HẢI - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	680000.00	0.00	0.00	680000.00	4080000.00	0.00	0.00	2025-07-30 01:20:33.354502	1011
1581	80	2085	HD005273.02	SP000427	#INTERFRON(100ML)	KH000238	HẢI - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	200000.00	0.00	0.00	200000.00	1000000.00	0.00	0.00	2025-07-30 01:20:33.354502	1011
1582	81	1886	HD005272	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH0000061	CHỊ TRANG-TAM HOÀNG-NAGOA	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	480000.00	0.00	0.00	480000.00	2400000.00	0.00	0.00	2025-07-30 01:20:33.354502	1172
1583	82	1696	HD005271	SP000110	AGR CALPHOS PLUS (5lit)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	550000.00	0.00	0.00	550000.00	1100000.00	0.00	0.00	2025-07-30 01:20:33.354502	1080
1584	83	1554	HD005270	SP000255	TG LIVER COOL (1lit)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	230000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	230000.00	0.00	0.00	230000.00	230000.00	0.00	0.00	2025-07-30 01:20:33.354502	1026
1585	83	2079	HD005270	SP000434	CƯỚC XE	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	210000.00	0.00	0.00	210000.00	210000.00	0.00	0.00	2025-07-30 01:20:33.354502	1026
1586	84	1617	HD005269	SP000191	#MAX 5CLON30 (1000DS)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:33.354502	1057
1587	85	1704	HD005268	SP000101	AGR SUPPER MEAT (2lit)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	450000.00	0.00	0.00	450000.00	2700000.00	0.00	0.00	2025-07-30 01:20:33.354502	1226
1588	86	1635	HD005267	SP000173	#TEMBUSU CHẾT (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	11600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				40.00	290000.00	0.00	0.00	290000.00	11600000.00	0.00	0.00	2025-07-30 01:20:33.354502	1135
1589	87	1625	HD005266	SP000183	CEFOTAXIM (lọ 2g)	KH000347	ANH DUY - PHƯƠNG LÂM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	270000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	30000.00	0.00	0.00	30000.00	270000.00	0.00	0.00	2025-07-30 01:20:33.354502	905
1590	87	1637	HD005266	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH000347	ANH DUY - PHƯƠNG LÂM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	350000.00	0.00	0.00	350000.00	3150000.00	0.00	0.00	2025-07-30 01:20:33.354502	905
1591	88	2095	HD005265	SP000413	ESB300(100G)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	910000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				13.00	70000.00	0.00	0.00	70000.00	910000.00	0.00	0.00	2025-07-30 01:20:33.354502	1185
1592	89	1857	HD005264	SP000666	MG DICLASOL (lít)	KH000358	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	850000.00	0.00	0.00	850000.00	1700000.00	0.00	0.00	2025-07-30 01:20:33.354502	894
1593	89	1809	HD005264	SP000715	MG VILACOL (kg)	KH000358	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1800000.00	0.00	0.00	1800000.00	1800000.00	0.00	0.00	2025-07-30 01:20:33.354502	894
1594	90	1638	HD005263	SP000170	#REO VIRUT (1000DS)	KH0000044	ANH HIỂN - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	250000.00	0.00	0.00	250000.00	1500000.00	0.00	0.00	2025-07-30 01:20:33.354502	1188
1595	90	1634	HD005263	SP000174	#RỤT MỎ SINDER (250ml)	KH0000044	ANH HIỂN - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	150000.00	0.00	0.00	150000.00	1800000.00	0.00	0.00	2025-07-30 01:20:33.354502	1188
1596	91	1594	HD005262	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:33.354502	861
1597	91	1593	HD005262	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:33.354502	861
1598	92	1755	HD005261	SP000049	#AGR POX (1000DS)	KH000408	ANH KHÔI	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	880000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	220000.00	0.00	0.00	220000.00	880000.00	0.00	0.00	2025-07-30 01:20:33.354502	846
1599	93	1511	HD005260	SP000302	VV AMOXCOLI 50 WSP (1Kg)	KH000007	CHÚ PHƯỚC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	900000.00	0.00	0.00	900000.00	900000.00	0.00	0.00	2025-07-30 01:20:33.354502	1221
1600	94	1650	HD005259	SP000157	HANTOX 200 (1lit)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:33.354502	840
1601	95	1942	HD005258	SP000578	#DỊCH TẢ HANVET	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	70000.00	0.00	0.00	70000.00	700000.00	0.00	0.00	2025-07-30 01:20:33.354502	992
1602	95	1637	HD005258	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	350000.00	0.00	0.00	350000.00	3500000.00	0.00	0.00	2025-07-30 01:20:33.354502	992
1603	96	1650	HD005257	SP000157	HANTOX 200 (1lit)	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:33.354502	1209
1604	96	1630	HD005257	SP000178	#CÚM AVAC RE5 (250ml)	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	200000.00	0.00	0.00	200000.00	800000.00	0.00	0.00	2025-07-30 01:20:33.354502	1209
1605	96	1750	HD005257	SP000054	AGR GENTACIN (100ml)	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	100000.00	0.00	0.00	100000.00	400000.00	0.00	0.00	2025-07-30 01:20:33.354502	1209
1606	97	1860	HD005256.01	SP000663	MG ESCENT S (kg)	KH0000044	ANH HIỂN - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:33.354502	1188
1607	97	1709	HD005256.01	SP000096	AGR ALL-LYTE (5Kg)	KH0000044	ANH HIỂN - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:33.354502	1188
1608	97	1774	HD005256.01	SP000013	NOVAVETER NEO TATIN (1Kg)	KH0000044	ANH HIỂN - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	350000.00	0.00	0.00	350000.00	1400000.00	0.00	0.00	2025-07-30 01:20:33.581409	1188
1609	97	1706	HD005256.01	SP000099	AGR SORBIMIN (5lit)	KH0000044	ANH HIỂN - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	650000.00	0.00	0.00	650000.00	1300000.00	0.00	0.00	2025-07-30 01:20:33.581409	1188
1610	97	1508	HD005256.01	SP000305	VV BUTAPHOS PRO (1Lit)	KH0000044	ANH HIỂN - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	250000.00	0.00	0.00	250000.00	1250000.00	0.00	0.00	2025-07-30 01:20:33.581409	1188
1611	98	1639	HD005255	SP000169	#REO VIRUT (500DS)	KH000353	KHẢI GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				17.00	130000.00	0.00	0.00	130000.00	2210000.00	0.00	0.00	2025-07-30 01:20:33.581409	899
1612	98	1631	HD005255	SP000177	#RỤT MỎ RINGPU (250ml)	KH000353	KHẢI GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2380000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				17.00	140000.00	0.00	0.00	140000.00	2380000.00	0.00	0.00	2025-07-30 01:20:33.581409	899
1613	99	1432	HD005254.01	SP000383	KIM 9x13 (Vỉ)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	20000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	10000.00	0.00	0.00	10000.00	20000.00	0.00	0.00	2025-07-30 01:20:33.581409	987
1614	99	1637	HD005254.01	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	150000.00	0.00	0.00	150000.00	600000.00	0.00	0.00	2025-07-30 01:20:33.581409	987
1615	99	1500	HD005254.01	SP000314	VV CEPHAXIN 50 WSP (1Kg)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1200000.00	0.00	0.00	1200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:33.581409	987
1616	99	1526	HD005254.01	SP000285	VV BROMHEXIN WSP(1Kg)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	80000.00	0.00	0.00	80000.00	160000.00	0.00	0.00	2025-07-30 01:20:33.581409	987
1617	99	1709	HD005254.01	SP000096	AGR ALL-LYTE (5Kg)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:33.581409	987
1618	100	1807	HD005253	SP000717	TAV-STRESS LYTE PLUS (kg)	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:33.581409	1179
1619	101	1447	HD005252	SP000368	TC LACTIZYM CAO TỎI (Kg)	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	100000.00	0.00	0.00	100000.00	1000000.00	0.00	0.00	2025-07-30 01:20:33.581409	1179
1620	101	1759	HD005252	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:33.581409	1179
1621	101	1886	HD005252	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	480000.00	0.00	0.00	480000.00	4800000.00	0.00	0.00	2025-07-30 01:20:33.581409	1179
1622	101	1810	HD005252	SP000714	MG PARADOL K-C (kg)	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	200000.00	0.00	0.00	200000.00	1000000.00	0.00	0.00	2025-07-30 01:20:33.581409	1179
1623	101	1706	HD005252	SP000099	AGR SORBIMIN (5lit)	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	650000.00	0.00	0.00	650000.00	1300000.00	0.00	0.00	2025-07-30 01:20:33.581409	1179
1624	101	1807	HD005252	SP000717	TAV-STRESS LYTE PLUS (kg)	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	220000.00	0.00	0.00	220000.00	4400000.00	0.00	0.00	2025-07-30 01:20:33.581409	1179
1625	102	1856	HD005251	SP000667	MG REVIVAL LIQUID (lít)	KH000404	ANH QUỐC - DẦU GIÂY	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:33.581409	850
1626	102	1850	HD005251	SP000674	MG VILLI SUPPORT L (lít)	KH000404	ANH QUỐC - DẦU GIÂY	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:33.581409	850
1627	103	1833	HD005250	SP000691	MEGA-BROMEN (lít)	KH000365	ANH HUY - GÀ - ĐỨC HUY	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	250000.00	0.00	0.00	250000.00	1750000.00	0.00	0.00	2025-07-30 01:20:33.581409	887
1628	104	1594	HD005249	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:33.581409	861
1629	105	1738	HD005248	SP000066	AGR BUTASAN 10 (100ml)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	15000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				200.00	75000.00	0.00	0.00	75000.00	15000000.00	0.00	0.00	2025-07-30 01:20:33.581409	1080
1630	105	1740	HD005248	SP000064	AGR CHYPSIN (100ml)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	17000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				200.00	85000.00	0.00	0.00	85000.00	17000000.00	0.00	0.00	2025-07-30 01:20:33.581409	1080
1631	106	1864	HD005247	SP000659	VV FLODOXY 30 (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:33.581409	1057
1632	107	1850	HD005246	SP000674	MG VILLI SUPPORT L (lít)	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	450000.00	0.00	0.00	450000.00	6750000.00	0.00	0.00	2025-07-30 01:20:33.581409	862
1633	107	1835	HD005246	SP000689	MG MEGA-BIO	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	150000.00	0.00	0.00	150000.00	2100000.00	0.00	0.00	2025-07-30 01:20:33.581409	862
1634	108	1650	HD005245	SP000157	HANTOX 200 (1lit)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:33.581409	906
1635	109	1606	HD005244	SP000202	PERMASOL 500 (1Kg)	KH000321	TUẤN NGÔ - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	200000.00	0.00	0.00	200000.00	400000.00	0.00	0.00	2025-07-30 01:20:33.581409	930
1636	109	1492	HD005244	SP000322	VV FLOR-MAX (1Lit)	KH000321	TUẤN NGÔ - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	900000.00	0.00	0.00	900000.00	900000.00	0.00	0.00	2025-07-30 01:20:33.581409	930
1637	110	1547	HD005243	SP000262	VV CEFAXIM (250ml)	KH000212	CHỊ DUNG - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	290000.00	0.00	0.00	290000.00	2900000.00	0.00	0.00	2025-07-30 01:20:33.581409	1034
1638	110	1548	HD005243	SP000261	VV CEFTI-S - NEW (250ml)	KH000212	CHỊ DUNG - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	390000.00	0.00	0.00	390000.00	7800000.00	0.00	0.00	2025-07-30 01:20:33.581409	1034
1639	111	1541	HD005241.01	SP000268	VV ANALGIN (100ml)	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	35000.00	0.00	0.00	35000.00	140000.00	0.00	0.00	2025-07-30 01:20:33.581409	990
1640	112	1893	HD005240	SP000630	AGR PHOSRENOL (1 kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	660000.00	0.00	0.00	660000.00	660000.00	0.00	0.00	2025-07-30 01:20:33.581409	1032
1641	113	1893	HD005239	SP000630	AGR PHOSRENOL (1 kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	660000.00	0.00	0.00	660000.00	1320000.00	0.00	0.00	2025-07-30 01:20:33.581409	1226
1642	114	1847	HD005238	SP000677	#AGR IZOVAC ND-EDS-IB	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1600000.00	0.00	0.00	1600000.00	1600000.00	0.00	0.00	2025-07-30 01:20:33.581409	1080
1643	115	1807	HD005237	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000418	ANH KHÁNH - TAM HOÀNG - SOKLU 2	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:33.581409	836
1644	116	1807	HD005236	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000418	ANH KHÁNH - TAM HOÀNG - SOKLU 2	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	220000.00	0.00	0.00	220000.00	4400000.00	0.00	0.00	2025-07-30 01:20:33.581409	836
1645	116	1730	HD005236	SP000074	AGR SELKO®-4 HEALTH (1lit)	KH000418	ANH KHÁNH - TAM HOÀNG - SOKLU 2	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	220000.00	0.00	0.00	220000.00	2640000.00	0.00	0.00	2025-07-30 01:20:33.581409	836
1646	116	1669	HD005236	SP000138	TOPCIN BCOMPLEX C (1Kg)	KH000418	ANH KHÁNH - TAM HOÀNG - SOKLU 2	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				25.00	100000.00	0.00	0.00	100000.00	2500000.00	0.00	0.00	2025-07-30 01:20:33.581409	836
1647	117	1873	HD005235.01	SP000650	MG VIR 118 (IB BIẾN CHỦNG) 1000ds	KH000419	CHỊ TRINH - VĨNH AN	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	400000.00	0.00	0.00	400000.00	800000.00	0.00	0.00	2025-07-30 01:20:33.581409	835
1648	117	1860	HD005235.01	SP000663	MG ESCENT S (kg)	KH000419	CHỊ TRINH - VĨNH AN	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	250000.00	0.00	0.00	250000.00	1250000.00	0.00	0.00	2025-07-30 01:20:33.581409	835
1649	117	1812	HD005235.01	SP000712	MG MAKROVIL 480ml (chai)	KH000419	CHỊ TRINH - VĨNH AN	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	980000.00	0.00	0.00	980000.00	3920000.00	0.00	0.00	2025-07-30 01:20:33.581409	835
1650	117	1799	HD005235.01	SP000725	MG DOKSIVIL (kg)	KH000419	CHỊ TRINH - VĨNH AN	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	2300000.00	0.00	0.00	2300000.00	2300000.00	0.00	0.00	2025-07-30 01:20:33.581409	835
1651	118	1511	HD005234	SP000302	VV AMOXCOLI 50 WSP (1Kg)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	900000.00	0.00	0.00	900000.00	1800000.00	0.00	0.00	2025-07-30 01:20:33.581409	885
1652	119	2078	HD005233	SP000435	VV CHYMOSIN (100ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				24.00	100000.00	0.00	0.00	100000.00	2400000.00	0.00	0.00	2025-07-30 01:20:33.581409	1092
1653	119	1541	HD005233	SP000268	VV ANALGIN (100ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				24.00	35000.00	0.00	0.00	35000.00	840000.00	0.00	0.00	2025-07-30 01:20:33.581409	1092
1654	119	1742	HD005233	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	8400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				24.00	350000.00	0.00	0.00	350000.00	8400000.00	0.00	0.00	2025-07-30 01:20:33.581409	1092
1655	120	1780	HD005232	SP000007	NOVAVETER BUTATOXIN (5lit)	KH000007	CHÚ PHƯỚC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:33.581409	1221
1656	121	1622	HD005231.02	SP000186	#CIRCO (2000DS)	KH0000027	ANH HỌC	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	350000.00	0.00	0.00	350000.00	2100000.00	0.00	0.00	2025-07-30 01:20:33.581409	1204
1657	122	1635	HD005230.01	SP000173	#TEMBUSU CHẾT (250ml)	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	400000.00	0.00	0.00	400000.00	2400000.00	0.00	0.00	2025-07-30 01:20:33.581409	841
1658	123	1635	HD005229	SP000173	#TEMBUSU CHẾT (250ml)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	400000.00	0.00	0.00	400000.00	2400000.00	0.00	0.00	2025-07-30 01:20:33.806029	852
1659	124	1849	HD005228	SP000675	MG IVERMECTIN (kg)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:33.806029	878
1660	125	1691	HD005227	SP000115	AGR PARA C (1Kg)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	130000.00	0.00	0.00	130000.00	260000.00	0.00	0.00	2025-07-30 01:20:33.806029	1080
2815	740	1622	HD1754246827011	SP000186	#CIRCO (2000DS)	\N	QUÂN BIOFRAM	1	\N	\N	\N	2025-08-03 18:47:07.765	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	1200000.00	0.00	0.00	0.00	0.00	\N	\N	\N	\N	\N	3.00	400000.00	0.00	0.00	400000.00	1200000.00	0.00	0.00	2025-08-03 18:47:06.401424	\N
1661	126	1673	HD005226	SP000134	VAC PAC PLUS (5g)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	30000.00	0.00	0.00	30000.00	300000.00	0.00	0.00	2025-07-30 01:20:33.806029	1183
1662	126	1761	HD005226	SP000043	#IZOVAC H120 - LASOTA (1000DS)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:33.806029	1183
1663	126	1760	HD005226	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	280000.00	0.00	0.00	280000.00	2240000.00	0.00	0.00	2025-07-30 01:20:33.806029	1183
1664	126	1650	HD005226	SP000157	HANTOX 200 (1lit)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	350000.00	0.00	0.00	350000.00	700000.00	0.00	0.00	2025-07-30 01:20:33.806029	1183
1665	127	1619	HD005225	SP000189	VMD SEPTRYL 240 - Vemedim (100ml)	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	40000.00	0.00	0.00	40000.00	80000.00	0.00	0.00	2025-07-30 01:20:33.806029	1209
1666	127	1894	HD005225	SP000629	CEFTIFI (500ml)	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:33.806029	1209
1667	128	1635	HD005224	SP000173	#TEMBUSU CHẾT (250ml)	KH0000076	EM SƠN - ECOVET	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				18.00	290000.00	0.00	0.00	290000.00	5220000.00	0.00	0.00	2025-07-30 01:20:33.806029	1159
1668	129	1593	HD005223	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:33.806029	1180
1669	129	1594	HD005223	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1010000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	202000.00	0.00	0.00	202000.00	1010000.00	0.00	0.00	2025-07-30 01:20:33.806029	1180
1670	130	1622	HD005222	SP000186	#CIRCO (2000DS)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	400000.00	0.00	0.00	400000.00	2400000.00	0.00	0.00	2025-07-30 01:20:33.806029	993
1671	130	1942	HD005222	SP000578	#DỊCH TẢ HANVET	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	70000.00	0.00	0.00	70000.00	420000.00	0.00	0.00	2025-07-30 01:20:33.806029	993
1672	131	1750	HD005221	SP000054	AGR GENTACIN (100ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	100000.00	0.00	0.00	100000.00	300000.00	0.00	0.00	2025-07-30 01:20:33.806029	1210
1673	131	1807	HD005221	SP000717	TAV-STRESS LYTE PLUS (kg)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:33.806029	1210
1674	131	1955	HD005221	SP000565	#CÚM H5 + H9 (250ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.862	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	200000.00	0.00	0.00	200000.00	1600000.00	0.00	0.00	2025-07-30 01:20:33.806029	1210
1675	132	1450	HD005220	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:33.806029	1057
1676	132	1528	HD005220	SP000282	VV METISOL (1Lit)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:33.806029	1057
1677	132	1719	HD005220	SP000086	AGR VETCOX (1lit)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	550000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	550000.00	0.00	0.00	550000.00	550000.00	0.00	0.00	2025-07-30 01:20:33.806029	1057
1678	133	1750	HD005218	SP000054	AGR GENTACIN (100ml)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:33.806029	840
1679	133	1942	HD005218	SP000578	#DỊCH TẢ HANVET	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	490000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	70000.00	0.00	0.00	70000.00	490000.00	0.00	0.00	2025-07-30 01:20:33.806029	840
1680	134	1942	HD005217	SP000578	#DỊCH TẢ HANVET	KH0000032	ANH HÙNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	70000.00	0.00	0.00	70000.00	140000.00	0.00	0.00	2025-07-30 01:20:33.806029	1199
1681	135	1877	HD005216	SP000646	MG VIR 114 1000ds ( GUM )	KH0000103	ANH GIA CHÍCH	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	230000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	230000.00	0.00	0.00	230000.00	230000.00	0.00	0.00	2025-07-30 01:20:33.806029	1136
1682	135	1876	HD005216	SP000647	MG VIR 114 2000ds ( GUM )	KH0000103	ANH GIA CHÍCH	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:33.806029	1136
1683	136	1836	HD005215.01	SP000688	KHÁNG THỂ NẮP XANH	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	150000.00	0.00	0.00	150000.00	1350000.00	0.00	0.00	2025-07-30 01:20:33.806029	987
1684	136	1447	HD005215.01	SP000368	TC LACTIZYM CAO TỎI (Kg)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:33.806029	987
1685	136	1526	HD005215.01	SP000285	VV BROMHEXIN WSP(1Kg)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:33.806029	987
1686	136	1525	HD005215.01	SP000286	VV PARA 10WSP (1Kg)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:33.806029	987
1687	136	1726	HD005215.01	SP000079	AGR ENROSOL 20 (1lit)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:33.806029	987
1688	137	1547	HD005214	SP000262	VV CEFAXIM (250ml)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	290000.00	0.00	0.00	290000.00	5800000.00	0.00	0.00	2025-07-30 01:20:33.806029	1203
1689	138	1439	HD005213	SP000376	XI LANH KANGDA (1ml)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	230000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	230000.00	0.00	0.00	230000.00	230000.00	0.00	0.00	2025-07-30 01:20:33.806029	1057
1690	139	1634	HD005212	SP000174	#RỤT MỎ SINDER (250ml)	KH0000080	ANH PHONG - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	150000.00	0.00	0.00	150000.00	1800000.00	0.00	0.00	2025-07-30 01:20:33.806029	1155
1691	139	1639	HD005212	SP000169	#REO VIRUT (500DS)	KH0000080	ANH PHONG - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	150000.00	0.00	0.00	150000.00	1800000.00	0.00	0.00	2025-07-30 01:20:33.806029	1155
1692	140	1673	HD005211.02	SP000134	VAC PAC PLUS (5g)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	60000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	30000.00	0.00	0.00	30000.00	60000.00	0.00	0.00	2025-07-30 01:20:33.806029	861
1693	140	1591	HD005211.02	SP000217	#TG IBD M+ (2000DS)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	400000.00	0.00	0.00	400000.00	1200000.00	0.00	0.00	2025-07-30 01:20:33.806029	861
1694	141	1673	HD005210	SP000134	VAC PAC PLUS (5g)	KH000288	CÔ TUYẾT THU (5K) - LÔ SONG HÀNH	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	30000.00	0.00	0.00	30000.00	30000.00	0.00	0.00	2025-07-30 01:20:33.806029	962
1695	141	1871	HD005210	SP000652	MG VIR 101 1000ds (ILT)	KH000288	CÔ TUYẾT THU (5K) - LÔ SONG HÀNH	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	240000.00	0.00	0.00	240000.00	1200000.00	0.00	0.00	2025-07-30 01:20:33.806029	962
1696	142	1581	HD005209	SP000227	#TG CORYZA LE (500ml)	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	1050000.00	0.00	0.00	1050000.00	5250000.00	0.00	0.00	2025-07-30 01:20:33.806029	1114
1697	143	1673	HD005208	SP000134	VAC PAC PLUS (5g)	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	30000.00	0.00	0.00	30000.00	30000.00	0.00	0.00	2025-07-30 01:20:33.806029	1115
1698	143	1798	HD005208	SP000726	MG VIR 114 5000ds ( GUM )	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	830000.00	0.00	0.00	830000.00	1660000.00	0.00	0.00	2025-07-30 01:20:33.806029	1115
1699	143	1877	HD005208	SP000646	MG VIR 114 1000ds ( GUM )	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	230000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	230000.00	0.00	0.00	230000.00	230000.00	0.00	0.00	2025-07-30 01:20:33.806029	1115
1700	144	1709	HD005207	SP000096	AGR ALL-LYTE (5Kg)	KH000007	CHÚ PHƯỚC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:33.806029	1221
1701	145	1864	HD005206	SP000659	VV FLODOXY 30 (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:33.806029	1057
1702	146	1494	HD005205	SP000320	VV FLODOXY 30 (1Kg)	KH000243	THUỲ TRANG	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	665000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	665000.00	0.00	0.00	665000.00	665000.00	0.00	0.00	2025-07-30 01:20:33.806029	1006
1703	147	1872	HD005204.01	SP000651	MG VIR 102 1000ds (Đậu)	KH000390	ANH TÀI - MARTINO (BÀ NGOẠI)	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	210000.00	0.00	0.00	210000.00	420000.00	0.00	0.00	2025-07-30 01:20:33.806029	864
1704	147	1627	HD005204.01	SP000181	#ND-IB-H9 (250ml)	KH000390	ANH TÀI - MARTINO (BÀ NGOẠI)	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	450000.00	0.00	0.00	450000.00	2700000.00	0.00	0.00	2025-07-30 01:20:33.806029	864
1705	148	1627	HD005203.01	SP000181	#ND-IB-H9 (250ml)	KH000122	ANH TÀI - GÀ TA - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	450000.00	0.00	0.00	450000.00	2700000.00	0.00	0.00	2025-07-30 01:20:33.806029	1113
1706	148	1872	HD005203.01	SP000651	MG VIR 102 1000ds (Đậu)	KH000122	ANH TÀI - GÀ TA - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	210000.00	0.00	0.00	210000.00	420000.00	0.00	0.00	2025-07-30 01:20:33.806029	1113
1707	149	1461	HD005202	SP000354	VV DIATRIM TAV 50 (1Kg)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	800000.00	0.00	0.00	800000.00	800000.00	0.00	0.00	2025-07-30 01:20:33.806029	1189
1708	149	1962	HD005202	SP000558	AGR BUTASAL ATP GOLD 100ml	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	120000.00	0.00	0.00	120000.00	840000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1709	149	1742	HD005202	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	350000.00	0.00	0.00	350000.00	1750000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1710	149	1541	HD005202	SP000268	VV ANALGIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	35000.00	0.00	0.00	35000.00	280000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1711	149	1740	HD005202	SP000064	AGR CHYPSIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	110000.00	0.00	0.00	110000.00	440000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1712	149	1605	HD005202	SP000203	ACID-PAR 4WAY (5lit)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	600000.00	0.00	0.00	600000.00	600000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1713	150	2078	HD005201	SP000435	VV CHYMOSIN (100ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	100000.00	0.00	0.00	100000.00	700000.00	0.00	0.00	2025-07-30 01:20:34.120072	1092
1714	150	1541	HD005201	SP000268	VV ANALGIN (100ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	245000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	35000.00	0.00	0.00	35000.00	245000.00	0.00	0.00	2025-07-30 01:20:34.120072	1092
1715	150	1742	HD005201	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	350000.00	0.00	0.00	350000.00	2450000.00	0.00	0.00	2025-07-30 01:20:34.120072	1092
1716	151	1541	HD005200	SP000268	VV ANALGIN (100ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	805000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				23.00	35000.00	0.00	0.00	35000.00	805000.00	0.00	0.00	2025-07-30 01:20:34.120072	1092
1717	151	1836	HD005200	SP000688	KHÁNG THỂ NẮP XANH	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4550000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				26.00	175000.00	0.00	0.00	175000.00	4550000.00	0.00	0.00	2025-07-30 01:20:34.120072	1092
1718	151	2078	HD005200	SP000435	VV CHYMOSIN (100ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				23.00	100000.00	0.00	0.00	100000.00	2300000.00	0.00	0.00	2025-07-30 01:20:34.120072	1092
1719	151	1742	HD005200	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	8050000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				23.00	350000.00	0.00	0.00	350000.00	8050000.00	0.00	0.00	2025-07-30 01:20:34.120072	1092
1720	152	1856	HD005199	SP000667	MG REVIVAL LIQUID (lít)	KH000358	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	500000.00	0.00	0.00	500000.00	2500000.00	0.00	0.00	2025-07-30 01:20:34.120072	894
1721	153	1861	HD005198	SP000662	MG SALICYLAT KC (1kg)	KH000375	ANH DANH - GÀ TRE - VÔ NHIỄM 4K	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	320000.00	0.00	0.00	320000.00	640000.00	0.00	0.00	2025-07-30 01:20:34.120072	877
1722	154	1856	HD005197.02	SP000667	MG REVIVAL LIQUID (lít)	KH000395	ANH QUẢNG - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:34.120072	859
1723	154	1857	HD005197.02	SP000666	MG DICLASOL (lít)	KH000395	ANH QUẢNG - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	850000.00	0.00	0.00	850000.00	850000.00	0.00	0.00	2025-07-30 01:20:34.120072	859
1724	154	1714	HD005197.02	SP000091	AGR BMD WSP (1Kg)	KH000395	ANH QUẢNG - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	2600000.00	0.00	0.00	2600000.00	2600000.00	0.00	0.00	2025-07-30 01:20:34.120072	859
1725	155	1874	HD005196	SP000649	MG VIR 220 2000ds (TẢ)	KH000354	ANH ĐEN - GÀ - VÔ NHIỄM 2K	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	260000.00	0.00	0.00	260000.00	260000.00	0.00	0.00	2025-07-30 01:20:34.120072	898
1726	156	1680	HD005195.02	SP000126	AGR ANTISEPTIC (5lit)	KH000418	ANH KHÁNH - TAM HOÀNG - SOKLU 2	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:34.120072	836
1727	157	1635	HD005194	SP000173	#TEMBUSU CHẾT (250ml)	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	400000.00	0.00	0.00	400000.00	2800000.00	0.00	0.00	2025-07-30 01:20:34.120072	889
1728	158	1942	HD005193	SP000578	#DỊCH TẢ HANVET	KH000002	TRUNG - BƯU ĐIỆN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	70000.00	0.00	0.00	70000.00	280000.00	0.00	0.00	2025-07-30 01:20:34.120072	1217
1729	159	1680	HD005192	SP000126	AGR ANTISEPTIC (5lit)	KH0000019	ANH PHONG - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:34.120072	1211
1730	160	1689	HD005191	SP000117	AGR HERBAL OIL (1lit)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	550000.00	0.00	0.00	550000.00	2200000.00	0.00	0.00	2025-07-30 01:20:34.120072	1176
1731	161	1869	HD005190	SP000654	MG MEGA - KC	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	110000.00	0.00	0.00	110000.00	220000.00	0.00	0.00	2025-07-30 01:20:34.120072	909
1732	162	1640	HD005189.01	SP000168	#DỊCH TẢ VỊT-NAVETCO (1000DS)	KH000222	CÔ NGA VỊT - SUỐI NHO	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	60000.00	0.00	0.00	60000.00	600000.00	0.00	0.00	2025-07-30 01:20:34.120072	1025
1733	162	1626	HD005189.01	SP000182	CEFOTAXIM (Bột 2g)	KH000222	CÔ NGA VỊT - SUỐI NHO	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				140.00	25000.00	0.00	0.00	25000.00	3500000.00	0.00	0.00	2025-07-30 01:20:34.120072	1025
1734	163	1737	HD005188	SP000067	AGR AVITOXIN (1lit)	KH000335	ANH VŨ CÁM ODON	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	450000.00	0.00	0.00	450000.00	1350000.00	0.00	0.00	2025-07-30 01:20:34.120072	917
1735	164	1512	HD005187	SP000301	VV AMOXIN 50 WSP (1Kg)	KH000007	CHÚ PHƯỚC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	700000.00	0.00	0.00	700000.00	3500000.00	0.00	0.00	2025-07-30 01:20:34.120072	1221
1736	165	1593	HD005186	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000180	CHỊ HƯƠNG-THÀNH AN	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	115000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	115000.00	0.00	0.00	115000.00	115000.00	0.00	0.00	2025-07-30 01:20:34.120072	1062
1737	166	1881	HD005185	SP000642	TYLOSIN 750g	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	1050000.00	0.00	0.00	1050000.00	5250000.00	0.00	0.00	2025-07-30 01:20:34.120072	876
1738	166	1615	HD005185	SP000193	#MAX 5CLON30 (5000DS)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.861	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	540000.00	0.00	0.00	540000.00	1080000.00	0.00	0.00	2025-07-30 01:20:34.120072	876
1739	167	1590	HD005184	SP000218	#TG IBD M+ (1000DS)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:34.120072	1057
1740	168	1681	HD005183	SP000125	AGR ANTISEPTIC (1lit)	KH000195	EM HOÀNG AGRIVIET	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1155000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	165000.00	0.00	0.00	165000.00	1155000.00	0.00	0.00	2025-07-30 01:20:34.120072	1050
1741	168	1725	HD005183	SP000080	AGR AMOXICOL POWDER (1Kg)	KH000195	EM HOÀNG AGRIVIET	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	8500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	850000.00	0.00	0.00	850000.00	8500000.00	0.00	0.00	2025-07-30 01:20:34.120072	1050
1742	168	1803	HD005183	SP000721	AGR AVIMINO (kg)	KH000195	EM HOÀNG AGRIVIET	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1715000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	245000.00	0.00	0.00	245000.00	1715000.00	0.00	0.00	2025-07-30 01:20:34.120072	1050
1743	168	1704	HD005183	SP000101	AGR SUPPER MEAT (2lit)	KH000195	EM HOÀNG AGRIVIET	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	285000.00	0.00	0.00	285000.00	3420000.00	0.00	0.00	2025-07-30 01:20:34.120072	1050
1744	168	1683	HD005183	SP000123	AGR SEPTICA (1lit)	KH000195	EM HOÀNG AGRIVIET	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	504000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	72000.00	0.00	0.00	72000.00	504000.00	0.00	0.00	2025-07-30 01:20:34.120072	1050
1745	169	1526	HD005182	SP000285	VV BROMHEXIN WSP(1Kg)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	100000.00	0.00	0.00	100000.00	1000000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1746	170	1590	HD005181	SP000218	#TG IBD M+ (1000DS)	KH000417	EM HẢI - TÂN PHÚ	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2472000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	206000.00	0.00	0.00	206000.00	2472000.00	0.00	0.00	2025-07-30 01:20:34.120072	837
1747	170	1591	HD005181	SP000217	#TG IBD M+ (2000DS)	KH000417	EM HẢI - TÂN PHÚ	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	292000.00	0.00	0.00	292000.00	2920000.00	0.00	0.00	2025-07-30 01:20:34.120072	837
1748	171	1475	HD005180	SP000339	VV DOXI TAV 50 (1Kg)	KH0000027	ANH HỌC	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1700000.00	0.00	0.00	1700000.00	3400000.00	0.00	0.00	2025-07-30 01:20:34.120072	1204
1749	172	1699	HD005179	SP000107	AGR LIVERSOL (1lit)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	120000.00	0.00	0.00	120000.00	1920000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1750	172	1497	HD005179	SP000317	VV TILMI 250 ORAL (1Lit)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	800000.00	0.00	0.00	800000.00	1600000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1751	173	1742	HD005178.02	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	350000.00	0.00	0.00	350000.00	1400000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1752	173	1836	HD005178.02	SP000688	KHÁNG THỂ NẮP XANH	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	160000.00	0.00	0.00	160000.00	800000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1753	173	2078	HD005178.02	SP000435	VV CHYMOSIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	100000.00	0.00	0.00	100000.00	500000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1754	173	1546	HD005178.02	SP000263	VV LINCO-SPEC INJ (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	120000.00	0.00	0.00	120000.00	600000.00	0.00	0.00	2025-07-30 01:20:34.120072	1189
1755	174	1581	HD005177	SP000227	#TG CORYZA LE (500ml)	KH000317	CÔ THẢO - GÀ ĐẺ  - ĐỨC HUY 12K	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	1050000.00	0.00	0.00	1050000.00	4200000.00	0.00	0.00	2025-07-30 01:20:34.120072	934
1756	175	1591	HD005176	SP000217	#TG IBD M+ (2000DS)	KH000300	ANH LÂM  FIVEVET	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	292000.00	0.00	0.00	292000.00	2920000.00	0.00	0.00	2025-07-30 01:20:34.120072	950
1757	176	1637	HD005175	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	110000.00	0.00	0.00	110000.00	1210000.00	0.00	0.00	2025-07-30 01:20:34.120072	1135
1758	176	1547	HD005175	SP000262	VV CEFAXIM (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	270000.00	0.00	0.00	270000.00	5400000.00	0.00	0.00	2025-07-30 01:20:34.343778	1135
1759	177	1750	HD005174	SP000054	AGR GENTACIN (100ml)	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	100000.00	0.00	0.00	100000.00	800000.00	0.00	0.00	2025-07-30 01:20:34.343778	1023
1760	177	1955	HD005174	SP000565	#CÚM H5 + H9 (250ml)	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	200000.00	0.00	0.00	200000.00	4000000.00	0.00	0.00	2025-07-30 01:20:34.343778	1023
1761	178	1891	HD005173	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	80000.00	0.00	0.00	80000.00	480000.00	0.00	0.00	2025-07-30 01:20:34.343778	945
1762	178	1525	HD005173	SP000286	VV PARA 10WSP (1Kg)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	100000.00	0.00	0.00	100000.00	300000.00	0.00	0.00	2025-07-30 01:20:34.343778	945
1763	178	1522	HD005173	SP000289	VV AMOXICOL 20 W.S.P (1Kg)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:34.343778	945
1764	178	1706	HD005173	SP000099	AGR SORBIMIN (5lit)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:34.343778	945
1765	178	1447	HD005173	SP000368	TC LACTIZYM CAO TỎI (Kg)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	100000.00	0.00	0.00	100000.00	300000.00	0.00	0.00	2025-07-30 01:20:34.343778	945
1766	178	1709	HD005173	SP000096	AGR ALL-LYTE (5Kg)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:34.343778	945
1767	178	1860	HD005173	SP000663	MG ESCENT S (kg)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:34.343778	945
1768	178	1634	HD005173	SP000174	#RỤT MỎ SINDER (250ml)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	150000.00	0.00	0.00	150000.00	1650000.00	0.00	0.00	2025-07-30 01:20:34.343778	945
1769	178	1639	HD005173	SP000169	#REO VIRUT (500DS)	KH000305	ANH TÂM ( NHÀ) - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	150000.00	0.00	0.00	150000.00	1650000.00	0.00	0.00	2025-07-30 01:20:34.343778	945
1770	179	1728	HD005172.01	SP000077	AGR TRIMETHOSOL (1lit)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	11900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	850000.00	0.00	0.00	850000.00	11900000.00	0.00	0.00	2025-07-30 01:20:34.343778	1080
1771	180	1755	HD005171	SP000049	#AGR POX (1000DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	880000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	220000.00	0.00	0.00	220000.00	880000.00	0.00	0.00	2025-07-30 01:20:34.343778	1080
1772	180	1759	HD005171	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2340000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				13.00	180000.00	0.00	0.00	180000.00	2340000.00	0.00	0.00	2025-07-30 01:20:34.343778	1080
1773	181	1587	HD005170	SP000221	#TG POX (1000DS)	KH0000066	CÔ THỌ - GÀ TA - SUỐI NHO	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	220000.00	0.00	0.00	220000.00	1100000.00	0.00	0.00	2025-07-30 01:20:34.343778	1168
1774	182	1541	HD005169.01	SP000268	VV ANALGIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	35000.00	0.00	0.00	35000.00	280000.00	0.00	0.00	2025-07-30 01:20:34.343778	1189
1775	182	1740	HD005169.01	SP000064	AGR CHYPSIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	110000.00	0.00	0.00	110000.00	440000.00	0.00	0.00	2025-07-30 01:20:34.343778	1189
1776	182	1836	HD005169.01	SP000688	KHÁNG THỂ NẮP XANH	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1760000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	160000.00	0.00	0.00	160000.00	1760000.00	0.00	0.00	2025-07-30 01:20:34.343778	1189
1777	182	1742	HD005169.01	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	350000.00	0.00	0.00	350000.00	1400000.00	0.00	0.00	2025-07-30 01:20:34.343778	1189
1778	183	1521	HD005168	SP000290	VV ENROVET ORAL (1Lit)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:34.343778	1203
1779	184	1521	HD005167.01	SP000290	VV ENROVET ORAL (1Lit)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	500000.00	0.00	0.00	500000.00	6000000.00	0.00	0.00	2025-07-30 01:20:34.343778	1203
1780	184	1549	HD005167.01	SP000260	VV CEFTI-S (250ml)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	290000.00	0.00	0.00	290000.00	5800000.00	0.00	0.00	2025-07-30 01:20:34.343778	1203
1781	185	1874	HD005165	SP000649	MG VIR 220 2000ds (TẢ)	KH000354	ANH ĐEN - GÀ - VÔ NHIỄM 2K	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	260000.00	0.00	0.00	260000.00	260000.00	0.00	0.00	2025-07-30 01:20:34.343778	898
1782	186	1701	HD005164	SP000105	AGR BCOMPLEX C (1Kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	120000.00	0.00	0.00	120000.00	1200000.00	0.00	0.00	2025-07-30 01:20:34.343778	1176
1783	187	1525	HD005163.01	SP000286	VV PARA 10WSP (1Kg)	KH000416	ANH LÂM - TRẠI 5	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	100000.00	0.00	0.00	100000.00	500000.00	0.00	0.00	2025-07-30 01:20:34.343778	838
1784	187	1879	HD005163.01	SP000644	VV VITAMIN K3 0,5% (1Kg) 10:1	KH000416	ANH LÂM - TRẠI 5	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:34.343778	838
1785	187	1726	HD005163.01	SP000079	AGR ENROSOL 20 (1lit)	KH000416	ANH LÂM - TRẠI 5	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:34.343778	838
1786	187	1706	HD005163.01	SP000099	AGR SORBIMIN (5lit)	KH000416	ANH LÂM - TRẠI 5	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:34.343778	838
1787	187	1709	HD005163.01	SP000096	AGR ALL-LYTE (5Kg)	KH000416	ANH LÂM - TRẠI 5	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:34.343778	838
1788	187	1702	HD005163.01	SP000104	AGR BUTAPHOS B12 (1lit)	KH000416	ANH LÂM - TRẠI 5	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:34.343778	838
1789	187	1445	HD005163.01	SP000370	TC BIO LAC PLUS MAX (Hộp 1Kg)	KH000416	ANH LÂM - TRẠI 5	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	380000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	380000.00	0.00	0.00	380000.00	380000.00	0.00	0.00	2025-07-30 01:20:34.343778	838
1790	187	1807	HD005163.01	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000416	ANH LÂM - TRẠI 5	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:34.343778	838
1791	188	1507	HD005162	SP000306	VV DOXICLIN 50 WSP (1Kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1200000.00	0.00	0.00	1200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:34.343778	1032
1792	188	1505	HD005162	SP000308	VV FLOCOL 50 WSP (1Kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1200000.00	0.00	0.00	1200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:34.343778	1032
1793	189	1836	HD005161	SP000688	KHÁNG THỂ NẮP XANH	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	175000.00	0.00	0.00	175000.00	1750000.00	0.00	0.00	2025-07-30 01:20:34.343778	1092
1794	189	2078	HD005161	SP000435	VV CHYMOSIN (100ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	100000.00	0.00	0.00	100000.00	700000.00	0.00	0.00	2025-07-30 01:20:34.343778	1092
1795	189	1541	HD005161	SP000268	VV ANALGIN (100ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	245000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	35000.00	0.00	0.00	35000.00	245000.00	0.00	0.00	2025-07-30 01:20:34.343778	1092
1796	189	1742	HD005161	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	350000.00	0.00	0.00	350000.00	2450000.00	0.00	0.00	2025-07-30 01:20:34.343778	1092
1797	190	1673	HD005160	SP000134	VAC PAC PLUS (5g)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	30000.00	0.00	0.00	30000.00	300000.00	0.00	0.00	2025-07-30 01:20:34.343778	1183
1798	190	1623	HD005160	SP000185	#SCOCVAC 4( TQ)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	13650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				21.00	650000.00	0.00	0.00	650000.00	13650000.00	0.00	0.00	2025-07-30 01:20:34.343778	1183
1799	191	1875	HD005159.01	SP000648	MG VIR 220 1000ds ( TẢ )	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:34.343778	857
1800	191	1874	HD005159.01	SP000649	MG VIR 220 2000ds (TẢ)	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	260000.00	0.00	0.00	260000.00	260000.00	0.00	0.00	2025-07-30 01:20:34.343778	857
1801	192	1505	HD005158	SP000308	VV FLOCOL 50 WSP (1Kg)	KH000243	THUỲ TRANG	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	745000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	745000.00	0.00	0.00	745000.00	745000.00	0.00	0.00	2025-07-30 01:20:34.343778	1006
1802	193	1956	HD005157	SP000564	AGR FLUCAL 150 (1 lít)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:34.343778	1122
1803	193	1504	HD005157	SP000309	VV FLOCOL 50 WSP (100g)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	120000.00	0.00	0.00	120000.00	240000.00	0.00	0.00	2025-07-30 01:20:34.343778	1122
1804	194	2089	HD005156	SP000422	OXYTIN(10G)-ÚM GIA CẦM	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:34.343778	1057
1805	195	1942	HD005155.01	SP000578	#DỊCH TẢ HANVET	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	60000.00	0.00	0.00	60000.00	240000.00	0.00	0.00	2025-07-30 01:20:34.343778	987
1806	195	1634	HD005155.01	SP000174	#RỤT MỎ SINDER (250ml)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	880000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	110000.00	0.00	0.00	110000.00	880000.00	0.00	0.00	2025-07-30 01:20:34.343778	987
1807	196	1585	HD005154	SP000223	#TG AI H9 (500ml)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	1100000.00	0.00	0.00	1100000.00	4400000.00	0.00	0.00	2025-07-30 01:20:34.343778	1203
1808	197	2079	HD005153	SP000434	CƯỚC XE	KH000307	THÚ Y ĐÌNH HIỀN	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	50000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	50000.00	0.00	0.00	50000.00	50000.00	0.00	0.00	2025-07-30 01:20:34.568303	943
1809	197	1584	HD005153	SP000224	#TG TẢ + CÚM (500ml)	KH000307	THÚ Y ĐÌNH HIỀN	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	970000.00	0.00	0.00	970000.00	4850000.00	0.00	0.00	2025-07-30 01:20:34.568303	943
1810	198	1942	HD005152	SP000578	#DỊCH TẢ HANVET	KH0000037	ANH DŨNG - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	70000.00	0.00	0.00	70000.00	840000.00	0.00	0.00	2025-07-30 01:20:34.568303	1194
1811	198	1622	HD005152	SP000186	#CIRCO (2000DS)	KH0000037	ANH DŨNG - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	350000.00	0.00	0.00	350000.00	2100000.00	0.00	0.00	2025-07-30 01:20:34.568303	1194
1812	199	1473	HD005151	SP000341	VV AMPRO-TAV 20% (1Lit)	KH000347	ANH DUY - PHƯƠNG LÂM	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	650000.00	0.00	0.00	650000.00	2600000.00	0.00	0.00	2025-07-30 01:20:34.568303	905
1813	200	1865	HD005150	SP000658	AGR CORYZA 3	KH0000105	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.86	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1200000.00	0.00	0.00	1200000.00	3600000.00	0.00	0.00	2025-07-30 01:20:34.568303	1134
1814	201	1522	HD005149	SP000289	VV AMOXICOL 20 W.S.P (1Kg)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:34.568303	840
1815	202	1628	HD005148	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH000370	ANH PHONG - CTY GREENTECH	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	210000.00	0.00	0.00	210000.00	2520000.00	0.00	0.00	2025-07-30 01:20:34.568303	882
1816	203	1834	HD005147	SP000690	MEGA-TICOSIN	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1300000.00	0.00	0.00	1300000.00	1300000.00	0.00	0.00	2025-07-30 01:20:34.568303	862
1817	203	1848	HD005147	SP000676	MG DOXY-VM (kg) hộp	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	2000000.00	0.00	0.00	2000000.00	2000000.00	0.00	0.00	2025-07-30 01:20:34.568303	862
1818	204	2024	HD005146.01	SP000490	AGR - AVICAP (5 lít)	KH000408	ANH KHÔI	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	850000.00	0.00	0.00	850000.00	850000.00	0.00	0.00	2025-07-30 01:20:34.568303	846
1819	204	1703	HD005146.01	SP000103	AGR MULTIVIT (1Kg)	KH000408	ANH KHÔI	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	220000.00	0.00	0.00	220000.00	2200000.00	0.00	0.00	2025-07-30 01:20:34.568303	846
1820	205	1775	HD005145	SP000012	NOVAVETER PARADOL K,C (1Kg)	KH000385	QUYỀN - TAM HOÀNG LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	160000.00	0.00	0.00	160000.00	800000.00	0.00	0.00	2025-07-30 01:20:34.568303	868
1821	206	1627	HD005144	SP000181	#ND-IB-H9 (250ml)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	12600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				28.00	450000.00	0.00	0.00	450000.00	12600000.00	0.00	0.00	2025-07-30 01:20:34.568303	923
1822	207	1504	HD005143	SP000309	VV FLOCOL 50 WSP (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:34.568303	1057
1823	207	1593	HD005143	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:34.568303	1057
1824	207	1737	HD005143	SP000067	AGR AVITOXIN (1lit)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:34.568303	1057
1825	207	1506	HD005143	SP000307	VV DOXICLIN 50 WSP (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:34.568303	1057
1826	208	1869	HD005142	SP000654	MG MEGA - KC	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	110000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	110000.00	0.00	0.00	110000.00	110000.00	0.00	0.00	2025-07-30 01:20:34.568303	909
1827	209	1547	HD005141	SP000262	VV CEFAXIM (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	270000.00	0.00	0.00	270000.00	5400000.00	0.00	0.00	2025-07-30 01:20:34.568303	1135
1828	210	2085	HD005140.01	SP000427	#INTERFRON(100ML)	KH000415	CHÚ PHƯỚC VỊNH - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	280000.00	0.00	0.00	280000.00	560000.00	0.00	0.00	2025-07-30 01:20:34.568303	839
1829	210	1836	HD005140.01	SP000688	KHÁNG THỂ NẮP XANH	KH000415	CHÚ PHƯỚC VỊNH - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	140000.00	0.00	0.00	140000.00	2240000.00	0.00	0.00	2025-07-30 01:20:34.568303	839
1830	211	1942	HD005139	SP000578	#DỊCH TẢ HANVET	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	70000.00	0.00	0.00	70000.00	210000.00	0.00	0.00	2025-07-30 01:20:34.568303	1209
1831	211	1637	HD005139	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1050000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	350000.00	0.00	0.00	350000.00	1050000.00	0.00	0.00	2025-07-30 01:20:34.568303	1209
1832	212	1827	HD005138	SP000697	MISTRAL (BỘT ÚM) kg	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				40.00	40000.00	0.00	0.00	40000.00	1600000.00	0.00	0.00	2025-07-30 01:20:34.568303	1048
1833	212	2053	HD005138	SP000461	HAN - PROST	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	120000.00	0.00	0.00	120000.00	600000.00	0.00	0.00	2025-07-30 01:20:34.568303	1048
1834	212	1793	HD005138	SP000731	VIRBAC-CALGOPHOS (5 LÍT)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	960000.00	0.00	0.00	960000.00	960000.00	0.00	0.00	2025-07-30 01:20:34.568303	1048
1835	212	1830	HD005138	SP000694	METRIL-ORAL	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	75000.00	0.00	0.00	75000.00	750000.00	0.00	0.00	2025-07-30 01:20:34.568303	1048
1836	213	2094	HD005137	SP000414	AMOXICOL 20% (100G)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	60000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	60000.00	0.00	0.00	60000.00	60000.00	0.00	0.00	2025-07-30 01:20:34.568303	1057
1837	214	1628	HD005136	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH000010	KHẢI HAIDER - BÀU CẠN	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	9200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				40.00	230000.00	0.00	0.00	230000.00	9200000.00	0.00	0.00	2025-07-30 01:20:34.568303	1224
1838	215	1750	HD005135	SP000054	AGR GENTACIN (100ml)	KH0000018	KHẢI 8.500 CON - XUYÊN MỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1275000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	85000.00	0.00	0.00	85000.00	1275000.00	0.00	0.00	2025-07-30 01:20:34.568303	1212
1839	215	1626	HD005135	SP000182	CEFOTAXIM (Bột 2g)	KH0000018	KHẢI 8.500 CON - XUYÊN MỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2875000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				115.00	25000.00	0.00	0.00	25000.00	2875000.00	0.00	0.00	2025-07-30 01:20:34.568303	1212
1840	216	1836	HD005134	SP000688	KHÁNG THỂ NẮP XANH	KH0000036	ANH PHONG - SUỐI ĐÁ 2	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	160000.00	0.00	0.00	160000.00	1920000.00	0.00	0.00	2025-07-30 01:20:34.568303	1195
1841	216	1547	HD005134	SP000262	VV CEFAXIM (250ml)	KH0000036	ANH PHONG - SUỐI ĐÁ 2	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	290000.00	0.00	0.00	290000.00	5800000.00	0.00	0.00	2025-07-30 01:20:34.568303	1195
1842	217	1893	HD005133	SP000630	AGR PHOSRENOL (1 kg)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	560000.00	0.00	0.00	560000.00	1120000.00	0.00	0.00	2025-07-30 01:20:34.568303	1080
1843	217	1718	HD005133	SP000087	AGR NYSTATIN (1Kg)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	13560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				60.00	226000.00	0.00	0.00	226000.00	13560000.00	0.00	0.00	2025-07-30 01:20:34.568303	1080
1844	218	1730	HD005132	SP000074	AGR SELKO®-4 HEALTH (1lit)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:34.568303	1080
1845	218	1721	HD005132	SP000084	AGR DICLAZU PLUS (1lit)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	650000.00	0.00	0.00	650000.00	1300000.00	0.00	0.00	2025-07-30 01:20:34.568303	1080
1846	219	1630	HD005131	SP000178	#CÚM AVAC RE5 (250ml)	KH000347	ANH DUY - PHƯƠNG LÂM	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				17.00	200000.00	0.00	0.00	200000.00	3400000.00	0.00	0.00	2025-07-30 01:20:34.568303	905
1847	219	1942	HD005131	SP000578	#DỊCH TẢ HANVET	KH000347	ANH DUY - PHƯƠNG LÂM	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	630000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	70000.00	0.00	0.00	70000.00	630000.00	0.00	0.00	2025-07-30 01:20:34.568303	905
1848	220	1836	HD005130	SP000688	KHÁNG THỂ NẮP XANH	KH000253	ANH PHONG - SUỐI ĐÁ 3	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	160000.00	0.00	0.00	160000.00	480000.00	0.00	0.00	2025-07-30 01:20:34.568303	996
1849	220	1547	HD005130	SP000262	VV CEFAXIM (250ml)	KH000253	ANH PHONG - SUỐI ĐÁ 3	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	870000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	290000.00	0.00	0.00	290000.00	870000.00	0.00	0.00	2025-07-30 01:20:34.568303	996
1850	221	1547	HD005129	SP000262	VV CEFAXIM (250ml)	KH000187	ANH PHONG - SUỐI ĐÁ 1	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2030000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	290000.00	0.00	0.00	290000.00	2030000.00	0.00	0.00	2025-07-30 01:20:34.568303	1058
1851	221	1836	HD005129	SP000688	KHÁNG THỂ NẮP XANH	KH000187	ANH PHONG - SUỐI ĐÁ 1	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	160000.00	0.00	0.00	160000.00	1440000.00	0.00	0.00	2025-07-30 01:20:34.568303	1058
1852	222	1859	HD005128	SP000664	MG FLOR-VM 30% (lít)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1400000.00	0.00	0.00	1400000.00	2800000.00	0.00	0.00	2025-07-30 01:20:34.568303	906
1853	222	1856	HD005128	SP000667	MG REVIVAL LIQUID (lít)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	500000.00	0.00	0.00	500000.00	1000000.00	0.00	0.00	2025-07-30 01:20:34.568303	906
1854	222	1848	HD005128	SP000676	MG DOXY-VM (kg) hộp	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	2000000.00	0.00	0.00	2000000.00	2000000.00	0.00	0.00	2025-07-30 01:20:34.568303	906
1855	223	1709	HD005127.01	SP000096	AGR ALL-LYTE (5Kg)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:34.568303	1183
1856	223	1447	HD005127.01	SP000368	TC LACTIZYM CAO TỎI (Kg)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	100000.00	0.00	0.00	100000.00	1000000.00	0.00	0.00	2025-07-30 01:20:34.568303	1183
1857	223	1807	HD005127.01	SP000717	TAV-STRESS LYTE PLUS (kg)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	0.00	250000.00	2500000.00	0.00	0.00	2025-07-30 01:20:34.568303	1183
1858	223	1730	HD005127.01	SP000074	AGR SELKO®-4 HEALTH (1lit)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	250000.00	0.00	0.00	250000.00	1250000.00	0.00	0.00	2025-07-30 01:20:34.816252	1183
1859	223	1706	HD005127.01	SP000099	AGR SORBIMIN (5lit)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	650000.00	0.00	0.00	650000.00	1300000.00	0.00	0.00	2025-07-30 01:20:34.816252	1183
1860	223	1726	HD005127.01	SP000079	AGR ENROSOL 20 (1lit)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	500000.00	0.00	0.00	500000.00	1000000.00	0.00	0.00	2025-07-30 01:20:34.816252	1183
1861	223	1512	HD005127.01	SP000301	VV AMOXIN 50 WSP (1Kg)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	700000.00	0.00	0.00	700000.00	3500000.00	0.00	0.00	2025-07-30 01:20:34.816252	1183
1862	223	1522	HD005127.01	SP000289	VV AMOXICOL 20 W.S.P (1Kg)	KH0000049	ANH CU - TAM HOÀNG HƯNG LỘC	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	500000.00	0.00	0.00	500000.00	2500000.00	0.00	0.00	2025-07-30 01:20:34.816252	1183
1863	224	1647	HD005126	SP000161	#TABIC M.B (2000DS)	KH0000050	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	450000.00	0.00	0.00	450000.00	3150000.00	0.00	0.00	2025-07-30 01:20:34.816252	1182
1864	225	1760	HD005125	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH0000061	CHỊ TRANG-TAM HOÀNG-NAGOA	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	280000.00	0.00	0.00	280000.00	1400000.00	0.00	0.00	2025-07-30 01:20:34.816252	1172
1865	226	1760	HD005124	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:34.816252	1122
1866	227	1755	HD005123.01	SP000049	#AGR POX (1000DS)	KH000124	ANH HƯNG - GÀ - SUỐI ĐÁ	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	220000.00	0.00	0.00	220000.00	2200000.00	0.00	0.00	2025-07-30 01:20:34.816252	1117
1867	227	1584	HD005123.01	SP000224	#TG TẢ + CÚM (500ml)	KH000124	ANH HƯNG - GÀ - SUỐI ĐÁ	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	16900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				13.00	1300000.00	0.00	0.00	1300000.00	16900000.00	0.00	0.00	2025-07-30 01:20:34.816252	1117
1868	228	1628	HD005122	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.859	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	0.00	250000.00	2500000.00	0.00	0.00	2025-07-30 01:20:34.816252	992
1869	229	1714	HD005121	SP000091	AGR BMD WSP (1Kg)	KH000395	ANH QUẢNG - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	2600000.00	0.00	0.00	2600000.00	2600000.00	0.00	0.00	2025-07-30 01:20:34.816252	859
1870	230	1439	HD005120.01	SP000376	XI LANH KANGDA (1ml)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	230000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	230000.00	0.00	0.00	230000.00	230000.00	0.00	0.00	2025-07-30 01:20:34.816252	1057
1871	230	1431	HD005120.01	SP000384	KIM 12x13 (Vỉ)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:34.816252	1057
1872	231	1577	HD005119	SP000231	TG DICLASOL HI (1lit)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10024000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	716000.00	0.00	0.00	716000.00	10024000.00	0.00	0.00	2025-07-30 01:20:34.816252	1026
1873	232	2037	HD005118	SP000477	thuốc chích	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	20000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	20000.00	0.00	0.00	20000.00	20000.00	0.00	0.00	2025-07-30 01:20:34.816252	1057
1874	232	1864	HD005118	SP000659	VV FLODOXY 30 (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:34.816252	1057
1875	233	1635	HD005117	SP000173	#TEMBUSU CHẾT (250ml)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	400000.00	0.00	80000.00	320000.00	2560000.00	0.00	0.00	2025-07-30 01:20:34.816252	987
1876	234	2094	HD005116	SP000414	AMOXICOL 20% (100G)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	50000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	50000.00	0.00	0.00	50000.00	50000.00	0.00	0.00	2025-07-30 01:20:34.816252	1057
1877	235	1850	HD005115	SP000674	MG VILLI SUPPORT L (lít)	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:34.816252	909
1878	235	1856	HD005115	SP000667	MG REVIVAL LIQUID (lít)	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	500000.00	0.00	0.00	500000.00	1000000.00	0.00	0.00	2025-07-30 01:20:34.816252	909
1879	236	1476	HD005114	SP000338	VV SULTRIM 50 TAV (1Kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1400000.00	0.00	0.00	1400000.00	1400000.00	0.00	0.00	2025-07-30 01:20:34.816252	1032
1880	237	1507	HD005113	SP000306	VV DOXICLIN 50 WSP (1Kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1200000.00	0.00	0.00	1200000.00	2400000.00	0.00	0.00	2025-07-30 01:20:34.816252	1226
1881	237	1505	HD005113	SP000308	VV FLOCOL 50 WSP (1Kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1200000.00	0.00	0.00	1200000.00	2400000.00	0.00	0.00	2025-07-30 01:20:34.816252	1226
1882	238	1590	HD005111	SP000218	#TG IBD M+ (1000DS)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	210000.00	0.00	0.00	210000.00	210000.00	0.00	0.00	2025-07-30 01:20:34.816252	1180
1883	238	1591	HD005111	SP000217	#TG IBD M+ (2000DS)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	360000.00	0.00	0.00	360000.00	1800000.00	0.00	0.00	2025-07-30 01:20:34.816252	1180
1884	239	1759	HD005110	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:34.816252	923
1885	239	1886	HD005110	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	480000.00	0.00	0.00	480000.00	4320000.00	0.00	0.00	2025-07-30 01:20:34.816252	923
1886	240	1525	HD005109	SP000286	VV PARA 10WSP (1Kg)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	100000.00	0.00	0.00	100000.00	300000.00	0.00	0.00	2025-07-30 01:20:34.816252	993
1887	240	1634	HD005109	SP000174	#RỤT MỎ SINDER (250ml)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	150000.00	0.00	0.00	150000.00	1650000.00	0.00	0.00	2025-07-30 01:20:34.816252	993
1888	240	1638	HD005109	SP000170	#REO VIRUT (1000DS)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	250000.00	0.00	0.00	250000.00	1500000.00	0.00	0.00	2025-07-30 01:20:34.816252	993
1889	240	1702	HD005109	SP000104	AGR BUTAPHOS B12 (1lit)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	280000.00	0.00	0.00	280000.00	840000.00	0.00	0.00	2025-07-30 01:20:34.816252	993
1890	240	1492	HD005109	SP000322	VV FLOR-MAX (1Lit)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.858	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:34.816252	993
1891	241	1584	HD005108	SP000224	#TG TẢ + CÚM (500ml)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	15600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	1300000.00	0.00	0.00	1300000.00	15600000.00	0.00	0.00	2025-07-30 01:20:34.816252	1026
1892	242	1871	HD005107	SP000652	MG VIR 101 1000ds (ILT)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	240000.00	0.00	0.00	240000.00	960000.00	0.00	0.00	2025-07-30 01:20:34.816252	1165
1893	243	1850	HD005106	SP000674	MG VILLI SUPPORT L (lít)	KH000412	ANH THẾ - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:34.816252	842
1894	243	1862	HD005106	SP000661	MEGA VIT (1kg)	KH000412	ANH THẾ - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	110000.00	0.00	0.00	110000.00	220000.00	0.00	0.00	2025-07-30 01:20:34.816252	842
1895	244	1639	HD005105	SP000169	#REO VIRUT (500DS)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	150000.00	0.00	0.00	150000.00	2100000.00	0.00	0.00	2025-07-30 01:20:34.816252	840
1896	244	1634	HD005105	SP000174	#RỤT MỎ SINDER (250ml)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	150000.00	0.00	0.00	150000.00	2100000.00	0.00	0.00	2025-07-30 01:20:34.816252	840
1897	244	1891	HD005105	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	80000.00	0.00	0.00	80000.00	560000.00	0.00	0.00	2025-07-30 01:20:34.816252	840
1898	245	2094	HD005104	SP000414	AMOXICOL 20% (100G)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	50000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	50000.00	0.00	0.00	50000.00	50000.00	0.00	0.00	2025-07-30 01:20:34.816252	1057
1915	257	1549	HD005092	SP000260	VV CEFTI-S (250ml)	KH0000042	CHỊ QUYÊN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	290000.00	0.00	0.00	290000.00	5800000.00	0.00	0.00	2025-07-30 01:20:35.070314	1190
1899	246	1547	HD005103	SP000262	VV CEFAXIM (250ml)	KH000212	CHỊ DUNG - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	290000.00	0.00	0.00	290000.00	2900000.00	0.00	0.00	2025-07-30 01:20:34.816252	1034
1900	247	1893	HD005102	SP000630	AGR PHOSRENOL (1 kg)	KH000332	KHÁNH EMIVET	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	660000.00	0.00	0.00	660000.00	660000.00	0.00	0.00	2025-07-30 01:20:34.816252	920
1901	248	1490	HD005101.01	SP000324	VV SULTRIM (1Kg)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	700000.00	0.00	0.00	700000.00	700000.00	0.00	0.00	2025-07-30 01:20:34.816252	852
1902	249	1689	HD005100	SP000117	AGR HERBAL OIL (1lit)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	550000.00	0.00	0.00	550000.00	2200000.00	0.00	0.00	2025-07-30 01:20:34.816252	1176
1903	250	1522	HD005099	SP000289	VV AMOXICOL 20 W.S.P (1Kg)	KH000243	THUỲ TRANG	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	385000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	385000.00	0.00	0.00	385000.00	385000.00	0.00	0.00	2025-07-30 01:20:34.816252	1006
1904	251	1482	HD005098.01	SP000332	VV OXYVET 50 (1Kg)	KH0000076	EM SƠN - ECOVET	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	310000.00	0.00	0.00	310000.00	3100000.00	0.00	0.00	2025-07-30 01:20:34.816252	1159
1905	251	2079	HD005098.01	SP000434	CƯỚC XE	KH0000076	EM SƠN - ECOVET	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	70000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	70000.00	0.00	0.00	70000.00	70000.00	0.00	0.00	2025-07-30 01:20:34.816252	1159
1906	252	1595	HD005097	SP000213	CID 2000 (5lit)	KH000354	ANH ĐEN - GÀ - VÔ NHIỄM 2K	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1100000.00	0.00	0.00	1100000.00	1100000.00	0.00	0.00	2025-07-30 01:20:34.816252	898
1907	253	1622	HD005096	SP000186	#CIRCO (2000DS)	KH000357	CƯỜNG UNITEX	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	270000.00	0.00	0.00	270000.00	1080000.00	0.00	0.00	2025-07-30 01:20:34.816252	895
1908	254	1432	HD005095	SP000383	KIM 9x13 (Vỉ)	KH0000026	TUYẾN DONAVET	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	10000.00	0.00	0.00	10000.00	100000.00	0.00	0.00	2025-07-30 01:20:35.070314	1205
1909	255	1725	HD005094.01	SP000080	AGR AMOXICOL POWDER (1Kg)	KH000195	EM HOÀNG AGRIVIET	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	850000.00	0.00	0.00	850000.00	4250000.00	0.00	0.00	2025-07-30 01:20:35.070314	1050
1910	255	1803	HD005094.01	SP000721	AGR AVIMINO (kg)	KH000195	EM HOÀNG AGRIVIET	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1225000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	245000.00	0.00	0.00	245000.00	1225000.00	0.00	0.00	2025-07-30 01:20:35.070314	1050
1911	255	1683	HD005094.01	SP000123	AGR SEPTICA (1lit)	KH000195	EM HOÀNG AGRIVIET	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	360000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	72000.00	0.00	0.00	72000.00	360000.00	0.00	0.00	2025-07-30 01:20:35.070314	1050
1912	255	1681	HD005094.01	SP000125	AGR ANTISEPTIC (1lit)	KH000195	EM HOÀNG AGRIVIET	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	825000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	165000.00	0.00	0.00	165000.00	825000.00	0.00	0.00	2025-07-30 01:20:35.070314	1050
1913	256	1432	HD005093	SP000383	KIM 9x13 (Vỉ)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:35.070314	1057
1914	257	1541	HD005092	SP000268	VV ANALGIN (100ml)	KH0000042	CHỊ QUYÊN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1050000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				30.00	35000.00	0.00	0.00	35000.00	1050000.00	0.00	0.00	2025-07-30 01:20:35.070314	1190
1916	258	2030	HD005091	SP000484	AGR - FLOCOL ORAL (lít)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:35.070314	1092
1917	259	2030	HD005090.01	SP000484	AGR - FLOCOL ORAL (lít)	KH000149	CHỊ THÚY - BƯU ĐIỆN	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	8500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	850000.00	0.00	0.00	850000.00	8500000.00	0.00	0.00	2025-07-30 01:20:35.070314	1092
1918	260	2070	HD005089	SP000443	VV AMINO PHOSPHORIC-ACID (1kg)	KH000335	ANH VŨ CÁM ODON	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:35.070314	917
1919	261	1636	HD005088	SP000172	#TEMBUSU SỐNG DOBIO (500DS)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	300000.00	0.00	0.00	300000.00	2400000.00	0.00	0.00	2025-07-30 01:20:35.070314	1210
1920	261	1942	HD005088	SP000578	#DỊCH TẢ HANVET	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	70000.00	0.00	0.00	70000.00	280000.00	0.00	0.00	2025-07-30 01:20:35.070314	1210
1921	262	1750	HD005087	SP000054	AGR GENTACIN (100ml)	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	100000.00	0.00	0.00	100000.00	600000.00	0.00	0.00	2025-07-30 01:20:35.070314	1023
1922	262	1628	HD005087	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	250000.00	0.00	0.00	250000.00	3000000.00	0.00	0.00	2025-07-30 01:20:35.070314	1023
1923	263	2083	HD005086	SP000429	#HIPPRAVIAR- SHS	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	205000.00	0.00	0.00	205000.00	4100000.00	0.00	0.00	2025-07-30 01:20:35.070314	1139
1924	263	1616	HD005086	SP000192	#MAX 5CLON30 (2500DS)	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2820000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	235000.00	0.00	0.00	235000.00	2820000.00	0.00	0.00	2025-07-30 01:20:35.070314	1139
1925	263	1617	HD005086	SP000191	#MAX 5CLON30 (1000DS)	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1980000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	165000.00	0.00	0.00	165000.00	1980000.00	0.00	0.00	2025-07-30 01:20:35.070314	1139
1926	263	1614	HD005086	SP000194	#GUMBORO 228E (1000DS)	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2940000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	245000.00	0.00	0.00	245000.00	2940000.00	0.00	0.00	2025-07-30 01:20:35.070314	1139
1927	264	1587	HD005085.01	SP000221	#TG POX (1000DS)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:35.070314	861
1928	265	2073	HD005084	SP000440	#VH + H120 (2000DS)	KH0000053	CÔ LAN ( TUẤN) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.857	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				13.00	280000.00	0.00	0.00	280000.00	3640000.00	0.00	0.00	2025-07-30 01:20:35.070314	1179
1929	266	1871	HD005083	SP000652	MG VIR 101 1000ds (ILT)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	240000.00	0.00	0.00	240000.00	960000.00	0.00	0.00	2025-07-30 01:20:35.070314	1165
1930	267	1482	HD005082	SP000332	VV OXYVET 50 (1Kg)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:35.070314	844
1931	267	1807	HD005082	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:35.070314	844
1932	268	1870	HD005081	SP000653	MG MEGA - GREEN (kg)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	60000.00	0.00	0.00	60000.00	1200000.00	0.00	0.00	2025-07-30 01:20:35.070314	881
2816	740	1847	HD1754246827011	SP000677	#AGR IZOVAC ND-EDS-IB	\N	QUÂN BIOFRAM	1	\N	\N	\N	2025-08-03 18:47:07.765	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	1600000.00	0.00	0.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	1600000.00	0.00	0.00	1600000.00	1600000.00	0.00	0.00	2025-08-03 18:47:06.401424	\N
1933	269	1704	HD005080	SP000101	AGR SUPPER MEAT (2lit)	KH000283	ANH ĐỨC - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:35.070314	967
1934	270	1759	HD005079	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH000408	ANH KHÔI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:35.070314	846
1935	270	1886	HD005079	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH000408	ANH KHÔI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	480000.00	0.00	0.00	480000.00	960000.00	0.00	0.00	2025-07-30 01:20:35.070314	846
1936	271	2023	HD005078	SP000492	TG COLIMOX 500(1KG)(XÁ)	KH000360	ANH HOAN - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:35.070314	892
1937	272	1795	HD005077	SP000729	BUTAFAN 100ml	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				23.00	140000.00	0.00	0.00	140000.00	3220000.00	0.00	0.00	2025-07-30 01:20:35.070314	1026
1938	272	1577	HD005077	SP000231	TG DICLASOL HI (1lit)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	716000.00	0.00	0.00	716000.00	7160000.00	0.00	0.00	2025-07-30 01:20:35.070314	1026
1939	272	1576	HD005077	SP000232	TG SUPER-VITAMINO (1Kg)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				40.00	195000.00	0.00	0.00	195000.00	7800000.00	0.00	0.00	2025-07-30 01:20:35.070314	1026
1940	273	1655	HD005076	SP000152	TOPCIN LINCOPEC 44 (Kg)	KH000238	HẢI - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1050000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1050000.00	0.00	0.00	1050000.00	1050000.00	0.00	0.00	2025-07-30 01:20:35.070314	1011
1941	273	2070	HD005076	SP000443	VV AMINO PHOSPHORIC-ACID (1kg)	KH000238	HẢI - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	420000.00	0.00	0.00	420000.00	2100000.00	0.00	0.00	2025-07-30 01:20:35.070314	1011
1942	274	1498	HD005075	SP000316	VV CFOXIN (100g)	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	150000.00	0.00	0.00	150000.00	900000.00	0.00	0.00	2025-07-30 01:20:35.070314	849
1943	275	1779	HD005074	SP000008	NOVAVETER VITAMINO (5lit)	KH000138	ANH HƯNG - SƠN MAI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1500000.00	0.00	0.00	1500000.00	3000000.00	0.00	0.00	2025-07-30 01:20:35.070314	1102
1944	276	1891	HD005072	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	80000.00	0.00	0.00	80000.00	240000.00	0.00	0.00	2025-07-30 01:20:35.070314	841
1945	276	1638	HD005072	SP000170	#REO VIRUT (1000DS)	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	250000.00	0.00	0.00	250000.00	750000.00	0.00	0.00	2025-07-30 01:20:35.070314	841
1946	276	1634	HD005072	SP000174	#RỤT MỎ SINDER (250ml)	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	150000.00	0.00	0.00	150000.00	900000.00	0.00	0.00	2025-07-30 01:20:35.070314	841
1947	277	1860	HD005071	SP000663	MG ESCENT S (kg)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:35.070314	840
1948	277	1450	HD005071	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	390000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	130000.00	0.00	0.00	130000.00	390000.00	0.00	0.00	2025-07-30 01:20:35.070314	840
1949	277	1709	HD005071	SP000096	AGR ALL-LYTE (5Kg)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:35.070314	840
1950	277	1525	HD005071	SP000286	VV PARA 10WSP (1Kg)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	100000.00	0.00	0.00	100000.00	300000.00	0.00	0.00	2025-07-30 01:20:35.070314	840
1951	277	1504	HD005071	SP000309	VV FLOCOL 50 WSP (100g)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:35.070314	840
1952	277	1706	HD005071	SP000099	AGR SORBIMIN (5lit)	KH000414	ANH TÂM (CÔNG) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:35.070314	840
1953	278	1634	HD005070	SP000174	#RỤT MỎ SINDER (250ml)	KH0000037	ANH DŨNG - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	150000.00	0.00	0.00	150000.00	1800000.00	0.00	0.00	2025-07-30 01:20:35.070314	1194
1954	278	1639	HD005070	SP000169	#REO VIRUT (500DS)	KH0000037	ANH DŨNG - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	150000.00	0.00	0.00	150000.00	1800000.00	0.00	0.00	2025-07-30 01:20:35.070314	1194
1955	279	1891	HD005069	VIÊM GAN HANVET	VIÊM GAN HANVET	KH0000032	ANH HÙNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	80000.00	0.00	0.00	80000.00	160000.00	0.00	0.00	2025-07-30 01:20:35.070314	1199
1956	279	1638	HD005069	SP000170	#REO VIRUT (1000DS)	KH0000032	ANH HÙNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:35.070314	1199
1957	279	1634	HD005069	SP000174	#RỤT MỎ SINDER (250ml)	KH0000032	ANH HÙNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	150000.00	0.00	0.00	150000.00	600000.00	0.00	0.00	2025-07-30 01:20:35.070314	1199
1958	280	1548	HD005068	SP000261	VV CEFTI-S - NEW (250ml)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	390000.00	0.00	0.00	390000.00	7800000.00	0.00	0.00	2025-07-30 01:20:35.374421	1203
1959	281	1856	HD005067.01	SP000667	MG REVIVAL LIQUID (lít)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	550000.00	0.00	0.00	550000.00	2750000.00	0.00	0.00	2025-07-30 01:20:35.374421	844
1960	281	1655	HD005067.01	SP000152	TOPCIN LINCOPEC 44 (Kg)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	8400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	1400000.00	0.00	0.00	1400000.00	8400000.00	0.00	0.00	2025-07-30 01:20:35.374421	844
1961	281	1718	HD005067.01	SP000087	AGR NYSTATIN (1Kg)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	280000.00	0.00	0.00	280000.00	2520000.00	0.00	0.00	2025-07-30 01:20:35.374421	844
1962	282	1547	HD005066	SP000262	VV CEFAXIM (250ml)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	290000.00	0.00	0.00	290000.00	5800000.00	0.00	0.00	2025-07-30 01:20:35.374421	1203
1963	283	1518	HD005065	SP000293	VV TYLODOX WSP (1Kg)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	950000.00	0.00	0.00	950000.00	1900000.00	0.00	0.00	2025-07-30 01:20:35.374421	885
1964	284	1627	HD005064	SP000181	#ND-IB-H9 (250ml)	KH000206	Đ.LÝ  DUNG TÙNG - TÂN PHÚ	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	0.00	250000.00	2500000.00	0.00	0.00	2025-07-30 01:20:35.374421	1040
1965	285	1584	HD005063	SP000224	#TG TẢ + CÚM (500ml)	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	1300000.00	0.00	0.00	1300000.00	6500000.00	0.00	0.00	2025-07-30 01:20:35.374421	1114
1966	285	1755	HD005063	SP000049	#AGR POX (1000DS)	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	220000.00	0.00	0.00	220000.00	1100000.00	0.00	0.00	2025-07-30 01:20:35.374421	1114
1967	286	1858	HD005062	SP000665	MG TOP-SURE (lít)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	250000.00	0.00	0.00	250000.00	1000000.00	0.00	0.00	2025-07-30 01:20:35.374421	906
1968	287	1962	HD005061	SP000558	AGR BUTASAL ATP GOLD 100ml	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:35.374421	1057
1969	288	1714	HD005060	SP000091	AGR BMD WSP (1Kg)	KH000395	ANH QUẢNG - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	2600000.00	0.00	0.00	2600000.00	5200000.00	0.00	0.00	2025-07-30 01:20:35.374421	859
1970	289	1877	HD005059	SP000646	MG VIR 114 1000ds ( GUM )	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	230000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	230000.00	0.00	0.00	230000.00	230000.00	0.00	0.00	2025-07-30 01:20:35.374421	857
1971	289	1876	HD005059	SP000647	MG VIR 114 2000ds ( GUM )	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:35.374421	857
1972	290	1445	HD005058	SP000370	TC BIO LAC PLUS MAX (Hộp 1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	380000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	380000.00	0.00	0.00	380000.00	380000.00	0.00	0.00	2025-07-30 01:20:35.374421	1057
1973	291	1872	HD005057	SP000651	MG VIR 102 1000ds (Đậu)	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	210000.00	0.00	0.00	210000.00	420000.00	0.00	0.00	2025-07-30 01:20:35.374421	909
1974	291	1630	HD005057	SP000178	#CÚM AVAC RE5 (250ml)	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	200000.00	0.00	0.00	200000.00	800000.00	0.00	0.00	2025-07-30 01:20:35.374421	909
1975	292	1630	HD005056	SP000178	#CÚM AVAC RE5 (250ml)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	200000.00	0.00	0.00	200000.00	2800000.00	0.00	0.00	2025-07-30 01:20:35.374421	878
1976	293	2104	HD005055	SP000400	VV-CHYMOSIN (1KG)	KH000377	NHUNG VIETVET	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				24.00	145000.00	0.00	0.00	145000.00	3480000.00	0.00	0.00	2025-07-30 01:20:35.374421	875
1977	294	1949	HD005054	SP000571	#PRRS (Tai Xanh MSD) 10ds	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	650000.00	0.00	0.00	650000.00	2600000.00	0.00	0.00	2025-07-30 01:20:35.374421	1048
1978	294	2049	HD005054	SP000465	KETOVET	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	630000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	45000.00	0.00	0.00	45000.00	630000.00	0.00	0.00	2025-07-30 01:20:35.374421	1048
1979	295	1726	HD005053	SP000079	AGR ENROSOL 20 (1lit)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	385000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	385000.00	0.00	0.00	385000.00	385000.00	0.00	0.00	2025-07-30 01:20:35.374421	1080
1980	295	1725	HD005053	SP000080	AGR AMOXICOL POWDER (1Kg)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:35.374421	1080
1981	296	1706	HD004919.01	SP000099	AGR SORBIMIN (5lit)	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:35.374421	841
1982	296	1807	HD004919.01	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	810000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	270000.00	0.00	0.00	270000.00	810000.00	0.00	0.00	2025-07-30 01:20:35.374421	841
1983	296	1450	HD004919.01	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	390000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	130000.00	0.00	0.00	130000.00	390000.00	0.00	0.00	2025-07-30 01:20:35.374421	841
1984	296	1726	HD004919.01	SP000079	AGR ENROSOL 20 (1lit)	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:35.374421	841
1985	296	1860	HD004919.01	SP000663	MG ESCENT S (kg)	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:35.374421	841
1986	296	1709	HD004919.01	SP000096	AGR ALL-LYTE (5Kg)	KH000413	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:35.374421	841
1987	297	1576	HD005052	SP000232	TG SUPER-VITAMINO (1Kg)	KH000360	ANH HOAN - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:35.374421	892
1988	297	1555	HD005052	SP000254	TG PARAVIT C (1Kg) (XÁ)	KH000360	ANH HOAN - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	200000.00	0.00	0.00	200000.00	400000.00	0.00	0.00	2025-07-30 01:20:35.374421	892
1989	297	1989	HD005052	SP000530	TIGER ĐIỆN GIẢI K_C THẢO DƯỢC (1KG) (XÁ)	KH000360	ANH HOAN - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	90000.00	0.00	0.00	90000.00	450000.00	0.00	0.00	2025-07-30 01:20:35.374421	892
1990	298	1760	HD005051	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH000332	KHÁNH EMIVET	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	280000.00	0.00	0.00	280000.00	2240000.00	0.00	0.00	2025-07-30 01:20:35.374421	920
1991	299	1730	HD005049	SP000074	AGR SELKO®-4 HEALTH (1lit)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	0.00	250000.00	2500000.00	0.00	0.00	2025-07-30 01:20:35.374421	1176
1992	299	1673	HD005049	SP000134	VAC PAC PLUS (5g)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	30000.00	0.00	0.00	30000.00	150000.00	0.00	0.00	2025-07-30 01:20:35.374421	1176
1993	299	1760	HD005049	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	280000.00	0.00	0.00	280000.00	1960000.00	0.00	0.00	2025-07-30 01:20:35.374421	1176
1994	300	1691	HD005048.01	SP000115	AGR PARA C (1Kg)	KH000124	ANH HƯNG - GÀ - SUỐI ĐÁ	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:35.374421	1117
1995	300	1522	HD005048.01	SP000289	VV AMOXICOL 20 W.S.P (1Kg)	KH000124	ANH HƯNG - GÀ - SUỐI ĐÁ	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	500000.00	0.00	0.00	500000.00	1000000.00	0.00	0.00	2025-07-30 01:20:35.374421	1117
1996	300	1759	HD005048.01	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH000124	ANH HƯNG - GÀ - SUỐI ĐÁ	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	200000.00	0.00	0.00	200000.00	400000.00	0.00	0.00	2025-07-30 01:20:35.374421	1117
1997	300	1886	HD005048.01	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH000124	ANH HƯNG - GÀ - SUỐI ĐÁ	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	480000.00	0.00	0.00	480000.00	4800000.00	0.00	0.00	2025-07-30 01:20:35.374421	1117
1999	301	1628	HD005047	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH0000101	ĐẠI LÝ VĂN THANH	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	180000.00	0.00	0.00	180000.00	1440000.00	0.00	0.00	2025-07-30 01:20:35.374421	1138
2000	302	1541	HD005046.01	SP000268	VV ANALGIN (100ml)	KH000335	ANH VŨ CÁM ODON	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	35000.00	0.00	0.00	35000.00	210000.00	0.00	0.00	2025-07-30 01:20:35.374421	917
2001	302	1549	HD005046.01	SP000260	VV CEFTI-S (250ml)	KH000335	ANH VŨ CÁM ODON	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1740000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	290000.00	0.00	0.00	290000.00	1740000.00	0.00	0.00	2025-07-30 01:20:35.374421	917
2002	303	1630	HD005045	SP000178	#CÚM AVAC RE5 (250ml)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1980000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	180000.00	0.00	0.00	180000.00	1980000.00	0.00	0.00	2025-07-30 01:20:35.374421	1180
2003	304	1688	HD005044	SP000118	AGR BKT CLEAN (1Kg)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	60000.00	0.00	0.00	60000.00	1200000.00	0.00	0.00	2025-07-30 01:20:35.374421	1080
2004	305	1874	HD005043	SP000649	MG VIR 220 2000ds (TẢ)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	260000.00	0.00	0.00	260000.00	260000.00	0.00	0.00	2025-07-30 01:20:35.374421	1185
2005	305	1797	HD005043	SP000727	MG VIR 220 5000ds ( TẢ )	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	560000.00	0.00	0.00	560000.00	560000.00	0.00	0.00	2025-07-30 01:20:35.374421	1185
2006	305	1508	HD005043	SP000305	VV BUTAPHOS PRO (1Lit)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:35.374421	1185
2007	305	1695	HD005043	SP000111	AGR MILK PLUS (1Kg)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:35.374421	1185
2008	306	1594	HD005042.01	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000286	ANH HÀNH - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:35.591209	964
2009	306	1584	HD005042.01	SP000224	#TG TẢ + CÚM (500ml)	KH000286	ANH HÀNH - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	1300000.00	0.00	0.00	1300000.00	6500000.00	0.00	0.00	2025-07-30 01:20:35.591209	964
2010	307	1637	HD005041	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	110000.00	0.00	0.00	110000.00	1100000.00	0.00	0.00	2025-07-30 01:20:35.591209	1135
2011	307	1635	HD005041	SP000173	#TEMBUSU CHẾT (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	11600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				40.00	290000.00	0.00	0.00	290000.00	11600000.00	0.00	0.00	2025-07-30 01:20:35.591209	1135
2012	307	1622	HD005041	SP000186	#CIRCO (2000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	270000.00	0.00	0.00	270000.00	2700000.00	0.00	0.00	2025-07-30 01:20:35.591209	1135
2013	308	1628	HD005040.01	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	200000.00	0.00	0.00	200000.00	1600000.00	0.00	0.00	2025-07-30 01:20:35.591209	987
2014	309	1546	HD005039	SP000263	VV LINCO-SPEC INJ (100ml)	KH000377	NHUNG VIETVET	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6570000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				90.00	73000.00	0.00	0.00	73000.00	6570000.00	0.00	0.00	2025-07-30 01:20:35.591209	875
2015	310	1684	HD005038	SP000122	AGR PVP IODINE 10% (5lit)	KH000385	QUYỀN - TAM HOÀNG LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	700000.00	0.00	0.00	700000.00	700000.00	0.00	0.00	2025-07-30 01:20:35.591209	868
2016	311	1630	HD005037	SP000178	#CÚM AVAC RE5 (250ml)	KH0000018	KHẢI 8.500 CON - XUYÊN MỘC	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2880000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	180000.00	0.00	0.00	180000.00	2880000.00	0.00	0.00	2025-07-30 01:20:35.591209	1212
2017	312	1858	HD005036	SP000665	MG TOP-SURE (lít)	KH000412	ANH THẾ - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:35.591209	842
2018	312	1850	HD005036	SP000674	MG VILLI SUPPORT L (lít)	KH000412	ANH THẾ - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	450000.00	0.00	0.00	450000.00	1350000.00	0.00	0.00	2025-07-30 01:20:35.591209	842
2019	313	1858	HD005035.02	SP000665	MG TOP-SURE (lít)	KH000375	ANH DANH - GÀ TRE - VÔ NHIỄM 4K	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:35.591209	877
2020	313	1850	HD005035.02	SP000674	MG VILLI SUPPORT L (lít)	KH000375	ANH DANH - GÀ TRE - VÔ NHIỄM 4K	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	450000.00	0.00	0.00	450000.00	1350000.00	0.00	0.00	2025-07-30 01:20:35.591209	877
2021	314	1872	HD005034	SP000651	MG VIR 102 1000ds (Đậu)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	210000.00	0.00	0.00	210000.00	840000.00	0.00	0.00	2025-07-30 01:20:35.591209	1165
2022	315	1634	HD005033	SP000174	#RỤT MỎ SINDER (250ml)	KH0000076	EM SƠN - ECOVET	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2550000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				30.00	85000.00	0.00	0.00	85000.00	2550000.00	0.00	0.00	2025-07-30 01:20:35.591209	1159
2023	316	1557	HD005032	SP000252	TG NUTRILACZYM (1Kg) (XÁ)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:35.591209	1026
2024	317	1557	HD005031	SP000252	TG NUTRILACZYM (1Kg) (XÁ)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	140000.00	0.00	0.00	140000.00	1400000.00	0.00	0.00	2025-07-30 01:20:35.591209	1026
2025	318	1485	HD005030	SP000329	VV BETA GIUCAN 50 (1KG)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:35.591209	1057
2026	319	1810	HD005029	SP000714	MG PARADOL K-C (kg)	KH000411	CHÚ MẪN - CÚT - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:35.591209	843
2027	319	1704	HD005029	SP000101	AGR SUPPER MEAT (2lit)	KH000411	CHÚ MẪN - CÚT - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:35.591209	843
2028	320	1886	HD005028	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	480000.00	0.00	0.00	480000.00	1920000.00	0.00	0.00	2025-07-30 01:20:35.591209	1178
2029	321	1593	HD005027	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:35.591209	1115
2030	321	1594	HD005027	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	220000.00	0.00	0.00	220000.00	1100000.00	0.00	0.00	2025-07-30 01:20:35.591209	1115
2031	321	1873	HD005027	SP000650	MG VIR 118 (IB BIẾN CHỦNG) 1000ds	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	400000.00	0.00	0.00	400000.00	4400000.00	0.00	0.00	2025-07-30 01:20:35.591209	1115
2032	322	1859	HD005025.03	SP000664	MG FLOR-VM 30% (lít)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1400000.00	0.00	0.00	1400000.00	1400000.00	0.00	0.00	2025-07-30 01:20:35.591209	878
2033	322	1799	HD005025.03	SP000725	MG DOKSIVIL (kg)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	2300000.00	0.00	0.00	2300000.00	2300000.00	0.00	0.00	2025-07-30 01:20:35.591209	878
2034	322	1833	HD005025.03	SP000691	MEGA-BROMEN (lít)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	250000.00	0.00	0.00	250000.00	750000.00	0.00	0.00	2025-07-30 01:20:35.591209	878
2035	322	1850	HD005025.03	SP000674	MG VILLI SUPPORT L (lít)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:35.591209	878
2036	323	1593	HD005024	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000391	NGUYỆT SƠN LÂM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:35.591209	863
2037	323	1594	HD005024	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000391	NGUYỆT SƠN LÂM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	220000.00	0.00	0.00	220000.00	220000.00	0.00	0.00	2025-07-30 01:20:35.591209	863
2038	324	1511	HD005023	SP000302	VV AMOXCOLI 50 WSP (1Kg)	KH000007	CHÚ PHƯỚC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	900000.00	0.00	0.00	900000.00	900000.00	0.00	0.00	2025-07-30 01:20:35.591209	1221
2039	325	1591	HD005022	SP000217	#TG IBD M+ (2000DS)	KH000287	CHỊ QUÝ - TÂN PHÚ	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	400000.00	0.00	0.00	400000.00	2400000.00	0.00	0.00	2025-07-30 01:20:35.591209	963
2040	325	1584	HD005022	SP000224	#TG TẢ + CÚM (500ml)	KH000287	CHỊ QUÝ - TÂN PHÚ	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	1300000.00	0.00	0.00	1300000.00	7800000.00	0.00	0.00	2025-07-30 01:20:35.591209	963
2041	325	1587	HD005022	SP000221	#TG POX (1000DS)	KH000287	CHỊ QUÝ - TÂN PHÚ	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	220000.00	0.00	0.00	220000.00	660000.00	0.00	0.00	2025-07-30 01:20:35.591209	963
2042	325	1594	HD005022	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000287	CHỊ QUÝ - TÂN PHÚ	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1980000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	220000.00	0.00	0.00	220000.00	1980000.00	0.00	0.00	2025-07-30 01:20:35.591209	963
2043	326	1584	HD005021	SP000224	#TG TẢ + CÚM (500ml)	KH0000106	TRINH - HIPPRA	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	1050000.00	0.00	0.00	1050000.00	7350000.00	0.00	0.00	2025-07-30 01:20:35.591209	1133
2044	327	1587	HD005020	SP000221	#TG POX (1000DS)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:35.591209	1057
2045	328	1810	HD005019	SP000714	MG PARADOL K-C (kg)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	200000.00	0.00	0.00	200000.00	1000000.00	0.00	0.00	2025-07-30 01:20:35.591209	844
2046	328	1856	HD005019	SP000667	MG REVIVAL LIQUID (lít)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	550000.00	0.00	0.00	550000.00	2750000.00	0.00	0.00	2025-07-30 01:20:35.591209	844
2047	328	1718	HD005019	SP000087	AGR NYSTATIN (1Kg)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	320000.00	0.00	0.00	320000.00	1920000.00	0.00	0.00	2025-07-30 01:20:35.591209	844
2048	328	2078	HD005019	SP000435	VV CHYMOSIN (100ml)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				26.00	100000.00	0.00	0.00	100000.00	2600000.00	0.00	0.00	2025-07-30 01:20:35.591209	844
2049	328	1541	HD005019	SP000268	VV ANALGIN (100ml)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	875000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				25.00	35000.00	0.00	0.00	35000.00	875000.00	0.00	0.00	2025-07-30 01:20:35.591209	844
2050	328	1547	HD005019	SP000262	VV CEFAXIM (250ml)	KH000410	ANH PHONG - VĨNH TÂN	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7540000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				26.00	290000.00	0.00	0.00	290000.00	7540000.00	0.00	0.00	2025-07-30 01:20:35.591209	844
2051	329	1721	HD005017	SP000084	AGR DICLAZU PLUS (1lit)	KH000372	ANH HẢI (KẾ)	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	700000.00	0.00	0.00	700000.00	1400000.00	0.00	0.00	2025-07-30 01:20:35.591209	880
2052	330	1893	HD005016	SP000630	AGR PHOSRENOL (1 kg)	KH000388	ANH HỌC (LONG)	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	660000.00	0.00	0.00	660000.00	3300000.00	0.00	0.00	2025-07-30 01:20:35.591209	865
2053	330	1474	HD005016	SP000340	VV ENROFLOXACINA-TAV 20% (1Lit)	KH000388	ANH HỌC (LONG)	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	600000.00	0.00	0.00	600000.00	6000000.00	0.00	0.00	2025-07-30 01:20:35.591209	865
2054	330	1520	HD005016	SP000291	VV COLIS 50 WSP (1Kg)	KH000388	ANH HỌC (LONG)	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	450000.00	0.00	0.00	450000.00	2250000.00	0.00	0.00	2025-07-30 01:20:35.591209	865
2055	331	1702	HD005015	SP000104	AGR BUTAPHOS B12 (1lit)	KH000332	KHÁNH EMIVET	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:35.591209	920
2056	331	1893	HD005015	SP000630	AGR PHOSRENOL (1 kg)	KH000332	KHÁNH EMIVET	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	660000.00	0.00	0.00	660000.00	660000.00	0.00	0.00	2025-07-30 01:20:35.591209	920
2057	332	2083	HD005014	SP000429	#HIPPRAVIAR- SHS	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				23.00	240000.00	0.00	0.00	240000.00	5520000.00	0.00	0.00	2025-07-30 01:20:35.591209	923
2058	332	2030	HD005014	SP000484	AGR - FLOCOL ORAL (lít)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	950000.00	0.00	0.00	950000.00	4750000.00	0.00	0.00	2025-07-30 01:20:35.836269	923
2059	332	1761	HD005014	SP000043	#IZOVAC H120 - LASOTA (1000DS)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:35.836269	923
2060	332	1760	HD005014	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH000329	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	280000.00	0.00	0.00	280000.00	2520000.00	0.00	0.00	2025-07-30 01:20:35.836269	923
2061	333	2083	HD005013	SP000429	#HIPPRAVIAR- SHS	KH000288	CÔ TUYẾT THU (5K) - LÔ SONG HÀNH	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	240000.00	0.00	0.00	240000.00	1200000.00	0.00	0.00	2025-07-30 01:20:35.836269	962
2062	334	1832	HD005012	SP000692	FEROVITA 200 (sắt)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	130000.00	0.00	0.00	130000.00	650000.00	0.00	0.00	2025-07-30 01:20:35.836269	1048
2063	334	1432	HD005012	SP000383	KIM 9x13 (Vỉ)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	10000.00	0.00	0.00	10000.00	100000.00	0.00	0.00	2025-07-30 01:20:35.836269	1048
2064	334	1909	HD005012	SP000612	DÂY TRUYỀN 1M (Sợi)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	50000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	5000.00	0.00	0.00	5000.00	50000.00	0.00	0.00	2025-07-30 01:20:35.836269	1048
2065	334	1910	HD005012	SP000611	NƯỚC BIỂN (500ml)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	720000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				60.00	12000.00	0.00	0.00	12000.00	720000.00	0.00	0.00	2025-07-30 01:20:35.836269	1048
2066	334	1829	HD005012	SP000695	PORCOX-5	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	440000.00	0.00	0.00	440000.00	440000.00	0.00	0.00	2025-07-30 01:20:35.836269	1048
2067	334	2044	HD005012	SP000470	OXYTOCIN (100ml)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	175000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	35000.00	0.00	0.00	35000.00	175000.00	0.00	0.00	2025-07-30 01:20:35.836269	1048
2068	334	1919	HD005012	SP000602	GLUCONAMIC KC (100ml)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	80000.00	0.00	0.00	80000.00	800000.00	0.00	0.00	2025-07-30 01:20:35.836269	1048
2069	334	2049	HD005012	SP000465	KETOVET	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	270000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	45000.00	0.00	0.00	45000.00	270000.00	0.00	0.00	2025-07-30 01:20:35.836269	1048
2070	334	1971	HD005012	SP000548	KIM ĐỐC HỒNG 18G HỘP 100CÂY	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	40000.00	0.00	0.00	40000.00	200000.00	0.00	0.00	2025-07-30 01:20:35.836269	1048
2071	335	1891	HD005011	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	80000.00	0.00	0.00	80000.00	320000.00	0.00	0.00	2025-07-30 01:20:35.836269	889
2072	335	1638	HD005011	SP000170	#REO VIRUT (1000DS)	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	250000.00	0.00	0.00	250000.00	1000000.00	0.00	0.00	2025-07-30 01:20:35.836269	889
2073	335	1634	HD005011	SP000174	#RỤT MỎ SINDER (250ml)	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	150000.00	0.00	0.00	150000.00	1200000.00	0.00	0.00	2025-07-30 01:20:35.836269	889
2074	336	1956	HD005010	SP000564	AGR FLUCAL 150 (1 lít)	KH0000105	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:35.836269	1134
2075	336	1491	HD005010	SP000323	VV MONOSULTRIM 60 (1KG)	KH0000105	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1300000.00	0.00	0.00	1300000.00	1300000.00	0.00	0.00	2025-07-30 01:20:35.836269	1134
2076	336	1688	HD005010	SP000118	AGR BKT CLEAN (1Kg)	KH0000105	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	70000.00	0.00	0.00	70000.00	350000.00	0.00	0.00	2025-07-30 01:20:35.836269	1134
2077	337	1616	HD005009	SP000192	#MAX 5CLON30 (2500DS)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:35.836269	1165
2078	337	1615	HD005009	SP000193	#MAX 5CLON30 (5000DS)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	540000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	540000.00	0.00	0.00	540000.00	540000.00	0.00	0.00	2025-07-30 01:20:35.836269	1165
2079	338	1477	HD005008	SP000337	VV BENGLUXIDE (1Lit)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:35.836269	1057
2080	339	2073	HD005007	SP000440	#VH + H120 (2000DS)	KH0000050	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	280000.00	0.00	0.00	280000.00	1960000.00	0.00	0.00	2025-07-30 01:20:35.836269	1182
2081	340	1937	HD005006	SP000584	NUTROLYTE	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				19.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:35.836269	1203
2082	341	1628	HD005005	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	250000.00	0.00	0.00	250000.00	750000.00	0.00	0.00	2025-07-30 01:20:35.836269	1209
2083	342	2089	HD005004	SP000422	OXYTIN(10G)-ÚM GIA CẦM	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	20000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	10000.00	0.00	0.00	10000.00	20000.00	0.00	0.00	2025-07-30 01:20:35.836269	1057
2084	342	1961	HD005004	SP000559	AGR BCOMPLEX-C (200g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	30000.00	0.00	0.00	30000.00	30000.00	0.00	0.00	2025-07-30 01:20:35.836269	1057
2085	343	1942	HD005003	SP000578	#DỊCH TẢ HANVET	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	70000.00	0.00	0.00	70000.00	1400000.00	0.00	0.00	2025-07-30 01:20:35.836269	1023
2086	344	1755	HD005002	SP000049	#AGR POX (1000DS)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:35.836269	1122
2087	345	2078	HD005001	SP000435	VV CHYMOSIN (100ml)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	100000.00	0.00	0.00	100000.00	300000.00	0.00	0.00	2025-07-30 01:20:35.836269	900
2088	345	1637	HD005001	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1050000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	350000.00	0.00	0.00	350000.00	1050000.00	0.00	0.00	2025-07-30 01:20:35.836269	900
2089	345	1942	HD005001	SP000578	#DỊCH TẢ HANVET	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	70000.00	0.00	0.00	70000.00	210000.00	0.00	0.00	2025-07-30 01:20:35.836269	900
2090	345	1626	HD005001	SP000182	CEFOTAXIM (Bột 2g)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	30000.00	0.00	0.00	30000.00	600000.00	0.00	0.00	2025-07-30 01:20:35.836269	900
2091	345	1750	HD005001	SP000054	AGR GENTACIN (100ml)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	100000.00	0.00	0.00	100000.00	300000.00	0.00	0.00	2025-07-30 01:20:35.836269	900
2092	345	1541	HD005001	SP000268	VV ANALGIN (100ml)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	105000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	35000.00	0.00	0.00	35000.00	105000.00	0.00	0.00	2025-07-30 01:20:35.836269	900
2093	346	1673	HD005000	SP000134	VAC PAC PLUS (5g)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	30000.00	0.00	0.00	30000.00	120000.00	0.00	0.00	2025-07-30 01:20:35.836269	876
2094	346	1584	HD005000	SP000224	#TG TẢ + CÚM (500ml)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	13000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	1300000.00	0.00	0.00	1300000.00	13000000.00	0.00	0.00	2025-07-30 01:20:35.836269	876
2095	346	1613	HD005000	SP000195	#GUMBORO 228E (2500DS)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	650000.00	0.00	0.00	650000.00	2600000.00	0.00	0.00	2025-07-30 01:20:35.836269	876
2096	347	1635	HD004999.01	SP000173	#TEMBUSU CHẾT (250ml)	KH000398	TRUNG - BƯU ĐIỆN - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	400000.00	0.00	0.00	400000.00	3200000.00	0.00	0.00	2025-07-30 01:20:35.836269	856
2097	348	1844	HD004998	SP000680	MG ADE SOLUTION	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	340000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	170000.00	0.00	0.00	170000.00	340000.00	0.00	0.00	2025-07-30 01:20:35.836269	1226
2098	348	1669	HD004998	SP000138	TOPCIN BCOMPLEX C (1Kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.854	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	100000.00	0.00	0.00	100000.00	2000000.00	0.00	0.00	2025-07-30 01:20:35.836269	1226
2099	349	1743	HD004997	SP000061	AG - 003 GENTA - CEFOR INJ (100ml)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5424000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				48.00	113000.00	0.00	0.00	113000.00	5424000.00	0.00	0.00	2025-07-30 01:20:35.836269	1080
2100	349	1742	HD004997	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	9504000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				36.00	264000.00	0.00	0.00	264000.00	9504000.00	0.00	0.00	2025-07-30 01:20:35.836269	1080
2101	350	1517	HD004996	SP000295	VV DICLACOC (1Lit)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	600000.00	0.00	0.00	600000.00	1200000.00	0.00	0.00	2025-07-30 01:20:35.836269	881
2102	351	1574	HD004995.01	SP000234	TG TRISULPHA (1Kg)	KH000409	CHỊ VY - LÂM ĐỒNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1500000.00	0.00	0.00	1500000.00	4500000.00	0.00	0.00	2025-07-30 01:20:35.836269	845
2103	351	1541	HD004995.01	SP000268	VV ANALGIN (100ml)	KH000409	CHỊ VY - LÂM ĐỒNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	35000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	35000.00	0.00	0.00	35000.00	35000.00	0.00	0.00	2025-07-30 01:20:35.836269	845
2104	351	1542	HD004995.01	SP000267	VV GENTA-TYLO (100ml)	KH000409	CHỊ VY - LÂM ĐỒNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:35.836269	845
2105	351	1881	HD004995.01	SP000642	TYLOSIN 750g	KH000409	CHỊ VY - LÂM ĐỒNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1000000.00	0.00	0.00	1000000.00	2000000.00	0.00	0.00	2025-07-30 01:20:35.836269	845
2106	351	1552	HD004995.01	SP000257	TG CHYMOTRY (1lit)	KH000409	CHỊ VY - LÂM ĐỒNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	600000.00	0.00	0.00	600000.00	1800000.00	0.00	0.00	2025-07-30 01:20:35.836269	845
2107	351	1539	HD004995.01	SP000271	VV BROMHEXINE (100ml)	KH000409	CHỊ VY - LÂM ĐỒNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	30000.00	0.00	0.00	30000.00	30000.00	0.00	0.00	2025-07-30 01:20:35.836269	845
2108	351	1739	HD004995.01	SP000065	AGR DEXA JECT (100ml)	KH000409	CHỊ VY - LÂM ĐỒNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	50000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	50000.00	0.00	0.00	50000.00	50000.00	0.00	0.00	2025-07-30 01:20:36.060262	845
2109	352	1564	HD004994	SP000244	TG-DICLASOL 2.5 (1lit)	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	600000.00	0.00	0.00	600000.00	1200000.00	0.00	0.00	2025-07-30 01:20:36.060262	1178
2110	352	1709	HD004994	SP000096	AGR ALL-LYTE (5Kg)	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:36.060262	1178
2111	353	1547	HD004993	SP000262	VV CEFAXIM (250ml)	KH000212	CHỊ DUNG - SOKLU	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	290000.00	0.00	0.00	290000.00	1450000.00	0.00	0.00	2025-07-30 01:20:36.060262	1034
2112	354	1807	HD004992.01	SP000717	TAV-STRESS LYTE PLUS (kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:36.060262	1176
2113	355	1532	HD004991.01	SP000278	VV BIOTIN PLUS (1Kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	80000.00	0.00	0.00	80000.00	800000.00	0.00	0.00	2025-07-30 01:20:36.060262	1176
2114	355	1807	HD004991.01	SP000717	TAV-STRESS LYTE PLUS (kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	220000.00	0.00	0.00	220000.00	4400000.00	0.00	0.00	2025-07-30 01:20:36.060262	1176
2115	356	1470	HD004990	SP000344	VV ANTIVIUS-TAV (1Lit)	KH000238	HẢI - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2040000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	680000.00	0.00	0.00	680000.00	2040000.00	0.00	0.00	2025-07-30 01:20:36.060262	1011
2116	357	1732	HD004989	SP000072	AGR AVITRACE (1lit)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1680000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	280000.00	0.00	0.00	280000.00	1680000.00	0.00	0.00	2025-07-30 01:20:36.060262	1123
2117	357	1552	HD004989	SP000257	TG CHYMOTRY (1lit)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	600000.00	0.00	0.00	600000.00	3600000.00	0.00	0.00	2025-07-30 01:20:36.060262	1123
2118	358	1807	HD004988	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000193	TRẠI GÀ ĐẺ - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	250000.00	0.00	0.00	250000.00	1250000.00	0.00	0.00	2025-07-30 01:20:36.060262	1052
2119	358	1696	HD004988	SP000110	AGR CALPHOS PLUS (5lit)	KH000193	TRẠI GÀ ĐẺ - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:36.060262	1052
2120	359	1759	HD004987	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1360000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	170000.00	0.00	0.00	170000.00	1360000.00	0.00	0.00	2025-07-30 01:20:36.060262	1080
2121	360	1692	HD004986	SP000114	AGR BROM- MAX (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:36.060262	1057
2122	361	1637	HD004985	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				30.00	110000.00	0.00	0.00	110000.00	3300000.00	0.00	0.00	2025-07-30 01:20:36.060262	1135
2123	362	1891	HD004984	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	80000.00	0.00	0.00	80000.00	800000.00	0.00	0.00	2025-07-30 01:20:36.060262	992
2124	362	1634	HD004984	SP000174	#RỤT MỎ SINDER (250ml)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	150000.00	0.00	0.00	150000.00	3000000.00	0.00	0.00	2025-07-30 01:20:36.060262	992
2125	363	1548	HD004983.01	SP000261	VV CEFTI-S - NEW (250ml)	KH000384	ANH HỌC - CTY TIẾN THẠNH	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	390000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	390000.00	0.00	0.00	390000.00	390000.00	0.00	0.00	2025-07-30 01:20:36.060262	869
2126	363	1730	HD004983.01	SP000074	AGR SELKO®-4 HEALTH (1lit)	KH000384	ANH HỌC - CTY TIẾN THẠNH	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.060262	869
2127	364	1754	HD004982	SP000050	#IZOVAC ND (500ml)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	700000.00	0.00	0.00	700000.00	2100000.00	0.00	0.00	2025-07-30 01:20:36.060262	1080
2128	364	1439	HD004982	SP000376	XI LANH KANGDA (1ml)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	230000.00	0.00	0.00	230000.00	920000.00	0.00	0.00	2025-07-30 01:20:36.060262	1080
2129	364	1878	HD004982	SP000645	AGR GENTADOX (kg)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	820000.00	0.00	0.00	820000.00	3280000.00	0.00	0.00	2025-07-30 01:20:36.060262	1080
2130	364	1761	HD004982	SP000043	#IZOVAC H120 - LASOTA (1000DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:36.060262	1080
2131	364	1760	HD004982	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	280000.00	0.00	0.00	280000.00	560000.00	0.00	0.00	2025-07-30 01:20:36.060262	1080
2132	365	1801	HDD_TH000179	SP000723	KIM 16X13	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	10000.00	0.00	0.00	10000.00	30000.00	0.00	0.00	2025-07-30 01:20:36.060262	990
2133	366	1807	HD004981	SP000717	TAV-STRESS LYTE PLUS (kg)	KH0000074	CHÚ THÀNH - GÀ TRE	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	210000.00	0.00	0.00	210000.00	210000.00	0.00	0.00	2025-07-30 01:20:36.060262	1161
2134	366	1606	HD004981	SP000202	PERMASOL 500 (1Kg)	KH0000074	CHÚ THÀNH - GÀ TRE	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	200000.00	0.00	0.00	200000.00	400000.00	0.00	0.00	2025-07-30 01:20:36.060262	1161
2135	367	1521	HD004980	SP000290	VV ENROVET ORAL (1Lit)	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	500000.00	0.00	0.00	500000.00	1000000.00	0.00	0.00	2025-07-30 01:20:36.060262	990
2136	367	1474	HD004980	SP000340	VV ENROFLOXACINA-TAV 20% (1Lit)	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	600000.00	0.00	0.00	600000.00	600000.00	0.00	0.00	2025-07-30 01:20:36.060262	990
2137	368	1802	HD004979	SP000722	COCCIVET 2000ds	KH000408	ANH KHÔI	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1500000.00	0.00	0.00	1500000.00	4500000.00	0.00	0.00	2025-07-30 01:20:36.060262	846
2138	368	1758	HD004979	SP000046	#VAXXON CHB (1000DS)	KH000408	ANH KHÔI	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	520000.00	0.00	0.00	520000.00	3120000.00	0.00	0.00	2025-07-30 01:20:36.060262	846
2139	369	2083	HD004978	SP000429	#HIPPRAVIAR- SHS	KH000203	HÀ HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	210000.00	0.00	0.00	210000.00	420000.00	0.00	0.00	2025-07-30 01:20:36.060262	1043
2140	370	1622	HD004977.01	SP000186	#CIRCO (2000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	330000.00	0.00	0.00	330000.00	1650000.00	0.00	0.00	2025-07-30 01:20:36.060262	1189
2141	370	1638	HD004977.01	SP000170	#REO VIRUT (1000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	250000.00	0.00	0.00	250000.00	1250000.00	0.00	0.00	2025-07-30 01:20:36.060262	1189
2142	370	1942	HD004977.01	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	70000.00	0.00	0.00	70000.00	560000.00	0.00	0.00	2025-07-30 01:20:36.060262	1189
2143	371	1495	HD004976	SP000319	VV FLODOX 30 (1Lit)	KH0000042	CHỊ QUYÊN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	1000000.00	0.00	0.00	1000000.00	5000000.00	0.00	0.00	2025-07-30 01:20:36.060262	1190
2144	372	1628	HD004975	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	250000.00	0.00	0.00	250000.00	1000000.00	0.00	0.00	2025-07-30 01:20:36.060262	1210
2145	372	1500	HD004975	SP000314	VV CEPHAXIN 50 WSP (1Kg)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1300000.00	0.00	0.00	1300000.00	2600000.00	0.00	0.00	2025-07-30 01:20:36.060262	1210
2146	373	2025	HD004974	SP000489	TG-DOXY 500 (1Kg)(XÁ)	KH000293	CHỊ LOAN -BỐT ĐỎ	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1650000.00	0.00	0.00	1650000.00	4950000.00	0.00	0.00	2025-07-30 01:20:36.060262	957
2147	373	1594	HD004974	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000293	CHỊ LOAN -BỐT ĐỎ	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	220000.00	0.00	0.00	220000.00	1100000.00	0.00	0.00	2025-07-30 01:20:36.060262	957
2148	373	1593	HD004974	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000293	CHỊ LOAN -BỐT ĐỎ	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:36.060262	957
2149	374	1615	HD004973	SP000193	#MAX 5CLON30 (5000DS)	KH000193	TRẠI GÀ ĐẺ - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	550000.00	0.00	0.00	550000.00	1100000.00	0.00	0.00	2025-07-30 01:20:36.060262	1052
2150	374	1673	HD004973	SP000134	VAC PAC PLUS (5g)	KH000193	TRẠI GÀ ĐẺ - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	30000.00	0.00	0.00	30000.00	150000.00	0.00	0.00	2025-07-30 01:20:36.060262	1052
2151	375	1755	HD004972.01	SP000049	#AGR POX (1000DS)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	220000.00	0.00	0.00	220000.00	2200000.00	0.00	0.00	2025-07-30 01:20:36.060262	876
2152	376	1584	HD004971	SP000224	#TG TẢ + CÚM (500ml)	KH0000050	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.853	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1300000.00	0.00	0.00	1300000.00	2600000.00	0.00	0.00	2025-07-30 01:20:36.060262	1182
2153	377	1879	HD004970	SP000644	VV VITAMIN K3 0,5% (1Kg) 10:1	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:36.060262	1057
2154	378	1637	HD004969	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	300000.00	0.00	0.00	300000.00	900000.00	0.00	0.00	2025-07-30 01:20:36.060262	1192
2155	378	1626	HD004969	SP000182	CEFOTAXIM (Bột 2g)	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				45.00	30000.00	0.00	0.00	30000.00	1350000.00	0.00	0.00	2025-07-30 01:20:36.060262	1192
2156	379	1893	HD004968	SP000630	AGR PHOSRENOL (1 kg)	KH000303	ANH LÂM (6K) - TRẠI 3	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	660000.00	0.00	0.00	660000.00	660000.00	0.00	0.00	2025-07-30 01:20:36.060262	947
2157	380	1704	HD004967	SP000101	AGR SUPPER MEAT (2lit)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	450000.00	0.00	0.00	450000.00	2700000.00	0.00	0.00	2025-07-30 01:20:36.060262	1226
2158	380	1893	HD004967	SP000630	AGR PHOSRENOL (1 kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	660000.00	0.00	0.00	660000.00	1320000.00	0.00	0.00	2025-07-30 01:20:36.27666	1226
2159	381	1745	HD004966.01	SP000059	AG - 002 TRISUL - CETI (100ml)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	100000.00	0.00	0.00	100000.00	200000.00	0.00	0.00	2025-07-30 01:20:36.27666	1048
2160	382	1485	HD004965	SP000329	VV BETA GIUCAN 50 (1KG)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.27666	1165
2161	383	1549	HD004964	SP000260	VV CEFTI-S (250ml)	KH000407	ANH NAM - CẦU QUÂN Y	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	290000.00	0.00	0.00	290000.00	5800000.00	0.00	0.00	2025-07-30 01:20:36.27666	847
2162	384	1726	HD004963	SP000079	AGR ENROSOL 20 (1lit)	KH000250	ANH HƯNG LÔ MỚI - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.27666	999
2163	385	1709	HD004962	SP000096	AGR ALL-LYTE (5Kg)	KH000406	CHÚ HOÀ	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:36.27666	848
2164	385	1712	HD004962	SP000093	AGR LACTO-MAXAG (1Kg)	KH000406	CHÚ HOÀ	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	130000.00	0.00	0.00	130000.00	650000.00	0.00	0.00	2025-07-30 01:20:36.27666	848
2165	386	1759	HD004961	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	180000.00	0.00	0.00	180000.00	1260000.00	0.00	0.00	2025-07-30 01:20:36.27666	1080
2166	386	1755	HD004961	SP000049	#AGR POX (1000DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	880000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	220000.00	0.00	0.00	220000.00	880000.00	0.00	0.00	2025-07-30 01:20:36.27666	1080
2167	387	1504	HD004960	SP000309	VV FLOCOL 50 WSP (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:36.27666	1057
2168	388	1955	HD004959	SP000565	#CÚM H5 + H9 (250ml)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	720000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	180000.00	0.00	0.00	180000.00	720000.00	0.00	0.00	2025-07-30 01:20:36.27666	987
2169	389	1807	HD004957	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.27666	849
2170	389	1879	HD004957	SP000644	VV VITAMIN K3 0,5% (1Kg) 10:1	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:36.27666	849
2171	389	1450	HD004957	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	390000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	130000.00	0.00	0.00	130000.00	390000.00	0.00	0.00	2025-07-30 01:20:36.27666	849
2172	389	1691	HD004957	SP000115	AGR PARA C (1Kg)	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:36.27666	849
2173	389	1709	HD004957	SP000096	AGR ALL-LYTE (5Kg)	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:36.27666	849
2174	389	1706	HD004957	SP000099	AGR SORBIMIN (5lit)	KH000405	ANH HẢI HÀO LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:36.27666	849
2175	390	1656	HD004956	SP000151	TOPCIN VỖ BÉO DỊCH TRÙN QUẾ (5lit))	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	800000.00	0.00	0.00	800000.00	800000.00	0.00	0.00	2025-07-30 01:20:36.27666	889
2176	391	1870	HD004955.02	SP000653	MG MEGA - GREEN (kg)	KH000404	ANH QUỐC - DẦU GIÂY	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:36.27666	850
2177	391	1873	HD004955.02	SP000650	MG VIR 118 (IB BIẾN CHỦNG) 1000ds	KH000404	ANH QUỐC - DẦU GIÂY	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	400000.00	0.00	0.00	400000.00	5600000.00	0.00	0.00	2025-07-30 01:20:36.27666	850
2178	392	1626	HD004954	SP000182	CEFOTAXIM (Bột 2g)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1050000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				35.00	30000.00	0.00	0.00	30000.00	1050000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2179	392	2078	HD004954	SP000435	VV CHYMOSIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	100000.00	0.00	0.00	100000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2180	392	1541	HD004954	SP000268	VV ANALGIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	175000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	35000.00	0.00	0.00	35000.00	175000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2181	392	1750	HD004954	SP000054	AGR GENTACIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	100000.00	0.00	0.00	100000.00	400000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2182	392	1631	HD004954	SP000177	#RỤT MỎ RINGPU (250ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1980000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	180000.00	0.00	0.00	180000.00	1980000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2183	393	1757	HD004953.01	SP000047	#VAXXON ILT (1000DS)	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:36.27666	1139
2184	393	1630	HD004953.01	SP000178	#CÚM AVAC RE5 (250ml)	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	170000.00	0.00	0.00	170000.00	3400000.00	0.00	0.00	2025-07-30 01:20:36.27666	1139
2185	393	1753	HD004953.01	SP000051	#K-NEWH5 (500ml)	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	850000.00	0.00	0.00	850000.00	850000.00	0.00	0.00	2025-07-30 01:20:36.27666	1139
2186	394	1669	HD004952	SP000138	TOPCIN BCOMPLEX C (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	100000.00	0.00	0.00	100000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.27666	1215
2187	394	1520	HD004952	SP000291	VV COLIS 50 WSP (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:36.27666	1215
2188	394	1505	HD004952	SP000308	VV FLOCOL 50 WSP (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1200000.00	0.00	0.00	1200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:36.27666	1215
2189	395	1955	HD004951	SP000565	#CÚM H5 + H9 (250ml)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	720000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	180000.00	0.00	0.00	180000.00	720000.00	0.00	0.00	2025-07-30 01:20:36.27666	987
2190	396	1539	HD004950	SP000271	VV BROMHEXINE (100ml)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	60000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	30000.00	0.00	0.00	30000.00	60000.00	0.00	0.00	2025-07-30 01:20:36.27666	1057
2191	397	1858	HD004949.01	SP000665	MG TOP-SURE (lít)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	250000.00	0.00	0.00	250000.00	1250000.00	0.00	0.00	2025-07-30 01:20:36.27666	878
2192	397	1810	HD004949.01	SP000714	MG PARADOL K-C (kg)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	200000.00	0.00	0.00	200000.00	1000000.00	0.00	0.00	2025-07-30 01:20:36.27666	878
2193	398	1526	HD004948.01	SP000285	VV BROMHEXIN WSP(1Kg)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	100000.00	0.00	0.00	100000.00	300000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2194	398	1942	HD004948.01	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	70000.00	0.00	0.00	70000.00	210000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2195	398	1638	HD004948.01	SP000170	#REO VIRUT (1000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	250000.00	0.00	0.00	250000.00	750000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2196	398	1495	HD004948.01	SP000319	VV FLODOX 30 (1Lit)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1000000.00	0.00	0.00	1000000.00	1000000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2197	398	1622	HD004948.01	SP000186	#CIRCO (2000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	990000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	330000.00	0.00	0.00	330000.00	990000.00	0.00	0.00	2025-07-30 01:20:36.27666	1189
2198	399	1680	HD004947	SP000126	AGR ANTISEPTIC (5lit)	KH0000080	ANH PHONG - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:36.27666	1155
2199	400	1511	HD004946	SP000302	VV AMOXCOLI 50 WSP (1Kg)	KH000250	ANH HƯNG LÔ MỚI - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	900000.00	0.00	0.00	900000.00	900000.00	0.00	0.00	2025-07-30 01:20:36.27666	999
2200	400	1718	HD004946	SP000087	AGR NYSTATIN (1Kg)	KH000250	ANH HƯNG LÔ MỚI - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:36.27666	999
2201	400	1706	HD004946	SP000099	AGR SORBIMIN (5lit)	KH000250	ANH HƯNG LÔ MỚI - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:36.27666	999
2202	401	1590	HD004945	SP000218	#TG IBD M+ (1000DS)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	210000.00	0.00	0.00	210000.00	210000.00	0.00	0.00	2025-07-30 01:20:36.27666	1180
2203	401	1591	HD004945	SP000217	#TG IBD M+ (2000DS)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	360000.00	0.00	0.00	360000.00	1800000.00	0.00	0.00	2025-07-30 01:20:36.27666	1180
2204	402	1495	HD004944	SP000319	VV FLODOX 30 (1Lit)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1000000.00	0.00	0.00	1000000.00	1000000.00	0.00	0.00	2025-07-30 01:20:36.27666	1185
2205	403	1891	HD004943	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000347	ANH DUY - PHƯƠNG LÂM	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	720000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	80000.00	0.00	0.00	80000.00	720000.00	0.00	0.00	2025-07-30 01:20:36.27666	905
2206	403	1638	HD004943	SP000170	#REO VIRUT (1000DS)	KH000347	ANH DUY - PHƯƠNG LÂM	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	250000.00	0.00	0.00	250000.00	2250000.00	0.00	0.00	2025-07-30 01:20:36.27666	905
2244	424	1622	HD004921	SP000186	#CIRCO (2000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	270000.00	0.00	0.00	270000.00	1080000.00	0.00	0.00	2025-07-30 01:20:36.505613	1135
2207	404	1874	HD004942.01	SP000649	MG VIR 220 2000ds (TẢ)	KH000200	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	260000.00	0.00	0.00	260000.00	520000.00	0.00	0.00	2025-07-30 01:20:36.27666	1046
2208	405	1564	HD004941	SP000244	TG-DICLASOL 2.5 (1lit)	KH000403	TIẾN CHÍCH	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	600000.00	0.00	0.00	600000.00	600000.00	0.00	0.00	2025-07-30 01:20:36.505613	851
2209	405	1879	HD004941	SP000644	VV VITAMIN K3 0,5% (1Kg) 10:1	KH000403	TIẾN CHÍCH	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:36.505613	851
2210	405	1775	HD004941	SP000012	NOVAVETER PARADOL K,C (1Kg)	KH000403	TIẾN CHÍCH	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	160000.00	0.00	0.00	160000.00	160000.00	0.00	0.00	2025-07-30 01:20:36.505613	851
2211	406	1552	HD004940	SP000257	TG CHYMOTRY (1lit)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	600000.00	0.00	0.00	600000.00	600000.00	0.00	0.00	2025-07-30 01:20:36.505613	900
2212	406	1541	HD004940	SP000268	VV ANALGIN (100ml)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	105000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	35000.00	0.00	0.00	35000.00	105000.00	0.00	0.00	2025-07-30 01:20:36.505613	900
2213	406	2078	HD004940	SP000435	VV CHYMOSIN (100ml)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	100000.00	0.00	0.00	100000.00	300000.00	0.00	0.00	2025-07-30 01:20:36.505613	900
2214	406	1750	HD004940	SP000054	AGR GENTACIN (100ml)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	100000.00	0.00	0.00	100000.00	200000.00	0.00	0.00	2025-07-30 01:20:36.505613	900
2215	406	1631	HD004940	SP000177	#RỤT MỎ RINGPU (250ml)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	180000.00	0.00	0.00	180000.00	1080000.00	0.00	0.00	2025-07-30 01:20:36.505613	900
2216	406	1626	HD004940	SP000182	CEFOTAXIM (Bột 2g)	KH000352	ANH TÂN - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.852	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	30000.00	0.00	0.00	30000.00	450000.00	0.00	0.00	2025-07-30 01:20:36.505613	900
2217	407	1630	HD004939	SP000178	#CÚM AVAC RE5 (250ml)	KH000335	ANH VŨ CÁM ODON	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2340000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				13.00	180000.00	0.00	0.00	180000.00	2340000.00	0.00	0.00	2025-07-30 01:20:36.505613	917
2218	408	1955	HD004938	SP000565	#CÚM H5 + H9 (250ml)	KH000240	ANH TRƯỜNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	200000.00	0.00	0.00	200000.00	400000.00	0.00	0.00	2025-07-30 01:20:36.505613	1009
2219	409	1532	HD004937	SP000278	VV BIOTIN PLUS (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:36.505613	1057
2220	410	1667	HD004936	SP000140	TOPCIN TC5 PLUS (5lit)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.505613	992
2221	410	1650	HD004936	SP000157	HANTOX 200 (1lit)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	350000.00	0.00	0.00	350000.00	700000.00	0.00	0.00	2025-07-30 01:20:36.505613	992
2222	411	1647	HD004935	SP000161	#TABIC M.B (2000DS)	KH000203	HÀ HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	420000.00	0.00	0.00	420000.00	840000.00	0.00	0.00	2025-07-30 01:20:36.505613	1043
2223	412	1647	HD004934	SP000161	#TABIC M.B (2000DS)	KH0000050	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:36.505613	1182
2224	413	1971	HD004933	SP000548	KIM ĐỐC HỒNG 18G HỘP 100CÂY	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	40000.00	0.00	0.00	40000.00	160000.00	0.00	0.00	2025-07-30 01:20:36.505613	1048
2225	414	1522	HD004932	SP000289	VV AMOXICOL 20 W.S.P (1Kg)	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.505613	1178
2226	415	1590	HD004931	SP000218	#TG IBD M+ (1000DS)	KH000293	CHỊ LOAN -BỐT ĐỎ	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:36.505613	957
2227	415	1591	HD004931	SP000217	#TG IBD M+ (2000DS)	KH000293	CHỊ LOAN -BỐT ĐỎ	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	400000.00	0.00	0.00	400000.00	2000000.00	0.00	0.00	2025-07-30 01:20:36.505613	957
2228	416	1891	HD004930	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000253	ANH PHONG - SUỐI ĐÁ 3	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	80000.00	0.00	0.00	80000.00	240000.00	0.00	0.00	2025-07-30 01:20:36.505613	996
2229	416	1942	HD004930	SP000578	#DỊCH TẢ HANVET	KH000253	ANH PHONG - SUỐI ĐÁ 3	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	70000.00	0.00	0.00	70000.00	210000.00	0.00	0.00	2025-07-30 01:20:36.505613	996
2230	417	1891	HD004929	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000187	ANH PHONG - SUỐI ĐÁ 1	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	80000.00	0.00	0.00	80000.00	640000.00	0.00	0.00	2025-07-30 01:20:36.505613	1058
2231	417	1942	HD004929	SP000578	#DỊCH TẢ HANVET	KH000187	ANH PHONG - SUỐI ĐÁ 1	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	70000.00	0.00	0.00	70000.00	560000.00	0.00	0.00	2025-07-30 01:20:36.505613	1058
2232	418	1728	HD004928	SP000077	AGR TRIMETHOSOL (1lit)	KH0000019	ANH PHONG - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2550000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	850000.00	0.00	0.00	850000.00	2550000.00	0.00	0.00	2025-07-30 01:20:36.505613	1211
2233	419	1638	HD004927	SP000170	#REO VIRUT (1000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	250000.00	0.00	0.00	250000.00	1500000.00	0.00	0.00	2025-07-30 01:20:36.505613	1189
2234	419	1942	HD004927	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	70000.00	0.00	0.00	70000.00	420000.00	0.00	0.00	2025-07-30 01:20:36.505613	1189
2235	419	1622	HD004927	SP000186	#CIRCO (2000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3630000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	330000.00	0.00	0.00	330000.00	3630000.00	0.00	0.00	2025-07-30 01:20:36.505613	1189
2236	420	1955	HD004926	SP000565	#CÚM H5 + H9 (250ml)	KH000388	ANH HỌC (LONG)	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	200000.00	0.00	0.00	200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:36.505613	865
2237	421	1635	HD004924	SP000173	#TEMBUSU CHẾT (250ml)	KH0000108	ĐẠI LÝ TUẤN PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	290000.00	0.00	0.00	290000.00	2900000.00	0.00	0.00	2025-07-30 01:20:36.505613	1131
2238	421	1628	HD004924	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH0000108	ĐẠI LÝ TUẤN PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	780000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	195000.00	0.00	0.00	195000.00	780000.00	0.00	0.00	2025-07-30 01:20:36.505613	1131
2239	421	1622	HD004924	SP000186	#CIRCO (2000DS)	KH0000108	ĐẠI LÝ TUẤN PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.851	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	280000.00	0.00	0.00	280000.00	2800000.00	0.00	0.00	2025-07-30 01:20:36.505613	1131
2817	741	1755	HD1754268864323	SP000049	#AGR POX (1000DS)	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 00:54:25.106	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	220000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	220000.00	0.00	0.00	220000.00	220000.00	0.00	0.00	2025-08-04 00:54:23.683552	\N
2240	422	1877	HD004923	SP000646	MG VIR 114 1000ds ( GUM )	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	230000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	230000.00	0.00	0.00	230000.00	230000.00	0.00	0.00	2025-07-30 01:20:36.505613	1122
2241	422	1876	HD004923	SP000647	MG VIR 114 2000ds ( GUM )	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:36.505613	1122
2242	423	1706	HD004922	SP000099	AGR SORBIMIN (5lit)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:36.505613	1123
2243	423	2024	HD004922	SP000490	AGR - AVICAP (5 lít)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:36.505613	1123
2245	425	1623	HD004920	SP000185	#SCOCVAC 4( TQ)	KH000373	MI TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	450000.00	0.00	0.00	450000.00	4500000.00	0.00	0.00	2025-07-30 01:20:36.505613	879
2246	426	1709	HD004919	SP000096	AGR ALL-LYTE (5Kg)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:36.505613	852
2247	426	1807	HD004919	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	810000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	270000.00	0.00	0.00	270000.00	810000.00	0.00	0.00	2025-07-30 01:20:36.505613	852
2248	426	1450	HD004919	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	390000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	130000.00	0.00	0.00	130000.00	390000.00	0.00	0.00	2025-07-30 01:20:36.505613	852
2249	426	1706	HD004919	SP000099	AGR SORBIMIN (5lit)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:36.505613	852
2250	426	1860	HD004919	SP000663	MG ESCENT S (kg)	KH000402	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:36.505613	852
2251	427	1550	HD004918	SP000259	TG UK ANTISEP 250 (1lit)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	150000.00	0.00	0.00	150000.00	450000.00	0.00	0.00	2025-07-30 01:20:36.505613	1026
2252	428	1547	HD004917	SP000262	VV CEFAXIM (250ml)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	290000.00	0.00	0.00	290000.00	5800000.00	0.00	0.00	2025-07-30 01:20:36.505613	1203
2253	429	1873	HD004916	SP000650	MG VIR 118 (IB BIẾN CHỦNG) 1000ds	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	400000.00	0.00	0.00	400000.00	3200000.00	0.00	0.00	2025-07-30 01:20:36.505613	906
2254	430	1893	HD004915	SP000630	AGR PHOSRENOL (1 kg)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1980000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	660000.00	0.00	0.00	660000.00	1980000.00	0.00	0.00	2025-07-30 01:20:36.505613	1158
2255	430	1807	HD004915	SP000717	TAV-STRESS LYTE PLUS (kg)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	250000.00	0.00	0.00	250000.00	750000.00	0.00	0.00	2025-07-30 01:20:36.505613	1158
2256	430	1534	HD004915	SP000276	VV VITLYTE C (1Kg)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	80000.00	0.00	0.00	80000.00	240000.00	0.00	0.00	2025-07-30 01:20:36.505613	1158
2257	431	1804	HD004914	SP000720	#TG ND IB PLUS EDS 1000ds	KH000317	CÔ THẢO - GÀ ĐẺ  - ĐỨC HUY 12K	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	19000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	1900000.00	0.00	0.00	1900000.00	19000000.00	0.00	0.00	2025-07-30 01:20:36.505613	934
2258	432	1594	HD004913	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	11000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				50.00	220000.00	0.00	0.00	220000.00	11000000.00	0.00	0.00	2025-07-30 01:20:36.740246	1026
2259	433	1941	HD004912	SP000579	TC NEO MEN BÀO TỬ (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	20000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	20000.00	0.00	0.00	20000.00	20000.00	0.00	0.00	2025-07-30 01:20:36.740246	1057
2260	434	1836	HD004911.01	SP000688	KHÁNG THỂ NẮP XANH	KH0000019	ANH PHONG - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1760000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	160000.00	0.00	0.00	160000.00	1760000.00	0.00	0.00	2025-07-30 01:20:36.740246	1211
2261	434	1547	HD004911.01	SP000262	VV CEFAXIM (250ml)	KH0000019	ANH PHONG - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				18.00	290000.00	0.00	0.00	290000.00	5220000.00	0.00	0.00	2025-07-30 01:20:36.740246	1211
2262	435	2078	HD004910.01	SP000435	VV CHYMOSIN (100ml)	KH0000103	ANH GIA CHÍCH	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:36.740246	1136
2263	435	1845	HD004910.01	SP000679	GENTACINE 250ml	KH0000103	ANH GIA CHÍCH	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:36.740246	1136
2264	436	1704	HD004909	SP000101	AGR SUPPER MEAT (2lit)	KH000283	ANH ĐỨC - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:36.740246	967
2265	437	1870	HD004908	SP000653	MG MEGA - GREEN (kg)	KH000369	ANH HẢI CJ	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	60000.00	0.00	0.00	60000.00	600000.00	0.00	0.00	2025-07-30 01:20:36.740246	883
2266	438	1810	HD004907	SP000714	MG PARADOL K-C (kg)	KH000358	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	200000.00	0.00	0.00	200000.00	400000.00	0.00	0.00	2025-07-30 01:20:36.740246	894
2267	438	1862	HD004907	SP000661	MEGA VIT (1kg)	KH000358	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	110000.00	0.00	0.00	110000.00	220000.00	0.00	0.00	2025-07-30 01:20:36.740246	894
2268	438	1857	HD004907	SP000666	MG DICLASOL (lít)	KH000358	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	850000.00	0.00	0.00	850000.00	850000.00	0.00	0.00	2025-07-30 01:20:36.740246	894
2269	439	1594	HD004906	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000401	ANH ÂN - PHÚ TÚC	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	220000.00	0.00	0.00	220000.00	220000.00	0.00	0.00	2025-07-30 01:20:36.740246	853
2270	440	1590	HD004905	SP000218	#TG IBD M+ (1000DS)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:36.740246	861
2271	440	1591	HD004905	SP000217	#TG IBD M+ (2000DS)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	400000.00	0.00	0.00	400000.00	800000.00	0.00	0.00	2025-07-30 01:20:36.740246	861
2272	441	1485	HD004904	SP000329	VV BETA GIUCAN 50 (1KG)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.740246	1165
2273	442	1836	HD004903	SP000688	KHÁNG THỂ NẮP XANH	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	160000.00	0.00	0.00	160000.00	480000.00	0.00	0.00	2025-07-30 01:20:36.740246	1158
2274	442	1547	HD004903	SP000262	VV CEFAXIM (250ml)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	870000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	290000.00	0.00	0.00	290000.00	870000.00	0.00	0.00	2025-07-30 01:20:36.740246	1158
2275	443	1695	HD004902	SP000111	AGR MILK PLUS (1Kg)	KH000400	ANH TỨ	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:36.740246	854
2276	443	1593	HD004902	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000400	ANH TỨ	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:36.740246	854
2277	443	1594	HD004902	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000400	ANH TỨ	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	220000.00	0.00	0.00	220000.00	220000.00	0.00	0.00	2025-07-30 01:20:36.740246	854
2278	444	1637	HD004901	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	350000.00	0.00	0.00	350000.00	2800000.00	0.00	0.00	2025-07-30 01:20:36.740246	1189
2279	444	1626	HD004901	SP000182	CEFOTAXIM (Bột 2g)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				80.00	30000.00	0.00	0.00	30000.00	2400000.00	0.00	0.00	2025-07-30 01:20:36.740246	1189
2280	444	1750	HD004901	SP000054	AGR GENTACIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	100000.00	0.00	0.00	100000.00	800000.00	0.00	0.00	2025-07-30 01:20:36.740246	1189
2281	444	1942	HD004901	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	70000.00	0.00	0.00	70000.00	560000.00	0.00	0.00	2025-07-30 01:20:36.740246	1189
2282	445	1623	HD004900	SP000185	#SCOCVAC 4( TQ)	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	650000.00	0.00	0.00	650000.00	7150000.00	0.00	0.00	2025-07-30 01:20:36.740246	1115
2283	446	1760	HD004898	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH0000059	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.85	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	280000.00	0.00	0.00	280000.00	1120000.00	0.00	0.00	2025-07-30 01:20:36.740246	1174
2284	447	1698	HD004897	SP000108	AGR VITAMIN C150 (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	90000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	90000.00	0.00	0.00	90000.00	90000.00	0.00	0.00	2025-07-30 01:20:36.740246	1057
2285	448	1492	HD004896	SP000322	VV FLOR-MAX (1Lit)	KH000398	TRUNG - BƯU ĐIỆN - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:36.740246	856
2286	449	1760	HD004895.01	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH000124	ANH HƯNG - GÀ - SUỐI ĐÁ	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	280000.00	0.00	0.00	280000.00	2800000.00	0.00	0.00	2025-07-30 01:20:36.740246	1117
2287	449	1761	HD004895.01	SP000043	#IZOVAC H120 - LASOTA (1000DS)	KH000124	ANH HƯNG - GÀ - SUỐI ĐÁ	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	130000.00	0.00	0.00	130000.00	260000.00	0.00	0.00	2025-07-30 01:20:36.740246	1117
2288	450	1476	HD004894	SP000338	VV SULTRIM 50 TAV (1Kg)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1400000.00	0.00	0.00	1400000.00	4200000.00	0.00	0.00	2025-07-30 01:20:36.740246	885
2289	451	1557	HD004893	SP000252	TG NUTRILACZYM (1Kg) (XÁ)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:36.740246	1026
2290	451	1576	HD004893	SP000232	TG SUPER-VITAMINO (1Kg)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:36.740246	1026
2291	452	1557	HD004892	SP000252	TG NUTRILACZYM (1Kg) (XÁ)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	140000.00	0.00	0.00	140000.00	1400000.00	0.00	0.00	2025-07-30 01:20:36.740246	1026
2292	452	1576	HD004892	SP000232	TG SUPER-VITAMINO (1Kg)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	250000.00	0.00	0.00	250000.00	5000000.00	0.00	0.00	2025-07-30 01:20:36.740246	1026
2293	453	1550	HD004891	SP000259	TG UK ANTISEP 250 (1lit)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	115000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	115000.00	0.00	0.00	115000.00	115000.00	0.00	0.00	2025-07-30 01:20:36.740246	1026
2294	453	2004	HD004891	SP000514	TG FLODOX HI (1lit)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	900000.00	0.00	0.00	900000.00	1800000.00	0.00	0.00	2025-07-30 01:20:36.740246	1026
2295	453	1584	HD004891	SP000224	#TG TẢ + CÚM (500ml)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	1000000.00	0.00	0.00	1000000.00	7000000.00	0.00	0.00	2025-07-30 01:20:36.740246	1026
2296	454	1750	HD004890	SP000054	AGR GENTACIN (100ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	100000.00	0.00	0.00	100000.00	800000.00	0.00	0.00	2025-07-30 01:20:36.740246	1210
2297	454	1626	HD004890	SP000182	CEFOTAXIM (Bột 2g)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				60.00	30000.00	0.00	0.00	30000.00	1800000.00	0.00	0.00	2025-07-30 01:20:36.740246	1210
2298	454	1541	HD004890	SP000268	VV ANALGIN (100ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	35000.00	0.00	0.00	35000.00	140000.00	0.00	0.00	2025-07-30 01:20:36.740246	1210
2299	455	2085	HD004889	SP000427	#INTERFRON(100ML)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	350000.00	0.00	0.00	350000.00	1400000.00	0.00	0.00	2025-07-30 01:20:36.740246	1158
2300	456	1638	HD004888	SP000170	#REO VIRUT (1000DS)	KH000296	KHẢI HAIDER - BÀU CẠN LÔ 20k	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	250000.00	0.00	0.00	250000.00	5000000.00	0.00	0.00	2025-07-30 01:20:36.740246	954
2301	456	1631	HD004888	SP000177	#RỤT MỎ RINGPU (250ml)	KH000296	KHẢI HAIDER - BÀU CẠN LÔ 20k	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				40.00	140000.00	0.00	0.00	140000.00	5600000.00	0.00	0.00	2025-07-30 01:20:36.740246	954
2302	457	1628	HD004887	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH0000018	KHẢI 8.500 CON - XUYÊN MỘC	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3680000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	230000.00	0.00	0.00	230000.00	3680000.00	0.00	0.00	2025-07-30 01:20:36.740246	1212
2303	458	1635	HD004886	SP000173	#TEMBUSU CHẾT (250ml)	KH0000076	EM SƠN - ECOVET	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	290000.00	0.00	0.00	290000.00	4350000.00	0.00	0.00	2025-07-30 01:20:36.740246	1159
2304	458	1627	HD004886	SP000181	#ND-IB-H9 (250ml)	KH0000076	EM SƠN - ECOVET	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	220000.00	0.00	0.00	220000.00	3300000.00	0.00	0.00	2025-07-30 01:20:36.740246	1159
2305	459	1716	HD004885	SP000089	AGR PERMETHRIN PLUS (100ml)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	70000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	70000.00	0.00	0.00	70000.00	70000.00	0.00	0.00	2025-07-30 01:20:36.740246	1057
2306	460	1750	HD004884	SP000054	AGR GENTACIN (100ml)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	100000.00	0.00	0.00	100000.00	2000000.00	0.00	0.00	2025-07-30 01:20:36.740246	1158
2307	460	1626	HD004884	SP000182	CEFOTAXIM (Bột 2g)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				170.00	30000.00	0.00	0.00	30000.00	5100000.00	0.00	0.00	2025-07-30 01:20:36.740246	1158
2308	461	1723	HD004883	SP000082	AGR DOXYCOL (1Kg)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1450000.00	0.00	0.00	1450000.00	2900000.00	0.00	0.00	2025-07-30 01:20:36.973249	885
2354	490	1432	HD004854	SP000383	KIM 9x13 (Vỉ)	KH0000026	TUYẾN DONAVET	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	20000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	10000.00	0.00	0.00	10000.00	20000.00	0.00	0.00	2025-07-30 01:20:36.973249	1205
2309	461	1691	HD004883	SP000115	AGR PARA C (1Kg)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	140000.00	0.00	0.00	140000.00	1400000.00	0.00	0.00	2025-07-30 01:20:36.973249	885
2310	462	1695	HD004882	SP000111	AGR MILK PLUS (1Kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:36.973249	1176
2311	462	1760	HD004882	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	280000.00	0.00	0.00	280000.00	2240000.00	0.00	0.00	2025-07-30 01:20:36.973249	1176
2312	463	1450	HD004881	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	910000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	130000.00	0.00	0.00	130000.00	910000.00	0.00	0.00	2025-07-30 01:20:36.973249	885
2313	463	1706	HD004881	SP000099	AGR SORBIMIN (5lit)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:36.973249	885
2314	464	1587	HD004880	SP000221	#TG POX (1000DS)	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	220000.00	0.00	0.00	220000.00	220000.00	0.00	0.00	2025-07-30 01:20:36.973249	1178
2315	465	1485	HD004879	SP000329	VV BETA GIUCAN 50 (1KG)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:36.973249	1165
2316	465	1893	HD004879	SP000630	AGR PHOSRENOL (1 kg)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	660000.00	0.00	0.00	660000.00	660000.00	0.00	0.00	2025-07-30 01:20:36.973249	1165
2317	466	1584	HD004878	SP000224	#TG TẢ + CÚM (500ml)	KH0000105	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1300000.00	0.00	0.00	1300000.00	3900000.00	0.00	0.00	2025-07-30 01:20:36.973249	1134
2318	467	1634	HD004877.01	SP000174	#RỤT MỎ SINDER (250ml)	KH000399	ANH THIÊN - TÍN NGHĨA - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	150000.00	0.00	0.00	150000.00	600000.00	0.00	0.00	2025-07-30 01:20:36.973249	855
2319	467	1638	HD004877.01	SP000170	#REO VIRUT (1000DS)	KH000399	ANH THIÊN - TÍN NGHĨA - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.973249	855
2320	467	1891	HD004877.01	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000399	ANH THIÊN - TÍN NGHĨA - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	80000.00	0.00	0.00	80000.00	160000.00	0.00	0.00	2025-07-30 01:20:36.973249	855
2321	468	1638	HD004876	SP000170	#REO VIRUT (1000DS)	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	0.00	250000.00	2500000.00	0.00	0.00	2025-07-30 01:20:36.973249	1023
2322	468	1631	HD004876	SP000177	#RỤT MỎ RINGPU (250ml)	KH000224	CHỊ QUY - BÌNH DƯƠNG	1	\N	\N	\N	1970-01-01 00:00:45.849	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	170000.00	0.00	0.00	170000.00	3400000.00	0.00	0.00	2025-07-30 01:20:36.973249	1023
2323	469	1742	HD004875	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	350000.00	0.00	0.00	350000.00	5600000.00	0.00	0.00	2025-07-30 01:20:36.973249	1215
2324	469	1541	HD004875	SP000268	VV ANALGIN (100ml)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	35000.00	0.00	0.00	35000.00	700000.00	0.00	0.00	2025-07-30 01:20:36.973249	1215
2326	470	1547	HD004874	SP000262	VV CEFAXIM (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				40.00	270000.00	0.00	0.00	270000.00	10800000.00	0.00	0.00	2025-07-30 01:20:36.973249	1135
2327	471	1635	HD004873	SP000173	#TEMBUSU CHẾT (250ml)	KH000180	CHỊ HƯƠNG-THÀNH AN	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1740000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	290000.00	0.00	0.00	290000.00	1740000.00	0.00	0.00	2025-07-30 01:20:36.973249	1062
2328	472	1432	HD004872	SP000383	KIM 9x13 (Vỉ)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	10000.00	0.00	0.00	10000.00	30000.00	0.00	0.00	2025-07-30 01:20:36.973249	1057
2329	473	1522	HD004871	SP000289	VV AMOXICOL 20 W.S.P (1Kg)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:36.973249	1210
2330	474	1698	HD004870.02	SP000108	AGR VITAMIN C150 (1Kg)	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	180000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	90000.00	0.00	0.00	90000.00	180000.00	0.00	0.00	2025-07-30 01:20:36.973249	889
2331	474	1516	HD004870.02	SP000296	VV FLUCONAZOL (1Lit)	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:36.973249	889
2368	496	1725	HD004848.01	SP000080	AGR AMOXICOL POWDER (1Kg)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1000000.00	0.00	0.00	1000000.00	1000000.00	0.00	0.00	2025-07-30 01:20:37.190933	1080
2332	475	1877	HD004869	SP000646	MG VIR 114 1000ds ( GUM )	KH000390	ANH TÀI - MARTINO (BÀ NGOẠI)	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	690000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	230000.00	0.00	0.00	230000.00	690000.00	0.00	0.00	2025-07-30 01:20:36.973249	864
2333	476	1877	HD004868.02	SP000646	MG VIR 114 1000ds ( GUM )	KH000122	ANH TÀI - GÀ TA - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	690000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	230000.00	0.00	0.00	230000.00	690000.00	0.00	0.00	2025-07-30 01:20:36.973249	1113
2334	477	1520	HD004867	SP000291	VV COLIS 50 WSP (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:36.973249	1215
2335	477	1505	HD004867	SP000308	VV FLOCOL 50 WSP (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1200000.00	0.00	0.00	1200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:36.973249	1215
2336	478	1725	HD004866	SP000080	AGR AMOXICOL POWDER (1Kg)	KH0000063	CHÚ ĐÔNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	1100000.00	0.00	0.00	1100000.00	4400000.00	0.00	0.00	2025-07-30 01:20:36.973249	1171
2337	479	1701	HD004865	SP000105	AGR BCOMPLEX C (1Kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	120000.00	0.00	0.00	120000.00	1200000.00	0.00	0.00	2025-07-30 01:20:36.973249	1176
2338	480	1615	HD004864	SP000193	#MAX 5CLON30 (5000DS)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	540000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	540000.00	0.00	0.00	540000.00	540000.00	0.00	0.00	2025-07-30 01:20:36.973249	1165
2339	480	1617	HD004864	SP000191	#MAX 5CLON30 (1000DS)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:36.973249	1165
2340	481	1447	HD004863	SP000368	TC LACTIZYM CAO TỎI (Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:36.973249	1057
2818	741	1630	HD1754268864323	SP000178	#CÚM AVAC RE5 (250ml)	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 00:54:25.106	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	200000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-08-04 00:54:23.683552	\N
2341	482	1635	HD004862	SP000173	#TEMBUSU CHẾT (250ml)	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	350000.00	0.00	0.00	350000.00	2100000.00	0.00	0.00	2025-07-30 01:20:36.973249	1192
2342	483	1805	HD004861	SP000719	AGR TOLFERIUM 100ml	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	210000.00	0.00	0.00	210000.00	2100000.00	0.00	0.00	2025-07-30 01:20:36.973249	1080
2343	484	1891	HD004860	VIÊM GAN HANVET	VIÊM GAN HANVET	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	80000.00	0.00	0.00	80000.00	240000.00	0.00	0.00	2025-07-30 01:20:36.973249	1209
2344	484	1634	HD004860	SP000174	#RỤT MỎ SINDER (250ml)	KH0000021	XUÂN - VỊT ( NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	150000.00	0.00	0.00	150000.00	900000.00	0.00	0.00	2025-07-30 01:20:36.973249	1209
2345	485	1511	HD004859	SP000302	VV AMOXCOLI 50 WSP (1Kg)	KH000007	CHÚ PHƯỚC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	900000.00	0.00	0.00	900000.00	4500000.00	0.00	0.00	2025-07-30 01:20:36.973249	1221
2346	486	1593	HD004858	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH0000055	ANH SƠN ( BỘ) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	120000.00	0.00	0.00	120000.00	240000.00	0.00	0.00	2025-07-30 01:20:36.973249	1177
2347	486	1594	HD004858	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH0000055	ANH SƠN ( BỘ) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3434000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				17.00	202000.00	0.00	0.00	202000.00	3434000.00	0.00	0.00	2025-07-30 01:20:36.973249	1177
2348	487	1630	HD004857	SP000178	#CÚM AVAC RE5 (250ml)	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	170000.00	0.00	0.00	170000.00	3400000.00	0.00	0.00	2025-07-30 01:20:36.973249	1139
2349	488	1891	HD004856	VIÊM GAN HANVET	VIÊM GAN HANVET	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	80000.00	0.00	0.00	80000.00	320000.00	0.00	0.00	2025-07-30 01:20:36.973249	1210
2350	488	1639	HD004856	SP000169	#REO VIRUT (500DS)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	150000.00	0.00	0.00	150000.00	1200000.00	0.00	0.00	2025-07-30 01:20:36.973249	1210
2351	488	1634	HD004856	SP000174	#RỤT MỎ SINDER (250ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	150000.00	0.00	0.00	150000.00	1200000.00	0.00	0.00	2025-07-30 01:20:36.973249	1210
2352	489	1673	HD004855	SP000134	VAC PAC PLUS (5g)	KH000385	QUYỀN - TAM HOÀNG LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	30000.00	0.00	0.00	30000.00	30000.00	0.00	0.00	2025-07-30 01:20:36.973249	868
2353	490	1942	HD004854	SP000578	#DỊCH TẢ HANVET	KH0000026	TUYẾN DONAVET	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	70000.00	0.00	0.00	70000.00	210000.00	0.00	0.00	2025-07-30 01:20:36.973249	1205
2355	491	1523	HD004853	SP000288	VV COTRIM-F (1Kg)	KH000377	NHUNG VIETVET	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	746000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	373000.00	0.00	0.00	373000.00	746000.00	0.00	0.00	2025-07-30 01:20:36.973249	875
2356	491	1535	HD004853	SP000275	VV ENROVET INJ (100ml)	KH000377	NHUNG VIETVET	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				30.00	28000.00	0.00	0.00	28000.00	840000.00	0.00	0.00	2025-07-30 01:20:36.973249	875
2357	492	1750	HD004852	SP000054	AGR GENTACIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	100000.00	0.00	0.00	100000.00	800000.00	0.00	0.00	2025-07-30 01:20:36.973249	1189
2358	492	1631	HD004852	SP000177	#RỤT MỎ RINGPU (250ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2880000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	180000.00	0.00	0.00	180000.00	2880000.00	0.00	0.00	2025-07-30 01:20:37.190933	1189
2359	492	1541	HD004852	SP000268	VV ANALGIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	35000.00	0.00	0.00	35000.00	280000.00	0.00	0.00	2025-07-30 01:20:37.190933	1189
2360	492	2078	HD004852	SP000435	VV CHYMOSIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	100000.00	0.00	0.00	100000.00	800000.00	0.00	0.00	2025-07-30 01:20:37.190933	1189
2361	492	1626	HD004852	SP000182	CEFOTAXIM (Bột 2g)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				80.00	30000.00	0.00	0.00	30000.00	2400000.00	0.00	0.00	2025-07-30 01:20:37.190933	1189
2362	493	1432	HD004851	SP000383	KIM 9x13 (Vỉ)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:37.190933	1057
2363	494	1755	HD004850.01	SP000049	#AGR POX (1000DS)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	975000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	195000.00	0.00	0.00	195000.00	975000.00	0.00	0.00	2025-07-30 01:20:37.190933	1180
2364	494	1938	HD004850.01	SP000583	#SANAVAC ND G7	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	850000.00	0.00	0.00	850000.00	5950000.00	0.00	0.00	2025-07-30 01:20:37.190933	1180
2365	495	1891	HD004849.01	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000398	TRUNG - BƯU ĐIỆN - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	80000.00	0.00	0.00	80000.00	320000.00	0.00	0.00	2025-07-30 01:20:37.190933	856
2366	495	1638	HD004849.01	SP000170	#REO VIRUT (1000DS)	KH000398	TRUNG - BƯU ĐIỆN - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	250000.00	0.00	0.00	250000.00	1000000.00	0.00	0.00	2025-07-30 01:20:37.190933	856
2367	495	1634	HD004849.01	SP000174	#RỤT MỎ SINDER (250ml)	KH000398	TRUNG - BƯU ĐIỆN - LÔ 2	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	150000.00	0.00	0.00	150000.00	1200000.00	0.00	0.00	2025-07-30 01:20:37.190933	856
2369	496	1728	HD004848.01	SP000077	AGR TRIMETHOSOL (1lit)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	710000.00	0.00	0.00	710000.00	4260000.00	0.00	0.00	2025-07-30 01:20:37.190933	1080
2370	496	1761	HD004848.01	SP000043	#IZOVAC H120 - LASOTA (1000DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:37.190933	1080
2371	497	1505	HD004847	SP000308	VV FLOCOL 50 WSP (1Kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1200000.00	0.00	0.00	1200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:37.190933	1032
2372	498	1886	HD004846.01	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH000385	QUYỀN - TAM HOÀNG LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	480000.00	0.00	0.00	480000.00	4800000.00	0.00	0.00	2025-07-30 01:20:37.190933	868
2373	499	1505	HD004845	SP000308	VV FLOCOL 50 WSP (1Kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1200000.00	0.00	0.00	1200000.00	2400000.00	0.00	0.00	2025-07-30 01:20:37.190933	1226
2374	499	1552	HD004845	SP000257	TG CHYMOTRY (1lit)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	600000.00	0.00	0.00	600000.00	1800000.00	0.00	0.00	2025-07-30 01:20:37.190933	1226
2375	499	1723	HD004845	SP000082	AGR DOXYCOL (1Kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1450000.00	0.00	0.00	1450000.00	2900000.00	0.00	0.00	2025-07-30 01:20:37.190933	1226
2376	500	1723	HD004844	SP000082	AGR DOXYCOL (1Kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1450000.00	0.00	0.00	1450000.00	1450000.00	0.00	0.00	2025-07-30 01:20:37.190933	1032
2377	501	1485	HD004843.01	SP000329	VV BETA GIUCAN 50 (1KG)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:37.190933	1165
2378	501	2080	HD004843.01	SP000433	THUỐC TÍM	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	150000.00	0.00	0.00	150000.00	750000.00	0.00	0.00	2025-07-30 01:20:37.190933	1165
2379	502	1551	HD004842.01	SP000258	TG BUTAPHO (1lit)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	200000.00	0.00	0.00	200000.00	1600000.00	0.00	0.00	2025-07-30 01:20:37.190933	1026
2380	503	1554	HD004841	SP000255	TG LIVER COOL (1lit)	KH000317	CÔ THẢO - GÀ ĐẺ  - ĐỨC HUY 12K	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				36.00	210000.00	0.00	0.00	210000.00	7560000.00	0.00	0.00	2025-07-30 01:20:37.190933	934
2381	504	1470	HD004840	SP000344	VV ANTIVIUS-TAV (1Lit)	KH000384	ANH HỌC - CTY TIẾN THẠNH	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	700000.00	0.00	0.00	700000.00	2100000.00	0.00	0.00	2025-07-30 01:20:37.190933	869
2382	504	1472	HD004840	SP000342	VV CALCI PLUS-TAV (1Lit)	KH000384	ANH HỌC - CTY TIẾN THẠNH	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	160000.00	0.00	0.00	160000.00	480000.00	0.00	0.00	2025-07-30 01:20:37.190933	869
2383	505	1637	HD004839	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH000240	ANH TRƯỜNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:37.190933	1009
2384	505	1942	HD004839	SP000578	#DỊCH TẢ HANVET	KH000240	ANH TRƯỜNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	70000.00	0.00	0.00	70000.00	140000.00	0.00	0.00	2025-07-30 01:20:37.190933	1009
2385	506	1635	HD004838	SP000173	#TEMBUSU CHẾT (250ml)	KH0000042	CHỊ QUYÊN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	400000.00	0.00	0.00	400000.00	4800000.00	0.00	0.00	2025-07-30 01:20:37.190933	1190
2386	506	1773	HD004838	SP000014	INTERGREEN ASPISURE 50% (1Kg)	KH0000042	CHỊ QUYÊN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	250000.00	0.00	0.00	250000.00	750000.00	0.00	0.00	2025-07-30 01:20:37.190933	1190
2387	507	1535	HD004837	SP000275	VV ENROVET INJ (100ml)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	40000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	40000.00	0.00	0.00	40000.00	40000.00	0.00	0.00	2025-07-30 01:20:37.190933	1057
2388	508	1807	HD004836	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000342	ANH HÀO	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	540000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	270000.00	0.00	0.00	270000.00	540000.00	0.00	0.00	2025-07-30 01:20:37.190933	910
2389	509	1635	HD004835.01	SP000173	#TEMBUSU CHẾT (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	290000.00	0.00	0.00	290000.00	2900000.00	0.00	0.00	2025-07-30 01:20:37.190933	1135
2390	509	1541	HD004835.01	SP000268	VV ANALGIN (100ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				100.00	30000.00	0.00	0.00	30000.00	3000000.00	0.00	0.00	2025-07-30 01:20:37.190933	1135
2391	509	1547	HD004835.01	SP000262	VV CEFAXIM (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	27000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				100.00	270000.00	0.00	0.00	270000.00	27000000.00	0.00	0.00	2025-07-30 01:20:37.190933	1135
2392	510	1507	HD004834.01	SP000306	VV DOXICLIN 50 WSP (1Kg)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1900000.00	0.00	0.00	1900000.00	3800000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2393	510	1500	HD004834.01	SP000314	VV CEPHAXIN 50 WSP (1Kg)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1300000.00	0.00	0.00	1300000.00	2600000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2394	510	1450	HD004834.01	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	130000.00	0.00	0.00	130000.00	1300000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2395	510	1560	HD004834.01	SP000248	TG TT 02 (250ML)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	450000.00	0.00	0.00	450000.00	1800000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2396	510	1706	HD004834.01	SP000099	AGR SORBIMIN (5lit)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	650000.00	0.00	0.00	650000.00	1950000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2397	510	1671	HD004834.01	SP000136	TOPCIN CALPHOS PLUS (5lit)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	620000.00	0.00	0.00	620000.00	1240000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2398	510	1709	HD004834.01	SP000096	AGR ALL-LYTE (5Kg)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2399	510	1775	HD004834.01	SP000012	NOVAVETER PARADOL K,C (1Kg)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	160000.00	0.00	0.00	160000.00	800000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2400	510	1725	HD004834.01	SP000080	AGR AMOXICOL POWDER (1Kg)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1100000.00	0.00	0.00	1100000.00	2200000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2401	510	1622	HD004834.01	SP000186	#CIRCO (2000DS)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	400000.00	0.00	0.00	400000.00	1600000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2402	510	1635	HD004834.01	SP000173	#TEMBUSU CHẾT (250ml)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	400000.00	0.00	0.00	400000.00	1600000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2403	510	1636	HD004834.01	SP000172	#TEMBUSU SỐNG DOBIO (500DS)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	300000.00	0.00	0.00	300000.00	2400000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2404	510	1891	HD004834.01	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	80000.00	0.00	0.00	80000.00	320000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2405	510	1638	HD004834.01	SP000170	#REO VIRUT (1000DS)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	250000.00	0.00	0.00	250000.00	1000000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2406	510	1634	HD004834.01	SP000174	#RỤT MỎ SINDER (250ml)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	150000.00	0.00	0.00	150000.00	1200000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2407	510	1432	HD004834.01	SP000383	KIM 9x13 (Vỉ)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	10000.00	0.00	0.00	10000.00	100000.00	0.00	0.00	2025-07-30 01:20:37.190933	988
2408	510	1807	HD004834.01	SP000717	TAV-STRESS LYTE PLUS (kg)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	330000.00	0.00	0.00	330000.00	3300000.00	0.00	0.00	2025-07-30 01:20:37.40761	988
2409	510	1530	HD004834.01	SP000280	VV GLUCO K+C (1Kg)	KH000262	LONG - BIÊN HOÀ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	90000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	90000.00	0.00	0.00	90000.00	90000.00	0.00	0.00	2025-07-30 01:20:37.40761	988
2410	511	1807	HD004833	SP000717	TAV-STRESS LYTE PLUS (kg)	KH0000031	CÔ BÌNH - AN LỘC	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	250000.00	0.00	0.00	250000.00	3750000.00	0.00	0.00	2025-07-30 01:20:37.40761	1200
2411	511	1878	HD004833	SP000645	AGR GENTADOX (kg)	KH0000031	CÔ BÌNH - AN LỘC	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	900000.00	0.00	0.00	900000.00	1800000.00	0.00	0.00	2025-07-30 01:20:37.40761	1200
2412	511	1709	HD004833	SP000096	AGR ALL-LYTE (5Kg)	KH0000031	CÔ BÌNH - AN LỘC	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:37.40761	1200
2413	512	1474	HD004832	SP000340	VV ENROFLOXACINA-TAV 20% (1Lit)	KH000377	NHUNG VIETVET	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	16200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				36.00	450000.00	0.00	0.00	450000.00	16200000.00	0.00	0.00	2025-07-30 01:20:37.40761	875
2414	513	1483	HD004831	SP000331	VV NEOCIN 500 (1Kg)	KH000303	ANH LÂM (6K) - TRẠI 3	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	650000.00	0.00	0.00	650000.00	1300000.00	0.00	0.00	2025-07-30 01:20:37.40761	947
2415	514	1668	HD004830	SP000139	TOPCIN TC5 PLUS (1lit)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	120000.00	0.00	0.00	120000.00	1200000.00	0.00	0.00	2025-07-30 01:20:37.40761	1185
2416	514	1477	HD004830	SP000337	VV BENGLUXIDE (1Lit)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	120000.00	0.00	0.00	120000.00	1200000.00	0.00	0.00	2025-07-30 01:20:37.40761	1185
2417	515	1836	HD004829	SP000688	KHÁNG THỂ NẮP XANH	KH0000036	ANH PHONG - SUỐI ĐÁ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	160000.00	0.00	0.00	160000.00	1920000.00	0.00	0.00	2025-07-30 01:20:37.40761	1195
2418	515	1547	HD004829	SP000262	VV CEFAXIM (250ml)	KH0000036	ANH PHONG - SUỐI ĐÁ 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	290000.00	0.00	0.00	290000.00	2900000.00	0.00	0.00	2025-07-30 01:20:37.40761	1195
2420	517	1761	HD004827	SP000043	#IZOVAC H120 - LASOTA (1000DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:37.40761	1080
2421	517	1760	HD004827	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	280000.00	0.00	0.00	280000.00	560000.00	0.00	0.00	2025-07-30 01:20:37.40761	1080
2422	517	1754	HD004827	SP000050	#IZOVAC ND (500ml)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	700000.00	0.00	0.00	700000.00	2100000.00	0.00	0.00	2025-07-30 01:20:37.40761	1080
2423	518	1638	HD004826	SP000170	#REO VIRUT (1000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	250000.00	0.00	0.00	250000.00	1250000.00	0.00	0.00	2025-07-30 01:20:37.40761	1189
2424	518	1622	HD004826	SP000186	#CIRCO (2000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	330000.00	0.00	0.00	330000.00	1650000.00	0.00	0.00	2025-07-30 01:20:37.40761	1189
2425	518	1942	HD004826	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	70000.00	0.00	0.00	70000.00	350000.00	0.00	0.00	2025-07-30 01:20:37.40761	1189
2426	518	1628	HD004826	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	0.00	250000.00	2500000.00	0.00	0.00	2025-07-30 01:20:37.40761	1189
2427	519	1955	HD004825	SP000565	#CÚM H5 + H9 (250ml)	KH0000042	CHỊ QUYÊN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	200000.00	0.00	0.00	200000.00	1000000.00	0.00	0.00	2025-07-30 01:20:37.40761	1190
2428	520	1639	HD004824	SP000169	#REO VIRUT (500DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	85000.00	0.00	0.00	85000.00	850000.00	0.00	0.00	2025-07-30 01:20:37.40761	1135
2429	520	1637	HD004824	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				30.00	110000.00	0.00	0.00	110000.00	3300000.00	0.00	0.00	2025-07-30 01:20:37.40761	1135
2430	521	1810	HD004823.01	SP000714	MG PARADOL K-C (kg)	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:37.40761	857
2431	521	1876	HD004823.01	SP000647	MG VIR 114 2000ds ( GUM )	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-07-30 01:20:37.40761	857
2432	521	1877	HD004823.01	SP000646	MG VIR 114 1000ds ( GUM )	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	230000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	230000.00	0.00	0.00	230000.00	230000.00	0.00	0.00	2025-07-30 01:20:37.40761	857
2433	522	1856	HD004822	SP000667	MG REVIVAL LIQUID (lít)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	500000.00	0.00	0.00	500000.00	2000000.00	0.00	0.00	2025-07-30 01:20:37.40761	906
2434	522	1862	HD004822	SP000661	MEGA VIT (1kg)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	110000.00	0.00	0.00	110000.00	220000.00	0.00	0.00	2025-07-30 01:20:37.40761	906
2435	522	1810	HD004822	SP000714	MG PARADOL K-C (kg)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	200000.00	0.00	0.00	200000.00	400000.00	0.00	0.00	2025-07-30 01:20:37.40761	906
2436	523	1520	HD004821	SP000291	VV COLIS 50 WSP (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:37.40761	1215
2437	523	1505	HD004821	SP000308	VV FLOCOL 50 WSP (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1200000.00	0.00	0.00	1200000.00	1200000.00	0.00	0.00	2025-07-30 01:20:37.40761	1215
2438	524	1635	HD004820	SP000173	#TEMBUSU CHẾT (250ml)	KH000253	ANH PHONG - SUỐI ĐÁ 3	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	400000.00	0.00	0.00	400000.00	1200000.00	0.00	0.00	2025-07-30 01:20:37.40761	996
2439	525	1635	HD004819	SP000173	#TEMBUSU CHẾT (250ml)	KH000187	ANH PHONG - SUỐI ĐÁ 1	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	400000.00	0.00	0.00	400000.00	3600000.00	0.00	0.00	2025-07-30 01:20:37.40761	1058
2440	526	1622	HD004818	SP000186	#CIRCO (2000DS)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	320000.00	0.00	0.00	320000.00	640000.00	0.00	0.00	2025-07-30 01:20:37.40761	987
2441	526	1640	HD004818	SP000168	#DỊCH TẢ VỊT-NAVETCO (1000DS)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	60000.00	0.00	0.00	60000.00	240000.00	0.00	0.00	2025-07-30 01:20:37.40761	987
2442	527	1630	HD004817	SP000178	#CÚM AVAC RE5 (250ml)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	200000.00	0.00	0.00	200000.00	1600000.00	0.00	0.00	2025-07-30 01:20:37.40761	1032
2443	528	1594	HD004816	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH0000103	ANH GIA CHÍCH	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	220000.00	0.00	0.00	220000.00	220000.00	0.00	0.00	2025-07-30 01:20:37.40761	1136
2444	529	1549	HD004815	SP000260	VV CEFTI-S (250ml)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5510000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				19.00	290000.00	0.00	0.00	290000.00	5510000.00	0.00	0.00	2025-07-30 01:20:37.40761	1215
2445	530	2073	HD004814	SP000440	#VH + H120 (2000DS)	KH0000050	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	280000.00	0.00	0.00	280000.00	560000.00	0.00	0.00	2025-07-30 01:20:37.40761	1182
2446	531	1755	HD004813	SP000049	#AGR POX (1000DS)	KH000385	QUYỀN - TAM HOÀNG LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1760000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	220000.00	0.00	0.00	220000.00	1760000.00	0.00	0.00	2025-07-30 01:20:37.40761	868
2447	531	1584	HD004813	SP000224	#TG TẢ + CÚM (500ml)	KH000385	QUYỀN - TAM HOÀNG LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	16900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				13.00	1300000.00	0.00	0.00	1300000.00	16900000.00	0.00	0.00	2025-07-30 01:20:37.40761	868
2448	532	1507	HD004812	SP000306	VV DOXICLIN 50 WSP (1Kg)	KH0000048	CÔ CHƯNG - TAM HOÀNG - NAGOA	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	1200000.00	0.00	0.00	1200000.00	6000000.00	0.00	0.00	2025-07-30 01:20:37.40761	1184
2449	533	1870	HD004811.01	SP000653	MG MEGA - GREEN (kg)	KH000396	ANH RÒN - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:37.40761	858
2450	533	1874	HD004811.01	SP000649	MG VIR 220 2000ds (TẢ)	KH000396	ANH RÒN - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	260000.00	0.00	0.00	260000.00	1560000.00	0.00	0.00	2025-07-30 01:20:37.40761	858
2451	534	2111	HD004810.01	SP000392	NƯỚC PHA GÀ ( 1000DS)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	30000.00	0.00	0.00	30000.00	300000.00	0.00	0.00	2025-07-30 01:20:37.40761	876
2452	534	1612	HD004810.01	SP000196	#GUMBORO D78 (2500DS)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	500000.00	0.00	0.00	500000.00	2000000.00	0.00	0.00	2025-07-30 01:20:37.40761	876
2453	535	1450	HD004809	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	390000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	130000.00	0.00	0.00	130000.00	390000.00	0.00	0.00	2025-07-30 01:20:37.40761	889
2454	535	1780	HD004809	SP000007	NOVAVETER BUTATOXIN (5lit)	KH000363	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:37.40761	889
2455	536	1872	HD004808	SP000651	MG VIR 102 1000ds (Đậu)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	210000.00	0.00	0.00	210000.00	1260000.00	0.00	0.00	2025-07-30 01:20:37.40761	878
2456	536	1863	HD004808	SP000660	MG TẢ CHẾT (VIR SIN 121L) 500ML	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	850000.00	0.00	0.00	850000.00	5950000.00	0.00	0.00	2025-07-30 01:20:37.40761	878
2457	537	1773	HD004807	SP000014	INTERGREEN ASPISURE 50% (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:37.40761	1057
2458	538	2083	HD004806	SP000429	#HIPPRAVIAR- SHS	KH000317	CÔ THẢO - GÀ ĐẺ  - ĐỨC HUY 12K	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	240000.00	0.00	0.00	240000.00	2640000.00	0.00	0.00	2025-07-30 01:20:37.62642	934
2459	539	1881	HD004805	SP000642	TYLOSIN 750g	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	1050000.00	0.00	0.00	1050000.00	5250000.00	0.00	0.00	2025-07-30 01:20:37.62642	876
2460	540	1875	HD004804	SP000648	MG VIR 220 1000ds ( TẢ )	KH000395	ANH QUẢNG - LONG THÀNH	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	140000.00	0.00	0.00	140000.00	1260000.00	0.00	0.00	2025-07-30 01:20:37.62642	859
2461	541	1548	HD004803	SP000261	VV CEFTI-S - NEW (250ml)	KH0000019	ANH PHONG - BÀU SẬY	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	390000.00	0.00	0.00	390000.00	7800000.00	0.00	0.00	2025-07-30 01:20:37.62642	1211
2462	542	1509	HD004802	SP000304	VV CHYMOSIN (1Lit)	KH000377	NHUNG VIETVET	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3720000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	310000.00	0.00	0.00	310000.00	3720000.00	0.00	0.00	2025-07-30 01:20:37.62642	875
2463	543	1869	HD004801.01	SP000654	MG MEGA - KC	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	550000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	110000.00	0.00	0.00	110000.00	550000.00	0.00	0.00	2025-07-30 01:20:37.62642	1158
2464	544	1869	HD004800.01	SP000654	MG MEGA - KC	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	550000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	110000.00	0.00	0.00	110000.00	550000.00	0.00	0.00	2025-07-30 01:20:37.62642	1215
2465	545	1635	HD004799	SP000173	#TEMBUSU CHẾT (250ml)	KH0000100	ĐẠI LÝ TIÊN PHÚC	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	300000.00	0.00	0.00	300000.00	3000000.00	0.00	0.00	2025-07-30 01:20:37.62642	1139
2466	546	1702	HD004798	SP000104	AGR BUTAPHOS B12 (1lit)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:37.62642	1185
2467	546	1695	HD004798	SP000111	AGR MILK PLUS (1Kg)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:37.62642	1185
2468	546	1886	HD004798	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	480000.00	0.00	0.00	480000.00	1440000.00	0.00	0.00	2025-07-30 01:20:37.62642	1185
2469	547	1905	HD004797.01	SP000618	FMD 25ds (aftogen - navetco)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1056000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				48.00	22000.00	0.00	0.00	22000.00	1056000.00	0.00	0.00	2025-07-30 01:20:37.62642	1048
2470	547	1813	HD004797.01	SP000711	GLASSER (HIPRA) CHAI (10ds)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	720000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	180000.00	0.00	0.00	180000.00	720000.00	0.00	0.00	2025-07-30 01:20:37.62642	1048
2471	547	1814	HD004797.01	SP000710	HYOGEN (CEVA)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				40.00	25000.00	0.00	0.00	25000.00	1000000.00	0.00	0.00	2025-07-30 01:20:37.62642	1048
2472	548	1870	HD004796	SP000653	MG MEGA - GREEN (kg)	KH000369	ANH HẢI CJ	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	60000.00	0.00	0.00	60000.00	480000.00	0.00	0.00	2025-07-30 01:20:37.62642	883
2473	549	1517	HD004795	SP000295	VV DICLACOC (1Lit)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	600000.00	0.00	0.00	600000.00	1200000.00	0.00	0.00	2025-07-30 01:20:37.62642	885
2474	550	1865	HD004794	SP000658	AGR CORYZA 3	KH000288	CÔ TUYẾT THU (5K) - LÔ SONG HÀNH	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	1200000.00	0.00	0.00	1200000.00	6000000.00	0.00	0.00	2025-07-30 01:20:37.62642	962
2475	551	1869	HD004793	SP000654	MG MEGA - KC	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	110000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	110000.00	0.00	0.00	110000.00	110000.00	0.00	0.00	2025-07-30 01:20:37.62642	878
2476	551	1857	HD004793	SP000666	MG DICLASOL (lít)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	850000.00	0.00	0.00	850000.00	850000.00	0.00	0.00	2025-07-30 01:20:37.62642	878
2477	552	1758	HD004792.02	SP000046	#VAXXON CHB (1000DS)	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	520000.00	0.00	0.00	520000.00	2600000.00	0.00	0.00	2025-07-30 01:20:37.62642	1114
2478	552	1594	HD004792.02	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:37.62642	1114
2479	552	1591	HD004792.02	SP000217	#TG IBD M+ (2000DS)	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	400000.00	0.00	0.00	400000.00	800000.00	0.00	0.00	2025-07-30 01:20:37.62642	1114
2480	552	1590	HD004792.02	SP000218	#TG IBD M+ (1000DS)	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:37.62642	1114
2481	552	1593	HD004792.02	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:37.62642	1114
2482	553	1622	HD004791.01	SP000186	#CIRCO (2000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	8100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				30.00	270000.00	0.00	0.00	270000.00	8100000.00	0.00	0.00	2025-07-30 01:20:37.62642	1135
2483	554	1432	HD004790	SP000383	KIM 9x13 (Vỉ)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:37.62642	987
2484	554	1441	HD004790	SP000374	KIM ĐẬU (1Kim)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	160000.00	0.00	0.00	160000.00	480000.00	0.00	0.00	2025-07-30 01:20:37.62642	987
2485	555	2083	HD004789	SP000429	#HIPPRAVIAR- SHS	KH000203	HÀ HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1050000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	210000.00	0.00	0.00	210000.00	1050000.00	0.00	0.00	2025-07-30 01:20:37.62642	1043
2486	556	1547	HD004788	SP000262	VV CEFAXIM (250ml)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4930000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				17.00	290000.00	0.00	0.00	290000.00	4930000.00	0.00	0.00	2025-07-30 01:20:37.62642	1158
2487	556	1836	HD004788	SP000688	KHÁNG THỂ NẮP XANH	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1760000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				11.00	160000.00	0.00	0.00	160000.00	1760000.00	0.00	0.00	2025-07-30 01:20:37.62642	1158
2488	557	1874	HD004787	SP000649	MG VIR 220 2000ds (TẢ)	KH000394	ANH TUÝ (KIM PHÁT)	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	260000.00	0.00	0.00	260000.00	1560000.00	0.00	0.00	2025-07-30 01:20:37.62642	860
2489	558	1439	HD004786	SP000376	XI LANH KANGDA (1ml)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:37.62642	1057
2490	559	1585	HD004785	SP000223	#TG AI H9 (500ml)	KH0000028	CHỊ LOAN ( ĐỊNH)	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1100000.00	0.00	0.00	1100000.00	2200000.00	0.00	0.00	2025-07-30 01:20:37.62642	1203
2491	560	1593	HD004784	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:37.62642	861
2492	560	1594	HD004784	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000393	CHÚ PHÁT - DỐC MƠ	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:37.62642	861
2493	561	1893	HD004783	SP000630	AGR PHOSRENOL (1 kg)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	660000.00	0.00	0.00	660000.00	660000.00	0.00	0.00	2025-07-30 01:20:37.62642	1165
2494	561	1485	HD004783	SP000329	VV BETA GIUCAN 50 (1KG)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:37.62642	1165
2495	562	1518	HD004782.01	SP000293	VV TYLODOX WSP (1Kg)	KH000006	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	950000.00	0.00	0.00	950000.00	2850000.00	0.00	0.00	2025-07-30 01:20:37.62642	1220
2496	563	1638	HD004781	SP000170	#REO VIRUT (1000DS)	KH0000108	ĐẠI LÝ TUẤN PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	550000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	110000.00	0.00	0.00	110000.00	550000.00	0.00	0.00	2025-07-30 01:20:37.62642	1131
2497	563	2085	HD004781	SP000427	#INTERFRON(100ML)	KH0000108	ĐẠI LÝ TUẤN PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	220000.00	0.00	0.00	220000.00	2200000.00	0.00	0.00	2025-07-30 01:20:37.62642	1131
2498	564	1594	HD004780	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000200	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	\N	\N	\N	1970-01-01 00:00:45.846	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	220000.00	0.00	0.00	220000.00	2200000.00	0.00	0.00	2025-07-30 01:20:37.62642	1046
2499	565	1750	HD004779.01	SP000054	AGR GENTACIN (100ml)	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	100000.00	0.00	0.00	100000.00	1000000.00	0.00	0.00	2025-07-30 01:20:37.62642	862
2500	566	1859	HD004778	SP000664	MG FLOR-VM 30% (lít)	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1400000.00	0.00	0.00	1400000.00	1400000.00	0.00	0.00	2025-07-30 01:20:37.62642	862
2501	566	1848	HD004778	SP000676	MG DOXY-VM (kg) hộp	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	2000000.00	0.00	0.00	2000000.00	4000000.00	0.00	0.00	2025-07-30 01:20:37.62642	862
2502	566	1874	HD004778	SP000649	MG VIR 220 2000ds (TẢ)	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	260000.00	0.00	0.00	260000.00	1300000.00	0.00	0.00	2025-07-30 01:20:37.62642	862
2503	566	1873	HD004778	SP000650	MG VIR 118 (IB BIẾN CHỦNG) 1000ds	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	400000.00	0.00	0.00	400000.00	4000000.00	0.00	0.00	2025-07-30 01:20:37.62642	862
2504	566	1875	HD004778	SP000648	MG VIR 220 1000ds ( TẢ )	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:37.62642	862
2505	566	1871	HD004778	SP000652	MG VIR 101 1000ds (ILT)	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3360000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	240000.00	0.00	0.00	240000.00	3360000.00	0.00	0.00	2025-07-30 01:20:37.62642	862
2506	566	1863	HD004778	SP000660	MG TẢ CHẾT (VIR SIN 121L) 500ML	KH000392	HOÀ MEGA	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	850000.00	0.00	0.00	850000.00	3400000.00	0.00	0.00	2025-07-30 01:20:37.62642	862
2507	567	1630	HD004777	SP000178	#CÚM AVAC RE5 (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1530000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	170000.00	0.00	0.00	170000.00	1530000.00	0.00	0.00	2025-07-30 01:20:37.62642	1135
2508	568	1432	HD004776	SP000383	KIM 9x13 (Vỉ)	KH0000059	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:37.849905	1174
2509	568	1587	HD004776	SP000221	#TG POX (1000DS)	KH0000059	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	880000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	220000.00	0.00	0.00	220000.00	880000.00	0.00	0.00	2025-07-30 01:20:37.849905	1174
2510	568	1584	HD004776	SP000224	#TG TẢ + CÚM (500ml)	KH0000059	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	1300000.00	0.00	0.00	1300000.00	6500000.00	0.00	0.00	2025-07-30 01:20:37.849905	1174
2511	569	1704	HD004775	SP000101	AGR SUPPER MEAT (2lit)	KH000372	ANH HẢI (KẾ)	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	450000.00	0.00	0.00	450000.00	1350000.00	0.00	0.00	2025-07-30 01:20:37.849905	880
2512	570	1834	HD004774	SP000690	MEGA-TICOSIN	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1300000.00	0.00	0.00	1300000.00	1300000.00	0.00	0.00	2025-07-30 01:20:37.849905	906
2513	570	1848	HD004774	SP000676	MG DOXY-VM (kg) hộp	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	2000000.00	0.00	0.00	2000000.00	2000000.00	0.00	0.00	2025-07-30 01:20:37.849905	906
2514	570	1870	HD004774	SP000653	MG MEGA - GREEN (kg)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	60000.00	0.00	0.00	60000.00	300000.00	0.00	0.00	2025-07-30 01:20:37.849905	906
2515	570	1833	HD004774	SP000691	MEGA-BROMEN (lít)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:37.849905	906
2516	571	1516	HD004773	SP000296	VV FLUCONAZOL (1Lit)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	400000.00	0.00	0.00	400000.00	2000000.00	0.00	0.00	2025-07-30 01:20:37.849905	1189
2517	572	2015	HD004772	SP000502	TG FOTAXIM 100 (1KG) (XÁ)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2190000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	730000.00	0.00	0.00	730000.00	2190000.00	0.00	0.00	2025-07-30 01:20:37.849905	1026
2518	573	1450	HD004771.01	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	130000.00	0.00	0.00	130000.00	260000.00	0.00	0.00	2025-07-30 01:20:37.849905	1123
2519	573	1520	HD004771.01	SP000291	VV COLIS 50 WSP (1Kg)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:37.849905	1123
2520	573	1850	HD004771.01	SP000674	MG VILLI SUPPORT L (lít)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:37.849905	1123
2521	573	1491	HD004771.01	SP000323	VV MONOSULTRIM 60 (1KG)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1300000.00	0.00	0.00	1300000.00	2600000.00	0.00	0.00	2025-07-30 01:20:37.849905	1123
2522	574	1760	HD004770	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	280000.00	0.00	0.00	280000.00	1120000.00	0.00	0.00	2025-07-30 01:20:37.849905	1178
2523	574	1534	HD004770	SP000276	VV VITLYTE C (1Kg)	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:37.849905	1178
2524	574	1606	HD004770	SP000202	PERMASOL 500 (1Kg)	KH0000054	CHÚ CHƯƠNG - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	200000.00	0.00	0.00	200000.00	1400000.00	0.00	0.00	2025-07-30 01:20:37.849905	1178
2525	575	2080	HD004769	SP000433	THUỐC TÍM	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	150000.00	0.00	0.00	150000.00	300000.00	0.00	0.00	2025-07-30 01:20:37.849905	1165
2526	576	1554	HD004768.01	SP000255	TG LIVER COOL (1lit)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:37.849905	1026
2527	576	1823	HD004768.01	SP000701	TG-FLUZOL MAX (LÍT)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	350000.00	0.00	0.00	350000.00	2800000.00	0.00	0.00	2025-07-30 01:20:37.849905	1026
2528	576	1576	HD004768.01	SP000232	TG SUPER-VITAMINO (1Kg)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	200000.00	0.00	0.00	200000.00	600000.00	0.00	0.00	2025-07-30 01:20:37.849905	1026
2529	576	1567	HD004768.01	SP000241	TG-FLOSOL 30 (1lit)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	800000.00	0.00	0.00	800000.00	800000.00	0.00	0.00	2025-07-30 01:20:37.849905	1026
2531	578	1838	HD004766	SP000686	BIOFRAM BIO K-C-G (kg)	KH000378	QUÂN BIOFRAM	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	60000.00	0.00	0.00	60000.00	480000.00	0.00	0.00	2025-07-30 01:20:37.849905	874
2532	579	1874	HD004765	SP000649	MG VIR 220 2000ds (TẢ)	KH000200	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	260000.00	0.00	0.00	260000.00	520000.00	0.00	0.00	2025-07-30 01:20:37.849905	1046
2533	580	1871	HD004764	SP000652	MG VIR 101 1000ds (ILT)	KH000365	ANH HUY - GÀ - ĐỨC HUY	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	240000.00	0.00	0.00	240000.00	960000.00	0.00	0.00	2025-07-30 01:20:37.849905	887
2534	580	1630	HD004764	SP000178	#CÚM AVAC RE5 (250ml)	KH000365	ANH HUY - GÀ - ĐỨC HUY	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	200000.00	0.00	0.00	200000.00	1600000.00	0.00	0.00	2025-07-30 01:20:37.849905	887
2535	580	1833	HD004764	SP000691	MEGA-BROMEN (lít)	KH000365	ANH HUY - GÀ - ĐỨC HUY	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	250000.00	0.00	0.00	250000.00	1250000.00	0.00	0.00	2025-07-30 01:20:37.849905	887
2536	581	1584	HD004763	SP000224	#TG TẢ + CÚM (500ml)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	13000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	1300000.00	0.00	0.00	1300000.00	13000000.00	0.00	0.00	2025-07-30 01:20:37.849905	881
2537	581	1669	HD004763	SP000138	TOPCIN BCOMPLEX C (1Kg)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:37.849905	881
2538	582	1520	HD004762	SP000291	VV COLIS 50 WSP (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:37.849905	1057
2539	583	1702	HD004761	SP000104	AGR BUTAPHOS B12 (1lit)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	280000.00	0.00	0.00	280000.00	840000.00	0.00	0.00	2025-07-30 01:20:37.849905	1215
2540	583	1856	HD004761	SP000667	MG REVIVAL LIQUID (lít)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	500000.00	0.00	0.00	500000.00	1500000.00	0.00	0.00	2025-07-30 01:20:37.849905	1215
2541	584	1702	HD004760	SP000104	AGR BUTAPHOS B12 (1lit)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	280000.00	0.00	0.00	280000.00	840000.00	0.00	0.00	2025-07-30 01:20:37.849905	1158
2542	584	1856	HD004760	SP000667	MG REVIVAL LIQUID (lít)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	500000.00	0.00	0.00	500000.00	1500000.00	0.00	0.00	2025-07-30 01:20:37.849905	1158
2543	585	1874	HD004759	SP000649	MG VIR 220 2000ds (TẢ)	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	780000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	260000.00	0.00	0.00	260000.00	780000.00	0.00	0.00	2025-07-30 01:20:37.849905	878
2544	585	1875	HD004759	SP000648	MG VIR 220 1000ds ( TẢ )	KH000374	ANH TÈO - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:37.849905	878
2545	586	1630	HD004758	SP000178	#CÚM AVAC RE5 (250ml)	KH0000027	ANH HỌC	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	200000.00	0.00	0.00	200000.00	800000.00	0.00	0.00	2025-07-30 01:20:37.849905	1204
2546	587	1849	HD004757.01	SP000675	MG IVERMECTIN (kg)	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	180000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	180000.00	0.00	0.00	180000.00	180000.00	0.00	0.00	2025-07-30 01:20:37.849905	857
2547	588	2085	HD004756	SP000427	#INTERFRON(100ML)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	350000.00	0.00	0.00	350000.00	1750000.00	0.00	0.00	2025-07-30 01:20:37.849905	993
2548	588	1548	HD004756	SP000261	VV CEFTI-S - NEW (250ml)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7020000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				18.00	390000.00	0.00	0.00	390000.00	7020000.00	0.00	0.00	2025-07-30 01:20:37.849905	993
2549	589	1587	HD004755	SP000221	#TG POX (1000DS)	KH000293	CHỊ LOAN -BỐT ĐỎ	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	220000.00	0.00	0.00	220000.00	1320000.00	0.00	0.00	2025-07-30 01:20:37.849905	957
2550	590	1630	HD004754	SP000178	#CÚM AVAC RE5 (250ml)	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	180000.00	0.00	0.00	180000.00	1080000.00	0.00	0.00	2025-07-30 01:20:37.849905	1192
2551	591	1628	HD004753.02	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	200000.00	0.00	0.00	200000.00	1000000.00	0.00	0.00	2025-07-30 01:20:37.849905	987
2552	592	1520	HD004752.01	SP000291	VV COLIS 50 WSP (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:37.849905	1057
2553	593	2089	HD004751.01	SP000422	OXYTIN(10G)-ÚM GIA CẦM	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	10000.00	0.00	0.00	10000.00	30000.00	0.00	0.00	2025-07-30 01:20:37.849905	1057
2554	594	1780	HD004750	SP000007	NOVAVETER BUTATOXIN (5lit)	KH000007	CHÚ PHƯỚC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:37.849905	1221
2555	595	1875	HD004749.01	SP000648	MG VIR 220 1000ds ( TẢ )	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:37.849905	1122
2556	595	1874	HD004749.01	SP000649	MG VIR 220 2000ds (TẢ)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	260000.00	0.00	0.00	260000.00	260000.00	0.00	0.00	2025-07-30 01:20:37.849905	1122
2557	596	1874	HD004748	SP000649	MG VIR 220 2000ds (TẢ)	KH000390	ANH TÀI - MARTINO (BÀ NGOẠI)	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	260000.00	0.00	0.00	260000.00	520000.00	0.00	0.00	2025-07-30 01:20:37.849905	864
2558	597	1874	HD004747	SP000649	MG VIR 220 2000ds (TẢ)	KH000122	ANH TÀI - GÀ TA - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	260000.00	0.00	0.00	260000.00	520000.00	0.00	0.00	2025-07-30 01:20:38.066329	1113
2559	598	1942	HD004746	SP000578	#DỊCH TẢ HANVET	KH000180	CHỊ HƯƠNG-THÀNH AN	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	465000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	46500.00	0.00	0.00	46500.00	465000.00	0.00	0.00	2025-07-30 01:20:38.066329	1062
2560	599	1759	HD004745	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH000391	NGUYỆT SƠN LÂM	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	200000.00	0.00	0.00	200000.00	600000.00	0.00	0.00	2025-07-30 01:20:38.066329	863
2561	600	1593	HD004744	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000216	CHÚ HÙNG - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:38.066329	1030
2562	600	1594	HD004744	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000216	CHÚ HÙNG - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	220000.00	0.00	0.00	220000.00	660000.00	0.00	0.00	2025-07-30 01:20:38.066329	1030
2563	600	1673	HD004744	SP000134	VAC PAC PLUS (5g)	KH000216	CHÚ HÙNG - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	30000.00	0.00	0.00	30000.00	30000.00	0.00	0.00	2025-07-30 01:20:38.066329	1030
2564	601	1547	HD004743	SP000262	VV CEFAXIM (250ml)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4930000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				17.00	290000.00	0.00	0.00	290000.00	4930000.00	0.00	0.00	2025-07-30 01:20:38.066329	1215
2565	601	1836	HD004743	SP000688	KHÁNG THỂ NẮP XANH	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2720000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				17.00	160000.00	0.00	0.00	160000.00	2720000.00	0.00	0.00	2025-07-30 01:20:38.066329	1215
2566	602	1650	HD004742	SP000157	HANTOX 200 (1lit)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	350000.00	0.00	0.00	350000.00	700000.00	0.00	0.00	2025-07-30 01:20:38.066329	1176
2567	603	1874	HD004741.01	SP000649	MG VIR 220 2000ds (TẢ)	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	260000.00	0.00	0.00	260000.00	260000.00	0.00	0.00	2025-07-30 01:20:38.066329	857
2568	603	1875	HD004741.01	SP000648	MG VIR 220 1000ds ( TẢ )	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:38.066329	857
2569	603	1873	HD004741.01	SP000650	MG VIR 118 (IB BIẾN CHỦNG) 1000ds	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	400000.00	0.00	0.00	400000.00	1200000.00	0.00	0.00	2025-07-30 01:20:38.066329	857
2570	604	1628	HD004740	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	0.00	250000.00	2500000.00	0.00	0.00	2025-07-30 01:20:38.066329	1189
2571	605	1518	HD004739	SP000293	VV TYLODOX WSP (1Kg)	KH0000058	ANH PHÙNG - TAM HOÀNG-NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	950000.00	0.00	0.00	950000.00	1900000.00	0.00	0.00	2025-07-30 01:20:38.066329	1175
2572	606	1623	HD004738	SP000185	#SCOCVAC 4( TQ)	KH000183	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	650000.00	0.00	0.00	650000.00	3250000.00	0.00	0.00	2025-07-30 01:20:38.066329	1114
2573	607	1626	HD004737.01	SP000182	CEFOTAXIM (Bột 2g)	KH000222	CÔ NGA VỊT - SUỐI NHO	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				140.00	25000.00	0.00	0.00	25000.00	3500000.00	0.00	0.00	2025-07-30 01:20:38.066329	1025
2574	607	1640	HD004737.01	SP000168	#DỊCH TẢ VỊT-NAVETCO (1000DS)	KH000222	CÔ NGA VỊT - SUỐI NHO	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	60000.00	0.00	0.00	60000.00	600000.00	0.00	0.00	2025-07-30 01:20:38.066329	1025
2575	608	2089	HD004736	SP000422	OXYTIN(10G)-ÚM GIA CẦM	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.844	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	20000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	10000.00	0.00	0.00	10000.00	20000.00	0.00	0.00	2025-07-30 01:20:38.066329	1057
2576	609	2089	HD004735	SP000422	OXYTIN(10G)-ÚM GIA CẦM	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	50000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	10000.00	0.00	0.00	10000.00	50000.00	0.00	0.00	2025-07-30 01:20:38.066329	1057
2577	610	1470	HD004734.01	SP000344	VV ANTIVIUS-TAV (1Lit)	KH000308	ANH TRUYỀN  - TAM HOÀNG - GIA PHÁT 1	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	750000.00	0.00	0.00	750000.00	2250000.00	0.00	0.00	2025-07-30 01:20:38.066329	942
2578	611	1634	HD004733	SP000174	#RỤT MỎ SINDER (250ml)	KH000240	ANH TRƯỜNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	150000.00	0.00	0.00	150000.00	300000.00	0.00	0.00	2025-07-30 01:20:38.066329	1009
2579	611	1639	HD004733	SP000169	#REO VIRUT (500DS)	KH000240	ANH TRƯỜNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	150000.00	0.00	0.00	150000.00	300000.00	0.00	0.00	2025-07-30 01:20:38.066329	1009
2580	611	1891	HD004733	VIÊM GAN HANVET	VIÊM GAN HANVET	KH000240	ANH TRƯỜNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:38.066329	1009
2581	612	1635	HD004732	SP000173	#TEMBUSU CHẾT (250ml)	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	280000.00	0.00	0.00	280000.00	560000.00	0.00	0.00	2025-07-30 01:20:38.066329	1129
2582	612	1891	HD004732	VIÊM GAN HANVET	VIÊM GAN HANVET	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	70000.00	0.00	0.00	70000.00	140000.00	0.00	0.00	2025-07-30 01:20:38.066329	1129
2583	612	2079	HD004732	SP000434	CƯỚC XE	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	70000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	70000.00	0.00	0.00	70000.00	70000.00	0.00	0.00	2025-07-30 01:20:38.066329	1129
2584	612	1630	HD004732	SP000178	#CÚM AVAC RE5 (250ml)	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	340000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	170000.00	0.00	0.00	170000.00	340000.00	0.00	0.00	2025-07-30 01:20:38.066329	1129
2585	612	1634	HD004732	SP000174	#RỤT MỎ SINDER (250ml)	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	75000.00	0.00	0.00	75000.00	300000.00	0.00	0.00	2025-07-30 01:20:38.066329	1129
2586	612	1639	HD004732	SP000169	#REO VIRUT (500DS)	KH0000110	SÁNG TẰNG HAID	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	340000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	85000.00	0.00	0.00	85000.00	340000.00	0.00	0.00	2025-07-30 01:20:38.066329	1129
2587	613	1520	HD004731	SP000291	VV COLIS 50 WSP (1Kg)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	450000.00	0.00	0.00	450000.00	4500000.00	0.00	0.00	2025-07-30 01:20:38.066329	1208
2588	614	1549	HD004730	SP000260	VV CEFTI-S (250ml)	KH0000042	CHỊ QUYÊN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	290000.00	0.00	0.00	290000.00	5800000.00	0.00	0.00	2025-07-30 01:20:38.066329	1190
2589	614	1541	HD004730	SP000268	VV ANALGIN (100ml)	KH0000042	CHỊ QUYÊN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				30.00	30000.00	0.00	0.00	30000.00	900000.00	0.00	0.00	2025-07-30 01:20:38.066329	1190
2590	615	1523	HD004729	SP000288	VV COTRIM-F (1Kg)	KH000377	NHUNG VIETVET	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2238000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	373000.00	0.00	0.00	373000.00	2238000.00	0.00	0.00	2025-07-30 01:20:38.066329	875
2591	616	1757	HD004728	SP000047	#VAXXON ILT (1000DS)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	220000.00	0.00	0.00	220000.00	1100000.00	0.00	0.00	2025-07-30 01:20:38.066329	1123
2592	616	1673	HD004728	SP000134	VAC PAC PLUS (5g)	KH0000117	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	90000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	30000.00	0.00	0.00	30000.00	90000.00	0.00	0.00	2025-07-30 01:20:38.066329	1123
2593	617	1525	HD004727.01	SP000286	VV PARA 10WSP (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	100000.00	0.00	0.00	100000.00	800000.00	0.00	0.00	2025-07-30 01:20:38.066329	1215
2594	617	1836	HD004727.01	SP000688	KHÁNG THỂ NẮP XANH	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	160000.00	0.00	0.00	160000.00	640000.00	0.00	0.00	2025-07-30 01:20:38.066329	1215
2595	618	1584	HD004726	SP000224	#TG TẢ + CÚM (500ml)	KH000307	THÚ Y ĐÌNH HIỀN	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2910000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	970000.00	0.00	0.00	970000.00	2910000.00	0.00	0.00	2025-07-30 01:20:38.066329	943
2596	619	1517	HD004725	SP000295	VV DICLACOC (1Lit)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	600000.00	0.00	0.00	600000.00	600000.00	0.00	0.00	2025-07-30 01:20:38.066329	1185
2597	620	1893	HD004724	SP000630	AGR PHOSRENOL (1 kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	660000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	660000.00	0.00	0.00	660000.00	660000.00	0.00	0.00	2025-07-30 01:20:38.066329	1032
2598	621	1893	HD004723	SP000630	AGR PHOSRENOL (1 kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1320000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	660000.00	0.00	0.00	660000.00	1320000.00	0.00	0.00	2025-07-30 01:20:38.066329	1226
2599	622	1630	HD004722	SP000178	#CÚM AVAC RE5 (250ml)	KH000205	KHẢI ( CÔ CHUNG)	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	180000.00	0.00	0.00	180000.00	1800000.00	0.00	0.00	2025-07-30 01:20:38.066329	1041
2600	623	1972	HD004721	SP000547	KIM 16x20 (vỉ)	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	50000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	10000.00	0.00	0.00	10000.00	50000.00	0.00	0.00	2025-07-30 01:20:38.066329	990
2601	623	1521	HD004721	SP000290	VV ENROVET ORAL (1Lit)	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:38.066329	990
2602	624	1815	HD004720	SP000709	Thảm nỉ 0,5m x 1m	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				100.00	35000.00	0.00	0.00	35000.00	3500000.00	0.00	0.00	2025-07-30 01:20:38.066329	1048
2603	625	1636	HD004719	SP000172	#TEMBUSU SỐNG DOBIO (500DS)	KH0000036	ANH PHONG - SUỐI ĐÁ 2	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	300000.00	0.00	0.00	300000.00	4800000.00	0.00	0.00	2025-07-30 01:20:38.066329	1195
2604	626	1702	HD004718	SP000104	AGR BUTAPHOS B12 (1lit)	KH000390	ANH TÀI - MARTINO (BÀ NGOẠI)	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:38.066329	864
2605	626	1706	HD004718	SP000099	AGR SORBIMIN (5lit)	KH000390	ANH TÀI - MARTINO (BÀ NGOẠI)	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:38.066329	864
2606	627	1650	HD004717	SP000157	HANTOX 200 (1lit)	KH000315	ANH VŨ - GÀ ĐẺ	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:38.066329	936
2607	628	1702	HD004716.01	SP000104	AGR BUTAPHOS B12 (1lit)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:38.066329	1122
2608	628	1879	HD004716.01	SP000644	VV VITAMIN K3 0,5% (1Kg) 10:1	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:38.349996	1122
2609	629	1585	HD004715.01	SP000223	#TG AI H9 (500ml)	KH000253	ANH PHONG - SUỐI ĐÁ 3	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1100000.00	0.00	0.00	1100000.00	1100000.00	0.00	0.00	2025-07-30 01:20:38.349996	996
2610	630	1585	HD004714	SP000223	#TG AI H9 (500ml)	KH000187	ANH PHONG - SUỐI ĐÁ 1	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1100000.00	0.00	0.00	1100000.00	3300000.00	0.00	0.00	2025-07-30 01:20:38.349996	1058
2611	631	1547	HD004713.01	SP000262	VV CEFAXIM (250ml)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4930000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				17.00	290000.00	0.00	0.00	290000.00	4930000.00	0.00	0.00	2025-07-30 01:20:38.349996	1215
2612	631	1622	HD004713.01	SP000186	#CIRCO (2000DS)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	400000.00	0.00	0.00	400000.00	1600000.00	0.00	0.00	2025-07-30 01:20:38.349996	1215
2613	631	1836	HD004713.01	SP000688	KHÁNG THỂ NẮP XANH	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				13.00	160000.00	0.00	0.00	160000.00	2080000.00	0.00	0.00	2025-07-30 01:20:38.349996	1215
2614	632	1693	HD004712	SP000113	AGR BIOTIN (1Kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	120000.00	0.00	0.00	120000.00	1200000.00	0.00	0.00	2025-07-30 01:20:38.349996	1176
2615	633	1702	HD004711.01	SP000104	AGR BUTAPHOS B12 (1lit)	KH000122	ANH TÀI - GÀ TA - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:38.349996	1113
2616	633	1706	HD004711.01	SP000099	AGR SORBIMIN (5lit)	KH000122	ANH TÀI - GÀ TA - MARTINO	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	650000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	650000.00	0.00	0.00	650000.00	650000.00	0.00	0.00	2025-07-30 01:20:38.349996	1113
2617	634	1637	HD004710.03	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	150000.00	0.00	0.00	150000.00	600000.00	0.00	0.00	2025-07-30 01:20:38.349996	987
2618	635	1710	HD004709	SP000095	AGR ALL-LYTE (1Kg)	KH000369	ANH HẢI CJ	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	180000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	90000.00	0.00	0.00	90000.00	180000.00	0.00	0.00	2025-07-30 01:20:38.349996	883
2619	635	1450	HD004709	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000369	ANH HẢI CJ	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	130000.00	0.00	0.00	130000.00	260000.00	0.00	0.00	2025-07-30 01:20:38.349996	883
2620	635	1702	HD004709	SP000104	AGR BUTAPHOS B12 (1lit)	KH000369	ANH HẢI CJ	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:38.349996	883
2621	635	2094	HD004709	SP000414	AMOXICOL 20% (100G)	KH000369	ANH HẢI CJ	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	50000.00	0.00	0.00	50000.00	150000.00	0.00	0.00	2025-07-30 01:20:38.349996	883
2622	635	1528	HD004709	SP000282	VV METISOL (1Lit)	KH000369	ANH HẢI CJ	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	120000.00	0.00	0.00	120000.00	240000.00	0.00	0.00	2025-07-30 01:20:38.349996	883
2623	636	1547	HD004708	SP000262	VV CEFAXIM (250ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	290000.00	0.00	0.00	290000.00	1160000.00	0.00	0.00	2025-07-30 01:20:38.349996	1210
2624	636	1636	HD004708	SP000172	#TEMBUSU SỐNG DOBIO (500DS)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	300000.00	0.00	0.00	300000.00	1200000.00	0.00	0.00	2025-07-30 01:20:38.349996	1210
2625	637	2111	HD004707.01	SP000392	NƯỚC PHA GÀ ( 1000DS)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	30000.00	0.00	0.00	30000.00	300000.00	0.00	0.00	2025-07-30 01:20:38.349996	876
2626	637	1615	HD004707.01	SP000193	#MAX 5CLON30 (5000DS)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	540000.00	0.00	0.00	540000.00	1080000.00	0.00	0.00	2025-07-30 01:20:38.349996	876
2627	638	1760	HD004706	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH0000105	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	280000.00	0.00	0.00	280000.00	1120000.00	0.00	0.00	2025-07-30 01:20:38.349996	1134
2628	638	1761	HD004706	SP000043	#IZOVAC H120 - LASOTA (1000DS)	KH0000105	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	130000.00	0.00	0.00	130000.00	260000.00	0.00	0.00	2025-07-30 01:20:38.349996	1134
2629	639	1525	HD004705	SP000286	VV PARA 10WSP (1Kg)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.843	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	100000.00	0.00	0.00	100000.00	1000000.00	0.00	0.00	2025-07-30 01:20:38.349996	1158
2630	640	1630	HD004704	SP000178	#CÚM AVAC RE5 (250ml)	KH000180	CHỊ HƯƠNG-THÀNH AN	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1190000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	170000.00	0.00	0.00	170000.00	1190000.00	0.00	0.00	2025-07-30 01:20:38.349996	1062
2631	641	1497	HD004703	SP000317	VV TILMI 250 ORAL (1Lit)	KH000194	ANH HUYẾN - CÚT	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	800000.00	0.00	0.00	800000.00	800000.00	0.00	0.00	2025-07-30 01:20:38.349996	1051
2632	642	1637	HD004702	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				30.00	110000.00	0.00	0.00	110000.00	3300000.00	0.00	0.00	2025-07-30 01:20:38.349996	1135
2633	642	1622	HD004702	SP000186	#CIRCO (2000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	260000.00	0.00	0.00	260000.00	2600000.00	0.00	0.00	2025-07-30 01:20:38.349996	1135
2634	643	1937	HD004701	SP000584	NUTROLYTE	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	80000.00	0.00	0.00	80000.00	1600000.00	0.00	0.00	2025-07-30 01:20:38.349996	1032
2635	643	1447	HD004701	SP000368	TC LACTIZYM CAO TỎI (Kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	100000.00	0.00	0.00	100000.00	2000000.00	0.00	0.00	2025-07-30 01:20:38.349996	1032
2636	644	2077	HD004700	SP000436	CATOSAL 10% 100ml	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	295000.00	0.00	0.00	295000.00	2950000.00	0.00	0.00	2025-07-30 01:20:38.349996	990
2637	645	1955	HD004699.01	SP000565	#CÚM H5 + H9 (250ml)	KH0000042	CHỊ QUYÊN - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	200000.00	0.00	0.00	200000.00	1400000.00	0.00	0.00	2025-07-30 01:20:38.349996	1190
2638	646	1474	HD004698	SP000340	VV ENROFLOXACINA-TAV 20% (1Lit)	KH000377	NHUNG VIETVET	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				24.00	450000.00	0.00	0.00	450000.00	10800000.00	0.00	0.00	2025-07-30 01:20:38.349996	875
2639	647	2083	HD004697	SP000429	#HIPPRAVIAR- SHS	KH000203	HÀ HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	210000.00	0.00	0.00	210000.00	840000.00	0.00	0.00	2025-07-30 01:20:38.349996	1043
2640	648	2085	HD004696	SP000427	#INTERFRON(100ML)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	350000.00	0.00	0.00	350000.00	1750000.00	0.00	0.00	2025-07-30 01:20:38.349996	993
2641	648	1548	HD004696	SP000261	VV CEFTI-S - NEW (250ml)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	390000.00	0.00	0.00	390000.00	6240000.00	0.00	0.00	2025-07-30 01:20:38.349996	993
2642	649	1620	HD004695	SP000188	#INTERFERON (10ml)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	120000.00	0.00	0.00	120000.00	1200000.00	0.00	0.00	2025-07-30 01:20:38.349996	992
2643	649	1548	HD004695	SP000261	VV CEFTI-S - NEW (250ml)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	390000.00	0.00	0.00	390000.00	1950000.00	0.00	0.00	2025-07-30 01:20:38.349996	992
2644	650	1495	HD004694	SP000319	VV FLODOX 30 (1Lit)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1000000.00	0.00	0.00	1000000.00	3000000.00	0.00	0.00	2025-07-30 01:20:38.349996	993
2645	651	1495	HD004693	SP000319	VV FLODOX 30 (1Lit)	KH0000082	ANH THÁI - VỊT - PHÚC NHẠC	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1000000.00	0.00	0.00	1000000.00	3000000.00	0.00	0.00	2025-07-30 01:20:38.349996	1154
2646	652	1893	HD004692	SP000630	AGR PHOSRENOL (1 kg)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1980000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	660000.00	0.00	0.00	660000.00	1980000.00	0.00	0.00	2025-07-30 01:20:38.349996	1158
2647	652	1622	HD004692	SP000186	#CIRCO (2000DS)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	400000.00	0.00	0.00	400000.00	1200000.00	0.00	0.00	2025-07-30 01:20:38.349996	1158
2648	652	1836	HD004692	SP000688	KHÁNG THỂ NẮP XANH	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	160000.00	0.00	0.00	160000.00	2400000.00	0.00	0.00	2025-07-30 01:20:38.349996	1158
2649	652	1547	HD004692	SP000262	VV CEFAXIM (250ml)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	290000.00	0.00	0.00	290000.00	2900000.00	0.00	0.00	2025-07-30 01:20:38.349996	1158
2650	653	1470	HD004691	SP000344	VV ANTIVIUS-TAV (1Lit)	KH000200	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	750000.00	0.00	0.00	750000.00	3750000.00	0.00	0.00	2025-07-30 01:20:38.349996	1046
2651	653	1591	HD004691	SP000217	#TG IBD M+ (2000DS)	KH000200	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	400000.00	0.00	0.00	400000.00	4000000.00	0.00	0.00	2025-07-30 01:20:38.349996	1046
2652	654	1638	HD004690	SP000170	#REO VIRUT (1000DS)	KH000222	CÔ NGA VỊT - SUỐI NHO	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	0.00	250000.00	2500000.00	0.00	0.00	2025-07-30 01:20:38.349996	1025
2653	654	1631	HD004690	SP000177	#RỤT MỎ RINGPU (250ml)	KH000222	CÔ NGA VỊT - SUỐI NHO	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	150000.00	0.00	0.00	150000.00	3000000.00	0.00	0.00	2025-07-30 01:20:38.349996	1025
2654	655	1673	HD004689	SP000134	VAC PAC PLUS (5g)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	30000.00	0.00	0.00	30000.00	150000.00	0.00	0.00	2025-07-30 01:20:38.349996	876
2655	655	1615	HD004689	SP000193	#MAX 5CLON30 (5000DS)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.842	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	540000.00	0.00	0.00	540000.00	1080000.00	0.00	0.00	2025-07-30 01:20:38.349996	876
2656	656	1585	HD004687	SP000223	#TG AI H9 (500ml)	KH000340	CÔ VỠI - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	1100000.00	0.00	0.00	1100000.00	4400000.00	0.00	0.00	2025-07-30 01:20:38.349996	912
2657	656	1553	HD004687	SP000256	TG LIVER COOL (5lit)	KH000340	CÔ VỠI - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	950000.00	0.00	0.00	950000.00	950000.00	0.00	0.00	2025-07-30 01:20:38.349996	912
2658	657	1886	HD004686	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH0000059	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1920000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	480000.00	0.00	0.00	480000.00	1920000.00	0.00	0.00	2025-07-30 01:20:38.575071	1174
2659	658	1816	HD004685	SP000708	BMD (bao 25kg)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	2850000.00	0.00	0.00	2850000.00	2850000.00	0.00	0.00	2025-07-30 01:20:38.575071	876
2660	658	1474	HD004685	SP000340	VV ENROFLOXACINA-TAV 20% (1Lit)	KH000376	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	600000.00	0.00	0.00	600000.00	600000.00	0.00	0.00	2025-07-30 01:20:38.575071	876
2661	659	1704	HD004684	SP000101	AGR SUPPER MEAT (2lit)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	450000.00	0.00	0.00	450000.00	2700000.00	0.00	0.00	2025-07-30 01:20:38.575071	1198
2662	659	1709	HD004684	SP000096	AGR ALL-LYTE (5Kg)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:38.575071	1198
2663	659	1696	HD004684	SP000110	AGR CALPHOS PLUS (5lit)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	650000.00	0.00	0.00	650000.00	1300000.00	0.00	0.00	2025-07-30 01:20:38.575071	1198
2664	659	1450	HD004684	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	130000.00	0.00	0.00	130000.00	2600000.00	0.00	0.00	2025-07-30 01:20:38.575071	1198
2665	659	1718	HD004684	SP000087	AGR NYSTATIN (1Kg)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	280000.00	0.00	0.00	280000.00	1120000.00	0.00	0.00	2025-07-30 01:20:38.575071	1198
2666	659	1706	HD004684	SP000099	AGR SORBIMIN (5lit)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	650000.00	0.00	0.00	650000.00	1300000.00	0.00	0.00	2025-07-30 01:20:38.575071	1198
2667	659	1494	HD004684	SP000320	VV FLODOXY 30 (1Kg)	KH0000033	CÔ QUYỀN - ĐỨC LONG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	1000000.00	0.00	0.00	1000000.00	6000000.00	0.00	0.00	2025-07-30 01:20:38.575071	1198
2668	660	1613	HD004683	SP000195	#GUMBORO 228E (2500DS)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	650000.00	0.00	0.00	650000.00	1950000.00	0.00	0.00	2025-07-30 01:20:38.575071	1165
2669	661	1432	HD004682	SP000383	KIM 9x13 (Vỉ)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	10000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	10000.00	0.00	0.00	10000.00	10000.00	0.00	0.00	2025-07-30 01:20:38.575071	1057
2670	661	1439	HD004682	SP000376	XI LANH KANGDA (1ml)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	220000.00	0.00	0.00	220000.00	220000.00	0.00	0.00	2025-07-30 01:20:38.575071	1057
2671	662	2035	HD004681	SP000479	XÚT NAOH (25kg)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:38.575071	1185
2672	663	1453	HD004680	SP000362	TC SULPHAMONO 80/20 (1Kg)	KH000303	ANH LÂM (6K) - TRẠI 3	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1800000.00	0.00	0.00	1800000.00	1800000.00	0.00	0.00	2025-07-30 01:20:38.575071	947
2673	663	2035	HD004680	SP000479	XÚT NAOH (25kg)	KH000303	ANH LÂM (6K) - TRẠI 3	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:38.575071	947
2674	664	2035	HD004679	SP000479	XÚT NAOH (25kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:38.575071	1032
2675	665	2035	HD004678	SP000479	XÚT NAOH (25kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	450000.00	0.00	0.00	450000.00	450000.00	0.00	0.00	2025-07-30 01:20:38.575071	1226
2676	666	1623	HD004677	SP000185	#SCOCVAC 4( TQ)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	650000.00	0.00	0.00	650000.00	1950000.00	0.00	0.00	2025-07-30 01:20:38.575071	1122
2677	667	1712	HD004676	SP000093	AGR LACTO-MAXAG (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:38.575071	1057
2678	667	1713	HD004676	SP000092	AGR GLUCO KC (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:38.575071	1057
2679	668	1548	HD004675	SP000261	VV CEFTI-S - NEW (250ml)	KH0000080	ANH PHONG - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7020000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				18.00	390000.00	0.00	0.00	390000.00	7020000.00	0.00	0.00	2025-07-30 01:20:38.575071	1155
2680	669	1896	HD004674	SP000627	VMD TULAVITRYL	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	560000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	280000.00	0.00	0.00	280000.00	560000.00	0.00	0.00	2025-07-30 01:20:38.575071	990
2681	669	1944	HD004674	SP000576	SHOTAPEN 100ml	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	760000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	380000.00	0.00	0.00	380000.00	760000.00	0.00	0.00	2025-07-30 01:20:38.575071	990
2682	670	1893	HD004673	SP000630	AGR PHOSRENOL (1 kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	660000.00	0.00	0.00	660000.00	2640000.00	0.00	0.00	2025-07-30 01:20:38.575071	1176
2683	670	1526	HD004673	SP000285	VV BROMHEXIN WSP(1Kg)	KH0000057	ANH SỸ -TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	100000.00	0.00	0.00	100000.00	1000000.00	0.00	0.00	2025-07-30 01:20:38.575071	1176
2684	671	1622	HD004672	SP000186	#CIRCO (2000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	260000.00	0.00	0.00	260000.00	3900000.00	0.00	0.00	2025-07-30 01:20:38.575071	1135
2685	672	1955	HD004671.01	SP000565	#CÚM H5 + H9 (250ml)	KH000180	CHỊ HƯƠNG-THÀNH AN	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	910000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	130000.00	0.00	0.00	130000.00	910000.00	0.00	0.00	2025-07-30 01:20:38.575071	1062
2686	672	1836	HD004671.01	SP000688	KHÁNG THỂ NẮP XANH	KH000180	CHỊ HƯƠNG-THÀNH AN	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				32.00	130000.00	0.00	0.00	130000.00	4160000.00	0.00	0.00	2025-07-30 01:20:38.575071	1062
2687	673	1478	HD004670	SP000336	VV OXOLIN (1Kg)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	950000.00	0.00	0.00	950000.00	4750000.00	0.00	0.00	2025-07-30 01:20:38.575071	1158
2688	673	1474	HD004670	SP000340	VV ENROFLOXACINA-TAV 20% (1Lit)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	600000.00	0.00	0.00	600000.00	2400000.00	0.00	0.00	2025-07-30 01:20:38.575071	1158
2689	674	1864	HD004669	SP000659	VV FLODOXY 30 (100g)	KH000330	HUY - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	110000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	110000.00	0.00	0.00	110000.00	110000.00	0.00	0.00	2025-07-30 01:20:38.575071	922
2690	674	1617	HD004669	SP000191	#MAX 5CLON30 (1000DS)	KH000330	HUY - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:38.575071	922
2691	675	1639	HD004668	SP000169	#REO VIRUT (500DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	90000.00	0.00	0.00	90000.00	450000.00	0.00	0.00	2025-07-30 01:20:38.575071	1080
2692	675	1753	HD004668	SP000051	#K-NEWH5 (500ml)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	7470000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	830000.00	0.00	0.00	830000.00	7470000.00	0.00	0.00	2025-07-30 01:20:38.575071	1080
2693	675	1836	HD004668	SP000688	KHÁNG THỂ NẮP XANH	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	125000.00	0.00	0.00	125000.00	1250000.00	0.00	0.00	2025-07-30 01:20:38.575071	1080
2694	676	1718	HD004667	SP000087	AGR NYSTATIN (1Kg)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	226000.00	0.00	0.00	226000.00	4520000.00	0.00	0.00	2025-07-30 01:20:38.575071	1080
2695	677	1622	HD004666	SP000186	#CIRCO (2000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	330000.00	0.00	0.00	330000.00	2640000.00	0.00	0.00	2025-07-30 01:20:38.575071	1189
2696	677	1628	HD004666	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	750000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	250000.00	0.00	0.00	250000.00	750000.00	0.00	0.00	2025-07-30 01:20:38.575071	1189
2697	677	1639	HD004666	SP000169	#REO VIRUT (500DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	150000.00	0.00	0.00	150000.00	900000.00	0.00	0.00	2025-07-30 01:20:38.575071	1189
2698	677	1942	HD004666	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	70000.00	0.00	0.00	70000.00	210000.00	0.00	0.00	2025-07-30 01:20:38.575071	1189
2699	678	1684	HD004665	SP000122	AGR PVP IODINE 10% (5lit)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	550000.00	0.00	0.00	550000.00	1100000.00	0.00	0.00	2025-07-30 01:20:38.575071	1080
2700	679	1758	HD004664	SP000046	#VAXXON CHB (1000DS)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3640000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	520000.00	0.00	0.00	520000.00	3640000.00	0.00	0.00	2025-07-30 01:20:38.575071	1080
2701	680	2035	HD004663.01	SP000479	XÚT NAOH (25kg)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	500000.00	0.00	0.00	500000.00	2500000.00	0.00	0.00	2025-07-30 01:20:38.575071	1048
2702	681	1593	HD004662	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:38.575071	1180
2703	681	1594	HD004662	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH0000052	ANH HÙNG - BỘ - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1010000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	202000.00	0.00	0.00	202000.00	1010000.00	0.00	0.00	2025-07-30 01:20:38.575071	1180
2704	682	1470	HD004661	SP000344	VV ANTIVIUS-TAV (1Lit)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:38.575071	992
2705	683	1470	HD004660	SP000344	VV ANTIVIUS-TAV (1Lit)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	8000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	800000.00	0.00	0.00	800000.00	8000000.00	0.00	0.00	2025-07-30 01:20:38.575071	992
2706	684	1955	HD004659	SP000565	#CÚM H5 + H9 (250ml)	KH000263	THƯƠNG CHÍCH - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.841	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	180000.00	0.00	0.00	180000.00	900000.00	0.00	0.00	2025-07-30 01:20:38.575071	987
2707	685	1606	HD004658	SP000202	PERMASOL 500 (1Kg)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-07-30 01:20:38.575071	1057
2708	686	1640	HD004657.01	SP000168	#DỊCH TẢ VỊT-NAVETCO (1000DS)	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	210000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	70000.00	0.00	0.00	70000.00	210000.00	0.00	0.00	2025-07-30 01:20:38.815031	1192
2709	686	1637	HD004657.01	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	300000.00	0.00	0.00	300000.00	900000.00	0.00	0.00	2025-07-30 01:20:38.815031	1192
2710	687	1584	HD004656	SP000224	#TG TẢ + CÚM (500ml)	KH0000070	ANH QUANG- GÀ TA- LẠC SƠN	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1300000.00	0.00	0.00	1300000.00	2600000.00	0.00	0.00	2025-07-30 01:20:38.815031	1165
2711	688	1625	HD004655	SP000183	CEFOTAXIM (lọ 2g)	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	30000.00	0.00	0.00	30000.00	600000.00	0.00	0.00	2025-07-30 01:20:38.815031	990
2712	688	1845	HD004655	SP000679	GENTACINE 250ml	KH000259	ANH HIẾU - DÊ	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	250000.00	0.00	0.00	250000.00	500000.00	0.00	0.00	2025-07-30 01:20:38.815031	990
2713	689	2025	HD004654	SP000489	TG-DOXY 500 (1Kg)(XÁ)	KH000360	ANH HOAN - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	1650000.00	0.00	0.00	1650000.00	3300000.00	0.00	0.00	2025-07-30 01:20:38.815031	892
2714	689	2023	HD004654	SP000492	TG COLIMOX 500(1KG)(XÁ)	KH000360	ANH HOAN - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	950000.00	0.00	0.00	950000.00	1900000.00	0.00	0.00	2025-07-30 01:20:38.815031	892
2715	689	2012	HD004654	SP000505	TG-ABENDA (1KG) (10:1)	KH000360	ANH HOAN - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2025-07-30 01:20:38.815031	892
2716	690	1942	HD004653	SP000578	#DỊCH TẢ HANVET	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	490000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	70000.00	0.00	0.00	70000.00	490000.00	0.00	0.00	2025-07-30 01:20:38.815031	1215
2717	690	1541	HD004653	SP000268	VV ANALGIN (100ml)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	30000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	30000.00	0.00	0.00	30000.00	30000.00	0.00	0.00	2025-07-30 01:20:38.815031	1215
2718	690	1548	HD004653	SP000261	VV CEFTI-S - NEW (250ml)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	6240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	390000.00	0.00	0.00	390000.00	6240000.00	0.00	0.00	2025-07-30 01:20:38.815031	1215
2719	691	1955	HD004652	SP000565	#CÚM H5 + H9 (250ml)	KH000180	CHỊ HƯƠNG-THÀNH AN	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	520000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	130000.00	0.00	0.00	130000.00	520000.00	0.00	0.00	2025-07-30 01:20:38.815031	1062
2720	692	1919	HD004651	SP000602	GLUCONAMIC KC (100ml)	KH000198	ANH TRIỆU - GIA KIỆM	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	80000.00	0.00	0.00	80000.00	800000.00	0.00	0.00	2025-07-30 01:20:38.815031	1048
2721	693	1606	HD004650	SP000202	PERMASOL 500 (1Kg)	KH0000050	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	200000.00	0.00	0.00	200000.00	4000000.00	0.00	0.00	2025-07-30 01:20:38.815031	1182
2722	693	1690	HD004650	SP000116	AGR ANTIGUM PLUS (1Kg)	KH0000050	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	120000.00	0.00	0.00	120000.00	1800000.00	0.00	0.00	2025-07-30 01:20:38.815031	1182
2723	694	1755	HD004649	SP000049	#AGR POX (1000DS)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1540000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	220000.00	0.00	0.00	220000.00	1540000.00	0.00	0.00	2025-07-30 01:20:38.815031	1185
2724	694	1886	HD004649	SP000637	#IZOVAC GUMBORO 3 (2500ds)	KH0000047	ANH LÂM (8K) - TRẠI 4	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	480000.00	0.00	0.00	480000.00	1440000.00	0.00	0.00	2025-07-30 01:20:38.815031	1185
2725	695	1453	HD004648	SP000362	TC SULPHAMONO 80/20 (1Kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1800000.00	0.00	0.00	1800000.00	1800000.00	0.00	0.00	2025-07-30 01:20:38.815031	1226
2726	695	1718	HD004648	SP000087	AGR NYSTATIN (1Kg)	KH000012	ANH LÂM (5k) - TRẠI 1	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	280000.00	0.00	0.00	280000.00	840000.00	0.00	0.00	2025-07-30 01:20:38.815031	1226
2727	696	1718	HD004647	SP000087	AGR NYSTATIN (1Kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-07-30 01:20:38.815031	1032
2728	696	1453	HD004647	SP000362	TC SULPHAMONO 80/20 (1Kg)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1800000.00	0.00	0.00	1800000.00	1800000.00	0.00	0.00	2025-07-30 01:20:38.815031	1032
2729	696	1627	HD004647	SP000181	#ND-IB-H9 (250ml)	KH000214	ANH LÂM (5K) - TRẠI 2	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	450000.00	0.00	0.00	450000.00	3600000.00	0.00	0.00	2025-07-30 01:20:38.815031	1032
2730	697	1759	HD004646.02	SP000045	#IZOVAC GUMBORO 3 (1000DS)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	200000.00	0.00	0.00	200000.00	1800000.00	0.00	0.00	2025-07-30 01:20:38.815031	881
2731	697	1760	HD004646.02	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	260000.00	0.00	0.00	260000.00	1300000.00	0.00	0.00	2025-07-30 01:20:38.815031	881
2732	698	1622	HD004645	SP000186	#CIRCO (2000DS)	KH000388	ANH HỌC (LONG)	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	400000.00	0.00	0.00	400000.00	2400000.00	0.00	0.00	2025-07-30 01:20:38.815031	865
2733	699	1635	HD004644	SP000173	#TEMBUSU CHẾT (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				20.00	290000.00	0.00	0.00	290000.00	5800000.00	0.00	0.00	2025-07-30 01:20:38.815031	1135
2734	700	1564	HD004643	SP000244	TG-DICLASOL 2.5 (1lit)	KH000340	CÔ VỠI - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	600000.00	0.00	0.00	600000.00	3000000.00	0.00	0.00	2025-07-30 01:20:38.815031	912
2735	701	1590	HD004642	SP000218	#TG IBD M+ (1000DS)	KH000293	CHỊ LOAN -BỐT ĐỎ	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	250000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	250000.00	0.00	0.00	250000.00	250000.00	0.00	0.00	2025-07-30 01:20:38.815031	957
2736	701	1591	HD004642	SP000217	#TG IBD M+ (2000DS)	KH000293	CHỊ LOAN -BỐT ĐỎ	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	400000.00	0.00	0.00	400000.00	2000000.00	0.00	0.00	2025-07-30 01:20:38.815031	957
2737	702	1639	HD004641	SP000169	#REO VIRUT (500DS)	KH0000018	KHẢI 8.500 CON - XUYÊN MỘC	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2080000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	130000.00	0.00	0.00	130000.00	2080000.00	0.00	0.00	2025-07-30 01:20:38.815031	1212
2738	702	1631	HD004641	SP000177	#RỤT MỎ RINGPU (250ml)	KH0000018	KHẢI 8.500 CON - XUYÊN MỘC	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				16.00	140000.00	0.00	0.00	140000.00	2240000.00	0.00	0.00	2025-07-30 01:20:38.815031	1212
2739	703	1773	HD004640	SP000014	INTERGREEN ASPISURE 50% (1Kg)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	250000.00	0.00	0.00	250000.00	1000000.00	0.00	0.00	2025-07-30 01:20:38.815031	992
2740	703	1893	HD004640	SP000630	AGR PHOSRENOL (1 kg)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	660000.00	0.00	0.00	660000.00	3960000.00	0.00	0.00	2025-07-30 01:20:38.815031	992
2741	703	1709	HD004640	SP000096	AGR ALL-LYTE (5Kg)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	450000.00	0.00	0.00	450000.00	900000.00	0.00	0.00	2025-07-30 01:20:38.815031	992
2742	703	1856	HD004640	SP000667	MG REVIVAL LIQUID (lít)	KH000257	XUÂN ( THUÊ NGÁT)	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	500000.00	0.00	0.00	500000.00	1500000.00	0.00	0.00	2025-07-30 01:20:38.815031	992
2743	704	1891	HD004639	VIÊM GAN HANVET	VIÊM GAN HANVET	KH0000036	ANH PHONG - SUỐI ĐÁ 2	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	960000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	80000.00	0.00	0.00	80000.00	960000.00	0.00	0.00	2025-07-30 01:20:38.815031	1195
2744	704	1942	HD004639	SP000578	#DỊCH TẢ HANVET	KH0000036	ANH PHONG - SUỐI ĐÁ 2	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	840000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	70000.00	0.00	0.00	70000.00	840000.00	0.00	0.00	2025-07-30 01:20:38.815031	1195
2745	705	1838	HD004638	SP000686	BIOFRAM BIO K-C-G (kg)	KH000378	QUÂN BIOFRAM	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	60000.00	0.00	0.00	60000.00	600000.00	0.00	0.00	2025-07-30 01:20:38.815031	874
2746	706	1704	HD004637.01	SP000101	AGR SUPPER MEAT (2lit)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	400000.00	0.00	0.00	400000.00	800000.00	0.00	0.00	2025-07-30 01:20:38.815031	1080
2747	706	1956	HD004637.01	SP000564	AGR FLUCAL 150 (1 lít)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	360000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	360000.00	0.00	0.00	360000.00	360000.00	0.00	0.00	2025-07-30 01:20:38.815031	1080
2748	706	1730	HD004637.01	SP000074	AGR SELKO®-4 HEALTH (1lit)	KH000162	CÔNG ARIVIET	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	235000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	235000.00	0.00	0.00	235000.00	235000.00	0.00	0.00	2025-07-30 01:20:38.815031	1080
2749	707	1942	HD004636.01	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	420000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	70000.00	0.00	0.00	70000.00	420000.00	0.00	0.00	2025-07-30 01:20:38.815031	1189
2750	707	1625	HD004636.01	SP000183	CEFOTAXIM (lọ 2g)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	360000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	30000.00	0.00	0.00	30000.00	360000.00	0.00	0.00	2025-07-30 01:20:38.815031	1189
2751	707	1631	HD004636.01	SP000177	#RỤT MỎ RINGPU (250ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	180000.00	0.00	0.00	180000.00	2160000.00	0.00	0.00	2025-07-30 01:20:38.815031	1189
2752	708	1704	HD004635	SP000101	AGR SUPPER MEAT (2lit)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	450000.00	0.00	0.00	450000.00	2700000.00	0.00	0.00	2025-07-30 01:20:38.815031	885
2753	708	1650	HD004635	SP000157	HANTOX 200 (1lit)	KH000367	ANH THỨC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	350000.00	0.00	0.00	350000.00	350000.00	0.00	0.00	2025-07-30 01:20:38.815031	885
2754	709	1593	HD004634	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:38.815031	1057
2755	709	1594	HD004634	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	220000.00	0.00	0.00	220000.00	220000.00	0.00	0.00	2025-07-30 01:20:38.815031	1057
2756	710	1637	HD004633	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	110000.00	0.00	0.00	110000.00	1100000.00	0.00	0.00	2025-07-30 01:20:38.815031	1135
2757	711	1628	HD004632	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1850000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	185000.00	0.00	0.00	185000.00	1850000.00	0.00	0.00	2025-07-30 01:20:38.815031	1135
2758	711	1637	HD004632	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				50.00	110000.00	0.00	0.00	110000.00	5500000.00	0.00	0.00	2025-07-30 01:20:39.033025	1135
2759	712	1835	HD004631.01	SP000689	MG MEGA-BIO	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	300000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	150000.00	0.00	0.00	150000.00	300000.00	0.00	0.00	2025-07-30 01:20:39.033025	906
2760	712	1848	HD004631.01	SP000676	MG DOXY-VM (kg) hộp	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	2000000.00	0.00	0.00	2000000.00	4000000.00	0.00	0.00	2025-07-30 01:20:39.033025	906
2761	712	1855	HD004631.01	SP000668	MG CALPHOS PLUS (lít)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	160000.00	0.00	0.00	160000.00	480000.00	0.00	0.00	2025-07-30 01:20:39.033025	906
2762	712	1874	HD004631.01	SP000649	MG VIR 220 2000ds (TẢ)	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1040000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	260000.00	0.00	0.00	260000.00	1040000.00	0.00	0.00	2025-07-30 01:20:39.033025	906
2763	712	1834	HD004631.01	SP000690	MEGA-TICOSIN	KH000346	ANH CHÍNH - VÔ NHIỄM	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	5200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	1300000.00	0.00	0.00	1300000.00	5200000.00	0.00	0.00	2025-07-30 01:20:39.033025	906
2764	713	1835	HD004630.01	SP000689	MG MEGA-BIO	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	150000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	150000.00	0.00	0.00	150000.00	150000.00	0.00	0.00	2025-07-30 01:20:39.033025	857
2765	713	1862	HD004630.01	SP000661	MEGA VIT (1kg)	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	110000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	110000.00	0.00	0.00	110000.00	110000.00	0.00	0.00	2025-07-30 01:20:39.033025	857
2766	713	1859	HD004630.01	SP000664	MG FLOR-VM 30% (lít)	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	1400000.00	0.00	0.00	1400000.00	1400000.00	0.00	0.00	2025-07-30 01:20:39.033025	857
2767	713	1855	HD004630.01	SP000668	MG CALPHOS PLUS (lít)	KH000397	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	160000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	160000.00	0.00	0.00	160000.00	160000.00	0.00	0.00	2025-07-30 01:20:39.033025	857
2768	714	1728	HD004629	SP000077	AGR TRIMETHOSOL (1lit)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.84	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	850000.00	0.00	0.00	850000.00	3400000.00	0.00	0.00	2025-07-30 01:20:39.033025	1208
1408	1	1541	HD005354	SP000268	VV ANALGIN (100ml)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	525000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				15.00	35000.00	0.00	0.00	35000.00	525000.00	0.00	0.00	2025-07-30 01:20:32.586738	1208
1409	1	1740	HD005354	SP000064	AGR CHYPSIN (100ml)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	110000.00	0.00	0.00	110000.00	1100000.00	0.00	0.00	2025-07-30 01:20:32.586738	1208
1410	1	1836	HD005354	SP000688	KHÁNG THỂ NẮP XANH	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2240000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	160000.00	0.00	0.00	160000.00	2240000.00	0.00	0.00	2025-07-30 01:20:32.586738	1208
1411	1	1742	HD005354	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	350000.00	0.00	0.00	350000.00	3500000.00	0.00	0.00	2025-07-30 01:20:32.586738	1208
1412	2	1875	HD005353	SP000648	MG VIR 220 1000ds ( TẢ )	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:32.586738	909
1413	2	1874	HD005353	SP000649	MG VIR 220 2000ds (TẢ)	KH000343	CHỊ TRÂM - VÔ NHIỄM 3K	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	260000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	260000.00	0.00	0.00	260000.00	260000.00	0.00	0.00	2025-07-30 01:20:32.586738	909
1414	3	1541	HD005352	SP000268	VV ANALGIN (100ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	35000.00	0.00	0.00	35000.00	140000.00	0.00	0.00	2025-07-30 01:20:32.586738	1210
1415	3	2078	HD005352	SP000435	VV CHYMOSIN (100ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	100000.00	0.00	0.00	100000.00	600000.00	0.00	0.00	2025-07-30 01:20:32.586738	1210
1416	3	1742	HD005352	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH0000020	CHỊ HUYỀN - VÕ DÕNG	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	350000.00	0.00	0.00	350000.00	1400000.00	0.00	0.00	2025-07-30 01:20:32.586738	1210
1417	4	1630	HD005351	SP000178	#CÚM AVAC RE5 (250ml)	KH0000106	TRINH - HIPPRA	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2380000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				14.00	170000.00	0.00	0.00	170000.00	2380000.00	0.00	0.00	2025-07-30 01:20:32.586738	1133
1418	5	1755	HD005350	SP000049	#AGR POX (1000DS)	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1760000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	220000.00	0.00	0.00	220000.00	1760000.00	0.00	0.00	2025-07-30 01:20:32.586738	1115
1998	301	2079	HD005047	SP000434	CƯỚC XE	KH0000101	ĐẠI LÝ VĂN THANH	1	\N	\N	\N	1970-01-01 00:00:45.855	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:35.374421	1138
2325	470	1541	HD004874	SP000268	VV ANALGIN (100ml)	KH0000104	TÂM UNITEK	1	\N	\N	\N	1970-01-01 00:00:45.848	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				50.00	30000.00	0.00	0.00	30000.00	1500000.00	0.00	0.00	2025-07-30 01:20:36.973249	1135
2419	516	1773	HD004828	SP000014	INTERGREEN ASPISURE 50% (1Kg)		Khách lẻ	1	\N	\N	\N	1970-01-01 00:00:45.847	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	250000.00	0.00	0.00	250000.00	1000000.00	0.00	0.00	2025-07-30 01:20:37.40761	\N
2530	577	1593	HD004767	SP000215	#TG VAKSIMUNE CLON IB (1000DS)		Khách lẻ	1	\N	\N	\N	1970-01-01 00:00:45.845	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:37.849905	\N
2769	715	1512	HD004628	SP000301	VV AMOXIN 50 WSP (1Kg)	KH000007	CHÚ PHƯỚC - TAM HOÀNG	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	700000.00	0.00	0.00	700000.00	3500000.00	0.00	0.00	2025-07-30 01:20:39.033025	1221
2770	716	1710	HD004627.01	SP000095	AGR ALL-LYTE (1Kg)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	90000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	90000.00	0.00	0.00	90000.00	90000.00	0.00	0.00	2025-07-30 01:20:39.033025	1122
2771	716	1682	HD004627.01	SP000124	AGR SEPTICA (5lit)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	500000.00	0.00	0.00	500000.00	500000.00	0.00	0.00	2025-07-30 01:20:39.033025	1122
2772	716	1712	HD004627.01	SP000093	AGR LACTO-MAXAG (1Kg)	KH0000118	TÚ GÀ TA	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-07-30 01:20:39.033025	1122
2773	717	1524	HD004626	SP000287	VV CALCI PLUS (1Lit)	KH000218	A VŨ - GÀ ĐẺ	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	480000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	120000.00	0.00	0.00	120000.00	480000.00	0.00	0.00	2025-07-30 01:20:39.033025	1028
2774	717	1450	HD004626	SP000365	TC NEO MEN BÀO TỬ (1Kg)	KH000218	A VŨ - GÀ ĐẺ	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	390000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	130000.00	0.00	0.00	130000.00	390000.00	0.00	0.00	2025-07-30 01:20:39.033025	1028
2775	717	1844	HD004626	SP000680	MG ADE SOLUTION	KH000218	A VŨ - GÀ ĐẺ	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	340000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	170000.00	0.00	0.00	170000.00	340000.00	0.00	0.00	2025-07-30 01:20:39.033025	1028
2776	718	1517	HD004625	SP000295	VV DICLACOC (1Lit)	KH000238	HẢI - TRẢNG BOM	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	860000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	430000.00	0.00	0.00	430000.00	860000.00	0.00	0.00	2025-07-30 01:20:39.033025	1011
2777	719	1779	HD004624	SP000008	NOVAVETER VITAMINO (5lit)	KH000387	ANH TÂN - LỘC HOÀ	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	12000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				8.00	1500000.00	0.00	0.00	1500000.00	12000000.00	0.00	0.00	2025-07-30 01:20:39.033025	866
2778	720	1872	HD004623	SP000651	MG VIR 102 1000ds (Đậu)	KH000358	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1890000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	210000.00	0.00	0.00	210000.00	1890000.00	0.00	0.00	2025-07-30 01:20:39.033025	894
2779	720	1630	HD004623	SP000178	#CÚM AVAC RE5 (250ml)	KH000358	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				18.00	200000.00	0.00	0.00	200000.00	3600000.00	0.00	0.00	2025-07-30 01:20:39.033025	894
2780	721	1504	HD004622	SP000309	VV FLOCOL 50 WSP (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:39.033025	1057
2781	721	2089	HD004622	SP000422	OXYTIN(10G)-ÚM GIA CẦM	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	40000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	10000.00	0.00	0.00	10000.00	40000.00	0.00	0.00	2025-07-30 01:20:39.033025	1057
2782	722	1725	HD004621	SP000080	AGR AMOXICOL POWDER (1Kg)	KH000006	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	1100000.00	0.00	0.00	1100000.00	4400000.00	0.00	0.00	2025-07-30 01:20:39.033025	1220
2784	724	2085	HD004619	SP000427	#INTERFRON(100ML)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	350000.00	0.00	0.00	350000.00	700000.00	0.00	0.00	2025-07-30 01:20:39.033025	993
2785	724	2078	HD004619	SP000435	VV CHYMOSIN (100ml)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	100000.00	0.00	0.00	100000.00	700000.00	0.00	0.00	2025-07-30 01:20:39.033025	993
2786	724	1742	HD004619	SP00006	AGR GENTA - CEFOR INJ (250ml)	KH000256	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2450000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				7.00	350000.00	0.00	0.00	350000.00	2450000.00	0.00	0.00	2025-07-30 01:20:39.033025	993
2787	725	1942	HD004618	SP000578	#DỊCH TẢ HANVET	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	350000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				5.00	70000.00	0.00	0.00	70000.00	350000.00	0.00	0.00	2025-07-30 01:20:39.033025	1158
2788	725	1548	HD004618	SP000261	VV CEFTI-S - NEW (250ml)	KH0000077	ANH TÂM - MARTINO - VỊT (NHÀ)	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4680000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				12.00	390000.00	0.00	0.00	390000.00	4680000.00	0.00	0.00	2025-07-30 01:20:39.033025	1158
2789	726	1634	HD004617	SP000174	#RỤT MỎ SINDER (250ml)	KH000326	ĐẠI LÝ GẤU - BÀU CÁ	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	600000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	150000.00	0.00	40000.00	110000.00	440000.00	0.00	0.00	2025-07-30 01:20:39.033025	926
2790	727	1628	HD004616	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	KH000205	KHẢI ( CÔ CHUNG)	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2500000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	250000.00	0.00	20000.00	230000.00	2300000.00	0.00	0.00	2025-07-30 01:20:39.033025	1041
2791	728	1844	HD004615.01	SP000680	MG ADE SOLUTION	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	180000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	180000.00	0.00	0.00	180000.00	180000.00	0.00	0.00	2025-07-30 01:20:39.033025	1057
2792	728	1864	HD004615.01	SP000659	VV FLODOXY 30 (100g)	KH000188	KHÁCH LẺ	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-07-30 01:20:39.033025	1057
2793	729	1863	HD004614	SP000660	MG TẢ CHẾT (VIR SIN 121L) 500ML	KH000365	ANH HUY - GÀ - ĐỨC HUY	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	3400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	850000.00	0.00	0.00	850000.00	3400000.00	0.00	0.00	2025-07-30 01:20:39.033025	887
2794	730	1581	HD004613	SP000227	#TG CORYZA LE (500ml)	KH000292	ANH THUỲ - XUÂN BẮC	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4200000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	1050000.00	0.00	0.00	1050000.00	4200000.00	0.00	0.00	2025-07-30 01:20:39.033025	958
2795	731	2025	HD004612	SP000489	TG-DOXY 500 (1Kg)(XÁ)	KH000221	HUYỀN TIGERVET	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	4950000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				3.00	1650000.00	0.00	0.00	1650000.00	4950000.00	0.00	0.00	2025-07-30 01:20:39.033025	1026
2796	732	1502	HD004611	SP000312	VV ENROCIN 500 WSP (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	900000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	900000.00	0.00	0.00	900000.00	900000.00	0.00	0.00	2025-07-30 01:20:39.033025	1215
2797	732	1718	HD004611	SP000087	AGR NYSTATIN (1Kg)	KH0000015	ANH TÂM ( ANH CÔNG)	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	280000.00	0.00	0.00	280000.00	1120000.00	0.00	0.00	2025-07-30 01:20:39.033025	1215
2798	733	1622	HD004610.01	SP000186	#CIRCO (2000DS)	KH000253	ANH PHONG - SUỐI ĐÁ 3	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	350000.00	0.00	0.00	350000.00	700000.00	0.00	0.00	2025-07-30 01:20:39.033025	996
2799	733	1942	HD004610.01	SP000578	#DỊCH TẢ HANVET	KH000253	ANH PHONG - SUỐI ĐÁ 3	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	70000.00	0.00	0.00	70000.00	280000.00	0.00	0.00	2025-07-30 01:20:39.033025	996
2800	734	1622	HD004609.01	SP000186	#CIRCO (2000DS)	KH000187	ANH PHONG - SUỐI ĐÁ 1	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	350000.00	0.00	0.00	350000.00	1400000.00	0.00	0.00	2025-07-30 01:20:39.033025	1058
2801	734	1942	HD004609.01	SP000578	#DỊCH TẢ HANVET	KH000187	ANH PHONG - SUỐI ĐÁ 1	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	630000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				9.00	70000.00	0.00	0.00	70000.00	630000.00	0.00	0.00	2025-07-30 01:20:39.033025	1058
2802	735	2078	HD004608	SP000435	VV CHYMOSIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	100000.00	0.00	0.00	100000.00	400000.00	0.00	0.00	2025-07-30 01:20:39.033025	1189
2803	735	1626	HD004608	SP000182	CEFOTAXIM (Bột 2g)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				90.00	30000.00	0.00	0.00	30000.00	2700000.00	0.00	0.00	2025-07-30 01:20:39.033025	1189
2804	735	1637	HD004608	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1400000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	350000.00	0.00	0.00	350000.00	1400000.00	0.00	0.00	2025-07-30 01:20:39.033025	1189
2805	735	1942	HD004608	SP000578	#DỊCH TẢ HANVET	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	70000.00	0.00	0.00	70000.00	280000.00	0.00	0.00	2025-07-30 01:20:39.033025	1189
2806	735	1541	HD004608	SP000268	VV ANALGIN (100ml)	KH0000043	ANH MINH VƯƠNG - TÍN NGHĨA	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	30000.00	0.00	0.00	30000.00	120000.00	0.00	0.00	2025-07-30 01:20:39.033025	1189
2807	736	1726	HD004607	SP000079	AGR ENROSOL 20 (1lit)	KH0000040	CÔ PHƯỢNG - BÌNH LỘC	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	500000.00	0.00	130000.00	370000.00	740000.00	0.00	0.00	2025-07-30 01:20:39.033025	1192
2808	737	1477	HD004606	SP000337	VV BENGLUXIDE (1Lit)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:39.244021	1208
2809	737	1550	HD004606	SP000259	TG UK ANTISEP 250 (1lit)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	140000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	140000.00	0.00	0.00	140000.00	140000.00	0.00	0.00	2025-07-30 01:20:39.244021	1208
2819	741	1640	HD1754268864323	SP000168	#DỊCH TẢ VỊT-NAVETCO (1000DS)	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 00:54:25.106	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	70000.00	0.00	0.00	0.00	0.00	70000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	70000.00	0.00	0.00	70000.00	70000.00	0.00	0.00	2025-08-04 00:54:23.683552	\N
2820	741	1942	HD1754268864323	SP000578	#DỊCH TẢ HANVET	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 00:54:25.106	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	70000.00	0.00	0.00	0.00	0.00	70000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	70000.00	0.00	0.00	70000.00	70000.00	0.00	0.00	2025-08-04 00:54:23.683552	\N
2821	741	1611	HD1754268864323	SP000197	#GUMBORO D78 (1000DS)	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 00:54:25.106	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	0.00	200000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-08-04 00:54:23.683552	\N
2822	742	1847	HD1754307855017	SP000677	#AGR IZOVAC ND-EDS-IB	\N	ANH THUỶ - VỊT - ĐỨC HUY	1	\N	\N	\N	2025-08-04 11:44:15.445	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	0.00	0.00	0.00	1600000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	1600000.00	0.00	0.00	1600000.00	1600000.00	0.00	0.00	2025-08-04 11:44:13.707765	\N
2823	742	1755	HD1754307855017	SP000049	#AGR POX (1000DS)	\N	ANH THUỶ - VỊT - ĐỨC HUY	1	\N	\N	\N	2025-08-04 11:44:15.445	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	440000.00	0.00	0.00	\N	\N	\N	\N	\N	2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-08-04 11:44:13.707765	\N
2824	742	1622	HD1754307855017	SP000186	#CIRCO (2000DS)	\N	ANH THUỶ - VỊT - ĐỨC HUY	1	\N	\N	\N	2025-08-04 11:44:15.445	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	0.00	400000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	400000.00	0.00	0.00	400000.00	400000.00	0.00	0.00	2025-08-04 11:44:13.707765	\N
2825	743	1760	HD1754312829160	SP000044	#IZOVAC H120 - LASOTA (2500DS)	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 13:07:09.466	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	280000.00	0.00	0.00	0.00	0.00	280000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	280000.00	0.00	0.00	280000.00	280000.00	0.00	0.00	2025-08-04 13:07:07.696854	\N
2826	743	1761	HD1754312829160	SP000043	#IZOVAC H120 - LASOTA (1000DS)	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 13:07:09.466	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	130000.00	0.00	0.00	0.00	0.00	130000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	130000.00	0.00	0.00	130000.00	130000.00	0.00	0.00	2025-08-04 13:07:07.696854	\N
2827	743	1962	HD1754312829160	SP000558	AGR BUTASAL ATP GOLD 100ml	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 13:07:09.466	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	120000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-08-04 13:07:07.696854	\N
2828	743	1750	HD1754312829160	SP000054	AGR GENTACIN (100ml)	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 13:07:09.466	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	100000.00	0.00	0.00	0.00	0.00	100000.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	100000.00	0.00	0.00	100000.00	100000.00	0.00	0.00	2025-08-04 13:07:07.696854	\N
2829	744	1630	HD1754328295337	SP000178	#CÚM AVAC RE5 (250ml)	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 17:24:56.19	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	0.00	0.00	200000.00	0.00	0.00	0.00	\N	\N	\N	\N	\N	1.00	200000.00	0.00	0.00	200000.00	200000.00	0.00	0.00	2025-08-04 17:24:54.366593	\N
2830	744	1955	HD1754328295337	SP000565	#CÚM H5 + H9 (250ml)	\N	ANH KHÁNH - VỊT - SOKLU	1	\N	\N	\N	2025-08-04 17:24:56.19	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	0.00	0.00	400000.00	0.00	0.00	0.00	\N	\N	\N	\N	\N	2.00	200000.00	0.00	0.00	200000.00	400000.00	0.00	0.00	2025-08-04 17:24:54.366593	\N
2831	745	1847	HD1754361111	SP000677	#AGR IZOVAC ND-EDS-IB	\N	ANH CHIẾN-KHÁNH	1	\N	\N	\N	2025-08-05 02:31:51.073582	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	1890000.00	0.00	1600000.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	1600000.00	0.00	0.00	1600000.00	1600000.00	1250000.00	350000.00	2025-08-05 02:31:51.073582	1076
2832	745	1630	HD1754361111	SP000178	#CÚM AVAC RE5 (250ml)	\N	ANH CHIẾN-KHÁNH	1	\N	\N	\N	2025-08-05 02:31:51.073582	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	1890000.00	0.00	400000.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	2.00	200000.00	0.00	0.00	200000.00	400000.00	155000.00	90000.00	2025-08-05 02:31:51.073582	1076
2833	746	1622	HD1754380819	SP000186	#CIRCO (2000DS)	\N	CHÚ CHIỂU - GÀ TA - ĐỨC LONG	1	\N	\N	\N	2025-08-05 08:00:19.181657	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	600000.00	400000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	400000.00	0.00	0.00	400000.00	400000.00	259903.23	140096.77	2025-08-05 08:00:19.181657	1170
2834	746	1630	HD1754380819	SP000178	#CÚM AVAC RE5 (250ml)	\N	CHÚ CHIỂU - GÀ TA - ĐỨC LONG	1	\N	\N	\N	2025-08-05 08:00:19.181657	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	600000.00	200000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	200000.00	0.00	0.00	200000.00	200000.00	155000.00	45000.00	2025-08-05 08:00:19.181657	1170
2835	747	1755	HD1754381052	SP000049	#AGR POX (1000DS)	\N	CHỊ TRINH - VĨNH CỬU 4K	1	\N	\N	\N	2025-08-05 08:04:12.175956	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	1018500.00	220000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	220000.00	0.00	0.00	220000.00	220000.00	162000.00	58000.00	2025-08-05 08:04:12.175956	830
2836	747	1622	HD1754381052	SP000186	#CIRCO (2000DS)	\N	CHỊ TRINH - VĨNH CỬU 4K	1	\N	\N	\N	2025-08-05 08:04:12.175956	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	800000.00	0.00	1018500.00	800000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	2.00	400000.00	0.00	0.00	400000.00	800000.00	259903.23	280193.54	2025-08-05 08:04:12.175956	830
2837	748	1755	HD1754381745	SP000049	#AGR POX (1000DS)	\N	NHUNG VIETVET	1	\N	\N	\N	2025-08-05 08:15:45.23856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	570000.00	220000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	220000.00	0.00	0.00	220000.00	220000.00	162000.00	58000.00	2025-08-05 08:15:45.23856	875
2838	748	1622	HD1754381745	SP000186	#CIRCO (2000DS)	\N	NHUNG VIETVET	1	\N	\N	\N	2025-08-05 08:15:45.23856	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	570000.00	400000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	400000.00	0.00	0.00	400000.00	400000.00	259903.23	140096.77	2025-08-05 08:15:45.23856	875
2839	749	1755	HD1754382197	SP000049	#AGR POX (1000DS)	\N	ANH HẢI (THUÝ)	1	\N	\N	\N	2025-08-05 08:23:16.964938	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	598500.00	220000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	220000.00	0.00	0.00	220000.00	220000.00	162000.00	58000.00	2025-08-05 08:23:16.964938	832
2840	749	1622	HD1754382197	SP000186	#CIRCO (2000DS)	\N	ANH HẢI (THUÝ)	1	\N	\N	\N	2025-08-05 08:23:16.964938	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	598500.00	400000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	400000.00	0.00	0.00	400000.00	400000.00	259903.23	140096.77	2025-08-05 08:23:16.964938	832
2841	750	1847	HD1754382269	SP000677	#AGR IZOVAC ND-EDS-IB	\N	THÚ Y KHANH THUỶ - VĨNH CỬU	1	\N	\N	\N	2025-08-05 08:24:29.140906	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1600000.00	0.00	2430648.00	1600000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	1600000.00	0.00	0.00	1600000.00	1600000.00	1250000.00	350000.00	2025-08-05 08:24:29.140906	873
2842	750	1755	HD1754382269	SP000049	#AGR POX (1000DS)	\N	THÚ Y KHANH THUỶ - VĨNH CỬU	1	\N	\N	\N	2025-08-05 08:24:29.140906	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	220000.00	0.00	2430648.00	220000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	220000.00	0.00	0.00	220000.00	220000.00	162000.00	58000.00	2025-08-05 08:24:29.140906	873
2843	750	1622	HD1754382269	SP000186	#CIRCO (2000DS)	\N	THÚ Y KHANH THUỶ - VĨNH CỬU	1	\N	\N	\N	2025-08-05 08:24:29.140906	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	2430648.00	400000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	400000.00	0.00	0.00	400000.00	400000.00	259903.23	140096.77	2025-08-05 08:24:29.140906	873
2844	750	1630	HD1754382269	SP000178	#CÚM AVAC RE5 (250ml)	\N	THÚ Y KHANH THUỶ - VĨNH CỬU	1	\N	\N	\N	2025-08-05 08:24:29.140906	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	200000.00	0.00	2430648.00	200000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	200000.00	0.00	0.00	200000.00	200000.00	155000.00	45000.00	2025-08-05 08:24:29.140906	873
2845	751	1622	HD1754384038	SP000186	#CIRCO (2000DS)	\N	ANH THUỶ - VỊT - ĐỨC HUY	1	\N	\N	\N	2025-08-05 08:53:57.727982	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	783000.00	400000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	1.00	400000.00	0.00	0.00	400000.00	400000.00	259903.23	140096.77	2025-08-05 08:53:57.727982	925
2846	751	1630	HD1754384038	SP000178	#CÚM AVAC RE5 (250ml)	\N	ANH THUỶ - VỊT - ĐỨC HUY	1	\N	\N	\N	2025-08-05 08:53:57.727982	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	400000.00	0.00	783000.00	400000.00	0.00	0.00	0.00	0.00	\N	completed	\N	\N	\N	2.00	200000.00	0.00	0.00	200000.00	400000.00	155000.00	90000.00	2025-08-05 08:53:57.727982	925
2812	738	\N	HD004605.01	SP000616{DEL}	CEVAMUNE (VIÊN)	KH000385	QUYỀN - TAM HOÀNG LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	80000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	80000.00	0.00	0.00	80000.00	80000.00	0.00	0.00	2025-07-30 01:20:39.244021	868
1419	5	1584	HD005350	SP000224	#TG TẢ + CÚM (500ml)	KH000182	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	13000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				10.00	1300000.00	0.00	0.00	1300000.00	13000000.00	0.00	0.00	2025-07-30 01:20:32.586738	1115
1420	6	1673	HD005349	SP000134	VAC PAC PLUS (5g)	KH000184	ĐINH QUỐC TUẤN	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	60000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	30000.00	0.00	0.00	30000.00	60000.00	0.00	0.00	2025-07-30 01:20:32.586738	1060
1421	6	1594	HD005349	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	KH000184	ĐINH QUỐC TUẤN	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	440000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				2.00	220000.00	0.00	0.00	220000.00	440000.00	0.00	0.00	2025-07-30 01:20:32.586738	1060
1422	7	1704	HD005348	SP000101	AGR SUPPER MEAT (2lit)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.866	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	2700000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				6.00	450000.00	0.00	0.00	450000.00	2700000.00	0.00	0.00	2025-07-30 01:20:32.586738	1208
2810	737	1668	HD004606	SP000139	TOPCIN TC5 PLUS (1lit)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:39.244021	1208
2811	737	1683	HD004606	SP000123	AGR SEPTICA (1lit)	KH0000022	ANH SỸ - VỊT	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				1.00	120000.00	0.00	0.00	120000.00	120000.00	0.00	0.00	2025-07-30 01:20:39.244021	1208
2813	738	1758	HD004605.01	SP000046	#VAXXON CHB (1000DS)	KH000385	QUYỀN - TAM HOÀNG LÔ MỚI	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	13000000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				25.00	520000.00	0.00	0.00	520000.00	13000000.00	0.00	0.00	2025-07-30 01:20:39.244021	868
2814	739	1760	HD004604	SP000044	#IZOVAC H120 - LASOTA (2500DS)	KH000371	CHÚ HUỲNH - XÃ LỘ 25	1	\N	\N	\N	1970-01-01 00:00:45.839	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	\N	1120000.00	0.00	0.00	0.00	0.00	0.00	0.00	0.00		\N				4.00	280000.00	0.00	0.00	280000.00	1120000.00	0.00	0.00	2025-07-30 01:20:39.244021	881
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoices (invoice_id, invoice_code, invoice_date, return_code, customer_id, customer_name, branch_id, total_amount, customer_paid, notes, status, created_at, updated_at, discount_type, discount_value, vat_rate, vat_amount) FROM stdin;
570	HD004774	2025-07-07 14:23:21.723	\N	906	ANH CHÍNH - VÔ NHIỄM	1	4100000.00	0.00	\N	completed	2025-07-30 00:54:59.233	2025-07-30 00:54:59.233	percentage	0.00	0.00	0.00
2	HD005353	2025-07-28 10:34:36.866	\N	909	CHỊ TRÂM - VÔ NHIỄM 3K	1	400000.00	0.00	\N	completed	2025-07-30 00:54:56.163	2025-07-30 00:54:56.163	percentage	0.00	0.00	0.00
3	HD005352	2025-07-28 10:03:36.082	\N	1210	CHỊ HUYỀN - VÕ DÕNG	1	2140000.00	0.00	\N	completed	2025-07-30 00:54:56.164	2025-07-30 00:54:56.164	percentage	0.00	0.00	0.00
4	HD005351	2025-07-28 10:02:19.822	\N	1133	TRINH - HIPPRA	1	2380000.00	0.00	\N	completed	2025-07-30 00:54:56.164	2025-07-30 00:54:56.164	percentage	0.00	0.00	0.00
5	HD005350	2025-07-28 09:57:22.903	\N	1115	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	14760000.00	0.00	\N	completed	2025-07-30 00:54:56.165	2025-07-30 00:54:56.165	percentage	0.00	0.00	0.00
6	HD005349	2025-07-28 09:51:28.827	\N	1060	ĐINH QUỐC TUẤN	1	500000.00	0.00	\N	completed	2025-07-30 00:54:56.165	2025-07-30 00:54:56.165	percentage	0.00	0.00	0.00
7	HD005348	2025-07-28 09:47:50.299	\N	1208	ANH SỸ - VỊT	1	4120000.00	0.00	\N	completed	2025-07-30 00:54:56.165	2025-07-30 00:54:56.165	percentage	0.00	0.00	0.00
8	HD005347	2025-07-28 09:31:53.206	\N	1199	ANH HÙNG - CẦU CƯỜNG	1	1600000.00	0.00	\N	completed	2025-07-30 00:54:56.165	2025-07-30 00:54:56.165	percentage	0.00	0.00	0.00
9	HD005346	2025-07-28 09:11:08.117	\N	1048	ANH TRIỆU - GIA KIỆM	1	180000.00	0.00	\N	completed	2025-07-30 00:54:56.166	2025-07-30 00:54:56.166	percentage	0.00	0.00	0.00
10	HD005345.02	2025-07-28 08:36:59.96	\N	1216	ANH HƯNG - MARTINO	1	900000.00	0.00	\N	completed	2025-07-30 00:54:56.166	2025-07-30 00:54:56.166	percentage	0.00	0.00	0.00
12	HD005343.01	2025-07-28 08:15:02.823	\N	850	ANH QUỐC - DẦU GIÂY	1	4770000.00	0.00	\N	completed	2025-07-30 00:54:56.166	2025-07-30 00:54:56.166	percentage	0.00	0.00	0.00
13	HD005342.01	2025-07-28 08:12:39.647	\N	862	HOÀ MEGA	1	10240000.00	0.00	\N	completed	2025-07-30 00:54:56.166	2025-07-30 00:54:56.166	percentage	0.00	0.00	0.00
14	HD005341	2025-07-28 07:55:32.827	\N	932	ANH KHÁNH - VỊT - SOKLU	1	1300000.00	1300000.00	\N	completed	2025-07-30 00:54:56.167	2025-07-30 00:54:56.167	percentage	0.00	0.00	0.00
15	HD005340	2025-07-28 06:59:08.61	\N	993	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	2200000.00	0.00	\N	completed	2025-07-30 00:54:56.167	2025-07-30 00:54:56.167	percentage	0.00	0.00	0.00
16	HD005339.01	2025-07-28 06:57:13.743	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	4200000.00	0.00	\N	completed	2025-07-30 00:54:56.167	2025-07-30 00:54:56.167	percentage	0.00	0.00	0.00
17	HD005338	2025-07-28 06:35:58.126	\N	1198	CÔ QUYỀN - ĐỨC LONG	1	4630000.00	0.00	\N	completed	2025-07-30 00:54:56.167	2025-07-30 00:54:56.167	percentage	0.00	0.00	0.00
18	HD005337	2025-07-28 06:25:53.863	\N	923	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	4520000.00	0.00	\N	completed	2025-07-30 00:54:56.167	2025-07-30 00:54:56.167	percentage	0.00	0.00	0.00
19	HD005336	2025-07-28 06:24:28.543	\N	1183	ANH CU - TAM HOÀNG HƯNG LỘC	1	3840000.00	0.00	\N	completed	2025-07-30 00:54:56.167	2025-07-30 00:54:56.168	percentage	0.00	0.00	0.00
20	HD005335	2025-07-27 18:23:43.266	\N	1057	KHÁCH LẺ	1	230000.00	230000.00	\N	completed	2025-07-30 00:54:56.168	2025-07-30 00:54:56.168	percentage	0.00	0.00	0.00
21	HD005334	2025-07-27 14:46:34.557	\N	1211	ANH PHONG - BÀU SẬY	1	10000.00	0.00	\N	completed	2025-07-30 00:54:56.168	2025-07-30 00:54:56.168	percentage	0.00	0.00	0.00
22	HD005333	2025-07-27 14:42:14.643	\N	1011	HẢI - TRẢNG BOM	1	2000000.00	2000000.00	\N	completed	2025-07-30 00:54:56.168	2025-07-30 00:54:56.168	percentage	0.00	0.00	0.00
23	HD005332	2025-07-27 10:23:35.457	\N	881	CHÚ HUỲNH - XÃ LỘ 25	1	6800000.00	0.00	\N	completed	2025-07-30 00:54:56.168	2025-07-30 00:54:56.168	percentage	0.00	0.00	0.00
24	HD005331	2025-07-27 09:37:05.899	\N	1211	ANH PHONG - BÀU SẬY	1	3600000.00	0.00	\N	completed	2025-07-30 00:54:56.168	2025-07-30 00:54:56.168	percentage	0.00	0.00	0.00
25	HD005330	2025-07-27 09:29:14.737	\N	1032	ANH LÂM (5K) - TRẠI 2	1	520000.00	0.00	\N	completed	2025-07-30 00:54:56.168	2025-07-30 00:54:56.168	percentage	0.00	0.00	0.00
26	HD005329	2025-07-27 09:16:34.403	\N	1041	KHẢI ( CÔ CHUNG)	1	7580000.00	0.00	\N	completed	2025-07-30 00:54:56.169	2025-07-30 00:54:56.169	percentage	0.00	0.00	0.00
27	HD005328	2025-07-27 08:41:47.637	\N	1155	ANH PHONG - VỊT (NHÀ)	1	420000.00	0.00	\N	completed	2025-07-30 00:54:56.169	2025-07-30 00:54:56.169	percentage	0.00	0.00	0.00
28	HD005327	2025-07-27 08:30:10.677	\N	1176	ANH SỸ -TAM HOÀNG	1	450000.00	0.00	\N	completed	2025-07-30 00:54:56.169	2025-07-30 00:54:56.169	percentage	0.00	0.00	0.00
29	HD005326	2025-07-27 08:24:27.587	\N	875	NHUNG VIETVET	1	6750000.00	0.00	\N	completed	2025-07-30 00:54:56.169	2025-07-30 00:54:56.169	percentage	0.00	0.00	0.00
31	HD005324	2025-07-27 07:32:07.793	\N	1155	ANH PHONG - VỊT (NHÀ)	1	2520000.00	0.00	\N	completed	2025-07-30 00:54:56.17	2025-07-30 00:54:56.17	percentage	0.00	0.00	0.00
32	HD005323	2025-07-27 07:16:03.769	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	4200000.00	0.00	\N	completed	2025-07-30 00:54:56.17	2025-07-30 00:54:56.17	percentage	0.00	0.00	0.00
33	HD005322	2025-07-27 06:34:59.55	\N	1043	HÀ HOÀNG	1	1680000.00	0.00	\N	completed	2025-07-30 00:54:56.17	2025-07-30 00:54:56.17	percentage	0.00	0.00	0.00
34	HD005321	2025-07-27 06:33:48.137	\N	1206	ANH NGHĨA - SOKLU	1	4260000.00	0.00	\N	completed	2025-07-30 00:54:56.17	2025-07-30 00:54:56.17	percentage	0.00	0.00	0.00
35	HD005320	2025-07-27 06:32:00.94	\N	923	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	6800000.00	0.00	\N	completed	2025-07-30 00:54:56.17	2025-07-30 00:54:56.17	percentage	0.00	0.00	0.00
36	HD005319	2025-07-26 14:22:22.862	\N	1080	CÔNG ARIVIET	1	4750000.00	0.00	\N	completed	2025-07-30 00:54:56.17	2025-07-30 00:54:56.17	percentage	0.00	0.00	0.00
37	HD005318	2025-07-26 14:18:12.117	\N	859	ANH QUẢNG - LONG THÀNH	1	1500000.00	0.00	\N	completed	2025-07-30 00:54:56.171	2025-07-30 00:54:56.171	percentage	0.00	0.00	0.00
38	HD005317	2025-07-26 14:16:40.633	\N	865	ANH HỌC (LONG)	1	6800000.00	0.00	\N	completed	2025-07-30 00:54:56.171	2025-07-30 00:54:56.171	percentage	0.00	0.00	0.00
39	HD005316	2025-07-26 11:26:21.67	\N	1037	ANH THIỆN - TAM HOÀNG - PHÚ TÚC	1	9900000.00	0.00	\N	completed	2025-07-30 00:54:56.171	2025-07-30 00:54:56.171	percentage	0.00	0.00	0.00
40	HD005315.01	2025-07-26 11:19:43.542	\N	857	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	1830000.00	0.00	\N	completed	2025-07-30 00:54:56.171	2025-07-30 00:54:56.171	percentage	0.00	0.00	0.00
41	HD005314	2025-07-26 11:17:59.993	\N	906	ANH CHÍNH - VÔ NHIỄM	1	3400000.00	0.00	\N	completed	2025-07-30 00:54:56.171	2025-07-30 00:54:56.171	percentage	0.00	0.00	0.00
42	HD005313.01	2025-07-26 11:13:41.736	\N	1129	SÁNG TẰNG HAID	1	8825000.00	8755000.00	\N	completed	2025-07-30 00:54:56.171	2025-07-30 00:54:56.171	percentage	0.00	0.00	0.00
43	HD005312.01	2025-07-26 10:49:43.322	\N	954	KHẢI HAIDER - BÀU CẠN LÔ 20k	1	7200000.00	0.00	\N	completed	2025-07-30 00:54:56.172	2025-07-30 00:54:56.172	percentage	0.00	0.00	0.00
44	HD005311	2025-07-26 10:33:14.557	\N	1126	EM TÀI - CÁM - TOGET	1	700000.00	0.00	\N	completed	2025-07-30 00:54:56.172	2025-07-30 00:54:56.172	percentage	0.00	0.00	0.00
45	HD005310.01	2025-07-26 10:14:22.703	TH000192	831	ANH HẢI (TUẤN)	1	6630000.00	0.00	\N	completed	2025-07-30 00:54:56.172	2025-07-30 00:54:56.172	percentage	0.00	0.00	0.00
46	HD005309	2025-07-26 10:05:54.516	\N	862	HOÀ MEGA	1	1800000.00	0.00	\N	completed	2025-07-30 00:54:56.172	2025-07-30 00:54:56.172	percentage	0.00	0.00	0.00
47	HD005308	2025-07-26 09:51:27.61	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	1600000.00	0.00	\N	completed	2025-07-30 00:54:56.172	2025-07-30 00:54:56.172	percentage	0.00	0.00	0.00
48	HD005307	2025-07-26 09:35:02.993	\N	1057	KHÁCH LẺ	1	150000.00	150000.00	\N	completed	2025-07-30 00:54:56.172	2025-07-30 00:54:56.172	percentage	0.00	0.00	0.00
50	HD005305	2025-07-26 09:03:35.653	\N	1123	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	1250000.00	0.00	\N	completed	2025-07-30 00:54:56.173	2025-07-30 00:54:56.173	percentage	0.00	0.00	0.00
51	HD005304.01	2025-07-26 08:22:51.6	\N	945	ANH TÂM ( NHÀ) - LÔ 2	1	1000000.00	0.00	\N	completed	2025-07-30 00:54:56.46	2025-07-30 00:54:56.46	percentage	0.00	0.00	0.00
52	HD005303	2025-07-26 08:16:54.337	\N	1048	ANH TRIỆU - GIA KIỆM	1	8400000.00	0.00	\N	completed	2025-07-30 00:54:56.46	2025-07-30 00:54:56.46	percentage	0.00	0.00	0.00
53	HD005302	2025-07-26 08:08:26.26	\N	1161	CHÚ THÀNH - GÀ TRE	1	220000.00	220000.00	\N	completed	2025-07-30 00:54:56.46	2025-07-30 00:54:56.46	percentage	0.00	0.00	0.00
54	HD005301	2025-07-26 08:00:27.987	\N	885	ANH THỨC - TAM HOÀNG	1	1600000.00	0.00	\N	completed	2025-07-30 00:54:56.461	2025-07-30 00:54:56.461	percentage	0.00	0.00	0.00
55	HD005300	2025-07-26 07:44:57.61	\N	1208	ANH SỸ - VỊT	1	2610000.00	0.00	\N	completed	2025-07-30 00:54:56.461	2025-07-30 00:54:56.461	percentage	0.00	0.00	0.00
56	HD005299	2025-07-26 07:31:22.899	\N	1135	TÂM UNITEK	1	4290000.00	0.00	\N	completed	2025-07-30 00:54:56.461	2025-07-30 00:54:56.461	percentage	0.00	0.00	0.00
57	HD005298	2025-07-26 06:56:08.383	\N	832	ANH HẢI (THUÝ)	1	440000.00	0.00	\N	completed	2025-07-30 00:54:56.461	2025-07-30 00:54:56.461	percentage	0.00	0.00	0.00
58	HD005297	2025-07-26 06:52:08.672	\N	1179	CÔ LAN ( TUẤN) - TAM HOÀNG	1	1980000.00	0.00	\N	completed	2025-07-30 00:54:56.461	2025-07-30 00:54:56.461	percentage	0.00	0.00	0.00
59	HD005296	2025-07-26 06:51:08.053	\N	1023	CHỊ QUY - BÌNH DƯƠNG	1	9400000.00	0.00	\N	completed	2025-07-30 00:54:56.461	2025-07-30 00:54:56.461	percentage	0.00	0.00	0.00
60	HD005295	2025-07-26 06:49:45.396	\N	1203	CHỊ LOAN ( ĐỊNH)	1	1100000.00	0.00	\N	completed	2025-07-30 00:54:56.461	2025-07-30 00:54:56.461	percentage	0.00	0.00	0.00
61	HD005294	2025-07-26 06:48:50.666	\N	966	ANH THANH - XUÂN BẮC	1	2640000.00	0.00	\N	completed	2025-07-30 00:54:56.462	2025-07-30 00:54:56.462	percentage	0.00	0.00	0.00
62	HD005293	2025-07-26 06:47:32.043	\N	1194	ANH DŨNG - VỊT	1	4400000.00	0.00	\N	completed	2025-07-30 00:54:56.462	2025-07-30 00:54:56.462	percentage	0.00	0.00	0.00
63	HD005292	2025-07-26 06:45:49.767	\N	1204	ANH HỌC	1	960000.00	0.00	\N	completed	2025-07-30 00:54:56.462	2025-07-30 00:54:56.462	percentage	0.00	0.00	0.00
579	HD004765	2025-07-07 08:34:41.597	\N	1046	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	520000.00	0.00	\N	completed	2025-07-30 00:54:59.234	2025-07-30 00:54:59.234	percentage	0.00	0.00	0.00
65	HD005290	2025-07-26 06:43:09.093	\N	833	Thắng bida (test)	1	170000.00	170000.00	\N	completed	2025-07-30 00:54:56.462	2025-07-30 00:54:56.462	percentage	0.00	0.00	0.00
66	HD005288	2025-07-26 06:40:02.096	\N	838	ANH LÂM - TRẠI 5	1	520000.00	0.00	\N	completed	2025-07-30 00:54:56.463	2025-07-30 00:54:56.463	percentage	0.00	0.00	0.00
68	HD005286	2025-07-26 06:32:42.71	\N	1178	CHÚ CHƯƠNG - TAM HOÀNG	1	1400000.00	0.00	\N	completed	2025-07-30 00:54:56.463	2025-07-30 00:54:56.463	percentage	0.00	0.00	0.00
69	HD005285	2025-07-26 06:30:55.626	\N	1192	CÔ PHƯỢNG - BÌNH LỘC	1	2220000.00	0.00	\N	completed	2025-07-30 00:54:56.463	2025-07-30 00:54:56.463	percentage	0.00	0.00	0.00
70	HD005283	2025-07-25 16:31:11.573	\N	923	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	4600000.00	0.00	\N	completed	2025-07-30 00:54:56.463	2025-07-30 00:54:56.463	percentage	0.00	0.00	0.00
71	HD005282.01	2025-07-25 16:27:45.657	\N	849	ANH HẢI HÀO LÔ MỚI	1	3030000.00	0.00	\N	completed	2025-07-30 00:54:56.464	2025-07-30 00:54:56.464	percentage	0.00	0.00	0.00
72	HD005281	2025-07-25 16:25:08.123	\N	834	CHỊ LIỄU - LONG THÀNH	1	10760000.00	0.00	\N	completed	2025-07-30 00:54:56.464	2025-07-30 00:54:56.464	percentage	0.00	0.00	0.00
73	HD005280	2025-07-25 15:33:24.62	\N	856	TRUNG - BƯU ĐIỆN - LÔ 2	1	1000000.00	0.00	\N	completed	2025-07-30 00:54:56.464	2025-07-30 00:54:56.464	percentage	0.00	0.00	0.00
74	HD005279	2025-07-25 14:57:19.6	\N	1159	EM SƠN - ECOVET	1	4350000.00	0.00	\N	completed	2025-07-30 00:54:56.464	2025-07-30 00:54:56.464	percentage	0.00	0.00	0.00
75	HD005278	2025-07-25 14:44:32.973	\N	885	ANH THỨC - TAM HOÀNG	1	3500000.00	0.00	\N	completed	2025-07-30 00:54:56.464	2025-07-30 00:54:56.464	percentage	0.00	0.00	0.00
76	HD005277	2025-07-25 14:36:27.067	\N	1126	EM TÀI - CÁM - TOGET	1	1980000.00	0.00	\N	completed	2025-07-30 00:54:56.464	2025-07-30 00:54:56.464	percentage	0.00	0.00	0.00
77	HD005276	2025-07-25 14:34:03.002	\N	909	CHỊ TRÂM - VÔ NHIỄM 3K	1	550000.00	0.00	\N	completed	2025-07-30 00:54:56.465	2025-07-30 00:54:56.465	percentage	0.00	0.00	0.00
78	HD005275.01	2025-07-25 14:31:59.893	\N	852	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	2415000.00	0.00	\N	completed	2025-07-30 00:54:56.465	2025-07-30 00:54:56.465	percentage	0.00	0.00	0.00
79	HD005274	2025-07-25 14:16:01.297	\N	1208	ANH SỸ - VỊT	1	4615000.00	0.00	\N	completed	2025-07-30 00:54:56.466	2025-07-30 00:54:56.466	percentage	0.00	0.00	0.00
80	HD005273.02	2025-07-25 11:22:39.297	\N	1011	HẢI - TRẢNG BOM	1	7380000.00	7380000.00	\N	completed	2025-07-30 00:54:56.466	2025-07-30 00:54:56.466	percentage	0.00	0.00	0.00
81	HD005272	2025-07-25 11:14:26.64	\N	1172	CHỊ TRANG-TAM HOÀNG-NAGOA	1	2400000.00	0.00	\N	completed	2025-07-30 00:54:56.466	2025-07-30 00:54:56.466	percentage	0.00	0.00	0.00
82	HD005271	2025-07-25 10:56:50.666	\N	1080	CÔNG ARIVIET	1	1100000.00	0.00	\N	completed	2025-07-30 00:54:56.466	2025-07-30 00:54:56.466	percentage	0.00	0.00	0.00
83	HD005270	2025-07-25 10:00:21.77	\N	1026	HUYỀN TIGERVET	1	440000.00	0.00	\N	completed	2025-07-30 00:54:56.466	2025-07-30 00:54:56.466	percentage	0.00	0.00	0.00
84	HD005269	2025-07-25 09:25:31.59	\N	1057	KHÁCH LẺ	1	200000.00	200000.00	\N	completed	2025-07-30 00:54:56.466	2025-07-30 00:54:56.466	percentage	0.00	0.00	0.00
85	HD005268	2025-07-25 08:53:28.803	\N	1226	ANH LÂM (5k) - TRẠI 1	1	2700000.00	0.00	\N	completed	2025-07-30 00:54:56.467	2025-07-30 00:54:56.467	percentage	0.00	0.00	0.00
86	HD005267	2025-07-25 08:51:14.667	\N	1135	TÂM UNITEK	1	11600000.00	0.00	\N	completed	2025-07-30 00:54:56.467	2025-07-30 00:54:56.467	percentage	0.00	0.00	0.00
88	HD005265	2025-07-25 07:53:02.33	\N	1185	ANH LÂM (8K) - TRẠI 4	1	910000.00	0.00	\N	completed	2025-07-30 00:54:56.467	2025-07-30 00:54:56.467	percentage	0.00	0.00	0.00
89	HD005264	2025-07-25 07:44:04.527	\N	894	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	3500000.00	0.00	\N	completed	2025-07-30 00:54:56.467	2025-07-30 00:54:56.467	percentage	0.00	0.00	0.00
90	HD005263	2025-07-25 07:42:44.966	\N	1188	ANH HIỂN - BÀU SẬY	1	3300000.00	0.00	\N	completed	2025-07-30 00:54:56.468	2025-07-30 00:54:56.468	percentage	0.00	0.00	0.00
91	HD005262	2025-07-25 07:39:06.427	\N	861	CHÚ PHÁT - DỐC MƠ	1	570000.00	0.00	\N	completed	2025-07-30 00:54:56.468	2025-07-30 00:54:56.468	percentage	0.00	0.00	0.00
92	HD005261	2025-07-25 07:35:12.746	\N	846	ANH KHÔI	1	880000.00	0.00	\N	completed	2025-07-30 00:54:56.468	2025-07-30 00:54:56.468	percentage	0.00	0.00	0.00
93	HD005260	2025-07-25 07:27:23.893	\N	1221	CHÚ PHƯỚC - TAM HOÀNG	1	900000.00	0.00	\N	completed	2025-07-30 00:54:56.468	2025-07-30 00:54:56.468	percentage	0.00	0.00	0.00
94	HD005259	2025-07-25 07:23:56.82	\N	840	ANH TÂM (CÔNG) LÔ MỚI	1	350000.00	0.00	\N	completed	2025-07-30 00:54:56.468	2025-07-30 00:54:56.468	percentage	0.00	0.00	0.00
95	HD005258	2025-07-25 07:22:36.812	\N	992	XUÂN ( THUÊ NGÁT)	1	4200000.00	0.00	\N	completed	2025-07-30 00:54:56.468	2025-07-30 00:54:56.468	percentage	0.00	0.00	0.00
96	HD005257	2025-07-25 07:21:38.853	\N	1209	XUÂN - VỊT ( NHÀ)	1	1550000.00	0.00	\N	completed	2025-07-30 00:54:56.469	2025-07-30 00:54:56.469	percentage	0.00	0.00	0.00
97	HD005256.01	2025-07-25 06:59:28.452	\N	1188	ANH HIỂN - BÀU SẬY	1	5350000.00	0.00	\N	completed	2025-07-30 00:54:56.469	2025-07-30 00:54:56.469	percentage	0.00	0.00	0.00
98	HD005255	2025-07-25 06:51:49.476	\N	899	KHẢI GIA KIỆM	1	4590000.00	0.00	\N	completed	2025-07-30 00:54:56.469	2025-07-30 00:54:56.469	percentage	0.00	0.00	0.00
99	HD005254.01	2025-07-25 06:36:11.502	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	2380000.00	0.00	\N	completed	2025-07-30 00:54:56.469	2025-07-30 00:54:56.469	percentage	0.00	0.00	0.00
100	HD005253	2025-07-25 06:32:24.422	\N	1179	CÔ LAN ( TUẤN) - TAM HOÀNG	1	0.00	0.00	\N	completed	2025-07-30 00:54:56.469	2025-07-30 00:54:56.469	percentage	0.00	0.00	0.00
101	HD005252	2025-07-25 06:31:55.926	\N	1179	CÔ LAN ( TUẤN) - TAM HOÀNG	1	12700000.00	0.00	\N	completed	2025-07-30 00:54:56.717	2025-07-30 00:54:56.717	percentage	0.00	0.00	0.00
102	HD005251	2025-07-24 17:49:41.56	\N	850	ANH QUỐC - DẦU GIÂY	1	950000.00	0.00	\N	completed	2025-07-30 00:54:56.718	2025-07-30 00:54:56.718	percentage	0.00	0.00	0.00
104	HD005249	2025-07-24 17:27:56.5	\N	861	CHÚ PHÁT - DỐC MƠ	1	440000.00	0.00	\N	completed	2025-07-30 00:54:56.718	2025-07-30 00:54:56.718	percentage	0.00	0.00	0.00
105	HD005248	2025-07-24 17:25:52.922	\N	1080	CÔNG ARIVIET	1	32000000.00	0.00	\N	completed	2025-07-30 00:54:56.719	2025-07-30 00:54:56.719	percentage	0.00	0.00	0.00
106	HD005247	2025-07-24 16:44:45.577	\N	1057	KHÁCH LẺ	1	100000.00	100000.00	\N	completed	2025-07-30 00:54:56.719	2025-07-30 00:54:56.719	percentage	0.00	0.00	0.00
107	HD005246	2025-07-24 16:38:07.523	\N	862	HOÀ MEGA	1	8850000.00	0.00	\N	completed	2025-07-30 00:54:56.719	2025-07-30 00:54:56.719	percentage	0.00	0.00	0.00
108	HD005245	2025-07-24 15:46:57.596	\N	906	ANH CHÍNH - VÔ NHIỄM	1	350000.00	0.00	\N	completed	2025-07-30 00:54:56.719	2025-07-30 00:54:56.719	percentage	0.00	0.00	0.00
109	HD005244	2025-07-24 15:09:18.55	\N	930	TUẤN NGÔ - SOKLU	1	1300000.00	1235000.00	\N	completed	2025-07-30 00:54:56.719	2025-07-30 00:54:56.719	percentage	0.00	0.00	0.00
110	HD005243	2025-07-24 14:53:24.533	\N	1034	CHỊ DUNG - SOKLU	1	10700000.00	0.00	\N	completed	2025-07-30 00:54:56.719	2025-07-30 00:54:56.719	percentage	0.00	0.00	0.00
111	HD005241.01	2025-07-24 14:32:34.683	\N	990	ANH HIẾU - DÊ	1	140000.00	140000.00	\N	completed	2025-07-30 00:54:56.72	2025-07-30 00:54:56.72	percentage	0.00	0.00	0.00
112	HD005240	2025-07-24 11:21:36.672	\N	1032	ANH LÂM (5K) - TRẠI 2	1	660000.00	0.00	\N	completed	2025-07-30 00:54:56.72	2025-07-30 00:54:56.72	percentage	0.00	0.00	0.00
113	HD005239	2025-07-24 11:20:44.13	\N	1226	ANH LÂM (5k) - TRẠI 1	1	1320000.00	0.00	\N	completed	2025-07-30 00:54:56.72	2025-07-30 00:54:56.72	percentage	0.00	0.00	0.00
114	HD005238	2025-07-24 11:16:02.83	\N	1080	CÔNG ARIVIET	1	1600000.00	0.00	\N	completed	2025-07-30 00:54:56.72	2025-07-30 00:54:56.72	percentage	0.00	0.00	0.00
115	HD005237	2025-07-24 10:31:37.97	\N	836	ANH KHÁNH - TAM HOÀNG - SOKLU 2	1	0.00	0.00	\N	completed	2025-07-30 00:54:56.72	2025-07-30 00:54:56.72	percentage	0.00	0.00	0.00
116	HD005236	2025-07-24 10:30:31.117	\N	836	ANH KHÁNH - TAM HOÀNG - SOKLU 2	1	9540000.00	0.00	\N	completed	2025-07-30 00:54:56.72	2025-07-30 00:54:56.72	percentage	0.00	0.00	0.00
117	HD005235.01	2025-07-24 09:49:56.087	\N	835	CHỊ TRINH - VĨNH AN	1	8270000.00	0.00	\N	completed	2025-07-30 00:54:56.721	2025-07-30 00:54:56.721	percentage	0.00	0.00	0.00
118	HD005234	2025-07-24 09:22:35.647	\N	885	ANH THỨC - TAM HOÀNG	1	1800000.00	0.00	\N	completed	2025-07-30 00:54:56.721	2025-07-30 00:54:56.721	percentage	0.00	0.00	0.00
119	HD005233	2025-07-24 08:06:58.56	\N	1092	CHỊ THÚY - BƯU ĐIỆN	1	11640000.00	0.00	\N	completed	2025-07-30 00:54:56.721	2025-07-30 00:54:56.721	percentage	0.00	0.00	0.00
120	HD005232	2025-07-24 07:27:41.463	\N	1221	CHÚ PHƯỚC - TAM HOÀNG	1	650000.00	0.00	\N	completed	2025-07-30 00:54:56.721	2025-07-30 00:54:56.721	percentage	0.00	0.00	0.00
121	HD005231.02	2025-07-24 07:17:59.847	\N	1204	ANH HỌC	1	2100000.00	2100000.00	\N	completed	2025-07-30 00:54:56.721	2025-07-30 00:54:56.721	percentage	0.00	0.00	0.00
123	HD005229	2025-07-24 07:00:56.773	\N	852	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	2400000.00	0.00	\N	completed	2025-07-30 00:54:56.722	2025-07-30 00:54:56.722	percentage	0.00	0.00	0.00
124	HD005228	2025-07-24 06:59:09.75	\N	878	ANH TÈO - VÔ NHIỄM	1	200000.00	0.00	\N	completed	2025-07-30 00:54:56.722	2025-07-30 00:54:56.722	percentage	0.00	0.00	0.00
125	HD005227	2025-07-24 06:56:56.573	\N	1080	CÔNG ARIVIET	1	260000.00	0.00	\N	completed	2025-07-30 00:54:56.722	2025-07-30 00:54:56.722	percentage	0.00	0.00	0.00
126	HD005226	2025-07-24 06:42:44.057	\N	1183	ANH CU - TAM HOÀNG HƯNG LỘC	1	3370000.00	0.00	\N	completed	2025-07-30 00:54:56.722	2025-07-30 00:54:56.722	percentage	0.00	0.00	0.00
127	HD005225	2025-07-24 06:40:59.257	\N	1209	XUÂN - VỊT ( NHÀ)	1	520000.00	0.00	\N	completed	2025-07-30 00:54:56.722	2025-07-30 00:54:56.722	percentage	0.00	0.00	0.00
601	HD004743	2025-07-06 08:03:55.64	\N	1215	ANH TÂM ( ANH CÔNG)	1	7650000.00	0.00	\N	completed	2025-07-30 00:54:59.459	2025-07-30 00:54:59.459	percentage	0.00	0.00	0.00
128	HD005224	2025-07-24 06:33:29.193	\N	1159	EM SƠN - ECOVET	1	5220000.00	0.00	\N	completed	2025-07-30 00:54:56.723	2025-07-30 00:54:56.723	percentage	0.00	0.00	0.00
130	HD005222	2025-07-24 06:29:43.7	\N	993	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	2820000.00	0.00	\N	completed	2025-07-30 00:54:56.723	2025-07-30 00:54:56.723	percentage	0.00	0.00	0.00
131	HD005221	2025-07-24 06:26:58.257	\N	1210	CHỊ HUYỀN - VÕ DÕNG	1	2400000.00	0.00	\N	completed	2025-07-30 00:54:56.723	2025-07-30 00:54:56.723	percentage	0.00	0.00	0.00
132	HD005220	2025-07-23 17:01:48.517	\N	1057	KHÁCH LẺ	1	800000.00	800000.00	\N	completed	2025-07-30 00:54:56.723	2025-07-30 00:54:56.723	percentage	0.00	0.00	0.00
133	HD005218	2025-07-23 16:24:40.657	\N	840	ANH TÂM (CÔNG) LÔ MỚI	1	590000.00	0.00	\N	completed	2025-07-30 00:54:56.724	2025-07-30 00:54:56.724	percentage	0.00	0.00	0.00
134	HD005217	2025-07-23 15:02:45.929	\N	1199	ANH HÙNG - CẦU CƯỜNG	1	140000.00	0.00	\N	completed	2025-07-30 00:54:56.724	2025-07-30 00:54:56.724	percentage	0.00	0.00	0.00
135	HD005216	2025-07-23 14:41:50.377	\N	1136	ANH GIA CHÍCH	1	630000.00	0.00	\N	completed	2025-07-30 00:54:56.724	2025-07-30 00:54:56.724	percentage	0.00	0.00	0.00
136	HD005215.01	2025-07-23 14:30:19.167	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	2010000.00	0.00	\N	completed	2025-07-30 00:54:56.724	2025-07-30 00:54:56.724	percentage	0.00	0.00	0.00
137	HD005214	2025-07-23 14:28:27.653	\N	1203	CHỊ LOAN ( ĐỊNH)	1	5800000.00	0.00	\N	completed	2025-07-30 00:54:56.724	2025-07-30 00:54:56.724	percentage	0.00	0.00	0.00
138	HD005213	2025-07-23 14:24:11.697	\N	1057	KHÁCH LẺ	1	230000.00	230000.00	\N	completed	2025-07-30 00:54:56.724	2025-07-30 00:54:56.724	percentage	0.00	0.00	0.00
139	HD005212	2025-07-23 14:23:17.179	\N	1155	ANH PHONG - VỊT (NHÀ)	1	3600000.00	0.00	\N	completed	2025-07-30 00:54:56.724	2025-07-30 00:54:56.724	percentage	0.00	0.00	0.00
140	HD005211.02	2025-07-23 14:21:49.852	\N	861	CHÚ PHÁT - DỐC MƠ	1	1260000.00	0.00	\N	completed	2025-07-30 00:54:56.725	2025-07-30 00:54:56.725	percentage	0.00	0.00	0.00
141	HD005210	2025-07-23 11:16:53.639	\N	962	CÔ TUYẾT THU (5K) - LÔ SONG HÀNH	1	1230000.00	0.00	\N	completed	2025-07-30 00:54:56.725	2025-07-30 00:54:56.725	percentage	0.00	0.00	0.00
143	HD005208	2025-07-23 11:13:41.583	\N	1115	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	1920000.00	0.00	\N	completed	2025-07-30 00:54:56.725	2025-07-30 00:54:56.725	percentage	0.00	0.00	0.00
144	HD005207	2025-07-23 11:04:05.717	\N	1221	CHÚ PHƯỚC - TAM HOÀNG	1	450000.00	0.00	\N	completed	2025-07-30 00:54:56.725	2025-07-30 00:54:56.725	percentage	0.00	0.00	0.00
145	HD005206	2025-07-23 10:32:12.03	\N	1057	KHÁCH LẺ	1	100000.00	100000.00	\N	completed	2025-07-30 00:54:56.725	2025-07-30 00:54:56.725	percentage	0.00	0.00	0.00
146	HD005205	2025-07-23 10:26:19.953	\N	1006	THUỲ TRANG	1	665000.00	0.00	\N	completed	2025-07-30 00:54:56.726	2025-07-30 00:54:56.726	percentage	0.00	0.00	0.00
147	HD005204.01	2025-07-23 09:45:09.747	\N	864	ANH TÀI - MARTINO (BÀ NGOẠI)	1	3120000.00	0.00	\N	completed	2025-07-30 00:54:56.726	2025-07-30 00:54:56.726	percentage	0.00	0.00	0.00
148	HD005203.01	2025-07-23 09:43:32.943	\N	1113	ANH TÀI - GÀ TA - MARTINO	1	3120000.00	0.00	\N	completed	2025-07-30 00:54:56.726	2025-07-30 00:54:56.726	percentage	0.00	0.00	0.00
149	HD005202	2025-07-23 09:10:37.532	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	4710000.00	0.00	\N	completed	2025-07-30 00:54:56.726	2025-07-30 00:54:56.726	percentage	0.00	0.00	0.00
150	HD005201	2025-07-23 09:01:54.21	\N	1092	CHỊ THÚY - BƯU ĐIỆN	1	3395000.00	0.00	\N	completed	2025-07-30 00:54:56.726	2025-07-30 00:54:56.726	percentage	0.00	0.00	0.00
151	HD005200	2025-07-23 09:00:07.503	\N	1092	CHỊ THÚY - BƯU ĐIỆN	1	15705000.00	0.00	\N	completed	2025-07-30 00:54:56.96	2025-07-30 00:54:56.96	percentage	0.00	0.00	0.00
152	HD005199	2025-07-23 08:42:39.96	\N	894	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	2500000.00	0.00	\N	completed	2025-07-30 00:54:56.961	2025-07-30 00:54:56.961	percentage	0.00	0.00	0.00
153	HD005198	2025-07-23 08:37:26.753	\N	877	ANH DANH - GÀ TRE - VÔ NHIỄM 4K	1	640000.00	0.00	\N	completed	2025-07-30 00:54:56.961	2025-07-30 00:54:56.961	percentage	0.00	0.00	0.00
154	HD005197.02	2025-07-23 08:27:14.506	\N	859	ANH QUẢNG - LONG THÀNH	1	3950000.00	0.00	\N	completed	2025-07-30 00:54:56.961	2025-07-30 00:54:56.961	percentage	0.00	0.00	0.00
155	HD005196	2025-07-23 08:24:41.69	\N	898	ANH ĐEN - GÀ - VÔ NHIỄM 2K	1	260000.00	0.00	\N	completed	2025-07-30 00:54:56.961	2025-07-30 00:54:56.961	percentage	0.00	0.00	0.00
156	HD005195.02	2025-07-23 07:47:29.642	\N	836	ANH KHÁNH - TAM HOÀNG - SOKLU 2	1	950000.00	0.00	\N	completed	2025-07-30 00:54:56.961	2025-07-30 00:54:56.961	percentage	0.00	0.00	0.00
157	HD005194	2025-07-23 07:13:20.14	\N	889	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	2800000.00	0.00	\N	completed	2025-07-30 00:54:56.961	2025-07-30 00:54:56.961	percentage	0.00	0.00	0.00
158	HD005193	2025-07-23 07:12:33.72	\N	1217	TRUNG - BƯU ĐIỆN - VỊT	1	280000.00	0.00	\N	completed	2025-07-30 00:54:56.962	2025-07-30 00:54:56.962	percentage	0.00	0.00	0.00
159	HD005192	2025-07-23 07:11:36.123	\N	1211	ANH PHONG - BÀU SẬY	1	950000.00	0.00	\N	completed	2025-07-30 00:54:56.962	2025-07-30 00:54:56.962	percentage	0.00	0.00	0.00
160	HD005191	2025-07-23 07:09:38.029	\N	1176	ANH SỸ -TAM HOÀNG	1	2200000.00	0.00	\N	completed	2025-07-30 00:54:56.962	2025-07-30 00:54:56.962	percentage	0.00	0.00	0.00
161	HD005190	2025-07-23 07:02:38.91	\N	909	CHỊ TRÂM - VÔ NHIỄM 3K	1	220000.00	0.00	\N	completed	2025-07-30 00:54:56.962	2025-07-30 00:54:56.962	percentage	0.00	0.00	0.00
162	HD005189.01	2025-07-23 06:32:51.636	\N	1025	CÔ NGA VỊT - SUỐI NHO	1	4100000.00	0.00	\N	completed	2025-07-30 00:54:56.962	2025-07-30 00:54:56.962	percentage	0.00	0.00	0.00
163	HD005188	2025-07-23 06:31:13.96	\N	917	ANH VŨ CÁM ODON	1	1350000.00	0.00	\N	completed	2025-07-30 00:54:56.962	2025-07-30 00:54:56.962	percentage	0.00	0.00	0.00
164	HD005187	2025-07-23 06:30:07.573	\N	1221	CHÚ PHƯỚC - TAM HOÀNG	1	3500000.00	0.00	\N	completed	2025-07-30 00:54:56.962	2025-07-30 00:54:56.962	percentage	0.00	0.00	0.00
165	HD005186	2025-07-23 06:28:22.653	\N	1062	CHỊ HƯƠNG-THÀNH AN	1	115000.00	0.00	\N	completed	2025-07-30 00:54:56.963	2025-07-30 00:54:56.963	percentage	0.00	0.00	0.00
166	HD005185	2025-07-23 06:21:16.517	\N	876	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	6330000.00	0.00	\N	completed	2025-07-30 00:54:56.963	2025-07-30 00:54:56.963	percentage	0.00	0.00	0.00
167	HD005184	2025-07-22 17:27:20	\N	1057	KHÁCH LẺ	1	200000.00	200000.00	\N	completed	2025-07-30 00:54:56.963	2025-07-30 00:54:56.963	percentage	0.00	0.00	0.00
168	HD005183	2025-07-22 17:21:11.407	\N	1050	EM HOÀNG AGRIVIET	1	15294000.00	0.00	\N	completed	2025-07-30 00:54:56.963	2025-07-30 00:54:56.963	percentage	0.00	0.00	0.00
170	HD005181	2025-07-22 15:40:53.023	\N	837	EM HẢI - TÂN PHÚ	1	5392000.00	0.00	\N	completed	2025-07-30 00:54:56.963	2025-07-30 00:54:56.963	percentage	0.00	0.00	0.00
171	HD005180	2025-07-22 15:27:34.37	\N	1204	ANH HỌC	1	3400000.00	3400000.00	\N	completed	2025-07-30 00:54:56.963	2025-07-30 00:54:56.963	percentage	0.00	0.00	0.00
172	HD005179	2025-07-22 14:57:50.806	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	3520000.00	0.00	\N	completed	2025-07-30 00:54:56.964	2025-07-30 00:54:56.964	percentage	0.00	0.00	0.00
173	HD005178.02	2025-07-22 14:44:37.227	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	3300000.00	0.00	\N	completed	2025-07-30 00:54:56.964	2025-07-30 00:54:56.964	percentage	0.00	0.00	0.00
174	HD005177	2025-07-22 14:41:02.013	\N	934	CÔ THẢO - GÀ ĐẺ  - ĐỨC HUY 12K	1	4200000.00	0.00	\N	completed	2025-07-30 00:54:56.964	2025-07-30 00:54:56.964	percentage	0.00	0.00	0.00
175	HD005176	2025-07-22 14:32:41.547	\N	950	ANH LÂM  FIVEVET	1	2920000.00	2920000.00	\N	completed	2025-07-30 00:54:56.964	2025-07-30 00:54:56.964	percentage	0.00	0.00	0.00
176	HD005175	2025-07-22 14:24:41.91	\N	1135	TÂM UNITEK	1	6610000.00	2100000.00	\N	completed	2025-07-30 00:54:56.964	2025-07-30 00:54:56.964	percentage	0.00	0.00	0.00
177	HD005174	2025-07-22 10:57:18.727	\N	1023	CHỊ QUY - BÌNH DƯƠNG	1	4800000.00	0.00	\N	completed	2025-07-30 00:54:56.964	2025-07-30 00:54:56.964	percentage	0.00	0.00	0.00
178	HD005173	2025-07-22 10:29:37.373	\N	945	ANH TÂM ( NHÀ) - LÔ 2	1	6230000.00	0.00	\N	completed	2025-07-30 00:54:56.964	2025-07-30 00:54:56.964	percentage	0.00	0.00	0.00
179	HD005172.01	2025-07-22 10:17:26.403	TH000189	1080	CÔNG ARIVIET	1	11900000.00	0.00	\N	completed	2025-07-30 00:54:56.964	2025-07-30 00:54:56.964	percentage	0.00	0.00	0.00
180	HD005171	2025-07-22 10:15:32.14	\N	1080	CÔNG ARIVIET	1	3220000.00	0.00	\N	completed	2025-07-30 00:54:56.965	2025-07-30 00:54:56.965	percentage	0.00	0.00	0.00
181	HD005170	2025-07-22 09:22:26.923	\N	1168	CÔ THỌ - GÀ TA - SUỐI NHO	1	1100000.00	0.00	\N	completed	2025-07-30 00:54:56.965	2025-07-30 00:54:56.965	percentage	0.00	0.00	0.00
182	HD005169.01	2025-07-22 09:20:43.113	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	3880000.00	0.00	\N	completed	2025-07-30 00:54:56.965	2025-07-30 00:54:56.965	percentage	0.00	0.00	0.00
183	HD005168	2025-07-22 09:15:36.207	\N	1203	CHỊ LOAN ( ĐỊNH)	1	0.00	0.00	\N	completed	2025-07-30 00:54:56.966	2025-07-30 00:54:56.966	percentage	0.00	0.00	0.00
184	HD005167.01	2025-07-22 09:03:26.199	\N	1203	CHỊ LOAN ( ĐỊNH)	1	11800000.00	0.00	\N	completed	2025-07-30 00:54:56.966	2025-07-30 00:54:56.966	percentage	0.00	0.00	0.00
186	HD005164	2025-07-22 08:56:34.09	\N	1176	ANH SỸ -TAM HOÀNG	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:56.966	2025-07-30 00:54:56.966	percentage	0.00	0.00	0.00
187	HD005163.01	2025-07-22 08:45:02.702	\N	838	ANH LÂM - TRẠI 5	1	3340000.00	0.00	\N	completed	2025-07-30 00:54:56.967	2025-07-30 00:54:56.967	percentage	0.00	0.00	0.00
188	HD005162	2025-07-22 08:36:19.67	\N	1032	ANH LÂM (5K) - TRẠI 2	1	2400000.00	0.00	\N	completed	2025-07-30 00:54:56.967	2025-07-30 00:54:56.967	percentage	0.00	0.00	0.00
189	HD005161	2025-07-22 08:10:36.437	\N	1092	CHỊ THÚY - BƯU ĐIỆN	1	5145000.00	0.00	\N	completed	2025-07-30 00:54:56.967	2025-07-30 00:54:56.967	percentage	0.00	0.00	0.00
616	HD004728	2025-07-05 10:53:16.502	\N	1123	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	1190000.00	1190000.00	\N	completed	2025-07-30 00:54:59.461	2025-07-30 00:54:59.461	percentage	0.00	0.00	0.00
192	HD005158	2025-07-22 07:05:41.703	\N	1006	THUỲ TRANG	1	745000.00	494000.00	\N	completed	2025-07-30 00:54:56.968	2025-07-30 00:54:56.968	percentage	0.00	0.00	0.00
193	HD005157	2025-07-22 07:04:25.546	\N	1122	TÚ GÀ TA	1	640000.00	0.00	\N	completed	2025-07-30 00:54:56.968	2025-07-30 00:54:56.968	percentage	0.00	0.00	0.00
194	HD005156	2025-07-22 06:49:35.889	\N	1057	KHÁCH LẺ	1	10000.00	10000.00	\N	completed	2025-07-30 00:54:56.968	2025-07-30 00:54:56.968	percentage	0.00	0.00	0.00
195	HD005155.01	2025-07-22 06:36:59.952	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	1120000.00	0.00	\N	completed	2025-07-30 00:54:56.968	2025-07-30 00:54:56.968	percentage	0.00	0.00	0.00
196	HD005154	2025-07-22 06:34:54.559	\N	1203	CHỊ LOAN ( ĐỊNH)	1	4400000.00	0.00	\N	completed	2025-07-30 00:54:56.968	2025-07-30 00:54:56.968	percentage	0.00	0.00	0.00
197	HD005153	2025-07-22 06:31:49.303	\N	943	THÚ Y ĐÌNH HIỀN	1	4900000.00	0.00	\N	completed	2025-07-30 00:54:56.968	2025-07-30 00:54:56.968	percentage	0.00	0.00	0.00
198	HD005152	2025-07-22 06:28:04.207	\N	1194	ANH DŨNG - VỊT	1	2940000.00	0.00	\N	completed	2025-07-30 00:54:56.968	2025-07-30 00:54:56.968	percentage	0.00	0.00	0.00
199	HD005151	2025-07-22 06:23:22.74	\N	905	ANH DUY - PHƯƠNG LÂM	1	2600000.00	0.00	\N	completed	2025-07-30 00:54:56.968	2025-07-30 00:54:56.968	percentage	0.00	0.00	0.00
200	HD005150	2025-07-22 06:20:56.179	\N	1134	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	3600000.00	0.00	\N	completed	2025-07-30 00:54:56.969	2025-07-30 00:54:56.969	percentage	0.00	0.00	0.00
201	HD005149	2025-07-21 17:25:43.077	\N	840	ANH TÂM (CÔNG) LÔ MỚI	1	500000.00	0.00	\N	completed	2025-07-30 00:54:57.296	2025-07-30 00:54:57.296	percentage	0.00	0.00	0.00
202	HD005148	2025-07-21 17:04:30.986	\N	882	ANH PHONG - CTY GREENTECH	1	2520000.00	0.00	\N	completed	2025-07-30 00:54:57.296	2025-07-30 00:54:57.296	percentage	0.00	0.00	0.00
203	HD005147	2025-07-21 16:25:03.857	TH000190	862	HOÀ MEGA	1	3300000.00	0.00	\N	completed	2025-07-30 00:54:57.297	2025-07-30 00:54:57.297	percentage	0.00	0.00	0.00
204	HD005146.01	2025-07-21 16:14:49.737	\N	846	ANH KHÔI	1	3050000.00	0.00	\N	completed	2025-07-30 00:54:57.297	2025-07-30 00:54:57.297	percentage	0.00	0.00	0.00
205	HD005145	2025-07-21 15:57:12.299	\N	868	QUYỀN - TAM HOÀNG LÔ MỚI	1	800000.00	0.00	\N	completed	2025-07-30 00:54:57.297	2025-07-30 00:54:57.297	percentage	0.00	0.00	0.00
207	HD005143	2025-07-21 15:26:40.07	\N	1057	KHÁCH LẺ	1	820000.00	820000.00	\N	completed	2025-07-30 00:54:57.298	2025-07-30 00:54:57.298	percentage	0.00	0.00	0.00
208	HD005142	2025-07-21 15:22:17.04	\N	909	CHỊ TRÂM - VÔ NHIỄM 3K	1	110000.00	0.00	\N	completed	2025-07-30 00:54:57.298	2025-07-30 00:54:57.298	percentage	0.00	0.00	0.00
209	HD005141	2025-07-21 15:19:55.099	\N	1135	TÂM UNITEK	1	5400000.00	5400000.00	\N	completed	2025-07-30 00:54:57.302	2025-07-30 00:54:57.302	percentage	0.00	0.00	0.00
210	HD005140.01	2025-07-21 14:59:00.419	\N	839	CHÚ PHƯỚC VỊNH - NINH PHÁT	1	2800000.00	2800000.00	\N	completed	2025-07-30 00:54:57.302	2025-07-30 00:54:57.302	percentage	0.00	0.00	0.00
211	HD005139	2025-07-21 14:47:23.896	\N	1209	XUÂN - VỊT ( NHÀ)	1	1260000.00	0.00	\N	completed	2025-07-30 00:54:57.303	2025-07-30 00:54:57.303	percentage	0.00	0.00	0.00
212	HD005138	2025-07-21 14:17:06.963	\N	1048	ANH TRIỆU - GIA KIỆM	1	3910000.00	0.00	\N	completed	2025-07-30 00:54:57.303	2025-07-30 00:54:57.303	percentage	0.00	0.00	0.00
213	HD005137	2025-07-21 09:17:37.952	\N	1057	KHÁCH LẺ	1	60000.00	60000.00	\N	completed	2025-07-30 00:54:57.303	2025-07-30 00:54:57.303	percentage	0.00	0.00	0.00
214	HD005136	2025-07-21 09:15:10.427	\N	1224	KHẢI HAIDER - BÀU CẠN	1	9200000.00	0.00	\N	completed	2025-07-30 00:54:57.303	2025-07-30 00:54:57.303	percentage	0.00	0.00	0.00
215	HD005135	2025-07-21 09:02:00.703	\N	1212	KHẢI 8.500 CON - XUYÊN MỘC	1	4150000.00	0.00	\N	completed	2025-07-30 00:54:57.303	2025-07-30 00:54:57.303	percentage	0.00	0.00	0.00
216	HD005134	2025-07-21 08:59:24.43	\N	1195	ANH PHONG - SUỐI ĐÁ 2	1	7720000.00	0.00	\N	completed	2025-07-30 00:54:57.304	2025-07-30 00:54:57.304	percentage	0.00	0.00	0.00
217	HD005133	2025-07-21 08:57:25.757	\N	1080	CÔNG ARIVIET	1	14680000.00	0.00	\N	completed	2025-07-30 00:54:57.304	2025-07-30 00:54:57.304	percentage	0.00	0.00	0.00
218	HD005132	2025-07-21 08:42:59.253	\N	1080	CÔNG ARIVIET	1	1740000.00	0.00	\N	completed	2025-07-30 00:54:57.304	2025-07-30 00:54:57.304	percentage	0.00	0.00	0.00
219	HD005131	2025-07-21 08:33:56.412	\N	905	ANH DUY - PHƯƠNG LÂM	1	4030000.00	0.00	\N	completed	2025-07-30 00:54:57.304	2025-07-30 00:54:57.304	percentage	0.00	0.00	0.00
220	HD005130	2025-07-21 08:13:47.289	\N	996	ANH PHONG - SUỐI ĐÁ 3	1	1350000.00	0.00	\N	completed	2025-07-30 00:54:57.304	2025-07-30 00:54:57.304	percentage	0.00	0.00	0.00
221	HD005129	2025-07-21 08:06:44.917	\N	1058	ANH PHONG - SUỐI ĐÁ 1	1	3470000.00	0.00	\N	completed	2025-07-30 00:54:57.304	2025-07-30 00:54:57.304	percentage	0.00	0.00	0.00
222	HD005128	2025-07-21 07:55:31.453	\N	906	ANH CHÍNH - VÔ NHIỄM	1	5800000.00	0.00	\N	completed	2025-07-30 00:54:57.305	2025-07-30 00:54:57.305	percentage	0.00	0.00	0.00
223	HD005127.01	2025-07-21 07:50:21.45	\N	1183	ANH CU - TAM HOÀNG HƯNG LỘC	1	13950000.00	0.00	\N	completed	2025-07-30 00:54:57.305	2025-07-30 00:54:57.305	percentage	0.00	0.00	0.00
224	HD005126	2025-07-21 07:43:41.866	\N	1182	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	3150000.00	0.00	\N	completed	2025-07-30 00:54:57.305	2025-07-30 00:54:57.305	percentage	0.00	0.00	0.00
225	HD005125	2025-07-21 07:28:48.84	\N	1172	CHỊ TRANG-TAM HOÀNG-NAGOA	1	1400000.00	0.00	\N	completed	2025-07-30 00:54:57.305	2025-07-30 00:54:57.305	percentage	0.00	0.00	0.00
226	HD005124	2025-07-21 06:39:14.08	\N	1122	TÚ GÀ TA	1	280000.00	0.00	\N	completed	2025-07-30 00:54:57.305	2025-07-30 00:54:57.305	percentage	0.00	0.00	0.00
227	HD005123.01	2025-07-21 06:36:34.562	\N	1117	ANH HƯNG - GÀ - SUỐI ĐÁ	1	19100000.00	0.00	\N	completed	2025-07-30 00:54:57.305	2025-07-30 00:54:57.305	percentage	0.00	0.00	0.00
228	HD005122	2025-07-21 06:32:17.777	\N	992	XUÂN ( THUÊ NGÁT)	1	2500000.00	0.00	\N	completed	2025-07-30 00:54:57.305	2025-07-30 00:54:57.305	percentage	0.00	0.00	0.00
230	HD005120.01	2025-07-20 14:42:31.447	\N	1057	KHÁCH LẺ	1	240000.00	240000.00	\N	completed	2025-07-30 00:54:57.306	2025-07-30 00:54:57.306	percentage	0.00	0.00	0.00
231	HD005119	2025-07-20 14:21:06.336	\N	1026	HUYỀN TIGERVET	1	10024000.00	0.00	\N	completed	2025-07-30 00:54:57.306	2025-07-30 00:54:57.306	percentage	0.00	0.00	0.00
232	HD005118	2025-07-20 11:46:53.957	\N	1057	KHÁCH LẺ	1	120000.00	120000.00	\N	completed	2025-07-30 00:54:57.306	2025-07-30 00:54:57.306	percentage	0.00	0.00	0.00
233	HD005117	2025-07-20 11:09:58.272	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	2560000.00	1100000.00	\N	completed	2025-07-30 00:54:57.306	2025-07-30 00:54:57.306	percentage	0.00	0.00	0.00
234	HD005116	2025-07-20 11:07:50.797	\N	1057	KHÁCH LẺ	1	50000.00	50000.00	\N	completed	2025-07-30 00:54:57.306	2025-07-30 00:54:57.306	percentage	0.00	0.00	0.00
235	HD005115	2025-07-20 11:05:16.273	\N	909	CHỊ TRÂM - VÔ NHIỄM 3K	1	1900000.00	0.00	\N	completed	2025-07-30 00:54:57.306	2025-07-30 00:54:57.306	percentage	0.00	0.00	0.00
236	HD005114	2025-07-20 10:52:24.396	\N	1032	ANH LÂM (5K) - TRẠI 2	1	1400000.00	0.00	\N	completed	2025-07-30 00:54:57.306	2025-07-30 00:54:57.306	percentage	0.00	0.00	0.00
237	HD005113	2025-07-20 10:51:05.497	\N	1226	ANH LÂM (5k) - TRẠI 1	1	4800000.00	0.00	\N	completed	2025-07-30 00:54:57.307	2025-07-30 00:54:57.307	percentage	0.00	0.00	0.00
238	HD005111	2025-07-20 07:36:30.73	\N	1180	ANH HÙNG - BỘ - TAM HOÀNG	1	2010000.00	0.00	\N	completed	2025-07-30 00:54:57.307	2025-07-30 00:54:57.307	percentage	0.00	0.00	0.00
239	HD005110	2025-07-20 06:59:06.267	\N	923	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	4520000.00	0.00	\N	completed	2025-07-30 00:54:57.307	2025-07-30 00:54:57.307	percentage	0.00	0.00	0.00
240	HD005109	2025-07-20 06:55:04.093	\N	993	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	5240000.00	0.00	\N	completed	2025-07-30 00:54:57.307	2025-07-30 00:54:57.307	percentage	0.00	0.00	0.00
241	HD005108	2025-07-19 16:35:53.453	TH000186	1026	HUYỀN TIGERVET	1	15600000.00	0.00	\N	completed	2025-07-30 00:54:57.307	2025-07-30 00:54:57.307	percentage	0.00	0.00	0.00
242	HD005107	2025-07-19 16:31:54.643	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	960000.00	960000.00	\N	completed	2025-07-30 00:54:57.307	2025-07-30 00:54:57.307	percentage	0.00	0.00	0.00
243	HD005106	2025-07-19 14:34:54.817	\N	842	ANH THẾ - VÕ DÕNG	1	670000.00	670000.00	\N	completed	2025-07-30 00:54:57.307	2025-07-30 00:54:57.307	percentage	0.00	0.00	0.00
244	HD005105	2025-07-19 14:32:06.626	\N	840	ANH TÂM (CÔNG) LÔ MỚI	1	4760000.00	0.00	\N	completed	2025-07-30 00:54:57.307	2025-07-30 00:54:57.307	percentage	0.00	0.00	0.00
245	HD005104	2025-07-19 10:53:01.887	\N	1057	KHÁCH LẺ	1	50000.00	50000.00	\N	completed	2025-07-30 00:54:57.308	2025-07-30 00:54:57.308	percentage	0.00	0.00	0.00
246	HD005103	2025-07-19 10:46:25.207	\N	1034	CHỊ DUNG - SOKLU	1	2900000.00	0.00	\N	completed	2025-07-30 00:54:57.308	2025-07-30 00:54:57.308	percentage	0.00	0.00	0.00
247	HD005102	2025-07-19 10:33:18.379	\N	920	KHÁNH EMIVET	1	660000.00	0.00	\N	completed	2025-07-30 00:54:57.308	2025-07-30 00:54:57.308	percentage	0.00	0.00	0.00
249	HD005100	2025-07-19 10:12:07.289	\N	1176	ANH SỸ -TAM HOÀNG	1	2200000.00	0.00	\N	completed	2025-07-30 00:54:57.308	2025-07-30 00:54:57.308	percentage	0.00	0.00	0.00
250	HD005099	2025-07-19 10:08:26.267	\N	1006	THUỲ TRANG	1	385000.00	385000.00	\N	completed	2025-07-30 00:54:57.308	2025-07-30 00:54:57.308	percentage	0.00	0.00	0.00
251	HD005098.01	2025-07-19 09:45:29.939	\N	1159	EM SƠN - ECOVET	1	3170000.00	0.00	\N	completed	2025-07-30 00:54:57.531	2025-07-30 00:54:57.531	percentage	0.00	0.00	0.00
252	HD005097	2025-07-19 09:04:06.757	\N	898	ANH ĐEN - GÀ - VÔ NHIỄM 2K	1	1100000.00	0.00	\N	completed	2025-07-30 00:54:57.531	2025-07-30 00:54:57.531	percentage	0.00	0.00	0.00
253	HD005096	2025-07-19 08:58:39.177	\N	895	CƯỜNG UNITEX	1	1080000.00	1080000.00	\N	completed	2025-07-30 00:54:57.531	2025-07-30 00:54:57.531	percentage	0.00	0.00	0.00
633	HD004711.01	2025-07-05 07:11:46.04	\N	1113	ANH TÀI - GÀ TA - MARTINO	1	930000.00	0.00	\N	completed	2025-07-30 00:54:59.463	2025-07-30 00:54:59.463	percentage	0.00	0.00	0.00
255	HD005094.01	2025-07-19 08:24:46.326	\N	1050	EM HOÀNG AGRIVIET	1	6660000.00	0.00	\N	completed	2025-07-30 00:54:57.532	2025-07-30 00:54:57.532	percentage	0.00	0.00	0.00
256	HD005093	2025-07-19 07:55:08.65	\N	1057	KHÁCH LẺ	1	10000.00	10000.00	\N	completed	2025-07-30 00:54:57.532	2025-07-30 00:54:57.532	percentage	0.00	0.00	0.00
257	HD005092	2025-07-19 07:49:28.627	\N	1190	CHỊ QUYÊN - VỊT	1	6850000.00	0.00	\N	completed	2025-07-30 00:54:57.532	2025-07-30 00:54:57.532	percentage	0.00	0.00	0.00
258	HD005091	2025-07-19 07:07:12.077	\N	1092	CHỊ THÚY - BƯU ĐIỆN	1	0.00	0.00	\N	completed	2025-07-30 00:54:57.533	2025-07-30 00:54:57.533	percentage	0.00	0.00	0.00
259	HD005090.01	2025-07-19 07:06:31.483	\N	1092	CHỊ THÚY - BƯU ĐIỆN	1	8500000.00	0.00	\N	completed	2025-07-30 00:54:57.533	2025-07-30 00:54:57.533	percentage	0.00	0.00	0.00
260	HD005089	2025-07-19 06:57:39.877	\N	917	ANH VŨ CÁM ODON	1	500000.00	0.00	\N	completed	2025-07-30 00:54:57.533	2025-07-30 00:54:57.533	percentage	0.00	0.00	0.00
261	HD005088	2025-07-19 06:51:39.143	\N	1210	CHỊ HUYỀN - VÕ DÕNG	1	2680000.00	0.00	\N	completed	2025-07-30 00:54:57.533	2025-07-30 00:54:57.533	percentage	0.00	0.00	0.00
262	HD005087	2025-07-19 06:39:27.163	\N	1023	CHỊ QUY - BÌNH DƯƠNG	1	3600000.00	0.00	\N	completed	2025-07-30 00:54:57.533	2025-07-30 00:54:57.533	percentage	0.00	0.00	0.00
264	HD005085.01	2025-07-19 06:31:42.9	\N	861	CHÚ PHÁT - DỐC MƠ	1	440000.00	0.00	\N	completed	2025-07-30 00:54:57.534	2025-07-30 00:54:57.534	percentage	0.00	0.00	0.00
265	HD005084	2025-07-19 06:15:45.887	\N	1179	CÔ LAN ( TUẤN) - TAM HOÀNG	1	3640000.00	3640000.00	\N	completed	2025-07-30 00:54:57.534	2025-07-30 00:54:57.534	percentage	0.00	0.00	0.00
266	HD005083	2025-07-18 17:42:34.56	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	960000.00	960000.00	\N	completed	2025-07-30 00:54:57.534	2025-07-30 00:54:57.534	percentage	0.00	0.00	0.00
267	HD005082	2025-07-18 17:07:38.906	\N	844	ANH PHONG - VĨNH TÂN	1	0.00	0.00	\N	completed	2025-07-30 00:54:57.534	2025-07-30 00:54:57.534	percentage	0.00	0.00	0.00
268	HD005081	2025-07-18 16:46:29.169	\N	881	CHÚ HUỲNH - XÃ LỘ 25	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:57.534	2025-07-30 00:54:57.534	percentage	0.00	0.00	0.00
269	HD005080	2025-07-18 16:35:18.656	\N	967	ANH ĐỨC - VÔ NHIỄM	1	450000.00	450000.00	\N	completed	2025-07-30 00:54:57.535	2025-07-30 00:54:57.535	percentage	0.00	0.00	0.00
270	HD005079	2025-07-18 16:29:53.213	\N	846	ANH KHÔI	1	1160000.00	0.00	\N	completed	2025-07-30 00:54:57.535	2025-07-30 00:54:57.535	percentage	0.00	0.00	0.00
271	HD005078	2025-07-18 16:24:00.679	\N	892	ANH HOAN - XUÂN BẮC	1	950000.00	0.00	\N	completed	2025-07-30 00:54:57.535	2025-07-30 00:54:57.535	percentage	0.00	0.00	0.00
272	HD005077	2025-07-18 16:21:43.306	\N	1026	HUYỀN TIGERVET	1	18180000.00	0.00	\N	completed	2025-07-30 00:54:57.535	2025-07-30 00:54:57.535	percentage	0.00	0.00	0.00
273	HD005076	2025-07-18 15:37:58.879	\N	1011	HẢI - TRẢNG BOM	1	3150000.00	3150000.00	\N	completed	2025-07-30 00:54:57.535	2025-07-30 00:54:57.535	percentage	0.00	0.00	0.00
274	HD005075	2025-07-18 15:10:52.14	\N	849	ANH HẢI HÀO LÔ MỚI	1	900000.00	900000.00	\N	completed	2025-07-30 00:54:57.535	2025-07-30 00:54:57.535	percentage	0.00	0.00	0.00
275	HD005074	2025-07-18 15:01:19.353	\N	1102	ANH HƯNG - SƠN MAI	1	3000000.00	0.00	\N	completed	2025-07-30 00:54:57.536	2025-07-30 00:54:57.536	percentage	0.00	0.00	0.00
276	HD005072	2025-07-18 14:56:57.137	\N	841	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	1890000.00	0.00	\N	completed	2025-07-30 00:54:57.536	2025-07-30 00:54:57.536	percentage	0.00	0.00	0.00
277	HD005071	2025-07-18 14:46:46.053	\N	840	ANH TÂM (CÔNG) LÔ MỚI	1	2160000.00	0.00	\N	completed	2025-07-30 00:54:57.536	2025-07-30 00:54:57.536	percentage	0.00	0.00	0.00
278	HD005070	2025-07-18 14:31:05.09	\N	1194	ANH DŨNG - VỊT	1	3600000.00	0.00	\N	completed	2025-07-30 00:54:57.536	2025-07-30 00:54:57.536	percentage	0.00	0.00	0.00
279	HD005069	2025-07-18 11:27:11.1	\N	1199	ANH HÙNG - CẦU CƯỜNG	1	1260000.00	0.00	\N	completed	2025-07-30 00:54:57.536	2025-07-30 00:54:57.536	percentage	0.00	0.00	0.00
280	HD005068	2025-07-18 11:24:27.577	\N	1203	CHỊ LOAN ( ĐỊNH)	1	7800000.00	0.00	\N	completed	2025-07-30 00:54:57.536	2025-07-30 00:54:57.536	percentage	0.00	0.00	0.00
281	HD005067.01	2025-07-18 11:23:09.207	\N	844	ANH PHONG - VĨNH TÂN	1	13670000.00	13670000.00	\N	completed	2025-07-30 00:54:57.536	2025-07-30 00:54:57.536	percentage	0.00	0.00	0.00
283	HD005065	2025-07-18 09:33:37.462	\N	885	ANH THỨC - TAM HOÀNG	1	1900000.00	0.00	\N	completed	2025-07-30 00:54:57.537	2025-07-30 00:54:57.537	percentage	0.00	0.00	0.00
284	HD005064	2025-07-18 09:22:34.316	\N	1040	Đ.LÝ  DUNG TÙNG - TÂN PHÚ	1	2500000.00	0.00	\N	completed	2025-07-30 00:54:57.537	2025-07-30 00:54:57.537	percentage	0.00	0.00	0.00
285	HD005063	2025-07-18 09:14:06.803	\N	1114	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	7600000.00	0.00	\N	completed	2025-07-30 00:54:57.537	2025-07-30 00:54:57.537	percentage	0.00	0.00	0.00
286	HD005062	2025-07-18 09:07:57.07	\N	906	ANH CHÍNH - VÔ NHIỄM	1	1000000.00	0.00	\N	completed	2025-07-30 00:54:57.537	2025-07-30 00:54:57.537	percentage	0.00	0.00	0.00
287	HD005061	2025-07-18 09:04:10.993	\N	1057	KHÁCH LẺ	1	120000.00	120000.00	\N	completed	2025-07-30 00:54:57.537	2025-07-30 00:54:57.537	percentage	0.00	0.00	0.00
288	HD005060	2025-07-18 08:57:35.393	\N	859	ANH QUẢNG - LONG THÀNH	1	5200000.00	5200000.00	\N	completed	2025-07-30 00:54:57.537	2025-07-30 00:54:57.537	percentage	0.00	0.00	0.00
289	HD005059	2025-07-18 08:49:12.856	\N	857	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	630000.00	0.00	\N	completed	2025-07-30 00:54:57.537	2025-07-30 00:54:57.537	percentage	0.00	0.00	0.00
290	HD005058	2025-07-18 08:47:21.517	\N	1057	KHÁCH LẺ	1	380000.00	380000.00	\N	completed	2025-07-30 00:54:57.538	2025-07-30 00:54:57.538	percentage	0.00	0.00	0.00
291	HD005057	2025-07-18 08:40:32.386	\N	909	CHỊ TRÂM - VÔ NHIỄM 3K	1	1220000.00	0.00	\N	completed	2025-07-30 00:54:57.538	2025-07-30 00:54:57.538	percentage	0.00	0.00	0.00
292	HD005056	2025-07-18 08:35:02.399	\N	878	ANH TÈO - VÔ NHIỄM	1	2800000.00	0.00	\N	completed	2025-07-30 00:54:57.538	2025-07-30 00:54:57.538	percentage	0.00	0.00	0.00
293	HD005055	2025-07-18 07:59:27.399	\N	875	NHUNG VIETVET	1	3480000.00	0.00	\N	completed	2025-07-30 00:54:57.538	2025-07-30 00:54:57.538	percentage	0.00	0.00	0.00
294	HD005054	2025-07-18 07:55:52.327	\N	1048	ANH TRIỆU - GIA KIỆM	1	3230000.00	0.00	\N	completed	2025-07-30 00:54:57.538	2025-07-30 00:54:57.538	percentage	0.00	0.00	0.00
295	HD005053	2025-07-18 06:53:27.113	\N	1080	CÔNG ARIVIET	1	1335000.00	0.00	\N	completed	2025-07-30 00:54:57.538	2025-07-30 00:54:57.538	percentage	0.00	0.00	0.00
297	HD005052	2025-07-18 06:29:14.943	\N	892	ANH HOAN - XUÂN BẮC	1	1350000.00	0.00	\N	completed	2025-07-30 00:54:57.538	2025-07-30 00:54:57.538	percentage	0.00	0.00	0.00
298	HD005051	2025-07-18 06:24:28.053	\N	920	KHÁNH EMIVET	1	2240000.00	0.00	\N	completed	2025-07-30 00:54:57.539	2025-07-30 00:54:57.539	percentage	0.00	0.00	0.00
299	HD005049	2025-07-18 06:22:26.136	\N	1176	ANH SỸ -TAM HOÀNG	1	4610000.00	0.00	\N	completed	2025-07-30 00:54:57.539	2025-07-30 00:54:57.539	percentage	0.00	0.00	0.00
300	HD005048.01	2025-07-17 17:36:19.976	\N	1117	ANH HƯNG - GÀ - SUỐI ĐÁ	1	6340000.00	0.00	\N	completed	2025-07-30 00:54:57.539	2025-07-30 00:54:57.539	percentage	0.00	0.00	0.00
301	HD005047	2025-07-17 16:40:13.497	\N	1138	ĐẠI LÝ VĂN THANH	1	1540000.00	0.00	\N	completed	2025-07-30 00:54:57.842	2025-07-30 00:54:57.842	percentage	0.00	0.00	0.00
302	HD005046.01	2025-07-17 16:37:29.706	\N	917	ANH VŨ CÁM ODON	1	1950000.00	0.00	\N	completed	2025-07-30 00:54:57.842	2025-07-30 00:54:57.842	percentage	0.00	0.00	0.00
303	HD005045	2025-07-17 16:32:16.607	\N	1180	ANH HÙNG - BỘ - TAM HOÀNG	1	1980000.00	0.00	\N	completed	2025-07-30 00:54:57.842	2025-07-30 00:54:57.842	percentage	0.00	0.00	0.00
304	HD005044	2025-07-17 16:26:49.613	\N	1080	CÔNG ARIVIET	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:57.843	2025-07-30 00:54:57.843	percentage	0.00	0.00	0.00
305	HD005043	2025-07-17 16:08:59.91	\N	1185	ANH LÂM (8K) - TRẠI 4	1	1190000.00	0.00	\N	completed	2025-07-30 00:54:57.843	2025-07-30 00:54:57.843	percentage	0.00	0.00	0.00
306	HD005042.01	2025-07-17 14:25:10.13	\N	964	ANH HÀNH - XUÂN BẮC	1	6500000.00	0.00	\N	completed	2025-07-30 00:54:57.843	2025-07-30 00:54:57.843	percentage	0.00	0.00	0.00
307	HD005041	2025-07-17 14:23:54.583	\N	1135	TÂM UNITEK	1	15400000.00	15400000.00	\N	completed	2025-07-30 00:54:57.843	2025-07-30 00:54:57.843	percentage	0.00	0.00	0.00
308	HD005040.01	2025-07-17 14:22:25.967	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	1600000.00	1600000.00	\N	completed	2025-07-30 00:54:57.843	2025-07-30 00:54:57.843	percentage	0.00	0.00	0.00
309	HD005039	2025-07-17 14:21:12.52	\N	875	NHUNG VIETVET	1	6570000.00	0.00	\N	completed	2025-07-30 00:54:57.844	2025-07-30 00:54:57.844	percentage	0.00	0.00	0.00
311	HD005037	2025-07-17 10:53:48.687	\N	1212	KHẢI 8.500 CON - XUYÊN MỘC	1	2880000.00	0.00	\N	completed	2025-07-30 00:54:57.844	2025-07-30 00:54:57.844	percentage	0.00	0.00	0.00
312	HD005036	2025-07-17 10:22:23.663	\N	842	ANH THẾ - VÕ DÕNG	1	1850000.00	1850000.00	\N	completed	2025-07-30 00:54:57.844	2025-07-30 00:54:57.844	percentage	0.00	0.00	0.00
313	HD005035.02	2025-07-17 10:18:14.622	\N	877	ANH DANH - GÀ TRE - VÔ NHIỄM 4K	1	1850000.00	0.00	\N	completed	2025-07-30 00:54:57.844	2025-07-30 00:54:57.844	percentage	0.00	0.00	0.00
314	HD005034	2025-07-17 08:38:11.61	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	840000.00	840000.00	\N	completed	2025-07-30 00:54:57.844	2025-07-30 00:54:57.844	percentage	0.00	0.00	0.00
315	HD005033	2025-07-17 08:33:50.513	\N	1159	EM SƠN - ECOVET	1	2550000.00	0.00	\N	completed	2025-07-30 00:54:57.844	2025-07-30 00:54:57.844	percentage	0.00	0.00	0.00
316	HD005032	2025-07-17 08:28:33.643	\N	1026	HUYỀN TIGERVET	1	0.00	0.00	\N	completed	2025-07-30 00:54:57.845	2025-07-30 00:54:57.845	percentage	0.00	0.00	0.00
317	HD005031	2025-07-17 08:28:04.74	\N	1026	HUYỀN TIGERVET	1	1400000.00	0.00	\N	completed	2025-07-30 00:54:57.845	2025-07-30 00:54:57.845	percentage	0.00	0.00	0.00
639	HD004705	2025-07-05 06:16:49.2	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	1000000.00	1000000.00	\N	completed	2025-07-30 00:54:59.464	2025-07-30 00:54:59.464	percentage	0.00	0.00	0.00
318	HD005030	2025-07-17 08:07:19.162	\N	1057	KHÁCH LẺ	1	250000.00	250000.00	\N	completed	2025-07-30 00:54:57.845	2025-07-30 00:54:57.845	percentage	0.00	0.00	0.00
320	HD005028	2025-07-17 07:20:14.959	\N	1178	CHÚ CHƯƠNG - TAM HOÀNG	1	1920000.00	0.00	\N	completed	2025-07-30 00:54:57.845	2025-07-30 00:54:57.845	percentage	0.00	0.00	0.00
321	HD005027	2025-07-17 06:25:39.677	\N	1115	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	5630000.00	0.00	\N	completed	2025-07-30 00:54:57.845	2025-07-30 00:54:57.845	percentage	0.00	0.00	0.00
322	HD005025.03	2025-07-17 06:18:50.143	\N	878	ANH TÈO - VÔ NHIỄM	1	4900000.00	0.00	\N	completed	2025-07-30 00:54:57.845	2025-07-30 00:54:57.845	percentage	0.00	0.00	0.00
323	HD005024	2025-07-16 16:48:32.159	\N	863	NGUYỆT SƠN LÂM	1	350000.00	350000.00	\N	completed	2025-07-30 00:54:57.846	2025-07-30 00:54:57.846	percentage	0.00	0.00	0.00
324	HD005023	2025-07-16 16:45:45.103	\N	1221	CHÚ PHƯỚC - TAM HOÀNG	1	900000.00	0.00	\N	completed	2025-07-30 00:54:57.846	2025-07-30 00:54:57.846	percentage	0.00	0.00	0.00
325	HD005022	2025-07-16 16:42:33.982	\N	963	CHỊ QUÝ - TÂN PHÚ	1	12840000.00	0.00	\N	completed	2025-07-30 00:54:57.846	2025-07-30 00:54:57.846	percentage	0.00	0.00	0.00
326	HD005021	2025-07-16 16:33:29.023	\N	1133	TRINH - HIPPRA	1	7350000.00	7350000.00	\N	completed	2025-07-30 00:54:57.846	2025-07-30 00:54:57.846	percentage	0.00	0.00	0.00
327	HD005020	2025-07-16 16:13:41.942	\N	1057	KHÁCH LẺ	1	440000.00	440000.00	\N	completed	2025-07-30 00:54:57.846	2025-07-30 00:54:57.846	percentage	0.00	0.00	0.00
328	HD005019	2025-07-16 15:22:37.62	TH000184	844	ANH PHONG - VĨNH TÂN	1	16685000.00	14595000.00	\N	completed	2025-07-30 00:54:57.846	2025-07-30 00:54:57.846	percentage	0.00	0.00	0.00
329	HD005017	2025-07-16 15:12:32.239	\N	880	ANH HẢI (KẾ)	1	1400000.00	1400000.00	\N	completed	2025-07-30 00:54:57.847	2025-07-30 00:54:57.847	percentage	0.00	0.00	0.00
330	HD005016	2025-07-16 09:47:13.379	\N	865	ANH HỌC (LONG)	1	11550000.00	0.00	\N	completed	2025-07-30 00:54:57.847	2025-07-30 00:54:57.847	percentage	0.00	0.00	0.00
331	HD005015	2025-07-16 09:32:00.53	\N	920	KHÁNH EMIVET	1	940000.00	0.00	\N	completed	2025-07-30 00:54:57.847	2025-07-30 00:54:57.847	percentage	0.00	0.00	0.00
332	HD005014	2025-07-16 09:28:56.227	\N	923	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	12920000.00	0.00	\N	completed	2025-07-30 00:54:57.847	2025-07-30 00:54:57.847	percentage	0.00	0.00	0.00
333	HD005013	2025-07-16 09:17:19.416	\N	962	CÔ TUYẾT THU (5K) - LÔ SONG HÀNH	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:57.848	2025-07-30 00:54:57.848	percentage	0.00	0.00	0.00
334	HD005012	2025-07-16 09:05:30.183	\N	1048	ANH TRIỆU - GIA KIỆM	1	3405000.00	0.00	\N	completed	2025-07-30 00:54:57.848	2025-07-30 00:54:57.848	percentage	0.00	0.00	0.00
336	HD005010	2025-07-16 08:54:09.206	\N	1134	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	2050000.00	0.00	\N	completed	2025-07-30 00:54:57.848	2025-07-30 00:54:57.848	percentage	0.00	0.00	0.00
337	HD005009	2025-07-16 08:48:59.46	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	820000.00	820000.00	\N	completed	2025-07-30 00:54:57.848	2025-07-30 00:54:57.848	percentage	0.00	0.00	0.00
338	HD005008	2025-07-16 07:42:03.106	\N	1057	KHÁCH LẺ	1	120000.00	120000.00	\N	completed	2025-07-30 00:54:57.848	2025-07-30 00:54:57.848	percentage	0.00	0.00	0.00
339	HD005007	2025-07-16 07:13:03.26	\N	1182	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	1960000.00	0.00	\N	completed	2025-07-30 00:54:57.848	2025-07-30 00:54:57.848	percentage	0.00	0.00	0.00
340	HD005006	2025-07-16 07:10:11.45	\N	1203	CHỊ LOAN ( ĐỊNH)	1	0.00	0.00	\N	completed	2025-07-30 00:54:57.848	2025-07-30 00:54:57.848	percentage	0.00	0.00	0.00
341	HD005005	2025-07-16 06:50:33.48	\N	1209	XUÂN - VỊT ( NHÀ)	1	750000.00	0.00	\N	completed	2025-07-30 00:54:57.849	2025-07-30 00:54:57.849	percentage	0.00	0.00	0.00
342	HD005004	2025-07-16 06:49:18.529	\N	1057	KHÁCH LẺ	1	50000.00	50000.00	\N	completed	2025-07-30 00:54:57.849	2025-07-30 00:54:57.849	percentage	0.00	0.00	0.00
343	HD005003	2025-07-16 06:41:39.686	\N	1023	CHỊ QUY - BÌNH DƯƠNG	1	1400000.00	0.00	\N	completed	2025-07-30 00:54:57.849	2025-07-30 00:54:57.849	percentage	0.00	0.00	0.00
344	HD005002	2025-07-16 06:40:00.797	\N	1122	TÚ GÀ TA	1	440000.00	0.00	\N	completed	2025-07-30 00:54:57.849	2025-07-30 00:54:57.849	percentage	0.00	0.00	0.00
345	HD005001	2025-07-16 06:35:27.47	\N	900	ANH TÂN - TÍN NGHĨA	1	2565000.00	0.00	\N	completed	2025-07-30 00:54:57.849	2025-07-30 00:54:57.849	percentage	0.00	0.00	0.00
346	HD005000	2025-07-16 06:30:56.813	\N	876	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	15720000.00	0.00	\N	completed	2025-07-30 00:54:57.849	2025-07-30 00:54:57.849	percentage	0.00	0.00	0.00
347	HD004999.01	2025-07-16 06:27:42.627	\N	856	TRUNG - BƯU ĐIỆN - LÔ 2	1	3200000.00	0.00	\N	completed	2025-07-30 00:54:57.85	2025-07-30 00:54:57.85	percentage	0.00	0.00	0.00
348	HD004998	2025-07-16 06:26:17.827	\N	1226	ANH LÂM (5k) - TRẠI 1	1	2340000.00	0.00	\N	completed	2025-07-30 00:54:57.85	2025-07-30 00:54:57.85	percentage	0.00	0.00	0.00
349	HD004997	2025-07-15 16:10:33.613	\N	1080	CÔNG ARIVIET	1	14928000.00	5629800.00	\N	completed	2025-07-30 00:54:57.85	2025-07-30 00:54:57.85	percentage	0.00	0.00	0.00
350	HD004996	2025-07-15 15:59:59.992	\N	881	CHÚ HUỲNH - XÃ LỘ 25	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:57.85	2025-07-30 00:54:57.85	percentage	0.00	0.00	0.00
351	HD004995.01	2025-07-15 15:24:15.38	\N	845	CHỊ VY - LÂM ĐỒNG	1	8515000.00	8515000.00	\N	completed	2025-07-30 00:54:58.097	2025-07-30 00:54:58.097	percentage	0.00	0.00	0.00
352	HD004994	2025-07-15 15:19:53.05	\N	1178	CHÚ CHƯƠNG - TAM HOÀNG	1	1650000.00	0.00	\N	completed	2025-07-30 00:54:58.098	2025-07-30 00:54:58.098	percentage	0.00	0.00	0.00
353	HD004993	2025-07-15 15:04:08.9	\N	1034	CHỊ DUNG - SOKLU	1	1450000.00	0.00	\N	completed	2025-07-30 00:54:58.098	2025-07-30 00:54:58.098	percentage	0.00	0.00	0.00
354	HD004992.01	2025-07-15 15:02:48.3	\N	1176	ANH SỸ -TAM HOÀNG	1	0.00	0.00	\N	completed	2025-07-30 00:54:58.098	2025-07-30 00:54:58.098	percentage	0.00	0.00	0.00
355	HD004991.01	2025-07-15 15:01:52.102	\N	1176	ANH SỸ -TAM HOÀNG	1	5200000.00	0.00	\N	completed	2025-07-30 00:54:58.099	2025-07-30 00:54:58.099	percentage	0.00	0.00	0.00
356	HD004990	2025-07-15 14:24:01.962	\N	1011	HẢI - TRẢNG BOM	1	2040000.00	2040000.00	\N	completed	2025-07-30 00:54:58.099	2025-07-30 00:54:58.099	percentage	0.00	0.00	0.00
358	HD004988	2025-07-15 11:42:05.406	\N	1052	TRẠI GÀ ĐẺ - LONG THÀNH	1	1900000.00	1900000.00	\N	completed	2025-07-30 00:54:58.099	2025-07-30 00:54:58.099	percentage	0.00	0.00	0.00
359	HD004987	2025-07-15 11:32:07.643	\N	1080	CÔNG ARIVIET	1	1360000.00	1360000.00	\N	completed	2025-07-30 00:54:58.099	2025-07-30 00:54:58.099	percentage	0.00	0.00	0.00
360	HD004986	2025-07-15 10:53:23.879	\N	1057	KHÁCH LẺ	1	120000.00	120000.00	\N	completed	2025-07-30 00:54:58.1	2025-07-30 00:54:58.1	percentage	0.00	0.00	0.00
361	HD004985	2025-07-15 10:37:30.922	\N	1135	TÂM UNITEK	1	3300000.00	3300000.00	\N	completed	2025-07-30 00:54:58.1	2025-07-30 00:54:58.1	percentage	0.00	0.00	0.00
362	HD004984	2025-07-15 10:19:31.067	\N	992	XUÂN ( THUÊ NGÁT)	1	3800000.00	0.00	\N	completed	2025-07-30 00:54:58.101	2025-07-30 00:54:58.101	percentage	0.00	0.00	0.00
363	HD004983.01	2025-07-15 09:55:51.219	\N	869	ANH HỌC - CTY TIẾN THẠNH	1	890000.00	0.00	\N	completed	2025-07-30 00:54:58.101	2025-07-30 00:54:58.101	percentage	0.00	0.00	0.00
364	HD004982	2025-07-15 09:03:55.962	\N	1080	CÔNG ARIVIET	1	6980000.00	6980000.00	\N	completed	2025-07-30 00:54:58.101	2025-07-30 00:54:58.101	percentage	0.00	0.00	0.00
365	HDD_TH000179	2025-07-15 08:55:13.427	\N	990	ANH HIẾU - DÊ	1	30000.00	0.00	\N	completed	2025-07-30 00:54:58.101	2025-07-30 00:54:58.101	percentage	0.00	0.00	0.00
366	HD004981	2025-07-15 08:48:55.916	\N	1161	CHÚ THÀNH - GÀ TRE	1	610000.00	610000.00	\N	completed	2025-07-30 00:54:58.101	2025-07-30 00:54:58.101	percentage	0.00	0.00	0.00
367	HD004980	2025-07-15 08:48:12.032	\N	990	ANH HIẾU - DÊ	1	1600000.00	1600000.00	\N	completed	2025-07-30 00:54:58.102	2025-07-30 00:54:58.102	percentage	0.00	0.00	0.00
368	HD004979	2025-07-15 07:43:03.837	\N	846	ANH KHÔI	1	7620000.00	0.00	\N	completed	2025-07-30 00:54:58.102	2025-07-30 00:54:58.102	percentage	0.00	0.00	0.00
369	HD004978	2025-07-15 07:35:50.012	\N	1043	HÀ HOÀNG	1	420000.00	0.00	\N	completed	2025-07-30 00:54:58.102	2025-07-30 00:54:58.102	percentage	0.00	0.00	0.00
370	HD004977.01	2025-07-15 07:33:24.977	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	3460000.00	0.00	\N	completed	2025-07-30 00:54:58.102	2025-07-30 00:54:58.102	percentage	0.00	0.00	0.00
371	HD004976	2025-07-15 07:31:24.913	\N	1190	CHỊ QUYÊN - VỊT	1	5000000.00	0.00	\N	completed	2025-07-30 00:54:58.102	2025-07-30 00:54:58.102	percentage	0.00	0.00	0.00
372	HD004975	2025-07-15 06:41:14.163	\N	1210	CHỊ HUYỀN - VÕ DÕNG	1	3600000.00	2220000.00	\N	completed	2025-07-30 00:54:58.102	2025-07-30 00:54:58.102	percentage	0.00	0.00	0.00
373	HD004974	2025-07-15 06:34:24.717	\N	957	CHỊ LOAN -BỐT ĐỎ	1	6180000.00	0.00	\N	completed	2025-07-30 00:54:58.103	2025-07-30 00:54:58.103	percentage	0.00	0.00	0.00
375	HD004972.01	2025-07-15 06:22:00.807	\N	876	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	2200000.00	0.00	\N	completed	2025-07-30 00:54:58.103	2025-07-30 00:54:58.103	percentage	0.00	0.00	0.00
376	HD004971	2025-07-15 06:17:59.096	\N	1182	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	2600000.00	0.00	\N	completed	2025-07-30 00:54:58.103	2025-07-30 00:54:58.103	percentage	0.00	0.00	0.00
377	HD004970	2025-07-14 17:05:16.193	\N	1057	KHÁCH LẺ	1	80000.00	80000.00	\N	completed	2025-07-30 00:54:58.103	2025-07-30 00:54:58.103	percentage	0.00	0.00	0.00
378	HD004969	2025-07-14 16:56:53.466	\N	1192	CÔ PHƯỢNG - BÌNH LỘC	1	2250000.00	0.00	\N	completed	2025-07-30 00:54:58.103	2025-07-30 00:54:58.103	percentage	0.00	0.00	0.00
379	HD004968	2025-07-14 16:36:22.123	\N	947	ANH LÂM (6K) - TRẠI 3	1	660000.00	0.00	\N	completed	2025-07-30 00:54:58.103	2025-07-30 00:54:58.103	percentage	0.00	0.00	0.00
380	HD004967	2025-07-14 16:35:28.189	\N	1226	ANH LÂM (5k) - TRẠI 1	1	4020000.00	0.00	\N	completed	2025-07-30 00:54:58.103	2025-07-30 00:54:58.103	percentage	0.00	0.00	0.00
382	HD004965	2025-07-14 16:11:38.583	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	500000.00	500000.00	\N	completed	2025-07-30 00:54:58.104	2025-07-30 00:54:58.104	percentage	0.00	0.00	0.00
383	HD004964	2025-07-14 16:01:36.262	\N	847	ANH NAM - CẦU QUÂN Y	1	5800000.00	5800000.00	\N	completed	2025-07-30 00:54:58.104	2025-07-30 00:54:58.104	percentage	0.00	0.00	0.00
384	HD004963	2025-07-14 15:58:13.403	\N	999	ANH HƯNG LÔ MỚI - MARTINO	1	500000.00	500000.00	\N	completed	2025-07-30 00:54:58.104	2025-07-30 00:54:58.104	percentage	0.00	0.00	0.00
385	HD004962	2025-07-14 15:56:34.012	TH000180	848	CHÚ HOÀ	1	1100000.00	0.00	\N	completed	2025-07-30 00:54:58.104	2025-07-30 00:54:58.104	percentage	0.00	0.00	0.00
386	HD004961	2025-07-14 15:54:42.71	\N	1080	CÔNG ARIVIET	1	2140000.00	2140000.00	\N	completed	2025-07-30 00:54:58.104	2025-07-30 00:54:58.104	percentage	0.00	0.00	0.00
387	HD004960	2025-07-14 15:10:03.663	\N	1057	KHÁCH LẺ	1	120000.00	120000.00	\N	completed	2025-07-30 00:54:58.104	2025-07-30 00:54:58.104	percentage	0.00	0.00	0.00
388	HD004959	2025-07-14 14:58:40.033	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	720000.00	720000.00	\N	completed	2025-07-30 00:54:58.104	2025-07-30 00:54:58.104	percentage	0.00	0.00	0.00
389	HD004957	2025-07-14 11:31:00.25	\N	849	ANH HẢI HÀO LÔ MỚI	1	2210000.00	2210000.00	\N	completed	2025-07-30 00:54:58.105	2025-07-30 00:54:58.105	percentage	0.00	0.00	0.00
390	HD004956	2025-07-14 11:29:15.54	\N	889	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	800000.00	800000.00	\N	completed	2025-07-30 00:54:58.105	2025-07-30 00:54:58.105	percentage	0.00	0.00	0.00
391	HD004955.02	2025-07-14 10:56:11.387	\N	850	ANH QUỐC - DẦU GIÂY	1	5600000.00	5600000.00	\N	completed	2025-07-30 00:54:58.105	2025-07-30 00:54:58.105	percentage	0.00	0.00	0.00
392	HD004954	2025-07-14 08:49:15.563	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	4105000.00	0.00	\N	completed	2025-07-30 00:54:58.105	2025-07-30 00:54:58.105	percentage	0.00	0.00	0.00
393	HD004953.01	2025-07-14 08:46:37.129	\N	1139	ĐẠI LÝ TIÊN PHÚC	1	4690000.00	4690000.00	\N	completed	2025-07-30 00:54:58.105	2025-07-30 00:54:58.105	percentage	0.00	0.00	0.00
395	HD004951	2025-07-14 07:37:25.687	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	720000.00	720000.00	\N	completed	2025-07-30 00:54:58.105	2025-07-30 00:54:58.105	percentage	0.00	0.00	0.00
396	HD004950	2025-07-14 07:28:47.05	\N	1057	KHÁCH LẺ	1	60000.00	60000.00	\N	completed	2025-07-30 00:54:58.105	2025-07-30 00:54:58.105	percentage	0.00	0.00	0.00
397	HD004949.01	2025-07-14 07:20:17.737	\N	878	ANH TÈO - VÔ NHIỄM	1	2250000.00	0.00	\N	completed	2025-07-30 00:54:58.106	2025-07-30 00:54:58.106	percentage	0.00	0.00	0.00
398	HD004948.01	2025-07-14 07:17:50.477	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	3250000.00	0.00	\N	completed	2025-07-30 00:54:58.106	2025-07-30 00:54:58.106	percentage	0.00	0.00	0.00
399	HD004947	2025-07-14 07:04:37.12	\N	1155	ANH PHONG - VỊT (NHÀ)	1	950000.00	0.00	\N	completed	2025-07-30 00:54:58.106	2025-07-30 00:54:58.106	percentage	0.00	0.00	0.00
400	HD004946	2025-07-14 06:47:39.122	TH000178	999	ANH HƯNG LÔ MỚI - MARTINO	1	1830000.00	930000.00	\N	completed	2025-07-30 00:54:58.106	2025-07-30 00:54:58.106	percentage	0.00	0.00	0.00
401	HD004945	2025-07-14 06:36:07.87	\N	1180	ANH HÙNG - BỘ - TAM HOÀNG	1	2010000.00	0.00	\N	completed	2025-07-30 00:54:58.423	2025-07-30 00:54:58.423	percentage	0.00	0.00	0.00
402	HD004944	2025-07-14 06:34:32.409	\N	1185	ANH LÂM (8K) - TRẠI 4	1	1000000.00	0.00	\N	completed	2025-07-30 00:54:58.424	2025-07-30 00:54:58.424	percentage	0.00	0.00	0.00
403	HD004943	2025-07-14 06:30:19.656	\N	905	ANH DUY - PHƯƠNG LÂM	1	2970000.00	0.00	\N	completed	2025-07-30 00:54:58.427	2025-07-30 00:54:58.427	percentage	0.00	0.00	0.00
404	HD004942.01	2025-07-14 06:22:51.687	\N	1046	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	520000.00	0.00	\N	completed	2025-07-30 00:54:58.428	2025-07-30 00:54:58.428	percentage	0.00	0.00	0.00
405	HD004941	2025-07-14 06:21:53.749	\N	918	TIẾN CHÍCH	1	840000.00	840000.00	\N	completed	2025-07-30 00:54:58.428	2025-07-30 00:54:58.428	percentage	0.00	0.00	0.00
406	HD004940	2025-07-14 06:19:16.867	\N	900	ANH TÂN - TÍN NGHĨA	1	2735000.00	0.00	\N	completed	2025-07-30 00:54:58.428	2025-07-30 00:54:58.428	percentage	0.00	0.00	0.00
407	HD004939	2025-07-13 16:44:23.857	\N	917	ANH VŨ CÁM ODON	1	2340000.00	2340000.00	\N	completed	2025-07-30 00:54:58.428	2025-07-30 00:54:58.428	percentage	0.00	0.00	0.00
409	HD004937	2025-07-13 16:42:19.157	\N	1057	KHÁCH LẺ	1	80000.00	80000.00	\N	completed	2025-07-30 00:54:58.429	2025-07-30 00:54:58.429	percentage	0.00	0.00	0.00
410	HD004936	2025-07-13 11:13:16.973	\N	992	XUÂN ( THUÊ NGÁT)	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:58.429	2025-07-30 00:54:58.429	percentage	0.00	0.00	0.00
411	HD004935	2025-07-13 09:23:14.66	TH000176	1043	HÀ HOÀNG	1	840000.00	0.00	\N	completed	2025-07-30 00:54:58.429	2025-07-30 00:54:58.429	percentage	0.00	0.00	0.00
412	HD004934	2025-07-13 09:22:09.873	\N	1182	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	900000.00	0.00	\N	completed	2025-07-30 00:54:58.429	2025-07-30 00:54:58.429	percentage	0.00	0.00	0.00
413	HD004933	2025-07-13 09:04:34.282	\N	1048	ANH TRIỆU - GIA KIỆM	1	160000.00	0.00	\N	completed	2025-07-30 00:54:58.429	2025-07-30 00:54:58.429	percentage	0.00	0.00	0.00
414	HD004932	2025-07-13 08:15:06.933	\N	1178	CHÚ CHƯƠNG - TAM HOÀNG	1	500000.00	0.00	\N	completed	2025-07-30 00:54:58.43	2025-07-30 00:54:58.43	percentage	0.00	0.00	0.00
415	HD004931	2025-07-13 07:15:51.829	\N	957	CHỊ LOAN -BỐT ĐỎ	1	2250000.00	0.00	\N	completed	2025-07-30 00:54:58.43	2025-07-30 00:54:58.43	percentage	0.00	0.00	0.00
416	HD004930	2025-07-13 07:14:26.833	\N	996	ANH PHONG - SUỐI ĐÁ 3	1	450000.00	0.00	\N	completed	2025-07-30 00:54:58.43	2025-07-30 00:54:58.43	percentage	0.00	0.00	0.00
417	HD004929	2025-07-13 07:13:07.85	\N	1058	ANH PHONG - SUỐI ĐÁ 1	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:58.43	2025-07-30 00:54:58.43	percentage	0.00	0.00	0.00
418	HD004928	2025-07-13 07:11:50.643	\N	1211	ANH PHONG - BÀU SẬY	1	2550000.00	2550000.00	\N	completed	2025-07-30 00:54:58.43	2025-07-30 00:54:58.43	percentage	0.00	0.00	0.00
419	HD004927	2025-07-13 07:10:15.346	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	5550000.00	0.00	\N	completed	2025-07-30 00:54:58.431	2025-07-30 00:54:58.431	percentage	0.00	0.00	0.00
420	HD004926	2025-07-13 07:07:08.687	\N	865	ANH HỌC (LONG)	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:58.431	2025-07-30 00:54:58.431	percentage	0.00	0.00	0.00
421	HD004924	2025-07-13 06:22:10.223	\N	1131	ĐẠI LÝ TUẤN PHÁT	1	6480000.00	6480000.00	\N	completed	2025-07-30 00:54:58.431	2025-07-30 00:54:58.431	percentage	0.00	0.00	0.00
422	HD004923	2025-07-12 16:19:48.107	\N	1122	TÚ GÀ TA	1	630000.00	0.00	\N	completed	2025-07-30 00:54:58.431	2025-07-30 00:54:58.431	percentage	0.00	0.00	0.00
424	HD004921	2025-07-12 15:43:38.747	\N	1135	TÂM UNITEK	1	1080000.00	1080000.00	\N	completed	2025-07-30 00:54:58.432	2025-07-30 00:54:58.432	percentage	0.00	0.00	0.00
425	HD004920	2025-07-12 15:30:40.57	\N	879	MI TIGERVET	1	4500000.00	4500000.00	\N	completed	2025-07-30 00:54:58.432	2025-07-30 00:54:58.432	percentage	0.00	0.00	0.00
426	HD004919	2025-07-12 15:29:03.462	\N	852	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	2550000.00	0.00	\N	completed	2025-07-30 00:54:58.432	2025-07-30 00:54:58.432	percentage	0.00	0.00	0.00
427	HD004918	2025-07-12 15:08:37.406	\N	1026	HUYỀN TIGERVET	1	450000.00	0.00	\N	completed	2025-07-30 00:54:58.432	2025-07-30 00:54:58.432	percentage	0.00	0.00	0.00
428	HD004917	2025-07-12 14:51:46.652	\N	1203	CHỊ LOAN ( ĐỊNH)	1	5800000.00	1600000.00	\N	completed	2025-07-30 00:54:58.432	2025-07-30 00:54:58.432	percentage	0.00	0.00	0.00
429	HD004916	2025-07-12 14:15:16.569	\N	906	ANH CHÍNH - VÔ NHIỄM	1	3200000.00	0.00	\N	completed	2025-07-30 00:54:58.432	2025-07-30 00:54:58.432	percentage	0.00	0.00	0.00
430	HD004915	2025-07-12 11:03:39.067	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	2970000.00	0.00	\N	completed	2025-07-30 00:54:58.432	2025-07-30 00:54:58.432	percentage	0.00	0.00	0.00
431	HD004914	2025-07-12 10:54:27.962	\N	934	CÔ THẢO - GÀ ĐẺ  - ĐỨC HUY 12K	1	19000000.00	0.00	\N	completed	2025-07-30 00:54:58.433	2025-07-30 00:54:58.433	percentage	0.00	0.00	0.00
432	HD004913	2025-07-12 10:48:20.056	TH000177	1026	HUYỀN TIGERVET	1	11000000.00	0.00	\N	completed	2025-07-30 00:54:58.433	2025-07-30 00:54:58.433	percentage	0.00	0.00	0.00
433	HD004912	2025-07-12 09:21:14.59	\N	1057	KHÁCH LẺ	1	20000.00	20000.00	\N	completed	2025-07-30 00:54:58.433	2025-07-30 00:54:58.433	percentage	0.00	0.00	0.00
434	HD004911.01	2025-07-12 09:01:38.02	\N	1211	ANH PHONG - BÀU SẬY	1	6980000.00	6980000.00	\N	completed	2025-07-30 00:54:58.433	2025-07-30 00:54:58.433	percentage	0.00	0.00	0.00
435	HD004910.01	2025-07-12 08:57:10.75	\N	1136	ANH GIA CHÍCH	1	200000.00	200000.00	\N	completed	2025-07-30 00:54:58.433	2025-07-30 00:54:58.433	percentage	0.00	0.00	0.00
436	HD004909	2025-07-12 08:52:40.707	\N	967	ANH ĐỨC - VÔ NHIỄM	1	450000.00	450000.00	\N	completed	2025-07-30 00:54:58.433	2025-07-30 00:54:58.433	percentage	0.00	0.00	0.00
437	HD004908	2025-07-12 08:15:38.959	\N	883	ANH HẢI CJ	1	600000.00	600000.00	\N	completed	2025-07-30 00:54:58.434	2025-07-30 00:54:58.434	percentage	0.00	0.00	0.00
438	HD004907	2025-07-12 08:06:13.037	\N	894	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	1470000.00	0.00	\N	completed	2025-07-30 00:54:58.434	2025-07-30 00:54:58.434	percentage	0.00	0.00	0.00
439	HD004906	2025-07-12 07:46:07.297	\N	853	ANH ÂN - PHÚ TÚC	1	220000.00	0.00	\N	completed	2025-07-30 00:54:58.434	2025-07-30 00:54:58.434	percentage	0.00	0.00	0.00
440	HD004905	2025-07-12 07:44:39.603	\N	861	CHÚ PHÁT - DỐC MƠ	1	1050000.00	0.00	\N	completed	2025-07-30 00:54:58.435	2025-07-30 00:54:58.435	percentage	0.00	0.00	0.00
441	HD004904	2025-07-12 07:24:22.262	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	500000.00	500000.00	\N	completed	2025-07-30 00:54:58.435	2025-07-30 00:54:58.435	percentage	0.00	0.00	0.00
442	HD004903	2025-07-12 07:16:45.353	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	1350000.00	0.00	\N	completed	2025-07-30 00:54:58.435	2025-07-30 00:54:58.435	percentage	0.00	0.00	0.00
443	HD004902	2025-07-12 07:05:19.133	\N	854	ANH TỨ	1	470000.00	470000.00	\N	completed	2025-07-30 00:54:58.435	2025-07-30 00:54:58.435	percentage	0.00	0.00	0.00
657	HD004686	2025-07-03 17:21:08.197	\N	1174	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	1	1920000.00	0.00	\N	completed	2025-07-30 00:54:59.716	2025-07-30 00:54:59.716	percentage	0.00	0.00	0.00
445	HD004900	2025-07-12 06:26:07.356	\N	1115	CÔ TUYẾT THU - PHÚ CƯỜNG 11K	1	7150000.00	0.00	\N	completed	2025-07-30 00:54:58.435	2025-07-30 00:54:58.435	percentage	0.00	0.00	0.00
447	HD004897	2025-07-11 17:05:49.686	\N	1057	KHÁCH LẺ	1	90000.00	90000.00	\N	completed	2025-07-30 00:54:58.436	2025-07-30 00:54:58.436	percentage	0.00	0.00	0.00
448	HD004896	2025-07-11 16:13:07.417	\N	856	TRUNG - BƯU ĐIỆN - LÔ 2	1	950000.00	0.00	\N	completed	2025-07-30 00:54:58.436	2025-07-30 00:54:58.436	percentage	0.00	0.00	0.00
449	HD004895.01	2025-07-11 15:35:04.61	\N	1117	ANH HƯNG - GÀ - SUỐI ĐÁ	1	3060000.00	0.00	\N	completed	2025-07-30 00:54:58.436	2025-07-30 00:54:58.436	percentage	0.00	0.00	0.00
450	HD004894	2025-07-11 15:33:16.833	\N	885	ANH THỨC - TAM HOÀNG	1	4200000.00	0.00	\N	completed	2025-07-30 00:54:58.436	2025-07-30 00:54:58.436	percentage	0.00	0.00	0.00
451	HD004893	2025-07-11 15:05:37.217	\N	1026	HUYỀN TIGERVET	1	0.00	0.00	\N	completed	2025-07-30 00:54:58.673	2025-07-30 00:54:58.673	percentage	0.00	0.00	0.00
452	HD004892	2025-07-11 15:05:12.186	\N	1026	HUYỀN TIGERVET	1	6400000.00	0.00	\N	completed	2025-07-30 00:54:58.673	2025-07-30 00:54:58.673	percentage	0.00	0.00	0.00
453	HD004891	2025-07-11 14:36:11.843	\N	1026	HUYỀN TIGERVET	1	8915000.00	0.00	\N	completed	2025-07-30 00:54:58.674	2025-07-30 00:54:58.674	percentage	0.00	0.00	0.00
454	HD004890	2025-07-11 14:18:01.92	\N	1210	CHỊ HUYỀN - VÕ DÕNG	1	2740000.00	2740000.00	\N	completed	2025-07-30 00:54:58.674	2025-07-30 00:54:58.674	percentage	0.00	0.00	0.00
455	HD004889	2025-07-11 11:07:02.217	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	1400000.00	30000.00	\N	completed	2025-07-30 00:54:58.674	2025-07-30 00:54:58.674	percentage	0.00	0.00	0.00
456	HD004888	2025-07-11 11:01:11.162	\N	954	KHẢI HAIDER - BÀU CẠN LÔ 20k	1	10600000.00	0.00	\N	completed	2025-07-30 00:54:58.674	2025-07-30 00:54:58.674	percentage	0.00	0.00	0.00
457	HD004887	2025-07-11 10:56:35.83	\N	1212	KHẢI 8.500 CON - XUYÊN MỘC	1	3680000.00	0.00	\N	completed	2025-07-30 00:54:58.674	2025-07-30 00:54:58.674	percentage	0.00	0.00	0.00
458	HD004886	2025-07-11 09:20:11.763	\N	1159	EM SƠN - ECOVET	1	7650000.00	0.00	\N	completed	2025-07-30 00:54:58.675	2025-07-30 00:54:58.675	percentage	0.00	0.00	0.00
459	HD004885	2025-07-11 08:55:26.019	\N	1057	KHÁCH LẺ	1	70000.00	70000.00	\N	completed	2025-07-30 00:54:58.675	2025-07-30 00:54:58.675	percentage	0.00	0.00	0.00
460	HD004884	2025-07-11 08:36:31.889	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	7100000.00	7100000.00	\N	completed	2025-07-30 00:54:58.675	2025-07-30 00:54:58.675	percentage	0.00	0.00	0.00
461	HD004883	2025-07-11 07:49:10.272	\N	885	ANH THỨC - TAM HOÀNG	1	4300000.00	0.00	\N	completed	2025-07-30 00:54:58.675	2025-07-30 00:54:58.675	percentage	0.00	0.00	0.00
462	HD004882	2025-07-11 06:47:02.413	\N	1176	ANH SỸ -TAM HOÀNG	1	2360000.00	0.00	\N	completed	2025-07-30 00:54:58.675	2025-07-30 00:54:58.675	percentage	0.00	0.00	0.00
463	HD004881	2025-07-11 06:33:04.05	\N	885	ANH THỨC - TAM HOÀNG	1	1560000.00	0.00	\N	completed	2025-07-30 00:54:58.675	2025-07-30 00:54:58.675	percentage	0.00	0.00	0.00
464	HD004880	2025-07-11 06:28:21.497	\N	1178	CHÚ CHƯƠNG - TAM HOÀNG	1	220000.00	0.00	\N	completed	2025-07-30 00:54:58.675	2025-07-30 00:54:58.675	percentage	0.00	0.00	0.00
465	HD004879	2025-07-11 06:26:28.53	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	910000.00	910000.00	\N	completed	2025-07-30 00:54:58.676	2025-07-30 00:54:58.676	percentage	0.00	0.00	0.00
466	HD004878	2025-07-11 06:24:21.983	\N	1134	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	3900000.00	0.00	\N	completed	2025-07-30 00:54:58.676	2025-07-30 00:54:58.676	percentage	0.00	0.00	0.00
468	HD004876	2025-07-11 06:20:52.363	\N	1023	CHỊ QUY - BÌNH DƯƠNG	1	5900000.00	0.00	\N	completed	2025-07-30 00:54:58.676	2025-07-30 00:54:58.676	percentage	0.00	0.00	0.00
469	HD004875	2025-07-10 17:50:07.573	\N	1215	ANH TÂM ( ANH CÔNG)	1	6300000.00	0.00	\N	completed	2025-07-30 00:54:58.676	2025-07-30 00:54:58.676	percentage	0.00	0.00	0.00
470	HD004874	2025-07-10 17:49:04.44	\N	1135	TÂM UNITEK	1	12300000.00	12300000.00	\N	completed	2025-07-30 00:54:58.676	2025-07-30 00:54:58.676	percentage	0.00	0.00	0.00
471	HD004873	2025-07-10 17:26:44.489	\N	1062	CHỊ HƯƠNG-THÀNH AN	1	1740000.00	1225000.00	\N	completed	2025-07-30 00:54:58.676	2025-07-30 00:54:58.676	percentage	0.00	0.00	0.00
472	HD004872	2025-07-10 16:58:49.219	\N	1057	KHÁCH LẺ	1	30000.00	30000.00	\N	completed	2025-07-30 00:54:58.677	2025-07-30 00:54:58.677	percentage	0.00	0.00	0.00
473	HD004871	2025-07-10 16:51:32.23	\N	1210	CHỊ HUYỀN - VÕ DÕNG	1	500000.00	500000.00	\N	completed	2025-07-30 00:54:58.677	2025-07-30 00:54:58.677	percentage	0.00	0.00	0.00
474	HD004870.02	2025-07-10 16:50:30.107	\N	889	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	580000.00	580000.00	\N	completed	2025-07-30 00:54:58.677	2025-07-30 00:54:58.677	percentage	0.00	0.00	0.00
475	HD004869	2025-07-10 16:29:23.31	\N	864	ANH TÀI - MARTINO (BÀ NGOẠI)	1	690000.00	0.00	\N	completed	2025-07-30 00:54:58.677	2025-07-30 00:54:58.677	percentage	0.00	0.00	0.00
476	HD004868.02	2025-07-10 16:19:08.357	\N	1113	ANH TÀI - GÀ TA - MARTINO	1	690000.00	0.00	\N	completed	2025-07-30 00:54:58.677	2025-07-30 00:54:58.677	percentage	0.00	0.00	0.00
477	HD004867	2025-07-10 16:10:48.239	\N	1215	ANH TÂM ( ANH CÔNG)	1	1650000.00	0.00	\N	completed	2025-07-30 00:54:58.677	2025-07-30 00:54:58.677	percentage	0.00	0.00	0.00
478	HD004866	2025-07-10 15:40:13.07	\N	1171	CHÚ ĐÔNG - TAM HOÀNG	1	4400000.00	0.00	\N	completed	2025-07-30 00:54:58.677	2025-07-30 00:54:58.677	percentage	0.00	0.00	0.00
479	HD004865	2025-07-10 15:32:41.649	\N	1176	ANH SỸ -TAM HOÀNG	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:58.678	2025-07-30 00:54:58.678	percentage	0.00	0.00	0.00
480	HD004864	2025-07-10 15:31:10.24	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	740000.00	740000.00	\N	completed	2025-07-30 00:54:58.678	2025-07-30 00:54:58.678	percentage	0.00	0.00	0.00
481	HD004863	2025-07-10 14:49:00.01	\N	1057	KHÁCH LẺ	1	100000.00	100000.00	\N	completed	2025-07-30 00:54:58.678	2025-07-30 00:54:58.678	percentage	0.00	0.00	0.00
482	HD004862	2025-07-10 14:41:55.54	\N	1192	CÔ PHƯỢNG - BÌNH LỘC	1	2100000.00	0.00	\N	completed	2025-07-30 00:54:58.678	2025-07-30 00:54:58.678	percentage	0.00	0.00	0.00
483	HD004861	2025-07-10 14:39:56.156	\N	1080	CÔNG ARIVIET	1	2100000.00	2100000.00	\N	completed	2025-07-30 00:54:58.679	2025-07-30 00:54:58.679	percentage	0.00	0.00	0.00
484	HD004860	2025-07-10 14:26:40.53	\N	1209	XUÂN - VỊT ( NHÀ)	1	1140000.00	0.00	\N	completed	2025-07-30 00:54:58.679	2025-07-30 00:54:58.679	percentage	0.00	0.00	0.00
485	HD004859	2025-07-10 14:25:03.247	\N	1221	CHÚ PHƯỚC - TAM HOÀNG	1	4500000.00	0.00	\N	completed	2025-07-30 00:54:58.679	2025-07-30 00:54:58.679	percentage	0.00	0.00	0.00
486	HD004858	2025-07-10 14:22:24.63	\N	1177	ANH SƠN ( BỘ) - TAM HOÀNG	1	3674000.00	0.00	\N	completed	2025-07-30 00:54:58.679	2025-07-30 00:54:58.679	percentage	0.00	0.00	0.00
487	HD004857	2025-07-10 14:19:57.126	TH000174	1139	ĐẠI LÝ TIÊN PHÚC	1	3400000.00	0.00	\N	completed	2025-07-30 00:54:58.683	2025-07-30 00:54:58.683	percentage	0.00	0.00	0.00
489	HD004855	2025-07-10 11:01:23.612	\N	868	QUYỀN - TAM HOÀNG LÔ MỚI	1	30000.00	0.00	\N	completed	2025-07-30 00:54:58.684	2025-07-30 00:54:58.684	percentage	0.00	0.00	0.00
490	HD004854	2025-07-10 10:09:48.557	\N	1205	TUYẾN DONAVET	1	230000.00	230000.00	\N	completed	2025-07-30 00:54:58.684	2025-07-30 00:54:58.684	percentage	0.00	0.00	0.00
491	HD004853	2025-07-10 08:02:04.847	\N	875	NHUNG VIETVET	1	1586000.00	0.00	\N	completed	2025-07-30 00:54:58.684	2025-07-30 00:54:58.684	percentage	0.00	0.00	0.00
492	HD004852	2025-07-10 07:12:06.106	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	7160000.00	0.00	\N	completed	2025-07-30 00:54:58.685	2025-07-30 00:54:58.685	percentage	0.00	0.00	0.00
493	HD004851	2025-07-10 06:43:32.18	\N	1057	KHÁCH LẺ	1	10000.00	10000.00	\N	completed	2025-07-30 00:54:58.685	2025-07-30 00:54:58.685	percentage	0.00	0.00	0.00
494	HD004850.01	2025-07-10 06:41:00.529	TH000173	1180	ANH HÙNG - BỘ - TAM HOÀNG	1	6925000.00	0.00	\N	completed	2025-07-30 00:54:58.685	2025-07-30 00:54:58.685	percentage	0.00	0.00	0.00
495	HD004849.01	2025-07-10 06:38:44.396	\N	856	TRUNG - BƯU ĐIỆN - LÔ 2	1	2520000.00	0.00	\N	completed	2025-07-30 00:54:58.685	2025-07-30 00:54:58.685	percentage	0.00	0.00	0.00
496	HD004848.01	2025-07-10 06:33:18.116	TH000182	1080	CÔNG ARIVIET	1	5380000.00	3960000.00	\N	completed	2025-07-30 00:54:58.685	2025-07-30 00:54:58.685	percentage	0.00	0.00	0.00
497	HD004847	2025-07-10 06:29:59.62	\N	1032	ANH LÂM (5K) - TRẠI 2	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:58.686	2025-07-30 00:54:58.686	percentage	0.00	0.00	0.00
498	HD004846.01	2025-07-10 06:26:40.1	\N	868	QUYỀN - TAM HOÀNG LÔ MỚI	1	4800000.00	0.00	\N	completed	2025-07-30 00:54:58.686	2025-07-30 00:54:58.686	percentage	0.00	0.00	0.00
499	HD004845	2025-07-09 17:22:00.32	\N	1226	ANH LÂM (5k) - TRẠI 1	1	7100000.00	0.00	\N	completed	2025-07-30 00:54:58.686	2025-07-30 00:54:58.686	percentage	0.00	0.00	0.00
500	HD004844	2025-07-09 17:17:57.17	\N	1032	ANH LÂM (5K) - TRẠI 2	1	1450000.00	0.00	\N	completed	2025-07-30 00:54:58.686	2025-07-30 00:54:58.686	percentage	0.00	0.00	0.00
501	HD004843.01	2025-07-09 16:35:06.456	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	1250000.00	1250000.00	\N	completed	2025-07-30 00:54:58.991	2025-07-30 00:54:58.991	percentage	0.00	0.00	0.00
502	HD004842.01	2025-07-09 16:27:39.887	\N	1026	HUYỀN TIGERVET	1	1600000.00	0.00	\N	completed	2025-07-30 00:54:58.991	2025-07-30 00:54:58.991	percentage	0.00	0.00	0.00
504	HD004840	2025-07-09 15:31:48.497	\N	869	ANH HỌC - CTY TIẾN THẠNH	1	2580000.00	0.00	\N	completed	2025-07-30 00:54:58.991	2025-07-30 00:54:58.991	percentage	0.00	0.00	0.00
505	HD004839	2025-07-09 15:29:54.926	\N	1009	ANH TRƯỜNG - CẦU CƯỜNG	1	490000.00	490000.00	\N	completed	2025-07-30 00:54:58.992	2025-07-30 00:54:58.992	percentage	0.00	0.00	0.00
506	HD004838	2025-07-09 15:28:30.809	\N	1190	CHỊ QUYÊN - VỊT	1	5550000.00	0.00	\N	completed	2025-07-30 00:54:58.992	2025-07-30 00:54:58.992	percentage	0.00	0.00	0.00
557	HD004787	2025-07-08 07:29:22.12	\N	860	ANH TUÝ (KIM PHÁT)	1	1560000.00	0.00	\N	completed	2025-07-30 00:54:59.231	2025-07-30 00:54:59.231	percentage	0.00	0.00	0.00
558	HD004786	2025-07-08 07:03:03.127	\N	1057	KHÁCH LẺ	1	440000.00	440000.00	\N	completed	2025-07-30 00:54:59.231	2025-07-30 00:54:59.231	percentage	0.00	0.00	0.00
559	HD004785	2025-07-08 06:47:07.363	\N	1203	CHỊ LOAN ( ĐỊNH)	1	2200000.00	2200000.00	\N	completed	2025-07-30 00:54:59.232	2025-07-30 00:54:59.232	percentage	0.00	0.00	0.00
560	HD004784	2025-07-08 06:44:39.33	\N	861	CHÚ PHÁT - DỐC MƠ	1	570000.00	0.00	\N	completed	2025-07-30 00:54:59.232	2025-07-30 00:54:59.232	percentage	0.00	0.00	0.00
561	HD004783	2025-07-08 06:38:11.207	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	1160000.00	1160000.00	\N	completed	2025-07-30 00:54:59.232	2025-07-30 00:54:59.232	percentage	0.00	0.00	0.00
562	HD004782.01	2025-07-08 06:29:25.86	\N	1220	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	2850000.00	2707500.00	\N	completed	2025-07-30 00:54:59.232	2025-07-30 00:54:59.232	percentage	0.00	0.00	0.00
563	HD004781	2025-07-08 06:25:17.173	\N	1131	ĐẠI LÝ TUẤN PHÁT	1	2750000.00	2750000.00	\N	completed	2025-07-30 00:54:59.232	2025-07-30 00:54:59.232	percentage	0.00	0.00	0.00
564	HD004780	2025-07-08 06:22:48.577	\N	1046	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	2200000.00	0.00	\N	completed	2025-07-30 00:54:59.232	2025-07-30 00:54:59.232	percentage	0.00	0.00	0.00
565	HD004779.01	2025-07-07 18:58:33.49	\N	862	HOÀ MEGA	1	1000000.00	0.00	\N	completed	2025-07-30 00:54:59.232	2025-07-30 00:54:59.232	percentage	0.00	0.00	0.00
566	HD004778	2025-07-07 16:48:13.197	TH000171, TH000181, TH000183	862	HOÀ MEGA	1	17600000.00	1000000.00	\N	completed	2025-07-30 00:54:59.232	2025-07-30 00:54:59.232	percentage	0.00	0.00	0.00
567	HD004777	2025-07-07 16:46:48.097	\N	1135	TÂM UNITEK	1	1530000.00	1530000.00	\N	completed	2025-07-30 00:54:59.233	2025-07-30 00:54:59.233	percentage	0.00	0.00	0.00
568	HD004776	2025-07-07 14:41:04.81	TH000168	1174	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	1	7390000.00	0.00	\N	completed	2025-07-30 00:54:59.233	2025-07-30 00:54:59.233	percentage	0.00	0.00	0.00
569	HD004775	2025-07-07 14:38:34.606	\N	880	ANH HẢI (KẾ)	1	1350000.00	1350000.00	\N	completed	2025-07-30 00:54:59.233	2025-07-30 00:54:59.233	percentage	0.00	0.00	0.00
516	HD004828	2025-07-09 09:41:34.719	\N	1228	Khách lẻ	1	1000000.00	1000000.00	\N	completed	2025-07-30 00:54:58.993	2025-07-30 00:54:58.993	percentage	0.00	0.00	0.00
508	HD004836	2025-07-09 15:24:00.929	\N	910	ANH HÀO	1	540000.00	540000.00	\N	completed	2025-07-30 00:54:58.992	2025-07-30 00:54:58.992	percentage	0.00	0.00	0.00
509	HD004835.01	2025-07-09 15:21:55.16	\N	1135	TÂM UNITEK	1	32900000.00	32900000.00	\N	completed	2025-07-30 00:54:58.992	2025-07-30 00:54:58.992	percentage	0.00	0.00	0.00
510	HD004834.01	2025-07-09 14:34:54.8	\N	988	LONG - BIÊN HOÀ 2	1	28200000.00	28200000.00	\N	completed	2025-07-30 00:54:58.993	2025-07-30 00:54:58.993	percentage	0.00	0.00	0.00
511	HD004833	2025-07-09 11:26:21.822	\N	1200	CÔ BÌNH - AN LỘC	1	6450000.00	0.00	\N	completed	2025-07-30 00:54:58.993	2025-07-30 00:54:58.993	percentage	0.00	0.00	0.00
512	HD004832	2025-07-09 10:36:02.81	\N	875	NHUNG VIETVET	1	16200000.00	0.00	\N	completed	2025-07-30 00:54:58.993	2025-07-30 00:54:58.993	percentage	0.00	0.00	0.00
513	HD004831	2025-07-09 10:07:54.96	\N	947	ANH LÂM (6K) - TRẠI 3	1	1300000.00	0.00	\N	completed	2025-07-30 00:54:58.993	2025-07-30 00:54:58.993	percentage	0.00	0.00	0.00
514	HD004830	2025-07-09 10:06:35.09	\N	1185	ANH LÂM (8K) - TRẠI 4	1	2400000.00	0.00	\N	completed	2025-07-30 00:54:58.993	2025-07-30 00:54:58.993	percentage	0.00	0.00	0.00
515	HD004829	2025-07-09 09:43:44.037	\N	1195	ANH PHONG - SUỐI ĐÁ 2	1	4820000.00	0.00	\N	completed	2025-07-30 00:54:58.993	2025-07-30 00:54:58.993	percentage	0.00	0.00	0.00
517	HD004827	2025-07-09 09:02:13.74	\N	1080	CÔNG ARIVIET	1	2780000.00	2780000.00	\N	completed	2025-07-30 00:54:58.993	2025-07-30 00:54:58.993	percentage	0.00	0.00	0.00
518	HD004826	2025-07-09 08:58:21.959	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	5750000.00	0.00	\N	completed	2025-07-30 00:54:58.994	2025-07-30 00:54:58.994	percentage	0.00	0.00	0.00
519	HD004825	2025-07-09 08:52:53.217	\N	1190	CHỊ QUYÊN - VỊT	1	1000000.00	0.00	\N	completed	2025-07-30 00:54:58.994	2025-07-30 00:54:58.994	percentage	0.00	0.00	0.00
520	HD004824	2025-07-09 08:42:33.762	\N	1135	TÂM UNITEK	1	4150000.00	4150000.00	\N	completed	2025-07-30 00:54:58.994	2025-07-30 00:54:58.994	percentage	0.00	0.00	0.00
522	HD004822	2025-07-09 08:16:41.983	\N	906	ANH CHÍNH - VÔ NHIỄM	1	2620000.00	0.00	\N	completed	2025-07-30 00:54:58.994	2025-07-30 00:54:58.994	percentage	0.00	0.00	0.00
523	HD004821	2025-07-09 07:36:33.13	\N	1215	ANH TÂM ( ANH CÔNG)	1	1650000.00	0.00	\N	completed	2025-07-30 00:54:58.994	2025-07-30 00:54:58.994	percentage	0.00	0.00	0.00
524	HD004820	2025-07-09 07:35:00.243	\N	996	ANH PHONG - SUỐI ĐÁ 3	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:58.994	2025-07-30 00:54:58.994	percentage	0.00	0.00	0.00
525	HD004819	2025-07-09 07:33:46.687	\N	1058	ANH PHONG - SUỐI ĐÁ 1	1	3600000.00	0.00	\N	completed	2025-07-30 00:54:58.994	2025-07-30 00:54:58.994	percentage	0.00	0.00	0.00
526	HD004818	2025-07-09 07:28:26.84	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	880000.00	880000.00	\N	completed	2025-07-30 00:54:58.995	2025-07-30 00:54:58.995	percentage	0.00	0.00	0.00
527	HD004817	2025-07-09 06:46:30.467	\N	1032	ANH LÂM (5K) - TRẠI 2	1	1600000.00	0.00	\N	completed	2025-07-30 00:54:58.995	2025-07-30 00:54:58.995	percentage	0.00	0.00	0.00
528	HD004816	2025-07-09 06:40:35.96	\N	1136	ANH GIA CHÍCH	1	220000.00	220000.00	\N	completed	2025-07-30 00:54:58.995	2025-07-30 00:54:58.995	percentage	0.00	0.00	0.00
529	HD004815	2025-07-09 06:35:06.639	\N	1215	ANH TÂM ( ANH CÔNG)	1	5510000.00	0.00	\N	completed	2025-07-30 00:54:58.995	2025-07-30 00:54:58.995	percentage	0.00	0.00	0.00
530	HD004814	2025-07-09 06:33:31.657	\N	1182	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	560000.00	0.00	\N	completed	2025-07-30 00:54:58.995	2025-07-30 00:54:58.995	percentage	0.00	0.00	0.00
531	HD004813	2025-07-09 06:31:58.883	\N	868	QUYỀN - TAM HOÀNG LÔ MỚI	1	18660000.00	0.00	\N	completed	2025-07-30 00:54:58.995	2025-07-30 00:54:58.995	percentage	0.00	0.00	0.00
532	HD004812	2025-07-09 06:26:31.559	\N	1184	CÔ CHƯNG - TAM HOÀNG - NAGOA	1	6000000.00	0.00	\N	completed	2025-07-30 00:54:58.995	2025-07-30 00:54:58.995	percentage	0.00	0.00	0.00
533	HD004811.01	2025-07-09 06:24:52.8	\N	858	ANH RÒN - DỐC MƠ	1	1560000.00	0.00	\N	completed	2025-07-30 00:54:58.996	2025-07-30 00:54:58.996	percentage	0.00	0.00	0.00
534	HD004810.01	2025-07-09 06:19:41.336	\N	876	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	2300000.00	0.00	\N	completed	2025-07-30 00:54:58.996	2025-07-30 00:54:58.996	percentage	0.00	0.00	0.00
536	HD004808	2025-07-08 15:21:30.202	\N	878	ANH TÈO - VÔ NHIỄM	1	7210000.00	0.00	\N	completed	2025-07-30 00:54:58.996	2025-07-30 00:54:58.996	percentage	0.00	0.00	0.00
537	HD004807	2025-07-08 15:10:49.853	\N	1057	KHÁCH LẺ	1	500000.00	500000.00	\N	completed	2025-07-30 00:54:58.996	2025-07-30 00:54:58.996	percentage	0.00	0.00	0.00
538	HD004806	2025-07-08 15:00:46.266	\N	934	CÔ THẢO - GÀ ĐẺ  - ĐỨC HUY 12K	1	2640000.00	0.00	\N	completed	2025-07-30 00:54:58.996	2025-07-30 00:54:58.996	percentage	0.00	0.00	0.00
539	HD004805	2025-07-08 14:36:17.692	\N	876	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	5250000.00	0.00	\N	completed	2025-07-30 00:54:58.996	2025-07-30 00:54:58.996	percentage	0.00	0.00	0.00
540	HD004804	2025-07-08 14:31:09.877	\N	859	ANH QUẢNG - LONG THÀNH	1	1260000.00	1260000.00	\N	completed	2025-07-30 00:54:58.996	2025-07-30 00:54:58.996	percentage	0.00	0.00	0.00
541	HD004803	2025-07-08 11:26:05.207	\N	1211	ANH PHONG - BÀU SẬY	1	7800000.00	7800000.00	\N	completed	2025-07-30 00:54:58.997	2025-07-30 00:54:58.997	percentage	0.00	0.00	0.00
542	HD004802	2025-07-08 11:02:54.403	\N	875	NHUNG VIETVET	1	3720000.00	0.00	\N	completed	2025-07-30 00:54:58.997	2025-07-30 00:54:58.997	percentage	0.00	0.00	0.00
543	HD004801.01	2025-07-08 10:37:28.26	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	550000.00	550000.00	\N	completed	2025-07-30 00:54:58.997	2025-07-30 00:54:58.997	percentage	0.00	0.00	0.00
544	HD004800.01	2025-07-08 10:36:07.269	\N	1215	ANH TÂM ( ANH CÔNG)	1	550000.00	0.00	\N	completed	2025-07-30 00:54:58.997	2025-07-30 00:54:58.997	percentage	0.00	0.00	0.00
545	HD004799	2025-07-08 10:32:36.037	\N	1139	ĐẠI LÝ TIÊN PHÚC	1	3000000.00	3000000.00	\N	completed	2025-07-30 00:54:58.997	2025-07-30 00:54:58.997	percentage	0.00	0.00	0.00
546	HD004798	2025-07-08 10:21:46.162	\N	1185	ANH LÂM (8K) - TRẠI 4	1	1840000.00	0.00	\N	completed	2025-07-30 00:54:58.997	2025-07-30 00:54:58.997	percentage	0.00	0.00	0.00
547	HD004797.01	2025-07-08 09:53:41.403	\N	1048	ANH TRIỆU - GIA KIỆM	1	2776000.00	0.00	\N	completed	2025-07-30 00:54:58.997	2025-07-30 00:54:58.997	percentage	0.00	0.00	0.00
548	HD004796	2025-07-08 09:37:24.556	\N	883	ANH HẢI CJ	1	480000.00	480000.00	\N	completed	2025-07-30 00:54:58.997	2025-07-30 00:54:58.997	percentage	0.00	0.00	0.00
549	HD004795	2025-07-08 08:28:59.296	\N	885	ANH THỨC - TAM HOÀNG	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:58.998	2025-07-30 00:54:58.998	percentage	0.00	0.00	0.00
550	HD004794	2025-07-08 08:25:05.803	\N	962	CÔ TUYẾT THU (5K) - LÔ SONG HÀNH	1	6000000.00	0.00	\N	completed	2025-07-30 00:54:58.998	2025-07-30 00:54:58.998	percentage	0.00	0.00	0.00
551	HD004793	2025-07-08 08:23:38.939	\N	878	ANH TÈO - VÔ NHIỄM	1	960000.00	0.00	\N	completed	2025-07-30 00:54:59.23	2025-07-30 00:54:59.23	percentage	0.00	0.00	0.00
553	HD004791.01	2025-07-08 07:53:46.007	\N	1135	TÂM UNITEK	1	8100000.00	8100000.00	\N	completed	2025-07-30 00:54:59.23	2025-07-30 00:54:59.23	percentage	0.00	0.00	0.00
554	HD004790	2025-07-08 07:40:24.883	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	490000.00	490000.00	\N	completed	2025-07-30 00:54:59.231	2025-07-30 00:54:59.231	percentage	0.00	0.00	0.00
555	HD004789	2025-07-08 07:36:26.486	\N	1043	HÀ HOÀNG	1	1050000.00	270000.00	\N	completed	2025-07-30 00:54:59.231	2025-07-30 00:54:59.231	percentage	0.00	0.00	0.00
556	HD004788	2025-07-08 07:31:36.487	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	6690000.00	6690000.00	\N	completed	2025-07-30 00:54:59.231	2025-07-30 00:54:59.231	percentage	0.00	0.00	0.00
571	HD004773	2025-07-07 14:16:28.797	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	2000000.00	0.00	\N	completed	2025-07-30 00:54:59.233	2025-07-30 00:54:59.233	percentage	0.00	0.00	0.00
572	HD004772	2025-07-07 14:14:48.18	\N	1026	HUYỀN TIGERVET	1	2190000.00	0.00	\N	completed	2025-07-30 00:54:59.233	2025-07-30 00:54:59.233	percentage	0.00	0.00	0.00
573	HD004771.01	2025-07-07 10:25:50.712	\N	1123	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	4210000.00	3310000.00	\N	completed	2025-07-30 00:54:59.233	2025-07-30 00:54:59.233	percentage	0.00	0.00	0.00
574	HD004770	2025-07-07 09:59:35.153	\N	1178	CHÚ CHƯƠNG - TAM HOÀNG	1	2600000.00	0.00	\N	completed	2025-07-30 00:54:59.234	2025-07-30 00:54:59.234	percentage	0.00	0.00	0.00
575	HD004769	2025-07-07 09:53:33.522	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	300000.00	300000.00	\N	completed	2025-07-30 00:54:59.234	2025-07-30 00:54:59.234	percentage	0.00	0.00	0.00
576	HD004768.01	2025-07-07 09:52:01.677	\N	1026	HUYỀN TIGERVET	1	4400000.00	0.00	\N	completed	2025-07-30 00:54:59.234	2025-07-30 00:54:59.234	percentage	0.00	0.00	0.00
578	HD004766	2025-07-07 09:07:47.146	\N	874	QUÂN BIOFRAM	1	480000.00	480000.00	\N	completed	2025-07-30 00:54:59.234	2025-07-30 00:54:59.234	percentage	0.00	0.00	0.00
580	HD004764	2025-07-07 08:25:06.047	\N	887	ANH HUY - GÀ - ĐỨC HUY	1	3810000.00	0.00	\N	completed	2025-07-30 00:54:59.235	2025-07-30 00:54:59.235	percentage	0.00	0.00	0.00
581	HD004763	2025-07-07 08:11:05.987	\N	881	CHÚ HUỲNH - XÃ LỘ 25	1	13000000.00	3000000.00	\N	completed	2025-07-30 00:54:59.235	2025-07-30 00:54:59.235	percentage	0.00	0.00	0.00
582	HD004762	2025-07-07 07:55:43.51	\N	1057	KHÁCH LẺ	1	450000.00	450000.00	\N	completed	2025-07-30 00:54:59.235	2025-07-30 00:54:59.235	percentage	0.00	0.00	0.00
583	HD004761	2025-07-07 07:51:29.403	\N	1215	ANH TÂM ( ANH CÔNG)	1	2340000.00	0.00	\N	completed	2025-07-30 00:54:59.235	2025-07-30 00:54:59.235	percentage	0.00	0.00	0.00
584	HD004760	2025-07-07 07:50:33.962	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	2340000.00	2340000.00	\N	completed	2025-07-30 00:54:59.236	2025-07-30 00:54:59.236	percentage	0.00	0.00	0.00
585	HD004759	2025-07-07 06:58:01.556	\N	878	ANH TÈO - VÔ NHIỄM	1	920000.00	0.00	\N	completed	2025-07-30 00:54:59.236	2025-07-30 00:54:59.236	percentage	0.00	0.00	0.00
586	HD004758	2025-07-07 06:44:02.003	\N	1204	ANH HỌC	1	800000.00	0.00	\N	completed	2025-07-30 00:54:59.236	2025-07-30 00:54:59.236	percentage	0.00	0.00	0.00
587	HD004757.01	2025-07-07 06:26:40.083	\N	857	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	180000.00	0.00	\N	completed	2025-07-30 00:54:59.236	2025-07-30 00:54:59.236	percentage	0.00	0.00	0.00
588	HD004756	2025-07-07 06:25:00.172	\N	993	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	8770000.00	8770000.00	\N	completed	2025-07-30 00:54:59.236	2025-07-30 00:54:59.236	percentage	0.00	0.00	0.00
589	HD004755	2025-07-07 06:22:44.97	\N	957	CHỊ LOAN -BỐT ĐỎ	1	1320000.00	0.00	\N	completed	2025-07-30 00:54:59.236	2025-07-30 00:54:59.236	percentage	0.00	0.00	0.00
590	HD004754	2025-07-07 06:20:22.803	\N	1192	CÔ PHƯỢNG - BÌNH LỘC	1	1080000.00	0.00	\N	completed	2025-07-30 00:54:59.236	2025-07-30 00:54:59.236	percentage	0.00	0.00	0.00
591	HD004753.02	2025-07-07 06:18:37.313	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	1000000.00	1000000.00	\N	completed	2025-07-30 00:54:59.237	2025-07-30 00:54:59.237	percentage	0.00	0.00	0.00
592	HD004752.01	2025-07-06 18:25:29.489	\N	1057	KHÁCH LẺ	1	450000.00	450000.00	\N	completed	2025-07-30 00:54:59.237	2025-07-30 00:54:59.237	percentage	0.00	0.00	0.00
593	HD004751.01	2025-07-06 16:36:57.6	\N	1057	KHÁCH LẺ	1	30000.00	30000.00	\N	completed	2025-07-30 00:54:59.237	2025-07-30 00:54:59.237	percentage	0.00	0.00	0.00
594	HD004750	2025-07-06 16:11:34.343	\N	1221	CHÚ PHƯỚC - TAM HOÀNG	1	650000.00	0.00	\N	completed	2025-07-30 00:54:59.237	2025-07-30 00:54:59.237	percentage	0.00	0.00	0.00
595	HD004749.01	2025-07-06 16:00:25.049	\N	1122	TÚ GÀ TA	1	400000.00	0.00	\N	completed	2025-07-30 00:54:59.237	2025-07-30 00:54:59.237	percentage	0.00	0.00	0.00
596	HD004748	2025-07-06 15:57:45.57	\N	864	ANH TÀI - MARTINO (BÀ NGOẠI)	1	520000.00	0.00	\N	completed	2025-07-30 00:54:59.237	2025-07-30 00:54:59.237	percentage	0.00	0.00	0.00
597	HD004747	2025-07-06 15:55:41.84	\N	1113	ANH TÀI - GÀ TA - MARTINO	1	520000.00	0.00	\N	completed	2025-07-30 00:54:59.237	2025-07-30 00:54:59.237	percentage	0.00	0.00	0.00
598	HD004746	2025-07-06 09:36:39.452	\N	1062	CHỊ HƯƠNG-THÀNH AN	1	465000.00	465000.00	\N	completed	2025-07-30 00:54:59.238	2025-07-30 00:54:59.238	percentage	0.00	0.00	0.00
599	HD004745	2025-07-06 08:17:44.786	\N	863	NGUYỆT SƠN LÂM	1	600000.00	600000.00	\N	completed	2025-07-30 00:54:59.238	2025-07-30 00:54:59.238	percentage	0.00	0.00	0.00
600	HD004744	2025-07-06 08:09:40.576	\N	1030	CHÚ HÙNG - VÕ DÕNG	1	820000.00	0.00	\N	completed	2025-07-30 00:54:59.238	2025-07-30 00:54:59.238	percentage	0.00	0.00	0.00
602	HD004742	2025-07-06 07:33:36.196	\N	1176	ANH SỸ -TAM HOÀNG	1	700000.00	0.00	\N	completed	2025-07-30 00:54:59.459	2025-07-30 00:54:59.459	percentage	0.00	0.00	0.00
603	HD004741.01	2025-07-06 07:11:26.083	\N	857	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	1600000.00	0.00	\N	completed	2025-07-30 00:54:59.459	2025-07-30 00:54:59.459	percentage	0.00	0.00	0.00
604	HD004740	2025-07-06 06:51:36.287	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	2500000.00	0.00	\N	completed	2025-07-30 00:54:59.459	2025-07-30 00:54:59.459	percentage	0.00	0.00	0.00
605	HD004739	2025-07-06 06:49:02.053	\N	1175	ANH PHÙNG - TAM HOÀNG-NINH PHÁT	1	1900000.00	1805000.00	\N	completed	2025-07-30 00:54:59.459	2025-07-30 00:54:59.459	percentage	0.00	0.00	0.00
606	HD004738	2025-07-06 06:34:20.723	\N	1114	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	3250000.00	0.00	\N	completed	2025-07-30 00:54:59.459	2025-07-30 00:54:59.459	percentage	0.00	0.00	0.00
607	HD004737.01	2025-07-06 06:33:13.252	\N	1025	CÔ NGA VỊT - SUỐI NHO	1	4100000.00	0.00	\N	completed	2025-07-30 00:54:59.459	2025-07-30 00:54:59.459	percentage	0.00	0.00	0.00
608	HD004736	2025-07-06 06:26:59.653	\N	1057	KHÁCH LẺ	1	20000.00	20000.00	\N	completed	2025-07-30 00:54:59.46	2025-07-30 00:54:59.46	percentage	0.00	0.00	0.00
609	HD004735	2025-07-05 17:22:54.98	\N	1057	KHÁCH LẺ	1	50000.00	50000.00	\N	completed	2025-07-30 00:54:59.46	2025-07-30 00:54:59.46	percentage	0.00	0.00	0.00
610	HD004734.01	2025-07-05 16:21:56.907	\N	942	ANH TRUYỀN  - TAM HOÀNG - GIA PHÁT 1	1	2250000.00	0.00	\N	completed	2025-07-30 00:54:59.46	2025-07-30 00:54:59.46	percentage	0.00	0.00	0.00
611	HD004733	2025-07-05 15:24:17.673	\N	1009	ANH TRƯỜNG - CẦU CƯỜNG	1	680000.00	680000.00	\N	completed	2025-07-30 00:54:59.46	2025-07-30 00:54:59.46	percentage	0.00	0.00	0.00
612	HD004732	2025-07-05 14:32:04.303	\N	1129	SÁNG TẰNG HAID	1	1750000.00	1750000.00	\N	completed	2025-07-30 00:54:59.46	2025-07-30 00:54:59.46	percentage	0.00	0.00	0.00
613	HD004731	2025-07-05 14:30:17.587	\N	1208	ANH SỸ - VỊT	1	4500000.00	0.00	\N	completed	2025-07-30 00:54:59.46	2025-07-30 00:54:59.46	percentage	0.00	0.00	0.00
614	HD004730	2025-07-05 14:29:00.623	\N	1190	CHỊ QUYÊN - VỊT	1	6700000.00	0.00	\N	completed	2025-07-30 00:54:59.46	2025-07-30 00:54:59.46	percentage	0.00	0.00	0.00
615	HD004729	2025-07-05 11:23:35.08	\N	875	NHUNG VIETVET	1	2238000.00	0.00	\N	completed	2025-07-30 00:54:59.461	2025-07-30 00:54:59.461	percentage	0.00	0.00	0.00
617	HD004727.01	2025-07-05 10:26:38.383	\N	1215	ANH TÂM ( ANH CÔNG)	1	1440000.00	0.00	\N	completed	2025-07-30 00:54:59.461	2025-07-30 00:54:59.461	percentage	0.00	0.00	0.00
618	HD004726	2025-07-05 09:52:23.522	\N	943	THÚ Y ĐÌNH HIỀN	1	2910000.00	2910000.00	\N	completed	2025-07-30 00:54:59.461	2025-07-30 00:54:59.461	percentage	0.00	0.00	0.00
619	HD004725	2025-07-05 09:43:24.527	\N	1185	ANH LÂM (8K) - TRẠI 4	1	600000.00	0.00	\N	completed	2025-07-30 00:54:59.461	2025-07-30 00:54:59.461	percentage	0.00	0.00	0.00
620	HD004724	2025-07-05 09:42:36.53	\N	1032	ANH LÂM (5K) - TRẠI 2	1	660000.00	0.00	\N	completed	2025-07-30 00:54:59.461	2025-07-30 00:54:59.461	percentage	0.00	0.00	0.00
621	HD004723	2025-07-05 09:41:58.95	\N	1226	ANH LÂM (5k) - TRẠI 1	1	1320000.00	0.00	\N	completed	2025-07-30 00:54:59.461	2025-07-30 00:54:59.461	percentage	0.00	0.00	0.00
622	HD004722	2025-07-05 09:41:11.953	\N	1041	KHẢI ( CÔ CHUNG)	1	1800000.00	0.00	\N	completed	2025-07-30 00:54:59.461	2025-07-30 00:54:59.461	percentage	0.00	0.00	0.00
623	HD004721	2025-07-05 09:40:08.792	TH000179	990	ANH HIẾU - DÊ	1	550000.00	550000.00	\N	completed	2025-07-30 00:54:59.462	2025-07-30 00:54:59.462	percentage	0.00	0.00	0.00
624	HD004720	2025-07-05 09:31:23.182	\N	1048	ANH TRIỆU - GIA KIỆM	1	3500000.00	0.00	\N	completed	2025-07-30 00:54:59.462	2025-07-30 00:54:59.462	percentage	0.00	0.00	0.00
625	HD004719	2025-07-05 08:57:20.729	\N	1195	ANH PHONG - SUỐI ĐÁ 2	1	4800000.00	0.00	\N	completed	2025-07-30 00:54:59.462	2025-07-30 00:54:59.462	percentage	0.00	0.00	0.00
626	HD004718	2025-07-05 08:41:31.15	\N	864	ANH TÀI - MARTINO (BÀ NGOẠI)	1	930000.00	0.00	\N	completed	2025-07-30 00:54:59.462	2025-07-30 00:54:59.462	percentage	0.00	0.00	0.00
627	HD004717	2025-07-05 08:39:00.98	\N	936	ANH VŨ - GÀ ĐẺ	1	350000.00	90000.00	\N	completed	2025-07-30 00:54:59.462	2025-07-30 00:54:59.462	percentage	0.00	0.00	0.00
628	HD004716.01	2025-07-05 08:15:31.512	\N	1122	TÚ GÀ TA	1	360000.00	0.00	\N	completed	2025-07-30 00:54:59.462	2025-07-30 00:54:59.462	percentage	0.00	0.00	0.00
629	HD004715.01	2025-07-05 08:11:37.237	\N	996	ANH PHONG - SUỐI ĐÁ 3	1	1100000.00	0.00	\N	completed	2025-07-30 00:54:59.462	2025-07-30 00:54:59.462	percentage	0.00	0.00	0.00
630	HD004714	2025-07-05 08:10:25.477	\N	1058	ANH PHONG - SUỐI ĐÁ 1	1	3300000.00	0.00	\N	completed	2025-07-30 00:54:59.462	2025-07-30 00:54:59.462	percentage	0.00	0.00	0.00
631	HD004713.01	2025-07-05 07:30:01.853	\N	1215	ANH TÂM ( ANH CÔNG)	1	8610000.00	0.00	\N	completed	2025-07-30 00:54:59.463	2025-07-30 00:54:59.463	percentage	0.00	0.00	0.00
632	HD004712	2025-07-05 07:12:53.893	\N	1176	ANH SỸ -TAM HOÀNG	1	1200000.00	0.00	\N	completed	2025-07-30 00:54:59.463	2025-07-30 00:54:59.463	percentage	0.00	0.00	0.00
577	HD004767	2025-07-07 09:46:55.303	\N	1228	Khách lẻ	1	130000.00	130000.00	\N	completed	2025-07-30 00:54:59.234	2025-07-30 00:54:59.234	percentage	0.00	0.00	0.00
634	HD004710.03	2025-07-05 06:29:57.73	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	600000.00	600000.00	\N	completed	2025-07-30 00:54:59.463	2025-07-30 00:54:59.463	percentage	0.00	0.00	0.00
635	HD004709	2025-07-05 06:27:16.777	\N	883	ANH HẢI CJ	1	1110000.00	1110000.00	\N	completed	2025-07-30 00:54:59.463	2025-07-30 00:54:59.463	percentage	0.00	0.00	0.00
636	HD004708	2025-07-05 06:21:12.987	\N	1210	CHỊ HUYỀN - VÕ DÕNG	1	2360000.00	2360000.00	\N	completed	2025-07-30 00:54:59.463	2025-07-30 00:54:59.463	percentage	0.00	0.00	0.00
637	HD004707.01	2025-07-05 06:19:27.293	\N	876	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	1380000.00	0.00	\N	completed	2025-07-30 00:54:59.463	2025-07-30 00:54:59.463	percentage	0.00	0.00	0.00
638	HD004706	2025-07-05 06:18:12.219	\N	1134	CHÚ CẦN - GÀ ĐẺ - NINH PHÁT	1	1380000.00	0.00	\N	completed	2025-07-30 00:54:59.463	2025-07-30 00:54:59.463	percentage	0.00	0.00	0.00
640	HD004704	2025-07-04 17:42:26.12	\N	1062	CHỊ HƯƠNG-THÀNH AN	1	1190000.00	1190000.00	\N	completed	2025-07-30 00:54:59.464	2025-07-30 00:54:59.464	percentage	0.00	0.00	0.00
641	HD004703	2025-07-04 17:21:00.4	\N	1051	ANH HUYẾN - CÚT	1	800000.00	760000.00	\N	completed	2025-07-30 00:54:59.464	2025-07-30 00:54:59.464	percentage	0.00	0.00	0.00
642	HD004702	2025-07-04 15:41:08.846	\N	1135	TÂM UNITEK	1	5900000.00	5900000.00	\N	completed	2025-07-30 00:54:59.464	2025-07-30 00:54:59.464	percentage	0.00	0.00	0.00
643	HD004701	2025-07-04 15:25:19.492	\N	1032	ANH LÂM (5K) - TRẠI 2	1	3600000.00	0.00	\N	completed	2025-07-30 00:54:59.464	2025-07-30 00:54:59.464	percentage	0.00	0.00	0.00
644	HD004700	2025-07-04 15:00:35.897	\N	990	ANH HIẾU - DÊ	1	2950000.00	840000.00	\N	completed	2025-07-30 00:54:59.464	2025-07-30 00:54:59.464	percentage	0.00	0.00	0.00
645	HD004699.01	2025-07-04 14:42:09.846	\N	1190	CHỊ QUYÊN - VỊT	1	1400000.00	0.00	\N	completed	2025-07-30 00:54:59.464	2025-07-30 00:54:59.464	percentage	0.00	0.00	0.00
646	HD004698	2025-07-04 14:37:01.387	\N	875	NHUNG VIETVET	1	10800000.00	0.00	\N	completed	2025-07-30 00:54:59.464	2025-07-30 00:54:59.464	percentage	0.00	0.00	0.00
647	HD004697	2025-07-04 14:30:33.863	\N	1043	HÀ HOÀNG	1	840000.00	840000.00	\N	completed	2025-07-30 00:54:59.465	2025-07-30 00:54:59.465	percentage	0.00	0.00	0.00
648	HD004696	2025-07-04 14:29:12.307	\N	993	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	7990000.00	7990000.00	\N	completed	2025-07-30 00:54:59.465	2025-07-30 00:54:59.465	percentage	0.00	0.00	0.00
649	HD004695	2025-07-04 10:59:28.653	\N	992	XUÂN ( THUÊ NGÁT)	1	3150000.00	150000.00	\N	completed	2025-07-30 00:54:59.465	2025-07-30 00:54:59.465	percentage	0.00	0.00	0.00
650	HD004694	2025-07-04 09:04:57.276	\N	993	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	3000000.00	3000000.00	\N	completed	2025-07-30 00:54:59.465	2025-07-30 00:54:59.465	percentage	0.00	0.00	0.00
651	HD004693	2025-07-04 09:03:39.073	\N	1154	ANH THÁI - VỊT - PHÚC NHẠC	1	3000000.00	3000000.00	\N	completed	2025-07-30 00:54:59.714	2025-07-30 00:54:59.714	percentage	0.00	0.00	0.00
652	HD004692	2025-07-04 07:39:12.047	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	8480000.00	8480000.00	\N	completed	2025-07-30 00:54:59.715	2025-07-30 00:54:59.715	percentage	0.00	0.00	0.00
653	HD004691	2025-07-04 06:38:51.43	\N	1046	ANH TRUYỀN - TAM HOÀNG - GIA PHÁT 2	1	7750000.00	0.00	\N	completed	2025-07-30 00:54:59.715	2025-07-30 00:54:59.715	percentage	0.00	0.00	0.00
654	HD004690	2025-07-04 06:27:45.413	\N	1025	CÔ NGA VỊT - SUỐI NHO	1	5500000.00	0.00	\N	completed	2025-07-30 00:54:59.715	2025-07-30 00:54:59.715	percentage	0.00	0.00	0.00
655	HD004689	2025-07-04 06:25:28.043	\N	876	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	1230000.00	0.00	\N	completed	2025-07-30 00:54:59.715	2025-07-30 00:54:59.715	percentage	0.00	0.00	0.00
656	HD004687	2025-07-03 17:45:56.57	\N	912	CÔ VỠI - XUÂN BẮC	1	5350000.00	0.00	\N	completed	2025-07-30 00:54:59.715	2025-07-30 00:54:59.715	percentage	0.00	0.00	0.00
658	HD004685	2025-07-03 17:00:18.41	\N	876	CHÚ DŨNG - ĐỐNG ĐA - LỨA MỚI	1	3450000.00	0.00	\N	completed	2025-07-30 00:54:59.716	2025-07-30 00:54:59.716	percentage	0.00	0.00	0.00
659	HD004684	2025-07-03 16:46:54.623	\N	1198	CÔ QUYỀN - ĐỨC LONG	1	15920000.00	0.00	\N	completed	2025-07-30 00:54:59.716	2025-07-30 00:54:59.716	percentage	0.00	0.00	0.00
660	HD004683	2025-07-03 15:40:30.613	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	1950000.00	1950000.00	\N	completed	2025-07-30 00:54:59.716	2025-07-30 00:54:59.716	percentage	0.00	0.00	0.00
661	HD004682	2025-07-03 15:07:56.277	\N	1057	KHÁCH LẺ	1	230000.00	230000.00	\N	completed	2025-07-30 00:54:59.716	2025-07-30 00:54:59.716	percentage	0.00	0.00	0.00
662	HD004681	2025-07-03 15:03:09.973	\N	1185	ANH LÂM (8K) - TRẠI 4	1	900000.00	0.00	\N	completed	2025-07-30 00:54:59.716	2025-07-30 00:54:59.716	percentage	0.00	0.00	0.00
663	HD004680	2025-07-03 15:00:56.62	\N	947	ANH LÂM (6K) - TRẠI 3	1	2250000.00	0.00	\N	completed	2025-07-30 00:54:59.716	2025-07-30 00:54:59.716	percentage	0.00	0.00	0.00
664	HD004679	2025-07-03 14:59:42.883	\N	1032	ANH LÂM (5K) - TRẠI 2	1	450000.00	0.00	\N	completed	2025-07-30 00:54:59.716	2025-07-30 00:54:59.716	percentage	0.00	0.00	0.00
665	HD004678	2025-07-03 14:58:20.72	\N	1226	ANH LÂM (5k) - TRẠI 1	1	450000.00	0.00	\N	completed	2025-07-30 00:54:59.717	2025-07-30 00:54:59.717	percentage	0.00	0.00	0.00
666	HD004677	2025-07-03 14:23:47.44	\N	1122	TÚ GÀ TA	1	1950000.00	0.00	\N	completed	2025-07-30 00:54:59.717	2025-07-30 00:54:59.717	percentage	0.00	0.00	0.00
667	HD004676	2025-07-03 14:17:17.116	\N	1057	KHÁCH LẺ	1	210000.00	210000.00	\N	completed	2025-07-30 00:54:59.717	2025-07-30 00:54:59.717	percentage	0.00	0.00	0.00
668	HD004675	2025-07-03 11:25:07.647	\N	1155	ANH PHONG - VỊT (NHÀ)	1	7020000.00	1570000.00	\N	completed	2025-07-30 00:54:59.717	2025-07-30 00:54:59.717	percentage	0.00	0.00	0.00
669	HD004674	2025-07-03 10:21:24.48	\N	990	ANH HIẾU - DÊ	1	1320000.00	1320000.00	\N	completed	2025-07-30 00:54:59.717	2025-07-30 00:54:59.717	percentage	0.00	0.00	0.00
670	HD004673	2025-07-03 10:10:00.393	\N	1176	ANH SỸ -TAM HOÀNG	1	3640000.00	0.00	\N	completed	2025-07-30 00:54:59.717	2025-07-30 00:54:59.717	percentage	0.00	0.00	0.00
671	HD004672	2025-07-03 10:05:30.57	\N	1135	TÂM UNITEK	1	3900000.00	3900000.00	\N	completed	2025-07-30 00:54:59.717	2025-07-30 00:54:59.717	percentage	0.00	0.00	0.00
672	HD004671.01	2025-07-03 09:02:12.567	\N	1062	CHỊ HƯƠNG-THÀNH AN	1	5070000.00	5070000.00	\N	completed	2025-07-30 00:54:59.717	2025-07-30 00:54:59.717	percentage	0.00	0.00	0.00
673	HD004670	2025-07-03 08:45:59.01	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	7150000.00	7150000.00	\N	completed	2025-07-30 00:54:59.718	2025-07-30 00:54:59.718	percentage	0.00	0.00	0.00
674	HD004669	2025-07-03 08:44:15.437	\N	922	HUY - NINH PHÁT	1	310000.00	0.00	\N	completed	2025-07-30 00:54:59.718	2025-07-30 00:54:59.718	percentage	0.00	0.00	0.00
675	HD004668	2025-07-03 08:27:03.813	\N	1080	CÔNG ARIVIET	1	9170000.00	9170000.00	\N	completed	2025-07-30 00:54:59.718	2025-07-30 00:54:59.718	percentage	0.00	0.00	0.00
676	HD004667	2025-07-03 07:04:22.753	\N	1080	CÔNG ARIVIET	1	4520000.00	4520000.00	\N	completed	2025-07-30 00:54:59.718	2025-07-30 00:54:59.718	percentage	0.00	0.00	0.00
677	HD004666	2025-07-03 06:44:12.992	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	4500000.00	0.00	\N	completed	2025-07-30 00:54:59.718	2025-07-30 00:54:59.718	percentage	0.00	0.00	0.00
678	HD004665	2025-07-03 06:32:42.773	\N	1080	CÔNG ARIVIET	1	1100000.00	1100000.00	\N	completed	2025-07-30 00:54:59.719	2025-07-30 00:54:59.719	percentage	0.00	0.00	0.00
680	HD004663.01	2025-07-03 06:28:22.647	\N	1048	ANH TRIỆU - GIA KIỆM	1	2500000.00	0.00	\N	completed	2025-07-30 00:54:59.719	2025-07-30 00:54:59.719	percentage	0.00	0.00	0.00
681	HD004662	2025-07-03 06:20:38.712	\N	1180	ANH HÙNG - BỘ - TAM HOÀNG	1	1130000.00	0.00	\N	completed	2025-07-30 00:54:59.719	2025-07-30 00:54:59.719	percentage	0.00	0.00	0.00
682	HD004661	2025-07-03 06:18:02.26	\N	992	XUÂN ( THUÊ NGÁT)	1	0.00	0.00	\N	completed	2025-07-30 00:54:59.72	2025-07-30 00:54:59.72	percentage	0.00	0.00	0.00
683	HD004660	2025-07-03 06:17:03.013	\N	992	XUÂN ( THUÊ NGÁT)	1	8000000.00	8000000.00	\N	completed	2025-07-30 00:54:59.72	2025-07-30 00:54:59.72	percentage	0.00	0.00	0.00
684	HD004659	2025-07-03 06:14:08.56	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	900000.00	900000.00	\N	completed	2025-07-30 00:54:59.72	2025-07-30 00:54:59.72	percentage	0.00	0.00	0.00
685	HD004658	2025-07-02 16:51:47.13	\N	1057	KHÁCH LẺ	1	200000.00	200000.00	\N	completed	2025-07-30 00:54:59.72	2025-07-30 00:54:59.72	percentage	0.00	0.00	0.00
686	HD004657.01	2025-07-02 15:01:49.23	\N	1192	CÔ PHƯỢNG - BÌNH LỘC	1	1110000.00	0.00	\N	completed	2025-07-30 00:54:59.72	2025-07-30 00:54:59.72	percentage	0.00	0.00	0.00
687	HD004656	2025-07-02 15:00:21.75	\N	1165	ANH QUANG- GÀ TA- LẠC SƠN	1	2600000.00	2600000.00	\N	completed	2025-07-30 00:54:59.72	2025-07-30 00:54:59.72	percentage	0.00	0.00	0.00
688	HD004655	2025-07-02 14:46:32.543	\N	990	ANH HIẾU - DÊ	1	1100000.00	1100000.00	\N	completed	2025-07-30 00:54:59.72	2025-07-30 00:54:59.72	percentage	0.00	0.00	0.00
689	HD004654	2025-07-02 14:43:20.087	\N	892	ANH HOAN - XUÂN BẮC	1	5200000.00	0.00	\N	completed	2025-07-30 00:54:59.721	2025-07-30 00:54:59.721	percentage	0.00	0.00	0.00
690	HD004653	2025-07-02 11:10:03.79	\N	1215	ANH TÂM ( ANH CÔNG)	1	6760000.00	0.00	\N	completed	2025-07-30 00:54:59.721	2025-07-30 00:54:59.721	percentage	0.00	0.00	0.00
691	HD004652	2025-07-02 10:26:01.62	\N	1062	CHỊ HƯƠNG-THÀNH AN	1	520000.00	520000.00	\N	completed	2025-07-30 00:54:59.721	2025-07-30 00:54:59.721	percentage	0.00	0.00	0.00
692	HD004651	2025-07-02 10:04:07.187	\N	1048	ANH TRIỆU - GIA KIỆM	1	800000.00	0.00	\N	completed	2025-07-30 00:54:59.721	2025-07-30 00:54:59.721	percentage	0.00	0.00	0.00
693	HD004650	2025-07-02 09:11:54.223	\N	1182	ANH VŨ (CÔ HUỆ) - TAM HOÀNG	1	5800000.00	0.00	\N	completed	2025-07-30 00:54:59.721	2025-07-30 00:54:59.721	percentage	0.00	0.00	0.00
694	HD004649	2025-07-02 08:54:49.752	\N	1185	ANH LÂM (8K) - TRẠI 4	1	2980000.00	0.00	\N	completed	2025-07-30 00:54:59.721	2025-07-30 00:54:59.721	percentage	0.00	0.00	0.00
695	HD004648	2025-07-02 08:51:38.883	\N	1226	ANH LÂM (5k) - TRẠI 1	1	2640000.00	0.00	\N	completed	2025-07-30 00:54:59.721	2025-07-30 00:54:59.721	percentage	0.00	0.00	0.00
1	HD005354	2025-07-28 10:36:38.429	\N	1208	ANH SỸ - VỊT	1	7365000.00	0.00	\N	completed	2025-07-30 00:54:56.163	2025-07-30 00:54:56.163	percentage	0.00	0.00	0.00
11	HD005344	2025-07-28 08:16:52.967	\N	852	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	2760000.00	0.00	\N	completed	2025-07-30 00:54:56.166	2025-07-30 00:54:56.166	percentage	0.00	0.00	0.00
30	HD005325	2025-07-27 07:52:23.696	\N	852	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	350000.00	0.00	\N	completed	2025-07-30 00:54:56.17	2025-07-30 00:54:56.17	percentage	0.00	0.00	0.00
49	HD005306	2025-07-26 09:10:06.159	\N	852	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	1635000.00	0.00	\N	completed	2025-07-30 00:54:56.173	2025-07-30 00:54:56.173	percentage	0.00	0.00	0.00
64	HD005291.02	2025-07-26 06:43:11.927	\N	1220	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	2160000.00	400000.00	\N	completed	2025-07-30 00:54:56.462	2025-07-30 00:54:56.462	percentage	0.00	0.00	0.00
67	HD005287	2025-07-26 06:34:31.203	\N	987	THƯƠNG CHÍCH - TRẢNG BOM	1	1030000.00	0.00	\N	completed	2025-07-30 00:54:56.463	2025-07-30 00:54:56.463	percentage	0.00	0.00	0.00
87	HD005266	2025-07-25 07:54:19.44	\N	905	ANH DUY - PHƯƠNG LÂM	1	3420000.00	0.00	\N	completed	2025-07-30 00:54:56.467	2025-07-30 00:54:56.467	percentage	0.00	0.00	0.00
103	HD005250	2025-07-24 17:46:57.219	\N	887	ANH HUY - GÀ - ĐỨC HUY	1	1750000.00	0.00	\N	completed	2025-07-30 00:54:56.718	2025-07-30 00:54:56.718	percentage	0.00	0.00	0.00
122	HD005230.01	2025-07-24 07:02:30.622	\N	841	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	2400000.00	0.00	\N	completed	2025-07-30 00:54:56.721	2025-07-30 00:54:56.721	percentage	0.00	0.00	0.00
129	HD005223	2025-07-24 06:31:11.267	\N	1180	ANH HÙNG - BỘ - TAM HOÀNG	1	1130000.00	0.00	\N	completed	2025-07-30 00:54:56.723	2025-07-30 00:54:56.723	percentage	0.00	0.00	0.00
142	HD005209	2025-07-23 11:15:11.17	\N	1114	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	5250000.00	0.00	\N	completed	2025-07-30 00:54:56.725	2025-07-30 00:54:56.725	percentage	0.00	0.00	0.00
169	HD005182	2025-07-22 15:44:54.319	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	1000000.00	0.00	\N	completed	2025-07-30 00:54:56.963	2025-07-30 00:54:56.963	percentage	0.00	0.00	0.00
185	HD005165	2025-07-22 08:59:28.177	\N	898	ANH ĐEN - GÀ - VÔ NHIỄM 2K	1	260000.00	0.00	\N	completed	2025-07-30 00:54:56.966	2025-07-30 00:54:56.966	percentage	0.00	0.00	0.00
190	HD005160	2025-07-22 07:56:15.109	\N	1183	ANH CU - TAM HOÀNG HƯNG LỘC	1	13950000.00	0.00	\N	completed	2025-07-30 00:54:56.967	2025-07-30 00:54:56.967	percentage	0.00	0.00	0.00
191	HD005159.01	2025-07-22 07:18:18.882	\N	857	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	400000.00	0.00	\N	completed	2025-07-30 00:54:56.967	2025-07-30 00:54:56.967	percentage	0.00	0.00	0.00
206	HD005144	2025-07-21 15:54:55.656	\N	923	ANH BIỂN - TAM HOÀNG - CÂY GÁO LÔ MỚI	1	12600000.00	0.00	\N	completed	2025-07-30 00:54:57.298	2025-07-30 00:54:57.298	percentage	0.00	0.00	0.00
229	HD005121	2025-07-20 15:44:13.797	\N	859	ANH QUẢNG - LONG THÀNH	1	2600000.00	0.00	\N	completed	2025-07-30 00:54:57.305	2025-07-30 00:54:57.305	percentage	0.00	0.00	0.00
248	HD005101.01	2025-07-19 10:26:30.713	\N	852	ANH VƯƠNG  KÍNH - TÍN NGHĨA	1	700000.00	0.00	\N	completed	2025-07-30 00:54:57.308	2025-07-30 00:54:57.308	percentage	0.00	0.00	0.00
697	HD004646.02	2025-07-02 08:23:16.333	\N	881	CHÚ HUỲNH - XÃ LỘ 25	1	3100000.00	3100000.00	\N	completed	2025-07-30 00:54:59.722	2025-07-30 00:54:59.722	percentage	0.00	0.00	0.00
698	HD004645	2025-07-02 08:08:08.757	\N	865	ANH HỌC (LONG)	1	2400000.00	0.00	\N	completed	2025-07-30 00:54:59.722	2025-07-30 00:54:59.722	percentage	0.00	0.00	0.00
699	HD004644	2025-07-02 08:06:44.962	\N	1135	TÂM UNITEK	1	5800000.00	5800000.00	\N	completed	2025-07-30 00:54:59.722	2025-07-30 00:54:59.722	percentage	0.00	0.00	0.00
700	HD004643	2025-07-02 08:04:48.132	\N	912	CÔ VỠI - XUÂN BẮC	1	3000000.00	0.00	\N	completed	2025-07-30 00:54:59.722	2025-07-30 00:54:59.722	percentage	0.00	0.00	0.00
701	HD004642	2025-07-02 07:54:12.702	\N	957	CHỊ LOAN -BỐT ĐỎ	1	2250000.00	0.00	\N	completed	2025-07-30 00:54:59.936	2025-07-30 00:54:59.936	percentage	0.00	0.00	0.00
702	HD004641	2025-07-02 07:47:15.697	\N	1212	KHẢI 8.500 CON - XUYÊN MỘC	1	4320000.00	0.00	\N	completed	2025-07-30 00:54:59.937	2025-07-30 00:54:59.937	percentage	0.00	0.00	0.00
704	HD004639	2025-07-02 07:43:36.947	\N	1195	ANH PHONG - SUỐI ĐÁ 2	1	1800000.00	0.00	\N	completed	2025-07-30 00:54:59.937	2025-07-30 00:54:59.937	percentage	0.00	0.00	0.00
705	HD004638	2025-07-02 07:41:29.62	\N	874	QUÂN BIOFRAM	1	600000.00	600000.00	\N	completed	2025-07-30 00:54:59.937	2025-07-30 00:54:59.937	percentage	0.00	0.00	0.00
706	HD004637.01	2025-07-02 07:38:47.693	\N	1080	CÔNG ARIVIET	1	1395000.00	1395000.00	\N	completed	2025-07-30 00:54:59.938	2025-07-30 00:54:59.938	percentage	0.00	0.00	0.00
707	HD004636.01	2025-07-02 07:35:28.597	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	2940000.00	0.00	\N	completed	2025-07-30 00:54:59.938	2025-07-30 00:54:59.938	percentage	0.00	0.00	0.00
708	HD004635	2025-07-02 07:31:01.216	\N	885	ANH THỨC - TAM HOÀNG	1	3050000.00	0.00	\N	completed	2025-07-30 00:54:59.938	2025-07-30 00:54:59.938	percentage	0.00	0.00	0.00
709	HD004634	2025-07-02 06:52:07.286	\N	1057	KHÁCH LẺ	1	350000.00	350000.00	\N	completed	2025-07-30 00:54:59.938	2025-07-30 00:54:59.938	percentage	0.00	0.00	0.00
710	HD004633	2025-07-02 06:49:41.43	\N	1135	TÂM UNITEK	1	1100000.00	1100000.00	\N	completed	2025-07-30 00:54:59.938	2025-07-30 00:54:59.938	percentage	0.00	0.00	0.00
711	HD004632	2025-07-02 06:45:22.847	\N	1135	TÂM UNITEK	1	7350000.00	7350000.00	\N	completed	2025-07-30 00:54:59.939	2025-07-30 00:54:59.939	percentage	0.00	0.00	0.00
712	HD004631.01	2025-07-02 06:43:39.499	\N	906	ANH CHÍNH - VÔ NHIỄM	1	11020000.00	0.00	\N	completed	2025-07-30 00:54:59.939	2025-07-30 00:54:59.939	percentage	0.00	0.00	0.00
713	HD004630.01	2025-07-02 06:39:02.967	\N	857	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	1820000.00	0.00	\N	completed	2025-07-30 00:54:59.939	2025-07-30 00:54:59.939	percentage	0.00	0.00	0.00
714	HD004629	2025-07-02 06:35:40.006	\N	1208	ANH SỸ - VỊT	1	3400000.00	0.00	\N	completed	2025-07-30 00:54:59.939	2025-07-30 00:54:59.939	percentage	0.00	0.00	0.00
715	HD004628	2025-07-01 17:34:34.316	\N	1221	CHÚ PHƯỚC - TAM HOÀNG	1	3500000.00	0.00	\N	completed	2025-07-30 00:54:59.939	2025-07-30 00:54:59.939	percentage	0.00	0.00	0.00
716	HD004627.01	2025-07-01 17:10:43.47	\N	1122	TÚ GÀ TA	1	720000.00	0.00	\N	completed	2025-07-30 00:54:59.939	2025-07-30 00:54:59.939	percentage	0.00	0.00	0.00
717	HD004626	2025-07-01 17:02:40.492	\N	1028	A VŨ - GÀ ĐẺ	1	1210000.00	1210000.00	\N	completed	2025-07-30 00:54:59.939	2025-07-30 00:54:59.939	percentage	0.00	0.00	0.00
718	HD004625	2025-07-01 16:38:14.563	\N	1011	HẢI - TRẢNG BOM	1	860000.00	860000.00	\N	completed	2025-07-30 00:54:59.94	2025-07-30 00:54:59.94	percentage	0.00	0.00	0.00
719	HD004624	2025-07-01 16:33:09.047	\N	866	ANH TÂN - LỘC HOÀ	1	12000000.00	0.00	\N	completed	2025-07-30 00:54:59.94	2025-07-30 00:54:59.94	percentage	0.00	0.00	0.00
720	HD004623	2025-07-01 14:54:08.782	\N	894	ANH DANH - GÀ TRE - VÔ NHIỄM 9K	1	5490000.00	0.00	\N	completed	2025-07-30 00:54:59.94	2025-07-30 00:54:59.94	percentage	0.00	0.00	0.00
721	HD004622	2025-07-01 14:49:04.003	\N	1057	KHÁCH LẺ	1	160000.00	160000.00	\N	completed	2025-07-30 00:54:59.94	2025-07-30 00:54:59.94	percentage	0.00	0.00	0.00
723	HD004620	2025-07-01 14:44:46.823	\N	1188	ANH HIỂN - BÀU SẬY	1	5850000.00	5850000.00	\N	completed	2025-07-30 00:54:59.94	2025-07-30 00:54:59.94	percentage	0.00	0.00	0.00
724	HD004619	2025-07-01 14:41:19.043	\N	993	ANH CƯỜNG - PHÚC NHẠC ĐƯỜNG SỐ 8	1	3850000.00	3850000.00	\N	completed	2025-07-30 00:54:59.94	2025-07-30 00:54:59.94	percentage	0.00	0.00	0.00
725	HD004618	2025-07-01 14:38:47.957	\N	1158	ANH TÂM - MARTINO - VỊT (NHÀ)	1	5030000.00	5030000.00	\N	completed	2025-07-30 00:54:59.94	2025-07-30 00:54:59.94	percentage	0.00	0.00	0.00
726	HD004617	2025-07-01 14:23:37.266	\N	926	ĐẠI LÝ GẤU - BÀU CÁ	1	440000.00	440000.00	\N	completed	2025-07-30 00:54:59.941	2025-07-30 00:54:59.941	percentage	0.00	0.00	0.00
727	HD004616	2025-07-01 14:20:45.08	\N	1041	KHẢI ( CÔ CHUNG)	1	2300000.00	0.00	\N	completed	2025-07-30 00:54:59.941	2025-07-30 00:54:59.941	percentage	0.00	0.00	0.00
728	HD004615.01	2025-07-01 09:46:47.347	\N	1057	KHÁCH LẺ	1	280000.00	280000.00	\N	completed	2025-07-30 00:54:59.941	2025-07-30 00:54:59.941	percentage	0.00	0.00	0.00
729	HD004614	2025-07-01 09:42:55.99	\N	887	ANH HUY - GÀ - ĐỨC HUY	1	3400000.00	0.00	\N	completed	2025-07-30 00:54:59.941	2025-07-30 00:54:59.941	percentage	0.00	0.00	0.00
730	HD004613	2025-07-01 09:40:13.432	\N	958	ANH THUỲ - XUÂN BẮC	1	4200000.00	0.00	\N	completed	2025-07-30 00:54:59.941	2025-07-30 00:54:59.941	percentage	0.00	0.00	0.00
731	HD004612	2025-07-01 09:38:35.097	\N	1026	HUYỀN TIGERVET	1	4950000.00	0.00	\N	completed	2025-07-30 00:54:59.941	2025-07-30 00:54:59.941	percentage	0.00	0.00	0.00
732	HD004611	2025-07-01 09:37:21.973	\N	1215	ANH TÂM ( ANH CÔNG)	1	2020000.00	0.00	\N	completed	2025-07-30 00:54:59.941	2025-07-30 00:54:59.941	percentage	0.00	0.00	0.00
733	HD004610.01	2025-07-01 08:09:20.069	\N	996	ANH PHONG - SUỐI ĐÁ 3	1	980000.00	0.00	\N	completed	2025-07-30 00:54:59.941	2025-07-30 00:54:59.941	percentage	0.00	0.00	0.00
734	HD004609.01	2025-07-01 08:07:02.859	\N	1058	ANH PHONG - SUỐI ĐÁ 1	1	2030000.00	0.00	\N	completed	2025-07-30 00:54:59.942	2025-07-30 00:54:59.942	percentage	0.00	0.00	0.00
735	HD004608	2025-07-01 07:05:36.113	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	4900000.00	0.00	\N	completed	2025-07-30 00:54:59.942	2025-07-30 00:54:59.942	percentage	0.00	0.00	0.00
736	HD004607	2025-07-01 06:26:22.236	\N	1192	CÔ PHƯỢNG - BÌNH LỘC	1	740000.00	0.00	\N	completed	2025-07-30 00:54:59.942	2025-07-30 00:54:59.942	percentage	0.00	0.00	0.00
737	HD004606	2025-07-01 06:22:20.213	\N	1208	ANH SỸ - VỊT	1	500000.00	0.00	\N	completed	2025-07-30 00:54:59.942	2025-07-30 00:54:59.942	percentage	0.00	0.00	0.00
738	HD004605.01	2025-07-01 06:20:14.472	\N	868	QUYỀN - TAM HOÀNG LÔ MỚI	1	13080000.00	0.00	\N	completed	2025-07-30 00:54:59.942	2025-07-30 00:54:59.942	percentage	0.00	0.00	0.00
739	HD004604	2025-07-01 06:18:56.463	\N	881	CHÚ HUỲNH - XÃ LỘ 25	1	1120000.00	1120000.00	\N	completed	2025-07-30 00:54:59.942	2025-07-30 00:54:59.942	percentage	0.00	0.00	0.00
254	HD005095	2025-07-19 08:44:30.122	\N	1205	TUYẾN DONAVET	1	100000.00	100000.00	\N	completed	2025-07-30 00:54:57.531	2025-07-30 00:54:57.531	percentage	0.00	0.00	0.00
263	HD005086	2025-07-19 06:34:59.61	\N	1139	ĐẠI LÝ TIÊN PHÚC	1	11840000.00	0.00	\N	completed	2025-07-30 00:54:57.534	2025-07-30 00:54:57.534	percentage	0.00	0.00	0.00
296	HD004919.01	2025-07-18 06:45:59.777	\N	841	ANH VƯƠNG NHẤT - TÍN NGHĨA	1	3050000.00	0.00	\N	completed	2025-07-30 00:54:57.538	2025-07-30 00:54:57.538	percentage	0.00	0.00	0.00
335	HD005011	2025-07-16 08:57:05.252	\N	889	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	2520000.00	0.00	\N	completed	2025-07-30 00:54:57.848	2025-07-30 00:54:57.848	percentage	0.00	0.00	0.00
374	HD004973	2025-07-15 06:25:47.579	\N	1052	TRẠI GÀ ĐẺ - LONG THÀNH	1	1250000.00	1250000.00	\N	completed	2025-07-30 00:54:58.103	2025-07-30 00:54:58.103	percentage	0.00	0.00	0.00
446	HD004898	2025-07-12 06:21:23.81	\N	1174	CÔ TUYẾN - TAM HOÀNG - CẦU CƯỜNG	1	1120000.00	0.00	\N	completed	2025-07-30 00:54:58.436	2025-07-30 00:54:58.436	percentage	0.00	0.00	0.00
467	HD004877.01	2025-07-11 06:23:04.09	\N	855	ANH THIÊN - TÍN NGHĨA - LÔ MỚI	1	1260000.00	1260000.00	\N	completed	2025-07-30 00:54:58.676	2025-07-30 00:54:58.676	percentage	0.00	0.00	0.00
488	HD004856	2025-07-10 14:17:08.379	\N	1210	CHỊ HUYỀN - VÕ DÕNG	1	2720000.00	2720000.00	\N	completed	2025-07-30 00:54:58.683	2025-07-30 00:54:58.683	percentage	0.00	0.00	0.00
503	HD004841	2025-07-09 16:09:13.87	\N	934	CÔ THẢO - GÀ ĐẺ  - ĐỨC HUY 12K	1	7560000.00	0.00	\N	completed	2025-07-30 00:54:58.991	2025-07-30 00:54:58.991	percentage	0.00	0.00	0.00
552	HD004792.02	2025-07-08 08:11:50.21	\N	1114	CÔ TUYẾT THU - GÀ TA - PHÚ CƯỜNG (5K) LÔ MỚI	1	4220000.00	0.00	\N	completed	2025-07-30 00:54:59.23	2025-07-30 00:54:59.23	percentage	0.00	0.00	0.00
679	HD004664	2025-07-03 06:31:58.917	TH000167	1080	CÔNG ARIVIET	1	3640000.00	0.00	\N	completed	2025-07-30 00:54:59.719	2025-07-30 00:54:59.719	percentage	0.00	0.00	0.00
703	HD004640	2025-07-02 07:45:41.16	\N	992	XUÂN ( THUÊ NGÁT)	1	7360000.00	7360000.00	\N	completed	2025-07-30 00:54:59.937	2025-07-30 00:54:59.937	percentage	0.00	0.00	0.00
740	HD1754246827011	2025-08-03 18:47:07.011	\N	874	QUÂN BIOFRAM	1	3080000.00	3080000.00	Thanh toán bằng tiền mặt	completed	2025-08-03 18:47:06.080625	2025-08-03 18:47:06.080625	percentage	0.00	0.00	0.00
743	HD1754312829160	2025-08-04 13:07:09.16	\N	932	ANH KHÁNH - VỊT - SOKLU	1	693000.00	693000.00	Thanh toán bằng chuyển khoản	completed	2025-08-04 13:07:07.43665	2025-08-04 13:07:07.43665	percentage	0.00	0.00	0.00
746	HD1754380819	2025-08-05 08:00:19.181657	\N	1170	CHÚ CHIỂU - GÀ TA - ĐỨC LONG	1	600000.00	600000.00	Thanh toán tiền mặt | 2 items | Tạo bởi: POS System | Đã thu: 600000 | Thối lại: 0.0000000000000000000000000000000000000000	completed	2025-08-05 08:00:19.181657	2025-08-05 08:00:19.181657	percentage	0.00	0.00	0.00
749	HD1754382197	2025-08-05 08:23:16.964938	\N	832	ANH HẢI (THUÝ)	1	598500.00	598500.00	POS | Tiền mặt | 2 items | Giảm 50k | VAT 5%	completed	2025-08-05 08:23:16.964938	2025-08-05 08:23:16.964938	amount	50000.00	5.00	28500.00
752	PAY1754408362	2025-08-05 15:39:21.892108	\N	833	Thắng bida (test)	1	30000000.00	30000000.00	Thu tiền nợ - trả nợ, con thiêu s  20tr	debt_payment	2025-08-05 15:39:21.892108	2025-08-05 15:39:21.892108	percentage	0.00	0.00	0.00
282	HD005066	2025-07-18 09:56:36.503	\N	1203	CHỊ LOAN ( ĐỊNH)	1	5800000.00	0.00	\N	completed	2025-07-30 00:54:57.537	2025-07-30 00:54:57.537	percentage	0.00	0.00	0.00
357	HD004989	2025-07-15 11:54:47.662	\N	1123	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	5280000.00	0.00	\N	completed	2025-07-30 00:54:58.099	2025-07-30 00:54:58.099	percentage	0.00	0.00	0.00
381	HD004966.01	2025-07-14 16:25:29.287	\N	1048	ANH TRIỆU - GIA KIỆM	1	200000.00	0.00	\N	completed	2025-07-30 00:54:58.104	2025-07-30 00:54:58.104	percentage	0.00	0.00	0.00
408	HD004938	2025-07-13 16:43:26.82	\N	1009	ANH TRƯỜNG - CẦU CƯỜNG	1	400000.00	0.00	\N	completed	2025-07-30 00:54:58.429	2025-07-30 00:54:58.429	percentage	0.00	0.00	0.00
423	HD004922	2025-07-12 15:46:33.11	\N	1123	CHỊ THÚY - GÀ ĐẺ - NINH PHÁT	1	1600000.00	0.00	\N	completed	2025-07-30 00:54:58.432	2025-07-30 00:54:58.432	percentage	0.00	0.00	0.00
444	HD004901	2025-07-12 06:54:05.963	\N	1189	ANH MINH VƯƠNG - TÍN NGHĨA	1	6560000.00	0.00	\N	completed	2025-07-30 00:54:58.435	2025-07-30 00:54:58.435	percentage	0.00	0.00	0.00
507	HD004837	2025-07-09 15:25:51.916	\N	1057	KHÁCH LẺ	1	40000.00	40000.00	\N	completed	2025-07-30 00:54:58.992	2025-07-30 00:54:58.992	percentage	0.00	0.00	0.00
535	HD004809	2025-07-08 16:35:04.012	\N	889	TRUNG - BƯU ĐIỆN - LÔ MỚI	1	1040000.00	1040000.00	\N	completed	2025-07-30 00:54:58.996	2025-07-30 00:54:58.996	percentage	0.00	0.00	0.00
696	HD004647	2025-07-02 08:49:16.029	\N	1032	ANH LÂM (5K) - TRẠI 2	1	5680000.00	0.00	\N	completed	2025-07-30 00:54:59.721	2025-07-30 00:54:59.721	percentage	0.00	0.00	0.00
741	HD1754268864323	2025-08-04 00:54:24.324	\N	932	ANH KHÁNH - VỊT - SOKLU	1	836000.00	836000.00	Thanh toán bằng chuyển khoản	completed	2025-08-04 00:54:23.328636	2025-08-04 00:54:23.328636	percentage	0.00	0.00	0.00
744	HD1754328295337	2025-08-04 17:24:55.337	\N	932	ANH KHÁNH - VỊT - SOKLU	1	660000.00	660000.00	Thanh toán bằng thẻ	completed	2025-08-04 17:24:53.98314	2025-08-04 17:24:53.98314	percentage	0.00	0.00	0.00
747	HD1754381052	2025-08-05 08:04:12.175956	\N	830	CHỊ TRINH - VĨNH CỬU 4K	1	1018500.00	1018500.00	Thanh toán tiền mặt | 2 items | Tạo bởi: POS System | Đã thu: 1018500 | Thối lại: 0.00000000000000000000	completed	2025-08-05 08:04:12.175956	2025-08-05 08:04:12.175956	amount	50000.00	5.00	48500.00
750	HD1754382269	2025-08-05 08:24:29.140906	\N	873	THÚ Y KHANH THUỶ - VĨNH CỬU	1	2430648.00	2430648.00	POS | Tiền mặt | 4 items | Giảm 7% | VAT 8%	completed	2025-08-05 08:24:29.140906	2025-08-05 08:24:29.140906	percentage	7.00	8.00	180048.00
310	HD005038	2025-07-17 11:07:21.637	\N	868	QUYỀN - TAM HOÀNG LÔ MỚI	1	700000.00	0.00	\N	completed	2025-07-30 00:54:57.844	2025-07-30 00:54:57.844	percentage	0.00	0.00	0.00
319	HD005029	2025-07-17 08:01:31.273	\N	843	CHÚ MẪN - CÚT - VÕ DÕNG	1	650000.00	650000.00	\N	completed	2025-07-30 00:54:57.845	2025-07-30 00:54:57.845	percentage	0.00	0.00	0.00
394	HD004952	2025-07-14 08:15:38.13	\N	1215	ANH TÂM ( ANH CÔNG)	1	2150000.00	0.00	\N	completed	2025-07-30 00:54:58.105	2025-07-30 00:54:58.105	percentage	0.00	0.00	0.00
521	HD004823.01	2025-07-09 08:18:13.403	\N	857	ANH ĐEN - GÀ - VÔ NHIỄM 3K	1	830000.00	0.00	\N	completed	2025-07-30 00:54:58.994	2025-07-30 00:54:58.994	percentage	0.00	0.00	0.00
722	HD004621	2025-07-01 14:47:20.637	\N	1220	ANH LÂM - TAM HOÀNG - NINH PHÁT	1	4400000.00	4180000.00	\N	completed	2025-07-30 00:54:59.94	2025-07-30 00:54:59.94	percentage	0.00	0.00	0.00
742	HD1754307855017	2025-08-04 11:44:15.017	\N	925	ANH THUỶ - VỊT - ĐỨC HUY	1	2684000.00	2684000.00	Thanh toán bằng chuyển khoản	completed	2025-08-04 11:44:13.407038	2025-08-04 11:44:13.407038	percentage	0.00	0.00	0.00
745	HD1754361111	2025-08-05 02:31:51.073582	\N	1076	ANH CHIẾN-KHÁNH	1	1890000.00	1890000.00	{"summary": "Thanh toán thẻ | VAT 5% (90000.00000000000000000000000000000000 VND) | Giảm giá 10% = 200000.000000000000 VND | Tạm tính: 2000000 VND | Thành tiền: 1890000.00000000000000000000000000000000 VND", "vat_rate": 5, "warnings": [], "created_by": "POS System", "item_count": 2, "vat_amount": 90000.00000000000000000000000000000000, "change_amount": 0.00000000000000000000000000000000, "discount_type": "percentage", "discount_value": 10, "payment_method": "card", "total_quantity": 3, "discount_amount": 200000.000000000000, "subtotal_amount": 2000000}	completed	2025-08-05 02:31:51.073582	2025-08-05 02:31:51.073582	percentage	0.00	0.00	0.00
748	HD1754381745	2025-08-05 08:15:45.23856	\N	875	NHUNG VIETVET	1	570000.00	570000.00	POS | Tiền mặt | 2 items | Giảm 50000%	completed	2025-08-05 08:15:45.23856	2025-08-05 08:15:45.23856	amount	50000.00	0.00	0.00
751	HD1754384038	2025-08-05 08:53:57.727982	\N	925	ANH THUỶ - VỊT - ĐỨC HUY	1	783000.00	783000.00	Tiền mặt | 2 items | Giảm 75k | VAT 8%	completed	2025-08-05 08:53:57.727982	2025-08-05 08:53:57.727982	amount	75000.00	8.00	58000.00
\.


--
-- Data for Name: product_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_categories (category_id, category_code, category_name, parent_category_id, level_path, description, is_active, created_at) FROM stdin;
1	FOOD	Thức ăn thú cưng	\N	\N	Thực phẩm cho chó mèo	t	2025-07-28 19:04:40.502926
2	MEDICINE	Thuốc thú y	\N	\N	Thuốc và vaccine cho động vật	t	2025-07-28 19:04:40.502926
3	EQUIPMENT	Thiết bị y tế	\N	\N	Thiết bị khám chữa bệnh	t	2025-07-28 19:04:40.502926
4	ACCESSORIES	Phụ kiện thú cưng	\N	\N	Phụ kiện chăm sóc thú cưng	t	2025-07-28 19:04:40.502926
5	SERVICE	Dịch vụ	\N	\N	Dịch vụ khám chữa bệnh	t	2025-07-28 19:04:40.502926
\.


--
-- Data for Name: product_units; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_units (product_unit_id, product_id, unit_id, conversion_rate, selling_price, is_default, created_at) FROM stdin;
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (product_id, product_code, product_name, category_id, base_unit_id, barcode, product_type, brand, origin, description, image_url, image_urls, base_price, cost_price, sale_price, current_stock, reserved_stock, available_stock, min_stock, max_stock, is_medicine, requires_prescription, storage_condition, expiry_tracking, allow_sale, track_serial, conversion_rate, unit_attributes, related_product_codes, is_active, created_at, updated_at) FROM stdin;
1426	SP000390	Kenmin LST/H120 (1000ds)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	100000.00	130000.00	1.00	0.00	1.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:49.127	2025-07-29 06:48:50.999381
1427	SP000388	#NOVA IBD (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110000.00	200000.00	19.00	0.00	19.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:49.127	2025-07-29 06:48:51.11651
1428	SP000387	KIM 18G (Vỉ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	6000.00	10000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:49.127	2025-07-29 06:48:51.216731
1429	SP000386	KIM 7x13 (Vỉ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	6000.00	10000.00	72.00	0.00	72.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:49.127	2025-07-29 06:48:51.379176
1430	SP000385	KIM 12x15 (Vỉ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	6000.00	10000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:49.127	2025-07-29 06:48:51.485904
1431	SP000384	KIM 12x13 (Vỉ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	6000.00	10000.00	23.00	0.00	23.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.371	2025-07-29 06:48:51.583438
1432	SP000383	KIM 9x13 (Vỉ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	6000.00	10000.00	16.00	0.00	16.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.372	2025-07-29 06:48:51.583438
1433	SP000382	BÓNG ÚM INTERHEAT (250w)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	30000.00	50000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.372	2025-07-29 06:48:51.583438
1434	SP000381	BÓNG ÚM INTERHEAT (175w)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	30000.00	50000.00	4.00	0.00	4.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.372	2025-07-29 06:48:51.583438
1435	SP000380	BÓNG ÚM INTERHEAT (100w)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	30000.00	50000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.372	2025-07-29 06:48:51.583438
1436	SP000379	THUỐC RUỒI (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	20000.00	30000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.373	2025-07-29 06:48:51.583438
1437	SP000378	KIM 22G GIA CẦM (Vỉ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	11500.00	15000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.373	2025-07-29 06:48:51.583438
1438	SP000377	XI LANH KIM LOẠI TC (1ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	220000.00	300000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.373	2025-07-29 06:48:51.583438
1439	SP000376	XI LANH KANGDA (1ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	150446.60	230000.00	41.00	0.00	41.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.373	2025-07-29 06:48:51.583438
1440	SP000375	XILANH VETMORE (2ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	200000.00	300000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.373	2025-07-29 06:48:51.583438
1441	SP000374	KIM ĐẬU (1Kim)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	115000.00	200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.466	2025-07-29 06:48:51.682925
1442	SP000373	NHIỆT KẾ TREO TƯỜNG	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	17000.00	25000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.466	2025-07-29 06:48:51.682925
1443	SP000372	TC CEFTI (500ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	175000.00	200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.466	2025-07-29 06:48:51.682925
1444	SP000371	TC BIO MIX VỖ BÉO HEO TAN (XÔ 5Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	250000.00	450000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.466	2025-07-29 06:48:51.682925
1445	SP000370	TC BIO LAC PLUS MAX (Hộp 1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	255000.00	380000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.467	2025-07-29 06:48:51.682925
1446	SP000369	TC BIO MAX SIÊU VỖ BÉO(Hộp 1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	198000.00	280000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.467	2025-07-29 06:48:51.682925
1447	SP000368	TC LACTIZYM CAO TỎI (Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	64976.57	100000.00	17.00	0.00	17.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.467	2025-07-29 06:48:51.682925
1448	SP000367	TC MULTIVITA (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	76000.00	120000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.467	2025-07-29 06:48:51.682925
1449	SP000366	TC VITAMIN C 20% (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	70000.00	90000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.467	2025-07-29 06:48:51.682925
1450	SP000365	TC NEO MEN BÀO TỬ (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	130000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.467	2025-07-29 06:48:51.682925
1451	SP000364	TC FENBEN ORAL (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	220000.00	300000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.576	2025-07-29 06:48:51.793556
1452	SP000363	TC BROM HERBAR (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	170000.00	250000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.576	2025-07-29 06:48:51.793556
1453	SP000362	TC SULPHAMONO 80/20 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1300000.00	1800000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.576	2025-07-29 06:48:51.793556
1454	SP000361	TC TYLVALOSIN 625 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1680000.00	2000000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.576	2025-07-29 06:48:51.793556
1455	SP000360	TC FLO MAX 30% ORAL (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	690000.00	1100000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.576	2025-07-29 06:48:51.793556
1456	SP000359	TC AMOX COLIS 64 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1000000.00	1250000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.576	2025-07-29 06:48:51.793556
1457	SP000358	TC DOXY 75% (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1720000.00	2200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.577	2025-07-29 06:48:51.793556
1458	SP000357	TC FLO MAX 50% (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	800000.00	1400000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.577	2025-07-29 06:48:51.793556
1459	SP000356	TC TILMI SOLUTION 25% (1 lít)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	650000.00	1100000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.577	2025-07-29 06:48:51.793556
1460	SP000355	VV TAVET FLODOX 30 (lít)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	980000.00	1200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.577	2025-07-29 06:48:51.793556
1461	SP000354	VV DIATRIM TAV 50 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	590000.00	800000.00	10.00	0.00	10.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.689	2025-07-29 06:48:51.906428
1462	SP000353	VV TAV AMCO (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	900000.00	1100000.00	17.00	0.00	17.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.689	2025-07-29 06:48:51.906428
1463	SP000352	VV AMOXCO TAV 50 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	900000.00	1100000.00	4.00	0.00	4.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.689	2025-07-29 06:48:51.906428
1464	SP000351	VV TILMI 25% TAV (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	900000.00	1200000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.689	2025-07-29 06:48:51.906428
1465	SP000349	VV METIOSITOL TAV (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	210000.00	250000.00	19.00	0.00	19.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.689	2025-07-29 06:48:51.906428
1466	SP000348	VV AMOXCO TAV 625 (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	100000.00	150000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.689	2025-07-29 06:48:51.906428
1467	SP000347	VV AMOXCO TAV 625 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	980000.00	1200000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.69	2025-07-29 06:48:51.906428
1468	SP000346	VV VITAMINO TAV (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	210000.00	250000.00	12.00	0.00	12.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.69	2025-07-29 06:48:51.906428
1469	SP000345	VV ANTIVIUS-TAV (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	120000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.69	2025-07-29 06:48:51.906428
1470	SP000344	VV ANTIVIUS-TAV (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	650000.00	800000.00	44.00	0.00	44.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.69	2025-07-29 06:48:51.906428
1471	SP000343	VV FLOBROM-TAV 30% (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1054000.00	1300000.00	17.00	0.00	17.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.812	2025-07-29 06:48:52.032594
1472	SP000342	VV CALCI PLUS-TAV (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	130000.00	180000.00	12.00	0.00	12.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.812	2025-07-29 06:48:52.032594
1473	SP000341	VV AMPRO-TAV 20% (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	444098.36	600000.00	35.00	0.00	35.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.812	2025-07-29 06:48:52.032594
1474	SP000340	VV ENROFLOXACINA-TAV 20% (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	450000.00	600000.00	8.00	0.00	8.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.813	2025-07-29 06:48:52.032594
1475	SP000339	VV DOXI TAV 50 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1500000.00	1700000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.813	2025-07-29 06:48:52.032594
1476	SP000338	VV SULTRIM 50 TAV (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	980000.00	1400000.00	13.00	0.00	13.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.813	2025-07-29 06:48:52.032594
1477	SP000337	VV BENGLUXIDE (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	120000.00	37.00	0.00	37.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.813	2025-07-29 06:48:52.032594
1478	SP000336	VV OXOLIN (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	712500.00	950000.00	14.00	0.00	14.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.813	2025-07-29 06:48:52.032594
1479	SP000335	VV APRAMYCIN 50 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1100000.00	1300000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.813	2025-07-29 06:48:52.032594
1480	SP000334	VV ERYTHOMYCIN 50% (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1000000.00	1200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.813	2025-07-29 06:48:52.032594
1501	SP000313	VV ENROCIN 500 WSP (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	70000.00	100000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.121	2025-07-29 06:48:52.337936
1502	SP000312	VV ENROCIN 500 WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	690000.00	900000.00	25.00	0.00	25.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.121	2025-07-29 06:48:52.337936
1503	SP000311	VV LINCOCIN 50 WSP (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	120000.00	150000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.121	2025-07-29 06:48:52.337936
1504	SP000309	VV FLOCOL 50 WSP (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	120000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.121	2025-07-29 06:48:52.337936
1505	SP000308	VV FLOCOL 50 WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	745000.00	1200000.00	37.00	0.00	37.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.121	2025-07-29 06:48:52.337936
1506	SP000307	VV DOXICLIN 50 WSP (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	86952.18	120000.00	4.00	0.00	4.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.122	2025-07-29 06:48:52.337936
1507	SP000306	VV DOXICLIN 50 WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	876218.17	1200000.00	30.00	0.00	30.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.122	2025-07-29 06:48:52.337936
1508	SP000305	VV BUTAPHOS PRO (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	191538.46	250000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.122	2025-07-29 06:48:52.337936
1509	SP000304	VV CHYMOSIN (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	310000.00	600000.00	9.00	0.00	9.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.122	2025-07-29 06:48:52.337936
1510	SP000303	AMOXICOL 50 WSP (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	65000.00	100000.00	4.00	0.00	4.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.122	2025-07-29 06:48:52.337936
1531	SP000279	VV ANTICOC W.S.P (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	40000.00	60000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.441	2025-07-29 06:48:52.657574
1532	SP000278	VV BIOTIN PLUS (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	80000.00	26.00	0.00	26.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.441	2025-07-29 06:48:52.657574
1533	SP000277	VV ANALGIN - C 10% (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	97500.00	110000.00	20.00	0.00	20.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.441	2025-07-29 06:48:52.657574
1534	SP000276	VV VITLYTE C (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	54500.00	80000.00	22.00	0.00	22.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.441	2025-07-29 06:48:52.657574
1535	SP000275	VV ENROVET INJ (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	28000.00	40000.00	83.00	0.00	83.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.442	2025-07-29 06:48:52.657574
1536	SP000274	VV DEXASONE (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	23000.00	50000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.443	2025-07-29 06:48:52.657574
1537	SP000273	VV INVERMECTIN (20ML)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	17000.00	80000.00	20.00	0.00	20.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.443	2025-07-29 06:48:52.657574
1538	SP000272	VV FOSTOSAL (100ML)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	49000.00	70000.00	79.00	0.00	79.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.443	2025-07-29 06:48:52.657574
1539	SP000271	VV BROMHEXINE (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	15000.00	30000.00	44.00	0.00	44.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.444	2025-07-29 06:48:52.657574
1540	SP000270	VV FLODOX SONE (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	74000.00	110000.00	55.00	0.00	55.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.444	2025-07-29 06:48:52.657574
1561	SP000247	TT 01 (250ML)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	380000.00	430000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.741	2025-07-29 06:48:52.957483
1562	SP000246	TG CHYMOTRY (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	100000.00	9.00	0.00	9.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.741	2025-07-29 06:48:52.957483
1563	SP000245	TG-TIMISOL 25 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	712000.00	850000.00	13.00	0.00	13.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.741	2025-07-29 06:48:52.957483
1564	SP000244	TG-DICLASOL 2.5 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	463000.00	600000.00	15.00	0.00	15.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.742	2025-07-29 06:48:52.957483
1565	SP000243	TG-AMPUSOL 20 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	463000.00	600000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.742	2025-07-29 06:48:52.957483
1566	SP000242	TG-ENROSOL 20 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	393000.00	500000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.742	2025-07-29 06:48:52.957483
1567	SP000241	TG-FLOSOL 30 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	755000.00	1100000.00	8.00	0.00	8.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.743	2025-07-29 06:48:52.957483
1568	SP000240	TG-COLI 500 (1Kg) (10:1)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	406000.00	550000.00	7.00	0.00	7.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.744	2025-07-29 06:48:52.957483
1569	SP000239	TG-GENDOX (1Kg) (10:1)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1446000.00	1650000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.745	2025-07-29 06:48:52.957483
1570	SP000238	TG-LINSPEC (1KG) (XÁ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	236000.00	400000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.745	2025-07-29 06:48:52.957483
1591	SP000217	#TG IBD M+ (2000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	292153.00	400000.00	83.00	0.00	83.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.048	2025-07-29 06:48:53.264658
1592	SP000216	#VAKSIMUNE CLON IB (500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	73500.00	100000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.048	2025-07-29 06:48:53.264658
1593	SP000215	#TG VAKSIMUNE CLON IB (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110000.00	130000.00	33.00	0.00	33.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.048	2025-07-29 06:48:53.264658
1594	SP000214	#TG VAKSIMUNE CLON IB (2000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	177000.00	220000.00	24.00	0.00	24.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.048	2025-07-29 06:48:53.264658
1595	SP000213	CID 2000 (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	923333.33	1100000.00	4.00	0.00	4.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.048	2025-07-29 06:48:53.264658
1596	SP000212	BIO-BROM W.S.P (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	80000.00	100000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.049	2025-07-29 06:48:53.264658
1597	SP000211	ACIFY(AXIT HỮU CƠ) (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	137000.00	250000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.049	2025-07-29 06:48:53.264658
1598	SP000210	VIRBAC - AVICOC (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	550000.00	700000.00	8.00	0.00	8.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.049	2025-07-29 06:48:53.264658
1599	SP000209	AGR DOXYCURE 50% (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1000000.00	1200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.049	2025-07-29 06:48:53.264658
1600	SP000208	HYDRO DOXX (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1150000.00	1450000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.049	2025-07-29 06:48:53.264658
1621	SP000187	#KHÁNG THỂ VIÊM GAN VỊT NAVETCO(K.T.G) (500ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	110000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.372	2025-07-29 06:48:53.589531
1623	SP000185	#SCOCVAC 4( TQ)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	275000.00	650000.00	59.00	0.00	59.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.372	2025-07-29 06:48:53.589531
1624	SP000184	KHÁNG THỂ REO	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	170000.00	0.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.373	2025-07-29 06:48:53.589531
1625	SP000183	CEFOTAXIM (lọ 2g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	12416.00	30000.00	-145.00	0.00	-145.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.373	2025-07-29 06:48:53.589531
1626	SP000182	CEFOTAXIM (Bột 2g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	9200.00	30000.00	6082.00	0.00	6082.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.373	2025-07-29 06:48:53.589531
1627	SP000181	#ND-IB-H9 (250ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	195000.00	450000.00	137.00	0.00	137.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.373	2025-07-29 06:48:53.589531
1628	SP000180	#ECOLI,BẠI HUYẾT RINGPU (250ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	175000.00	250000.00	79.00	0.00	79.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.373	2025-07-29 06:48:53.589531
1629	SP000179	Kháng Thể Ringpu (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	220000.00	350000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.373	2025-07-29 06:48:53.589531
1481	SP000333	VV OXYVET 50 (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	40000.00	50000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.919	2025-07-29 06:48:52.133925
1482	SP000332	VV OXYVET 50 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	280000.00	450000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.919	2025-07-29 06:48:52.133925
1483	SP000331	VV NEOCIN 500 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	450000.00	650000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.92	2025-07-29 06:48:52.133925
1484	SP000330	VV AMPI 50 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	700000.00	900000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.92	2025-07-29 06:48:52.133925
1485	SP000329	VV BETA GIUCAN 50 (1KG)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	209400.00	250000.00	14.00	0.00	14.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.92	2025-07-29 06:48:52.133925
1486	SP000328	VV TIAMULIN 50 (1KG)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	800000.00	950000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.92	2025-07-29 06:48:52.133925
1487	SP000327	VV FOSTYVET 50 (1KG)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1050000.00	1250000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.92	2025-07-29 06:48:52.133925
1488	SP000326	VV NORLOX 50 (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	80000.00	100000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.92	2025-07-29 06:48:52.133925
1489	SP000325	VV NORLOX 50 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	765000.00	950000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.92	2025-07-29 06:48:52.133925
1490	SP000324	VV SULTRIM (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	485000.00	700000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:50.921	2025-07-29 06:48:52.133925
1511	SP000302	VV AMOXCOLI 50 WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	629992.34	900000.00	16.00	0.00	16.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.235	2025-07-29 06:48:52.451613
1512	SP000301	VV AMOXIN 50 WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	565000.00	700000.00	16.00	0.00	16.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.236	2025-07-29 06:48:52.451613
1513	SP000299	VV Pro One (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	162500.00	250000.00	24.00	0.00	24.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.236	2025-07-29 06:48:52.451613
1514	SP000298	VV NYSTATIN (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	226000.00	280000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.236	2025-07-29 06:48:52.451613
1515	SP000297	VV SELEN PLUS (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	210000.00	250000.00	12.00	0.00	12.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.236	2025-07-29 06:48:52.451613
1516	SP000296	VV FLUCONAZOL (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	262500.00	400000.00	10.00	0.00	10.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.236	2025-07-29 06:48:52.451613
1517	SP000295	VV DICLACOC (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	395000.00	600000.00	-1.00	0.00	-1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.236	2025-07-29 06:48:52.451613
1518	SP000293	VV TYLODOX WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	795000.00	950000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.236	2025-07-29 06:48:52.451613
1519	SP000292	VV COLIS 50 WSP (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	30000.00	50000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.238	2025-07-29 06:48:52.451613
1520	SP000291	VV COLIS 50 WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	300000.00	450000.00	10.00	0.00	10.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.239	2025-07-29 06:48:52.451613
1541	SP000268	VV ANALGIN (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	25697.39	35000.00	62.00	0.00	62.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.539	2025-07-29 06:48:52.758448
1542	SP000267	VV GENTA-TYLO (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	79000.00	100000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.539	2025-07-29 06:48:52.758448
1543	SP000266	VV GENTAVET INJ (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	74000.00	100000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.539	2025-07-29 06:48:52.758448
1544	SP000265	VV PEN-STREP (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	98800.00	120000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.539	2025-07-29 06:48:52.758448
1545	SP000264	VV MARBOCIN (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	211600.00	250000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.54	2025-07-29 06:48:52.758448
1546	SP000263	VV LINCO-SPEC INJ (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	72500.00	120000.00	90.00	0.00	90.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.54	2025-07-29 06:48:52.758448
1547	SP000262	VV CEFAXIM (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	265000.00	290000.00	111.00	0.00	111.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.54	2025-07-29 06:48:52.758448
1548	SP000261	VV CEFTI-S - NEW (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	359999.95	390000.00	94.00	0.00	94.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.54	2025-07-29 06:48:52.758448
1549	SP000260	VV CEFTI-S (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	247500.00	290000.00	122.00	0.00	122.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.54	2025-07-29 06:48:52.758448
1550	SP000259	TG UK ANTISEP 250 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110000.00	140000.00	11.00	0.00	11.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.54	2025-07-29 06:48:52.758448
1571	SP000237	TG-OXY 50 (1Kg) (10:1)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	420000.00	650000.00	8.00	0.00	8.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.839	2025-07-29 06:48:53.051694
1572	SP000236	TG - AMPICOLI 500 (1KG) (XÁ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	840000.00	950000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.839	2025-07-29 06:48:53.051694
1573	SP000235	TG-DOXY 500 (1Kg)(10:1)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1265000.00	1700000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.839	2025-07-29 06:48:53.051694
1574	SP000234	TG TRISULPHA (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1336000.00	1500000.00	8.00	0.00	8.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.839	2025-07-29 06:48:53.051694
1575	SP000233	TG TRISULPHA (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	135428.57	150000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.839	2025-07-29 06:48:53.051694
1576	SP000232	TG SUPER-VITAMINO (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	191180.72	250000.00	19.00	0.00	19.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.839	2025-07-29 06:48:53.051694
1577	SP000231	TG DICLASOL HI (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	702000.00	800000.00	24.00	0.00	24.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.839	2025-07-29 06:48:53.051694
1578	SP000230	TG GOOD HEPA (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	360000.00	450000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.84	2025-07-29 06:48:53.051694
1579	SP000229	#VACEN CHÓ (HIPRA)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	70000.00	90000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.84	2025-07-29 06:48:53.051694
1580	SP000228	#VACEN CHÓ (TIGER)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	70000.00	90000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.84	2025-07-29 06:48:53.051694
1601	SP000207	HEPARENOL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	380000.00	400000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.148	2025-07-29 06:48:53.370767
1602	SP000206	PHOSRETIC (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	630000.00	680000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.149	2025-07-29 06:48:53.370767
1603	SP000205	#NEMOVAC (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	240000.00	260000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.149	2025-07-29 06:48:53.370767
1604	SP000204	COCCRIROL (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	570000.00	600000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.149	2025-07-29 06:48:53.370767
1605	SP000203	ACID-PAR 4WAY (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	480000.00	600000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.149	2025-07-29 06:48:53.370767
1606	SP000202	PERMASOL 500 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	180000.00	200000.00	123.00	0.00	123.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.149	2025-07-29 06:48:53.370767
1607	SP000201	#IB4/91 (2500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	650583.47	850000.00	19.00	0.00	19.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.149	2025-07-29 06:48:53.370767
1608	SP000200	#IB4/91 (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	405000.00	450000.00	8.00	0.00	8.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.15	2025-07-29 06:48:53.370767
1609	SP000199	#MSD ILT (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	248500.00	260000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.15	2025-07-29 06:48:53.370767
1610	SP000198	#ND CLON 30 (2500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	205000.00	240000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.15	2025-07-29 06:48:53.370767
1631	SP000177	#RỤT MỎ RINGPU (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	108000.01	180000.00	173.00	0.00	173.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.474	2025-07-29 06:48:53.691393
1632	SP000176	#RỤT MỎ SINDER + REO (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	103000.00	180000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.474	2025-07-29 06:48:53.691393
1491	SP000323	VV MONOSULTRIM 60 (1KG)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	785000.00	1300000.00	32.00	0.00	32.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.018	2025-07-29 06:48:52.240286
1492	SP000322	VV FLOR-MAX (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	725172.41	950000.00	22.00	0.00	22.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.018	2025-07-29 06:48:52.240286
1493	SP000321	VV FLODOX 30 (100G)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	70000.00	100000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.018	2025-07-29 06:48:52.240286
1494	SP000320	VV FLODOXY 30 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	669285.71	1000000.00	11.00	0.00	11.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.019	2025-07-29 06:48:52.240286
1495	SP000319	VV FLODOX 30 (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	680019.24	1000000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.019	2025-07-29 06:48:52.240286
1496	SP000318	VV TYLOSIN 50 WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	755000.00	950000.00	7.00	0.00	7.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.019	2025-07-29 06:48:52.240286
1497	SP000317	VV TILMI 250 ORAL (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	640000.00	800000.00	24.00	0.00	24.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.019	2025-07-29 06:48:52.240286
1498	SP000316	VV CFOXIN (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	100000.00	150000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.019	2025-07-29 06:48:52.240286
1499	SP000315	VV CFOXIN (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	965000.00	1300000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.019	2025-07-29 06:48:52.240286
1500	SP000314	VV CEPHAXIN 50 WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1004812.42	1300000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.02	2025-07-29 06:48:52.240286
1521	SP000290	VV ENROVET ORAL (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	395000.00	500000.00	9.00	0.00	9.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.335	2025-07-29 06:48:52.547244
1522	SP000289	VV AMOXICOL 20 W.S.P (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	383705.66	500000.00	20.00	0.00	20.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.335	2025-07-29 06:48:52.547244
1523	SP000288	VV COTRIM-F (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	350000.00	650000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.335	2025-07-29 06:48:52.547244
1524	SP000287	VV CALCI PLUS (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	102500.00	120000.00	12.00	0.00	12.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.335	2025-07-29 06:48:52.547244
1525	SP000286	VV PARA 10WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	67500.00	100000.00	24.00	0.00	24.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.335	2025-07-29 06:48:52.547244
1526	SP000285	VV BROMHEXIN WSP(1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	65000.00	100000.00	63.00	0.00	63.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.336	2025-07-29 06:48:52.547244
1527	SP000284	VV VITAMIN K3 0,5% (1Kg) XÁ	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	56500.00	80000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.336	2025-07-29 06:48:52.547244
1528	SP000282	VV METISOL (1Lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	92500.00	120000.00	8.00	0.00	8.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.336	2025-07-29 06:48:52.547244
1529	SP000281	VV SORBININ+B12 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	49000.00	80000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.336	2025-07-29 06:48:52.547244
1530	SP000280	VV GLUCO K+C (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	49000.00	80000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.336	2025-07-29 06:48:52.547244
1551	SP000258	TG BUTAPHO (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	188000.00	280000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.644	2025-07-29 06:48:52.857115
1552	SP000257	TG CHYMOTRY (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	302000.00	600000.00	17.00	0.00	17.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.644	2025-07-29 06:48:52.857115
1553	SP000256	TG LIVER COOL (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	750000.00	950000.00	7.00	0.00	7.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.645	2025-07-29 06:48:52.857115
1554	SP000255	TG LIVER COOL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	188000.00	230000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.645	2025-07-29 06:48:52.857115
1555	SP000254	TG PARAVIT C (1Kg) (XÁ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	164000.00	200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.645	2025-07-29 06:48:52.857115
1556	SP000253	TIGER-ADE MEN (1Kg) (10:1)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	120000.00	150000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.645	2025-07-29 06:48:52.857115
1557	SP000252	TG NUTRILACZYM (1Kg) (XÁ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	92000.00	140000.00	29.00	0.00	29.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.645	2025-07-29 06:48:52.857115
1558	SP000251	TIGER-PAKWAY (1Kg) (XÁ)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	83000.00	120000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.645	2025-07-29 06:48:52.857115
1559	SP000250	TIGER-VITAMIN C 30% (1KG) (10:1)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110000.00	130000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.646	2025-07-29 06:48:52.857115
1560	SP000248	TG TT 02 (250ML)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	365000.00	450000.00	19.00	0.00	19.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.646	2025-07-29 06:48:52.857115
1581	SP000227	#TG CORYZA LE (500ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	849925.82	1050000.00	17.00	0.00	17.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.934	2025-07-29 06:48:53.161273
1582	SP000226	#TG ILT (2000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	328000.00	420000.00	19.00	0.00	19.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.934	2025-07-29 06:48:53.161273
1583	SP000225	#TG ILT (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	183000.00	220000.00	10.00	0.00	10.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.934	2025-07-29 06:48:53.161273
1584	SP000224	#TG TẢ + CÚM (500ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	970000.00	1300000.00	36.00	0.00	36.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.935	2025-07-29 06:48:53.161273
1585	SP000223	#TG AI H9 (500ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	860000.00	1100000.00	70.00	0.00	70.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.935	2025-07-29 06:48:53.161273
1586	SP000222	#VAKSIMUNE POX (500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.935	2025-07-29 06:48:53.161273
1587	SP000221	#TG POX (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	169500.00	220000.00	9.00	0.00	9.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.935	2025-07-29 06:48:53.161273
1588	SP000220	#VAKSIMUNE ND L INAKTIF - G7 (500ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	717000.00	850000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.935	2025-07-29 06:48:53.161273
1589	SP000219	#VAKSIMUNE ND INAKTIF (500ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	618000.00	750000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.935	2025-07-29 06:48:53.161273
1590	SP000218	#TG IBD M+ (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	206000.00	250000.00	36.00	0.00	36.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:51.936	2025-07-29 06:48:53.161273
1612	SP000196	#GUMBORO D78 (2500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	390000.00	500000.00	12.00	0.00	12.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.272	2025-07-29 06:48:53.484799
1613	SP000195	#GUMBORO 228E (2500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	545000.00	650000.00	33.00	0.00	33.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.272	2025-07-29 06:48:53.484799
1614	SP000194	#GUMBORO 228E (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	235000.00	300000.00	4.00	0.00	4.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.272	2025-07-29 06:48:53.484799
1615	SP000193	#MAX 5CLON30 (5000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	420000.00	540000.00	21.00	0.00	21.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.272	2025-07-29 06:48:53.484799
1616	SP000192	#MAX 5CLON30 (2500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	225000.00	280000.00	36.00	0.00	36.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.273	2025-07-29 06:48:53.484799
1617	SP000191	#MAX 5CLON30 (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	160000.00	200000.00	10.00	0.00	10.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.273	2025-07-29 06:48:53.484799
1618	SP000190	#NEWCAVAC (500ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	755000.00	900000.00	2.00	0.00	2.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.273	2025-07-29 06:48:53.484799
1619	SP000189	VMD SEPTRYL 240 - Vemedim (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	33740.74	40000.00	158.00	0.00	158.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.273	2025-07-29 06:48:53.484799
1620	SP000188	#INTERFERON (10ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110000.00	150000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.273	2025-07-29 06:48:53.484799
1641	SP000167	#DỊCH TẢ VỊT- AVAC (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	54000.00	70000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.575	2025-07-29 06:48:53.789102
1651	SP000156	CATAXIM (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	340000.00	350000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.678	2025-07-29 06:48:53.895377
1652	SP000155	PAXXCELL(10g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	910000.00	1100000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.678	2025-07-29 06:48:53.895377
1653	SP000154	PAXXCELL (4g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	430000.00	450000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.678	2025-07-29 06:48:53.895377
1654	SP000153	TĂNG TỐC (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110000.00	140000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.678	2025-07-29 06:48:53.895377
1655	SP000152	TOPCIN LINCOPEC 44 (Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	940000.00	1400000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.679	2025-07-29 06:48:53.895377
1656	SP000151	TOPCIN VỖ BÉO DỊCH TRÙN QUẾ (5lit))	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	684000.00	800000.00	4.00	0.00	4.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.679	2025-07-29 06:48:53.895377
1657	SP000150	TOPCIN POVIDINE 10% (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	88000.00	120000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.679	2025-07-29 06:48:53.895377
1658	SP000149	TOPCIN DOXCOLIS 5000 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	980000.00	1200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.679	2025-07-29 06:48:53.895377
1659	SP000148	TOPCIN TYLOMAX WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	690000.00	1200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.679	2025-07-29 06:48:53.895377
1660	SP000147	TOPCIN MAXFLO WSP 50% (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	670000.00	1200000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.679	2025-07-29 06:48:53.895377
1681	SP000125	AGR ANTISEPTIC (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	180000.00	200000.00	9.00	0.00	9.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.989	2025-07-29 06:48:54.207837
1682	SP000124	AGR SEPTICA (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	360000.00	500000.00	5.00	0.00	5.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.989	2025-07-29 06:48:54.207837
1683	SP000123	AGR SEPTICA (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	81000.00	120000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.99	2025-07-29 06:48:54.207837
1684	SP000122	AGR PVP IODINE 10% (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	460000.00	700000.00	12.00	0.00	12.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.99	2025-07-29 06:48:54.207837
1685	SP000121	IODOFOR 300 (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	616000.00	950000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.99	2025-07-29 06:48:54.207837
1686	SP000120	IODOFOR 300 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	130000.00	200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.99	2025-07-29 06:48:54.207837
1687	SP000119	FARM CLEAN (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	21000.00	30000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.99	2025-07-29 06:48:54.207837
1688	SP000118	AGR BKT CLEAN (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	50000.00	70000.00	17.00	0.00	17.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.99	2025-07-29 06:48:54.207837
1689	SP000117	AGR HERBAL OIL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	265000.00	550000.00	14.00	0.00	14.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.991	2025-07-29 06:48:54.207837
1690	SP000116	AGR ANTIGUM PLUS (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110000.00	120000.00	20.00	0.00	20.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.991	2025-07-29 06:48:54.207837
1711	SP000094	AGR LACTO-MAX PLUS (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	120000.00	180000.00	24.00	0.00	24.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.315	2025-07-29 06:48:54.539176
1712	SP000093	AGR LACTO-MAXAG (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	116000.00	130000.00	16.00	0.00	16.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.315	2025-07-29 06:48:54.539176
1713	SP000092	AGR GLUCO KC (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	80000.00	12.00	0.00	12.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.316	2025-07-29 06:48:54.539176
1714	SP000091	AGR BMD WSP (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	2081000.00	2500000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.316	2025-07-29 06:48:54.539176
1715	SP000090	AGR--SULFA PLUS (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1138000.00	1400000.00	43.00	0.00	43.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.316	2025-07-29 06:48:54.539176
1716	SP000089	AGR PERMETHRIN PLUS (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	50000.00	70000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.316	2025-07-29 06:48:54.539176
1717	SP000088	AGR FUGACA (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	229000.00	300000.00	9.00	0.00	9.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.316	2025-07-29 06:48:54.539176
1718	SP000087	AGR NYSTATIN (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	228000.00	280000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.316	2025-07-29 06:48:54.539176
1719	SP000086	AGR VETCOX (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	448000.00	550000.00	8.00	0.00	8.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.316	2025-07-29 06:48:54.539176
1720	SP000085	AGR ESB 300 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	615000.00	750000.00	12.00	0.00	12.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.317	2025-07-29 06:48:54.539176
1741	SP000063	AGR TRISUL INJ (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	95000.00	120000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.65	2025-07-29 06:48:54.868734
1742	SP00006	AGR GENTA - CEFOR INJ (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	288000.00	350000.00	21.00	0.00	21.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.65	2025-07-29 06:48:54.868734
1743	SP000061	AG - 003 GENTA - CEFOR INJ (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	102000.00	160000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.65	2025-07-29 06:48:54.868734
1744	SP000060	AG - 002 TRISUL - CETI (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	239000.00	320000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.65	2025-07-29 06:48:54.868734
1745	SP000059	AG - 002 TRISUL - CETI (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	100100.00	150000.00	24.00	0.00	24.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.65	2025-07-29 06:48:54.868734
1746	SP000058	AG - 001 CEFTRIMAX (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	310200.00	380000.00	12.00	0.00	12.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.651	2025-07-29 06:48:54.868734
1747	SP000057	AG - 001 CEFTRIMAX (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	130000.00	160000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.651	2025-07-29 06:48:54.868734
1748	SP000056	COCCIVET (5000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	2500000.00	2800000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.651	2025-07-29 06:48:54.868734
1749	SP000055	AGR COCCIVET (2000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1000000.00	1500000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.651	2025-07-29 06:48:54.868734
1771	SP000026	TT ECO - TERRA EGG (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	183000.00	240000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.024	2025-07-29 06:48:55.241011
1772	SP000022	TT ECO BROM (1Kg) (10:1)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	109000.00	160000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.024	2025-07-29 06:48:55.241011
1773	SP000014	INTERGREEN ASPISURE 50% (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	160000.00	250000.00	41.00	0.00	41.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.024	2025-07-29 06:48:55.241011
1774	SP000013	NOVAVETER NEO TATIN (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	260000.00	350000.00	35.00	0.00	35.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.024	2025-07-29 06:48:55.241011
1775	SP000012	NOVAVETER PARADOL K,C (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	121000.00	160000.00	47.00	0.00	47.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.024	2025-07-29 06:48:55.241011
1776	SP000011	NOVAVETER TOP BACILL (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	105000.00	140000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.024	2025-07-29 06:48:55.241011
1777	SP000010	NOVAVETER VIT 5B MAX (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	80000.00	100000.00	-1.00	0.00	-1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.025	2025-07-29 06:48:55.241011
1778	SP000009	NOVAVETER VIT C MAX (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	70000.00	90000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.025	2025-07-29 06:48:55.241011
1779	SP000008	NOVAVETER VITAMINO (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1285000.00	1500000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.025	2025-07-29 06:48:55.241011
1780	SP000007	NOVAVETER BUTATOXIN (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	460000.00	650000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.025	2025-07-29 06:48:55.241011
1782	SP000005	NOVAVETER DICLASOL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	611000.00	800000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.134	2025-07-29 06:48:55.563391
1750	SP000054	AGR GENTACIN (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	48300.00	100000.00	104.00	0.00	105.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.651	2025-07-29 06:48:54.868734
1633	SP000175	#RỤT MỎ SINDER (500ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	135000.00	250000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.474	2025-07-29 06:48:53.691393
1634	SP000174	#RỤT MỎ SINDER (250ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	86000.00	150000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.475	2025-07-29 06:48:53.691393
1635	SP000173	#TEMBUSU CHẾT (250ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	265003.17	400000.00	15.00	0.00	15.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.475	2025-07-29 06:48:53.691393
1636	SP000172	#TEMBUSU SỐNG DOBIO (500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	146197.47	300000.00	244.00	0.00	244.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.475	2025-07-29 06:48:53.691393
1637	SP000171	#TEMBUSU SỐNG PALVI (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	74764.98	350000.00	128.00	0.00	128.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.475	2025-07-29 06:48:53.691393
1638	SP000170	#REO VIRUT (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	68082.08	250000.00	49.00	0.00	49.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.475	2025-07-29 06:48:53.691393
1639	SP000169	#REO VIRUT (500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	68000.00	150000.00	88.00	0.00	88.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.475	2025-07-29 06:48:53.691393
1661	SP000146	TOPCIN CHYMOSIN (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	427089.00	600000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.778	2025-07-29 06:48:53.996928
1662	SP000145	TOPCIN DEXA (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	36049.00	50000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.779	2025-07-29 06:48:53.996928
1663	SP000144	ORESOL (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	57000.00	90000.00	25.00	0.00	25.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.779	2025-07-29 06:48:53.996928
1664	SP000143	TOPCIN POVIDINE 10% (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	532000.00	700000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.779	2025-07-29 06:48:53.996928
1665	SP000142	TOPCIN ULTRACID 2.0 (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	355000.00	500000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.779	2025-07-29 06:48:53.996928
1666	SP000141	TOPCIN ULTRACID 2.0 (lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	91650.00	120000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.779	2025-07-29 06:48:53.996928
1667	SP000140	TOPCIN TC5 PLUS (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	357000.00	500000.00	4.00	0.00	4.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.779	2025-07-29 06:48:53.996928
1668	SP000139	TOPCIN TC5 PLUS (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	91000.00	120000.00	9.00	0.00	9.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.779	2025-07-29 06:48:53.996928
1669	SP000138	TOPCIN BCOMPLEX C (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	61700.00	100000.00	27.00	0.00	27.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.78	2025-07-29 06:48:53.996928
1670	SP000137	TOPCIN HEPATOL (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	70265.00	90000.00	30.00	0.00	30.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.78	2025-07-29 06:48:53.996928
1691	SP000115	AGR PARA C (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110032.26	140000.00	16.00	0.00	16.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.098	2025-07-29 06:48:54.319628
1692	SP000114	AGR BROM- MAX (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	98000.00	120000.00	28.00	0.00	28.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.098	2025-07-29 06:48:54.319628
1693	SP000113	AGR BIOTIN (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	120000.00	14.00	0.00	14.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.098	2025-07-29 06:48:54.319628
1694	SP000112	AMINOVIT (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	115000.00	150000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.098	2025-07-29 06:48:54.319628
1695	SP000111	AGR MILK PLUS (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	98000.00	120000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.098	2025-07-29 06:48:54.319628
1696	SP000110	AGR CALPHOS PLUS (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	340000.00	600000.00	10.00	0.00	10.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.098	2025-07-29 06:48:54.319628
1697	SP000109	AGR CALPHOS PLUS (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	84000.00	120000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.099	2025-07-29 06:48:54.319628
1698	SP000108	AGR VITAMIN C150 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	65000.00	90000.00	22.00	0.00	22.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.099	2025-07-29 06:48:54.319628
1699	SP000107	AGR LIVERSOL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	86000.00	120000.00	18.00	0.00	18.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.099	2025-07-29 06:48:54.319628
1700	SP000106	AGR EGG POWDER (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	122000.00	160000.00	13.00	0.00	13.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.099	2025-07-29 06:48:54.319628
1721	SP000084	AGR DICLAZU PLUS (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	586000.00	700000.00	13.00	0.00	13.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.434	2025-07-29 06:48:54.649139
1722	SP000083	AGR LINSPEC (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1296000.00	1500000.00	37.00	0.00	37.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.435	2025-07-29 06:48:54.649139
1723	SP000082	AGR DOXYCOL (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1198000.00	1450000.00	13.00	0.00	13.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.435	2025-07-29 06:48:54.649139
1724	SP000081	AGR TYLODOX PLUS (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	754000.00	950000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.435	2025-07-29 06:48:54.649139
1725	SP000080	AGR AMOXICOL POWDER (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	949000.00	1100000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.435	2025-07-29 06:48:54.649139
1726	SP000079	AGR ENROSOL 20 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	333000.00	500000.00	38.00	0.00	38.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.435	2025-07-29 06:48:54.649139
1727	SP000078	AGR FLODOX 300 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	941528.57	1200000.00	52.00	0.00	52.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.436	2025-07-29 06:48:54.649139
1728	SP000077	AGR TRIMETHOSOL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	713000.00	850000.00	14.00	0.00	14.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.436	2025-07-29 06:48:54.649139
1729	SP000075	AGR SELKO®-4 HEALTH (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	933000.00	1200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.436	2025-07-29 06:48:54.649139
1730	SP000074	AGR SELKO®-4 HEALTH (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	193000.00	250000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.437	2025-07-29 06:48:54.649139
1751	SP000053	#VAXXON AVI-FLU (500ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	779000.00	950000.00	6.00	0.00	6.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.779	2025-07-29 06:48:54.999774
1752	SP000052	#VAXXON ND-FLU (500ml	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1100000.00	1400000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.779	2025-07-29 06:48:54.999774
1753	SP000051	#K-NEWH5 (500ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	790000.00	950000.00	10.00	0.00	10.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.779	2025-07-29 06:48:54.999774
1754	SP000050	#IZOVAC ND (500ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	445000.00	750000.00	5.00	0.00	5.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.78	2025-07-29 06:48:54.999774
1756	SP000048	#IZOVAC CLONE (2500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	173000.00	240000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.78	2025-07-29 06:48:54.999774
1757	SP000047	#VAXXON ILT (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	179000.00	220000.00	4.00	0.00	4.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.78	2025-07-29 06:48:54.999774
1758	SP000046	#VAXXON CHB (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	365000.00	520000.00	36.00	0.00	36.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.78	2025-07-29 06:48:54.999774
1759	SP000045	#IZOVAC GUMBORO 3 (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	170000.00	200000.00	25.00	0.00	25.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.781	2025-07-29 06:48:54.999774
1783	SP000004	NOVAVETER FENDOX PLUS (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1250000.00	1450000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.135	2025-07-29 06:48:55.660734
1760	SP000044	#IZOVAC H120 - LASOTA (2500DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	223000.00	280000.00	75.00	0.00	76.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.781	2025-07-29 06:48:54.999774
1640	SP000168	#DỊCH TẢ VỊT-NAVETCO (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	37000.00	70000.00	26.00	0.00	27.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.476	2025-07-29 06:48:53.691393
1755	SP000049	#AGR POX (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	162000.00	220000.00	59.00	0.00	66.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.78	2025-08-05 08:24:29.140906
1642	SP000166	#VIÊM GAN VỊT - AVAC (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	54000.00	85000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.575	2025-07-29 06:48:53.789102
1643	SP000165	ALpha D3 (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	130000.00	160000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.575	2025-07-29 06:48:53.789102
1644	SP000164	CLOSTAB (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	350000.00	350000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.575	2025-07-29 06:48:53.789102
1645	SP000163	CHROM DRY 0,04% (20Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1875000.00	2100000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.575	2025-07-29 06:48:53.789102
1646	SP000162	AMINO PLEX (500ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	450000.00	550000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.576	2025-07-29 06:48:53.789102
1647	SP000161	#TABIC M.B (2000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	379500.00	450000.00	25.00	0.00	25.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.576	2025-07-29 06:48:53.789102
1648	SP000160	#TABIC M.B (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	211666.67	250000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.576	2025-07-29 06:48:53.789102
1649	SP000158	VP 1000 W.S (100g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	59000.00	75000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.576	2025-07-29 06:48:53.789102
1650	SP000157	HANTOX 200 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	316000.00	350000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.576	2025-07-29 06:48:53.789102
1671	SP000136	TOPCIN CALPHOS PLUS (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	415000.00	620000.00	7.00	0.00	7.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.886	2025-07-29 06:48:54.106535
1672	SP000135	TOPCIN CALPHOS PLUS (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	97149.00	130000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.886	2025-07-29 06:48:54.106535
1673	SP000134	VAC PAC PLUS (5g)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	18620.00	30000.00	195.00	0.00	195.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.886	2025-07-29 06:48:54.106535
1674	SP000133	ESCENT L (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	335000.00	450000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.886	2025-07-29 06:48:54.106535
1675	SP000132	#IB H52 (2000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	235000.00	300000.00	6.00	0.00	6.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.886	2025-07-29 06:48:54.106535
1676	SP000131	#IB H52 (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	135000.00	170000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.887	2025-07-29 06:48:54.106535
1677	SP000130	#GUM A (200DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	86000.00	100000.00	1.00	0.00	1.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.887	2025-07-29 06:48:54.106535
1678	SP000129	#ND-IB (200DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	55000.00	70000.00	0.00	0.00	0.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.887	2025-07-29 06:48:54.106535
1679	SP000127	FARMADE (20lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1200000.00	1400000.00	8.00	0.00	8.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.887	2025-07-29 06:48:54.106535
1680	SP000126	AGR ANTISEPTIC (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	810000.00	950000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.887	2025-07-29 06:48:54.106535
1701	SP000105	AGR BCOMPLEX C (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	120000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.21	2025-07-29 06:48:54.428735
1702	SP000104	AGR BUTAPHOS B12 (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	226000.00	280000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.211	2025-07-29 06:48:54.428735
1703	SP000103	AGR MULTIVIT (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	167000.00	220000.00	4.00	0.00	4.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.212	2025-07-29 06:48:54.428735
1704	SP000101	AGR SUPPER MEAT (2lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	318000.00	450000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.212	2025-07-29 06:48:54.428735
1705	SP000100	PROTEIN (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	167000.00	250000.00	1.00	0.00	1.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.212	2025-07-29 06:48:54.428735
1706	SP000099	AGR SORBIMIN (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	350000.00	650000.00	19.00	0.00	19.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.212	2025-07-29 06:48:54.428735
1707	SP000098	HEPAIN POWDER (kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	88000.00	120000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.212	2025-07-29 06:48:54.428735
1708	SP000097	AGR ELECTROSOL ORAL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	91000.00	120000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.213	2025-07-29 06:48:54.428735
1709	SP000096	AGR ALL-LYTE (5Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	305000.00	450000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.213	2025-07-29 06:48:54.428735
1710	SP000095	AGR ALL-LYTE (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	90000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.213	2025-07-29 06:48:54.428735
1731	SP000073	AGR AVILIV (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	259000.00	300000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.538	2025-07-29 06:48:54.755565
1732	SP000072	AGR AVITRACE (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	241000.00	280000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.538	2025-07-29 06:48:54.755565
1733	SP000071	AGR AVICAP (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	151000.00	200000.00	6.00	0.00	6.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.539	2025-07-29 06:48:54.755565
1734	SP000070	AGR AVIMIX (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1217000.00	1500000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.539	2025-07-29 06:48:54.755565
1735	SP000069	AGR AVIMIX (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	267000.00	300000.00	15.00	0.00	15.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.539	2025-07-29 06:48:54.755565
1736	SP000068	AGR AVITOXIN (5lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1545000.00	1900000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.539	2025-07-29 06:48:54.755565
1737	SP000067	AGR AVITOXIN (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	308608.70	450000.00	2.00	0.00	2.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.539	2025-07-29 06:48:54.755565
1738	SP000066	AGR BUTASAN 10 (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	75000.00	100000.00	24.00	0.00	24.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.539	2025-07-29 06:48:54.755565
1739	SP000065	AGR DEXA JECT (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	35000.00	50000.00	23.00	0.00	23.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.539	2025-07-29 06:48:54.755565
1740	SP000064	AGR CHYPSIN (100ml)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	110000.00	32.00	0.00	32.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.54	2025-07-29 06:48:54.755565
1762	SP000040	TT NEODOX(DOXY 50%) (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1190000.00	1400000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.914	2025-07-29 06:48:55.132139
1763	SP000038	TT ECO - ENRO 20 SOL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	481000.00	600000.00	3.00	0.00	3.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.914	2025-07-29 06:48:55.132139
1764	SP000037	TT ECO - DICLACOX 2,5% (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	501483.00	700000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.914	2025-07-29 06:48:55.132139
1765	SP000036	TT ECO - SULFA PLUS (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1250000.00	1600000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.914	2025-07-29 06:48:55.132139
1766	SP000034	TT BIOLACZIM S (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	139472.50	200000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.914	2025-07-29 06:48:55.132139
1767	SP000033	TT GLUCAN C (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	119322.00	180000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.914	2025-07-29 06:48:55.132139
1768	SP000032	TT PAKWAY (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	264537.00	350000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.915	2025-07-29 06:48:55.132139
1769	SP000030	TT SUPPERLYTE (1Kg)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	89681.50	140000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.915	2025-07-29 06:48:55.132139
1770	SP000027	TT HEPA PLUS (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	88783.88	140000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.915	2025-07-29 06:48:55.132139
1781	SP000006	NOVAVETER ENROVET ORAL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	420000.00	500000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.134	2025-07-29 06:48:55.458657
1784	SP000003	NOVAVETER MAXFLO(23%) (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	983000.00	1150000.00	0.00	0.00	0.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.135	2025-07-29 06:48:55.798859
1761	SP000043	#IZOVAC H120 - LASOTA (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	111000.00	130000.00	13.00	0.00	14.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:53.914	2025-07-29 06:48:55.132139
1785	SP000002	NOVAVETER TICOSIN ORAL (1lit)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1057000.00	1400000.00	0.00	0.00	0.00	0.00	4000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:54.135	2025-07-29 06:48:55.894123
1786	TEST_LARGE	Test Large Number	\N	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	999999999999.99	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 07:38:58.35401	2025-07-29 07:38:58.35401
1787	SP000738	AN-DINE ( lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	180000.00	-1.00	0.00	-1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:18.851	2025-07-29 12:57:19.974742
1788	SP000737	NANO ĐỒNG (LÍT)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	220000.00	260000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:19.157	2025-07-29 12:57:20.163776
1789	SP000736	MARTYLAN (MARPHAVET)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	100000.00	150000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:19.287	2025-07-29 12:57:20.381096
1790	SP000734	NOVICID ESL ( 5 LÍT)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	600000.00	720000.00	6.00	0.00	6.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:19.489	2025-07-29 12:57:20.560674
1791	SP000733	MG REVIVAL LIQUID (5 LÍT)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1943000.00	2300000.00	7.00	0.00	7.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:19.699	2025-07-29 12:57:20.707875
1792	SP000732	#TEMBUSU SỐNG PALVI (500ds)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	68000.00	0.00	100.00	0.00	100.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:19.821	2025-07-29 12:57:20.939515
1793	SP000731	VIRBAC-CALGOPHOS (5 LÍT)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	800000.00	960000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:20.061	2025-07-29 12:57:21.163116
1794	SP000730	VV OXOLIN 100g	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	100000.00	4.00	0.00	4.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:20.267	2025-07-29 12:57:21.27699
1795	SP000729	BUTAFAN 100ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	132174.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:20.379	2025-07-29 12:57:21.466066
1796	SP000728	AGR CHYPSIN (LÍT)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	315000.00	600000.00	12.00	0.00	12.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:20.568	2025-07-29 12:57:21.657811
1797	SP000727	MG VIR 220 5000ds ( TẢ )	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	464286.00	560000.00	9.00	0.00	9.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:20.759	2025-07-29 12:57:21.764591
1798	SP000726	MG VIR 114 5000ds ( GUM )	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	685714.00	830000.00	12.00	0.00	12.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:20.866	2025-07-29 12:57:21.878238
1799	SP000725	MG DOKSIVIL (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1966667.00	2300000.00	1.00	0.00	1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:20.979	2025-07-29 12:57:22.061142
1800	SP000724	MG BỘ TIÊM CEP-102 (cặp)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	375000.00	450000.00	14.00	0.00	14.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:21.168	2025-07-29 12:57:22.184175
1801	SP000723	KIM 16X13	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	14000.00	15000.00	7.00	0.00	7.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:21.318	2025-07-29 12:57:22.331131
1802	SP000722	COCCIVET 2000ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	850000.00	1500000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:21.431	2025-07-29 12:57:22.431863
1803	SP000721	AGR AVIMINO (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	230000.00	320000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:21.534	2025-07-29 12:57:22.606283
1804	SP000720	#TG ND IB PLUS EDS 1000ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1443000.00	1900000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:21.741	2025-07-29 12:57:22.747145
1805	SP000719	AGR TOLFERIUM 100ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	165000.00	210000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:21.858	2025-07-29 12:57:22.867592
1806	SP000718	SUPER MIRALVIT (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	205000.00	290000.00	18.00	0.00	18.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:21.967	2025-07-29 12:57:22.974216
1807	SP000717	TAV-STRESS LYTE PLUS (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	150000.00	250000.00	263.00	0.00	263.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:22.075	2025-07-29 12:57:23.484292
1808	SP000716	MG TC5 PLUS ( lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	96429.00	120000.00	6.00	0.00	6.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:22.631	2025-07-29 12:57:23.629796
1809	SP000715	MG VILACOL (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1500000.00	1800000.00	5.00	0.00	5.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:22.729	2025-07-29 12:57:23.728443
1810	SP000714	MG PARADOL K-C (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	167143.00	200000.00	17.00	0.00	17.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:22.829	2025-07-29 12:57:23.837457
1811	SP000713	MG CEREBRA D (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	492857.00	600000.00	14.00	0.00	14.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:22.967	2025-07-29 12:57:23.969981
1812	SP000712	MG MAKROVIL 480ml (chai)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	814286.00	980000.00	1.00	0.00	1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:23.079	2025-07-29 12:57:24.161121
1813	SP000711	GLASSER (HIPRA) CHAI (10ds)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	160000.00	180000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:23.262	2025-07-29 12:57:24.269476
1814	SP000710	HYOGEN (CEVA)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	17400.00	25000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:23.374	2025-07-29 12:57:24.38397
1815	SP000709	Thảm nỉ 0,5m x 1m	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	25000.00	35000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:23.489	2025-07-29 12:57:24.493096
1816	SP000708	BMD (bao 25kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	2375000.00	2850000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:23.599	2025-07-29 12:57:24.685681
1817	SP000707	PROZIL 50ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	180000.00	220000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:23.788	2025-07-29 12:57:24.787027
1818	SP000706	LUBE GEL	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	20000.00	40000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:23.889	2025-07-29 12:57:24.968101
1819	SP000705	NƯỚC MUỐI SINH LÝ 500ML (CHAI)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	6000.00	10000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:24.072	2025-07-29 12:57:25.069963
1820	SP000704	GIẤY VUÔNG (bịch)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	10000.00	10000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:24.17	2025-07-29 12:57:25.168137
1821	SP000703	Kìm bấm đuôi điện xịn (Cái)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	180000.00	250000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:24.269	2025-07-29 12:57:25.277463
1822	SP000702	Máy mài nanh hộp nhựa(Chiếc)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	280000.00	350000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:24.377	2025-07-29 12:57:25.374915
1823	SP000701	TG-FLUZOL MAX (LÍT)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	332000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:24.475	2025-07-29 12:57:25.474284
1824	SP000700	ECOLI - THT 100ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	64000.00	85000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:24.575	2025-07-29 12:57:25.57447
1825	SP000699	QUE PHỐI NÔNG ĐẦU TO ( BỊCH)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	120000.00	150000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:24.678	2025-07-29 12:57:25.759112
1826	SP000698	QUE NÔNG ĐẦU NHỎ (BỊCH)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	120000.00	150000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:24.873	2025-07-29 12:57:25.885634
1827	SP000697	MISTRAL (BỘT ÚM) kg	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	32000.00	40000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:24.989	2025-07-29 12:57:25.992429
1828	SP000696	HEPANOL	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	120000.00	140000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:25.129	2025-07-29 12:57:26.127561
1829	SP000695	PORCOX-5	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	385000.00	440000.00	9.00	0.00	9.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:25.23	2025-07-29 12:57:26.310566
1830	SP000694	METRIL-ORAL	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	75000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:25.409	2025-07-29 12:57:26.409726
1831	SP000693	VETRIMOXIN-LA	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	235000.00	250000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:25.521	2025-07-29 12:57:26.516411
1832	SP000692	FEROVITA 200 (sắt)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	96000.00	130000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:25.614	2025-07-29 12:57:26.612288
1833	SP000691	MEGA-BROMEN (lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	201429.00	250000.00	12.00	0.00	12.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:25.712	2025-07-29 12:57:26.714037
1834	SP000690	MEGA-TICOSIN	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1078571.00	1300000.00	1.00	0.00	1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:25.818	2025-07-29 12:57:26.824819
1835	SP000689	MG MEGA-BIO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	121429.00	150000.00	6.00	0.00	6.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:25.931	2025-07-29 12:57:26.939076
1836	SP000688	KHÁNG THỂ NẮP XANH	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110052.57	160000.00	79.00	0.00	79.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:26.042	2025-07-29 12:57:27.043551
1837	SP000687	KHÁNG THỂ KTV HANVET	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	19000.00	24000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:26.153	2025-07-29 12:57:27.175636
1838	SP000686	BIOFRAM BIO K-C-G (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	58000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:26.276	2025-07-29 12:57:27.281152
1841	SP000683	TG TT-FLOMIX 4% (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	103000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:26.643	2025-07-29 12:57:27.646932
1844	SP000680	MG ADE SOLUTION	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	131448.69	170000.00	27.00	0.00	27.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:26.963	2025-07-29 12:57:27.963687
1850	SP000674	MG VILLI SUPPORT L (lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	353571.00	450000.00	47.00	0.00	47.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:27.675	2025-07-29 12:57:28.676482
1853	SP000671	VV AMOXCOLI 50% (100g)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	100000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:27.98	2025-07-29 12:57:28.985237
1856	SP000667	MG REVIVAL LIQUID (lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	432143.00	500000.00	3.00	0.00	3.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.294	2025-07-29 12:57:29.300434
1859	SP000664	MG FLOR-VM 30% (lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1182000.00	1400000.00	9.00	0.00	9.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.605	2025-07-29 12:57:29.601605
1862	SP000661	MEGA VIT (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	84286.00	110000.00	57.00	0.00	57.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.898	2025-07-29 12:57:29.89757
1865	SP000658	AGR CORYZA 3	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	780000.00	1200000.00	3.00	0.00	3.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:29.202	2025-07-29 12:57:30.201325
1868	SP000655	TYX ORAMEC SOLUTION ( lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	390000.00	480000.00	8.00	0.00	8.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:29.501	2025-07-29 12:57:30.50878
1871	SP000652	MG VIR 101 1000ds (ILT)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	192857.00	240000.00	26.00	0.00	26.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:29.829	2025-07-29 12:57:30.829768
1874	SP000649	MG VIR 220 2000ds (TẢ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	207143.00	260000.00	24.00	0.00	24.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:30.131	2025-07-29 12:57:31.131583
1877	SP000646	MG VIR 114 1000ds ( GUM )	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	182143.00	230000.00	32.00	0.00	32.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:30.447	2025-07-29 12:57:31.468176
1880	SP000643	AGR DOXYTYL (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	830000.00	880000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:30.782	2025-07-29 12:57:31.794256
1883	SP000640	AGR THẦN DƯỢC AG - 009	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	15000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.116	2025-07-29 12:57:32.123021
1886	SP000637	#IZOVAC GUMBORO 3 (2500ds)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	338000.00	480000.00	31.00	0.00	31.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.439	2025-07-29 12:57:32.452558
1889	SP000633	DEXA - BROM	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	29500.00	60000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.751	2025-07-29 12:57:32.747595
1892	SP000631	VV CEPHAXIN 50 WSP (100g)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	130000.00	2.00	0.00	2.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:32.061	2025-07-29 12:57:33.061873
1895	SP000628	XI LANH MEKA MUSYDER	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	70000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:32.375	2025-07-29 12:57:33.379972
1898	SP000624	Gel bôi trơn	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:32.688	2025-07-29 12:57:33.688901
1901	SP000621	AGR CHYPSIN 20ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	14000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.002	2025-07-29 12:57:33.999224
1904	SP000619	TG MINELITE (1 lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	160000.00	200000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.322	2025-07-29 12:57:34.325043
1907	SP000614	INTERFERON (bột) lọ	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	14000.00	24000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.635	2025-07-29 12:57:34.645126
1910	SP000611	NƯỚC BIỂN (500ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	10700.00	12000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.941	2025-07-29 12:57:34.942555
1913	SP000608	NOVA - KHÁNG THỂ VIÊM GAN TYPE 1+3 (500ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	220000.00	350000.00	3.00	0.00	3.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:34.255	2025-07-29 12:57:35.252745
1916	SP000605	GIẢ DẠI 50ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	500000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:34.59	2025-07-29 12:57:35.597133
1919	SP000602	GLUCONAMIC KC (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	55000.00	80000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:34.916	2025-07-29 12:57:35.912864
1922	SP000599	CEFUXIM 250ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	5.00	0.00	5.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.2	2025-07-29 12:57:36.205912
1925	SP000596	BÓNG UV 0.6m	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.508	2025-07-29 12:57:36.505903
1928	SP000593	TẤM LÙA HEO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	200000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.826	2025-07-29 12:57:36.828943
1931	SP000590	KEPROMEC (50ml) (ivermectin)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	136000.00	165000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.133	2025-07-29 12:57:37.133595
1934	SP000587	CLOSTOP SP (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	350000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.441	2025-07-29 12:57:37.451445
1937	SP000584	NUTROLYTE	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	57000.00	80000.00	39.00	0.00	39.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.785	2025-07-29 12:57:37.795758
1940	SP000580	VIKON S 500G	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	366000.00	400000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:37.114	2025-07-29 12:57:38.126311
1943	SP000577	PARVO (ZOETIS) 10ds 20ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	304000.00	340000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:37.454	2025-07-29 12:57:38.452231
1946	SP000574	HEPA PLUS (5 lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	461896.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:37.748	2025-07-29 12:57:38.749372
1949	SP000571	#PRRS (Tai Xanh MSD) 10ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	595000.00	650000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:38.067	2025-07-29 12:57:39.071735
1952	SP000568	BG 001 (15ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	25000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:38.386	2025-07-29 12:57:39.395226
1958	SP000562	ECO - BMD 10	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	137350.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:39.076	2025-07-29 12:57:40.080861
1961	SP000559	AGR BCOMPLEX-C (200g)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	30000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:39.374	2025-07-29 12:57:40.392165
1964	SP000556	#RỤT MỎ SINDER GPA + DVH + REO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	103000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:39.696	2025-07-29 12:57:40.714381
1967	SP000552	BCOMLEX kg(5:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	109000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.01	2025-07-29 12:57:41.020342
1970	SP000549	XI LANH TỰ ĐỘNG CÁN KIM LOẠI ĐỎ 2ml (cây)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	300000.00	350000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.319	2025-07-29 12:57:41.318361
1973	SP000546	#PRVACPLUS(GIẢ DẠI CEVA) 25ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	267000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.632	2025-07-29 12:57:41.631206
1976	SP000543	VITACEN ADE PLUS (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	230000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.942	2025-07-29 12:57:41.942097
1979	SP000540	VV FLO-DOXY (kg) HEO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	152000.00	200000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.253	2025-07-29 12:57:42.248051
1982	SP000537	ASPIVIT C+K (1KG (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	176000.00	210000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.573	2025-07-29 12:57:42.571284
1985	SP000534	TIGER_BCOMPLEX (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	94000.00	130000.00	26.00	0.00	26.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.864	2025-07-29 12:57:42.875626
1988	SP000531	TIGER BỔ GAN (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	113000.00	140000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:42.207	2025-07-29 12:57:43.205461
1991	SP000528	TIGER-NUTRILACZYM (1Kg) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	107000.00	140000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:42.528	2025-07-29 12:57:43.525282
1955	SP000565	#CÚM H5 + H9 (250ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110000.00	200000.00	138.00	0.00	140.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:38.753	2025-07-29 12:57:39.760168
1839	SP000685	VIÊM GAN CNC 1000ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	80000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:26.397	2025-07-29 12:57:27.41223
1842	SP000682	VV AMOXIN 100g	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	70000.00	1.00	0.00	1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:26.755	2025-07-29 12:57:27.751628
1845	SP000679	GENTACINE 250ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	250000.00	17.00	0.00	17.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:27.062	2025-07-29 12:57:28.065145
1848	SP000676	MG DOXY-VM (kg) hộp	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1649000.00	2000000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:27.39	2025-07-29 12:57:28.396373
1851	SP000673	PROGESTERONE HANVET ( AN THAI) HỘP	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	35000.00	40000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:27.777	2025-07-29 12:57:28.777821
1854	SP000669	AGR LACTO - MAX (100g)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	20000.00	1.00	0.00	1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.086	2025-07-29 12:57:29.084955
1857	SP000666	MG DICLASOL (lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	657141.00	850000.00	19.00	0.00	19.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.405	2025-07-29 12:57:29.40312
1860	SP000663	MG ESCENT S (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	200000.00	250000.00	19.00	0.00	19.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.706	2025-07-29 12:57:29.70741
1863	SP000660	MG TẢ CHẾT (VIR SIN 121L) 500ML	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	650000.00	850000.00	39.00	0.00	39.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.996	2025-07-29 12:57:29.993491
1866	SP000657	KT-DỊCH TẢ VỊT 100ML	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	19000.00	22000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:29.299	2025-07-29 12:57:30.297911
1869	SP000654	MG MEGA - KC	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85714.00	110000.00	31.00	0.00	31.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:29.618	2025-07-29 12:57:30.62028
1872	SP000651	MG VIR 102 1000ds (Đậu)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	164286.00	210000.00	17.00	0.00	17.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:29.929	2025-07-29 12:57:30.926422
1875	SP000648	MG VIR 220 1000ds ( TẢ )	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	114286.00	140000.00	24.00	0.00	24.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:30.235	2025-07-29 12:57:31.243486
1878	SP000645	AGR GENTADOX (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	812000.00	900000.00	7.00	0.00	7.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:30.575	2025-07-29 12:57:31.575431
1881	SP000642	TYLOSIN 750g	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	572000.00	1050000.00	1.00	0.00	1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:30.902	2025-07-29 12:57:31.909232
1884	SP000639	VETMORE 2 KIM	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	215000.00	250000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.222	2025-07-29 12:57:32.221652
1887	SP000636	TG FOSFOCIN 250 (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	969000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.555	2025-07-29 12:57:32.555227
1890	SP000632	LINCOPEC ( VIỆT ANH)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	104000.00	130000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.846	2025-07-29 12:57:32.848305
1893	SP000630	AGR PHOSRENOL (1 kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	536317.85	660000.00	26.00	0.00	26.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:32.159	2025-07-29 12:57:33.16114
1896	SP000627	VMD TULAVITRYL	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	246000.00	280000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:32.478	2025-07-29 12:57:33.480219
1899	SP000623	Que phối nông đầu to	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	130000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:32.792	2025-07-29 12:57:33.80235
1902	POX (TYX)	POX (TYX)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	160000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.097	2025-07-29 12:57:34.098023
1905	SP000618	FMD 25ds (aftogen - navetco)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	19000.00	22000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.427	2025-07-29 12:57:34.429976
1908	SP000613	GIẢ DẠI (ZOETIS) 25ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	300000.00	340000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.743	2025-07-29 12:57:34.74009
1911	SP000610	NOVA - RỤT MỎ SINDER (500ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	200000.00	300000.00	2.00	0.00	2.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:34.055	2025-07-29 12:57:35.057652
1914	SP000607	NOVA - TEMBUSU SỐNG DOBIO (1000ds)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	390000.00	650000.00	4.00	0.00	4.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:34.351	2025-07-29 12:57:35.357069
1917	SP000604	TẢ CEVA 10ds (tả cổ điển)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	76000.00	85000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:34.696	2025-07-29 12:57:35.698657
1920	SP000601	MÁY NĂNG NHIỆT VẮC XIN Sunsun Heater GR Series	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	14.00	0.00	14.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.01	2025-07-29 12:57:36.003879
1923	SP000598	PG 600 ( lọ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	183000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.304	2025-07-29 12:57:36.304984
1926	SP000595	KIM 18GX1 1/2" (HỘP) -100 cây	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	35000.00	40000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.613	2025-07-29 12:57:36.611045
1929	SP000592	BÓNG UV 1m2	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.938	2025-07-29 12:57:36.934609
1932	SP000589	VV BIOZYME (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	120000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.234	2025-07-29 12:57:37.234292
1935	SP000586	PPRS 10ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.556	2025-07-29 12:57:37.556893
1938	SP000583	#SANAVAC ND G7	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	620000.00	850000.00	40.00	0.00	40.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.897	2025-07-29 12:57:37.900166
1941	SP000579	TC NEO MEN BÀO TỬ (100g)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	20000.00	1.00	0.00	1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:37.224	2025-07-29 12:57:38.225544
1944	SP000576	SHOTAPEN 100ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	345000.00	380000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:37.55	2025-07-29 12:57:38.547617
1947	SP000573	BIO PLUS 11 kg(10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	150000.00	220000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:37.852	2025-07-29 12:57:38.856636
1950	SP000570	Cloramin B Trung Quốc xô 5kg (Xô)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	200000.00	400000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:38.172	2025-07-29 12:57:39.172938
1953	SP000567	BG 002 (15ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	23000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:38.501	2025-07-29 12:57:39.506706
1956	SP000564	AGR FLUCAL 150 (1 lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	292000.00	400000.00	16.00	0.00	16.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:38.858	2025-07-29 12:57:39.856009
1959	SP000561	Bóng sưởi Sky Heat 175w (Qủa)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	32000.00	50000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:39.18	2025-07-29 12:57:40.1759
1965	SP000554	TT-NEOCOSIN (1 lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	775313.00	900000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:39.812	2025-07-29 12:57:40.812104
1968	SP000551	NUTRILACZYM kg (5:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	107000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.121	2025-07-29 12:57:41.117399
1971	SP000548	KIM ĐỐC HỒNG 18G HỘP 100CÂY	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	32631.58	40000.00	10.00	0.00	10.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.426	2025-07-29 12:57:41.425938
1974	SP000545	#COLAPEST (DỊCH TẢ ZOETIZ) 10ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	76000.00	90000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.732	2025-07-29 12:57:41.736213
1977	SP000542	MEBI-SELENIUM (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	145000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.044	2025-07-29 12:57:42.043213
1980	SP000539	TG BUTAPHO (5lit)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	809000.00	1250000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.35	2025-07-29 12:57:42.346589
1983	SP000536	ASPIVIT C+K (1KG (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	199000.00	230000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.673	2025-07-29 12:57:42.670688
1986	SP000533	TIGER_BCOMPLEX (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	109000.00	130000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.975	2025-07-29 12:57:42.976764
1989	SP000530	TIGER ĐIỆN GIẢI K_C THẢO DƯỢC (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	64000.00	90000.00	20.00	0.00	20.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:42.32	2025-07-29 12:57:43.319533
1992	SP000527	TIGER-PAKWAY (1Kg) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	98000.00	130000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:42.63	2025-07-29 12:57:43.629828
1840	SP000684	AVISAN MULTI/CO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	2300000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:26.537	2025-07-29 12:57:27.542351
1843	SP000681	VV SULTRIM 100g	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	70000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:26.853	2025-07-29 12:57:27.856876
1846	SP000678	XI LANH SKY PLATICK 20ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	30000.00	55000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:27.182	2025-07-29 12:57:28.184264
1849	SP000675	MG IVERMECTIN (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	147857.00	200000.00	18.00	0.00	18.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:27.5	2025-07-29 12:57:28.574947
1852	SP000672	CALCI + B12 (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	21000.00	30000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:27.883	2025-07-29 12:57:28.879762
1855	SP000668	MG CALPHOS PLUS (lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	125000.00	160000.00	13.00	0.00	13.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.185	2025-07-29 12:57:29.188768
1858	SP000665	MG TOP-SURE (lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	189286.00	250000.00	37.00	0.00	37.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.508	2025-07-29 12:57:29.505737
1861	SP000662	MG SALICYLAT KC (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	250000.00	320000.00	11.00	0.00	11.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:28.806	2025-07-29 12:57:29.801471
1864	SP000659	VV FLODOXY 30 (100g)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	66500.00	110000.00	8.00	0.00	8.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:29.099	2025-07-29 12:57:30.103799
1867	SP000656	VIOCID AEROSO SPRAY 200ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	60000.00	80000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:29.399	2025-07-29 12:57:30.398519
1870	SP000653	MG MEGA - GREEN (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	45357.00	60000.00	79.00	0.00	79.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:29.724	2025-07-29 12:57:30.728529
1873	SP000650	MG VIR 118 (IB BIẾN CHỦNG) 1000ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	321429.00	400000.00	3.00	0.00	3.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:30.024	2025-07-29 12:57:31.02633
1876	SP000647	MG VIR 114 2000ds ( GUM )	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	307143.00	400000.00	33.00	0.00	33.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:30.342	2025-07-29 12:57:31.342083
1879	SP000644	VV VITAMIN K3 0,5% (1Kg) 10:1	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	69000.00	80000.00	15.00	0.00	15.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:30.673	2025-07-29 12:57:31.676623
1882	SP000641	ECOLI - THT NACOVET 500ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	275000.00	450000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.009	2025-07-29 12:57:32.015514
1885	SP000638	LƯỠI CẮT MỎ GÀ	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	10000.00	15000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.321	2025-07-29 12:57:32.322274
1888	SP000634	BCOMPLEX BIO 100ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	30000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.654	2025-07-29 12:57:32.653391
1891	VIÊM GAN HANVET	VIÊM GAN HANVET	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	50800.00	80000.00	73.00	0.00	73.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:31.953	2025-07-29 12:57:32.958299
1894	SP000629	CEFTIFI (500ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	205000.00	210000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:32.262	2025-07-29 12:57:33.275379
1897	SP000626	THANH TRỢ PHỐI	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	35000.00	55000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:32.587	2025-07-29 12:57:33.58448
1900	SP000622	Que phối nông đầu nhỏ	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	130000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:32.9	2025-07-29 12:57:33.902315
1903	SP000620	AGR MELOCID (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	212000.00	350000.00	24.00	0.00	24.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.202	2025-07-29 12:57:34.201743
1906	SP000615	BIO-SEPTRYL 24%	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	69000.00	80000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.536	2025-07-29 12:57:34.536614
1909	SP000612	DÂY TRUYỀN 1M (Sợi)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	5000.00	5000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:33.839	2025-07-29 12:57:34.83894
1912	SP000609	NOVA - REO VIRUS (500ds)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	120000.00	150000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:34.155	2025-07-29 12:57:35.156786
1915	SP000606	GIẢ DẠI 10ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	120000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:34.484	2025-07-29 12:57:35.48759
1918	SP000603	TẢ CEVA 50ds (tả cổ điển)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	195000.00	210000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:34.816	2025-07-29 12:57:35.818628
1921	SP000600	ANTIBIOTIC 100ML	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.103	2025-07-29 12:57:36.099939
1924	SP000597	GONAESTROL 8ml (lọ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	34000.00	40000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.414	2025-07-29 12:57:36.410502
1927	SP000594	GẬY ĐUỔI HEO CHÍCH ĐIỆN 85cm	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	700000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:35.71	2025-07-29 12:57:36.714466
1930	SP000591	NƯỚC PHA	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	-17.00	0.00	-17.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.032	2025-07-29 12:57:37.03247
1933	SP000588	AGR FLORMAX 500 (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1000000.00	1400000.00	6.00	0.00	6.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.335	2025-07-29 12:57:37.33902
1936	SP000585	PPRS 50ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.665	2025-07-29 12:57:37.672311
1939	SP000582	#SANAVAC ND G7+H5,H9	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1000000.00	1300000.00	1.00	0.00	1.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:36.999	2025-07-29 12:57:38.004102
1945	SP000575	LIVERMARINE SOLUTION1(LIT)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	389436.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:37.65	2025-07-29 12:57:38.651633
1948	SP000572	#PRRS (Tai Xanh MSD) 50ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	2180000.00	2500000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:37.956	2025-07-29 12:57:38.959432
1951	SP000569	BETA B12 PLUS (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	118000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:38.271	2025-07-29 12:57:39.273112
1954	SP000566	Ống thủy socorex 0,5ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	220000.00	300000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:38.633	2025-07-29 12:57:39.65616
1957	SP000563	AGR MILK PLUS (100g)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	98000.00	15000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:38.954	2025-07-29 12:57:39.957588
1960	SP000560	Focmol can 37% (Can 30 lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	400000.00	400000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:39.272	2025-07-29 12:57:40.272956
1963	SP000557	TYVALOSIN PREMIX 20% (10kg/bao)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	6600000.00	8500000.00	5.00	0.00	5.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:39.592	2025-07-29 12:57:40.594207
1966	SP000553	VITAMIN C (1kg) (5:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	110000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:39.914	2025-07-29 12:57:40.912837
1969	SP000550	MIXOPLUS (1 lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	104517.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.216	2025-07-29 12:57:41.220468
1972	SP000547	KIM 16x20 (vỉ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	6000.00	10000.00	8.00	0.00	8.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.524	2025-07-29 12:57:41.525614
1975	SP000544	#COLAPEST(DỊCH TẢ ZOETIZ) 50ds	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	195000.00	210000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:40.842	2025-07-29 12:57:41.842931
1978	SP000541	VITAMIN ADE (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	87000.00	120000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.144	2025-07-29 12:57:42.155671
1981	SP000538	TG PARAVIT C (1Kg) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	186000.00	220000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.45	2025-07-29 12:57:42.46122
1984	SP000535	TG - ADE MEN (1Kg) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	104000.00	140000.00	19.00	0.00	19.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:41.769	2025-07-29 12:57:42.765341
1987	SP000532	TIGER BỔ GAN (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	98000.00	130000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:42.083	2025-07-29 12:57:43.108631
1990	SP000529	TIGER ĐIỆN GIẢI K_C THẢO DƯỢC (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	79000.00	100000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:42.427	2025-07-29 12:57:43.426319
1993	SP000526	TIGER-VITAMIN C 30% (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	95000.00	120000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:42.733	2025-07-29 12:57:43.733607
1994	SP000524	TT02 Hộp (cặp 25g 250ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	365000.00	450000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:42.832	2025-07-29 12:57:43.83267
1997	SP000521	TICETRI 10% (kèm nước pha 250ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	244000.00	350000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.153	2025-07-29 12:57:44.158219
2000	SP000518	ENROTI(100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	52000.00	70000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.462	2025-07-29 12:57:44.464833
2003	SP000515	TILINSPEC (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	110000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.762	2025-07-29 12:57:44.762369
2006	SP000512	UK TILMI 200 (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	543000.00	650000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.066	2025-07-29 12:57:45.070886
2009	SP000509	TG - FLODOX 150 (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	420000.00	550000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.373	2025-07-29 12:57:45.379596
2012	SP000505	TG-ABENDA (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	302000.00	400000.00	13.00	0.00	13.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.684	2025-07-29 12:57:45.689119
2015	SP000502	TG FOTAXIM 100 (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	696000.00	850000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.997	2025-07-29 12:57:46.004299
2018	SP000499	TG-TYLODOX (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	870000.00	950000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:45.331	2025-07-29 12:57:46.335482
2021	SP000496	TRITON S (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1010000.00	1200000.00	8.00	0.00	8.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:45.647	2025-07-29 12:57:46.661739
2024	SP000490	AGR - AVICAP (5 lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	595000.00	950000.00	10.00	0.00	10.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:45.966	2025-07-29 12:57:46.967058
2027	SP000487	ĐƯỜNG (25kg) BAO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	414000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:46.281	2025-07-29 12:57:47.303491
2030	SP000484	AGR - FLOCOL ORAL (lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	458000.00	950000.00	17.00	0.00	17.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:46.611	2025-07-29 12:57:47.611344
2033	SP000481	ĐUI SỨ XỊN MÀU NÂU CAO CẤP	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	9000.00	20000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:46.937	2025-07-29 12:57:47.935215
2036	SP000478	VV MONOSULTRIM (100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	78500.00	130000.00	3.00	0.00	3.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.235	2025-07-29 12:57:48.241809
2039	SP000475	AGR MEN SIÊU TĂNG TRỌNG 007	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	62000.00	120000.00	7.00	0.00	7.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.558	2025-07-29 12:57:48.553843
2042	SP000472	XI LANH - SOCOREX (0.5ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	2150000.00	2200000.00	2.00	0.00	2.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.886	2025-07-29 12:57:48.883243
2045	SP000469	BIO - ENROFLOXACIN (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	57000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:48.176	2025-07-29 12:57:49.176597
2048	SP000466	NOVA - BROM HEXINE PLUS	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	26000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:48.484	2025-07-29 12:57:49.480465
2051	SP000463	DICLOFENAC 2,5%	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	23000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:48.788	2025-07-29 12:57:49.786664
2054	SP000460	VETRIMOXIN LA (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	160000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.134	2025-07-29 12:57:50.133616
2057	SP000457	ORONDO SPRAY (250ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	100000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.439	2025-07-29 12:57:50.440123
2060	SP000454	BIO - SORBITOL + B12 (KG)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	52000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.747	2025-07-29 12:57:50.748007
2063	SP000451	#SCOCVAC 3 (2000ds)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	855000.00	920000.00	1.00	0.00	1.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.038	2025-07-29 12:57:51.036722
2066	SP000447	PHÍ GIAO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.335	2025-07-29 12:57:51.345246
2069	SP000444	TA BCOMPLEX Anvet (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	28000.00	40000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.654	2025-07-29 12:57:51.656801
2072	SP000441	BMD zoetiz (bao 20kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	3400000.00	3600000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.954	2025-07-29 12:57:51.951927
2075	SP000438	AGR LACTO-MAX AG XÔ 12KG	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1374000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:51.271	2025-07-29 12:57:52.271428
2078	SP000435	VV CHYMOSIN (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	64000.00	100000.00	151.00	0.00	151.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:51.587	2025-07-29 12:57:52.585393
2081	SP000431	TG-BROMFENCOL	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:51.926	2025-07-29 12:57:52.927816
2084	SP000428	#INTERFERON(BỘT)-NAVETCO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	3.00	0.00	3.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.246	2025-07-29 12:57:53.243625
2087	SP000424	TC-NUTRI-GLU-K,C	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.554	2025-07-29 12:57:53.564186
2090	SP000421	LINCCOPEC44(100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.865	2025-07-29 12:57:53.864855
2093	SP000417	ALBENDAZOL P-25(100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.164	2025-07-29 12:57:54.168144
2096	SP000412	TIGER-BROM (100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.492	2025-07-29 12:57:54.499958
2099	SP000408	COXYMAX-THÚ Y XANH	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.797	2025-07-29 12:57:54.793025
2102	SP000402	VV LINCOCIN 50% W.S.P	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1200000.00	1400000.00	4.00	0.00	4.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:54.111	2025-07-29 12:57:55.116641
2105	SP000399	EDS	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	925000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:54.417	2025-07-29 12:57:55.414098
2108	SP000396	AGR ERYMAX 500 (1KG)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1548000.00	1700000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:54.708	2025-07-29 12:57:55.708801
2111	SP000392	NƯỚC PHA GÀ ( 1000DS)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	30000.00	790.00	0.00	790.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:55.038	2025-07-29 12:57:56.053192
1995	SP000523	TT01 Hộp (cặp 50g 250ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	353000.00	450000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:42.934	2025-07-29 12:57:43.940706
1998	SP000520	TG BUTAPHO(100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	66000.00	90000.00	25.00	0.00	25.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.258	2025-07-29 12:57:44.25406
2001	SP000517	TIFLO-F(100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	130000.00	150000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.566	2025-07-29 12:57:44.567415
2004	SP000514	TG FLODOX HI (1lit)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	868000.00	1000000.00	13.00	0.00	13.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.861	2025-07-29 12:57:44.860089
2007	SP000511	TG-COLI 500 (1Kg) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	373000.00	500000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.174	2025-07-29 12:57:45.168884
2010	SP000508	TG - AMOXCOLI 115 (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	245000.00	400000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.482	2025-07-29 12:57:45.477269
2013	SP000504	TG-LINSPEC (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	268000.00	400000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.788	2025-07-29 12:57:45.793948
2016	SP000501	FOTAXIM 100 (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	732000.00	850000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:45.102	2025-07-29 12:57:46.110916
2019	SP000498	TG-OXY 50 (1Kg) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	400000.00	650000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:45.437	2025-07-29 12:57:46.44204
2022	SP000495	TT-AMPICOLI 500 (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	880000.00	1050000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:45.769	2025-07-29 12:57:46.765231
2025	SP000489	TG-DOXY 500 (1Kg)(XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1223000.00	1650000.00	3.00	0.00	3.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:46.067	2025-07-29 12:57:47.078162
2028	SP000486	ỐNG TIÊM 5cc	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	700.00	0.00	100.00	0.00	100.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:46.404	2025-07-29 12:57:47.406885
2031	SP000483	AGR UNIMULTIVITA - GOLD (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	158000.00	220000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:46.723	2025-07-29 12:57:47.727792
2034	SP000480	TC BIO LAC PLUS MAX (100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	26636.36	40000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.035	2025-07-29 12:57:48.030331
2037	SP000477	thuốc chích	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	-5.00	0.00	-5.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.339	2025-07-29 12:57:48.341579
2040	SP000474	XILANH NHỰA 5cc	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	700.00	0.00	100.00	0.00	100.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.656	2025-07-29 12:57:48.663029
2043	SP000471	XI LANH - SOCOREX (1ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	2150000.00	2200000.00	1.00	0.00	1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.98	2025-07-29 12:57:48.977166
2046	SP000468	EUCAMPHOE (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	47000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:48.275	2025-07-29 12:57:49.276711
2049	SP000465	KETOVET	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	39500.00	45000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:48.579	2025-07-29 12:57:49.585973
2052	SP000462	BIO - D.O.C	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	105000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:48.888	2025-07-29 12:57:49.936429
2055	SP000459	LUTALYSE(30ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	460000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.237	2025-07-29 12:57:50.238512
2058	SP000456	NOVA - PARA C	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	85000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.552	2025-07-29 12:57:50.550976
2061	SP000453	TIA MAX 10 (KG)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	250000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.846	2025-07-29 12:57:50.844252
2064	SP000449	TT ECO-TIMICIN ORAL (LÍT)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	747826.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.134	2025-07-29 12:57:51.13579
2067	SP000446	TYLODOX(100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	79500.00	100000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.443	2025-07-29 12:57:51.448302
2070	SP000443	VV AMINO PHOSPHORIC-ACID (1kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	410000.00	500000.00	7.00	0.00	7.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.755	2025-07-29 12:57:51.75257
2073	SP000440	#VH + H120 (2000DS)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	232500.00	280000.00	10.00	0.00	10.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:51.058	2025-07-29 12:57:52.073135
2076	SP000437	#VAKSIMUNE ND IBPLUS EDS (500DS)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	925000.00	925000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:51.386	2025-07-29 12:57:52.38866
2079	SP000434	CƯỚC XE	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	50000000.00	0.00	50000000.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:51.693	2025-07-29 12:57:52.707229
2082	SP000430	TC-MEN BÀO TỬ ĐA NĂNG	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.025	2025-07-29 12:57:53.026137
2085	SP000427	#INTERFRON(100ML)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	164119.63	350000.00	65.00	0.00	65.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.342	2025-07-29 12:57:53.338198
2088	SP000423	KIM 7X15	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	10000.00	9.00	0.00	9.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.671	2025-07-29 12:57:53.666761
2091	SP000419	TC BIO MAX SIÊU VỖ(100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.962	2025-07-29 12:57:53.959803
2094	SP000414	AMOXICOL 20% (100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	38500.00	50000.00	7.00	0.00	7.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.281	2025-07-29 12:57:54.297135
2097	SP000411	AMINO-PHOSPHORIC-ACID(100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	40500.00	50000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.597	2025-07-29 12:57:54.597975
2100	SP000407	#FLU H9N2 +ND 0.5 (1000DS)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	780000.00	950000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.893	2025-07-29 12:57:54.898716
2103	SP000401	BUNG LÔNG BẬT CỰA	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	75000.00	120000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:54.214	2025-07-29 12:57:55.212422
2106	SP000398	AGR BMD PREMIX (1KG)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	113000.00	150000.00	3.00	0.00	3.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:54.52	2025-07-29 12:57:55.517082
2109	SP000395	AGR TYLANMAX 500 (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	823000.00	950000.00	9.00	0.00	9.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:54.806	2025-07-29 12:57:55.815277
2112	SP000001	NOVA FARM NUTRI - MAX (5lit)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	990000.00	1400000.00	4.00	0.00	4.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:55.151	2025-07-29 12:57:56.163297
1996	SP000522	TICETRI 10% Hộp 2 lọ bột 25g (Không nước pha)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	438000.00	550000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.04	2025-07-29 12:57:44.036635
1999	SP000519	AZIFLO_S (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	154000.00	180000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.352	2025-07-29 12:57:44.357906
2002	SP000516	TIGENTA (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	88000.00	100000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.666	2025-07-29 12:57:44.663235
2005	SP000513	TG UK TILMI 200 (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	500000.00	600000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:43.966	2025-07-29 12:57:44.963942
2008	SP000510	TG - FLODOX 150 (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	370000.00	500000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.267	2025-07-29 12:57:45.26977
2011	SP000507	TG - AMOXCOLI 115 (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	285000.00	420000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.582	2025-07-29 12:57:45.581785
2014	SP000503	TG-GENDOX (1Kg) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1410000.00	1650000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:44.897	2025-07-29 12:57:45.897008
2017	SP000500	TG-TYLODOX (1KG) (XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	830000.00	950000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:45.208	2025-07-29 12:57:46.209875
2020	SP000497	TRITON S (1KG) (10:1)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1062000.00	1250000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:45.546	2025-07-29 12:57:46.549344
2023	SP000492	TG COLIMOX 500(1KG)(XÁ)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	810000.00	950000.00	19.00	0.00	19.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:45.866	2025-07-29 12:57:46.86851
2026	SP000488	CEF BỘT NGẮN MỎ	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	12000.00	-35.00	0.00	-35.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:46.179	2025-07-29 12:57:47.178921
2029	SP000485	AGR NEOPIG ECO(kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	87000.00	110000.00	3.00	0.00	3.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:46.512	2025-07-29 12:57:47.514198
2032	SP000482	BÓNG ÚM DICHTONG (250W)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	18000.00	25000.00	10.00	0.00	10.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:46.827	2025-07-29 12:57:47.836528
2035	SP000479	XÚT NAOH (25kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	350000.00	550000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.129	2025-07-29 12:57:48.13179
2038	SP000476	FINADYNE	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	431691.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.444	2025-07-29 12:57:48.442441
2041	SP000473	DYNAMUTILIN (10KG) BAO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	4560000.00	5100000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:47.775	2025-07-29 12:57:48.781123
2044	SP000470	OXYTOCIN (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	35000.00	35000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:48.078	2025-07-29 12:57:49.078523
2047	SP000467	DYNAMUTILIN 20%	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	370000.00	450000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:48.379	2025-07-29 12:57:49.384951
2050	SP000464	TRANSAMIN (HỘP)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	240000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:48.683	2025-07-29 12:57:49.680252
2053	SP000461	HAN - PROST	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	115000.00	120000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.036	2025-07-29 12:57:50.031081
2056	SP000458	PENDISTREP LA (100ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	150000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.338	2025-07-29 12:57:50.338778
2059	SP000455	BIO - ELECTROLYTES (KG)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	35000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.648	2025-07-29 12:57:50.64779
2062	SP000452	CITIFAC (25KG) BAO	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1700000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:49.944	2025-07-29 12:57:50.941359
2065	SP000448	ECO - FRAM STAR (1Lít)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	73530.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.234	2025-07-29 12:57:51.235503
2068	SP000445	CƯỚC VIETTEL	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	-1.00	0.00	-1.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.546	2025-07-29 12:57:51.54582
2071	SP000442	AGR COXITOP (kg)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	253000.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:50.856	2025-07-29 12:57:51.851986
2074	SP000439	PROTEIN (2lit)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	320000.00	450000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:51.173	2025-07-29 12:57:52.171893
2077	SP000436	CATOSAL 10% 100ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	292000.00	300000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:51.489	2025-07-29 12:57:52.486512
2080	SP000433	THUỐC TÍM	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	100000.00	150000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:51.806	2025-07-29 12:57:52.821296
2083	SP000429	#HIPPRAVIAR- SHS	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	200000.00	240000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.136	2025-07-29 12:57:53.147835
2086	SP000425	TYLANDOX(TYX)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.444	2025-07-29 12:57:53.443878
2089	SP000422	OXYTIN(10G)-ÚM GIA CẦM	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1689.19	10000.00	115.00	0.00	115.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:52.764	2025-07-29 12:57:53.762848
2092	SP000418	TT-ECO AMOXCOLI-S(100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	0.00	3.00	0.00	3.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.067	2025-07-29 12:57:54.064644
2095	SP000413	ESB300(100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	0.00	80000.00	0.00	0.00	0.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.395	2025-07-29 12:57:54.395537
2098	SP000410	QUINOSOL 20% (500ml)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	225000.00	300000.00	4.00	0.00	4.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.696	2025-07-29 12:57:54.698946
2101	SP000403	#BIO - L ND - IB(New B1 + h120)(1000DS)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	96390.00	130000.00	0.00	0.00	0.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:53.999	2025-07-29 12:57:55.004097
2104	SP000400	VV-CHYMOSIN (1KG)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	145000.00	220000.00	20.00	0.00	20.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:54.312	2025-07-29 12:57:55.314384
2107	SP000397	AGR NYSTATIN (100G)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	23000.00	30000.00	4.00	0.00	4.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:54.616	2025-07-29 12:57:55.611416
2110	SP000394	AGR DOXSURE 50% POWER (1KG)	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1650000.00	1800000.00	19.00	0.00	19.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:54.934	2025-07-29 12:57:55.940309
1942	SP000578	#DỊCH TẢ HANVET	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	46499.92	70000.00	41.00	0.00	42.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:37.325	2025-07-29 12:57:38.335049
1611	SP000197	#GUMBORO D78 (1000DS)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	165000.00	200000.00	11.00	0.00	12.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.272	2025-07-29 06:48:53.484799
1622	SP000186	#CIRCO (2000DS)	1	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	259903.23	400000.00	110.00	0.00	121.00	0.00	500.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.372	2025-08-05 08:53:57.727982
1962	SP000558	AGR BUTASAL ATP GOLD 100ml	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	90000.00	120000.00	5.00	0.00	6.00	0.00	50000000.00	f	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:39.493	2025-07-29 12:57:40.494079
1630	SP000178	#CÚM AVAC RE5 (250ml)	2	6	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	155000.00	200000.00	46.00	0.00	54.00	0.00	500.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 06:48:52.373	2025-08-05 08:53:57.727982
1847	SP000677	#AGR IZOVAC ND-EDS-IB	1	1	\N	Hàng hóa	\N	\N	\N	\N	\N	0.00	1250000.00	1600000.00	1.00	0.00	5.00	0.00	50000000.00	t	f	\N	f	t	f	1.0000	\N	\N	t	2025-07-29 12:57:27.289	2025-08-05 08:24:29.140906
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_orders (order_id, order_code, order_date, customer_name, customer_debt, customer_paid, status, notes, created_at) FROM stdin;
\.


--
-- Data for Name: sales_channels; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_channels (channel_id, channel_code, channel_name, description, is_active, created_at) FROM stdin;
1	DIRECT	Bán trực tiếp	Bán hàng trực tiếp tại cửa hàng	t	2025-07-28 19:04:40.502926
2	ONLINE	Bán online	Bán hàng qua kênh online	t	2025-07-28 19:04:40.502926
3	PHONE	Điện thoại	Bán hàng qua điện thoại	t	2025-07-28 19:04:40.502926
4	DELIVERY	Giao hàng	Bán hàng có giao hàng tận nơi	t	2025-07-28 19:04:40.502926
\.


--
-- Data for Name: settings_change_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings_change_log (log_id, setting_key, old_value, new_value, changed_by, change_reason, branch_id, ip_address, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.suppliers (supplier_id, supplier_code, supplier_name, phone, email, address, contact_person, tax_code, payment_terms, notes, is_active, created_at, updated_at) FROM stdin;
112	NCC000051	HẢI CJ	451625	\N	\N	\N	\N	30	\N	t	2025-07-23 03:54:28.707	2025-07-29 06:48:11.695348
113	NCC000050	TRẦN GIA	566431552	\N	\N	\N	\N	30	\N	t	2025-07-16 02:22:11.273	2025-07-29 06:48:11.695348
114	NCC000049	CÔNG TY TÂN TIẾN	15462546	\N	\N	\N	\N	30	\N	t	2025-07-15 23:36:55.142	2025-07-29 06:48:11.695348
115	NCC000048	TIỆM ĐOÁN	4562154	\N	\N	\N	\N	30	\N	t	2025-07-15 02:09:28.42	2025-07-29 06:48:11.695348
116	NCC000047	TÂM UNITEX	1356433	\N	\N	\N	\N	30	\N	t	2025-07-10 00:32:15.397	2025-07-29 06:48:11.695348
117	NCC000046	MẠNH ĐỨC HUY	1254635	\N	\N	\N	\N	30	\N	t	2025-07-02 23:42:52.443	2025-07-29 06:48:11.695348
118	NCC000045	MEGA VET	6524123	\N	\N	\N	\N	30	\N	t	2025-05-14 04:09:08.006	2025-07-29 06:48:11.695348
119	NCC000044	THƯƠNG W.S.P	123654	\N	\N	\N	\N	30	\N	t	2025-05-03 03:39:40.333	2025-07-29 06:48:11.695348
120	NCC000043	TTY BẢO BẢO	4658940	\N	\N	\N	\N	30	\N	t	2025-04-28 00:49:07.64	2025-07-29 06:48:11.695348
121	NCC000042	VACCINE VỊT SÔNG HỒNG	123455677	\N	\N	\N	\N	30	\N	t	2025-04-08 03:48:58.613	2025-07-29 06:48:11.695348
122	NCC000041	CÔNG TY VIRBAC	546256332	\N	\N	\N	\N	30	\N	t	2025-04-02 09:44:11.417	2025-07-29 06:48:11.695348
123	NCC000040	KIM TƯƠI	2366425	\N	\N	\N	\N	30	\N	t	2025-03-07 03:50:52.08	2025-07-29 06:48:11.695348
124	NCC000039	NGUYÊN MSD	45623153	\N	\N	\N	\N	30	\N	t	2025-02-27 10:47:09.223	2025-07-29 06:48:11.695348
125	NCC000038	CƯỜNG THỊNH	46625316	\N	\N	\N	\N	30	\N	t	2025-02-20 03:52:41.042	2025-07-29 06:48:11.695348
126	NCC000037	TRÍ CAGILL	6625452	\N	\N	\N	\N	30	\N	t	2025-02-18 08:40:45.67	2025-07-29 06:48:11.695348
127	NCC000036	ĐẠI LÝ PHƯƠNG ĐÔNG	65654288	\N	\N	\N	\N	30	\N	t	2025-02-18 08:35:22.867	2025-07-29 06:48:11.695348
128	NCC000035	CÔNG TY THAI HOA VET	6354410	\N	\N	\N	\N	30	\N	t	2025-02-18 07:32:52.546	2025-07-29 06:48:11.695348
129	NCC000034	EM HOÀ	65256245	\N	\N	\N	\N	30	\N	t	2025-02-18 02:35:09.769	2025-07-29 06:48:11.695348
130	NCC000033	TIẾN DŨNG	246213	\N	\N	\N	\N	30	\N	t	2025-02-17 02:21:36.797	2025-07-29 06:48:11.695348
131	NCC000032	HÙNG ĐỘI CHÍCH	5462135	\N	\N	\N	\N	30	\N	t	2025-02-15 07:54:11.06	2025-07-29 06:48:11.695348
132	NCC000031	Đại Lý ĐẠI AN	5461223	\N	\N	\N	\N	30	\N	t	2025-02-15 01:48:51.847	2025-07-29 06:48:11.695348
133	NCC000030	THÚ Y XANH	456213	\N	\N	\N	\N	30	\N	t	2025-02-08 09:34:13.25	2025-07-29 06:48:11.695348
134	NCC000029	GIANG CEFOTAXIN	154623	\N	\N	\N	\N	30	\N	t	2025-02-04 00:51:11.753	2025-07-29 06:48:11.695348
135	NCC000028	Kho Thùy Trang	34546677	\N	\N	\N	\N	30	\N	t	2025-02-03 01:18:14.267	2025-07-29 06:48:11.695348
136	NCC000027	Đ.Lý vân quốc(Em Vân Bình Phước)	34533637	\N	\N	\N	\N	30	\N	t	2025-01-17 14:16:10.02	2025-07-29 06:48:11.695348
137	NCC000026	CÔNG TY INTERGREEN	456135	\N	\N	\N	\N	30	\N	t	2025-01-16 00:22:33.19	2025-07-29 06:48:11.695348
138	NCC000025	TRINH - HIPPRA	12345669	\N	\N	\N	\N	30	\N	t	2025-01-11 09:01:58.493	2025-07-29 06:48:11.695348
139	NCC000024	MI TIGER	4562	\N	\N	\N	\N	30	\N	t	2025-01-06 01:58:13.18	2025-07-29 06:48:11.695348
140	NCC000023	CỬA HÀNG THUỲ TRANG	1235469877	\N	\N	\N	\N	30	\N	t	2025-01-04 03:30:32.463	2025-07-29 06:48:11.695348
141	NCC000022	CÔNG TY HTC SÔNG HÔNG	979567015	\N	\N	\N	\N	30	\N	t	2025-01-03 07:39:50.593	2025-07-29 06:48:11.695348
142	NCC000021	THUỲ TRANG	212456	\N	\N	\N	\N	30	\N	t	2025-01-02 03:47:41.339	2025-07-29 06:48:11.695348
143	NCC000020	ĐẠI LÝ CẦN HUỆ	5645266	\N	\N	\N	\N	30	\N	t	2024-12-27 23:53:59.763	2025-07-29 06:48:11.695348
144	NCC000019	HUYỀN TIGER	5462241	\N	\N	\N	\N	30	\N	t	2024-12-27 07:39:42.779	2025-07-29 06:48:11.695348
145	NCC000018	NHUNG VIETVET	12456	\N	\N	\N	\N	30	\N	t	2024-12-26 02:54:07.227	2025-07-29 06:48:11.695348
146	NCC000017	CÔNG TY TOÀN THẮNG	123546	\N	\N	\N	\N	30	\N	t	2024-12-24 09:12:03.243	2025-07-29 06:48:11.695348
147	NCC000016	MƯỢN ANH HƯNG MARTINO	524620	\N	\N	\N	\N	30	\N	t	2024-12-23 23:53:08.549	2025-07-29 06:48:11.695348
148	NCC000015	CÔNG AGRIVIET	0362 043 411	\N	\N	\N	\N	30	\N	t	2024-12-23 09:17:15.877	2025-07-29 06:48:11.695348
149	NCC000014	HƯNG AGRIVIET	0928 736 868	\N	\N	\N	\N	30	\N	t	2024-12-23 09:14:23.393	2025-07-29 06:48:11.695348
150	NCC000013	Đ.Lý Tuyết Hùng	10000	\N	\N	\N	\N	30	\N	t	2024-12-23 09:02:03.56	2025-07-29 06:48:11.695348
151	NCC000012	CÔNG TY TOPCIN	123456	\N	\N	\N	\N	30	\N	t	2024-12-20 07:51:48.807	2025-07-29 06:48:11.695348
152	NCC000011	THÀNH CÔNG	1234	\N	\N	\N	\N	30	\N	t	2024-12-18 10:03:50.427	2025-07-29 06:48:11.695348
153	NCC000010	TUYẾT HÙNG	123	\N	\N	\N	\N	30	\N	t	2024-12-17 10:05:22.797	2025-07-29 06:48:11.695348
154	NCC000009	ĐẠI LÝ TIÊN PHÚC	1235	\N	\N	\N	\N	30	\N	t	2024-12-16 09:44:14.397	2025-07-29 06:48:11.695348
155	NCC000008	ĐẠI LÝ KHOAN DUY	12345	\N	\N	\N	\N	30	\N	t	2024-12-16 03:48:09.64	2025-07-29 06:48:11.695348
156	NCC000007	HÀ HOÀNG	12354	\N	\N	\N	\N	30	\N	t	2024-12-16 00:29:56.23	2025-07-29 06:48:11.695348
157	NCC000006	TIGERVET	3265	\N	\N	\N	\N	30	\N	t	2024-12-13 05:22:02.937	2025-07-29 06:48:11.695348
158	NCC000005	ĐẠI LÝ THÀNH AN	2301	\N	\N	\N	\N	30	\N	t	2024-12-13 05:15:57.183	2025-07-29 06:48:11.695348
159	NCC000004	CÔNG TY NOVAVETTER	123	\N	\N	\N	\N	30	\N	t	2024-12-13 02:08:49.799	2025-07-29 06:48:11.695348
160	NCC000003	VACCINE VỊT	12345678	\N	\N	\N	\N	30	\N	t	2024-12-13 01:56:09.2	2025-07-29 06:48:11.695348
161	NCC000002	CÔNG TY AGRIVIET	1234567	\N	\N	\N	\N	30	\N	t	2024-12-10 09:51:41.213	2025-07-29 06:48:11.695348
162	NCC000001	CÔNG TY VIETVET	123456	\N	\N	\N	\N	30	\N	t	2024-12-10 09:20:17.697	2025-07-29 06:48:11.790548
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_settings (setting_id, setting_key, setting_value, setting_type, category, display_name, description, default_value, validation_rules, is_required, is_system, display_order, is_active, created_at, updated_at) FROM stdin;
1	business_name	Xuân Thùy Veterinary Pharmacy	string	business	Tên doanh nghiệp	Tên chính thức của doanh nghiệp	Xuân Thùy Veterinary Pharmacy	{"maxLength": 200, "minLength": 3}	t	f	1	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
2	business_address		text	business	Địa chỉ doanh nghiệp	Địa chỉ trụ sở chính		{"maxLength": 500}	f	f	2	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
3	business_phone		string	business	Số điện thoại	Số điện thoại liên hệ chính		{"pattern": "^[0-9\\\\s\\\\-\\\\+\\\\(\\\\)]+$"}	f	f	3	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
4	business_email		email	business	Email doanh nghiệp	Email chính thức của doanh nghiệp		{"format": "email"}	f	f	4	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
5	tax_number		string	business	Mã số thuế	Mã số thuế của doanh nghiệp		{"pattern": "^[0-9\\\\-]+$"}	f	f	5	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
6	business_license		string	business	Số giấy phép kinh doanh	Số giấy phép kinh doanh thú y		{}	f	f	6	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
7	default_currency	VND	select	financial	Đơn vị tiền tệ	Đơn vị tiền tệ mặc định	VND	{"options": ["VND", "USD", "EUR"]}	t	f	10	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
8	currency_symbol	₫	string	financial	Ký hiệu tiền tệ	Ký hiệu hiển thị cho tiền tệ	₫	{"maxLength": 5}	t	f	11	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
9	currency_decimal_places	0	number	financial	Số chữ số thập phân	Số chữ số sau dấu phẩy cho tiền tệ	0	{"max": 4, "min": 0}	t	f	12	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
10	vat_rate	10.0	number	financial	Thuế VAT (%)	Tỷ lệ thuế VAT mặc định	10.0	{"max": 100, "min": 0, "step": 0.1}	t	f	13	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
11	discount_limit_percent	50.0	number	financial	Giới hạn giảm giá (%)	Mức giảm giá tối đa cho một giao dịch	50.0	{"max": 100, "min": 0, "step": 0.1}	t	f	14	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
12	payment_methods	["cash", "transfer", "card"]	json	financial	Phương thức thanh toán	Các phương thức thanh toán được chấp nhận	["cash", "transfer", "card"]	{}	t	f	15	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
13	credit_limit_default	5000000	number	financial	Hạn mức công nợ mặc định	Hạn mức công nợ mặc định cho khách hàng mới (VND)	5000000	{"min": 0}	t	f	16	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
14	invoice_due_days	30	number	financial	Thời hạn thanh toán	Số ngày thanh toán mặc định cho hóa đơn	30	{"max": 365, "min": 1}	t	f	17	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
15	low_stock_threshold	10	number	inventory	Ngưỡng cảnh báo tồn kho thấp	Số lượng tồn kho tối thiểu trước khi cảnh báo	10	{"min": 0}	t	f	20	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
16	expiry_warning_days	30	number	inventory	Cảnh báo hết hạn (ngày)	Số ngày trước khi cảnh báo sản phẩm hết hạn	30	{"max": 365, "min": 1}	t	f	21	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
17	auto_reorder_enabled	true	boolean	inventory	Tự động tạo đơn đặt hàng	Tự động tạo đơn đặt hàng khi hết tồn kho	true	{}	f	f	22	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
18	default_markup_percent	25.0	number	inventory	Tỷ lệ lãi mặc định (%)	Tỷ lệ lãi mặc định khi nhập sản phẩm mới	25.0	{"max": 1000, "min": 0, "step": 0.1}	t	f	23	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
19	track_expiry_medicines	true	boolean	inventory	Theo dõi hạn sử dụng thuốc	Bắt buộc theo dõi hạn sử dụng cho thuốc thú y	true	{}	t	f	24	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
20	batch_tracking_enabled	true	boolean	inventory	Theo dõi số lô	Theo dõi số lô sản xuất cho thuốc và vaccine	true	{}	f	f	25	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
21	allow_negative_stock	false	boolean	inventory	Cho phép bán âm kho	Cho phép bán khi tồn kho không đủ	false	{}	f	f	26	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
22	customer_code_prefix	KH	string	customer	Tiền tố mã khách hàng	Tiền tố cho mã khách hàng tự động	KH	{"maxLength": 10}	t	f	30	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
23	customer_code_length	6	number	customer	Độ dài mã khách hàng	Số chữ số trong mã khách hàng (không tính tiền tố)	6	{"max": 10, "min": 3}	t	f	31	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
24	auto_generate_customer_codes	true	boolean	customer	Tự động tạo mã khách hàng	Tự động tạo mã khách hàng khi thêm mới	true	{}	f	f	32	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
25	vip_threshold_amount	50000000	number	customer	Ngưỡng khách hàng VIP	Tổng mua hàng để trở thành khách VIP (VND)	50000000	{"min": 0}	t	f	33	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
26	loyal_customer_orders	20	number	customer	Số đơn hàng khách thân thiết	Số đơn hàng tối thiểu để trở thành khách thân thiết	20	{"min": 1}	t	f	34	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
27	new_customer_credit	1000000	number	customer	Hạn mức khách hàng mới	Hạn mức công nợ mặc định cho khách hàng mới (VND)	1000000	{"min": 0}	t	f	35	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
28	require_customer_phone	false	boolean	customer	Bắt buộc số điện thoại	Bắt buộc nhập số điện thoại khi tạo khách hàng	false	{}	f	f	36	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
29	invoice_code_prefix	HD	string	invoice	Tiền tố mã hóa đơn	Tiền tố cho mã hóa đơn tự động	HD	{"maxLength": 10}	t	f	40	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
30	invoice_code_length	6	number	invoice	Độ dài mã hóa đơn	Số chữ số trong mã hóa đơn (không tính tiền tố)	6	{"max": 10, "min": 3}	t	f	41	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
31	invoice_numbering_reset	yearly	select	invoice	Đặt lại số hóa đơn	Tần suất đặt lại số hóa đơn về 1	yearly	{"options": ["never", "daily", "monthly", "yearly"]}	t	f	42	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
32	auto_print_receipt	true	boolean	invoice	Tự động in hóa đơn	Tự động in hóa đơn sau khi lưu	true	{}	f	f	43	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
33	require_customer_info	false	boolean	invoice	Bắt buộc thông tin khách hàng	Bắt buộc chọn khách hàng khi tạo hóa đơn	false	{}	f	f	44	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
34	invoice_footer_text	Cảm ơn quý khách đã sử dụng dịch vụ!	text	invoice	Dòng chân hóa đơn	Nội dung hiển thị ở cuối hóa đơn	Cảm ơn quý khách đã sử dụng dịch vụ!	{"maxLength": 500}	f	f	45	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
35	show_cost_price_on_invoice	false	boolean	invoice	Hiển thị giá vốn	Hiển thị giá vốn trên hóa đơn (chỉ admin)	false	{}	f	f	46	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
36	items_per_page_default	20	select	ui	Số dòng mỗi trang	Số lượng items hiển thị mặc định trên mỗi trang	20	{"options": ["10", "20", "50", "100"]}	t	f	50	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
37	default_view_mode	grid	select	ui	Chế độ hiển thị mặc định	Chế độ hiển thị danh sách mặc định	grid	{"options": ["grid", "list", "table"]}	t	f	51	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
38	enable_animations	true	boolean	ui	Bật hiệu ứng động	Bật/tắt các hiệu ứng chuyển động trong giao diện	true	{}	f	f	52	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
39	theme_mode	light	select	ui	Chế độ màu sắc	Chế độ màu sắc giao diện	light	{"options": ["light", "dark", "auto"]}	f	f	53	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
40	compact_mode	false	boolean	ui	Chế độ gọn	Giao diện gọn gàng với khoảng cách nhỏ hơn	false	{}	f	f	54	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
41	show_tooltips	true	boolean	ui	Hiển thị gợi ý	Hiển thị tooltip khi hover vào các thành phần	true	{}	f	f	55	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
42	require_prescription_validation	true	boolean	veterinary	Kiểm tra đơn kê thuốc	Bắt buộc kiểm tra đơn kê thuốc cho thuốc kê đơn	true	{}	t	f	60	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
43	prescription_validity_days	30	number	veterinary	Hạn đơn thuốc (ngày)	Số ngày có hiệu lực của đơn kê thuốc	30	{"max": 365, "min": 1}	t	f	61	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
44	dosage_calculation_enabled	true	boolean	veterinary	Tính liều tự động	Tính toán liều thuốc theo cân nặng động vật	true	{}	f	f	62	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
45	drug_interaction_check	true	boolean	veterinary	Kiểm tra tương tác thuốc	Cảnh báo khi có tương tác giữa các loại thuốc	true	{}	f	f	63	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
46	vaccine_cold_chain_tracking	true	boolean	veterinary	Theo dõi chuỗi lạnh vaccine	Theo dõi điều kiện bảo quản vaccine	true	{}	t	f	64	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
47	email_notifications_enabled	true	boolean	notification	Bật thông báo email	Cho phép gửi thông báo qua email	true	{}	f	f	70	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
48	sms_notifications_enabled	false	boolean	notification	Bật thông báo SMS	Cho phép gửi thông báo qua SMS	false	{}	f	f	71	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
49	low_stock_notification	true	boolean	notification	Thông báo hết hàng	Thông báo khi sản phẩm sắp hết	true	{}	f	f	72	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
50	expiry_notification	true	boolean	notification	Thông báo hết hạn	Thông báo khi sản phẩm sắp hết hạn	true	{}	f	f	73	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
51	payment_reminder_enabled	true	boolean	notification	Nhắc nhở thanh toán	Gửi nhắc nhở thanh toán cho khách hàng	true	{}	f	f	74	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
52	auto_backup_enabled	true	boolean	security	Sao lưu tự động	Tự động sao lưu dữ liệu hàng ngày	true	{}	f	f	80	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
53	backup_retention_days	30	number	security	Lưu giữ sao lưu (ngày)	Số ngày lưu giữ file sao lưu	30	{"max": 365, "min": 7}	t	f	81	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
54	session_timeout_minutes	120	number	security	Thời gian phiên làm việc	Thời gian tự động đăng xuất (phút)	120	{"max": 480, "min": 15}	t	f	82	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
55	password_min_length	6	number	security	Độ dài mật khẩu tối thiểu	Số ký tự tối thiểu cho mật khẩu	6	{"max": 20, "min": 4}	t	f	83	t	2025-08-02 08:15:14.800227	2025-08-02 08:15:14.800227
\.


--
-- Data for Name: units; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.units (unit_id, unit_code, unit_name, unit_symbol, is_base_unit, conversion_rate, is_active, created_at) FROM stdin;
1	PCS	Cái	cái	t	1.0000	t	2025-07-28 19:04:40.502926
2	KG	Kilogram	kg	f	1.0000	t	2025-07-28 19:04:40.502926
3	PILL	Viên	viên	f	1.0000	t	2025-07-28 19:04:40.502926
4	BAG	Bao	bao	f	1.0000	t	2025-07-28 19:04:40.502926
5	BOX	Hộp	hộp	f	1.0000	t	2025-07-28 19:04:40.502926
6	DEFAULT	Đơn vị mặc định		t	1.0000	t	2025-07-28 19:04:40.502926
7	BOTTLE	Lọ	lọ	f	1.0000	t	2025-07-28 19:04:40.502926
8	TIME	Lần	lần	f	1.0000	t	2025-07-28 19:04:40.502926
\.


--
-- Name: branch_settings_branch_setting_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.branch_settings_branch_setting_id_seq', 4, true);


--
-- Name: branches_branch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.branches_branch_id_seq', 5, true);


--
-- Name: customer_types_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_types_type_id_seq', 15, true);


--
-- Name: customers_customer_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customers_customer_id_seq', 1228, true);


--
-- Name: debt_transactions_transaction_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.debt_transactions_transaction_id_seq', 6, true);


--
-- Name: financial_transactions_transaction_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.financial_transactions_transaction_id_seq', 281, true);


--
-- Name: invoice_details_detail_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoice_details_detail_id_seq', 2846, true);


--
-- Name: invoices_invoice_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoices_invoice_id_seq', 752, true);


--
-- Name: product_categories_category_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_categories_category_id_seq', 25, true);


--
-- Name: product_units_product_unit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_units_product_unit_id_seq', 1, false);


--
-- Name: products_product_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_product_id_seq', 2112, true);


--
-- Name: purchase_orders_order_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_orders_order_id_seq', 1, false);


--
-- Name: sales_channels_channel_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sales_channels_channel_id_seq', 4, true);


--
-- Name: settings_change_log_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.settings_change_log_log_id_seq', 1, false);


--
-- Name: suppliers_supplier_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.suppliers_supplier_id_seq', 162, true);


--
-- Name: system_settings_setting_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.system_settings_setting_id_seq', 55, true);


--
-- Name: units_unit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.units_unit_id_seq', 40, true);


--
-- Name: branch_settings branch_settings_branch_id_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_settings
    ADD CONSTRAINT branch_settings_branch_id_setting_key_key UNIQUE (branch_id, setting_key);


--
-- Name: branch_settings branch_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_settings
    ADD CONSTRAINT branch_settings_pkey PRIMARY KEY (branch_setting_id);


--
-- Name: branches branches_branch_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_branch_code_key UNIQUE (branch_code);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (branch_id);


--
-- Name: customer_types customer_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_pkey PRIMARY KEY (type_id);


--
-- Name: customer_types customer_types_type_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_type_code_key UNIQUE (type_code);


--
-- Name: customers customers_customer_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (customer_id);


--
-- Name: debt_transactions debt_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_transactions
    ADD CONSTRAINT debt_transactions_pkey PRIMARY KEY (transaction_id);


--
-- Name: financial_transactions financial_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_pkey PRIMARY KEY (transaction_id);


--
-- Name: financial_transactions financial_transactions_transaction_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_transaction_code_key UNIQUE (transaction_code);


--
-- Name: invoice_details invoice_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT invoice_details_pkey PRIMARY KEY (detail_id);


--
-- Name: invoices invoices_invoice_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_code_key UNIQUE (invoice_code);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (invoice_id);


--
-- Name: product_categories product_categories_category_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_category_code_key UNIQUE (category_code);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (category_id);


--
-- Name: product_units product_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_pkey PRIMARY KEY (product_unit_id);


--
-- Name: product_units product_units_product_id_unit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_product_id_unit_id_key UNIQUE (product_id, unit_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (product_id);


--
-- Name: products products_product_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_product_code_key UNIQUE (product_code);


--
-- Name: purchase_orders purchase_orders_order_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_order_code_key UNIQUE (order_code);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (order_id);


--
-- Name: sales_channels sales_channels_channel_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_channels
    ADD CONSTRAINT sales_channels_channel_code_key UNIQUE (channel_code);


--
-- Name: sales_channels sales_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_channels
    ADD CONSTRAINT sales_channels_pkey PRIMARY KEY (channel_id);


--
-- Name: settings_change_log settings_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings_change_log
    ADD CONSTRAINT settings_change_log_pkey PRIMARY KEY (log_id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (supplier_id);


--
-- Name: suppliers suppliers_supplier_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_supplier_code_key UNIQUE (supplier_code);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (setting_id);


--
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (unit_id);


--
-- Name: units units_unit_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_unit_code_key UNIQUE (unit_code);


--
-- Name: idx_branch_settings_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_settings_branch ON public.branch_settings USING btree (branch_id);


--
-- Name: idx_branch_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_settings_key ON public.branch_settings USING btree (setting_key);


--
-- Name: idx_customers_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_branch ON public.customers USING btree (branch_created_id);


--
-- Name: idx_customers_branch_created_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_branch_created_id ON public.customers USING btree (branch_created_id);


--
-- Name: idx_customers_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_code ON public.customers USING btree (customer_code);


--
-- Name: idx_customers_current_debt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_current_debt ON public.customers USING btree (current_debt) WHERE (current_debt <> (0)::numeric);


--
-- Name: idx_customers_customer_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_customer_code ON public.customers USING btree (customer_code);


--
-- Name: idx_customers_customer_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_customer_type_id ON public.customers USING btree (customer_type_id);


--
-- Name: idx_customers_debt_limit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_debt_limit ON public.customers USING btree (debt_limit) WHERE (debt_limit > (0)::numeric);


--
-- Name: idx_customers_debt_over_limit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_debt_over_limit ON public.customers USING btree (current_debt, debt_limit) WHERE (current_debt > debt_limit);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_customers_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_type ON public.customers USING btree (customer_type_id);


--
-- Name: idx_debt_transactions_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_transactions_composite ON public.debt_transactions USING btree (customer_id, created_at DESC);


--
-- Name: idx_debt_transactions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_transactions_created_at ON public.debt_transactions USING btree (created_at);


--
-- Name: idx_debt_transactions_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_transactions_customer_id ON public.debt_transactions USING btree (customer_id);


--
-- Name: idx_debt_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_transactions_type ON public.debt_transactions USING btree (transaction_type);


--
-- Name: idx_financial_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_transactions_date ON public.financial_transactions USING btree (transaction_date);


--
-- Name: idx_financial_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_transactions_type ON public.financial_transactions USING btree (transaction_type);


--
-- Name: idx_invoice_details_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_customer ON public.invoice_details USING btree (customer_code);


--
-- Name: idx_invoice_details_customer_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_customer_code ON public.invoice_details USING btree (customer_code);


--
-- Name: idx_invoice_details_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_customer_id ON public.invoice_details USING btree (customer_id);


--
-- Name: idx_invoice_details_customer_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_customer_product ON public.invoice_details USING btree (customer_id, product_id);


--
-- Name: idx_invoice_details_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_date ON public.invoice_details USING btree (invoice_date);


--
-- Name: idx_invoice_details_date_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_date_customer ON public.invoice_details USING btree (invoice_date, customer_id);


--
-- Name: idx_invoice_details_date_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_date_product ON public.invoice_details USING btree (invoice_date, product_id);


--
-- Name: idx_invoice_details_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_invoice ON public.invoice_details USING btree (invoice_id);


--
-- Name: idx_invoice_details_invoice_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_invoice_code ON public.invoice_details USING btree (invoice_code);


--
-- Name: idx_invoice_details_invoice_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_invoice_date ON public.invoice_details USING btree (invoice_date);


--
-- Name: idx_invoice_details_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_invoice_id ON public.invoice_details USING btree (invoice_id);


--
-- Name: idx_invoice_details_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_product ON public.invoice_details USING btree (product_id);


--
-- Name: idx_invoice_details_product_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_product_code ON public.invoice_details USING btree (product_code);


--
-- Name: idx_invoice_details_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_product_id ON public.invoice_details USING btree (product_id);


--
-- Name: idx_invoices_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_code ON public.invoices USING btree (invoice_code);


--
-- Name: idx_invoices_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer ON public.invoices USING btree (customer_id);


--
-- Name: idx_invoices_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer_id ON public.invoices USING btree (customer_id);


--
-- Name: idx_invoices_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_date ON public.invoices USING btree (invoice_date);


--
-- Name: idx_invoices_date_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_date_customer ON public.invoices USING btree (invoice_date, customer_id);


--
-- Name: idx_invoices_invoice_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_invoice_code ON public.invoices USING btree (invoice_code);


--
-- Name: idx_invoices_invoice_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_invoice_date ON public.invoices USING btree (invoice_date);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_product_units_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_units_product ON public.product_units USING btree (product_id);


--
-- Name: idx_product_units_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_units_unit ON public.product_units USING btree (unit_id);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree (is_active);


--
-- Name: idx_products_allow_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_allow_sale ON public.products USING btree (allow_sale);


--
-- Name: idx_products_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_barcode ON public.products USING btree (barcode);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);


--
-- Name: idx_products_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);


--
-- Name: idx_products_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_code ON public.products USING btree (product_code);


--
-- Name: idx_products_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_name ON public.products USING btree (product_name);


--
-- Name: idx_products_product_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_product_code ON public.products USING btree (product_code);


--
-- Name: idx_purchase_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_customer ON public.purchase_orders USING btree (customer_name);


--
-- Name: idx_purchase_orders_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_date ON public.purchase_orders USING btree (order_date);


--
-- Name: idx_settings_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_log_date ON public.settings_change_log USING btree (created_at);


--
-- Name: idx_settings_log_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_log_key ON public.settings_change_log USING btree (setting_key);


--
-- Name: idx_suppliers_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_code ON public.suppliers USING btree (supplier_code);


--
-- Name: idx_suppliers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_name ON public.suppliers USING btree (supplier_name);


--
-- Name: idx_system_settings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_active ON public.system_settings USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_system_settings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_category ON public.system_settings USING btree (category);


--
-- Name: idx_system_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_key ON public.system_settings USING btree (setting_key);


--
-- Name: idx_system_settings_required; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_required ON public.system_settings USING btree (is_required) WHERE (is_required = true);


--
-- Name: branch_settings update_branch_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_branch_settings_updated_at BEFORE UPDATE ON public.branch_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: system_settings update_system_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: branch_settings branch_settings_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_settings
    ADD CONSTRAINT branch_settings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(branch_id) ON DELETE CASCADE;


--
-- Name: customers customers_branch_created_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_branch_created_id_fkey FOREIGN KEY (branch_created_id) REFERENCES public.branches(branch_id);


--
-- Name: customers customers_customer_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_type_id_fkey FOREIGN KEY (customer_type_id) REFERENCES public.customer_types(type_id);


--
-- Name: debt_transactions debt_transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_transactions
    ADD CONSTRAINT debt_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);


--
-- Name: debt_transactions debt_transactions_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_transactions
    ADD CONSTRAINT debt_transactions_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(invoice_id);


--
-- Name: customers fk_customers_branch_created_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT fk_customers_branch_created_id FOREIGN KEY (branch_created_id) REFERENCES public.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: customers fk_customers_customer_type_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT fk_customers_customer_type_id FOREIGN KEY (customer_type_id) REFERENCES public.customer_types(type_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoice_details fk_invoice_details_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_customer FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);


--
-- Name: invoice_details fk_invoice_details_customer_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoice_details fk_invoice_details_invoice_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_invoice_id FOREIGN KEY (invoice_id) REFERENCES public.invoices(invoice_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoice_details fk_invoice_details_product; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_product FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- Name: invoice_details fk_invoice_details_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_product_id FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoices fk_invoices_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);


--
-- Name: invoices fk_invoices_customer_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT fk_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: products fk_products_category_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_products_category_id FOREIGN KEY (category_id) REFERENCES public.product_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoice_details invoice_details_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT invoice_details_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(branch_id);


--
-- Name: invoice_details invoice_details_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT invoice_details_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(invoice_id) ON DELETE CASCADE;


--
-- Name: invoice_details invoice_details_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT invoice_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- Name: invoices invoices_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(branch_id);


--
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);


--
-- Name: product_categories product_categories_parent_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_parent_category_id_fkey FOREIGN KEY (parent_category_id) REFERENCES public.product_categories(category_id);


--
-- Name: product_units product_units_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON DELETE CASCADE;


--
-- Name: product_units product_units_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(unit_id);


--
-- Name: products products_base_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_base_unit_id_fkey FOREIGN KEY (base_unit_id) REFERENCES public.units(unit_id);


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(category_id);


--
-- Name: settings_change_log settings_change_log_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings_change_log
    ADD CONSTRAINT settings_change_log_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(branch_id);


--
-- PostgreSQL database dump complete
--

