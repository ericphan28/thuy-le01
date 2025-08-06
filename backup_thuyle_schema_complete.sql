--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.4

-- Started on 2025-08-06 06:57:10

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
-- TOC entry 12 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- TOC entry 4145 (class 0 OID 0)
-- Dependencies: 12
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 487 (class 1255 OID 36597)
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
-- TOC entry 4146 (class 0 OID 0)
-- Dependencies: 487
-- Name: FUNCTION adjust_customer_debt(p_customer_id integer, p_adjustment_amount numeric, p_adjustment_type character varying, p_reason text, p_created_by character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.adjust_customer_debt(p_customer_id integer, p_adjustment_amount numeric, p_adjustment_type character varying, p_reason text, p_created_by character varying) IS 'Điều chỉnh công nợ khách hàng (tăng/giảm/xóa nợ) với lý do rõ ràng';


--
-- TOC entry 427 (class 1255 OID 33772)
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
-- TOC entry 4147 (class 0 OID 0)
-- Dependencies: 427
-- Name: FUNCTION create_pos_invoice(p_customer_id integer, p_cart_items jsonb, p_vat_rate numeric, p_discount_type character varying, p_discount_value numeric, p_payment_method character varying, p_received_amount numeric, p_branch_id integer, p_created_by character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_pos_invoice(p_customer_id integer, p_cart_items jsonb, p_vat_rate numeric, p_discount_type character varying, p_discount_value numeric, p_payment_method character varying, p_received_amount numeric, p_branch_id integer, p_created_by character varying) IS 'FINAL POS Checkout Function: Clean, efficient invoice creation with dedicated VAT/discount columns.
Uses meaningful notes format without redundant prefixes. Handles complete business logic validation.';


--
-- TOC entry 442 (class 1255 OID 36598)
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
-- TOC entry 4148 (class 0 OID 0)
-- Dependencies: 442
-- Name: FUNCTION get_debt_dashboard_stats(date_from date, date_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_debt_dashboard_stats(date_from date, date_to date) IS 'Lấy thống kê tổng quan cho dashboard quản lý công nợ';


--
-- TOC entry 503 (class 1255 OID 27238)
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
-- TOC entry 501 (class 1255 OID 27237)
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
-- TOC entry 496 (class 1255 OID 27239)
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
-- TOC entry 448 (class 1255 OID 27234)
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
-- TOC entry 449 (class 1255 OID 31286)
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
-- TOC entry 425 (class 1255 OID 31288)
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
-- TOC entry 454 (class 1255 OID 36596)
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
-- TOC entry 4149 (class 0 OID 0)
-- Dependencies: 454
-- Name: FUNCTION pay_customer_debt(p_customer_id integer, p_payment_amount numeric, p_payment_method character varying, p_notes text, p_created_by character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.pay_customer_debt(p_customer_id integer, p_payment_amount numeric, p_payment_method character varying, p_notes text, p_created_by character varying) IS 'Thu tiền công nợ từ khách hàng với validation và logging đầy đủ';


--
-- TOC entry 459 (class 1255 OID 27236)
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
-- TOC entry 446 (class 1255 OID 36599)
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
-- TOC entry 4150 (class 0 OID 0)
-- Dependencies: 446
-- Name: FUNCTION search_debt_customers(search_term text, debt_status_filter character varying, risk_level_filter character varying, limit_count integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_debt_customers(search_term text, debt_status_filter character varying, risk_level_filter character varying, limit_count integer) IS 'Tìm kiếm khách hàng có công nợ với các bộ lọc nâng cao';


--
-- TOC entry 523 (class 1255 OID 27235)
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
-- TOC entry 539 (class 1255 OID 31287)
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
-- TOC entry 524 (class 1255 OID 31291)
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
-- TOC entry 538 (class 1255 OID 31294)
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
-- TOC entry 468 (class 1255 OID 22432)
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
-- TOC entry 414 (class 1259 OID 31250)
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
-- TOC entry 413 (class 1259 OID 31249)
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
-- TOC entry 4151 (class 0 OID 0)
-- Dependencies: 413
-- Name: branch_settings_branch_setting_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branch_settings_branch_setting_id_seq OWNED BY public.branch_settings.branch_setting_id;


--
-- TOC entry 382 (class 1259 OID 22945)
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
-- TOC entry 381 (class 1259 OID 22944)
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
-- TOC entry 4152 (class 0 OID 0)
-- Dependencies: 381
-- Name: branches_branch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branches_branch_id_seq OWNED BY public.branches.branch_id;


--
-- TOC entry 384 (class 1259 OID 22959)
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
-- TOC entry 383 (class 1259 OID 22958)
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
-- TOC entry 4153 (class 0 OID 0)
-- Dependencies: 383
-- Name: customer_types_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_types_type_id_seq OWNED BY public.customer_types.type_id;


--
-- TOC entry 392 (class 1259 OID 23058)
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
-- TOC entry 391 (class 1259 OID 23057)
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
-- TOC entry 4154 (class 0 OID 0)
-- Dependencies: 391
-- Name: customers_customer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_customer_id_seq OWNED BY public.customers.customer_id;


--
-- TOC entry 400 (class 1259 OID 25227)
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
-- TOC entry 4155 (class 0 OID 0)
-- Dependencies: 400
-- Name: COLUMN invoices.discount_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.discount_type IS 'Loại giảm giá: percentage (%) hoặc amount (số tiền)';


--
-- TOC entry 4156 (class 0 OID 0)
-- Dependencies: 400
-- Name: COLUMN invoices.discount_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.discount_value IS 'Giá trị giảm giá (% hoặc số tiền tùy theo type)';


--
-- TOC entry 4157 (class 0 OID 0)
-- Dependencies: 400
-- Name: COLUMN invoices.vat_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.vat_rate IS 'Tỷ lệ VAT (%) - 0, 5, 8, 10';


--
-- TOC entry 4158 (class 0 OID 0)
-- Dependencies: 400
-- Name: COLUMN invoices.vat_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.vat_amount IS 'Số tiền VAT tính được';


--
-- TOC entry 409 (class 1259 OID 27240)
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
-- TOC entry 420 (class 1259 OID 36586)
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
-- TOC entry 4159 (class 0 OID 0)
-- Dependencies: 420
-- Name: VIEW debt_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.debt_summary IS 'Tổng quan công nợ khách hàng với phân loại rủi ro và ưu tiên thu nợ';


--
-- TOC entry 419 (class 1259 OID 36447)
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
-- TOC entry 421 (class 1259 OID 36591)
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
-- TOC entry 4160 (class 0 OID 0)
-- Dependencies: 421
-- Name: VIEW debt_transactions_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.debt_transactions_history IS 'Lịch sử giao dịch công nợ với thông tin khách hàng và hóa đơn liên quan';


--
-- TOC entry 418 (class 1259 OID 36446)
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
-- TOC entry 4161 (class 0 OID 0)
-- Dependencies: 418
-- Name: debt_transactions_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.debt_transactions_transaction_id_seq OWNED BY public.debt_transactions.transaction_id;


--
-- TOC entry 406 (class 1259 OID 25326)
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
-- TOC entry 405 (class 1259 OID 25325)
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
-- TOC entry 4162 (class 0 OID 0)
-- Dependencies: 405
-- Name: financial_transactions_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financial_transactions_transaction_id_seq OWNED BY public.financial_transactions.transaction_id;


--
-- TOC entry 402 (class 1259 OID 25257)
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
-- TOC entry 401 (class 1259 OID 25256)
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
-- TOC entry 4163 (class 0 OID 0)
-- Dependencies: 401
-- Name: invoice_details_detail_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_details_detail_id_seq OWNED BY public.invoice_details.detail_id;


--
-- TOC entry 396 (class 1259 OID 23111)
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
-- TOC entry 407 (class 1259 OID 25627)
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
-- TOC entry 399 (class 1259 OID 25226)
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
-- TOC entry 4164 (class 0 OID 0)
-- Dependencies: 399
-- Name: invoices_invoice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_invoice_id_seq OWNED BY public.invoices.invoice_id;


--
-- TOC entry 408 (class 1259 OID 25632)
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
-- TOC entry 388 (class 1259 OID 22985)
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
-- TOC entry 410 (class 1259 OID 27244)
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
-- TOC entry 387 (class 1259 OID 22984)
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
-- TOC entry 4165 (class 0 OID 0)
-- Dependencies: 387
-- Name: product_categories_category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_categories_category_id_seq OWNED BY public.product_categories.category_id;


--
-- TOC entry 398 (class 1259 OID 23157)
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
-- TOC entry 397 (class 1259 OID 23156)
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
-- TOC entry 4166 (class 0 OID 0)
-- Dependencies: 397
-- Name: product_units_product_unit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_units_product_unit_id_seq OWNED BY public.product_units.product_unit_id;


--
-- TOC entry 395 (class 1259 OID 23110)
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
-- TOC entry 4167 (class 0 OID 0)
-- Dependencies: 395
-- Name: products_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_product_id_seq OWNED BY public.products.product_id;


--
-- TOC entry 404 (class 1259 OID 25309)
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
-- TOC entry 403 (class 1259 OID 25308)
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
-- TOC entry 4168 (class 0 OID 0)
-- Dependencies: 403
-- Name: purchase_orders_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_orders_order_id_seq OWNED BY public.purchase_orders.order_id;


--
-- TOC entry 390 (class 1259 OID 23003)
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
-- TOC entry 389 (class 1259 OID 23002)
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
-- TOC entry 4169 (class 0 OID 0)
-- Dependencies: 389
-- Name: sales_channels_channel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_channels_channel_id_seq OWNED BY public.sales_channels.channel_id;


--
-- TOC entry 416 (class 1259 OID 31270)
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
-- TOC entry 415 (class 1259 OID 31269)
-- Name: settings_change_log_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settings_change_log_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 4170 (class 0 OID 0)
-- Dependencies: 415
-- Name: settings_change_log_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settings_change_log_log_id_seq OWNED BY public.settings_change_log.log_id;


--
-- TOC entry 394 (class 1259 OID 23094)
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
-- TOC entry 393 (class 1259 OID 23093)
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
-- TOC entry 4171 (class 0 OID 0)
-- Dependencies: 393
-- Name: suppliers_supplier_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_supplier_id_seq OWNED BY public.suppliers.supplier_id;


--
-- TOC entry 412 (class 1259 OID 31229)
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
-- TOC entry 417 (class 1259 OID 31295)
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
-- TOC entry 411 (class 1259 OID 31228)
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
-- TOC entry 4172 (class 0 OID 0)
-- Dependencies: 411
-- Name: system_settings_setting_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_setting_id_seq OWNED BY public.system_settings.setting_id;


--
-- TOC entry 386 (class 1259 OID 22972)
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
-- TOC entry 385 (class 1259 OID 22971)
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
-- TOC entry 4173 (class 0 OID 0)
-- Dependencies: 385
-- Name: units_unit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.units_unit_id_seq OWNED BY public.units.unit_id;


--
-- TOC entry 3808 (class 2604 OID 31253)
-- Name: branch_settings branch_setting_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_settings ALTER COLUMN branch_setting_id SET DEFAULT nextval('public.branch_settings_branch_setting_id_seq'::regclass);


--
-- TOC entry 3704 (class 2604 OID 22948)
-- Name: branches branch_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches ALTER COLUMN branch_id SET DEFAULT nextval('public.branches_branch_id_seq'::regclass);


--
-- TOC entry 3708 (class 2604 OID 22962)
-- Name: customer_types type_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types ALTER COLUMN type_id SET DEFAULT nextval('public.customer_types_type_id_seq'::regclass);


--
-- TOC entry 3722 (class 2604 OID 23061)
-- Name: customers customer_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN customer_id SET DEFAULT nextval('public.customers_customer_id_seq'::regclass);


--
-- TOC entry 3813 (class 2604 OID 36450)
-- Name: debt_transactions transaction_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_transactions ALTER COLUMN transaction_id SET DEFAULT nextval('public.debt_transactions_transaction_id_seq'::regclass);


--
-- TOC entry 3797 (class 2604 OID 25329)
-- Name: financial_transactions transaction_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions ALTER COLUMN transaction_id SET DEFAULT nextval('public.financial_transactions_transaction_id_seq'::regclass);


--
-- TOC entry 3773 (class 2604 OID 25260)
-- Name: invoice_details detail_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details ALTER COLUMN detail_id SET DEFAULT nextval('public.invoice_details_detail_id_seq'::regclass);


--
-- TOC entry 3763 (class 2604 OID 25230)
-- Name: invoices invoice_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN invoice_id SET DEFAULT nextval('public.invoices_invoice_id_seq'::regclass);


--
-- TOC entry 3716 (class 2604 OID 22988)
-- Name: product_categories category_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories ALTER COLUMN category_id SET DEFAULT nextval('public.product_categories_category_id_seq'::regclass);


--
-- TOC entry 3759 (class 2604 OID 23160)
-- Name: product_units product_unit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units ALTER COLUMN product_unit_id SET DEFAULT nextval('public.product_units_product_unit_id_seq'::regclass);


--
-- TOC entry 3739 (class 2604 OID 23114)
-- Name: products product_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN product_id SET DEFAULT nextval('public.products_product_id_seq'::regclass);


--
-- TOC entry 3792 (class 2604 OID 25312)
-- Name: purchase_orders order_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN order_id SET DEFAULT nextval('public.purchase_orders_order_id_seq'::regclass);


--
-- TOC entry 3719 (class 2604 OID 23006)
-- Name: sales_channels channel_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_channels ALTER COLUMN channel_id SET DEFAULT nextval('public.sales_channels_channel_id_seq'::regclass);


--
-- TOC entry 3811 (class 2604 OID 31273)
-- Name: settings_change_log log_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings_change_log ALTER COLUMN log_id SET DEFAULT nextval('public.settings_change_log_log_id_seq'::regclass);


--
-- TOC entry 3734 (class 2604 OID 23097)
-- Name: suppliers supplier_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN supplier_id SET DEFAULT nextval('public.suppliers_supplier_id_seq'::regclass);


--
-- TOC entry 3799 (class 2604 OID 31232)
-- Name: system_settings setting_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN setting_id SET DEFAULT nextval('public.system_settings_setting_id_seq'::regclass);


--
-- TOC entry 3711 (class 2604 OID 22975)
-- Name: units unit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units ALTER COLUMN unit_id SET DEFAULT nextval('public.units_unit_id_seq'::regclass);


--
-- TOC entry 3941 (class 2606 OID 31261)
-- Name: branch_settings branch_settings_branch_id_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_settings
    ADD CONSTRAINT branch_settings_branch_id_setting_key_key UNIQUE (branch_id, setting_key);


--
-- TOC entry 3943 (class 2606 OID 31259)
-- Name: branch_settings branch_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_settings
    ADD CONSTRAINT branch_settings_pkey PRIMARY KEY (branch_setting_id);


--
-- TOC entry 3835 (class 2606 OID 22957)
-- Name: branches branches_branch_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_branch_code_key UNIQUE (branch_code);


--
-- TOC entry 3837 (class 2606 OID 22955)
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (branch_id);


--
-- TOC entry 3839 (class 2606 OID 22968)
-- Name: customer_types customer_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_pkey PRIMARY KEY (type_id);


--
-- TOC entry 3841 (class 2606 OID 22970)
-- Name: customer_types customer_types_type_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_type_code_key UNIQUE (type_code);


--
-- TOC entry 3855 (class 2606 OID 23078)
-- Name: customers customers_customer_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);


--
-- TOC entry 3857 (class 2606 OID 23076)
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (customer_id);


--
-- TOC entry 3951 (class 2606 OID 36455)
-- Name: debt_transactions debt_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_transactions
    ADD CONSTRAINT debt_transactions_pkey PRIMARY KEY (transaction_id);


--
-- TOC entry 3927 (class 2606 OID 25334)
-- Name: financial_transactions financial_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_pkey PRIMARY KEY (transaction_id);


--
-- TOC entry 3929 (class 2606 OID 25336)
-- Name: financial_transactions financial_transactions_transaction_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_transaction_code_key UNIQUE (transaction_code);


--
-- TOC entry 3919 (class 2606 OID 25287)
-- Name: invoice_details invoice_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT invoice_details_pkey PRIMARY KEY (detail_id);


--
-- TOC entry 3901 (class 2606 OID 25242)
-- Name: invoices invoices_invoice_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_code_key UNIQUE (invoice_code);


--
-- TOC entry 3903 (class 2606 OID 25240)
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (invoice_id);


--
-- TOC entry 3847 (class 2606 OID 22996)
-- Name: product_categories product_categories_category_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_category_code_key UNIQUE (category_code);


--
-- TOC entry 3849 (class 2606 OID 22994)
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (category_id);


--
-- TOC entry 3889 (class 2606 OID 23165)
-- Name: product_units product_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_pkey PRIMARY KEY (product_unit_id);


--
-- TOC entry 3891 (class 2606 OID 23167)
-- Name: product_units product_units_product_id_unit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_product_id_unit_id_key UNIQUE (product_id, unit_id);


--
-- TOC entry 3883 (class 2606 OID 23137)
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (product_id);


--
-- TOC entry 3885 (class 2606 OID 23139)
-- Name: products products_product_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_product_code_key UNIQUE (product_code);


--
-- TOC entry 3923 (class 2606 OID 25322)
-- Name: purchase_orders purchase_orders_order_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_order_code_key UNIQUE (order_code);


--
-- TOC entry 3925 (class 2606 OID 25320)
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (order_id);


--
-- TOC entry 3851 (class 2606 OID 23014)
-- Name: sales_channels sales_channels_channel_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_channels
    ADD CONSTRAINT sales_channels_channel_code_key UNIQUE (channel_code);


--
-- TOC entry 3853 (class 2606 OID 23012)
-- Name: sales_channels sales_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_channels
    ADD CONSTRAINT sales_channels_pkey PRIMARY KEY (channel_id);


--
-- TOC entry 3949 (class 2606 OID 31278)
-- Name: settings_change_log settings_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings_change_log
    ADD CONSTRAINT settings_change_log_pkey PRIMARY KEY (log_id);


--
-- TOC entry 3871 (class 2606 OID 23105)
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (supplier_id);


--
-- TOC entry 3873 (class 2606 OID 23107)
-- Name: suppliers suppliers_supplier_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_supplier_code_key UNIQUE (supplier_code);


--
-- TOC entry 3937 (class 2606 OID 31244)
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (setting_id);


--
-- TOC entry 3939 (class 2606 OID 31246)
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);


--
-- TOC entry 3843 (class 2606 OID 22981)
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (unit_id);


--
-- TOC entry 3845 (class 2606 OID 22983)
-- Name: units units_unit_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_unit_code_key UNIQUE (unit_code);


--
-- TOC entry 3944 (class 1259 OID 31267)
-- Name: idx_branch_settings_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_settings_branch ON public.branch_settings USING btree (branch_id);


--
-- TOC entry 3945 (class 1259 OID 31268)
-- Name: idx_branch_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_settings_key ON public.branch_settings USING btree (setting_key);


--
-- TOC entry 3858 (class 1259 OID 23092)
-- Name: idx_customers_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_branch ON public.customers USING btree (branch_created_id);


--
-- TOC entry 3859 (class 1259 OID 26940)
-- Name: idx_customers_branch_created_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_branch_created_id ON public.customers USING btree (branch_created_id);


--
-- TOC entry 3860 (class 1259 OID 23089)
-- Name: idx_customers_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_code ON public.customers USING btree (customer_code);


--
-- TOC entry 3861 (class 1259 OID 36604)
-- Name: idx_customers_current_debt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_current_debt ON public.customers USING btree (current_debt) WHERE (current_debt <> (0)::numeric);


--
-- TOC entry 3862 (class 1259 OID 26938)
-- Name: idx_customers_customer_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_customer_code ON public.customers USING btree (customer_code);


--
-- TOC entry 3863 (class 1259 OID 26939)
-- Name: idx_customers_customer_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_customer_type_id ON public.customers USING btree (customer_type_id);


--
-- TOC entry 3864 (class 1259 OID 36605)
-- Name: idx_customers_debt_limit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_debt_limit ON public.customers USING btree (debt_limit) WHERE (debt_limit > (0)::numeric);


--
-- TOC entry 3865 (class 1259 OID 36606)
-- Name: idx_customers_debt_over_limit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_debt_over_limit ON public.customers USING btree (current_debt, debt_limit) WHERE (current_debt > debt_limit);


--
-- TOC entry 3866 (class 1259 OID 23090)
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- TOC entry 3867 (class 1259 OID 23091)
-- Name: idx_customers_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_type ON public.customers USING btree (customer_type_id);


--
-- TOC entry 3952 (class 1259 OID 36603)
-- Name: idx_debt_transactions_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_transactions_composite ON public.debt_transactions USING btree (customer_id, created_at DESC);


--
-- TOC entry 3953 (class 1259 OID 36601)
-- Name: idx_debt_transactions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_transactions_created_at ON public.debt_transactions USING btree (created_at);


--
-- TOC entry 3954 (class 1259 OID 36600)
-- Name: idx_debt_transactions_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_transactions_customer_id ON public.debt_transactions USING btree (customer_id);


--
-- TOC entry 3955 (class 1259 OID 36602)
-- Name: idx_debt_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_transactions_type ON public.debt_transactions USING btree (transaction_type);


--
-- TOC entry 3930 (class 1259 OID 25337)
-- Name: idx_financial_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_transactions_date ON public.financial_transactions USING btree (transaction_date);


--
-- TOC entry 3931 (class 1259 OID 25338)
-- Name: idx_financial_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_transactions_type ON public.financial_transactions USING btree (transaction_type);


--
-- TOC entry 3904 (class 1259 OID 25305)
-- Name: idx_invoice_details_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_customer ON public.invoice_details USING btree (customer_code);


--
-- TOC entry 3905 (class 1259 OID 26931)
-- Name: idx_invoice_details_customer_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_customer_code ON public.invoice_details USING btree (customer_code);


--
-- TOC entry 3906 (class 1259 OID 25624)
-- Name: idx_invoice_details_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_customer_id ON public.invoice_details USING btree (customer_id);


--
-- TOC entry 3907 (class 1259 OID 26934)
-- Name: idx_invoice_details_customer_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_customer_product ON public.invoice_details USING btree (customer_id, product_id);


--
-- TOC entry 3908 (class 1259 OID 25306)
-- Name: idx_invoice_details_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_date ON public.invoice_details USING btree (invoice_date);


--
-- TOC entry 3909 (class 1259 OID 26932)
-- Name: idx_invoice_details_date_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_date_customer ON public.invoice_details USING btree (invoice_date, customer_id);


--
-- TOC entry 3910 (class 1259 OID 26933)
-- Name: idx_invoice_details_date_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_date_product ON public.invoice_details USING btree (invoice_date, product_id);


--
-- TOC entry 3911 (class 1259 OID 25303)
-- Name: idx_invoice_details_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_invoice ON public.invoice_details USING btree (invoice_id);


--
-- TOC entry 3912 (class 1259 OID 25307)
-- Name: idx_invoice_details_invoice_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_invoice_code ON public.invoice_details USING btree (invoice_code);


--
-- TOC entry 3913 (class 1259 OID 26929)
-- Name: idx_invoice_details_invoice_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_invoice_date ON public.invoice_details USING btree (invoice_date);


--
-- TOC entry 3914 (class 1259 OID 26928)
-- Name: idx_invoice_details_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_invoice_id ON public.invoice_details USING btree (invoice_id);


--
-- TOC entry 3915 (class 1259 OID 25304)
-- Name: idx_invoice_details_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_product ON public.invoice_details USING btree (product_id);


--
-- TOC entry 3916 (class 1259 OID 26930)
-- Name: idx_invoice_details_product_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_product_code ON public.invoice_details USING btree (product_code);


--
-- TOC entry 3917 (class 1259 OID 25625)
-- Name: idx_invoice_details_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_details_product_id ON public.invoice_details USING btree (product_id);


--
-- TOC entry 3892 (class 1259 OID 25255)
-- Name: idx_invoices_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_code ON public.invoices USING btree (invoice_code);


--
-- TOC entry 3893 (class 1259 OID 25254)
-- Name: idx_invoices_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer ON public.invoices USING btree (customer_id);


--
-- TOC entry 3894 (class 1259 OID 25623)
-- Name: idx_invoices_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer_id ON public.invoices USING btree (customer_id);


--
-- TOC entry 3895 (class 1259 OID 25253)
-- Name: idx_invoices_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_date ON public.invoices USING btree (invoice_date);


--
-- TOC entry 3896 (class 1259 OID 25626)
-- Name: idx_invoices_date_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_date_customer ON public.invoices USING btree (invoice_date, customer_id);


--
-- TOC entry 3897 (class 1259 OID 26935)
-- Name: idx_invoices_invoice_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_invoice_code ON public.invoices USING btree (invoice_code);


--
-- TOC entry 3898 (class 1259 OID 26936)
-- Name: idx_invoices_invoice_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_invoice_date ON public.invoices USING btree (invoice_date);


--
-- TOC entry 3899 (class 1259 OID 26937)
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- TOC entry 3886 (class 1259 OID 23178)
-- Name: idx_product_units_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_units_product ON public.product_units USING btree (product_id);


--
-- TOC entry 3887 (class 1259 OID 23179)
-- Name: idx_product_units_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_units_unit ON public.product_units USING btree (unit_id);


--
-- TOC entry 3874 (class 1259 OID 23154)
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree (is_active);


--
-- TOC entry 3875 (class 1259 OID 23155)
-- Name: idx_products_allow_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_allow_sale ON public.products USING btree (allow_sale);


--
-- TOC entry 3876 (class 1259 OID 23151)
-- Name: idx_products_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_barcode ON public.products USING btree (barcode);


--
-- TOC entry 3877 (class 1259 OID 23153)
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);


--
-- TOC entry 3878 (class 1259 OID 26942)
-- Name: idx_products_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);


--
-- TOC entry 3879 (class 1259 OID 23150)
-- Name: idx_products_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_code ON public.products USING btree (product_code);


--
-- TOC entry 3880 (class 1259 OID 23152)
-- Name: idx_products_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_name ON public.products USING btree (product_name);


--
-- TOC entry 3881 (class 1259 OID 26941)
-- Name: idx_products_product_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_product_code ON public.products USING btree (product_code);


--
-- TOC entry 3920 (class 1259 OID 25324)
-- Name: idx_purchase_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_customer ON public.purchase_orders USING btree (customer_name);


--
-- TOC entry 3921 (class 1259 OID 25323)
-- Name: idx_purchase_orders_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_date ON public.purchase_orders USING btree (order_date);


--
-- TOC entry 3946 (class 1259 OID 31285)
-- Name: idx_settings_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_log_date ON public.settings_change_log USING btree (created_at);


--
-- TOC entry 3947 (class 1259 OID 31284)
-- Name: idx_settings_log_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_log_key ON public.settings_change_log USING btree (setting_key);


--
-- TOC entry 3868 (class 1259 OID 23108)
-- Name: idx_suppliers_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_code ON public.suppliers USING btree (supplier_code);


--
-- TOC entry 3869 (class 1259 OID 23109)
-- Name: idx_suppliers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_name ON public.suppliers USING btree (supplier_name);


--
-- TOC entry 3932 (class 1259 OID 31289)
-- Name: idx_system_settings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_active ON public.system_settings USING btree (is_active) WHERE (is_active = true);


--
-- TOC entry 3933 (class 1259 OID 31247)
-- Name: idx_system_settings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_category ON public.system_settings USING btree (category);


--
-- TOC entry 3934 (class 1259 OID 31248)
-- Name: idx_system_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_key ON public.system_settings USING btree (setting_key);


--
-- TOC entry 3935 (class 1259 OID 31290)
-- Name: idx_system_settings_required; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_required ON public.system_settings USING btree (is_required) WHERE (is_required = true);


--
-- TOC entry 3983 (class 2620 OID 31293)
-- Name: branch_settings update_branch_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_branch_settings_updated_at BEFORE UPDATE ON public.branch_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 3982 (class 2620 OID 31292)
-- Name: system_settings update_system_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 3978 (class 2606 OID 31262)
-- Name: branch_settings branch_settings_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_settings
    ADD CONSTRAINT branch_settings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(branch_id) ON DELETE CASCADE;


--
-- TOC entry 3957 (class 2606 OID 23084)
-- Name: customers customers_branch_created_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_branch_created_id_fkey FOREIGN KEY (branch_created_id) REFERENCES public.branches(branch_id);


--
-- TOC entry 3958 (class 2606 OID 23079)
-- Name: customers customers_customer_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_type_id_fkey FOREIGN KEY (customer_type_id) REFERENCES public.customer_types(type_id);


--
-- TOC entry 3980 (class 2606 OID 36456)
-- Name: debt_transactions debt_transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_transactions
    ADD CONSTRAINT debt_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);


