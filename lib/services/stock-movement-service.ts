import { createClient } from '@/lib/supabase/client';

export interface StockMovement {
  movement_id: number;
  product_id: number;
  product_name?: string;
  product_code?: string;
  category_name?: string;
  supplier_id?: number;
  supplier_name?: string;
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
  reason: string;
  notes?: string;
  reference_type?: string;
  reference_code?: string;
  supplier_id?: number; // newly added for inbound linkage
}

export interface MovementStats {
  totalIn: number;
  totalOut: number;
  totalAdjustments: number;
  totalMovements: number;
  recentMovements: number;
}

class StockMovementService {
  private supabase = createClient();

  // Get all movements with filtering
  async getMovements(filters?: {
    product_id?: number;
    movement_type?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }): Promise<{ data: StockMovement[]; error?: string }> {
    try {
      let query = this.supabase
        .from('stock_movements_detailed')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.product_id) {
        query = query.eq('product_id', filters.product_id);
      }
      if (filters?.movement_type && filters.movement_type !== 'all') {
        query = query.eq('movement_type', filters.movement_type);
      }
      if (filters?.date_from) {
        query = query.gte('created_at', filters.date_from);
      }
      if (filters?.date_to) {
        query = query.lte('created_at', filters.date_to);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(100); // Default limit
      }

      const { data, error } = await query;

      if (error) {
        console.warn('Supabase query failed, using mock data:', error);
        return { data: this.getMockMovements(), error: 'Using mock data' };
      }

      return { data: data || [] };
    } catch (error) {
      console.warn('Service error, using mock data:', error);
      return { data: this.getMockMovements(), error: 'Using mock data' };
    }
  }

  // Create new movement using stored function
  async createMovement(request: CreateMovementRequest): Promise<{ success: boolean; error?: string; movement_id?: number }> {
    try {
      console.log('Creating movement with request:', request);
      
    const { data, error } = await this.supabase
  .rpc('record_stock_movement', {
          p_product_id: request.product_id,
          p_movement_type: request.movement_type,
          p_quantity: request.quantity,
          p_unit_cost: request.unit_cost,
          p_reference_type: request.reference_type || 'MANUAL',
          p_reference_code: request.reference_code,
          p_reason: request.reason,
          p_notes: request.notes,
      p_created_by: 'User',
      p_supplier_id: request.supplier_id || null
        });

      console.log('Supabase response:', { data, error });

      if (error) {
        console.error('Failed to create movement:', error);
        return { success: false, error: `Database error: ${error.message}` };
      }

      return { success: true, movement_id: data };
    } catch (error: any) {
      console.error('Service error:', error);
      return { success: false, error: `Lỗi dịch vụ: ${error?.message || 'Lỗi không xác định'}` };
    }
  }

  // Get movement statistics
  async getMovementStats(): Promise<MovementStats> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await this.supabase
        .from('stock_movements')
        .select('movement_type, quantity, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (error || !data) {
        console.warn('Failed to load stats, using mock data');
        return this.getMockStats();
      }

      const stats: MovementStats = {
        totalIn: 0,
        totalOut: 0,
        totalAdjustments: 0,
        totalMovements: data.length,
        recentMovements: 0
      };

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      data.forEach((movement: any) => {
        const quantity = Math.abs(parseFloat(movement.quantity.toString()));
        
        switch (movement.movement_type) {
          case 'IN':
          case 'FOUND':
            stats.totalIn += quantity;
            break;
          case 'OUT':
          case 'LOSS':
            stats.totalOut += quantity;
            break;
          case 'ADJUST':
            stats.totalAdjustments += quantity;
            break;
        }

        if (new Date(movement.created_at) >= sevenDaysAgo) {
          stats.recentMovements++;
        }
      });

      return stats;
    } catch (error) {
      console.warn('Service error, using mock stats:', error);
      return this.getMockStats();
    }
  }

  // Get products for selection
  async getProducts(): Promise<{ data: any[]; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('product_id, product_name, product_code, current_stock, unit, cost_price')
        .eq('is_active', true)
        .order('product_name');

      if (error) {
        console.warn('Failed to load products');
        return { data: [], error: 'Failed to load products' };
      }

      return { data: data || [] };
    } catch (error) {
      console.warn('Service error loading products');
      return { data: [], error: 'Service error' };
    }
  }

  // Mock data methods for fallback
  private getMockMovements(): StockMovement[] {
    return [
      {
        movement_id: 1,
        product_id: 1,
        product_name: 'Sample Product 1',
        product_code: 'SP001',
        category_name: 'Category 1',
        movement_type: 'IN',
        quantity: 100,
        old_stock: 50,
        new_stock: 150,
        unit_cost: 10000,
        total_cost: 1000000,
        reason: 'Initial stock',
        created_by: 'System',
        created_at: new Date().toISOString(),
        reference_type: 'MANUAL',
        branch_name: 'Chi nhánh chính'
      },
      {
        movement_id: 2,
        product_id: 1,
        product_name: 'Sample Product 1',
        product_code: 'SP001',
        category_name: 'Category 1',
        movement_type: 'OUT',
        quantity: -20,
        old_stock: 150,
        new_stock: 130,
        reason: 'Sale',
        created_by: 'System',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        reference_type: 'INVOICE',
        reference_code: 'INV-001',
        branch_name: 'Chi nhánh chính'
      }
    ];
  }

  private getMockStats(): MovementStats {
    return {
      totalIn: 1200,
      totalOut: 800,
      totalAdjustments: 50,
      totalMovements: 156,
      recentMovements: 23
    };
  }

  // Helper methods for UI
  getMovementTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'IN': 'Nhập kho',
      'OUT': 'Xuất kho', 
      'ADJUST': 'Điều chỉnh',
      'TRANSFER': 'Chuyển kho',
      'LOSS': 'Hao hụt',
      'FOUND': 'Thừa'
    };
    return labels[type] || type;
  }

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

  formatMovementType(type: string): string {
    return this.getMovementTypeLabel(type);
  }

  formatReferenceType(type?: string): string {
    const labels: { [key: string]: string } = {
      'INVOICE': 'Hóa đơn',
      'PURCHASE_ORDER': 'Đơn hàng',
      'MANUAL': 'Thủ công',
      'SYSTEM': 'Hệ thống'
    };
    return labels[type || 'MANUAL'] || 'Khác';
  }
}

// Create and export singleton instance
const stockMovementService = new StockMovementService();
export { stockMovementService };
export default stockMovementService;
