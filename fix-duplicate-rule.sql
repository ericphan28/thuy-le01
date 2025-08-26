-- Disable duplicate rule 651 to avoid conflicts
-- Rule 1 now covers the same functionality with proper qty range

-- Check current status of rule 651
SELECT rule_id, scope, sku_code, action_type, action_value, min_qty, max_qty, priority, is_active, notes
FROM public.price_rules 
WHERE rule_id = 651 AND sku_code = 'SP000049';

-- Disable rule 651 since it conflicts with the updated rule 1
UPDATE public.price_rules 
SET is_active = false,
    notes = 'Disabled - Duplicates rule 1 functionality after rule 1 was updated'
WHERE rule_id = 651 
  AND price_book_id = 1 
  AND scope = 'sku' 
  AND sku_code = 'SP000049'
  AND action_type = 'net'
  AND action_value = 220000.00;

-- Verify the change
SELECT rule_id, scope, sku_code, action_type, action_value, min_qty, max_qty, priority, is_active, notes
FROM public.price_rules 
WHERE rule_id = 651 AND sku_code = 'SP000049';

-- Final check: Show active rules for SP000049
SELECT rule_id, scope, sku_code, action_type, action_value, min_qty, max_qty, priority, is_active
FROM public.price_rules 
WHERE price_book_id = 1 
  AND scope = 'sku' 
  AND sku_code = 'SP000049'
  AND is_active = true
ORDER BY priority DESC, rule_id ASC;
