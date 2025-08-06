-- =====================================================
-- 🏦 DEBT MANAGEMENT SYSTEM SETUP
-- Tạo views và functions cho quản lý công nợ khách hàng
-- =====================================================

-- =====================================================
-- 📊 VIEW: debt_summary - Tổng quan công nợ khách hàng
-- =====================================================
CREATE OR REPLACE VIEW debt_summary AS
SELECT 
    c.customer_id,
    c.customer_code,
    c.customer_name,
    c.phone,
    c.email,
    c.current_debt,
    c.debt_limit,
    (c.debt_limit - c.current_debt) as remaining_credit,
    c.last_purchase_date,
    c.total_revenue,
    c.purchase_count,
    
    -- Tính trạng thái công nợ
    CASE 
        WHEN c.current_debt = 0 THEN 'Không nợ'
        WHEN c.current_debt > 0 AND c.current_debt <= c.debt_limit THEN 'Nợ trong hạn mức'
        WHEN c.current_debt > c.debt_limit THEN 'Vượt hạn mức nợ'
        WHEN c.current_debt < 0 THEN 'Cửa hàng nợ khách'
        ELSE 'Khác'
    END as debt_status,
    
    -- Mức độ ưu tiên thu nợ
    CASE 
        WHEN c.current_debt > c.debt_limit THEN 1
        WHEN c.current_debt > (c.debt_limit * 0.8) THEN 2
        WHEN c.current_debt > 0 THEN 3
        ELSE 4
    END as collection_priority,
    
    -- Số ngày từ lần mua cuối
    CASE
        WHEN c.last_purchase_date IS NULL THEN NULL
        ELSE (CURRENT_DATE - DATE(c.last_purchase_date))::INTEGER
    END as days_since_last_purchase,
    
    -- Phân loại khách hàng theo rủi ro
    CASE 
        WHEN c.current_debt > c.debt_limit THEN 'Rủi ro cao'
        WHEN c.current_debt > (c.debt_limit * 0.8) THEN 'Rủi ro trung bình'
        WHEN c.current_debt > 0 THEN 'Rủi ro thấp'
        WHEN c.current_debt = 0 THEN 'Không rủi ro'
        ELSE 'Cần xem xét'
    END as risk_level,
    
    c.is_active,
    c.created_at,
    c.updated_at
FROM customers c
WHERE c.is_active = true
ORDER BY 
    collection_priority ASC,
    ABS(c.current_debt) DESC;

COMMENT ON VIEW debt_summary IS 'Tổng quan công nợ khách hàng với phân loại rủi ro và ưu tiên thu nợ';

-- =====================================================
-- 📊 VIEW: debt_transactions_history - Lịch sử giao dịch công nợ
-- =====================================================
CREATE OR REPLACE VIEW debt_transactions_history AS
SELECT 
    dt.transaction_id,
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
    CASE WHEN dt.invoice_id IS NOT NULL THEN i.invoice_code ELSE NULL END as invoice_code,
    dt.created_by,
    dt.created_at,
    
    -- Phân loại giao dịch
    CASE 
        WHEN dt.transaction_type = 'debt_increase' THEN 'Tăng nợ'
        WHEN dt.transaction_type = 'debt_payment' THEN 'Thu nợ'
        WHEN dt.transaction_type = 'debt_adjustment' THEN 'Điều chỉnh'
        WHEN dt.transaction_type = 'debt_writeoff' THEN 'Xóa nợ'
        ELSE 'Khác'
    END as transaction_display,
    
    -- Màu sắc cho UI
    CASE 
        WHEN dt.transaction_type = 'debt_increase' THEN 'red'
        WHEN dt.transaction_type = 'debt_payment' THEN 'green'
        WHEN dt.transaction_type = 'debt_adjustment' THEN 'blue'
        WHEN dt.transaction_type = 'debt_writeoff' THEN 'orange'
        ELSE 'gray'
    END as transaction_color
