-- Fix create_return_order function parameter order
-- Error: input parameters after one with a default value must also have defaults

DROP FUNCTION IF EXISTS public.create_return_order(int, uuid, text, text, text, jsonb);

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