--
-- TOC entry 3981 (class 2606 OID 36461)
-- Name: debt_transactions debt_transactions_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_transactions
    ADD CONSTRAINT debt_transactions_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(invoice_id);


--
-- TOC entry 3959 (class 2606 OID 26918)
-- Name: customers fk_customers_branch_created_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT fk_customers_branch_created_id FOREIGN KEY (branch_created_id) REFERENCES public.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 3960 (class 2606 OID 26913)
-- Name: customers fk_customers_customer_type_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT fk_customers_customer_type_id FOREIGN KEY (customer_type_id) REFERENCES public.customer_types(type_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 3970 (class 2606 OID 25613)
-- Name: invoice_details fk_invoice_details_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_customer FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);


--
-- TOC entry 3971 (class 2606 OID 26903)
-- Name: invoice_details fk_invoice_details_customer_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 3972 (class 2606 OID 26893)
-- Name: invoice_details fk_invoice_details_invoice_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_invoice_id FOREIGN KEY (invoice_id) REFERENCES public.invoices(invoice_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 3973 (class 2606 OID 25618)
-- Name: invoice_details fk_invoice_details_product; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_product FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- TOC entry 3974 (class 2606 OID 26898)
-- Name: invoice_details fk_invoice_details_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT fk_invoice_details_product_id FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 3966 (class 2606 OID 25608)
-- Name: invoices fk_invoices_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);


