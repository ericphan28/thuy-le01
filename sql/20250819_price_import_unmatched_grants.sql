-- Create and grant access for price_import_unmatched logging table
-- Run this in Supabase SQL Editor or via psql before re-inserting unmatched rows

BEGIN;

CREATE TABLE IF NOT EXISTS public.price_import_unmatched (
  id bigserial PRIMARY KEY,
  product_code text,
  product_name text,
  category_name text,
  price1 numeric,
  price2 numeric,
  price3 numeric,
  reason text,
  created_at timestamp without time zone DEFAULT now()
);

-- Optional: keep RLS disabled for this low-risk logging table to simplify inserts from scripts
-- If you prefer RLS, enable and add policies instead of GRANTs below
-- ALTER TABLE public.price_import_unmatched ENABLE ROW LEVEL SECURITY;

-- Ensure roles can insert/select (needed when using anon or authenticated keys from server scripts)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.price_import_unmatched TO anon, authenticated, service_role;

-- Also grant sequence privileges for the bigserial id
DO $$
DECLARE
  seq_name text;
BEGIN
  SELECT pg_get_serial_sequence('public.price_import_unmatched', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO anon, authenticated, service_role', seq_name);
  END IF;
END $$;

COMMIT;
