-- Generate per-SKU net-price rules in 'Bảng giá POS' from products.sale_price
-- Safe to re-run: skips existing identical SKU net rules
DO $$
DECLARE
  pb_id integer;
BEGIN
  SELECT price_book_id INTO pb_id FROM price_books WHERE name = 'Bảng giá POS' LIMIT 1;
  IF pb_id IS NULL THEN
    RAISE NOTICE 'No price book named Bảng giá POS found. Run seed_price_books.sql first.';
    RETURN;
  END IF;

  INSERT INTO price_rules(
    price_book_id, scope, sku_code, action_type, action_value,
    priority, is_active, notes
  )
  SELECT
    pb_id, 'sku', p.product_code, 'net', p.sale_price,
    100, true, 'Auto-generated from products.sale_price'
  FROM products p
  WHERE COALESCE(p.sale_price, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM price_rules r
      WHERE r.price_book_id = pb_id
        AND r.scope = 'sku'
        AND r.sku_code = p.product_code
        AND r.action_type = 'net'
    );
END $$;
