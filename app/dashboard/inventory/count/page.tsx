'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  Search, 
  Plus,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  Upload,
  Calculator
} from 'lucide-react';
import { productService } from '@/lib/services/product-service';
import stockMovementService from '@/lib/services/stock-movement-service';

interface InventoryCount {
  count_id: string;
  count_name: string;
  count_date: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  created_by: string;
  total_items: number;
  counted_items: number;
  variance_items: number;
  total_variance_value: number;
  notes?: string;
}

interface CountItem {
  item_id: string;
  count_id: string;
  product_id: number;
  product_name: string;
  product_code: string;
  category_name?: string;
  system_stock: number;
  counted_stock?: number;
  variance: number;
  variance_value: number;
  unit: string;
  cost_price: number;
  status: 'PENDING' | 'COUNTED' | 'VARIANCE';
  notes?: string;
  counted_by?: string;
  counted_at?: string;
}

interface NewCountForm {
  count_name: string;
  count_date: string;
  notes: string;
  include_categories: string[];
  include_zero_stock: boolean;
}

export default function InventoryCountPage() {
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [countItems, setCountItems] = useState<CountItem[]>([]);
  const [selectedCount, setSelectedCount] = useState<InventoryCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [newCountDialog, setNewCountDialog] = useState(false);
  const [countItemDialog, setCountItemDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CountItem | null>(null);
  
  const [newCountForm, setNewCountForm] = useState<NewCountForm>({
    count_name: '',
    count_date: new Date().toISOString().split('T')[0],
    notes: '',
    include_categories: [],
    include_zero_stock: false
  });

  const [countInput, setCountInput] = useState({
    counted_stock: 0,
    notes: ''
  });

  const [filters, setFilters] = useState({
    search: '',
    status: 'all'
  });

  // Load inventory counts (mock data for demo)
  const loadCounts = useCallback(async () => {
    try {
      setLoading(true);
      
      // Mock data - in real app this would come from database
      const mockCounts: InventoryCount[] = [
        {
          count_id: 'COUNT-001',
          count_name: 'Kiểm kho tháng 8/2025',
          count_date: '2025-08-15',
          status: 'IN_PROGRESS',
          created_by: 'Admin',
          total_items: 150,
          counted_items: 95,
          variance_items: 12,
          total_variance_value: -2500000,
          notes: 'Kiểm kho định kỳ hàng tháng'
        },
        {
          count_id: 'COUNT-002',
          count_name: 'Kiểm kho đột xuất - Danh mục Y tế',
          count_date: '2025-08-10',
          status: 'COMPLETED',
          created_by: 'User1',
          total_items: 50,
          counted_items: 50,
          variance_items: 3,
          total_variance_value: -150000,
          notes: 'Kiểm tra sau báo cáo thiếu hụt'
        }
      ];
      
      setCounts(mockCounts);
    } catch (error) {
      console.error('Error loading counts:', error);
      toast.error('Không thể tải dữ liệu kiểm kho');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load count items for selected count
  const loadCountItems = useCallback(async (countId: string) => {
    try {
      setItemsLoading(true);
      
      // Get products for the count
      const result = await productService.getProducts({ limit: 50 });
      const products = result.products;
      
      // Create mock count items
      const items: CountItem[] = products.map((product, index) => {
        const systemStock = product.current_stock;
        const hasVariance = Math.random() > 0.8; // 20% chance of variance
        const countedStock = hasVariance 
          ? systemStock + Math.floor(Math.random() * 10) - 5 // +/- 5 random variance
          : systemStock;
        const variance = countedStock - systemStock;
        
        return {
          item_id: `${countId}_${product.product_id}`,
          count_id: countId,
          product_id: product.product_id,
          product_name: product.product_name,
          product_code: product.product_code,
          category_name: product.category?.category_name,
          system_stock: systemStock,
          counted_stock: Math.random() > 0.3 ? countedStock : undefined, // 70% already counted
          variance: variance,
          variance_value: variance * product.cost_price,
          unit: 'cái',
          cost_price: product.cost_price,
          status: Math.random() > 0.3 ? (variance !== 0 ? 'VARIANCE' : 'COUNTED') : 'PENDING',
          notes: hasVariance ? 'Có chênh lệch cần kiểm tra' : undefined,
          counted_by: Math.random() > 0.3 ? 'Staff1' : undefined,
          counted_at: Math.random() > 0.3 ? new Date().toISOString() : undefined
        };
      });
      
      setCountItems(items);
    } catch (error) {
      console.error('Error loading count items:', error);
      toast.error('Không thể tải chi tiết kiểm kho');
    } finally {
      setItemsLoading(false);
    }
  }, []);

  // Create new inventory count
  const createNewCount = async () => {
    // Enhanced validation
    if (!newCountForm.count_name.trim()) {
      toast.error('Vui lòng nhập tên đợt kiểm kho');
      return;
    }

    if (!newCountForm.count_date) {
      toast.error('Vui lòng chọn ngày kiểm kho');
      return;
    }

    try {
      const newCount: InventoryCount = {
        count_id: `COUNT-${String(counts.length + 1).padStart(3, '0')}`,
        count_name: newCountForm.count_name,
        count_date: newCountForm.count_date,
        status: 'DRAFT',
        created_by: 'Admin',
        total_items: 0,
        counted_items: 0,
        variance_items: 0,
        total_variance_value: 0,
        notes: newCountForm.notes
      };

      setCounts(prev => [newCount, ...prev]);
      toast.success('Tạo đợt kiểm kho thành công');
      
      // Reset form
      setNewCountForm({
        count_name: '',
        count_date: new Date().toISOString().split('T')[0],
        notes: '',
        include_categories: [],
        include_zero_stock: false
      });
      setNewCountDialog(false);
      
    } catch (error: any) {
      console.error('Error creating count:', error);
      toast.error(`Không thể tạo đợt kiểm kho: ${error?.message || 'Lỗi không xác định'}`);
    }
  };

  // Update count item
  const updateCountItem = async () => {
    if (!selectedItem) return;

    // Validation
    if (countInput.counted_stock < 0) {
      toast.error('Số lượng kiểm kho không thể âm');
      return;
    }

    try {
      const variance = countInput.counted_stock - selectedItem.system_stock;
      const varianceValue = variance * selectedItem.cost_price;

      // Update the item
      const updatedItems = countItems.map(item => 
        item.item_id === selectedItem.item_id 
          ? {
              ...item,
              counted_stock: countInput.counted_stock,
              variance,
              variance_value: varianceValue,
              status: variance !== 0 ? 'VARIANCE' : 'COUNTED' as CountItem['status'],
              notes: countInput.notes,
              counted_by: 'Current User',
              counted_at: new Date().toISOString()
            }
          : item
      );

      setCountItems(updatedItems);

      // If there's a significant variance, create stock movement
      if (Math.abs(variance) > 0) {
        const result = await stockMovementService.createMovement({
          product_id: selectedItem.product_id,
          movement_type: 'ADJUST',
          quantity: variance,
          unit_cost: selectedItem.cost_price,
          reason: 'Điều chỉnh sau kiểm kho',
          notes: `Kiểm kho: ${selectedCount?.count_name}. ${countInput.notes || 'Chênh lệch phát hiện khi kiểm kho'}`,
          reference_type: 'SYSTEM',
          reference_code: selectedCount?.count_id
        });

        if (result.error) {
          toast.error(`Lỗi điều chỉnh tồn kho: ${result.error}`);
        }
      }

      toast.success('Cập nhật kết quả kiểm kho thành công');
      setCountItemDialog(false);
      setSelectedItem(null);
      setCountInput({ counted_stock: 0, notes: '' });

    } catch (error: any) {
      console.error('Error updating count item:', error);
      toast.error(`Không thể cập nhật kiểm kho: ${error?.message || 'Lỗi không xác định'}`);
    }
  };

  // Open count item dialog
  const openCountItemDialog = (item: CountItem) => {
    setSelectedItem(item);
    setCountInput({
      counted_stock: item.counted_stock || item.system_stock,
      notes: item.notes || ''
    });
    setCountItemDialog(true);
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const config = {
      'DRAFT': { label: 'Nháp', className: 'bg-gray-100 text-gray-800' },
      'IN_PROGRESS': { label: 'Đang kiểm', className: 'bg-blue-100 text-blue-800' },
      'COMPLETED': { label: 'Hoàn thành', className: 'bg-green-100 text-green-800' },
      'CANCELLED': { label: 'Đã hủy', className: 'bg-red-100 text-red-800' }
    };
    
    const { label, className } = config[status as keyof typeof config];
    return <Badge className={className}>{label}</Badge>;
  };

  // Get item status badge
  const getItemStatusBadge = (status: string) => {
    const config = {
      'PENDING': { label: 'Chưa kiểm', className: 'bg-gray-100 text-gray-800', icon: Clock },
      'COUNTED': { label: 'Đã kiểm', className: 'bg-green-100 text-green-800', icon: CheckCircle },
      'VARIANCE': { label: 'Có chênh lệch', className: 'bg-orange-100 text-orange-800', icon: XCircle }
    };
    
    const { label, className, icon: Icon } = config[status as keyof typeof config];
    return (
      <Badge className={className}>
        <Icon className="h-3 w-3 mr-1" />
        {label}
      </Badge>
    );
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  // Filter counts
  const filteredCounts = counts.filter(count => {
    if (filters.search && !count.count_name.toLowerCase().includes(filters.search.toLowerCase()) &&
        !count.count_id.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.status !== 'all' && count.status !== filters.status) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kiểm Kho</h1>
          <p className="text-muted-foreground">
            Quản lý và theo dõi các đợt kiểm kho hàng hóa
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadCounts} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Dialog open={newCountDialog} onOpenChange={setNewCountDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Tạo đợt kiểm kho
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tạo đợt kiểm kho mới</DialogTitle>
                <DialogDescription>
                  Tạo một đợt kiểm kho để theo dõi và điều chỉnh tồn kho
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="countName">Tên đợt kiểm kho *</Label>
                  <Input
                    id="countName"
                    placeholder="VD: Kiểm kho tháng 8/2025"
                    value={newCountForm.count_name}
                    onChange={(e) => setNewCountForm(prev => ({ ...prev, count_name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="countDate">Ngày kiểm kho</Label>
                  <Input
                    id="countDate"
                    type="date"
                    value={newCountForm.count_date}
                    onChange={(e) => setNewCountForm(prev => ({ ...prev, count_date: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Ghi chú</Label>
                  <Textarea
                    id="notes"
                    placeholder="Ghi chú về đợt kiểm kho này"
                    value={newCountForm.notes}
                    onChange={(e) => setNewCountForm(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setNewCountDialog(false)}>
                    Hủy
                  </Button>
                  <Button onClick={createNewCount}>
                    Tạo đợt kiểm kho
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Counts List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Danh sách đợt kiểm kho</CardTitle>
              <CardDescription>
                {filteredCounts.length} đợt kiểm kho
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm..."
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-8"
                  />
                </div>

                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="DRAFT">Nháp</SelectItem>
                    <SelectItem value="IN_PROGRESS">Đang kiểm</SelectItem>
                    <SelectItem value="COMPLETED">Hoàn thành</SelectItem>
                    <SelectItem value="CANCELLED">Đã hủy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Counts List */}
              <div className="space-y-3 mt-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                  </div>
                ) : filteredCounts.map((count) => (
                  <div
                    key={count.count_id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCount?.count_id === count.count_id 
                        ? 'bg-blue-50 border-blue-200' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setSelectedCount(count);
                      loadCountItems(count.count_id);
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">{count.count_name}</h4>
                      {getStatusBadge(count.status)}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>ID: {count.count_id}</div>
                      <div>Ngày: {new Date(count.count_date).toLocaleDateString('vi-VN')}</div>
                      <div>Tiến độ: {count.counted_items}/{count.total_items}</div>
                      {count.variance_items > 0 && (
                        <div className="text-orange-600">
                          Chênh lệch: {count.variance_items} sản phẩm
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Count Items Detail */}
        <div className="lg:col-span-2">
          {selectedCount ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{selectedCount.count_name}</CardTitle>
                    <CardDescription>
                      Chi tiết kiểm kho - {selectedCount.count_id}
                    </CardDescription>
                  </div>
                  {getStatusBadge(selectedCount.status)}
                </div>

                {/* Count Stats */}
                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{selectedCount.total_items}</div>
                    <div className="text-xs text-muted-foreground">Tổng sản phẩm</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{selectedCount.counted_items}</div>
                    <div className="text-xs text-muted-foreground">Đã kiểm</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{selectedCount.variance_items}</div>
                    <div className="text-xs text-muted-foreground">Có chênh lệch</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-bold ${selectedCount.total_variance_value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(selectedCount.total_variance_value)}
                    </div>
                    <div className="text-xs text-muted-foreground">Giá trị chênh lệch</div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                {itemsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sản phẩm</TableHead>
                          <TableHead className="text-right">Hệ thống</TableHead>
                          <TableHead className="text-right">Kiểm đếm</TableHead>
                          <TableHead className="text-right">Chênh lệch</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead className="text-center">Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {countItems.map((item) => (
                          <TableRow key={item.item_id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{item.product_name}</div>
                                <div className="text-sm text-muted-foreground">{item.product_code}</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {item.system_stock.toLocaleString()} {item.unit}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.counted_stock !== undefined 
                                ? `${item.counted_stock.toLocaleString()} ${item.unit}` 
                                : '-'
                              }
                            </TableCell>
                            <TableCell className="text-right">
                              {item.counted_stock !== undefined ? (
                                <span className={item.variance > 0 ? 'text-green-600' : item.variance < 0 ? 'text-red-600' : 'text-gray-600'}>
                                  {item.variance > 0 ? '+' : ''}{item.variance.toLocaleString()}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {getItemStatusBadge(item.status)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openCountItemDialog(item)}
                              >
                                <Calculator className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Chọn một đợt kiểm kho để xem chi tiết</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Count Item Dialog */}
      <Dialog open={countItemDialog} onOpenChange={setCountItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cập nhật kết quả kiểm kho</DialogTitle>
            <DialogDescription>
              Nhập số lượng thực tế sau khi kiểm đếm
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Sản phẩm:</span>
                  <div className="font-medium">{selectedItem.product_name}</div>
                  <div className="text-xs text-muted-foreground">{selectedItem.product_code}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Tồn kho hệ thống:</span>
                  <div className="font-medium">{selectedItem.system_stock} {selectedItem.unit}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="countedStock">Số lượng kiểm đếm thực tế</Label>
                <Input
                  id="countedStock"
                  type="number"
                  min="0"
                  value={countInput.counted_stock}
                  onChange={(e) => setCountInput(prev => ({ 
                    ...prev, 
                    counted_stock: parseInt(e.target.value) || 0 
                  }))}
                />
                <div className="text-xs text-muted-foreground">
                  Chênh lệch: {countInput.counted_stock - selectedItem.system_stock > 0 ? '+' : ''}
                  {countInput.counted_stock - selectedItem.system_stock} {selectedItem.unit}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="countNotes">Ghi chú</Label>
                <Textarea
                  id="countNotes"
                  placeholder="Ghi chú về kết quả kiểm kho (tùy chọn)"
                  value={countInput.notes}
                  onChange={(e) => setCountInput(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setCountItemDialog(false)}
                >
                  Hủy
                </Button>
                <Button onClick={updateCountItem}>
                  Cập nhật kết quả
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
