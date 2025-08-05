-- =====================================================
-- 🚀 UPDATED POS CHECKOUT FUNCTION - Uses New Invoice Columns
-- =====================================================
-- Purpose: Update function to use dedicated VAT/discount columns
-- Changes: Store VAT & discount in proper columns, not JSON notes
-- Date: 2025-08-05
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_pos_invoice(
    p_customer_id INTEGER,                    -- Customer ID (required)
    p_cart_items JSONB,                      -- Cart items: [{"product_id": 1, "quantity": 2, "unit_price": 50000}]
    p_vat_rate NUMERIC DEFAULT 0,            -- VAT rate: 0, 5, 8, 10
    p_discount_type VARCHAR DEFAULT 'percentage', -- 'percentage' or 'amount'
    p_discount_value NUMERIC DEFAULT 0,      -- Discount value
    p_payment_method VARCHAR DEFAULT 'cash', -- 'cash', 'card', 'transfer'
    p_received_amount NUMERIC DEFAULT NULL,  -- Amount received (for change calculation)
    p_branch_id INTEGER DEFAULT 1,          -- Branch ID
    p_created_by VARCHAR DEFAULT 'POS System' -- Who created the invoice
) 
RETURNS JSONB 
LANGUAGE plpgsql 
SECURITY DEFINER
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
        v_discount_amount := LEAST(p_discount_value, v_subtotal); -- Don't allow discount > subtotal
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
    
    -- 🔥 NEW: Insert invoice with dedicated VAT/discount columns
    INSERT INTO invoices (
        invoice_code,
        invoice_date,
        customer_id,
        customer_name,
        branch_id,
        -- 💰 Financial columns (new structure)
        subtotal_amount,
        discount_type,
        discount_value,
        discount_amount,
        vat_rate,
        vat_amount,
        total_amount,
        payment_method,
        customer_paid,
        -- 📝 Metadata
        status,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_invoice_code,
        NOW(),
        p_customer_id,
        v_customer_record.customer_name,
        p_branch_id,
        -- 💰 Financial values
        v_subtotal,
        p_discount_type,
        p_discount_value,
        v_discount_amount,
        p_vat_rate,
        v_vat_amount,
        v_total_amount,
        p_payment_method,
        COALESCE(p_received_amount, 0),
        -- 📝 Metadata
        'completed',
        jsonb_build_object(
            'created_by', p_created_by,
            'warnings', v_warnings,
            'change_amount', v_change_amount,
            'summary', format('POS Sale | %s items | %s VND | Payment: %s%s',
                v_item_count,
                v_total_amount,
                p_payment_method,
                CASE WHEN v_change_amount > 0 THEN format(' | Change: %s VND', v_change_amount) ELSE '' END
            )
        )::TEXT,
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
                invoice_id,
                product_id,
                invoice_code,
                product_code,
                product_name,
                customer_name,
                customer_id,
                branch_id,
                invoice_date,
                quantity,
                unit_price,
                sale_price,
                line_total,
                subtotal,
                cost_price,
                profit_amount,
                
                -- Payment method breakdown
                cash_payment,
                card_payment,
                transfer_payment,
                wallet_payment,
                points_payment,
                customer_paid,
                
                -- Line-level discount (currently 0 - we do invoice-level)
                discount_percent,
                discount_amount,
                total_discount,
                
                status,
                created_at
            ) VALUES (
                v_invoice_id,
                (v_detail->>'product_id')::INTEGER,
                v_invoice_code,
                v_detail->>'product_code',
                v_detail->>'product_name',
                v_customer_record.customer_name,
                p_customer_id,
                p_branch_id,
                NOW(),
                (v_detail->>'quantity')::NUMERIC,
                (v_detail->>'unit_price')::NUMERIC,
                (v_detail->>'unit_price')::NUMERIC,
                (v_detail->>'line_total')::NUMERIC,
                (v_detail->>'line_total')::NUMERIC,
                (v_detail->>'cost_price')::NUMERIC,
                (v_detail->>'profit_amount')::NUMERIC,
                
                -- Payment breakdown based on method
                CASE WHEN p_payment_method = 'cash' THEN (v_detail->>'line_total')::NUMERIC ELSE 0 END,
                CASE WHEN p_payment_method = 'card' THEN (v_detail->>'line_total')::NUMERIC ELSE 0 END,
                CASE WHEN p_payment_method = 'transfer' THEN (v_detail->>'line_total')::NUMERIC ELSE 0 END,
                0, -- wallet_payment
                0, -- points_payment
                COALESCE(p_received_amount, 0),
                
                0, -- discount_percent (line-level)
                0, -- discount_amount (line-level)
                0, -- total_discount (line-level)
                
                'completed',
                NOW()
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
            SET 
                current_stock = (v_stock_update->>'new_stock')::NUMERIC,
                updated_at = NOW()
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
        -- Return detailed error information
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

-- =====================================================
-- 🔧 UPDATE FUNCTION PERMISSIONS & DOCUMENTATION
-- =====================================================

-- Update function comment
COMMENT ON FUNCTION public.create_pos_invoice IS 
'Updated POS Checkout Function: Uses dedicated VAT/discount columns instead of JSON notes.
Stores financial data in proper invoice table columns for better reporting and analytics.
Returns detailed JSON response with success/error status and transaction details.';

-- =====================================================
-- 📊 CREATE REPORTING FUNCTIONS WITH NEW COLUMNS
-- =====================================================

-- Enhanced financial summary using new columns
CREATE OR REPLACE FUNCTION get_financial_summary_enhanced(
    date_from date DEFAULT (CURRENT_DATE - '30 days'::interval), 
    date_to date DEFAULT CURRENT_DATE
) RETURNS json
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
      'gross_revenue', COALESCE(SUM(i.subtotal_amount), 0),
      'total_discount', COALESCE(SUM(i.discount_amount), 0),
      'total_vat', COALESCE(SUM(i.vat_amount), 0),
      'net_revenue', COALESCE(SUM(i.total_amount), 0),
      'total_orders', COUNT(DISTINCT i.invoice_id),
      'total_customers', COUNT(DISTINCT i.customer_id),
      'avg_discount_rate', CASE 
        WHEN SUM(i.subtotal_amount) > 0 THEN 
          ROUND((SUM(i.discount_amount) / SUM(i.subtotal_amount) * 100), 2)
        ELSE 0 
      END,
      'avg_vat_rate', CASE 
        WHEN COUNT(*) > 0 THEN ROUND(AVG(i.vat_rate), 2)
        ELSE 0 
      END
    ),
    'vat_breakdown', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'vat_rate', vat_rate,
          'invoice_count', invoice_count,
          'total_vat_amount', total_vat,
          'total_revenue', total_revenue
        )
      ), '[]'::json)
      FROM (
        SELECT 
          i.vat_rate,
          COUNT(*) as invoice_count,
          SUM(i.vat_amount) as total_vat,
          SUM(i.total_amount) as total_revenue
        FROM invoices i
        WHERE i.invoice_date BETWEEN date_from AND date_to
        GROUP BY i.vat_rate
        ORDER BY i.vat_rate
      ) vat_summary
    ),
    'discount_breakdown', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'discount_type', discount_type,
          'invoice_count', invoice_count,
          'total_discount_amount', total_discount,
          'avg_discount_value', avg_discount_value
        )
      ), '[]'::json)
      FROM (
        SELECT 
          i.discount_type,
          COUNT(*) as invoice_count,
          SUM(i.discount_amount) as total_discount,
          ROUND(AVG(i.discount_value), 2) as avg_discount_value
        FROM invoices i
        WHERE i.invoice_date BETWEEN date_from AND date_to
          AND i.discount_amount > 0
        GROUP BY i.discount_type
        ORDER BY total_discount DESC
      ) discount_summary
    ),
    'payment_breakdown', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'payment_method', payment_method,
          'invoice_count', invoice_count,
          'total_amount', total_amount,
          'avg_amount', avg_amount
        )
      ), '[]'::json)
      FROM (
        SELECT 
          i.payment_method,
          COUNT(*) as invoice_count,
          SUM(i.total_amount) as total_amount,
          ROUND(AVG(i.total_amount), 0) as avg_amount
        FROM invoices i
        WHERE i.invoice_date BETWEEN date_from AND date_to
        GROUP BY i.payment_method
        ORDER BY total_amount DESC
      ) payment_summary
    )
  ) INTO result
  FROM invoices i
  WHERE i.invoice_date BETWEEN date_from AND date_to;
  
  RETURN result;
