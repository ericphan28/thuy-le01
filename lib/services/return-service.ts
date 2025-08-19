import { createClient } from '@/lib/supabase/client';

export interface CreateReturnItemInput {
  product_id: number;
  quantity: number;
  unit_cost: number;
  reason?: string;
  notes?: string;
}

export interface ReturnOrderSummary {
  return_id: string;
  return_code: string;
  supplier_id?: number;
  supplier_name?: string;
  inbound_id?: string;
  inbound_code?: string;
  return_date: string;
  reason: string;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  notes?: string;
  total_amount: number;
  total_quantity: number;
  item_count: number;
  created_by: string;
  created_at: string;
  processed_at?: string;
  processed_by?: string;
}

class ReturnService {
  private supabase = createClient();

  async createReturn(params: {
    supplier_id: number;
    reason: string;
    created_by: string;
    items: CreateReturnItemInput[];
    inbound_id?: string;
    notes?: string;
  }) {
    const { supplier_id, reason, created_by, items, inbound_id, notes } = params;
    const { data, error } = await this.supabase.rpc('create_return_order', {
      p_supplier_id: supplier_id,
      p_reason: reason,
      p_created_by: created_by,
      p_items: items.map(i => ({ 
        product_id: i.product_id, 
        quantity: i.quantity, 
        unit_cost: i.unit_cost,
        reason: i.reason,
        notes: i.notes
      })),
      p_inbound_id: inbound_id || null,
      p_notes: notes || null
    });
    if (error) throw new Error(error.message);
    return data as string; // return_id
  }

  async listReturns(limit: number = 100): Promise<ReturnOrderSummary[]> {
    const { data, error } = await this.supabase
      .from('return_orders_summary')
      .select('*')
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data as any[]) as ReturnOrderSummary[];
  }

  async getReturnItems(return_id: string) {
    const { data, error } = await this.supabase
      .from('return_order_items')
      .select(`
        *,
        products!inner(
          product_name,
          product_code
        )
      `)
      .eq('return_id', return_id)
      .order('created_at');
    if (error) throw new Error(error.message);
    // Flatten product info
    return (data || []).map((item: any) => ({
      ...item,
      product_name: item.products?.product_name,
      product_code: item.products?.product_code
    }));
  }

  async processReturn(return_id: string, processed_by: string) {
    const { data, error } = await this.supabase.rpc('process_return_order', {
      p_return_id: return_id,
      p_processed_by: processed_by
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async cancelReturn(return_id: string) {
    const { error } = await this.supabase
      .from('return_orders')
      .update({ status: 'CANCELLED' })
      .eq('return_id', return_id)
      .eq('status', 'PENDING'); // Only cancel pending returns
    
    if (error) throw new Error(error.message);
    return true;
  }

  async getReturnReasons() {
    // Common return reasons for pharmacy
    return [
      { value: 'DAMAGED', label: 'Hàng bị hỏng' },
      { value: 'EXPIRED', label: 'Hết hạn sử dụng' },
      { value: 'WRONG_ITEM', label: 'Giao sai hàng' },
      { value: 'EXCESS', label: 'Giao thừa' },
      { value: 'QUALITY_ISSUE', label: 'Vấn đề chất lượng' },
      { value: 'RECALL', label: 'Thu hồi sản phẩm' },
      { value: 'OTHER', label: 'Lý do khác' }
    ];
  }
}

export const returnService = new ReturnService();
export default returnService;
