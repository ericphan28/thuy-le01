-- Fix pricing rule for SP000049 to work with qty=1
-- Current rule has min_qty=5 which doesn't match qty=1
-- We'll update it to min_qty=1 so it applies to all quantities from 1 upward

-- First, let's check the current rule
SELECT rule_id, scope, sku_code, action_type, action_value, min_qty, max_qty, priority, is_active
FROM public.price_rules 
WHERE rule_id = 1 AND sku_code = 'SP000049';

-- Update the rule to allow qty=1
UPDATE public.price_rules 
SET min_qty = 1.00,
    notes = 'Updated to support qty=1 - Fixed pricing rule for SP000049'
WHERE rule_id = 1 
  AND price_book_id = 1 
  AND scope = 'sku' 
  AND sku_code = 'SP000049'
  AND action_type = 'net'
  AND action_value = 190000.00;

-- Verify the update
SELECT rule_id, scope, sku_code, action_type, action_value, min_qty, max_qty, priority, is_active, notes
FROM public.price_rules 
WHERE rule_id = 1 AND sku_code = 'SP000049';

-- Optional: Check if there are any other conflicting rules for SP000049
SELECT rule_id, scope, sku_code, action_type, action_value, min_qty, max_qty, priority, is_active
FROM public.price_rules 
WHERE price_book_id = 1 
  AND (
    (scope = 'sku' AND sku_code = 'SP000049') 
    OR (scope = 'category' AND category_id = 28)
    OR scope = 'all'
  )
ORDER BY priority DESC, 
         CASE scope WHEN 'sku' THEN 3 WHEN 'category' THEN 2 WHEN 'tag' THEN 1 ELSE 0 END DESC,
         rule_id ASC;
