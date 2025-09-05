"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Clock, 
  Calendar, 
  User, 
  FileText, 
  ChevronRight,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle,
  Package,
  Eye,
  RefreshCw,
  CalendarDays
} from 'lucide-react'
import { toast } from 'sonner'
import { tempInvoiceService } from '@/lib/services/temp-invoice-service'
import type { TempInvoiceListItem } from '@/lib/types/invoice'

export default function TempInvoicesPage() {
  const [tempInvoices, setTempInvoices] = useState<TempInvoiceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'temp_pending' | 'temp_confirmed' | 'temp_ready'>('all')
  const [deliveryDateFilter, setDeliveryDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'overdue'>('all')
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    confirmed: 0,
    ready: 0,
    overdue: 0,
    todayDeliveries: 0
  })

  // Fetch temp invoices
  const fetchTempInvoices = async () => {
    try {
      setLoading(true)
      
      // Build filters
      const filters: any = {}
      
      if (statusFilter !== 'all') {
        filters.status = statusFilter
      }

      if (deliveryDateFilter !== 'all') {
        const today = new Date()
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const weekFromNow = new Date(today)
        weekFromNow.setDate(weekFromNow.getDate() + 7)

        switch (deliveryDateFilter) {
          case 'today':
            filters.deliveryDateFrom = today.toISOString().split('T')[0]
            filters.deliveryDateTo = today.toISOString().split('T')[0]
            break
          case 'tomorrow':
            filters.deliveryDateFrom = tomorrow.toISOString().split('T')[0]
            filters.deliveryDateTo = tomorrow.toISOString().split('T')[0]
            break
          case 'week':
            filters.deliveryDateFrom = today.toISOString().split('T')[0]
            filters.deliveryDateTo = weekFromNow.toISOString().split('T')[0]
            break
          case 'overdue':
            const yesterday = new Date(today)
            yesterday.setDate(yesterday.getDate() - 1)
            filters.deliveryDateTo = yesterday.toISOString().split('T')[0]
            break
        }
      }

      if (searchTerm) {
        filters.search = searchTerm
      }

      const result = await tempInvoiceService.getTempInvoices(filters)
      setTempInvoices(result.data)

      // Fetch stats
      const statsResult = await tempInvoiceService.getTempInvoiceStats()
      setStats(statsResult)

    } catch (error) {
      console.error('Error fetching temp invoices:', error)
      toast.error('Lỗi khi tải danh sách phiếu tạm')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTempInvoices()
  }, [statusFilter, deliveryDateFilter, searchTerm])

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'temp_pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Chờ xác nhận</Badge>
      case 'temp_confirmed':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Đã xác nhận</Badge>
      case 'temp_ready':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Sẵn sàng xuất</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getDaysUntilDeliveryBadge = (days: number) => {
    if (days < 0) {
      return <Badge variant="destructive" className="text-xs">Quá hạn {Math.abs(days)} ngày</Badge>
    } else if (days === 0) {
      return <Badge variant="default" className="bg-orange-500 text-white text-xs">Hôm nay</Badge>
    } else if (days === 1) {
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Mai</Badge>
    } else {
      return <Badge variant="outline" className="text-xs">Còn {days} ngày</Badge>
    }
  }

  const handleStatusUpdate = async (invoiceId: number, newStatus: 'temp_pending' | 'temp_confirmed' | 'temp_ready') => {
    try {
      await tempInvoiceService.updateTempInvoiceStatus(invoiceId, newStatus)
      toast.success('Đã cập nhật trạng thái phiếu tạm')
      fetchTempInvoices()
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('Lỗi khi cập nhật trạng thái')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="supabase-container pt-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">Quản lý Phiếu Tạm</h1>
          <p className="text-muted-foreground">Quản lý các đơn hàng đặt trước và lịch xuất hàng</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <Card className="supabase-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tổng số</p>
                  <p className="text-lg font-bold text-foreground">{stats.total}</p>
                </div>
                <FileText className="h-8 w-8 text-brand/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="supabase-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Chờ xác nhận</p>
                  <p className="text-lg font-bold text-yellow-600">{stats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="supabase-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Đã xác nhận</p>
                  <p className="text-lg font-bold text-blue-600">{stats.confirmed}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-blue-500/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="supabase-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Sẵn sàng</p>
                  <p className="text-lg font-bold text-green-600">{stats.ready}</p>
                </div>
                <Package className="h-8 w-8 text-green-500/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="supabase-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Quá hạn</p>
                  <p className="text-lg font-bold text-red-600">{stats.overdue}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="supabase-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hôm nay</p>
                  <p className="text-lg font-bold text-orange-600">{stats.todayDeliveries}</p>
                </div>
                <CalendarDays className="h-8 w-8 text-orange-500/60" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="supabase-card mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm theo mã phiếu hoặc tên khách hàng..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="temp_pending">Chờ xác nhận</SelectItem>
                  <SelectItem value="temp_confirmed">Đã xác nhận</SelectItem>
                  <SelectItem value="temp_ready">Sẵn sàng xuất</SelectItem>
                </SelectContent>
              </Select>

              {/* Delivery Date Filter */}
              <Select value={deliveryDateFilter} onValueChange={(value: any) => setDeliveryDateFilter(value)}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Ngày xuất" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả ngày</SelectItem>
                  <SelectItem value="overdue">Quá hạn</SelectItem>
                  <SelectItem value="today">Hôm nay</SelectItem>
                  <SelectItem value="tomorrow">Ngày mai</SelectItem>
                  <SelectItem value="week">7 ngày tới</SelectItem>
                </SelectContent>
              </Select>

              {/* Refresh Button */}
              <Button variant="outline" onClick={fetchTempInvoices} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Temp Invoices List */}
        <Card className="supabase-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Danh sách Phiếu Tạm
              <Badge variant="secondary" className="ml-2">{tempInvoices.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full"></div>
              </div>
            ) : tempInvoices.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Không có phiếu tạm nào</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {tempInvoices.map((invoice) => (
                  <div key={invoice.invoice_id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-foreground">{invoice.invoice_code}</h3>
                          {getStatusBadge(invoice.status)}
                          {getDaysUntilDeliveryBadge(invoice.days_until_delivery)}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {invoice.customer_name}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Xuất: {new Date(invoice.expected_delivery_date).toLocaleDateString('vi-VN')}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-foreground">
                              {formatPrice(invoice.total_amount)}
                            </span>
                          </div>
                        </div>

                        {invoice.notes && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {invoice.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {/* Status Update Buttons */}
                        {invoice.status === 'temp_pending' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleStatusUpdate(invoice.invoice_id, 'temp_confirmed')}
                            className="text-xs"
                          >
                            Xác nhận
                          </Button>
                        )}
                        
                        {invoice.status === 'temp_confirmed' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleStatusUpdate(invoice.invoice_id, 'temp_ready')}
                            className="text-xs"
                          >
                            Sẵn sàng
                          </Button>
                        )}

                        {/* View Details Button */}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <Eye className="h-4 w-4" />
                        </Button>

                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
