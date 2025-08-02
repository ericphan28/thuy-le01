-- =====================================================================
-- XUÂN THÙY VETERINARY MANAGEMENT - SETTINGS SYSTEM
-- =====================================================================
-- Tạo hệ thống cài đặt toàn diện cho ứng dụng quản lý thú y
-- Phân tích dựa trên schema hiện tại và dữ liệu thực tế
-- Created: 02/08/2025
-- =====================================================================

-- =====================================================================
-- 1. SYSTEM SETTINGS TABLE - Cài đặt toàn hệ thống
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
    setting_id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string',
    category VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    default_value TEXT,
    validation_rules JSONB DEFAULT '{}',
    is_required BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON public.system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(setting_key);

-- =====================================================================
-- 2. BRANCH SETTINGS TABLE - Cài đặt theo chi nhánh
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.branch_settings (
    branch_setting_id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES public.branches(branch_id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, setting_key)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_branch_settings_branch ON public.branch_settings(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_settings_key ON public.branch_settings(setting_key);

-- =====================================================================
-- 3. SETTINGS CHANGE LOG - Lịch sử thay đổi cài đặt
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.settings_change_log (
    log_id BIGSERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(100),
    change_reason TEXT,
    branch_id INTEGER REFERENCES public.branches(branch_id),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_settings_log_key ON public.settings_change_log(setting_key);
CREATE INDEX IF NOT EXISTS idx_settings_log_date ON public.settings_change_log(created_at);

-- =====================================================================
-- 4. BUSINESS SETTINGS DATA - Dữ liệu cài đặt mặc định
-- =====================================================================

INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, display_name, description, default_value, validation_rules, is_required, display_order) VALUES

-- =====================================================================
-- BUSINESS INFORMATION SETTINGS
-- =====================================================================
('business_name', 'Xuân Thùy Veterinary Pharmacy', 'string', 'business', 'Tên doanh nghiệp', 'Tên chính thức của doanh nghiệp', 'Xuân Thùy Veterinary Pharmacy', '{"minLength": 3, "maxLength": 200}', true, 1),
('business_address', '', 'text', 'business', 'Địa chỉ doanh nghiệp', 'Địa chỉ trụ sở chính', '', '{"maxLength": 500}', false, 2),
('business_phone', '', 'string', 'business', 'Số điện thoại', 'Số điện thoại liên hệ chính', '', '{"pattern": "^[0-9\\s\\-\\+\\(\\)]+$"}', false, 3),
('business_email', '', 'email', 'business', 'Email doanh nghiệp', 'Email chính thức của doanh nghiệp', '', '{"format": "email"}', false, 4),
('tax_number', '', 'string', 'business', 'Mã số thuế', 'Mã số thuế của doanh nghiệp', '', '{"pattern": "^[0-9\\-]+$"}', false, 5),
('business_license', '', 'string', 'business', 'Số giấy phép kinh doanh', 'Số giấy phép kinh doanh thú y', '', '{}', false, 6),

-- =====================================================================
-- FINANCIAL SETTINGS
-- =====================================================================
('default_currency', 'VND', 'select', 'financial', 'Đơn vị tiền tệ', 'Đơn vị tiền tệ mặc định', 'VND', '{"options": ["VND", "USD", "EUR"]}', true, 10),
('currency_symbol', '₫', 'string', 'financial', 'Ký hiệu tiền tệ', 'Ký hiệu hiển thị cho tiền tệ', '₫', '{"maxLength": 5}', true, 11),
('currency_decimal_places', '0', 'number', 'financial', 'Số chữ số thập phân', 'Số chữ số sau dấu phẩy cho tiền tệ', '0', '{"min": 0, "max": 4}', true, 12),
('vat_rate', '10.0', 'number', 'financial', 'Thuế VAT (%)', 'Tỷ lệ thuế VAT mặc định', '10.0', '{"min": 0, "max": 100, "step": 0.1}', true, 13),
('discount_limit_percent', '50.0', 'number', 'financial', 'Giới hạn giảm giá (%)', 'Mức giảm giá tối đa cho một giao dịch', '50.0', '{"min": 0, "max": 100, "step": 0.1}', true, 14),
('payment_methods', '["cash", "transfer", "card"]', 'json', 'financial', 'Phương thức thanh toán', 'Các phương thức thanh toán được chấp nhận', '["cash", "transfer", "card"]', '{}', true, 15),
('credit_limit_default', '5000000', 'number', 'financial', 'Hạn mức công nợ mặc định', 'Hạn mức công nợ mặc định cho khách hàng mới (VND)', '5000000', '{"min": 0}', true, 16),
('invoice_due_days', '30', 'number', 'financial', 'Thời hạn thanh toán', 'Số ngày thanh toán mặc định cho hóa đơn', '30', '{"min": 1, "max": 365}', true, 17),

-- =====================================================================
-- INVENTORY SETTINGS
-- =====================================================================
('low_stock_threshold', '10', 'number', 'inventory', 'Ngưỡng cảnh báo tồn kho thấp', 'Số lượng tồn kho tối thiểu trước khi cảnh báo', '10', '{"min": 0}', true, 20),
('expiry_warning_days', '30', 'number', 'inventory', 'Cảnh báo hết hạn (ngày)', 'Số ngày trước khi cảnh báo sản phẩm hết hạn', '30', '{"min": 1, "max": 365}', true, 21),
('auto_reorder_enabled', 'true', 'boolean', 'inventory', 'Tự động tạo đơn đặt hàng', 'Tự động tạo đơn đặt hàng khi hết tồn kho', 'true', '{}', false, 22),
('default_markup_percent', '25.0', 'number', 'inventory', 'Tỷ lệ lãi mặc định (%)', 'Tỷ lệ lãi mặc định khi nhập sản phẩm mới', '25.0', '{"min": 0, "max": 1000, "step": 0.1}', true, 23),
('track_expiry_medicines', 'true', 'boolean', 'inventory', 'Theo dõi hạn sử dụng thuốc', 'Bắt buộc theo dõi hạn sử dụng cho thuốc thú y', 'true', '{}', true, 24),
('batch_tracking_enabled', 'true', 'boolean', 'inventory', 'Theo dõi số lô', 'Theo dõi số lô sản xuất cho thuốc và vaccine', 'true', '{}', false, 25),
('allow_negative_stock', 'false', 'boolean', 'inventory', 'Cho phép bán âm kho', 'Cho phép bán khi tồn kho không đủ', 'false', '{}', false, 26),

-- =====================================================================
-- CUSTOMER SETTINGS
-- =====================================================================
('customer_code_prefix', 'KH', 'string', 'customer', 'Tiền tố mã khách hàng', 'Tiền tố cho mã khách hàng tự động', 'KH', '{"maxLength": 10}', true, 30),
('customer_code_length', '6', 'number', 'customer', 'Độ dài mã khách hàng', 'Số chữ số trong mã khách hàng (không tính tiền tố)', '6', '{"min": 3, "max": 10}', true, 31),
('auto_generate_customer_codes', 'true', 'boolean', 'customer', 'Tự động tạo mã khách hàng', 'Tự động tạo mã khách hàng khi thêm mới', 'true', '{}', false, 32),
('vip_threshold_amount', '50000000', 'number', 'customer', 'Ngưỡng khách hàng VIP', 'Tổng mua hàng để trở thành khách VIP (VND)', '50000000', '{"min": 0}', true, 33),
('loyal_customer_orders', '20', 'number', 'customer', 'Số đơn hàng khách thân thiết', 'Số đơn hàng tối thiểu để trở thành khách thân thiết', '20', '{"min": 1}', true, 34),
('new_customer_credit', '1000000', 'number', 'customer', 'Hạn mức khách hàng mới', 'Hạn mức công nợ mặc định cho khách hàng mới (VND)', '1000000', '{"min": 0}', true, 35),
('require_customer_phone', 'false', 'boolean', 'customer', 'Bắt buộc số điện thoại', 'Bắt buộc nhập số điện thoại khi tạo khách hàng', 'false', '{}', false, 36),

-- =====================================================================
-- INVOICE SETTINGS
-- =====================================================================
('invoice_code_prefix', 'HD', 'string', 'invoice', 'Tiền tố mã hóa đơn', 'Tiền tố cho mã hóa đơn tự động', 'HD', '{"maxLength": 10}', true, 40),
('invoice_code_length', '6', 'number', 'invoice', 'Độ dài mã hóa đơn', 'Số chữ số trong mã hóa đơn (không tính tiền tố)', '6', '{"min": 3, "max": 10}', true, 41),
('invoice_numbering_reset', 'yearly', 'select', 'invoice', 'Đặt lại số hóa đơn', 'Tần suất đặt lại số hóa đơn về 1', 'yearly', '{"options": ["never", "daily", "monthly", "yearly"]}', true, 42),
('auto_print_receipt', 'true', 'boolean', 'invoice', 'Tự động in hóa đơn', 'Tự động in hóa đơn sau khi lưu', 'true', '{}', false, 43),
('require_customer_info', 'false', 'boolean', 'invoice', 'Bắt buộc thông tin khách hàng', 'Bắt buộc chọn khách hàng khi tạo hóa đơn', 'false', '{}', false, 44),
('invoice_footer_text', 'Cảm ơn quý khách đã sử dụng dịch vụ!', 'text', 'invoice', 'Dòng chân hóa đơn', 'Nội dung hiển thị ở cuối hóa đơn', 'Cảm ơn quý khách đã sử dụng dịch vụ!', '{"maxLength": 500}', false, 45),
('show_cost_price_on_invoice', 'false', 'boolean', 'invoice', 'Hiển thị giá vốn', 'Hiển thị giá vốn trên hóa đơn (chỉ admin)', 'false', '{}', false, 46),

-- =====================================================================
-- SYSTEM UI SETTINGS
-- =====================================================================
('items_per_page_default', '20', 'select', 'ui', 'Số dòng mỗi trang', 'Số lượng items hiển thị mặc định trên mỗi trang', '20', '{"options": ["10", "20", "50", "100"]}', true, 50),
('default_view_mode', 'grid', 'select', 'ui', 'Chế độ hiển thị mặc định', 'Chế độ hiển thị danh sách mặc định', 'grid', '{"options": ["grid", "list", "table"]}', true, 51),
('enable_animations', 'true', 'boolean', 'ui', 'Bật hiệu ứng động', 'Bật/tắt các hiệu ứng chuyển động trong giao diện', 'true', '{}', false, 52),
('theme_mode', 'light', 'select', 'ui', 'Chế độ màu sắc', 'Chế độ màu sắc giao diện', 'light', '{"options": ["light", "dark", "auto"]}', false, 53),
('compact_mode', 'false', 'boolean', 'ui', 'Chế độ gọn', 'Giao diện gọn gàng với khoảng cách nhỏ hơn', 'false', '{}', false, 54),
('show_tooltips', 'true', 'boolean', 'ui', 'Hiển thị gợi ý', 'Hiển thị tooltip khi hover vào các thành phần', 'true', '{}', false, 55),

-- =====================================================================
-- VETERINARY SPECIFIC SETTINGS
-- =====================================================================
('require_prescription_validation', 'true', 'boolean', 'veterinary', 'Kiểm tra đơn kê thuốc', 'Bắt buộc kiểm tra đơn kê thuốc cho thuốc kê đơn', 'true', '{}', true, 60),
('prescription_validity_days', '30', 'number', 'veterinary', 'Hạn đơn thuốc (ngày)', 'Số ngày có hiệu lực của đơn kê thuốc', '30', '{"min": 1, "max": 365}', true, 61),
('dosage_calculation_enabled', 'true', 'boolean', 'veterinary', 'Tính liều tự động', 'Tính toán liều thuốc theo cân nặng động vật', 'true', '{}', false, 62),
('drug_interaction_check', 'true', 'boolean', 'veterinary', 'Kiểm tra tương tác thuốc', 'Cảnh báo khi có tương tác giữa các loại thuốc', 'true', '{}', false, 63),
('vaccine_cold_chain_tracking', 'true', 'boolean', 'veterinary', 'Theo dõi chuỗi lạnh vaccine', 'Theo dõi điều kiện bảo quản vaccine', 'true', '{}', true, 64),

-- =====================================================================
-- NOTIFICATION SETTINGS
-- =====================================================================
('email_notifications_enabled', 'true', 'boolean', 'notification', 'Bật thông báo email', 'Cho phép gửi thông báo qua email', 'true', '{}', false, 70),
('sms_notifications_enabled', 'false', 'boolean', 'notification', 'Bật thông báo SMS', 'Cho phép gửi thông báo qua SMS', 'false', '{}', false, 71),
('low_stock_notification', 'true', 'boolean', 'notification', 'Thông báo hết hàng', 'Thông báo khi sản phẩm sắp hết', 'true', '{}', false, 72),
('expiry_notification', 'true', 'boolean', 'notification', 'Thông báo hết hạn', 'Thông báo khi sản phẩm sắp hết hạn', 'true', '{}', false, 73),
('payment_reminder_enabled', 'true', 'boolean', 'notification', 'Nhắc nhở thanh toán', 'Gửi nhắc nhở thanh toán cho khách hàng', 'true', '{}', false, 74),

-- =====================================================================
-- BACKUP & SECURITY SETTINGS
-- =====================================================================
('auto_backup_enabled', 'true', 'boolean', 'security', 'Sao lưu tự động', 'Tự động sao lưu dữ liệu hàng ngày', 'true', '{}', false, 80),
('backup_retention_days', '30', 'number', 'security', 'Lưu giữ sao lưu (ngày)', 'Số ngày lưu giữ file sao lưu', '30', '{"min": 7, "max": 365}', true, 81),
('session_timeout_minutes', '120', 'number', 'security', 'Thời gian phiên làm việc', 'Thời gian tự động đăng xuất (phút)', '120', '{"min": 15, "max": 480}', true, 82),
('password_min_length', '6', 'number', 'security', 'Độ dài mật khẩu tối thiểu', 'Số ký tự tối thiểu cho mật khẩu', '6', '{"min": 4, "max": 20}', true, 83);

-- =====================================================================
-- 5. HELPER FUNCTIONS - Các hàm hỗ trợ
-- =====================================================================

-- Function to get setting value with fallback to default
CREATE OR REPLACE FUNCTION public.get_setting_value(
    p_setting_key VARCHAR(100),
    p_branch_id INTEGER DEFAULT NULL
) RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set setting value with change logging
CREATE OR REPLACE FUNCTION public.set_setting_value(
    p_setting_key VARCHAR(100),
    p_new_value TEXT,
    p_branch_id INTEGER DEFAULT NULL,
    p_changed_by VARCHAR(100) DEFAULT 'system',
    p_change_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all settings by category
CREATE OR REPLACE FUNCTION public.get_settings_by_category(
    p_category VARCHAR(100),
    p_branch_id INTEGER DEFAULT NULL
) RETURNS TABLE (
    setting_key VARCHAR(100),
    setting_value TEXT,
    setting_type VARCHAR(50),
    display_name VARCHAR(200),
    description TEXT,
    validation_rules JSONB,
    is_required BOOLEAN,
    display_order INTEGER
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 6. INITIAL BRANCH SETTINGS - Cài đặt chi nhánh mặc định
-- =====================================================================

-- Set branch-specific settings for main branch (ID: 1)
INSERT INTO public.branch_settings (branch_id, setting_key, setting_value, created_by) VALUES
(1, 'branch_name', 'Chi nhánh trung tâm', 'system'),
(1, 'operating_hours', '08:00-18:00', 'system'),
(1, 'max_daily_sales', '100000000', 'system'),
(1, 'printer_name', 'default', 'system')
ON CONFLICT (branch_id, setting_key) DO NOTHING;

-- =====================================================================
-- 7. CREATE INDEXES FOR PERFORMANCE
-- =====================================================================

-- Additional indexes for better performance
CREATE INDEX IF NOT EXISTS idx_system_settings_active ON public.system_settings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_system_settings_required ON public.system_settings(is_required) WHERE is_required = true;

-- =====================================================================
-- 8. UPDATE TRIGGERS - Tự động cập nhật updated_at
-- =====================================================================

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to settings tables
DROP TRIGGER IF EXISTS update_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_branch_settings_updated_at ON public.branch_settings;
CREATE TRIGGER update_branch_settings_updated_at
    BEFORE UPDATE ON public.branch_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 9. SETTINGS VALIDATION FUNCTION
-- =====================================================================

CREATE OR REPLACE FUNCTION public.validate_setting_value(
    p_setting_key VARCHAR(100),
    p_value TEXT
) RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 10. SYSTEM INFO VIEW - Thông tin hệ thống
-- =====================================================================

CREATE OR REPLACE VIEW public.system_info AS
SELECT 
    'database_version' as info_key,
    version() as info_value,
    'System' as category
UNION ALL
SELECT 
    'total_settings' as info_key,
    COUNT(*)::TEXT as info_value,
    'Settings' as category
FROM public.system_settings
UNION ALL
SELECT 
    'active_branches' as info_key,
    COUNT(*)::TEXT as info_value,
    'Branches' as category
FROM public.branches WHERE is_active = true
UNION ALL
SELECT 
    'setup_date' as info_key,
    MIN(created_at)::TEXT as info_value,
    'System' as category
FROM public.system_settings;

-- =====================================================================
-- SCRIPT COMPLETION MESSAGE
-- =====================================================================

DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'XUÂN THÙY VETERINARY MANAGEMENT - SETTINGS SYSTEM INSTALLED';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Tables created: system_settings, branch_settings, settings_change_log';
    RAISE NOTICE 'Functions created: get_setting_value, set_setting_value, get_settings_by_category';
    RAISE NOTICE 'Default settings loaded: % records', (SELECT COUNT(*) FROM public.system_settings);
    RAISE NOTICE 'Branch settings loaded: % records', (SELECT COUNT(*) FROM public.branch_settings);
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Ready for Settings UI implementation!';
    RAISE NOTICE '=================================================================';
END $$;
