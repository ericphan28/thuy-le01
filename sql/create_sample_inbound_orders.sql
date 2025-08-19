-- =====================================================
-- Create Sample Inbound Orders for Testing
-- =====================================================

-- First, check if we have suppliers and products
DO $$
DECLARE
    supplier_count int;
    product_count int;
    sample_supplier_id int;
    sample_product_id int;
    new_inbound_id uuid;
    inbound_code_val text;
BEGIN
    -- Check data availability
    SELECT COUNT(*) INTO supplier_count FROM suppliers;
    SELECT COUNT(*) INTO product_count FROM products;
    
    RAISE NOTICE 'Found % suppliers and % products', supplier_count, product_count;
    
    -- Only create samples if we have basic data
    IF supplier_count > 0 AND product_count > 0 THEN
        -- Get first supplier and product
        SELECT supplier_id INTO sample_supplier_id FROM suppliers LIMIT 1;
        SELECT product_id INTO sample_product_id FROM products LIMIT 1;
        
        -- Check if we already have inbound orders
        IF NOT EXISTS (SELECT 1 FROM inbound_orders LIMIT 1) THEN
            RAISE NOTICE 'Creating sample inbound orders...';
            
            -- Generate code for first order
            SELECT generate_inbound_code() INTO inbound_code_val;
            
            -- Create first sample inbound order (RECEIVED status for returns testing)
            INSERT INTO inbound_orders (
                inbound_code, 
                supplier_id, 
                expected_date, 
                received_date,
                status, 
                notes, 
                created_by
            ) VALUES (
                inbound_code_val,
                sample_supplier_id,
                CURRENT_DATE - INTERVAL '3 days',
                CURRENT_DATE - INTERVAL '1 day',
                'RECEIVED',
                'Sample received inbound order for testing returns',
                'system'
            ) RETURNING inbound_id INTO new_inbound_id;
            
            -- Add items to the inbound order
            INSERT INTO inbound_order_items (
                inbound_id,
                product_id,
                ordered_qty,
                received_qty,
                unit_cost,
                total_cost,
                notes
            ) VALUES (
                new_inbound_id,
                sample_product_id,
                100,
                100, -- Already received
                25000, -- 25k per unit
                2500000, -- Total 2.5M
                'Sample product for return testing'
            );
            
            -- Create second sample inbound order (different status)
            SELECT generate_inbound_code() INTO inbound_code_val;
            
            INSERT INTO inbound_orders (
                inbound_code, 
                supplier_id, 
                expected_date,
                received_date,
                status, 
                notes, 
                created_by
            ) VALUES (
                inbound_code_val,
                sample_supplier_id,
                CURRENT_DATE - INTERVAL '3 days',
                NOW() - INTERVAL '1 day',
                'RECEIVED',
                'Completed inbound order',
                'system'
            ) RETURNING inbound_id INTO new_inbound_id;
            
            -- Add items to second order
            INSERT INTO inbound_order_items (
                inbound_id,
                product_id,
                ordered_qty,
                received_qty,
                unit_cost,
                total_cost,
                batch_number
            ) VALUES (
                new_inbound_id,
                sample_product_id,
                50,
                50,
                27000,
                1350000,
                'BATCH001'
            );
            
            RAISE NOTICE 'Created 2 sample inbound orders successfully';
        ELSE
            RAISE NOTICE 'Inbound orders already exist, skipping sample creation';
        END IF;
    ELSE
        RAISE NOTICE 'Insufficient base data (suppliers: %, products: %). Please ensure you have suppliers and products first.', supplier_count, product_count;
    END IF;
END $$;

-- Check results
SELECT 
    'Summary' as info,
    (SELECT COUNT(*) FROM inbound_orders) as total_inbound_orders,
    (SELECT COUNT(*) FROM inbound_order_items) as total_items,
    (SELECT COUNT(*) FROM inbound_orders WHERE status = 'PENDING') as pending_orders,
    (SELECT COUNT(*) FROM inbound_orders WHERE status = 'RECEIVED') as received_orders;

-- Show the summary view
SELECT * FROM inbound_orders_summary ORDER BY created_at DESC LIMIT 5;
