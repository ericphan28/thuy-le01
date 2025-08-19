'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowLeft,
  Receipt,
  User,
  Calendar,
  MapPin,
  Phone,
  DollarSign,
  Package,
  AlertTriangle,
  FileText,
  Printer,
  Edit,
  CreditCard,
  Building2,
  CheckCircle,
  Clock
} from 'lucide-react'
import { toast } from 'sonner'
import { CanvasVietnamesePDF } from '@/components/invoice/canvas-vietnamese-pdf'
import type { 
  InvoiceFullData,
  InvoiceHeader
} from '@/lib/types/invoice'
import {
  formatPrice,
  formatDate,
  getStatusBadge,
  getPaymentStatusBadge,
  calculateInvoiceTotals,
  validateInvoiceData
} from '@/lib/utils/invoice'

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [invoiceData, setInvoiceData] = useState<InvoiceFullData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const invoiceId = params?.id

  const fetchInvoiceData = useCallback(async () => {
    if (!invoiceId) return

    try {
      setLoading(true)
      setError(null)

      // Fetch invoice header with customer info
      const { data: headerData, error: headerError } = await supabase
        .from('invoices')
        .select(`
          *,
          customers!fk_invoices_customer_id (
            customer_id,
            customer_code,
            customer_name,
            phone,
            email,
            address,
            current_debt,
            debt_limit
          )
        `)
        .eq('invoice_id', invoiceId)
        .single()

      if (headerError) {
        if (headerError.code === 'PGRST116') {
          setError('Không tìm thấy hóa đơn')
        } else {
          setError(`Lỗi tải hóa đơn: ${headerError.message}`)
        }
        return
      }

      // Fetch invoice details
      const { data: detailsData, error: detailsError } = await supabase
        .from('invoice_details')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('detail_id')

      if (detailsError) {
        console.error('Error fetching invoice details:', detailsError)
        setError(`Lỗi tải chi tiết hóa đơn: ${detailsError.message}`)
        return
      }

      // Transform customer data - handle array vs object
      const customerData = Array.isArray(headerData.customers) 
        ? headerData.customers[0] || null
        : headerData.customers

      setInvoiceData({
        header: headerData as InvoiceHeader,
        details: detailsData || [],
        customer: customerData
      })

    } catch (error) {
      console.error('Unexpected error:', error)
      setError('Đã xảy ra lỗi không mong muốn')
    } finally {
      setLoading(false)
    }
  }, [invoiceId, supabase])

  useEffect(() => {
    fetchInvoiceData()
  }, [fetchInvoiceData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600 dark:text-gray-400">Đang tải chi tiết hóa đơn...</span>
      </div>
    )
  }

  if (error || !invoiceData) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => router.back()}
            className="bg-white dark:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quay lại
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Chi tiết Hóa đơn</h1>
        </div>
        
        <Card className="supabase-card p-6">
          <div className="flex items-center space-x-4">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <div>
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">Có lỗi xảy ra</h3>
              <p className="text-red-600 dark:text-red-400">{error || 'Không thể tải dữ liệu hóa đơn'}</p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const { header, details, customer } = invoiceData
  
  // Helper functions using utility functions
  const statusBadge = getStatusBadge(header.status)
  const paymentBadge = getPaymentStatusBadge(header.total_amount, header.customer_paid)
  const totals = calculateInvoiceTotals(header, details)
  const validation = validateInvoiceData(header, details)

  // Show validation warnings if any
  if (validation.warnings.length > 0) {
    console.warn('Invoice validation warnings:', validation.warnings)
  }

  // Helper function to get status icon
  const getStatusIcon = () => {
    switch (header.status.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-blue-600" />
      case 'pending':
        return <Clock className="h-5 w-5 text-blue-600" />
      default:
        return <AlertTriangle className="h-5 w-5 text-blue-600" />
    }
  }

  // Helper function to get payment icon
  const getPaymentIcon = () => {
    const remaining = header.total_amount - header.customer_paid
    if (remaining <= 0) {
      return <CheckCircle className="h-5 w-5 text-green-600" />
    } else if (header.customer_paid > 0) {
      return <Clock className="h-5 w-5 text-green-600" />
    } else {
      return <AlertTriangle className="h-5 w-5 text-green-600" />
    }
  }

  // Handle HTML invoice view (không auto print)
  const handleViewHTML = () => {
    const url = `/print/invoice/${invoiceId}?compact=1`
    window.open(url, '_blank', 'width=800,height=900,scrollbars=yes')
  }

  // Handle print function (mở trang in giống nút Print ngoài danh sách)
  const handlePrint = async () => {
    const url = `/print/invoice/${invoiceId}?auto=1&compact=1`
    window.open(url, '_blank', 'width=800,height=900,scrollbars=yes')
  }

  // Handle browser print (HTML print)
  const handleBrowserPrint = () => {
    // Add print-specific content before printing
    const printContent = document.querySelector('.print-content')
    if (printContent) {
      // Add print header dynamically
      const printHeader = document.querySelector('.print-header')
      if (printHeader) {
        printHeader.classList.remove('hidden')
      }
      
      window.print()
      
      // Hide print header after printing
      if (printHeader) {
        printHeader.classList.add('hidden')
      }
    } else {
      window.print()
    }
  }

  return (
    <div className="space-y-6 print-content">
      {/* Print Header - chỉ hiện khi in */}
      <div className="hidden print:block print-header">
        <div className="print-company-name">XUÂN THÙY VETERINARY PHARMACY</div>
        <div className="text-sm">Địa chỉ: [Địa chỉ công ty] | Điện thoại: [SĐT] | MST: [MST]</div>
        <div className="print-invoice-title">HÓA ĐƠN BÁN HÀNG</div>
      </div>

      {/* Header with navigation */}
      <div className="flex flex-col gap-4 print-hide">
        {/* Navigation & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.back()}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay lại
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Hóa đơn {header.invoice_code}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Chi tiết hóa đơn bán hàng
              </p>
            </div>
          </div>
        </div>
        
        {/* Action Buttons - Logic Layout */}
        <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-gray-200 dark:border-gray-700">
          {/* Primary Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="bg-white dark:bg-gray-800">
              <Edit className="h-4 w-4 mr-1.5" />
              Sửa
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              className="bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800"
              onClick={handleViewHTML}
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Xem hóa đơn (HTML)
            </Button>
          </div>
          
          {/* PDF Export */}
          <div className="border-l border-gray-200 dark:border-gray-700 pl-3">
            <CanvasVietnamesePDF 
              invoiceData={invoiceData}
            />
          </div>
        </div>
      </div>

      {/* Compact Status Bar */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border print-hide">
        {/* Status */}
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Trạng thái:</span>
          <Badge className={`${statusBadge.color} border-0 text-xs`}>
            {statusBadge.label}
          </Badge>
        </div>
        
        {/* Payment Status */}
        <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-600 pl-4">
          {getPaymentIcon()}
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Thanh toán:</span>
          {paymentBadge && (
            <Badge className={`${paymentBadge.color} border-0 text-xs`}>
              {paymentBadge.label}
            </Badge>
          )}
        </div>
        
        {/* Quick Info */}
        <div className="flex items-center gap-4 ml-auto text-sm text-gray-600 dark:text-gray-400">
          <span><Calendar className="h-4 w-4 inline mr-1" />{formatDate(header.invoice_date)}</span>
          <span><Package className="h-4 w-4 inline mr-1" />{details.length} items</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            <DollarSign className="h-4 w-4 inline mr-1" />{formatPrice(header.total_amount)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Header Info */}
          <Card className="supabase-card">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                Thông tin Hóa đơn
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Mã hóa đơn</label>
                  <p className="font-semibold text-lg">{header.invoice_code}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Ngày tạo</label>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <p className="font-medium">{formatDate(header.invoice_date)}</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Chi nhánh</label>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <p className="font-medium">Chi nhánh {header.branch_id}</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Số items</label>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-400" />
                    <p className="font-medium">{details.length} sản phẩm</p>
                  </div>
                </div>
              </div>
              
              {header.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Ghi chú</label>
                  <div className="flex items-start gap-2 mt-1">
                    <FileText className="h-4 w-4 text-gray-400 mt-0.5" />
                    <p className="text-gray-800 dark:text-gray-200">{header.notes}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer Information */}
          {customer && (
            <Card className="supabase-card">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-blue-600" />
                  Thông tin Khách hàng
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Tên khách hàng</label>
                    <p className="font-semibold text-lg">{customer.customer_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Mã khách hàng</label>
                    <p className="font-medium">{customer.customer_code || 'Chưa có'}</p>
                  </div>
                  {customer.phone && (
                    <div>
                      <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Số điện thoại</label>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <p className="font-medium">{customer.phone}</p>
                      </div>
                    </div>
                  )}
                  {customer.email && (
                    <div>
                      <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Email</label>
                      <p className="font-medium">{customer.email}</p>
                    </div>
                  )}
                </div>
                
                {customer.address && (
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Địa chỉ</label>
                    <div className="flex items-start gap-2 mt-1">
                      <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                      <p className="text-gray-800 dark:text-gray-200">{customer.address}</p>
                    </div>
                  </div>
                )}

                {/* Debt Information */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Công nợ hiện tại:</span>
                      <p className="font-semibold text-red-600 dark:text-red-400">
                        {formatPrice(customer.current_debt)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Hạn mức tín dụng:</span>
                      <p className="font-semibold text-green-600 dark:text-green-400">
                        {formatPrice(customer.debt_limit)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invoice Items */}
          <Card className="supabase-card">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                Chi tiết Sản phẩm ({details.length} items)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {details.map((item, index) => (
                  <div key={item.detail_id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                              {index + 1}
                            </span>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 dark:text-white">
                              {item.product_name}
                            </h4>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {item.product_code}
                              </Badge>
                              {item.brand && (
                                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                  {item.brand}
                                </Badge>
                              )}
                              {item.unit && (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                  {item.unit}
                                </Badge>
                              )}
                            </div>
                            {item.product_notes && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {item.product_notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="sm:text-right space-y-1">
                        <div className="flex sm:flex-col gap-2 sm:gap-1 text-sm">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-600 dark:text-gray-400">SL:</span>
                            <span className="font-medium">{item.quantity}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-600 dark:text-gray-400">Đơn giá:</span>
                            <span className="font-medium">{formatPrice(item.unit_price)}</span>
                          </div>
                          {item.discount_amount > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-600 dark:text-gray-400">Giảm:</span>
                              <span className="font-medium text-red-600 dark:text-red-400">
                                -{formatPrice(item.discount_amount)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-green-600 dark:text-green-400">
                            {formatPrice(item.line_total)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Financial Summary */}
        <div className="space-y-6">
          {/* Financial Summary */}
          <Card className="supabase-card">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                Tổng kết Tài chính
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {totals && (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Tạm tính:</span>
                      <span className="font-medium">{formatPrice(totals.subtotal)}</span>
                    </div>
                    
                    {header.discount_value > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Giảm giá ({header.discount_type === 'percentage' ? `${header.discount_value}%` : 'Số tiền'}):
                        </span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          -{formatPrice(totals.discountFromHeader)}
                        </span>
                      </div>
                    )}
                    
                    {header.vat_rate > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">VAT ({header.vat_rate}%):</span>
                        <span className="font-medium">{formatPrice(totals.vatAmount)}</span>
                      </div>
                    )}
                    
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                      <div className="flex justify-between">
                        <span className="font-semibold text-lg">Tổng cộng:</span>
                        <span className="font-bold text-xl text-green-600 dark:text-green-400">
                          {formatPrice(totals.totalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Đã thanh toán:</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {formatPrice(totals.paidAmount)}
                      </span>
                    </div>
                    
                    {totals.remainingAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Còn lại:</span>
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {formatPrice(totals.remainingAmount)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Payment Actions */}
                  {totals.remainingAmount > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <Button 
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => toast.info('Chức năng thu tiền sẽ được phát triển')}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Thu tiền còn lại
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="supabase-card">
            <CardHeader className="pb-4">
              <CardTitle>Thao tác nhanh</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Canvas PDF is now in the main header */}
              {/* Bỏ mục Xem HTML trong Thao tác nhanh theo yêu cầu */}
              <Button 
                variant="outline" 
                className="w-full justify-start bg-white dark:bg-gray-800"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4 mr-2" />
                In hóa đơn
              </Button>
              {/* Trình duyệt in trực tiếp (tùy chọn) */}
              {/*
              <Button 
                variant="outline" 
                className="w-full justify-start bg-white dark:bg-gray-800"
                onClick={handleBrowserPrint}
              >
                <Printer className="h-4 w-4 mr-2" />
                In hóa đơn (trình duyệt)
              </Button>
              */}
              <Button 
                variant="outline" 
                className="w-full justify-start bg-white dark:bg-gray-800"
                onClick={() => toast.info('Chức năng sửa hóa đơn sẽ được phát triển')}
              >
                <Edit className="h-4 w-4 mr-2" />
                Chỉnh sửa
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start bg-white dark:bg-gray-800"
                onClick={() => router.push('/dashboard/invoices')}
              >
                <Receipt className="h-4 w-4 mr-2" />
                Xem tất cả hóa đơn
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
