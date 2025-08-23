-- Enable RLS and allow reading price books from the app
-- Note: Adjust policies to your security model as needed.

ALTER TABLE IF EXISTS price_books ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'price_books' AND policyname = 'read_price_books'
  ) THEN
    CREATE POLICY read_price_books ON price_books
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;
