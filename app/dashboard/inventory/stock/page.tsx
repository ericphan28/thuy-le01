'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Search,
  Filter,
  Download,
  RefreshCw,
  Edit,
  Eye,
  BarChart3
} from 'lucide-react';
import { productService } from '@/lib/services/product-service';
import stockMovementService from '@/lib/services/stock-movement-service';

interface StockItem {
  product_id: number;
  product_name: string;
  product_code: string;
  category_name?: string;
  current_stock: number;
  min_stock: number;
  max_stock?: number;
  unit: string;
  cost_price: number;
  sale_price: number;
  stock_value: number;
  stock_status: 'OK' | 'LOW' | 'CRITICAL' | 'OUT_OF_STOCK';
  last_movement?: string;
  reorder_point: number;
  supplier_name?: string;
}

interface StockAdjustment {
  product_id: number;
  adjustment_type: 'SET' | 'ADD' | 'SUBTRACT';
  quantity: number;
  reason: string;
  notes?: string;
}

export default function StockLevelsPage() {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustmentDialog, setAdjustmentDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState<StockAdjustment>({
    product_id: 0,
    adjustment_type: 'SET',
    quantity: 0,
    reason: '',
    notes: ''
  });

  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    status: 'all',
    sortBy: 'product_name'
  });

  const [adjusting, setAdjusting] = useState(false);

  // Load stock data
  const loadStockData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await productService.getProducts({ limit: 1000 });
      const products = result.products;

      const stockItems: StockItem[] = products.map(product => {
        const stockValue = product.current_stock * product.cost_price;
        let stockStatus: StockItem['stock_status'] = 'OK';
        
        if (product.current_stock === 0) {
          stockStatus = 'OUT_OF_STOCK';
        } else if (product.current_stock <= product.min_stock * 0.5) {
          stockStatus = 'CRITICAL';
        } else if (product.current_stock <= product.min_stock) {
          stockStatus = 'LOW';
        }

        return {
          product_id: product.product_id,
          product_name: product.product_name,
          product_code: product.product_code,
          category_name: product.category?.category_name,
            current_stock: product.current_stock,
          min_stock: product.min_stock || 10,
          max_stock: product.max_stock,
          unit: (product as any).unit || 'cái',
          cost_price: product.cost_price,
          sale_price: product.sale_price,
          stock_value: stockValue,
          stock_status: stockStatus,
          reorder_point: product.min_stock || 10,
          supplier_name: (product as any).supplier_name
        };
      });

      setStockItems(stockItems);
    } catch (error) {
      console.error('Error loading stock data:', error);
      toast.error('Không thể tải dữ liệu tồn kho');
    } finally {
      setLoading(false);
    }
  }, []);

  // Apply filters
  const applyFilters = useCallback(() => {
    let filtered = [...stockItems];

    // Search filter
    if (filters.search) {
      filtered = filtered.filter(item =>
        item.product_name.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.product_code.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.category_name?.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    // Category filter
    if (filters.category !== 'all') {
      filtered = filtered.filter(item => item.category_name === filters.category);
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(item => item.stock_status === filters.status);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'product_name':
          return a.product_name.localeCompare(b.product_name);
        case 'current_stock':
          return b.current_stock - a.current_stock;
        case 'stock_value':
          return b.stock_value - a.stock_value;
        case 'stock_status':
          const statusOrder = { 'OUT_OF_STOCK': 0, 'CRITICAL': 1, 'LOW': 2, 'OK': 3 };
          return statusOrder[a.stock_status] - statusOrder[b.stock_status];
        default:
          return 0;
      }
    });

    setFilteredItems(filtered);
  }, [stockItems, filters]);

  // Handle stock adjustment
  const handleAdjustment = async () => {
    if (!selectedItem || adjusting) return;

    // Validate input
    if (adjustmentForm.quantity <= 0) {
      toast.error('Số lượng phải lớn hơn 0');
      return;
    }

    if (!adjustmentForm.reason.trim()) {
      toast.error('Vui lòng nhập lý do điều chỉnh');
      return;
    }

    try {
      setAdjusting(true);

      let finalQuantity = adjustmentForm.quantity;
      let movementType: 'IN' | 'OUT' | 'ADJUST' = 'ADJUST';

      // Calculate final quantity based on adjustment type
      switch (adjustmentForm.adjustment_type) {
        case 'SET':
          finalQuantity = adjustmentForm.quantity - selectedItem.current_stock;
          break;
        case 'ADD':
          finalQuantity = Math.abs(adjustmentForm.quantity);
          movementType = 'IN';
          break;
        case 'SUBTRACT':
          finalQuantity = -Math.abs(adjustmentForm.quantity);
          movementType = 'OUT';
          break;
      }

      // Create stock movement
      const result = await stockMovementService.createMovement({
        product_id: selectedItem.product_id,
        movement_type: movementType,
        quantity: finalQuantity,
        unit_cost: selectedItem.cost_price,
        reason: adjustmentForm.reason,
        notes: adjustmentForm.notes,
        reference_type: 'MANUAL'
      });

      if (result.error) {
        toast.error(`Lỗi điều chỉnh: ${result.error}`);
        return;
      }

      toast.success(`Điều chỉnh tồn kho thành công cho ${selectedItem.product_name}`);
      
      // Reset and reload
      setAdjustmentDialog(false);
      setSelectedItem(null);
      setAdjustmentForm({
        product_id: 0,
        adjustment_type: 'SET',
        quantity: 0,
        reason: '',
        notes: ''
      });
      await loadStockData(); // Ensure data reloads

    } catch (error: any) {
      console.error('Error adjusting stock:', error);
      toast.error(`Không thể điều chỉnh tồn kho: ${error?.message || 'Lỗi không xác định'}`);
    } finally {
      setAdjusting(false);
    }
  };

  // Open adjustment dialog
  const openAdjustmentDialog = (item: StockItem) => {
    setSelectedItem(item);
    setAdjustmentForm({
      product_id: item.product_id,
      adjustment_type: 'SET',
      quantity: item.current_stock,
      reason: '',
      notes: ''
    });
    setAdjustmentDialog(true);
  };

  // Get stock status badge
  const getStatusBadge = (status: StockItem['stock_status']) => {
    const config = {
      'OK': { label: 'Đủ hàng', className: 'bg-green-100 text-green-800' },
      'LOW': { label: 'Sắp hết', className: 'bg-yellow-100 text-yellow-800' },
      'CRITICAL': { label: 'Rất ít', className: 'bg-orange-100 text-orange-800' },
      'OUT_OF_STOCK': { label: 'Hết hàng', className: 'bg-red-100 text-red-800' }
    };
    
    const { label, className } = config[status];
    return <Badge className={className}>{label}</Badge>;
  };

  // Get unique categories for filter
  const categories = Array.from(new Set(stockItems.map(item => item.category_name).filter(Boolean)));

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  useEffect(() => {
    loadStockData();
  }, [loadStockData]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const stats = {
    totalItems: stockItems.length,
    totalValue: stockItems.reduce((sum, item) => sum + item.stock_value, 0),
    criticalItems: stockItems.filter(item => item.stock_status === 'CRITICAL' || item.stock_status === 'OUT_OF_STOCK').length,
    lowStockItems: stockItems.filter(item => item.stock_status === 'LOW').length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tồn Kho Chi Tiết</h1>
          <p className="text-muted-foreground text-sm">Nhật ký theo sản phẩm để truy vết biến động & điều tra chênh lệch ({stats.totalItems} sản phẩm).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadStockData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Button asChild variant="secondary">
            <a href="/dashboard/inventory/inbound">+ Nhập hàng</a>
          </Button>
          <Button asChild variant="secondary">
            <a href="/dashboard/inventory/movements">Lịch sử xuất nhập</a>
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng sản phẩm</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalItems}</div>
            <p className="text-xs text-muted-foreground">sản phẩm đang quản lý</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Giá trị tồn kho</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</div>
            <p className="text-xs text-muted-foreground">tổng giá trị hàng hóa</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cảnh báo</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.criticalItems}</div>
            <p className="text-xs text-muted-foreground">sản phẩm cần nhập hàng</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sắp hết</CardTitle>
            <TrendingDown className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.lowStockItems}</div>
            <p className="text-xs text-muted-foreground">sản phẩm sắp hết hàng</p>
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
            <div className="space-y-2">
              <Label htmlFor="search">Tìm kiếm</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Tên, mã sản phẩm..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Danh mục</Label>
              <Select
                value={filters.category}
                onValueChange={(value) => setFilters(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn danh mục" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả danh mục</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category} value={category || 'undefined'}>
                      {category || 'Chưa phân loại'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Trạng thái</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="OK">Đủ hàng</SelectItem>
                  <SelectItem value="LOW">Sắp hết</SelectItem>
                  <SelectItem value="CRITICAL">Rất ít</SelectItem>
                  <SelectItem value="OUT_OF_STOCK">Hết hàng</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sort">Sắp xếp</Label>
              <Select
                value={filters.sortBy}
                onValueChange={(value) => setFilters(prev => ({ ...prev, sortBy: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sắp xếp theo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product_name">Tên sản phẩm</SelectItem>
                  <SelectItem value="current_stock">Tồn kho</SelectItem>
                  <SelectItem value="stock_value">Giá trị</SelectItem>
                  <SelectItem value="stock_status">Trạng thái</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách tồn kho</CardTitle>
          <CardDescription>
            Hiển thị {filteredItems.length} sản phẩm {stockItems.length > filteredItems.length && `trong tổng số ${stockItems.length} sản phẩm`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Danh mục</TableHead>
                    <TableHead className="text-right">Tồn kho</TableHead>
                    <TableHead className="text-right">Mức tối thiểu</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-right">Giá trị</TableHead>
                    <TableHead className="text-center">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.product_id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{item.product_name}</div>
                          <div className="text-sm text-muted-foreground">{item.product_code}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.category_name || 'Chưa phân loại'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">
                          {item.current_stock.toLocaleString()} {item.unit}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.min_stock.toLocaleString()} {item.unit}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(item.stock_status)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.cost_price)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.stock_value)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openAdjustmentDialog(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock Adjustment Dialog */}
      <Dialog open={adjustmentDialog} onOpenChange={setAdjustmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Điều chỉnh tồn kho</DialogTitle>
            <DialogDescription>
              Điều chỉnh số lượng tồn kho cho sản phẩm: {selectedItem?.product_name}
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Mã sản phẩm:</span>
                  <div className="font-medium">{selectedItem.product_code}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Tồn kho hiện tại:</span>
                  <div className="font-medium">{selectedItem.current_stock} {selectedItem.unit}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustmentType">Loại điều chỉnh</Label>
                <Select
                  value={adjustmentForm.adjustment_type}
                  onValueChange={(value: 'SET' | 'ADD' | 'SUBTRACT') => 
                    setAdjustmentForm(prev => ({ ...prev, adjustment_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SET">Đặt số lượng cụ thể</SelectItem>
                    <SelectItem value="ADD">Cộng thêm</SelectItem>
                    <SelectItem value="SUBTRACT">Trừ bớt</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">
                  {adjustmentForm.adjustment_type === 'SET' ? 'Số lượng mới' :
                   adjustmentForm.adjustment_type === 'ADD' ? 'Số lượng cộng thêm' :
                   'Số lượng trừ bớt'}
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  value={adjustmentForm.quantity}
                  onChange={(e) => setAdjustmentForm(prev => ({ 
                    ...prev, 
                    quantity: parseInt(e.target.value) || 0 
                  }))}
                />
                {adjustmentForm.adjustment_type === 'SET' && (
                  <div className="text-xs text-muted-foreground">
                    Sự thay đổi: {adjustmentForm.quantity - selectedItem.current_stock > 0 ? '+' : ''}
                    {adjustmentForm.quantity - selectedItem.current_stock}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Lý do điều chỉnh *</Label>
                <Select
                  value={adjustmentForm.reason}
                  onValueChange={(value) => setAdjustmentForm(prev => ({ ...prev, reason: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn lý do" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kiểm kho">Kiểm kho</SelectItem>
                    <SelectItem value="Hư hỏng">Hư hỏng</SelectItem>
                    <SelectItem value="Mất mát">Mất mát</SelectItem>
                    <SelectItem value="Sai sót nhập liệu">Sai sót nhập liệu</SelectItem>
                    <SelectItem value="Điều chỉnh khác">Điều chỉnh khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Ghi chú</Label>
                <Input
                  id="notes"
                  placeholder="Ghi chú thêm (tùy chọn)"
                  value={adjustmentForm.notes}
                  onChange={(e) => setAdjustmentForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setAdjustmentDialog(false)}
                  disabled={adjusting}
                >
                  Hủy
                </Button>
                <Button 
                  onClick={handleAdjustment}
                  disabled={adjusting || !adjustmentForm.reason}
                >
                  {adjusting ? 'Đang xử lý...' : 'Xác nhận điều chỉnh'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
