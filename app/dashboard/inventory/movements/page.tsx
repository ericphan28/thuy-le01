'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  Plus, 
  Package, 
  TrendingUp, 
  TrendingDown, 
  Filter,
  FileText,
  Clock,
  Search,
  RefreshCw,
  Loader2,
  X,
  Download
} from 'lucide-react';
import stockMovementService, { StockMovement, CreateMovementRequest } from '@/lib/services/stock-movement-service';
import { productService } from '@/lib/services/product-service';

interface Product {
  product_id: number;
  product_name: string;
  product_code: string;
  current_stock: number;
  unit: string;
  cost_price?: number;
}

interface SupplierOption {
  supplier_id: number;
  supplier_code: string;
  supplier_name: string;
  phone?: string;
  email?: string;
}

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredMovements, setFilteredMovements] = useState<StockMovement[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state
  interface MovementForm extends CreateMovementRequest { supplier_id?: number; supplier_name?: string; }
  const [formData, setFormData] = useState<MovementForm>({
    product_id: 0,
    movement_type: 'IN',
    quantity: 0,
    unit_cost: undefined,
    reference_code: '',
    reason: '',
    notes: '',
    reference_type: 'MANUAL'
  });

  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    movementType: 'all',
    dateRange: 'all',
  productId: 'all',
  supplierId: 'all'
  });

  const [stats, setStats] = useState({
    totalMovements: 0,
    totalIn: 0,
    totalOut: 0,
    recentMovements: 0
  });

  const [showMockDataWarning, setShowMockDataWarning] = useState(false);

  // Load data
  const loadMovements = useCallback(async () => {
    try {
      setLoading(true);
      const [movementsResponse, statsData] = await Promise.all([
        stockMovementService.getMovements({ limit: 100 }),
        stockMovementService.getMovementStats()
      ]);

      // Extract data array from response
      let movementsData = movementsResponse.data || [];
      setMovements(movementsData);

      // Nếu đã có supplier_id nhưng thiếu supplier_name (do view cũ chưa cập nhật) thì cố gắng bổ sung
      const needSupplierLookup = movementsData.filter(m => (m as any).supplier_id && !(m as any).supplier_name);
      if (needSupplierLookup.length > 0) {
        const uniqueIds = Array.from(new Set(needSupplierLookup.map(m => (m as any).supplier_id))).slice(0,50);
        if (uniqueIds.length > 0) {
          try {
            const supabase = createClient();
            const { data: supData } = await supabase
              .from('suppliers')
              .select('supplier_id,supplier_name')
              .in('supplier_id', uniqueIds as any);
            if (supData && supData.length) {
              const map = new Map(supData.map(s => [s.supplier_id, s.supplier_name]));
              movementsData = movementsData.map(m => {
                if ((m as any).supplier_id && !(m as any).supplier_name) {
                  return { ...m, supplier_name: map.get((m as any).supplier_id) };
                }
                return m;
              });
              setMovements(movementsData);
            }
          } catch (e) {
            console.warn('Không thể bổ sung supplier_name động', e);
          }
        }
      }
      
      setStats({
        totalMovements: statsData.totalMovements,
        totalIn: statsData.totalIn,
        totalOut: statsData.totalOut,
        recentMovements: statsData.recentMovements
      });
      
      // Check if we're getting mock data
      if (movementsResponse.error || (movementsData.length > 0 && movementsData[0].product_name?.includes('Sample'))) {
        setShowMockDataWarning(true);
      }
    } catch (error) {
      console.error('Error loading movements:', error);
      toast.error("Không thể tải danh sách xuất nhập kho");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async (search?: string) => {
    try {
      const productsResponse = await productService.getProducts({ limit: 50, search });
      const transformedProducts = productsResponse.products
        .filter((p: any) => p.is_active)
        .map((p: any) => ({
          product_id: p.product_id,
          product_name: p.product_name,
          product_code: p.product_code,
          current_stock: p.current_stock,
          unit: p.unit || 'cái',
          cost_price: p.cost_price
        }));
      setProducts(transformedProducts);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error("Không thể tải danh sách sản phẩm");
    }
  }, []);

  // Load suppliers when needed
  const loadSuppliers = useCallback(async (search?: string) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('suppliers')
        .select('supplier_id,supplier_code,supplier_name,phone,email')
        .ilike('supplier_name', search ? `%${search}%` : '%')
        .order('supplier_name', { ascending: true })
        .limit(100);
      if (error) {
        console.error('Error loading suppliers:', error);
        return;
      }
      setSuppliers((data as any) || []);
    } catch (e) {
      console.error('Unexpected error loading suppliers', e);
    }
  }, []);

  // Filter movements
  const applyFilters = useCallback(() => {
    let filtered = movements;

    // Search filter
    if (filters.search) {
      filtered = filtered.filter(movement => 
        movement.product_name?.toLowerCase().includes(filters.search.toLowerCase()) ||
        movement.product_code?.toLowerCase().includes(filters.search.toLowerCase()) ||
        movement.reason?.toLowerCase().includes(filters.search.toLowerCase()) ||
        movement.reference_code?.toLowerCase().includes(filters.search.toLowerCase()) ||
        movement.created_by?.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    // Movement type filter
    if (filters.movementType !== 'all') {
      filtered = filtered.filter(movement => movement.movement_type === filters.movementType);
    }

    // Product filter
    if (filters.productId !== 'all') {
      filtered = filtered.filter(movement => movement.product_id === parseInt(filters.productId));
    }

    // Supplier filter
    if (filters.supplierId !== 'all') {
      filtered = filtered.filter(movement => (movement as any).supplier_id === parseInt(filters.supplierId));
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (filters.dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0);
      }

      filtered = filtered.filter(movement => 
        new Date(movement.created_at) >= startDate
      );
    }

    setFilteredMovements(filtered);
  }, [movements, filters]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;

    // Additional validation
    if (formData.product_id === 0) {
      toast.error('Vui lòng chọn sản phẩm');
      return;
    }
    if (formData.quantity <= 0) {
      toast.error('Số lượng phải lớn hơn 0');
      return;
    }
    if (!formData.reason.trim()) {
      toast.error('Vui lòng nhập lý do');
      return;
    }

    try {
      setCreating(true);

  const { supplier_id, supplier_name, ...rest } = formData as any;
  const result = await stockMovementService.createMovement({ ...rest, supplier_id });

      if (result.error) {
        toast.error(`Lỗi: ${result.error}`);
        return;
      }

      toast.success("Tạo phiếu xuất nhập kho thành công");

      // Reset form and reload data
      setFormData({
        product_id: 0,
        movement_type: 'IN',
        quantity: 0,
        unit_cost: undefined,
        reference_code: '',
        reason: '',
        notes: '',
        reference_type: 'MANUAL'
      });
      setIsDialogOpen(false);
      await loadMovements(); // Ensure data reloads
    } catch (error: any) {
      console.error('Error creating movement:', error);
      toast.error(`Không thể tạo phiếu: ${error?.message || 'Lỗi không xác định'}`);
    } finally {
      setCreating(false);
    }
  };

  // Initialize data
  useEffect(() => {
    loadMovements();
    loadProducts();
  // Load suppliers early so tooltip & filter có dữ liệu ngay cả khi chưa mở modal
  loadSuppliers();
  }, [loadMovements, loadProducts, loadSuppliers]);

  // Lazy load suppliers when dialog opens & type is IN
  useEffect(() => {
    if (isDialogOpen && formData.movement_type === 'IN' && suppliers.length === 0) {
      loadSuppliers();
    }
  }, [isDialogOpen, formData.movement_type, suppliers.length, loadSuppliers]);

  // Apply filters when movements or filters change
  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('vi-VN');
  };

  // Xuất CSV bao gồm supplier_name
  const exportCSV = () => {
    const rows = [
      ['movement_id','product_code','product_name','movement_type','quantity','old_stock','new_stock','unit_cost','total_cost','reference_type','reference_code','reason','created_by','created_at','supplier_id','supplier_name'],
      ...filteredMovements.map(m => [
        m.movement_id,
        m.product_code || '',
        m.product_name || '',
        m.movement_type,
        m.quantity,
        m.old_stock,
        m.new_stock,
        m.unit_cost ?? '',
        m.total_cost ?? '',
        m.reference_type || '',
        m.reference_code || '',
        (m.reason || '').replace(/\n/g,' '),
        m.created_by,
        m.created_at,
        (m as any).supplier_id || '',
        (m as any).supplier_name || ''
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `stock_movements_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Xuất Nhập Kho</h1>
          <p className="text-muted-foreground">Quản lý phiếu xuất nhập kho và theo dõi biến động tồn kho</p>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" onClick={loadMovements} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Tạo phiếu mới
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Tạo Phiếu Xuất/Nhập Kho</DialogTitle>
                <DialogDescription>
                  Tạo phiếu xuất hoặc nhập kho cho sản phẩm
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="product">Sản phẩm</Label>
                    <SearchableCombobox
                      items={products}
                      value={products.find(p => p.product_id === formData.product_id)}
                      onValueChange={(product) => setFormData(prev => ({ ...prev, product_id: product ? product.product_id : 0 }))}
                      getItemId={(product) => product.product_id.toString()}
                      getItemLabel={(product) => `${product.product_name} (${product.product_code}) - Tồn: ${product.current_stock} ${product.unit}`}
                      onSearch={(query) => loadProducts(query)}
                      placeholder="Tìm sản phẩm..."
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="type">Loại phiếu</Label>
                    <Select
                      value={formData.movement_type}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, movement_type: value as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IN">Nhập kho</SelectItem>
                        <SelectItem value="OUT">Xuất kho</SelectItem>
                        <SelectItem value="ADJUST">Điều chỉnh</SelectItem>
                        <SelectItem value="TRANSFER">Chuyển kho</SelectItem>
                        <SelectItem value="LOSS">Mất hàng</SelectItem>
                        <SelectItem value="FOUND">Tìm thấy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formData.movement_type === 'IN' && (
                  <div className="relative">
                    <Label>Nhà cung cấp (tùy chọn)</Label>
          <Input
                      placeholder="Tìm NCC theo tên hoặc mã..."
                      value={formData.supplier_id ? formData.supplier_name : supplierSearch}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, supplier_id: undefined, supplier_name: undefined }));
                        setSupplierSearch(e.target.value);
            loadSuppliers(e.target.value);
                      }}
                      onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 150)}
                    />
                    {showSupplierDropdown && (
                      <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow">
                        <div className="p-1 text-xs text-muted-foreground sticky top-0 bg-popover/90 backdrop-blur">{suppliers.length} NCC</div>
                        {suppliers
                          .filter(s => {
                            if (!supplierSearch) return true;
                            const term = supplierSearch.toLowerCase();
                            return s.supplier_name.toLowerCase().includes(term) || s.supplier_code.toLowerCase().includes(term);
                          })
                          .slice(0,100)
                          .map(s => (
                            <button
                              type="button"
                              key={s.supplier_id}
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  supplier_id: s.supplier_id,
                                  supplier_name: s.supplier_name,
                                  reason: prev.reason || `Nhập hàng từ ${s.supplier_name}`
                                }));
                                setSupplierSearch('');
                                setShowSupplierDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${formData.supplier_id === s.supplier_id ? 'bg-accent/60' : ''}`}
                            >
                              <div className="font-medium flex items-center gap-2">
                                <span>{s.supplier_name}</span>
                                <span className="text-xs text-muted-foreground">#{s.supplier_code}</span>
                              </div>
                              <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                                {s.phone && <span>{s.phone}</span>}
                                {s.email && <span>{s.email}</span>}
                              </div>
                            </button>
                          ))}
                        {suppliers.length === 0 && (
                          <div className="p-3 text-sm text-muted-foreground">Không có NCC</div>
                        )}
                        <div className="border-t bg-background/90 backdrop-blur p-2 text-xs">
                          <a href="/dashboard/suppliers" className="text-primary hover:underline">+ Tạo nhà cung cấp mới</a>
                        </div>
                      </div>
                    )}
                    {formData.supplier_id && (
                      <div className="text-xs text-muted-foreground mt-1">Đã chọn: {formData.supplier_name}</div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="quantity">Số lượng</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.quantity || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="unitCost">Đơn giá (tùy chọn)</Label>
                    <Input
                      id="unitCost"
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.unit_cost || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, unit_cost: parseFloat(e.target.value) || undefined }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="referenceCode">Mã chứng từ (tùy chọn)</Label>
                  <Input
                    id="referenceCode"
                    value={formData.reference_code || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, reference_code: e.target.value }))}
                    placeholder="PO001, HD001, ..."
                  />
                </div>

                <div>
                  <Label htmlFor="reason">Lý do</Label>
                  <Input
                    id="reason"
                    value={formData.reason}
                    onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder={formData.movement_type === 'IN' ? 'Nhập hàng từ nhà cung cấp...' : 'Bán hàng, kiểm kê...'}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Ghi chú (tùy chọn)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Ghi chú thêm về phiếu xuất/nhập..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Hủy
                  </Button>
                  <Button type="submit" disabled={creating || formData.product_id === 0 || !formData.reason || formData.quantity <= 0}>
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                           <p className="text-muted-foreground text-sm">Nhật ký toàn bộ movement: dùng để audit, lọc theo NCC / sản phẩm, xuất báo cáo.</p>
                      </>
                    ) : (
                      'Tạo phiếu'
                    )}
                  </Button>
                </div>
                           <Button asChild variant="secondary">
                             <a href="/dashboard/inventory/inbound">+ Nhập hàng</a>
                           </Button>
                           <Button asChild variant="secondary">
                             <a href="/dashboard/inventory/stock">Tồn chi tiết</a>
                           </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Mock Data Warning */}
      {showMockDataWarning && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center mt-0.5">
                <span className="text-yellow-600 text-xs">⚠</span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-yellow-800">
                  Đang sử dụng dữ liệu mẫu
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    Bảng <code className="bg-yellow-100 px-1 rounded">stock_movements</code> chưa được tạo. 
                    Hãy chạy SQL migration để có dữ liệu thực:
                  </p>
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Mở Supabase Dashboard → SQL Editor</li>
                    <li>Copy và chạy file <code className="bg-yellow-100 px-1 rounded">sql/simple_stock_movements.sql</code></li>
                    <li>Reload trang này</li>
                  </ol>
                </div>
                <div className="mt-3">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowMockDataWarning(false)}
                    className="text-yellow-700 border-yellow-300 hover:bg-yellow-100"
                  >
                    Đã hiểu, ẩn thông báo
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng phiếu</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMovements}</div>
            <p className="text-xs text-muted-foreground">Tất cả phiếu xuất nhập</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng nhập</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.totalIn}</div>
            <p className="text-xs text-muted-foreground">Số lượng nhập kho</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng xuất</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.totalOut}</div>
            <p className="text-xs text-muted-foreground">Số lượng xuất kho</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hôm nay</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentMovements}</div>
            <p className="text-xs text-muted-foreground">Phiếu tạo hôm nay</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Bộ lọc
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Tìm kiếm</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm sản phẩm, lý do, mã chứng từ..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-9 pr-8"
                />
                {filters.search && (
                  <button type="button" onClick={() => setFilters(p => ({ ...p, search: '' }))} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="relative">
              <Label>Loại phiếu</Label>
              <Select
                value={filters.movementType}
                onValueChange={(value) => setFilters(prev => ({ ...prev, movementType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="IN">Nhập kho</SelectItem>
                  <SelectItem value="OUT">Xuất kho</SelectItem>
                  <SelectItem value="ADJUST">Điều chỉnh</SelectItem>
                  <SelectItem value="TRANSFER">Chuyển kho</SelectItem>
                  <SelectItem value="LOSS">Mất hàng</SelectItem>
                  <SelectItem value="FOUND">Tìm thấy</SelectItem>
                </SelectContent>
              </Select>
              {filters.movementType !== 'all' && (
                <button type="button" onClick={() => setFilters(p => ({ ...p, movementType: 'all' }))} className="absolute right-2 top-8 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="relative">
              <Label>Thời gian</Label>
              <Select
                value={filters.dateRange}
                onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="today">Hôm nay</SelectItem>
                  <SelectItem value="week">Tuần này</SelectItem>
                  <SelectItem value="month">Tháng này</SelectItem>
                </SelectContent>
              </Select>
              {filters.dateRange !== 'all' && (
                <button type="button" onClick={() => setFilters(p => ({ ...p, dateRange: 'all' }))} className="absolute right-2 top-8 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="relative">
              <Label>Sản phẩm</Label>
              <SearchableCombobox
                items={[{ product_id: 0, product_name: 'Tất cả sản phẩm', product_code: '', current_stock: 0, unit: '' }, ...products]}
                value={filters.productId === 'all' ? { product_id: 0, product_name: 'Tất cả sản phẩm', product_code: '', current_stock: 0, unit: '' } : products.find(p => p.product_id.toString() === filters.productId)}
                onValueChange={(item) => setFilters(prev => ({ ...prev, productId: item && item.product_id === 0 ? 'all' : item ? item.product_id.toString() : 'all' }))}
                getItemId={(item) => item.product_id === 0 ? 'all' : item.product_id.toString()}
                getItemLabel={(item) => item.product_id === 0 ? item.product_name : `${item.product_name} (${item.product_code}) - Tồn: ${item.current_stock} ${item.unit}`}
                placeholder="Lọc theo sản phẩm..."
              />
              {filters.productId !== 'all' && (
                <button type="button" onClick={() => setFilters(p => ({ ...p, productId: 'all' }))} className="absolute right-2 top-8 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="relative">
              <Label>Nhà cung cấp</Label>
              <SearchableCombobox
                items={[{ supplier_id: 0, supplier_name: 'Tất cả NCC', supplier_code: '', phone: '', email: '' }, ...suppliers]}
                value={filters.supplierId === 'all' ? { supplier_id: 0, supplier_name: 'Tất cả NCC', supplier_code: '', phone: '', email: '' } : suppliers.find(s => s.supplier_id.toString() === filters.supplierId)}
                onValueChange={(supplier) => setFilters(prev => ({ ...prev, supplierId: supplier && supplier.supplier_id === 0 ? 'all' : supplier ? supplier.supplier_id.toString() : 'all' }))}
                getItemId={(supplier) => supplier.supplier_id === 0 ? 'all' : supplier.supplier_id.toString()}
                getItemLabel={(supplier) => supplier.supplier_id === 0 ? supplier.supplier_name : `${supplier.supplier_name} (${supplier.supplier_code})`}
                placeholder="Lọc theo NCC..."
              />
              {filters.supplierId !== 'all' && (
                <button type="button" onClick={() => setFilters(p => ({ ...p, supplierId: 'all' }))} className="absolute right-2 top-8 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={exportCSV} className="flex items-center gap-2">
              <Download className="h-4 w-4" /> Xuất CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Movements Table */}
      <Card>
        <CardHeader>
          <CardTitle>Danh Sách Phiếu Xuất Nhập Kho</CardTitle>
          <CardDescription>
            Hiển thị {filteredMovements.length} phiếu {movements.length > filteredMovements.length && `trong tổng số ${movements.length} phiếu`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Không có phiếu xuất nhập kho</h3>
              <p className="text-muted-foreground mb-4">Chưa có phiếu nào được tạo hoặc không có phiếu phù hợp với bộ lọc</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Tạo phiếu đầu tiên
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã phiếu</TableHead>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Nhà cung cấp</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                    <TableHead className="text-right">Tồn kho</TableHead>
                    <TableHead className="text-right">Giá trị</TableHead>
                    <TableHead>Lý do</TableHead>
                    <TableHead>Người tạo</TableHead>
                    <TableHead>Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map((movement) => (
                    <TableRow key={movement.movement_id}>
                      <TableCell>
                        <div>
                          <div className="font-mono text-sm">#{movement.movement_id}</div>
                          {movement.reference_code && (
                            <div className="text-xs text-muted-foreground">
                              {stockMovementService.formatReferenceType(movement.reference_type)}: {movement.reference_code}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{movement.product_name}</div>
                          <div className="text-sm text-muted-foreground">{movement.product_code}</div>
                          {movement.category_name && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {movement.category_name}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(movement as any).supplier_name ? (
                          <div className="text-sm" title={(() => {
                            const sup = suppliers.find(s => s.supplier_id === (movement as any).supplier_id);
                            if (!sup) return (movement as any).supplier_name;
                            const parts = [sup.supplier_name];
                            if (sup.phone) parts.push('ĐT: ' + sup.phone);
                            if (sup.email) parts.push('Email: ' + sup.email);
                            return parts.join('\n');
                          })()}>
                            {(movement as any).supplier_name}
                            <div className="text-xs text-muted-foreground">ID: {(movement as any).supplier_id}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic">-</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={stockMovementService.getMovementTypeBadgeColor(movement.movement_type)}
                        >
                          {stockMovementService.formatMovementType(movement.movement_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono ${stockMovementService.getMovementTypeColor(movement.movement_type)}`}>
                        {movement.movement_type === 'OUT' || movement.movement_type === 'LOSS' ? '-' : '+'}
                        {movement.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm">
                          {movement.old_stock} → {movement.new_stock}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {movement.total_cost ? formatCurrency(movement.total_cost) : '-'}
                        {movement.unit_cost && (
                          <div className="text-xs text-muted-foreground">
                            @{formatCurrency(movement.unit_cost)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs">
                          <div className="text-sm">{movement.reason}</div>
                          {movement.notes && (
                            <div className="text-xs text-muted-foreground mt-1 truncate">
                              {movement.notes}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{movement.created_by}</div>
                        {movement.branch_name && (
                          <div className="text-xs text-muted-foreground">{movement.branch_name}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDateTime(movement.created_at)}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
