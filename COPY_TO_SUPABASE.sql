-- Copy và paste vào Supabase SQL Editor để fix ngay
-- =====================================================
-- Quick Fix: Update receive function
-- =====================================================

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

    -- Create stock movement (direct insert - bypass function)
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
