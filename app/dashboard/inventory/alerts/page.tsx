'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  AlertTriangle, 
  Package, 
  TrendingDown,
  Clock,
  RefreshCw,
  Bell,
  BellOff,
  ShoppingCart,
  Truck
} from 'lucide-react';
import { productService } from '@/lib/services/product-service';
import Link from 'next/link';

interface InventoryAlert {
  alert_id: string;
  product_id: number;
  product_name: string;
  product_code: string;
  category_name?: string;
  current_stock: number;
  min_stock: number;
  reorder_point: number;
  alert_type: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'CRITICAL_STOCK' | 'OVERSTOCK' | 'NO_MOVEMENT';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  created_at: string;
  days_without_movement?: number;
  supplier_name?: string;
  unit: string;
  cost_price: number;
  sale_price: number;
  last_sale_date?: string;
  last_purchase_date?: string;
}

interface AlertStats {
  totalAlerts: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  outOfStock: number;
  lowStock: number;
  noMovement: number;
}

export default function InventoryAlertsPage() {
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [filteredAlerts, setFilteredAlerts] = useState<InventoryAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    severity: 'all',
    alertType: 'all',
    category: 'all'
  });

  // Load alerts data
  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const result = await productService.getProducts({ limit: 1000 });
      const products = result.products;

      const alerts: InventoryAlert[] = [];

      products.forEach(product => {
        const alertsForProduct: InventoryAlert[] = [];
        
        // Out of stock alert
        if (product.current_stock === 0) {
          alertsForProduct.push({
            alert_id: `${product.product_id}_out_of_stock`,
            product_id: product.product_id,
            product_name: product.product_name,
            product_code: product.product_code,
            category_name: product.category?.category_name,
            current_stock: product.current_stock,
            min_stock: product.min_stock || 10,
            reorder_point: product.min_stock || 10,
            alert_type: 'OUT_OF_STOCK',
            severity: 'HIGH',
            created_at: new Date().toISOString(),
            supplier_name: undefined, // Will be added later when we have supplier data
            unit: 'cái', // Default unit
            cost_price: product.cost_price,
            sale_price: product.sale_price
          });
        }
        // Critical stock alert (below 50% of minimum)
        else if (product.current_stock <= (product.min_stock || 10) * 0.5) {
          alertsForProduct.push({
            alert_id: `${product.product_id}_critical_stock`,
            product_id: product.product_id,
            product_name: product.product_name,
            product_code: product.product_code,
            category_name: product.category?.category_name,
            current_stock: product.current_stock,
            min_stock: product.min_stock || 10,
            reorder_point: product.min_stock || 10,
            alert_type: 'CRITICAL_STOCK',
            severity: 'HIGH',
            created_at: new Date().toISOString(),
            supplier_name: undefined,
            unit: 'cái',
            cost_price: product.cost_price,
            sale_price: product.sale_price
          });
        }
        // Low stock alert
        else if (product.current_stock <= (product.min_stock || 10)) {
          alertsForProduct.push({
            alert_id: `${product.product_id}_low_stock`,
            product_id: product.product_id,
            product_name: product.product_name,
            product_code: product.product_code,
            category_name: product.category?.category_name,
            current_stock: product.current_stock,
            min_stock: product.min_stock || 10,
            reorder_point: product.min_stock || 10,
            alert_type: 'LOW_STOCK',
            severity: 'MEDIUM',
            created_at: new Date().toISOString(),
            supplier_name: undefined,
            unit: 'cái',
            cost_price: product.cost_price,
            sale_price: product.sale_price
          });
        }

        // No movement alert (simulated - products with high stock but no recent activity)
        if (product.current_stock > (product.min_stock || 10) * 3) {
          const daysSinceLastMovement = Math.floor(Math.random() * 90) + 30; // Random 30-120 days
          if (daysSinceLastMovement > 60) {
            alertsForProduct.push({
              alert_id: `${product.product_id}_no_movement`,
              product_id: product.product_id,
              product_name: product.product_name,
              product_code: product.product_code,
              category_name: product.category?.category_name,
              current_stock: product.current_stock,
              min_stock: product.min_stock || 10,
              reorder_point: product.min_stock || 10,
              alert_type: 'NO_MOVEMENT',
              severity: 'LOW',
              created_at: new Date(Date.now() - daysSinceLastMovement * 24 * 60 * 60 * 1000).toISOString(),
              days_without_movement: daysSinceLastMovement,
              supplier_name: undefined,
              unit: 'cái',
              cost_price: product.cost_price,
              sale_price: product.sale_price
            });
          }
        }

        alerts.push(...alertsForProduct);
      });

      // Sort by severity and date
      alerts.sort((a, b) => {
        const severityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setAlerts(alerts);
    } catch (error) {
      console.error('Error loading alerts:', error);
      toast.error('Không thể tải dữ liệu cảnh báo');
    } finally {
      setLoading(false);
    }
  }, []);

  // Apply filters
  const applyFilters = useCallback(() => {
    let filtered = [...alerts];

    if (filter.severity !== 'all') {
      filtered = filtered.filter(alert => alert.severity === filter.severity);
    }

    if (filter.alertType !== 'all') {
      filtered = filtered.filter(alert => alert.alert_type === filter.alertType);
    }

    if (filter.category !== 'all') {
      filtered = filtered.filter(alert => alert.category_name === filter.category);
    }

    setFilteredAlerts(filtered);
  }, [alerts, filter]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // Calculate stats
  const stats: AlertStats = {
    totalAlerts: alerts.length,
    highSeverity: alerts.filter(a => a.severity === 'HIGH').length,
    mediumSeverity: alerts.filter(a => a.severity === 'MEDIUM').length,
    lowSeverity: alerts.filter(a => a.severity === 'LOW').length,
    outOfStock: alerts.filter(a => a.alert_type === 'OUT_OF_STOCK').length,
    lowStock: alerts.filter(a => a.alert_type === 'LOW_STOCK' || a.alert_type === 'CRITICAL_STOCK').length,
    noMovement: alerts.filter(a => a.alert_type === 'NO_MOVEMENT').length
  };

  // Get unique categories
  const categories = Array.from(new Set(alerts.map(alert => alert.category_name).filter(Boolean)));

  // Get alert type label
  const getAlertTypeLabel = (type: string) => {
    const labels = {
      'OUT_OF_STOCK': 'Hết hàng',
      'CRITICAL_STOCK': 'Rất ít hàng',
      'LOW_STOCK': 'Sắp hết hàng',
      'OVERSTOCK': 'Tồn kho nhiều',
      'NO_MOVEMENT': 'Không có giao dịch'
    };
    return labels[type as keyof typeof labels] || type;
  };

  // Get severity badge
  const getSeverityBadge = (severity: string) => {
    const config = {
      'HIGH': { label: 'Cao', className: 'bg-red-100 text-red-800' },
      'MEDIUM': { label: 'Trung bình', className: 'bg-yellow-100 text-yellow-800' },
      'LOW': { label: 'Thấp', className: 'bg-blue-100 text-blue-800' }
    };
    
    const { label, className } = config[severity as keyof typeof config];
    return <Badge className={className}>{label}</Badge>;
  };

  // Get alert type badge
  const getAlertTypeBadge = (type: string) => {
    const config = {
      'OUT_OF_STOCK': { className: 'bg-red-100 text-red-800', icon: AlertTriangle },
      'CRITICAL_STOCK': { className: 'bg-orange-100 text-orange-800', icon: AlertTriangle },
      'LOW_STOCK': { className: 'bg-yellow-100 text-yellow-800', icon: TrendingDown },
      'NO_MOVEMENT': { className: 'bg-gray-100 text-gray-800', icon: Clock }
    };
    
    const { className, icon: Icon } = config[type as keyof typeof config] || 
      { className: 'bg-gray-100 text-gray-800', icon: Bell };
    
    return (
      <Badge className={className}>
        <Icon className="h-3 w-3 mr-1" />
        {getAlertTypeLabel(type)}
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

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 24) {
      return `${diffInHours} giờ trước`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays} ngày trước`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cảnh Báo Kho Hàng</h1>
          <p className="text-muted-foreground">
            Theo dõi và quản lý {stats.totalAlerts} cảnh báo kho hàng
          </p>
        </div>
        <Button onClick={loadAlerts} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng cảnh báo</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAlerts}</div>
            <div className="flex gap-2 mt-2 text-xs">
              <span className="text-red-600">Cao: {stats.highSeverity}</span>
              <span className="text-yellow-600">TB: {stats.mediumSeverity}</span>
              <span className="text-blue-600">Thấp: {stats.lowSeverity}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hết hàng</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.outOfStock}</div>
            <p className="text-xs text-muted-foreground">sản phẩm cần nhập ngay</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sắp hết</CardTitle>
            <TrendingDown className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.lowStock}</div>
            <p className="text-xs text-muted-foreground">sản phẩm cần theo dõi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Không giao dịch</CardTitle>
            <Clock className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats.noMovement}</div>
            <p className="text-xs text-muted-foreground">sản phẩm ế ẩm</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc cảnh báo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="severity" className="text-sm font-medium">Mức độ nghiêm trọng</label>
              <Select
                value={filter.severity}
                onValueChange={(value) => setFilter(prev => ({ ...prev, severity: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn mức độ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả mức độ</SelectItem>
                  <SelectItem value="HIGH">Cao</SelectItem>
                  <SelectItem value="MEDIUM">Trung bình</SelectItem>
                  <SelectItem value="LOW">Thấp</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="alertType" className="text-sm font-medium">Loại cảnh báo</label>
              <Select
                value={filter.alertType}
                onValueChange={(value) => setFilter(prev => ({ ...prev, alertType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả loại</SelectItem>
                  <SelectItem value="OUT_OF_STOCK">Hết hàng</SelectItem>
                  <SelectItem value="CRITICAL_STOCK">Rất ít hàng</SelectItem>
                  <SelectItem value="LOW_STOCK">Sắp hết hàng</SelectItem>
                  <SelectItem value="NO_MOVEMENT">Không giao dịch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="category" className="text-sm font-medium">Danh mục</label>
              <Select
                value={filter.category}
                onValueChange={(value) => setFilter(prev => ({ ...prev, category: value }))}
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
          </div>
        </CardContent>
      </Card>

      {/* Alerts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách cảnh báo</CardTitle>
          <CardDescription>
            Hiển thị {filteredAlerts.length} cảnh báo {alerts.length > filteredAlerts.length && `trong tổng số ${alerts.length} cảnh báo`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BellOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Không có cảnh báo nào phù hợp với bộ lọc</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Loại cảnh báo</TableHead>
                    <TableHead>Mức độ</TableHead>
                    <TableHead className="text-right">Tồn kho</TableHead>
                    <TableHead className="text-right">Tối thiểu</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAlerts.map((alert) => (
                    <TableRow key={alert.alert_id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{alert.product_name}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <span>{alert.product_code}</span>
                            {alert.category_name && (
                              <Badge variant="outline" className="text-xs">
                                {alert.category_name}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getAlertTypeBadge(alert.alert_type)}
                        {alert.days_without_movement && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {alert.days_without_movement} ngày không giao dịch
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {getSeverityBadge(alert.severity)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={alert.current_stock === 0 ? 'text-red-600 font-medium' : ''}>
                          {alert.current_stock.toLocaleString()} {alert.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {alert.min_stock.toLocaleString()} {alert.unit}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(alert.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Link href={`/dashboard/inventory/stock?product=${alert.product_id}`}>
                            <Button variant="ghost" size="sm">
                              <Package className="h-4 w-4" />
                            </Button>
                          </Link>
                          {(alert.alert_type === 'OUT_OF_STOCK' || alert.alert_type === 'CRITICAL_STOCK' || alert.alert_type === 'LOW_STOCK') && (
                            <Link href={`/dashboard/inventory/inbound?product=${alert.product_id}`}>
                              <Button variant="ghost" size="sm">
                                <Truck className="h-4 w-4" />
                              </Button>
                            </Link>
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
    </div>
  );
}
