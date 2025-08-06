-- =====================================================
-- 🧪 DEBT MANAGEMENT SYSTEM TEST QUERIES
-- Kiểm tra các views và functions đã tạo
-- =====================================================

-- ✅ Test 1: Kiểm tra view debt_summary
SELECT 
    'debt_summary view' as test_name,
    COUNT(*) as total_customers,
    COUNT(CASE WHEN current_debt > 0 THEN 1 END) as customers_with_debt,
    SUM(CASE WHEN current_debt > 0 THEN current_debt ELSE 0 END) as total_debt_amount
FROM debt_summary;

-- ✅ Test 2: Kiểm tra function get_debt_dashboard_stats
SELECT 
    'get_debt_dashboard_stats function' as test_name,
    get_debt_dashboard_stats() as stats_result;

-- ✅ Test 3: Kiểm tra function search_debt_customers
SELECT 
    'search_debt_customers function' as test_name,
    COUNT(*) as search_results
FROM search_debt_customers('', 'all', 'all', 10);

-- ✅ Test 4: Kiểm tra view debt_transactions_history
SELECT 
    'debt_transactions_history view' as test_name,
    COUNT(*) as total_transactions
FROM debt_transactions_history;

-- ✅ Test 5: Kiểm tra bảng debt_transactions có tồn tại không
SELECT 
    'debt_transactions table' as test_name,
    COUNT(*) as total_records
FROM debt_transactions;

-- ✅ Test 6: Kiểm tra indexes đã tạo
SELECT 
    'debt_management indexes' as test_name,
    COUNT(*) as total_indexes
FROM pg_indexes 
WHERE tablename IN ('debt_transactions', 'customers') 
AND indexname LIKE '%debt%';

SELECT '🎉 All Debt Management Tests Completed!' as final_status;
