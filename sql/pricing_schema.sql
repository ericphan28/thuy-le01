-- Pricing schema (entities only; implement later)

-- Price books
CREATE TABLE IF NOT EXISTS price_books (
  price_book_id serial PRIMARY KEY,
  name text NOT NULL,
  branch_id integer,
  channel text, -- POS / Delivery / Wholesale
  customer_group text, -- VIP/High/Medium/Low
  effective_from timestamp without time zone,
  effective_to timestamp without time zone,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);

-- Price rules within a book
CREATE TABLE IF NOT EXISTS price_rules (
  rule_id serial PRIMARY KEY,
  price_book_id integer REFERENCES price_books(price_book_id) ON DELETE CASCADE,
  scope text NOT NULL, -- sku/category/tag
  sku_code text,
  category_id integer,
  tag text,
  action_type text NOT NULL, -- percent/amount/net/bundle/tier
  action_value numeric(15,2),
  min_qty numeric(12,2),
  max_qty numeric(12,2),
  priority integer DEFAULT 100,
  effective_from timestamp without time zone,
  effective_to timestamp without time zone,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);

-- Contract pricing (customer x sku)
CREATE TABLE IF NOT EXISTS contract_prices (
  contract_id serial PRIMARY KEY,
  customer_id integer,
  product_id integer,
  net_price numeric(15,2) NOT NULL,
  effective_from timestamp without time zone,
  effective_to timestamp without time zone,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);

-- Volume tiers
CREATE TABLE IF NOT EXISTS volume_tiers (
  tier_id serial PRIMARY KEY,
  scope text NOT NULL, -- sku/category
  product_id integer,
  category_id integer,
  min_qty numeric(12,2) NOT NULL,
  discount_percent numeric(7,3),
  discount_amount numeric(15,2),
  effective_from timestamp without time zone,
  effective_to timestamp without time zone,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);

-- Exclusions & caps
CREATE TABLE IF NOT EXISTS pricing_exclusions (
  exclusion_id serial PRIMARY KEY,
  product_id integer,
  category_id integer,
  no_discount boolean DEFAULT false,
  min_margin_percent numeric(7,3),
  max_discount_percent numeric(7,3),
  created_at timestamp without time zone DEFAULT now()
);

-- Audit log
CREATE TABLE IF NOT EXISTS pricing_change_log (
  log_id serial PRIMARY KEY,
  entity text NOT NULL,
  entity_id integer NOT NULL,
  action text NOT NULL, -- create/update/delete
  changed_by text,
  changes jsonb,
  created_at timestamp without time zone DEFAULT now()
);
