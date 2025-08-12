import type { 
  InvoiceHeader, 
  InvoiceDetail, 
  InvoiceCalculations,
  InvoiceStatus,
  PaymentStatus
} from '@/lib/types/invoice'
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle 
} from 'lucide-react'

/**
 * Format price in Vietnamese currency
 */
export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price)
}

/**
 * Format date in Vietnamese format
 */
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Format date for display (short format)
 */
export const formatDateShort = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('vi-VN')
}

/**
 * Get status badge configuration
 */
export const getStatusBadge = (status: string): InvoiceStatus => {
  switch (status.toLowerCase()) {
    case 'completed':
      return { 
        label: 'Hoàn thành', 
        color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        icon: CheckCircle 
      }
    case 'pending':
      return { 
        label: 'Chờ xử lý', 
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        icon: Clock 
      }
    case 'cancelled':
      return { 
        label: 'Đã hủy', 
        color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
        icon: AlertTriangle 
      }
    default:
      return { 
        label: 'Không xác định', 
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
        icon: AlertTriangle 
      }
  }
}

/**
 * Get payment status badge configuration
 */
export const getPaymentStatusBadge = (totalAmount: number, customerPaid: number): PaymentStatus => {
  const remaining = totalAmount - customerPaid
  
  if (remaining <= 0) {
    return {
      label: 'Đã thanh toán',
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      icon: CheckCircle
    }
  } else if (customerPaid > 0) {
    return {
      label: 'Thanh toán một phần',
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      icon: Clock
    }
  } else {
    return {
      label: 'Chưa thanh toán',
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      icon: AlertTriangle
    }
  }
}

/**
 * Calculate totals from invoice header and details
 */
export const calculateInvoiceTotals = (
  header: InvoiceHeader, 
  details: InvoiceDetail[]
): InvoiceCalculations => {
  // Calculate from details
  const subtotalFromDetails = details.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  const totalDiscountFromDetails = details.reduce((sum, item) => sum + (item.discount_amount || 0), 0)
  const netAmountFromDetails = subtotalFromDetails - totalDiscountFromDetails
  
  // From header
  const discountAmount = header.discount_type === 'percentage' 
    ? (subtotalFromDetails * header.discount_value) / 100
    : header.discount_value
  
  const afterDiscount = subtotalFromDetails - discountAmount
  const vatAmount = header.vat_amount || ((afterDiscount * header.vat_rate) / 100)
  const totalAmount = header.total_amount
  const remaining = totalAmount - header.customer_paid

  return {
    subtotal: subtotalFromDetails,
    discountFromDetails: totalDiscountFromDetails,
    discountFromHeader: discountAmount,
    vatAmount,
    totalAmount,
    paidAmount: header.customer_paid,
    remainingAmount: remaining,
    netFromDetails: netAmountFromDetails
  }
}

/**
 * Validate invoice data integrity
 */
export const validateInvoiceData = (header: InvoiceHeader, details: InvoiceDetail[]): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} => {
  const errors: string[] = []
  const warnings: string[] = []

  // Check if details exist
  if (!details || details.length === 0) {
    errors.push('Hóa đơn không có sản phẩm nào')
  }

  // Calculate totals
  const calculations = calculateInvoiceTotals(header, details)
  
  // Check total amount consistency (allow small rounding differences)
  const totalDifference = Math.abs(calculations.totalAmount - header.total_amount)
  if (totalDifference > 1) { // Allow 1 VND difference for rounding
    warnings.push(`Tổng tiền không khớp: Tính toán ${formatPrice(calculations.totalAmount)} vs Lưu trữ ${formatPrice(header.total_amount)}`)
  }

  // Check payment amount
  if (header.customer_paid < 0) {
    errors.push('Số tiền thanh toán không thể âm')
  }

  if (header.customer_paid > header.total_amount) {
    warnings.push('Số tiền thanh toán lớn hơn tổng tiền hóa đơn')
  }

  // Check VAT rate
  if (header.vat_rate < 0 || header.vat_rate > 100) {
    errors.push('Tỷ lệ VAT không hợp lệ')
  }

  // Check discount
  if (header.discount_value < 0) {
    errors.push('Giá trị giảm giá không thể âm')
  }

  if (header.discount_type === 'percentage' && header.discount_value > 100) {
    errors.push('Tỷ lệ giảm giá không thể lớn hơn 100%')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Generate invoice summary text
 */
export const generateInvoiceSummary = (header: InvoiceHeader, details: InvoiceDetail[]): string => {
  const itemCount = details.length
  const totalQuantity = details.reduce((sum, item) => sum + item.quantity, 0)
  const calculations = calculateInvoiceTotals(header, details)
  
  return `Hóa đơn ${header.invoice_code} - ${itemCount} sản phẩm (${totalQuantity} items) - ${formatPrice(calculations.totalAmount)}`
}

/**
 * Check if invoice is editable
 */
export const isInvoiceEditable = (header: InvoiceHeader): boolean => {
  // Only allow editing of pending invoices
  return header.status === 'pending'
}

/**
 * Check if invoice can be cancelled
 */
export const isInvoiceCancellable = (header: InvoiceHeader): boolean => {
  // Allow cancellation of pending invoices only
  return header.status === 'pending' && header.customer_paid === 0
}

/**
 * Get invoice age in days
 */
export const getInvoiceAge = (invoiceDate: string): number => {
  const date = new Date(invoiceDate)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - date.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * Get aging category for invoice
 */
export const getInvoiceAgingCategory = (invoiceDate: string): {
  category: 'current' | 'overdue_30' | 'overdue_60' | 'overdue_90'
  label: string
  color: string
} => {
  const age = getInvoiceAge(invoiceDate)
  
  if (age <= 30) {
    return {
      category: 'current',
      label: 'Hiện tại',
      color: 'text-green-600 dark:text-green-400'
    }
  } else if (age <= 60) {
    return {
      category: 'overdue_30',
      label: 'Quá hạn 30 ngày',
      color: 'text-yellow-600 dark:text-yellow-400'
    }
  } else if (age <= 90) {
    return {
      category: 'overdue_60',
      label: 'Quá hạn 60 ngày',
      color: 'text-orange-600 dark:text-orange-400'
    }
  } else {
    return {
      category: 'overdue_90',
      label: 'Quá hạn 90+ ngày',
      color: 'text-red-600 dark:text-red-400'
    }
  }
}
