-- Seed a default POS Price Book if none exists
DO $$
DECLARE
  existing integer;
BEGIN
  SELECT price_book_id INTO existing FROM price_books WHERE name = 'Bảng giá POS' LIMIT 1;
  IF existing IS NULL THEN
    INSERT INTO price_books(name, channel, customer_group, is_active, notes)
    VALUES ('Bảng giá POS', 'POS', NULL, true, 'Mặc định dùng tại quầy bán lẻ');
  END IF;
END $$;
