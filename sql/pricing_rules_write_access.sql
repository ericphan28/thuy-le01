-- Allow inserting/updating/deleting price_rules from the app (adjust as needed)
ALTER TABLE IF EXISTS price_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'price_rules' AND policyname = 'write_price_rules'
  ) THEN
    CREATE POLICY write_price_rules ON price_rules
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
