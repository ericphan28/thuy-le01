-- Seed a few example rules for the default POS price book
-- Assumes a price book named 'Bảng giá POS' already exists
DO $$
DECLARE
  pb_id integer;
BEGIN
  SELECT price_book_id INTO pb_id FROM price_books WHERE name = 'Bảng giá POS' LIMIT 1;
  IF pb_id IS NULL THEN
    RAISE NOTICE 'No price book named Bảng giá POS found. Run seed_price_books.sql first.';
    RETURN;
  END IF;

  -- Example 1: 10% off for category_id = 1
  IF NOT EXISTS (
    SELECT 1 FROM price_rules WHERE price_book_id = pb_id AND scope = 'category' AND category_id = 1 AND action_type = 'percent'
  ) THEN
    INSERT INTO price_rules(price_book_id, scope, category_id, action_type, action_value, priority, is_active, notes)
    VALUES (pb_id, 'category', 1, 'percent', 10, 100, true, 'Giảm 10% cho category #1');
  END IF;

  -- Example 2: Net price for a specific SKU
  IF NOT EXISTS (
    SELECT 1 FROM price_rules WHERE price_book_id = pb_id AND scope = 'sku' AND sku_code = 'SP000001' AND action_type = 'net'
  ) THEN
    INSERT INTO price_rules(price_book_id, scope, sku_code, action_type, action_value, priority, is_active, notes)
    VALUES (pb_id, 'sku', 'SP000001', 'net', 99000, 50, true, 'Giá net 99,000đ cho SP000001');
  END IF;

  -- Example 3: Amount off for a tag
  IF NOT EXISTS (
    SELECT 1 FROM price_rules WHERE price_book_id = pb_id AND scope = 'tag' AND tag = 'HOT' AND action_type = 'amount'
  ) THEN
    INSERT INTO price_rules(price_book_id, scope, tag, action_type, action_value, min_qty, priority, is_active, notes)
    VALUES (pb_id, 'tag', 'HOT', 'amount', 5000, 2, 120, true, 'Mua từ 2 sản phẩm tag HOT giảm 5k');
  END IF;
END $$;
