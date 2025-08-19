-- =====================================================
-- Migration: Inbound Enhancements (Edit + Batch/Expiry)
-- Date: 2025-08-16
-- Idempotent
-- =====================================================

-- 1. Add batch/expiry tracking to stock_movements
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='batch_number') THEN
    ALTER TABLE public.stock_movements ADD COLUMN batch_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='expiry_date') THEN
    ALTER TABLE public.stock_movements ADD COLUMN expiry_date date;
  END IF;
END $$;

-- 2. Update record_stock_movement to support batch/expiry
CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_product_id int,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost numeric DEFAULT NULL,
  p_reason text DEFAULT 'MANUAL',
  p_invoice_id int DEFAULT NULL,
  p_reference_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_created_by text DEFAULT 'System',
  p_related_movement_id uuid DEFAULT NULL,
  p_supplier_id int DEFAULT NULL,
  p_batch_number text DEFAULT NULL,
  p_expiry_date date DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_movement_id uuid;
  v_new_stock numeric;
  v_cost_impact numeric;
BEGIN
  -- Insert movement record
  INSERT INTO public.stock_movements (
    product_id, movement_type, quantity, unit_cost, reason,
    invoice_id, reference_code, notes, location, created_by, 
    related_movement_id, supplier_id, batch_number, expiry_date
  ) VALUES (
    p_product_id, p_movement_type, p_quantity, p_unit_cost, p_reason,
    p_invoice_id, p_reference_code, p_notes, p_location, p_created_by,
    p_related_movement_id, p_supplier_id, p_batch_number, p_expiry_date
  ) RETURNING movement_id INTO v_movement_id;

  -- Calculate stock impact
  CASE p_movement_type
    WHEN 'IN' THEN v_new_stock := p_quantity;
    WHEN 'OUT' THEN v_new_stock := -p_quantity;
    WHEN 'ADJUST' THEN v_new_stock := p_quantity;
    WHEN 'LOSS' THEN v_new_stock := -p_quantity;
    WHEN 'FOUND' THEN v_new_stock := p_quantity;
    ELSE v_new_stock := 0;
  END CASE;

  -- Calculate cost impact
  v_cost_impact := v_new_stock * COALESCE(p_unit_cost, 0);

  -- Update product stock
  UPDATE public.products 
  SET 
    current_stock = current_stock + v_new_stock,
    cost_price = CASE 
      WHEN p_unit_cost IS NOT NULL AND p_movement_type = 'IN' THEN p_unit_cost
      ELSE cost_price 
    END,
    updated_at = now()
  WHERE product_id = p_product_id;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update receive function to support batch/expiry
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

    -- Update item (with batch/expiry if provided)
    UPDATE public.inbound_order_items
      SET 
        received_qty = received_qty + (v_line->>'receive_qty')::numeric,
        batch_number = COALESCE(v_line->>'batch_number', batch_number),
        expiry_date = COALESCE((v_line->>'expiry_date')::date, expiry_date)
    WHERE item_id = (v_line->>'item_id')::uuid;

    -- Create stock movement with batch/expiry
    PERFORM public.record_stock_movement(
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
      COALESCE(v_line->>'batch_number', v_item.batch_number),
      COALESCE((v_line->>'expiry_date')::date, v_item.expiry_date)
    );
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

-- 4. Function to update inbound order
CREATE OR REPLACE FUNCTION public.update_inbound_order(
  p_inbound_id uuid,
  p_expected_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_order record;
  v_item jsonb;
BEGIN
  -- Check if order can be edited
  SELECT * INTO v_order FROM public.inbound_orders WHERE inbound_id = p_inbound_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inbound order not found';
  END IF;
  
  IF v_order.status NOT IN ('PENDING', 'PARTIAL') THEN
    RAISE EXCEPTION 'Cannot edit order with status %', v_order.status;
  END IF;

  -- Update order
  UPDATE public.inbound_orders 
  SET 
    expected_date = COALESCE(p_expected_date, expected_date),
    notes = COALESCE(p_notes, notes)
  WHERE inbound_id = p_inbound_id;

  -- Update items if provided
  IF p_items IS NOT NULL THEN
    -- Remove old items that haven't been received
    DELETE FROM public.inbound_order_items 
    WHERE inbound_id = p_inbound_id AND received_qty = 0;
    
    -- Add/update items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO public.inbound_order_items(
        inbound_id, product_id, ordered_qty, unit_cost, total_cost, notes
      ) VALUES (
        p_inbound_id,
        (v_item->>'product_id')::int,
        (v_item->>'quantity')::numeric,
        (v_item->>'unit_cost')::numeric,
        ( (v_item->>'quantity')::numeric * COALESCE((v_item->>'unit_cost')::numeric,0) ),
        v_item->>'notes'
      )
      ON CONFLICT (item_id) DO UPDATE SET
        ordered_qty = (v_item->>'quantity')::numeric,
        unit_cost = (v_item->>'unit_cost')::numeric,
        total_cost = ( (v_item->>'quantity')::numeric * COALESCE((v_item->>'unit_cost')::numeric,0) ),
        notes = v_item->>'notes';
    END LOOP;
  END IF;

  RETURN TRUE;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update stock_movements_detailed view to include batch/expiry
DROP VIEW IF EXISTS public.stock_movements_detailed;
CREATE VIEW public.stock_movements_detailed AS
SELECT 
  sm.*,
  p.product_name,
  p.product_code,
  s.supplier_name
FROM public.stock_movements sm
LEFT JOIN public.products p ON sm.product_id = p.product_id
LEFT JOIN public.suppliers s ON sm.supplier_id = s.supplier_id
ORDER BY sm.created_at DESC;

-- Done
