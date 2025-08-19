'use client';

import { useState, useEffect } from 'react';
import { Plus, ArrowLeft, Package, Search, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CreateReturnDialog } from '@/components/inventory/create-return-dialog';
import { ProcessReturnDialog } from '@/components/inventory/process-return-dialog';
import returnService, { ReturnOrderSummary } from '@/lib/services/return-service';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';

const statusColors = {
  PENDING: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
  PROCESSED: 'bg-green-100 text-green-800 hover:bg-green-200', 
  CANCELLED: 'bg-red-100 text-red-800 hover:bg-red-200'
};

const statusLabels = {
  PENDING: 'Chờ xử lý',
  PROCESSED: 'Đã xử lý',
  CANCELLED: 'Đã hủy'
};

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnOrderSummary[]>([]);
  const [filteredReturns, setFilteredReturns] = useState<ReturnOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [processReturn, setProcessReturn] = useState<ReturnOrderSummary | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    loadReturns();
  }, []);

  useEffect(() => {
    if (!searchTerm) {
      setFilteredReturns(returns);
    } else {
      const filtered = returns.filter(ret => 
        ret.return_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ret.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ret.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ret.inbound_code?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredReturns(filtered);
    }
  }, [returns, searchTerm]);

  const loadReturns = async () => {
    try {
      setLoading(true);
      const data = await returnService.listReturns();
      setReturns(data);
    } catch (error) {
      console.error('Error loading returns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReturn = () => {
    setShowCreateDialog(false);
    loadReturns();
  };

  const handleProcessReturn = (returnOrder: ReturnOrderSummary) => {
    setProcessReturn(returnOrder);
  };

  const handleReturnProcessed = () => {
    setProcessReturn(null);
    loadReturns();
  };

  const handleCancelReturn = async (return_id: string) => {
    if (!confirm('Bạn có chắc muốn hủy phiếu trả hàng này?')) return;
    
    try {
      await returnService.cancelReturn(return_id);
      loadReturns();
    } catch (error) {
      console.error('Error cancelling return:', error);
      alert('Lỗi khi hủy phiếu trả hàng');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="h-6 w-6" />
            Trả Hàng
          </h1>
          <p className="text-sm text-muted-foreground">
            Quản lý phiếu trả hàng cho nhà cung cấp
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-2 mb-6">
        <Button variant="outline" asChild size="sm">
          <Link href="/dashboard/inventory">
            <Package className="h-4 w-4 mr-1" />
            Tồn Kho
          </Link>
        </Button>
        <Button variant="outline" asChild size="sm">
          <Link href="/dashboard/inventory/inbound">
            Nhập Kho
          </Link>
        </Button>
        <Button variant="outline" asChild size="sm">
          <Link href="/dashboard/inventory/movements">
            Xuất Nhập
          </Link>
        </Button>
        <Button variant="secondary" size="sm">
          <RotateCcw className="h-4 w-4 mr-1" />
          Trả Hàng
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Danh sách phiếu trả hàng</CardTitle>
              <CardDescription>
                Tổng cộng {filteredReturns.length} phiếu trả hàng
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Tạo Phiếu Trả
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Tìm theo mã phiếu, nhà cung cấp, lý do trả..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Returns Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã Phiếu</TableHead>
                  <TableHead>Nhà Cung Cấp</TableHead>
                  <TableHead>Phiếu Nhập</TableHead>
                  <TableHead>Lý Do</TableHead>
                  <TableHead>Số Lượng</TableHead>
                  <TableHead>Tổng Tiền</TableHead>
                  <TableHead>Trạng Thái</TableHead>
                  <TableHead>Ngày Tạo</TableHead>
                  <TableHead>Thao Tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? 'Không tìm thấy phiếu trả nào' : 'Chưa có phiếu trả hàng nào'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReturns.map((returnOrder) => (
                    <TableRow key={returnOrder.return_id}>
                      <TableCell className="font-medium">
                        {returnOrder.return_code}
                      </TableCell>
                      <TableCell>
                        {returnOrder.supplier_name || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {returnOrder.inbound_code || '-'}
                      </TableCell>
                      <TableCell className="max-w-40 truncate">
                        {returnOrder.reason}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {returnOrder.total_quantity} items
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(returnOrder.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[returnOrder.status]}>
                          {statusLabels[returnOrder.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatDate(returnOrder.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {returnOrder.status === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleProcessReturn(returnOrder)}
                              >
                                Xử lý
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleCancelReturn(returnOrder.return_id)}
                              >
                                Hủy
                              </Button>
                            </>
                          )}
                          {returnOrder.status === 'PROCESSED' && (
                            <Badge variant="outline" className="text-green-600">
                              Đã hoàn tất
                            </Badge>
                          )}
                          {returnOrder.status === 'CANCELLED' && (
                            <Badge variant="outline" className="text-red-600">
                              Đã hủy
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateReturnDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={handleCreateReturn}
      />

      {processReturn && (
        <ProcessReturnDialog
          returnOrder={processReturn}
          onClose={() => setProcessReturn(null)}
          onSuccess={handleReturnProcessed}
        />
      )}
    </div>
  );
}
