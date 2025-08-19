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
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  Plus, 
  Truck,
  Package,
  Calendar,
  DollarSign,
  FileText,
  Search,
  Filter,
  RefreshCw,
  Download,
  Edit,
  Trash2,
  Check,
  X,
  AlertTriangle,
  Printer
} from 'lucide-react';
import { productService } from '@/lib/services/product-service';
import stockMovementService from '@/lib/services/stock-movement-service';
import inboundService, { CreateInboundItemInput } from '@/lib/services/inbound-service';
import PrintInbound from '@/components/pos/print-inbound';
import OpenInboundPrintButton from '@/components/inventory/open-inbound-print-button';

interface InboundOrder {
  inbound_id: string;
  inbound_code: string;
  supplier_id?: number;
  supplier_name?: string;
  expected_date?: string;
  received_date?: string;
  status: 'PENDING' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  ordered_total_qty?: number;
  received_total_qty?: number;
  total_cost?: number;
  notes?: string;
  created_by: string;
  created_at: string;
}

interface InboundItem {
  item_id: string;
  inbound_id: string;
  product_id: number;
  product_name: string;
  product_code: string;
  ordered_quantity: number;
  received_quantity: number;
  unit_cost: number;
  total_cost: number;
  unit: string;
  expiry_date?: string;
  batch_number?: string;
  notes?: string;
}

interface NewInboundForm {
  supplier_id?: number;
  supplier_name: string;
  supplier_contact: string;
  expected_date: string;
  notes: string;
  items: {
    product_id: number;
    quantity: number;
    unit_cost: number;
    notes?: string;
  }[];
}

interface Product {
  product_id: number;
  product_name: string;
  product_code: string;
  current_stock: number;
  unit: string;
  cost_price: number;
}

interface SupplierOption {
  supplier_id: number;
  supplier_code: string;
  supplier_name: string;
  phone?: string;
  email?: string;
  contact_person?: string;
}