--
-- TOC entry 3967 (class 2606 OID 26908)
-- Name: invoices fk_invoices_customer_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT fk_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 3961 (class 2606 OID 26923)
-- Name: products fk_products_category_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_products_category_id FOREIGN KEY (category_id) REFERENCES public.product_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 3975 (class 2606 OID 25298)
-- Name: invoice_details invoice_details_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT invoice_details_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(branch_id);


--
-- TOC entry 3976 (class 2606 OID 25288)
-- Name: invoice_details invoice_details_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT invoice_details_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(invoice_id) ON DELETE CASCADE;


--
-- TOC entry 3977 (class 2606 OID 25293)
-- Name: invoice_details invoice_details_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_details
    ADD CONSTRAINT invoice_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- TOC entry 3968 (class 2606 OID 25248)
-- Name: invoices invoices_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(branch_id);


--
-- TOC entry 3969 (class 2606 OID 25243)
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);


--
-- TOC entry 3956 (class 2606 OID 22997)
-- Name: product_categories product_categories_parent_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_parent_category_id_fkey FOREIGN KEY (parent_category_id) REFERENCES public.product_categories(category_id);


--
-- TOC entry 3964 (class 2606 OID 23168)
-- Name: product_units product_units_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON DELETE CASCADE;


--
-- TOC entry 3965 (class 2606 OID 23173)
-- Name: product_units product_units_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(unit_id);


--
-- TOC entry 3962 (class 2606 OID 23145)
-- Name: products products_base_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_base_unit_id_fkey FOREIGN KEY (base_unit_id) REFERENCES public.units(unit_id);


--
-- TOC entry 3963 (class 2606 OID 23140)
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(category_id);


--
-- TOC entry 3979 (class 2606 OID 31279)
-- Name: settings_change_log settings_change_log_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings_change_log
    ADD CONSTRAINT settings_change_log_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(branch_id);


-- Completed on 2025-08-06 06:57:18

--
-- PostgreSQL database dump complete
--

