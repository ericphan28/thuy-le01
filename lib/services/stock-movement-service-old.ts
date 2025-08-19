import { createClient } from '@/lib/supabase/client';

export interface StockMovement {
  movement_id: number;
  product_id: number;
  product_name?: string;
  product_code?: string;
  category_name?: string;
  movement_type: 'IN' | 'OUT' | 'ADJUST' | 'TRANSFER' | 'LOSS' | 'FOUND';
  quantity: number;
  old_stock: number;
  new_stock: number;
  unit_cost?: number;
  total_cost?: number;
  reason: string;
  notes?: string;
  created_by: string;
  created_at: string;
  reference_type?: 'INVOICE' | 'PURCHASE_ORDER' | 'MANUAL' | 'SYSTEM';
  reference_id?: number;
  reference_code?: string;
  batch_id?: string;
  branch_name?: string;
}

export interface CreateMovementRequest {
  product_id: number;
  movement_type: 'IN' | 'OUT' | 'ADJUST' | 'TRANSFER' | 'LOSS' | 'FOUND';
  quantity: number;
  unit_cost?: number;
  reference_type?: 'MANUAL' | 'SYSTEM';
  reference_code?: string;
  reason: string;
  notes?: string;
  created_by: string;
}

export interface StockMovementFilters {
  product_id?: number;
  movement_type?: StockMovement['movement_type'];
  from_date?: string;
  to_date?: string;
  reference_code?: string;
  created_by?: string;
  limit?: number;
  offset?: number;
}

export interface StockMovementStats {
  total_movements: number;
  total_in: number;
  total_out: number;
  today_movements: number;
  total_value_in: number;
  total_value_out: number;
}

class StockMovementService {
  private supabase = createClient();

