-- Fix price rule for SP000049 to work with qty=1
-- Current rule has min_qty=5, which doesn't match qty=1
-- This script will update the rule to allow qty=1

-- First, let's see the current rule
SELECT rule_id, scope, sku_code, action_type, action_value, min_qty, max_qty, priority 
FROM price_rules 
WHERE price_book_id = 1 
  AND scope = 'sku' 
  AND sku_code = 'SP000049' 
  AND action_type = 'net' 
  AND action_value = 190000.00;

-- Update rule to allow min_qty=1 instead of 5
UPDATE price_rules 
SET min_qty = 1.00,
    notes = 'Updated: min_qty changed from 5 to 1 to allow single quantity purchases',
    updated_at = NOW()
WHERE price_book_id = 1 
  AND scope = 'sku' 
  AND sku_code = 'SP000049' 
  AND action_type = 'net' 
  AND action_value = 190000.00
  AND min_qty = 5.00;

-- Verify the update
SELECT rule_id, scope, sku_code, action_type, action_value, min_qty, max_qty, priority, notes
FROM price_rules 
WHERE price_book_id = 1 
  AND scope = 'sku' 
  AND sku_code = 'SP000049' 
  AND action_type = 'net' 
  AND action_value = 190000.00;

-- Check if there are any conflicting rules that might override this
SELECT rule_id, scope, sku_code, category_id, tag, action_type, action_value, min_qty, max_qty, priority
FROM price_rules 
WHERE price_book_id = 1 
  AND is_active = true
  AND (
    (scope = 'sku' AND sku_code = 'SP000049')
    OR (scope = 'category' AND category_id = 28)  -- SP000049 is in category 28
    OR (scope = 'all')
  )
ORDER BY priority DESC, 
         CASE scope 
           WHEN 'sku' THEN 3
           WHEN 'category' THEN 2 
           WHEN 'tag' THEN 1
           WHEN 'all' THEN 0
         END DESC,
         rule_id ASC;
