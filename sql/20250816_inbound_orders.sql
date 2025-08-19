-- =====================================================
-- Migration: Inbound Orders (PO) + Receive Functions
-- Date: 2025-08-16
-- Idempotent
-- =====================================================

-- 1. Tables
CREATE TABLE IF NOT EXISTS public.inbound_orders (
  inbound_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_code text UNIQUE,
  supplier_id int REFERENCES public.suppliers(supplier_id),
  expected_date date,
  received_date timestamptz,
  status text NOT NULL DEFAULT 'PENDING',
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inbound_order_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_id uuid REFERENCES public.inbound_orders(inbound_id) ON DELETE CASCADE,
  product_id int REFERENCES public.products(product_id),
  ordered_qty numeric(15,2) NOT NULL,
  received_qty numeric(15,2) NOT NULL DEFAULT 0,
  unit_cost numeric(15,2),
  total_cost numeric(15,2),
  expiry_date date,
  batch_number text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_orders_status ON public.inbound_orders(status);
CREATE INDEX IF NOT EXISTS idx_inbound_order_items_inbound ON public.inbound_order_items(inbound_id);

-- 2. Sequence for human readable codes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='inbound_order_code_seq') THEN
    CREATE SEQUENCE inbound_order_code_seq START 1;
  END IF;
END $$;

-- 3. Helper to generate code (year based)
CREATE OR REPLACE FUNCTION public.generate_inbound_code()
RETURNS text AS $$
DECLARE
  seq_val bigint;
BEGIN
  SELECT nextval('inbound_order_code_seq') INTO seq_val;
  RETURN 'PO-' || to_char(current_date,'YYYY') || '-' || lpad(seq_val::text,4,'0');
END;$$ LANGUAGE plpgsql;

-- 4. Create order with items (atomic)
CREATE OR REPLACE FUNCTION public.create_inbound_order(
  p_supplier_id int,
  p_expected_date date,
  p_notes text,
  p_created_by text,
  p_items jsonb
) RETURNS uuid AS $$
DECLARE
  v_inbound_id uuid;
  v_code text;
  v_item jsonb;
BEGIN
  v_code := generate_inbound_code();
  INSERT INTO public.inbound_orders(inbound_code, supplier_id, expected_date, notes, created_by)
  VALUES (v_code, p_supplier_id, p_expected_date, p_notes, p_created_by)
  RETURNING inbound_id INTO v_inbound_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.inbound_order_items(
      inbound_id, product_id, ordered_qty, unit_cost, total_cost, notes
    ) VALUES (
      v_inbound_id,
      (v_item->>'product_id')::int,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_cost')::numeric,
      ( (v_item->>'quantity')::numeric * COALESCE((v_item->>'unit_cost')::numeric,0) ),
      v_item->>'notes'
    );
  END LOOP;

  RETURN v_inbound_id;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Receive items (partial / full)
CREATE OR REPLACE FUNCTION public.receive_inbound_items(
  p_inbound_id uuid,
  p_lines jsonb,
  p_created_by text
) RETURNS jsonb AS $$
DECLARE
  v_line jsonb;
  v_item record;
  v_order record;
  v_status text;
  v_all_received boolean := true;
  v_any_received boolean := false;
  v_supplier_id int;
  v_code text;
BEGIN
  SELECT * INTO v_order FROM public.inbound_orders WHERE inbound_id = p_inbound_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inbound order not found %', p_inbound_id;
  END IF;
  v_supplier_id := v_order.supplier_id;
  v_code := v_order.inbound_code;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM public.inbound_order_items 
      WHERE item_id = (v_line->>'item_id')::uuid AND inbound_id = p_inbound_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found %', v_line->>'item_id';
    END IF;

    IF (v_line->>'receive_qty')::numeric <= 0 THEN
      RAISE EXCEPTION 'Invalid receive qty for item %', v_line->>'item_id';
    END IF;
    IF v_item.received_qty + (v_line->>'receive_qty')::numeric > v_item.ordered_qty THEN
      RAISE EXCEPTION 'Receive qty exceeds ordered for item %', v_line->>'item_id';
    END IF;

    -- Update item
    UPDATE public.inbound_order_items
      SET received_qty = received_qty + (v_line->>'receive_qty')::numeric
    WHERE item_id = (v_line->>'item_id')::uuid;

    -- Create stock movement (simplified - match existing function signature)
    INSERT INTO public.stock_movements (
      product_id, movement_type, quantity, unit_cost, reference_type,
      reference_id, reference_code, reason, notes, created_by, 
      batch_id, supplier_id, created_at
    ) VALUES (
      v_item.product_id,
      'IN',
      (v_line->>'receive_qty')::numeric,
      v_item.unit_cost,
      'PURCHASE_ORDER',
      NULL,
      v_code,
      'Nhập theo ' || v_code,
      NULL,
      p_created_by,
      NULL,
      v_supplier_id,
      now()
    );

    -- Update product stock manually
    UPDATE public.products 
    SET 
      current_stock = current_stock + (v_line->>'receive_qty')::numeric,
      cost_price = v_item.unit_cost,
      updated_at = now()
    WHERE product_id = v_item.product_id;
  END LOOP;

  -- Determine status
  FOR v_item IN SELECT * FROM public.inbound_order_items WHERE inbound_id = p_inbound_id LOOP
    IF v_item.received_qty < v_item.ordered_qty THEN
      v_all_received := false;
    END IF;
    IF v_item.received_qty > 0 THEN
      v_any_received := true;
    END IF;
  END LOOP;

  IF v_all_received THEN
    v_status := 'RECEIVED';
    UPDATE public.inbound_orders SET status = v_status, received_date = now() WHERE inbound_id = p_inbound_id;
  ELSIF v_any_received THEN
    v_status := 'PARTIAL';
    UPDATE public.inbound_orders SET status = v_status WHERE inbound_id = p_inbound_id;
  ELSE
    v_status := 'PENDING';
  END IF;

  RETURN jsonb_build_object('status', v_status);
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Summary view
CREATE OR REPLACE VIEW public.inbound_orders_summary AS
SELECT o.*, 
       COALESCE(SUM(i.ordered_qty),0) AS ordered_total_qty,
       COALESCE(SUM(i.received_qty),0) AS received_total_qty,
       COALESCE(SUM(i.total_cost),0) AS total_cost,
       s.supplier_name
FROM public.inbound_orders o
LEFT JOIN public.inbound_order_items i ON o.inbound_id = i.inbound_id
LEFT JOIN public.suppliers s ON o.supplier_id = s.supplier_id
GROUP BY o.inbound_id, s.supplier_name
ORDER BY o.created_at DESC;

-- Done
