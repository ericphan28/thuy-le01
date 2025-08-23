-- Enable RLS and allow reading price_rules from the app
ALTER TABLE IF EXISTS price_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'price_rules' AND policyname = 'read_price_rules'
  ) THEN
    CREATE POLICY read_price_rules ON price_rules
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;
