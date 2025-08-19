'use client';

import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import returnService, { CreateReturnItemInput } from '@/lib/services/return-service';
import inboundService from '@/lib/services/inbound-service';
import { supplierService } from '@/lib/services/supplier-service';
import { productService } from '@/lib/services/product-service';

interface ReturnItem {
  product_id: number;
  quantity: number;
  unit_cost: number;
  reason: string;
  notes: string;
  // maximum quantity allowed to return (e.g., received quantity from inbound)
  max_qty?: number;
  // optional reference back to inbound item id if needed in the future
  inbound_item_id?: string;
}

interface CreateReturnDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateReturnDialog({ open, onClose, onSuccess }: CreateReturnDialogProps) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [inboundOrders, setInboundOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [returnReasons, setReturnReasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [supplierId, setSupplierId] = useState<number>(0);
  const [inboundId, setInboundId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<ReturnItem[]>([
    { product_id: 0, quantity: 1, unit_cost: 0, reason: '', notes: '' }
  ]);

  useEffect(() => {
    if (open) {
      loadInitialData();
    }
  }, [open]);

  const loadInitialData = async () => {
    try {
      const [suppliersData, reasonsData, productsData, inboundAll] = await Promise.all([
        supplierService.getSuppliers({ limit: 100 }),
        returnService.getReturnReasons(),
        productService.getProducts({ limit: 200 }),
        inboundService.listInbound()
      ]);
      
      console.log('Loaded suppliers:', suppliersData.suppliers);
      console.log('Loaded products:', productsData.products?.length);
      console.log('Loaded inbound (all):', inboundAll?.length);
      setSuppliers(suppliersData.suppliers || []);
      setReturnReasons(reasonsData);
      setProducts(productsData.products || []);

      // Only keep returnable inbound orders: RECEIVED and with received quantities
      const validOrders = (inboundAll || []).filter((order: any) =>
        order.status === 'RECEIVED' && (order.received_total_qty || 0) > 0
      );
      console.log('Valid inbound for return (any supplier):', validOrders.length);
      setInboundOrders(validOrders);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleSupplierChange = (supplierId: number) => {
    setSupplierId(supplierId);
    setInboundId(''); // Reset inbound when supplier changes
    // Keep the full inbound list; users can still pick an inbound and we'll auto-sync supplier
  };

  const handleInboundSelect = async (inboundId: string) => {
    try {
      const inboundItems = await inboundService.getItems(inboundId);
      // Pre-fill return items from inbound items
      const selectedOrder = inboundOrders.find(o => o.inbound_id === inboundId);
      const code = selectedOrder ? selectedOrder.inbound_code : inboundId;

      const returnItems = (inboundItems || [])
        .filter((item: any) => (item.received_qty || 0) > 0)
        .map((item: any) => ({
          product_id: item.product_id,
          quantity: item.received_qty, // default to full received to make it obvious; user can reduce
          unit_cost: item.unit_cost,
          reason: '',
          notes: `Từ phiếu nhập ${code}`,
          max_qty: item.received_qty,
          inbound_item_id: item.item_id || undefined
        }));
      
      setItems(returnItems);
    } catch (error) {
      console.error('Error loading inbound items:', error);
    }
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
  };

  const handleSubmit = async () => {
    // Basic validation
    if (supplierId === 0) {
      alert('Phải chọn nhà cung cấp');
      return;
    }
    if (!reason) {
      alert('Phải nhập lý do trả hàng');
      return;
    }
    if (items.length === 0 || items.every(item => item.product_id === 0)) {
      alert('Phải có ít nhất 1 sản phẩm');
      return;
    }

    try {
      setLoading(true);
      
      const validItems = items.filter(item => item.product_id > 0);
      
      await returnService.createReturn({
        supplier_id: supplierId,
        reason,
        created_by: 'system', // TODO: Use actual user
        items: validItems as CreateReturnItemInput[],
        inbound_id: inboundId || undefined,
        notes: notes || ''
      });

      // Reset form
      setSupplierId(0);
      setInboundId('');
      setReason('');
      setNotes('');
      setItems([{ product_id: 0, quantity: 1, unit_cost: 0, reason: '', notes: '' }]);
      
      onSuccess();
    } catch (error) {
      console.error('Error creating return:', error);
      alert('Lỗi khi tạo phiếu trả hàng');
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setItems([...items, { product_id: 0, quantity: 1, unit_cost: 0, reason: '', notes: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ReturnItem, value: any) => {
    const updatedItems = [...items];
    // Clamp quantity to [1, max_qty] if applicable
    if (field === 'quantity') {
      const max = updatedItems[index].max_qty;
      let q = Number(value) || 0;
      if (q < 1) q = 1;
      if (max && q > max) q = max;
      updatedItems[index] = { ...updatedItems[index], quantity: q };
      setItems(updatedItems);
      return;
    }
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setItems(updatedItems);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto [&>*]:relative [&>*]:z-10">
        <DialogHeader className="relative z-20">
          <DialogTitle>Tạo Phiếu Trả Hàng</DialogTitle>
          <DialogDescription>
            Tạo phiếu trả hàng cho nhà cung cấp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Return Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplier">Nhà cung cấp *</Label>
              <SearchableCombobox
                items={suppliers}
                value={suppliers.find(s => s.supplier_id === supplierId)}
                onValueChange={(supplier) => handleSupplierChange(supplier ? supplier.supplier_id : 0)}
                getItemId={(supplier) => supplier.supplier_id.toString()}
                getItemLabel={(supplier) => `${supplier.supplier_name} ${supplier.contact_phone ? '- ' + supplier.contact_phone : ''}`}
                placeholder="Tìm kiếm nhà cung cấp..."
              />
            </div>

            <div>
              <Label htmlFor="inbound">Phiếu nhập (tùy chọn)</Label>
              <SearchableCombobox
                items={inboundOrders}
                value={inboundOrders.find(order => order.inbound_id === inboundId)}
                onValueChange={(order) => {
                  const value = order ? order.inbound_id : '';
                  setInboundId(value);
                  if (order) {
                    // Auto-sync supplier based on the inbound order selected
                    setSupplierId(order.supplier_id);
                  }
                  if (value) handleInboundSelect(value);
                }}
                getItemId={(order) => order.inbound_id}
                getItemLabel={(order) => {
                  const date = order.received_date 
                    ? new Date(order.received_date).toLocaleDateString('vi-VN')
                    : new Date(order.expected_date || order.created_at).toLocaleDateString('vi-VN');
                  const itemCount = Math.floor(order.received_total_qty || 0);
                  const totalCost = order.total_cost ? (order.total_cost / 1000000).toFixed(1) + 'M' : '0';
                  const supplierName = order.supplier_name || '';
                  return `${order.inbound_code} - ${supplierName} - ${date} (${itemCount} SP, ${totalCost}đ)`;
                }}
                placeholder={inboundOrders.length === 0 ? "Chưa có phiếu nhập hợp lệ" : "Tìm kiếm phiếu nhập đã nhận (mọi NCC)..."}
                disabled={inboundOrders.length === 0}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="reason">Lý do trả hàng *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn lý do..." />
                </SelectTrigger>
                <SelectContent>
                  {returnReasons.map((reasonOption) => (
                    <SelectItem key={reasonOption.value} value={reasonOption.value}>
                      {reasonOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Ghi chú</Label>
              <Textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú thêm..." 
                className="resize-none" 
                rows={3} 
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Danh sách sản phẩm</h3>
              <Button type="button" onClick={addItem} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Thêm sản phẩm
              </Button>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm *</TableHead>
                    <TableHead className="w-24">Số lượng *</TableHead>
                    <TableHead className="w-32">Giá *</TableHead>
                    <TableHead>Lý do</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead className="w-24">Thành tiền</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="w-64">
                        <SearchableCombobox
                          items={products}
                          value={products.find(p => p.product_id === item.product_id)}
                          onValueChange={(product) => updateItem(index, 'product_id', product ? product.product_id : 0)}
                          getItemId={(product) => product.product_id.toString()}
                          getItemLabel={(product) => `${product.product_name} (${product.product_code}) - Tồn: ${product.current_stock || 0}`}
                          placeholder="Tìm kiếm sản phẩm..."
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          max={item.max_qty || undefined}
                          title={item.max_qty ? `Tối đa ${item.max_qty} theo phiếu nhập` : undefined}
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_cost}
                          onChange={(e) => updateItem(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          value={item.reason}
                          onChange={(e) => updateItem(index, 'reason', e.target.value)}
                          placeholder="Lý do cụ thể..." 
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          value={item.notes}
                          onChange={(e) => updateItem(index, 'notes', e.target.value)}
                          placeholder="Ghi chú..." 
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {(item.quantity * item.unit_cost).toLocaleString()}đ
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 text-right">
              <div className="text-lg font-semibold">
                Tổng tiền: <span className="text-red-600">{calculateTotal().toLocaleString()}đ</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Đang tạo...' : 'Tạo phiếu trả'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