FROM debt_transactions dt
LEFT JOIN customers c ON dt.customer_id = c.customer_id
LEFT JOIN invoices i ON dt.invoice_id = i.invoice_id
ORDER BY dt.created_at DESC;

COMMENT ON VIEW debt_transactions_history IS 'Lịch sử giao dịch công nợ với thông tin khách hàng và hóa đơn liên quan';

-- =====================================================
-- 💰 FUNCTION: pay_customer_debt - Thu tiền công nợ
-- =====================================================
CREATE OR REPLACE FUNCTION pay_customer_debt(
    p_customer_id INTEGER,
    p_payment_amount NUMERIC,
    p_payment_method VARCHAR DEFAULT 'cash',
    p_notes TEXT DEFAULT NULL,
    p_created_by VARCHAR DEFAULT 'system'
) RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION pay_customer_debt IS 'Thu tiền công nợ từ khách hàng với validation và logging đầy đủ';

-- =====================================================
-- 💰 FUNCTION: adjust_customer_debt - Điều chỉnh công nợ
-- =====================================================
CREATE OR REPLACE FUNCTION adjust_customer_debt(
    p_customer_id INTEGER,
    p_adjustment_amount NUMERIC,
    p_adjustment_type VARCHAR, -- 'increase', 'decrease', 'writeoff'
    p_reason TEXT,
    p_created_by VARCHAR DEFAULT 'system'
) RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION adjust_customer_debt IS 'Điều chỉnh công nợ khách hàng (tăng/giảm/xóa nợ) với lý do rõ ràng';

-- =====================================================
-- 📊 FUNCTION: get_debt_dashboard_stats - Thống kê dashboard công nợ
-- =====================================================
CREATE OR REPLACE FUNCTION get_debt_dashboard_stats(
    date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
    date_to DATE DEFAULT CURRENT_DATE
) RETURNS JSON AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_debt_dashboard_stats IS 'Lấy thống kê tổng quan cho dashboard quản lý công nợ';

-- =====================================================
-- 🔍 FUNCTION: search_debt_customers - Tìm kiếm khách hàng có công nợ
-- =====================================================
CREATE OR REPLACE FUNCTION search_debt_customers(
    search_term TEXT DEFAULT '',
    debt_status_filter VARCHAR DEFAULT '', -- 'overdue', 'normal', 'credit', 'all'
    risk_level_filter VARCHAR DEFAULT '', -- 'high', 'medium', 'low', 'none', 'all'
    limit_count INTEGER DEFAULT 50
) RETURNS TABLE(
    customer_id INTEGER,
    customer_code TEXT,
    customer_name TEXT,
    phone TEXT,
    current_debt NUMERIC,
    debt_limit NUMERIC,
    remaining_credit NUMERIC,
    debt_status TEXT,
    risk_level TEXT,
    collection_priority INTEGER,
    days_since_last_purchase INTEGER,
    last_purchase_date TIMESTAMP,
    total_revenue NUMERIC,
    purchase_count INTEGER
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION search_debt_customers IS 'Tìm kiếm khách hàng có công nợ với các bộ lọc nâng cao';

-- =====================================================
-- 📝 Tạo indexes để tối ưu performance
-- =====================================================

-- Index cho bảng debt_transactions
CREATE INDEX IF NOT EXISTS idx_debt_transactions_customer_id ON debt_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_debt_transactions_created_at ON debt_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_debt_transactions_type ON debt_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_debt_transactions_composite ON debt_transactions(customer_id, created_at DESC);

-- Index cho bảng customers (debt related)
CREATE INDEX IF NOT EXISTS idx_customers_current_debt ON customers(current_debt) WHERE current_debt != 0;
CREATE INDEX IF NOT EXISTS idx_customers_debt_limit ON customers(debt_limit) WHERE debt_limit > 0;
CREATE INDEX IF NOT EXISTS idx_customers_debt_over_limit ON customers(current_debt, debt_limit) WHERE current_debt > debt_limit;

-- =====================================================
-- ✅ Hoàn thành setup database
-- =====================================================
SELECT 'Debt Management Database Setup Completed Successfully!' as status;