export default function InboundPage() {
  const [inboundOrders, setInboundOrders] = useState<InboundOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newInboundDialog, setNewInboundDialog] = useState(false);
  const [editInboundDialog, setEditInboundDialog] = useState(false);
  const [receiveDialog, setReceiveDialog] = useState(false);
  const [printDialog, setPrintDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<InboundOrder | null>(null);
  const [orderItems, setOrderItems] = useState<InboundItem[]>([]);
  const [receiveLines, setReceiveLines] = useState<Record<string, number>>({});
  const [batchLines, setBatchLines] = useState<Record<string, string>>({});
  const [expiryLines, setExpiryLines] = useState<Record<string, string>>({});
  const [receiving, setReceiving] = useState(false);

  const [newInboundForm, setNewInboundForm] = useState<NewInboundForm>({
    supplier_id: undefined,
    supplier_name: '',
    supplier_contact: '',
    expected_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
    notes: '',
    items: []
  });

  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    dateRange: 'all'
  });

  // Load inbound orders (mock data)
  const loadInboundOrders = useCallback(async () => {
    try {
      setLoading(true);
      const list = await inboundService.listInbound(200);
      setInboundOrders(list as any);
    } catch (error) {
      console.error('Error loading inbound orders:', error);
      toast.error('Không thể tải danh sách đơn nhập hàng');
    } finally {
      setLoading(false);
    }
  }, []);

  const openReceiveDialog = async (order: InboundOrder) => {
    try {
      setSelectedOrder(order);
      const items = await inboundService.getItems(order.inbound_id);
      setOrderItems(items as any);
      // reset receive inputs (remaining qty default)
      const defaults: Record<string, number> = {};
      const batches: Record<string, string> = {};
      const expiries: Record<string, string> = {};
      (items as any).forEach((it: any) => {
        const remain = Number(it.ordered_qty) - Number(it.received_qty);
        defaults[it.item_id] = remain > 0 ? remain : 0;
        batches[it.item_id] = it.batch_number || '';
        expiries[it.item_id] = it.expiry_date || '';
      });
      setReceiveLines(defaults);
      setBatchLines(batches);
      setExpiryLines(expiries);
      setReceiveDialog(true);
    } catch(e:any) {
      toast.error('Không tải được danh sách sản phẩm: '+ e.message);
    }
  };

  const openEditDialog = async (order: InboundOrder) => {
    if (order.status === 'RECEIVED' || order.status === 'CANCELLED') {
      toast.error('Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy');
      return;
    }
    try {
      setSelectedOrder(order);
      const items = await inboundService.getItems(order.inbound_id);
      setOrderItems(items as any);
      
      // Pre-fill form with existing data
      setNewInboundForm({
        supplier_id: order.supplier_id || undefined,
        supplier_name: order.supplier_name || '',
        supplier_contact: '',
        expected_date: order.expected_date || '',
        notes: order.notes || '',
        items: (items as any).map((it: any) => ({
          product_id: it.product_id,
          quantity: Number(it.ordered_qty),
          unit_cost: Number(it.unit_cost),
          notes: it.notes || ''
        }))
      });
      
      setEditInboundDialog(true);
    } catch(e:any) {
      toast.error('Không tải được thông tin đơn hàng: ' + e.message);
    }
  };

  const handleReceiveSubmit = async () => {
    if (!selectedOrder) return;
    const lines = Object.entries(receiveLines)
      .filter(([_, v]) => v && v > 0)
      .map(([item_id, v]) => ({ 
        item_id, 
        receive_qty: v
        // Tạm thời bỏ batch/expiry vì function chưa hỗ trợ
        // batch_number: batchLines[item_id] || undefined,
        // expiry_date: expiryLines[item_id] || undefined
      }));
    if (lines.length === 0) {
      toast.error('Chưa nhập số lượng nào');
      return;
    }
    try {
      setReceiving(true);
      await inboundService.receive(selectedOrder.inbound_id, lines, 'User');
      toast.success('Nhận hàng thành công');
      setReceiveDialog(false);
      await loadInboundOrders();
    } catch(e:any) {
      toast.error('Nhận hàng thất bại: ' + e.message);
    } finally {
      setReceiving(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!selectedOrder) return;
    try {
      await inboundService.updateInbound(selectedOrder.inbound_id, {
        expected_date: newInboundForm.expected_date,
        notes: newInboundForm.notes,
        items: newInboundForm.items
      });
      toast.success('Cập nhật đơn hàng thành công');
      setEditInboundDialog(false);
      await loadInboundOrders();
    } catch(e:any) {
      toast.error('Cập nhật thất bại: ' + e.message);
    }
  };

  const openPrintDialog = async (order: InboundOrder) => {
    try {
      setSelectedOrder(order);
      const items = await inboundService.getItems(order.inbound_id);
      setOrderItems(items as any);
      setPrintDialog(true);
    } catch(e:any) {
      toast.error('Không tải được thông tin in: ' + e.message);
    }
  };

  const cancelOrder = async (order: InboundOrder) => {
    // đơn giản: update status trực tiếp (chỉ cho phép khi chưa nhận gì)
    try {
      const items = await inboundService.getItems(order.inbound_id);
      const anyReceived = (items as any).some((it:any) => Number(it.received_qty) > 0);
      if (anyReceived) {
        toast.error('Đã có hàng nhận, không thể hủy');
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.from('inbound_orders').update({ status: 'CANCELLED' }).eq('inbound_id', order.inbound_id);
      if (error) throw new Error(error.message);
      toast.success('Đã hủy đơn');
      await loadInboundOrders();
    } catch(e:any) {
      toast.error('Không thể hủy: ' + e.message);
    }
  };

  // Load suppliers list
  const loadSuppliers = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('suppliers')
        .select('supplier_id,supplier_code,supplier_name,phone,email,contact_person')
        .order('supplier_name', { ascending: true })
        .limit(500);
      if (error) {
        console.error('Error loading suppliers:', error);
        return;
      }
      setSuppliers((data as any) || []);
    } catch (e) {
      console.error('Unexpected error loading suppliers', e);
    }
  }, []);

  // Load products for selection
  const loadProducts = useCallback(async () => {
    try {
      const result = await productService.getProducts({ limit: 100 });
      const transformedProducts = result.products.map((p: any) => ({
        product_id: p.product_id,
        product_name: p.product_name,
        product_code: p.product_code,
        current_stock: p.current_stock,
        unit: 'cái', // Default unit
        cost_price: p.cost_price
      }));
      setProducts(transformedProducts);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error("Không thể tải danh sách sản phẩm");
    }
  }, []);

  // Create new inbound order
  const createInboundOrder = async () => {
    // Enhanced validation
    if (!newInboundForm.supplier_id) {
      toast.error('Vui lòng chọn nhà cung cấp');
      return;
    }

    if (newInboundForm.items.length === 0) {
      toast.error('Vui lòng thêm ít nhất một sản phẩm');
      return;
    }

    // Validate all items
    for (let i = 0; i < newInboundForm.items.length; i++) {
      const item = newInboundForm.items[i];
      
      if (item.product_id === 0) {
        toast.error(`Vui lòng chọn sản phẩm cho mục ${i + 1}`);
        return;
      }
      
      if (item.quantity <= 0) {
        toast.error(`Số lượng phải lớn hơn 0 cho mục ${i + 1}`);
        return;
      }
      
      if (item.unit_cost <= 0) {
        toast.error(`Giá nhập phải lớn hơn 0 cho mục ${i + 1}`);
        return;
      }
    }

    try {
      const inbound_id = await inboundService.createInbound({
        supplier_id: newInboundForm.supplier_id!,
        expected_date: newInboundForm.expected_date,
        notes: newInboundForm.notes,
        created_by: 'User',
        items: newInboundForm.items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost }))
      });
      toast.success('Tạo đơn nhập hàng thành công');
      await loadInboundOrders();
      
      // Reset form
      setNewInboundForm({
        supplier_id: undefined,
        supplier_name: '',
        supplier_contact: '',
        expected_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: '',
        items: []
      });
      setNewInboundDialog(false);
      
    } catch (error: any) {
      console.error('Error creating inbound order:', error);
      toast.error(`Không thể tạo đơn nhập hàng: ${error?.message || 'Lỗi không xác định'}`);
    }
  };

  // Add product to inbound form
  const addProductToForm = () => {
    setNewInboundForm(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: 0,
        quantity: 1,
        unit_cost: 0,
        notes: ''
      }]
    }));
  };

  // Remove product from form
  const removeProductFromForm = (index: number) => {
    setNewInboundForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Update product in form
  const updateProductInForm = (index: number, field: string, value: any) => {
    setNewInboundForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const config = {
      'PENDING': { label: 'Chờ nhận', className: 'bg-yellow-100 text-yellow-800', icon: Calendar },
      'PARTIAL': { label: 'Nhận một phần', className: 'bg-blue-100 text-blue-800', icon: Package },
      'RECEIVED': { label: 'Đã nhận', className: 'bg-green-100 text-green-800', icon: Check },
      'CANCELLED': { label: 'Đã hủy', className: 'bg-red-100 text-red-800', icon: X }
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

  // Filter orders
  const filteredOrders = inboundOrders.filter(order => {
  if (filters.search && !order.inbound_code.toLowerCase().includes(filters.search.toLowerCase()) &&
    !(order.supplier_name || '').toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.status !== 'all' && order.status !== filters.status) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    loadInboundOrders();
    loadProducts();
  }, [loadInboundOrders, loadProducts]);

  // Load suppliers when dialog opens first time
  useEffect(() => {
    if (newInboundDialog && suppliers.length === 0) {
      loadSuppliers();
    }
  }, [newInboundDialog, suppliers.length, loadSuppliers]);

  // Calculate stats
  const stats = {
    totalOrders: inboundOrders.length,
    pendingOrders: inboundOrders.filter(o => o.status === 'PENDING').length,
    receivedOrders: inboundOrders.filter(o => o.status === 'RECEIVED').length,
    totalValue: inboundOrders.reduce((sum, o) => sum + (o.total_cost || 0), 0)
  };
  const progressPercent = (order: InboundOrder) => {
    if (!order.ordered_total_qty || order.ordered_total_qty === 0) return 0;
    return Math.round(((order.received_total_qty || 0) / order.ordered_total_qty) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Nhập Hàng</h1>
          <p className="text-muted-foreground">
            Quản lý đơn đặt hàng và nhập kho từ nhà cung cấp
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadInboundOrders} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Dialog open={newInboundDialog} onOpenChange={setNewInboundDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Tạo đơn nhập hàng
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tạo đơn nhập hàng mới</DialogTitle>
                <DialogDescription>
                  Tạo đơn đặt hàng từ nhà cung cấp
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Supplier Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 relative">
                    <Label>Nhà cung cấp *</Label>
                    <Input
                      placeholder="Tìm nhà cung cấp theo tên hoặc mã..."
                      value={newInboundForm.supplier_id ? newInboundForm.supplier_name : (supplierSearch || '')}
                      onChange={(e) => {
                        setNewInboundForm(prev => ({ ...prev, supplier_id: undefined, supplier_name: '' }));
                        setSupplierSearch(e.target.value);
                      }}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onBlur={() => {
                        // delay to allow click
                        setTimeout(() => setShowSupplierDropdown(false), 150);
                      }}
                    />
                    {showSupplierDropdown && (
                      <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow">
                        <div className="p-1 text-xs text-muted-foreground sticky top-0 bg-popover/90 backdrop-blur">{suppliers.length} nhà cung cấp</div>
                        {suppliers
                          .filter(s => {
                            const term = supplierSearch.toLowerCase();
                            if (!term) return true;
                            return s.supplier_name.toLowerCase().includes(term) || s.supplier_code.toLowerCase().includes(term);
                          })
                          .slice(0,100)
                          .map(s => (
                            <button
                              type="button"
                              key={s.supplier_id}
                              onClick={() => {
                                setNewInboundForm(prev => ({
                                  ...prev,
                                  supplier_id: s.supplier_id,
                                  supplier_name: s.supplier_name,
                                  supplier_contact: s.phone || s.email || prev.supplier_contact
                                }));
                                setSupplierSearch('');
                                setShowSupplierDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${newInboundForm.supplier_id === s.supplier_id ? 'bg-accent/60' : ''}`}
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
                          <div className="p-3 text-sm text-muted-foreground">Không có dữ liệu nhà cung cấp</div>
                        )}
                      </div>
                    )}
                    {newInboundForm.supplier_id && (
                      <div className="text-xs text-muted-foreground">Đã chọn: {newInboundForm.supplier_name}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplierContact">Liên hệ</Label>
                    <Input
                      id="supplierContact"
                      placeholder="Số điện thoại/Email"
                      value={newInboundForm.supplier_contact}
                      onChange={(e) => setNewInboundForm(prev => ({ ...prev, supplier_contact: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expectedDate">Ngày dự kiến nhận</Label>
                    <Input
                      id="expectedDate"
                      type="date"
                      value={newInboundForm.expected_date}
                      onChange={(e) => setNewInboundForm(prev => ({ ...prev, expected_date: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="orderNotes">Ghi chú đơn hàng</Label>
                    <Input
                      id="orderNotes"
                      placeholder="Ghi chú về đơn hàng"
                      value={newInboundForm.notes}
                      onChange={(e) => setNewInboundForm(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Products */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Danh sách sản phẩm</h3>
                    <Button type="button" variant="outline" onClick={addProductToForm}>
                      <Plus className="h-4 w-4 mr-2" />
                      Thêm sản phẩm
                    </Button>
                  </div>

                  {newInboundForm.items.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Chưa có sản phẩm nào. Nhấn nút Thêm sản phẩm để bắt đầu.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {newInboundForm.items.map((item, index) => {
                        const product = products.find(p => p.product_id === item.product_id);
                        return (
                          <div key={index} className="grid grid-cols-12 gap-2 items-end p-4 border rounded-lg">
                            <div className="col-span-4">
                              <Label>Sản phẩm *</Label>
                              <SearchableCombobox
                                items={products}
                                value={products.find(p => p.product_id === item.product_id)}
                                onValueChange={(product) => updateProductInForm(index, 'product_id', product ? product.product_id : 0)}
                                getItemId={(product) => product.product_id.toString()}
                                getItemLabel={(product) => `${product.product_name} (${product.product_code}) - Tồn: ${product.current_stock} ${product.unit}`}
                                placeholder="Tìm sản phẩm..."
                              />
                            </div>

                            <div className="col-span-2">
                              <Label>Số lượng *</Label>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateProductInForm(index, 'quantity', parseInt(e.target.value) || 1)}
                              />
                            </div>

                            <div className="col-span-2">
                              <Label>Đơn giá *</Label>
                              <Input
                                type="number"
                                min="0"
                                value={item.unit_cost}
                                onChange={(e) => updateProductInForm(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                              />
                            </div>

                            <div className="col-span-2">
                              <Label>Thành tiền</Label>
                              <div className="h-10 flex items-center text-sm font-medium">
                                {formatCurrency(item.quantity * item.unit_cost)}
                              </div>
                            </div>

                            <div className="col-span-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeProductFromForm(index)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            {product && (
                              <div className="col-span-12 text-xs text-muted-foreground">
                                Tồn kho hiện tại: {product.current_stock} {product.unit} • 
                                Giá gốc: {formatCurrency(product.cost_price)}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Total */}
                      <div className="flex justify-end">
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Tổng giá trị đơn hàng:</div>
                          <div className="text-lg font-bold">
                            {formatCurrency(newInboundForm.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setNewInboundDialog(false)}>
                    Hủy
                  </Button>
                  <Button onClick={createInboundOrder}>
                    Tạo đơn nhập hàng
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng đơn hàng</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
            <p className="text-xs text-muted-foreground">đơn nhập hàng</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chờ nhận</CardTitle>
            <Calendar className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingOrders}</div>
            <p className="text-xs text-muted-foreground">đơn chờ xử lý</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Đã nhận</CardTitle>
            <Check className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.receivedOrders}</div>
            <p className="text-xs text-muted-foreground">đơn hoàn thành</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng giá trị</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</div>
            <p className="text-xs text-muted-foreground">tổng đơn hàng</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Tìm kiếm</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Mã đơn, nhà cung cấp..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-8"
                />
              </div>
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
                  <SelectItem value="PENDING">Chờ nhận</SelectItem>
                  <SelectItem value="PARTIAL">Nhận một phần</SelectItem>
                  <SelectItem value="RECEIVED">Đã nhận</SelectItem>
                  <SelectItem value="CANCELLED">Đã hủy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateRange">Thời gian</Label>
              <Select
                value={filters.dateRange}
                onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn thời gian" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="today">Hôm nay</SelectItem>
                  <SelectItem value="week">Tuần này</SelectItem>
                  <SelectItem value="month">Tháng này</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Danh sách đơn nhập hàng</CardTitle>
              <CardDescription>
                Hiển thị {filteredOrders.length} đơn hàng {inboundOrders.length > filteredOrders.length && `trong tổng số ${inboundOrders.length} đơn hàng`}
              </CardDescription>
            </div>
            <OpenInboundPrintButton />
          </div>
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
                    <TableHead>Mã đơn hàng</TableHead>
                    <TableHead>Nhà cung cấp</TableHead>
                    <TableHead>Ngày đặt</TableHead>
                    <TableHead>Ngày dự kiến</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Số lượng SP</TableHead>
                    <TableHead className="text-right">Tổng tiền</TableHead>
                    <TableHead className="text-center">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.inbound_id}>
                      <TableCell>
                        <div className="font-medium">{order.inbound_code}</div>
                        {order.notes && (
                          <div className="text-sm text-muted-foreground">{order.notes}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{order.supplier_name}</div>
                        {/* supplier_contact bỏ vì chưa có trong summary */}
                      </TableCell>
                      <TableCell>
                        {/* order_date chưa có trong summary; dùng created_at */}
                        {new Date(order.created_at).toLocaleDateString('vi-VN')}
                      </TableCell>
                      <TableCell>
                        {order.expected_date ? new Date(order.expected_date).toLocaleDateString('vi-VN') : '-'}
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(order.status)}
                            <span className="text-xs text-muted-foreground">{progressPercent(order)}%</span>
                          </div>
                          <Progress value={progressPercent(order)} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {order.ordered_total_qty || 0} đặt / {order.received_total_qty || 0} nhận
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(order.total_cost || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openPrintDialog(order)} title="In đơn hàng">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(order)} title="Chỉnh sửa">
                            <Edit className="h-4 w-4" />
                          </Button>
                          {order.status !== 'RECEIVED' && order.status !== 'CANCELLED' && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openReceiveDialog(order)} title="Nhận từng phần">
                                <Truck className="h-4 w-4" />
                              </Button>
                              {order.status === 'PENDING' && (
                                <Button variant="ghost" size="sm" onClick={() => cancelOrder(order)} title="Hủy đơn">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
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
      {/* Receive Dialog */}
      <Dialog open={receiveDialog} onOpenChange={setReceiveDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nhận hàng {selectedOrder?.inbound_code}</DialogTitle>
            <DialogDescription>Nhập số lượng thực nhận cho từng dòng (để 0 nếu chưa nhận)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {orderItems.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">Không có dòng sản phẩm</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-12 text-xs font-medium text-muted-foreground px-2">
                  <div className="col-span-4">Sản phẩm</div>
                  <div className="col-span-2 text-right">Đặt</div>
                  <div className="col-span-2 text-right">Đã nhận</div>
                  <div className="col-span-2 text-right">Còn lại</div>
                  <div className="col-span-2 text-right">Nhận lần này</div>
                </div>
                {orderItems.map(it => {
                  const remain = Number((it as any).ordered_qty) - Number((it as any).received_qty);
                  return (
                    <div key={it.item_id} className="grid grid-cols-12 items-center gap-2 px-2 py-2 border rounded-md text-sm bg-background/50">
                      <div className="col-span-4">
                        <div className="font-medium">{(it as any).product_name || 'Sản phẩm không xác định'}</div>
                        <div className="text-xs text-muted-foreground">{(it as any).product_code || ''}</div>
                      </div>
                      <div className="col-span-2 text-right">{(it as any).ordered_qty}</div>
                      <div className="col-span-2 text-right">{(it as any).received_qty}</div>
                      <div className="col-span-2 text-right">{remain}</div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min={0}
                          max={remain}
                          value={receiveLines[it.item_id] ?? 0}
                          onChange={(e) => {
                            let val = parseInt(e.target.value) || 0;
                            if (val > remain) val = remain;
                            setReceiveLines(prev => ({ ...prev, [it.item_id]: val }));
                          }}
                          className="h-8 text-right"
                        />
                      </div>
                      {/* Tạm ẩn batch/expiry cho đến khi DB ready */}
                      {/* 
                      <div className="col-span-2">
                        <Input
                          placeholder="Số lô"
                          value={batchLines[it.item_id] ?? ''}
                          onChange={(e) => setBatchLines(prev => ({ ...prev, [it.item_id]: e.target.value }))}
                          className="h-8"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="date"
                          value={expiryLines[it.item_id] ?? ''}
                          onChange={(e) => setExpiryLines(prev => ({ ...prev, [it.item_id]: e.target.value }))}
                          className="h-8"
                        />
                      </div>
                      */}
                    </div>
                  );
                })}
              </div>
            )}
            {selectedOrder && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span>Tiến độ: {progressPercent(selectedOrder)}%</span>
                <Progress value={progressPercent(selectedOrder)} className="h-1 w-40" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setReceiveDialog(false)} disabled={receiving}>Đóng</Button>
            <Button onClick={handleReceiveSubmit} disabled={receiving}>{receiving ? 'Đang nhận...' : 'Xác nhận nhận hàng'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editInboundDialog} onOpenChange={setEditInboundDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa đơn hàng {selectedOrder?.inbound_code}</DialogTitle>
            <DialogDescription>
              Chỉ có thể chỉnh sửa đơn chưa hoàn thành. Các sản phẩm đã nhận sẽ không bị xóa.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editExpectedDate">Ngày dự kiến nhận</Label>
                <Input
                  id="editExpectedDate"
                  type="date"
                  value={newInboundForm.expected_date}
                  onChange={(e) => setNewInboundForm(prev => ({ ...prev, expected_date: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editNotes">Ghi chú đơn hàng</Label>
                <Input
                  id="editNotes"
                  placeholder="Ghi chú về đơn hàng"
                  value={newInboundForm.notes}
                  onChange={(e) => setNewInboundForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>

            {/* Products */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Danh sách sản phẩm (chỉ sửa được sản phẩm chưa nhận)</h3>
                <Button type="button" variant="outline" onClick={addProductToForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Thêm sản phẩm
                </Button>
              </div>

              {newInboundForm.items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Chưa có sản phẩm nào. Nhấn nút Thêm sản phẩm để bắt đầu.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {newInboundForm.items.map((item, index) => {
                    const product = products.find(p => p.product_id === item.product_id);
                    return (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end p-4 border rounded-lg">
                        <div className="col-span-4">
                          <Label>Sản phẩm *</Label>
                          <SearchableCombobox
                            items={products}
                            value={products.find(p => p.product_id === item.product_id)}
                            onValueChange={(product) => updateProductInForm(index, 'product_id', product ? product.product_id : 0)}
                            getItemId={(product) => product.product_id.toString()}
                            getItemLabel={(product) => `${product.product_name} (${product.product_code}) - Tồn: ${product.current_stock} ${product.unit}`}
                            placeholder="Tìm sản phẩm..."
                          />
                        </div>

                        <div className="col-span-2">
                          <Label>Số lượng *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateProductInForm(index, 'quantity', parseInt(e.target.value) || 1)}
                          />
                        </div>

                        <div className="col-span-2">
                          <Label>Đơn giá *</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.unit_cost}
                            onChange={(e) => updateProductInForm(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                          />
                        </div>

                        <div className="col-span-2">
                          <Label>Thành tiền</Label>
                          <div className="h-10 flex items-center text-sm font-medium">
                            {formatCurrency(item.quantity * item.unit_cost)}
                          </div>
                        </div>

                        <div className="col-span-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeProductFromForm(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {product && (
                          <div className="col-span-12 text-xs text-muted-foreground">
                            Tồn kho hiện tại: {product.current_stock} {product.unit} • 
                            Giá gốc: {formatCurrency(product.cost_price)}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Total */}
                  <div className="flex justify-end">
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Tổng giá trị đơn hàng:</div>
                      <div className="text-lg font-bold">
                        {formatCurrency(newInboundForm.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditInboundDialog(false)}>
                Hủy
              </Button>
              <Button onClick={handleEditSubmit}>
                Cập nhật đơn hàng
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      {printDialog && selectedOrder && (
        <div className="fixed inset-0 bg-white z-50">
          <PrintInbound 
            order={selectedOrder} 
            items={orderItems}
            onClose={() => setPrintDialog(false)}
          />
        </div>
      )}
    </div>
  );
}
