-- Price list import via staging (TSV with tab delimiter)
-- Source file: public/du-lieu-goc/bang-gia-mac-dinh.txt
-- Run with psql. This script will:
-- 1) Create a staging table
-- 2) Copy data into staging
-- 3) Normalize and update products' sale_price/base_price/cost_price safely
-- 4) Produce unmatched rows for manual review

BEGIN;

CREATE TABLE IF NOT EXISTS public.stg_price_list (
  raw_code text,
  raw_name text,
  raw_unit text,
  raw_category text,
  raw_stock text,
  raw_price1 text,
  raw_price2 text,
  raw_price3 text
);

TRUNCATE public.stg_price_list;

-- IMPORTANT: The next command must be run interactively in psql to load the file from your client machine.
-- Example path on Windows: D:\\Thang\\thuy-le01\\public\\du-lieu-goc\\bang-gia-mac-dinh.txt
-- Uncomment and execute in your psql session:
-- \copy public.stg_price_list FROM 'D:\\Thang\\thuy-le01\\public\\du-lieu-goc\\bang-gia-mac-dinh.txt' WITH (FORMAT csv, DELIMITER E'\t', HEADER false, QUOTE '"', ESCAPE '"');

-- Cleaned view
DROP VIEW IF EXISTS public.v_price_list_clean CASCADE;
CREATE VIEW public.v_price_list_clean AS
SELECT
  NULLIF(TRIM(raw_code), '') AS product_code,
  NULLIF(TRIM(raw_name), '') AS product_name,
  NULLIF(TRIM(raw_unit), '') AS unit_name,
  NULLIF(TRIM(raw_category), '') AS category_name,
  COALESCE(NULLIF(REPLACE(raw_price1, ',', ''), '')::numeric, 0) AS price1,
  COALESCE(NULLIF(REPLACE(raw_price2, ',', ''), '')::numeric, 0) AS price2,
  COALESCE(NULLIF(REPLACE(raw_price3, ',', ''), '')::numeric, 0) AS price3
FROM public.stg_price_list;

-- Resolve target prices per row
DROP VIEW IF EXISTS public.v_price_list_resolved CASCADE;
CREATE VIEW public.v_price_list_resolved AS
SELECT
  product_code,
  product_name,
  unit_name,
  category_name,
  price1,
  price2,
  price3,
  CASE WHEN price3 > 0 THEN price3
       WHEN price2 > 0 THEN price2
       ELSE price1 END AS sale_price,
  CASE WHEN price1 > 0 THEN price1
       WHEN price2 > 0 AND (price3 IS NULL OR price3 = 0) THEN price2
       WHEN price3 > 0 THEN price3
       ELSE NULL END AS suggested_cost
FROM public.v_price_list_clean;

-- Optional: normalize/ensure categories exist (best effort by name)
-- Insert missing categories by name (case-insensitive)
INSERT INTO public.product_categories (category_code, category_name, is_active)
SELECT lower(regexp_replace(category_name, '\\s+', '_', 'g')) AS category_code,
       category_name,
       TRUE
FROM (
  SELECT DISTINCT category_name FROM public.v_price_list_clean WHERE category_name IS NOT NULL
) s
LEFT JOIN public.product_categories pc ON lower(pc.category_name) = lower(s.category_name)
WHERE pc.category_id IS NULL;

-- Update products by code when possible
-- Assumptions: products table has columns: product_id, product_code, product_name, category_id, sale_price, base_price, cost_price, is_active
WITH src AS (
  SELECT * FROM public.v_price_list_resolved
), matched AS (
  SELECT p.product_id,
         p.product_code,
         p.product_name AS current_name,
         src.product_name AS src_name,
         src.category_name,
         src.sale_price,
         src.suggested_cost
  FROM src
  JOIN public.products p ON p.product_code = src.product_code
), cat AS (
  SELECT pc.category_id, pc.category_name FROM public.product_categories pc
)
UPDATE public.products p
SET
  sale_price = GREATEST(0, COALESCE(m.sale_price, p.sale_price)),
  base_price = GREATEST(0, COALESCE(m.sale_price, p.base_price, m.sale_price)),
  cost_price = COALESCE(
    CASE WHEN m.suggested_cost IS NOT NULL AND m.suggested_cost > 0 THEN m.suggested_cost END,
    p.cost_price
  ),
  updated_at = now()
FROM matched m
WHERE p.product_id = m.product_id;

-- Update category mapping by name when product_code matched but category differs (best effort)
WITH src AS (
  SELECT * FROM public.v_price_list_resolved WHERE category_name IS NOT NULL
), matched AS (
  SELECT p.product_id, src.category_name
  FROM src
  JOIN public.products p ON p.product_code = src.product_code
), cat AS (
  SELECT category_id, category_name FROM public.product_categories
)
UPDATE public.products p
SET category_id = c.category_id
FROM matched m
JOIN cat c ON lower(c.category_name) = lower(m.category_name)
WHERE p.product_id = m.product_id
  AND (p.category_id IS NULL OR p.category_id <> c.category_id);

-- Attempt name-based matching (when product_code missing or bad)
WITH src AS (
  SELECT * FROM public.v_price_list_resolved WHERE (product_code IS NULL OR product_code = '') AND product_name IS NOT NULL
), matched AS (
  SELECT p.product_id,
         src.product_name,
         src.category_name,
         src.sale_price,
         src.suggested_cost
  FROM src
  JOIN public.products p ON lower(p.product_name) = lower(src.product_name)
)
UPDATE public.products p
SET
  sale_price = GREATEST(0, COALESCE(m.sale_price, p.sale_price)),
  base_price = GREATEST(0, COALESCE(m.sale_price, p.base_price, m.sale_price)),
  cost_price = COALESCE(
    CASE WHEN m.suggested_cost IS NOT NULL AND m.suggested_cost > 0 THEN m.suggested_cost END,
    p.cost_price
  ),
  updated_at = now()
FROM matched m
WHERE p.product_id = m.product_id;

-- Unmatched rows (no code match and no name match or all prices zero)
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

INSERT INTO public.price_import_unmatched (
  product_code, product_name, category_name, price1, price2, price3, reason
)
SELECT r.product_code, r.product_name, r.category_name, r.price1, r.price2, r.price3,
  CASE 
    WHEN COALESCE(r.price1,0)=0 AND COALESCE(r.price2,0)=0 AND COALESCE(r.price3,0)=0 THEN 'all_zero_prices'
    WHEN r.product_code IS NOT NULL AND EXISTS (SELECT 1 FROM public.products p WHERE p.product_code = r.product_code) THEN NULL
    WHEN r.product_code IS NULL AND r.product_name IS NOT NULL AND EXISTS (SELECT 1 FROM public.products p WHERE lower(p.product_name)=lower(r.product_name)) THEN NULL
    ELSE 'no_match_by_code_or_name'
  END AS reason
FROM public.v_price_list_resolved r
WHERE (
  (r.product_code IS NULL OR NOT EXISTS (SELECT 1 FROM public.products p WHERE p.product_code = r.product_code))
  AND (r.product_name IS NULL OR NOT EXISTS (SELECT 1 FROM public.products p WHERE lower(p.product_name) = lower(r.product_name)))
) OR (COALESCE(r.price1,0)=0 AND COALESCE(r.price2,0)=0 AND COALESCE(r.price3,0)=0);

COMMIT;
