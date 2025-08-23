-- Stubs for pricing functions (to be implemented)

CREATE OR REPLACE FUNCTION resolve_price(
  p_customer_id integer,
  p_branch_id integer,
  p_channel text,
  p_items jsonb,
  p_on timestamp without time zone DEFAULT now()
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'success', true,
    'applied_rules', jsonb_build_array(),
    'items', p_items
  );
$$;

CREATE OR REPLACE FUNCTION validate_margin(
  p_product_id integer,
  p_sale_price numeric
) RETURNS boolean LANGUAGE sql AS $$
  SELECT true;
$$;
