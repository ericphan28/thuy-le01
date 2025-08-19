import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ospkleabpejgyvdevkmv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zcGtsZWFicGVqZ3l2ZGV2a212Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzU0NDU5MSwiZXhwIjoyMDY5MTIwNTkxfQ.02LIfuDpBe0OKZA_y6T5nw_S4XS-gOeG6bjsBlRVuGc'
);

async function fixReceiveFunction() {
  const sql = `
-- Update receive function to use correct parameters (no invoice_id)
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

    -- Create stock movement using existing signature (12 params, no invoice_id)
    PERFORM public.record_stock_movement(
      v_item.product_id::INTEGER,
      'IN'::VARCHAR(20),
      (v_line->>'receive_qty')::numeric,
      v_item.unit_cost,
      'PURCHASE_ORDER'::VARCHAR(50),
      NULL::INTEGER,
      v_code::VARCHAR(100),
      ('Nhập theo ' || v_code)::TEXT,
      NULL::TEXT,
      p_created_by::VARCHAR(100),
      NULL::VARCHAR(50),
      v_supplier_id::INTEGER
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
  `;

  try {
    const { data, error } = await supabase.rpc('exec', { query: sql });
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Function updated successfully!');
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

fixReceiveFunction();
