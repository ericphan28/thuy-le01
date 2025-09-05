"use client"

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  ArrowLeft,
  User, 
  Calendar,
  FileText,
  Package,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  Truck,
  Phone,
  MapPin,
  Clock,
  Eye,
  Edit,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { tempInvoiceService } from '@/lib/services/temp-invoice-service'
import type { TempInvoiceWithDetails, TempInvoiceConversion } from '@/lib/types/invoice'

export default function TempInvoiceDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = parseInt(params.id as string)

  const [invoice, setInvoice] = useState<TempInvoiceWithDetails | null>(null)
  const [priceComparison, setPriceComparison] = useState<TempInvoiceConversion | null>(null)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)

  // Fetch invoice details
  const fetchInvoiceDetails = async () => {
    try {
      setLoading(true)
      
      const [invoiceResult, priceResult] = await Promise.all([
        tempInvoiceService.getTempInvoiceDetails(invoiceId),
        tempInvoiceService.getPriceComparison(invoiceId)
      ])

      setInvoice(invoiceResult)
      setPriceComparison(priceResult)

    } catch (error) {
      console.error('Error fetching invoice details:', error)
      toast.error('Lỗi khi tải chi tiết phiếu tạm')
      router.push('/dashboard/invoices/temp')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (invoiceId) {
      fetchInvoiceDetails()
    }
  }, [invoiceId])

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

  const getDaysUntilDelivery = (deliveryDate: string) => {
    const today = new Date()
    const delivery = new Date(deliveryDate)
    const diffTime = delivery.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) {
      return `Quá hạn ${Math.abs(diffDays)} ngày`
    } else if (diffDays === 0) {
      return 'Hôm nay'
    } else if (diffDays === 1) {
      return 'Ngày mai'
    } else {
      return `Còn ${diffDays} ngày`
    }
  }

  const handleStatusUpdate = async (newStatus: 'temp_pending' | 'temp_confirmed' | 'temp_ready') => {
    try {
      await tempInvoiceService.updateTempInvoiceStatus(invoiceId, newStatus)
      toast.success('Đã cập nhật trạng thái phiếu tạm')
      fetchInvoiceDetails()
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('Lỗi khi cập nhật trạng thái')
    }
  }

  const handleConvertToInvoice = async () => {
    try {
      setConverting(true)
      const result = await tempInvoiceService.convertToInvoice(invoiceId, {
        actualDeliveryDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        paymentType: 'full',
        priceAdjustments: priceComparison?.price_comparisons.map(pc => ({
          product_id: pc.product_id,
          new_price: pc.current_price
        })) || []
      })
      
      toast.success(`Đã chuyển đổi thành hóa đơn thông thường: ${result.newInvoiceCode}`)
      router.push(`/dashboard/invoices/${result.newInvoiceId}`)
      
    } catch (error) {
      console.error('Error converting invoice:', error)
      toast.error('Lỗi khi chuyển đổi phiếu tạm')
    } finally {
      setConverting(false)
    }
  }

  const handleCancelInvoice = async () => {
    if (!confirm('Bạn có chắc chắn muốn hủy phiếu tạm này?')) {
      return
    }

    try {
      await tempInvoiceService.cancelTempInvoice(invoiceId, 'Hủy bởi người dùng')
      toast.success('Đã hủy phiếu tạm')
      router.push('/dashboard/invoices/temp')
    } catch (error) {
      console.error('Error cancelling invoice:', error)
      toast.error('Lỗi khi hủy phiếu tạm')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Không tìm thấy phiếu tạm</p>
        </div>
      </div>
    )
  }

  const hasPriceChanges = priceComparison && priceComparison.total_price_change !== 0

  return (
    <div className="min-h-screen bg-background">
      <div className="supabase-container pt-6">
        {/* Header */}
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/dashboard/invoices/temp')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quay lại
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Chi tiết Phiếu Tạm - {invoice.header.invoice_code}
              </h1>
              <div className="flex items-center gap-4">
                {getStatusBadge(invoice.header.status)}
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  <Calendar className="h-3 w-3 mr-1" />
                  {getDaysUntilDelivery(invoice.header.expected_delivery_date)}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Status Update Buttons */}
              {invoice.header.status === 'temp_pending' && (
                <Button 
                  onClick={() => handleStatusUpdate('temp_confirmed')}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Xác nhận
                </Button>
              )}
              
              {invoice.header.status === 'temp_confirmed' && (
                <Button 
                  onClick={() => handleStatusUpdate('temp_ready')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Sẵn sàng xuất
                </Button>
              )}

              {invoice.header.status === 'temp_ready' && (
                <Button 
                  onClick={handleConvertToInvoice}
                  disabled={converting}
                  className="bg-brand hover:bg-brand/90"
                >
                  {converting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Truck className="h-4 w-4 mr-2" />
                  )}
                  Xuất hàng
                </Button>
              )}

              <Button 
                variant="outline" 
                onClick={handleCancelInvoice}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Hủy
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Information */}
            <Card className="supabase-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Thông tin Khách hàng
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Tên khách hàng</label>
                    <p className="text-foreground font-medium">{invoice.header.customer_name}</p>
                  </div>
                  
                  {invoice.header.customer_phone && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Số điện thoại</label>
                      <p className="text-foreground flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        {invoice.header.customer_phone}
                      </p>
                    </div>
                  )}
                  
                  {invoice.header.customer_address && (
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Địa chỉ</label>
                      <p className="text-foreground flex items-start gap-1">
                        <MapPin className="h-4 w-4 mt-0.5" />
                        {invoice.header.customer_address}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Invoice Items */}
            <Card className="supabase-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Sản phẩm ({invoice.details.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead className="border-b border-border bg-muted/50">
                      <tr>
                        <th className="text-left p-4 font-medium text-muted-foreground">Sản phẩm</th>
                        <th className="text-center p-4 font-medium text-muted-foreground">SL</th>
                        <th className="text-right p-4 font-medium text-muted-foreground">Đơn giá</th>
                        <th className="text-right p-4 font-medium text-muted-foreground">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.details.map((item, index) => (
                        <tr key={index} className="hover:bg-muted/30">
                          <td className="p-4">
                            <div>
                              <p className="font-medium text-foreground">{item.product_name}</p>
                              <p className="text-sm text-muted-foreground">{item.product_code}</p>
                            </div>
                          </td>
                          <td className="text-center p-4 text-foreground">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="text-right p-4 text-foreground">
                            {formatPrice(item.unit_price)}
                          </td>
                          <td className="text-right p-4 font-medium text-foreground">
                            {formatPrice(item.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Price Comparison */}
            {hasPriceChanges && priceComparison && (
              <Card className="supabase-card border-amber-200 bg-amber-50/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="h-5 w-5" />
                    Thay đổi Giá
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg p-4 border border-amber-200">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <label className="font-medium text-muted-foreground">Giá ban đầu</label>
                          <p className="text-lg font-bold text-foreground">
                            {formatPrice(priceComparison.total_temp_amount)}
                          </p>
                        </div>
                        <div>
                          <label className="font-medium text-muted-foreground">Giá hiện tại</label>
                          <p className="text-lg font-bold text-foreground">
                            {formatPrice(priceComparison.total_current_amount)}
                          </p>
                        </div>
                      </div>
                      
                      <Separator className="my-3" />
                      
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-muted-foreground">Chênh lệch:</span>
                        <span className={`font-bold ${
                          priceComparison.total_price_change > 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {priceComparison.total_price_change > 0 ? '+' : ''}
                          {formatPrice(priceComparison.total_price_change)}
                        </span>
                      </div>
                    </div>

                    {priceComparison.price_comparisons.filter(pc => pc.price_change !== 0).length > 0 && (
                      <div>
                        <h4 className="font-medium text-amber-700 mb-2">Sản phẩm có thay đổi giá:</h4>
                        <div className="space-y-2">
                          {priceComparison.price_comparisons
                            .filter(pc => pc.price_change !== 0)
                            .map((item, index) => (
                              <div key={index} className="bg-white rounded p-3 border border-amber-200 text-sm">
                                <p className="font-medium text-foreground">{item.product_name}</p>
                                <div className="flex justify-between mt-1">
                                  <span className="text-muted-foreground">
                                    {formatPrice(item.temp_price)} → {formatPrice(item.current_price)}
                                  </span>
                                  <span className={`font-medium ${
                                    item.price_change > 0 ? 'text-red-600' : 'text-green-600'
                                  }`}>
                                    {item.price_change > 0 ? '+' : ''}{formatPrice(item.price_change)}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {invoice.header.notes && (
              <Card className="supabase-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Ghi chú
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground whitespace-pre-wrap">{invoice.header.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Summary */}
            <Card className="supabase-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Tổng kết
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tạm tính:</span>
                    <span className="text-foreground">{formatPrice(invoice.header.total_amount - invoice.header.vat_amount)}</span>
                  </div>
                  
                  {invoice.header.discount_value > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Giảm giá:</span>
                      <span className="text-red-600">-{formatPrice(invoice.header.discount_value)}</span>
                    </div>
                  )}
                  
                  {invoice.header.vat_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Thuế:</span>
                      <span className="text-foreground">{formatPrice(invoice.header.vat_amount)}</span>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div className="flex justify-between font-bold text-lg">
                    <span className="text-foreground">Tổng cộng:</span>
                    <span className="text-brand">{formatPrice(invoice.header.total_amount)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Delivery Info */}
            <Card className="supabase-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Thông tin Xuất hàng
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Ngày dự kiến</label>
                  <p className="text-foreground font-medium">
                    {new Date(invoice.header.expected_delivery_date).toLocaleDateString('vi-VN', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Còn lại</label>
                  <p className="text-foreground font-medium">
                    {getDaysUntilDelivery(invoice.header.expected_delivery_date)}
                  </p>
                </div>

                {invoice.header.actual_delivery_date && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Ngày thực tế</label>
                    <p className="text-foreground font-medium">
                      {new Date(invoice.header.actual_delivery_date).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card className="supabase-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Lịch sử
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-brand rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Tạo phiếu tạm</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(invoice.header.created_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>

                {invoice.header.status !== 'temp_pending' && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Xác nhận đơn hàng</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(invoice.header.updated_at).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>
                )}

                {invoice.header.status === 'temp_ready' && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Sẵn sàng xuất hàng</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(invoice.header.updated_at).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