END;
$$;

-- =====================================================
-- 📋 VERIFICATION & TESTING
-- =====================================================

-- Test the updated function with sample data
/*
SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 2, "unit_price": 50000},
        {"product_id": 2, "quantity": 1, "unit_price": 30000}
    ]'::jsonb,
    p_vat_rate := 10,
    p_discount_type := 'percentage',
    p_discount_value := 5,
    p_payment_method := 'cash',
    p_received_amount := 200000,
    p_branch_id := 1,
    p_created_by := 'Test User'
);
*/

-- =====================================================
-- 🎉 MIGRATION COMPLETED SUCCESSFULLY
-- =====================================================

/*
SUMMARY OF FUNCTION UPDATES:
✅ Updated invoice INSERT to use new dedicated columns
✅ Removed JSON notes storage for VAT/discount
✅ Enhanced error handling and validation
✅ Created new reporting functions
✅ Maintained backward compatibility for notes field
✅ Added comprehensive logging and debugging

BENEFITS:
✅ Better performance (no JSON parsing)
✅ Proper database constraints
✅ Easier reporting and analytics
✅ Better data integrity
✅ Index support for fast queries

NEXT STEPS:
1. Test function with real data
2. Update frontend to handle new structure
3. Create dashboard reports using new columns
4. Monitor performance improvements
*/