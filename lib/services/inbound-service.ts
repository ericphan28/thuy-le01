import { createClient } from '@/lib/supabase/client';

export interface CreateInboundItemInput {
  product_id: number;
  quantity: number;
  unit_cost: number;
  notes?: string;
}

export interface InboundOrderSummary {
  inbound_id: string;
  inbound_code: string;
  supplier_id?: number;
  supplier_name?: string;
  expected_date?: string;
  received_date?: string;
  status: 'PENDING' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  notes?: string;
  created_by: string;
  created_at: string;
  ordered_total_qty: number;
  received_total_qty: number;
  total_cost: number;
}

class InboundService {
  private supabase = createClient();

  async createInbound(params: {
    supplier_id: number;
    expected_date: string;
    notes: string;
    created_by: string;
    items: CreateInboundItemInput[];
  }) {
    const { supplier_id, expected_date, notes, created_by, items } = params;
    const { data, error } = await this.supabase.rpc('create_inbound_order', {
      p_supplier_id: supplier_id,
      p_expected_date: expected_date,
      p_notes: notes,
      p_created_by: created_by,
      p_items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost, notes: i.notes }))
    });
    if (error) throw new Error(error.message);
    return data as string; // inbound_id
  }

  async listInbound(limit: number = 100): Promise<InboundOrderSummary[]> {
    const { data, error } = await this.supabase
      .from('inbound_orders_summary')
      .select('*')
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data as any[]) as InboundOrderSummary[];
  }

  async getItems(inbound_id: string) {
    const { data, error } = await this.supabase
      .from('inbound_order_items')
      .select(`
        *,
        products!inner(
          product_name,
          product_code
        )
      `)
      .eq('inbound_id', inbound_id)
      .order('created_at');
    if (error) throw new Error(error.message);
    // Flatten product info
    return (data || []).map((item: any) => ({
      ...item,
      product_name: item.products?.product_name,
      product_code: item.products?.product_code
    }));
  }

  async receive(inbound_id: string, lines: { item_id: string; receive_qty: number }[], user: string) {
    const { data, error } = await this.supabase.rpc('receive_inbound_items', {
      p_inbound_id: inbound_id,
      p_lines: lines,
      p_created_by: user
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async updateInbound(inbound_id: string, updates: {
    expected_date?: string;
    notes?: string;
    items?: CreateInboundItemInput[];
  }) {
    // Update order basic info
    const { error: orderError } = await this.supabase
      .from('inbound_orders')
      .update({
        expected_date: updates.expected_date,
        notes: updates.notes
      })
      .eq('inbound_id', inbound_id);
    
    if (orderError) throw new Error(orderError.message);

    // Update items if provided (only for items that haven't been received)
    if (updates.items) {
      // Delete unreceived items first
      const { error: deleteError } = await this.supabase
        .from('inbound_order_items')
        .delete()
        .eq('inbound_id', inbound_id)
        .eq('received_qty', 0);
      
      if (deleteError) throw new Error(deleteError.message);

      // Insert new items
      const itemsToInsert = updates.items.map(item => ({
        inbound_id,
        product_id: item.product_id,
        ordered_qty: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.quantity * item.unit_cost,
        notes: item.notes
      }));

      const { error: insertError } = await this.supabase
        .from('inbound_order_items')
        .insert(itemsToInsert);
      
      if (insertError) throw new Error(insertError.message);
    }

    return true;
  }

  async getOrderDetails(inbound_id: string) {
    const { data, error } = await this.supabase
      .from('inbound_orders')
      .select('*')
      .eq('inbound_id', inbound_id)
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  }
}

export const inboundService = new InboundService();
export default inboundService;
