'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Package, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import returnService, { ReturnOrderSummary } from '@/lib/services/return-service';

interface ProcessReturnDialogProps {
  returnOrder: ReturnOrderSummary;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProcessReturnDialog({ returnOrder, onClose, onSuccess }: ProcessReturnDialogProps) {
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(true);

  const loadReturnItems = useCallback(async () => {
    try {
      setLoadingItems(true);
      const items = await returnService.getReturnItems(returnOrder.return_id);
      setReturnItems(items);
    } catch (error) {
      console.error('Error loading return items:', error);
    } finally {
      setLoadingItems(false);
    }
  }, [returnOrder.return_id]);

  useEffect(() => {
    loadReturnItems();
  }, [loadReturnItems]);

  const handleProcess = async () => {
    try {
      setLoading(true);
      await returnService.processReturn(returnOrder.return_id, 'system'); // TODO: Use actual user
      onSuccess();
    } catch (error) {
      console.error('Error processing return:', error);
      alert('Lỗi khi xử lý phiếu trả hàng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Xử lý phiếu trả hàng {returnOrder.return_code}
          </DialogTitle>
          <DialogDescription>
            Xác nhận xử lý phiếu trả hàng cho {returnOrder.supplier_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Return Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Thông tin phiếu trả</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Mã phiếu:</span> {returnOrder.return_code}
                </div>
                <div>
                  <span className="font-medium">Nhà cung cấp:</span> {returnOrder.supplier_name}
                </div>
                <div>
                  <span className="font-medium">Lý do:</span> {returnOrder.reason}
                </div>
                <div>
                  <span className="font-medium">Ngày tạo:</span> {new Date(returnOrder.return_date).toLocaleDateString('vi-VN')}
                </div>
                <div>
                  <span className="font-medium">Phiếu nhập:</span> {returnOrder.inbound_code || 'Không có'}
                </div>
                <div>
                  <span className="font-medium">Tổng tiền:</span> <Badge variant="outline">{returnOrder.total_amount.toLocaleString()}đ</Badge>
                </div>
              </div>
              {returnOrder.notes && (
                <div className="pt-2 border-t">
                  <span className="font-medium">Ghi chú:</span>
                  <p className="text-sm text-muted-foreground mt-1">{returnOrder.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Return Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Danh sách sản phẩm trả ({returnItems.length} items)</CardTitle>
              <CardDescription>
                Các sản phẩm này sẽ được trừ khỏi tồn kho
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingItems ? (
                <div className="text-center py-4">Đang tải...</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mã sản phẩm</TableHead>
                        <TableHead>Tên sản phẩm</TableHead>
                        <TableHead>Số lượng</TableHead>
                        <TableHead>Đơn giá</TableHead>
                        <TableHead>Thành tiền</TableHead>
                        <TableHead>Lý do</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{item.product_code}</TableCell>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">{item.quantity}</Badge>
                          </TableCell>
                          <TableCell>{item.unit_cost.toLocaleString()}đ</TableCell>
                          <TableCell className="font-medium">
                            {(item.quantity * item.unit_cost).toLocaleString()}đ
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.reason || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Warning */}
          <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Lưu ý quan trọng:</p>
              <p>
                Khi xử lý phiếu trả hàng, tất cả sản phẩm sẽ được trừ khỏi tồn kho và tạo các phiếu xuất tương ứng. 
                Hành động này không thể hoàn tác.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button onClick={handleProcess} disabled={loading || loadingItems}>
            {loading ? 'Đang xử lý...' : 'Xác nhận xử lý'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