  async getMovements(filters?: StockMovementFilters): Promise<StockMovement[]> {
    try {
      let query = this.supabase
        .from('stock_movements_detailed')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.product_id) {
        query = query.eq('product_id', filters.product_id);
      }
      if (filters?.movement_type) {
        query = query.eq('movement_type', filters.movement_type);
      }
      if (filters?.from_date) {
        query = query.gte('created_at', filters.from_date);
      }
      if (filters?.to_date) {
        query = query.lte('created_at', filters.to_date);
      }
      if (filters?.reference_code) {
        query = query.ilike('reference_code', `%${filters.reference_code}%`);
      }
      if (filters?.created_by) {
        query = query.ilike('created_by', `%${filters.created_by}%`);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      if (filters?.offset) {
        query = query.range(filters.offset, (filters.offset + (filters.limit || 50)) - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching stock movements:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getMovements:', error);
      throw error;
    }
  }

  async createMovement(request: CreateMovementRequest): Promise<{ movement_id: number | null; error: string | null }> {
    try {
      console.log('🏭 StockMovementService.createMovement called with:', request);

      // Validate input
      if (!request.product_id || !request.movement_type || !request.quantity || request.quantity === 0) {
        return { movement_id: null, error: 'Dữ liệu không hợp lệ' };
      }

      // Call stored function để tạo movement và update stock atomically
      const { data, error } = await this.supabase
        .rpc('record_stock_movement', {
          p_product_id: request.product_id,
          p_movement_type: request.movement_type,
          p_quantity: request.quantity,
          p_unit_cost: request.unit_cost || null,
          p_reference_type: request.reference_type || 'MANUAL',
          p_reference_id: null,
          p_reference_code: request.reference_code || null,
          p_reason: request.reason,
          p_notes: request.notes || null,
          p_created_by: request.created_by
        });

      if (error) {
        console.error('Error creating stock movement:', error);
        return { movement_id: null, error: error.message };
      }

      console.log('✅ Stock movement created with ID:', data);
      return { movement_id: data, error: null };
    } catch (error) {
      console.error('Error in createMovement:', error);
      return { movement_id: null, error: 'Lỗi tạo phiếu nhập/xuất kho' };
    }
  }

  async getMovementsByProduct(productId: number, limit: number = 20): Promise<StockMovement[]> {
    try {
      const { data, error } = await this.supabase
        .from('stock_movements_detailed')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching movements by product:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getMovementsByProduct:', error);
      throw error;
    }
  }

  async getMovementsByDateRange(startDate: string, endDate: string): Promise<StockMovement[]> {
    try {
      const { data, error } = await this.supabase
        .from('stock_movements_detailed')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching movements by date range:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getMovementsByDateRange:', error);
      throw error;
    }
  }

  async getBatchMovements(batchId: string): Promise<StockMovement[]> {
    try {
      const { data, error } = await this.supabase
        .from('stock_movements_detailed')
        .select('*')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching batch movements:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getBatchMovements:', error);
      throw error;
    }
  }

  async getMovementStats(): Promise<StockMovementStats> {
    try {
      const { data, error } = await this.supabase
        .from('stock_movements')
        .select(`
          movement_type,
          quantity,
          total_cost,
          created_at
        `);

      if (error) {
        console.error('Error fetching movement stats:', error);
        throw error;
      }

      const movements = data || [];
      const today = new Date().toDateString();

      const stats: StockMovementStats = {
        total_movements: movements.length,
        total_in: movements
          .filter(m => ['IN', 'FOUND'].includes(m.movement_type))
          .reduce((sum, m) => sum + m.quantity, 0),
        total_out: movements
          .filter(m => ['OUT', 'LOSS'].includes(m.movement_type))
          .reduce((sum, m) => sum + m.quantity, 0),
        today_movements: movements
          .filter(m => new Date(m.created_at).toDateString() === today)
          .length,
        total_value_in: movements
          .filter(m => ['IN', 'FOUND'].includes(m.movement_type))
          .reduce((sum, m) => sum + (m.total_cost || 0), 0),
        total_value_out: movements
          .filter(m => ['OUT', 'LOSS'].includes(m.movement_type))
          .reduce((sum, m) => sum + (m.total_cost || 0), 0)
      };

      return stats;
    } catch (error) {
      console.error('Error in getMovementStats:', error);
      return {
        total_movements: 0,
        total_in: 0,
        total_out: 0,
        today_movements: 0,
        total_value_in: 0,
        total_value_out: 0
      };
    }
  }

  async getInventorySummary(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('inventory_summary')
        .select('*')
        .order('product_name');

      if (error) {
        console.error('Error fetching inventory summary:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getInventorySummary:', error);
      throw error;
    }
  }

  // Helper method để create movements cho invoices
  async recordSaleMovements(invoiceId: number, invoiceCode: string, createdBy: string = 'System'): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .rpc('record_sale_movements', {
          p_invoice_id: invoiceId,
          p_invoice_code: invoiceCode,
          p_created_by: createdBy
        });

      if (error) {
        console.error('Error recording sale movements:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error in recordSaleMovements:', error);
      throw error;
    }
  }

  // Helper method để format movement type cho display
  formatMovementType(type: string): string {
    const typeMap: { [key: string]: string } = {
      'IN': 'Nhập kho',
      'OUT': 'Xuất kho',
      'ADJUST': 'Điều chỉnh',
      'TRANSFER': 'Chuyển kho',
      'LOSS': 'Mất hàng',
      'FOUND': 'Tìm thấy'
    };
    return typeMap[type] || type;
  }

  // Helper method để format reference type
  formatReferenceType(type?: string): string {
    if (!type) return '';
    
    const refMap: { [key: string]: string } = {
      'INVOICE': 'Hóa đơn',
      'PURCHASE_ORDER': 'Đơn nhập',
      'MANUAL': 'Thủ công',
      'SYSTEM': 'Hệ thống'
    };
    return refMap[type] || type;
  }

  // Helper method để get movement type color
  getMovementTypeColor(type: string): string {
    const colorMap: { [key: string]: string } = {
      'IN': 'text-green-600',
      'OUT': 'text-red-600',
      'ADJUST': 'text-blue-600',
      'TRANSFER': 'text-purple-600',
      'LOSS': 'text-orange-600',
      'FOUND': 'text-teal-600'
    };
    return colorMap[type] || 'text-gray-600';
  }

  // Helper method để get movement type badge color
  getMovementTypeBadgeColor(type: string): string {
    const colorMap: { [key: string]: string } = {
      'IN': 'bg-green-100 text-green-800',
      'OUT': 'bg-red-100 text-red-800',
      'ADJUST': 'bg-blue-100 text-blue-800',
      'TRANSFER': 'bg-purple-100 text-purple-800',
      'LOSS': 'bg-orange-100 text-orange-800',
      'FOUND': 'bg-teal-100 text-teal-800'
    };
    return colorMap[type] || 'bg-gray-100 text-gray-800';
  }
}

export const stockMovementService = new StockMovementService();
export default stockMovementService;
