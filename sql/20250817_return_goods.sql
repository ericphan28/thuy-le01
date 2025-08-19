-- =====================================================
-- Return Goods System
-- Date: 2025-08-17
-- =====================================================

-- 1. Return Orders table
CREATE TABLE IF NOT EXISTS public.return_orders (
  return_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_code text UNIQUE,
  supplier_id int REFERENCES public.suppliers(supplier_id),
  inbound_id uuid REFERENCES public.inbound_orders(inbound_id),
  return_date date DEFAULT CURRENT_DATE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  notes text,
  total_amount numeric(15,2) DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by text
);

-- 2. Return Order Items table
CREATE TABLE IF NOT EXISTS public.return_order_items (
  return_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid REFERENCES public.return_orders(return_id) ON DELETE CASCADE,
  product_id int REFERENCES public.products(product_id),
  quantity numeric(15,2) NOT NULL,
  unit_cost numeric(15,2),
  total_cost numeric(15,2),
  reason text,
  batch_number text,
  expiry_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_return_orders_supplier ON public.return_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_return_orders_status ON public.return_orders(status);
CREATE INDEX IF NOT EXISTS idx_return_order_items_return ON public.return_order_items(return_id);

-- 4. Sequence for return codes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='return_order_code_seq') THEN
    CREATE SEQUENCE return_order_code_seq START 1;
  END IF;
END $$;

-- 5. Generate return code function
CREATE OR REPLACE FUNCTION public.generate_return_code()
RETURNS text AS $$
DECLARE
  seq_val bigint;
BEGIN
  SELECT nextval('return_order_code_seq') INTO seq_val;
  RETURN 'RET-' || to_char(current_date,'YYYY') || '-' || lpad(seq_val::text,4,'0');
END;$$ LANGUAGE plpgsql;

-- 6. Create return order function
CREATE OR REPLACE FUNCTION public.create_return_order(
  p_supplier_id int,
  p_reason text,
  p_created_by text,
  p_items jsonb,
  p_inbound_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_return_id uuid;
  v_code text;
  v_item jsonb;
  v_total numeric := 0;
BEGIN
  v_code := generate_return_code();
  
  INSERT INTO public.return_orders(
    return_code, supplier_id, inbound_id, reason, notes, created_by
  ) VALUES (
    v_code, p_supplier_id, p_inbound_id, p_reason, p_notes, p_created_by
  ) RETURNING return_id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.return_order_items(
      return_id, product_id, quantity, unit_cost, total_cost, reason, notes
    ) VALUES (
      v_return_id,
      (v_item->>'product_id')::int,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_cost')::numeric,
      ( (v_item->>'quantity')::numeric * COALESCE((v_item->>'unit_cost')::numeric,0) ),
      v_item->>'reason',
      v_item->>'notes'
    );
    
    v_total := v_total + ( (v_item->>'quantity')::numeric * COALESCE((v_item->>'unit_cost')::numeric,0) );
  END LOOP;

  -- Update total amount
  UPDATE public.return_orders SET total_amount = v_total WHERE return_id = v_return_id;

  RETURN v_return_id;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Process return (reduce stock + create movements)
CREATE OR REPLACE FUNCTION public.process_return_order(
  p_return_id uuid,
  p_processed_by text
) RETURNS jsonb AS $$
DECLARE
  v_return record;
  v_item record;
  v_old_stock numeric;
  v_new_stock numeric;
BEGIN
  SELECT * INTO v_return FROM public.return_orders WHERE return_id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return order not found';
  END IF;
  
  IF v_return.status != 'PENDING' THEN
    RAISE EXCEPTION 'Return order already processed';
  END IF;

  FOR v_item IN 
    SELECT * FROM public.return_order_items WHERE return_id = p_return_id 
  LOOP
    -- Get current stock
    SELECT current_stock INTO v_old_stock 
    FROM public.products 
    WHERE product_id = v_item.product_id;
    
    v_new_stock := v_old_stock - v_item.quantity;
    
    -- Check if we have enough stock
    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product_id %. Current: %, Return: %', 
        v_item.product_id, v_old_stock, v_item.quantity;
    END IF;

    -- Create stock movement (OUT)
    INSERT INTO public.stock_movements (
      product_id, movement_type, quantity, unit_cost, reference_type,
      reference_id, reference_code, reason, notes, created_by, 
      batch_id, supplier_id, old_stock, new_stock, created_at
    ) VALUES (
      v_item.product_id,
      'OUT',
      v_item.quantity,
      v_item.unit_cost,
      'RETURN_GOODS',
      NULL,
      v_return.return_code,
      'Trả hàng cho NCC: ' || v_return.reason,
      v_item.notes,
      p_processed_by,
      v_item.batch_number,
      v_return.supplier_id,
      v_old_stock,
      v_new_stock,
      now()
    );

    -- Update product stock
    UPDATE public.products 
    SET current_stock = v_new_stock, updated_at = now()
    WHERE product_id = v_item.product_id;
  END LOOP;

  -- Mark return as processed
  UPDATE public.return_orders 
  SET status = 'PROCESSED', processed_at = now(), processed_by = p_processed_by
  WHERE return_id = p_return_id;

  RETURN jsonb_build_object('status', 'PROCESSED', 'processed_at', now());
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Return orders summary view
CREATE OR REPLACE VIEW public.return_orders_summary AS
SELECT 
  ro.*,
  s.supplier_name,
  io.inbound_code,
  COALESCE(SUM(ri.quantity),0) AS total_quantity,
  COUNT(ri.return_item_id) AS item_count
FROM public.return_orders ro
LEFT JOIN public.suppliers s ON ro.supplier_id = s.supplier_id
LEFT JOIN public.inbound_orders io ON ro.inbound_id = io.inbound_id
LEFT JOIN public.return_order_items ri ON ro.return_id = ri.return_id
GROUP BY ro.return_id, s.supplier_name, io.inbound_code
ORDER BY ro.created_at DESC;

-- Done
