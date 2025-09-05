'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Calculator, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  Receipt,
  AlertTriangle,
  CheckCircle,
  ArrowLeft
} from 'lucide-react'
import type { Customer, POSMode } from '@/lib/types/pos'

// Helper function để format ngày theo định dạng Việt Nam dd/MM/yyyy
const formatDateVN = (dateString: string) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric'
  })
}

interface CheckoutPanelOptimizedProps {
  customer: Customer | null
  total: number
  posMode?: POSMode
  tempOrderData?: {
    expected_delivery_date: string
    notes?: string
  }
  onCheckout: (paymentData: {
    method: 'cash' | 'card' | 'transfer'
    paymentType: 'full' | 'partial' | 'debt'
    receivedAmount?: number
    partialAmount?: number
  }) => void
  onCancel: () => void
  loading?: boolean
}

export function CheckoutPanelOptimized({ 
  customer, 
  total, 
  posMode = 'normal',
  tempOrderData,
  onCheckout, 
  onCancel, 
  loading = false 
}: CheckoutPanelOptimizedProps) {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash')
  const [paymentType, setPaymentType] = useState<'full' | 'partial' | 'debt'>('full')
  const [receivedAmount, setReceivedAmount] = useState('')
  const [partialAmount, setPartialAmount] = useState('')

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  const receivedValue = receivedAmount ? parseFloat(receivedAmount) : 0
  const change = Math.max(0, receivedValue - total)
  const isInsufficientCash = paymentMethod === 'cash' && paymentType === 'full' && receivedValue < total
  
  // Simple debt check - only warning if exceeds limit
  const newDebt = customer ? customer.current_debt + total : 0
  const exceedsCreditLimit = customer && customer.debt_limit > 0 ? newDebt > customer.debt_limit : false

  const canProceed = customer && (() => {
    // Với temp order thì luôn có thể proceed (không cần thanh toán)
    if (posMode === 'temp_order') {
      return true
    }
    
    switch (paymentType) {
      case 'full':
        return paymentMethod !== 'cash' || receivedValue >= total
      case 'partial':
        const partialValue = parseFloat(partialAmount) || 0
        return partialValue > 0 && partialValue <= total
      case 'debt':
        return true
      default:
        return false
    }
  })()

  const handleCheckout = () => {
    if (!canProceed) return

    const partialValue = partialAmount ? parseFloat(partialAmount) : 0

    onCheckout({
      method: paymentMethod,
      paymentType,
      receivedAmount: paymentMethod === 'cash' ? receivedValue : total,
      partialAmount: paymentType === 'partial' ? partialValue : undefined
    })
  }

  // Quick amount buttons - compact
  const quickAmounts = [
    { label: 'Vừa đủ', value: total },
    { label: '+50K', value: total + 50000 },
    { label: '+100K', value: total + 100000 }
  ]

  return (
    <Card className="supabase-card">
      {/* Compact Header */}
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {posMode === 'temp_order' ? (
              <>
                <Receipt className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium">Tạo Phiếu Tạm</span>
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  Phiếu tạm
                </Badge>
              </>
            ) : (
              <>
                <Receipt className="h-4 w-4 text-brand" />
                <span className="text-sm font-medium">Thanh toán</span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-6 w-6 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Temp Order Info */}
        {posMode === 'temp_order' && tempOrderData && (
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Thông tin phiếu tạm</span>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-amber-700">Ngày xuất dự kiến:</span>
                <div className="font-medium text-amber-900">
                  {formatDateVN(tempOrderData.expected_delivery_date)}
                </div>
              </div>
              {tempOrderData.notes && (
                <div>
                  <span className="text-amber-700">Ghi chú:</span>
                  <div className="font-medium text-amber-900">{tempOrderData.notes}</div>
                </div>
              )}
              <div className="text-xs text-amber-600 mt-2 p-2 bg-amber-100 rounded">
                ⚠️ Phiếu tạm không trừ kho ngay và không cần thanh toán
              </div>
            </div>
          </div>
        )}

        {/* Customer Info - Compact */}
        {customer && (
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground truncate">
                {customer.customer_name}
              </span>
              {exceedsCreditLimit && posMode === 'normal' && (
                <Badge variant="destructive" className="text-xs px-2 py-1">
                  Vượt HM
                </Badge>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Công nợ:</span>
                <div className="font-medium text-foreground">
                  {formatPrice(customer.current_debt)}
                </div>
              </div>
              {posMode === 'normal' && (
                <div>
                  <span className="text-muted-foreground">Sau giao dịch:</span>
                  <div className={`font-medium ${exceedsCreditLimit ? 'text-red-600' : 'text-foreground'}`}>
                    {formatPrice(newDebt)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Total - Prominent */}
        <div className={`rounded-lg p-3 border ${posMode === 'temp_order' ? 'bg-amber-50 border-amber-200' : 'bg-brand/10 border-brand/20'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm ${posMode === 'temp_order' ? 'text-amber-700' : 'text-brand'}`}>
              {posMode === 'temp_order' ? 'Tổng giá trị phiếu tạm:' : 'Tổng thanh toán:'}
            </span>
            <span className={`text-lg font-bold ${posMode === 'temp_order' ? 'text-amber-800' : 'text-brand'}`}>
              {formatPrice(total)}
            </span>
          </div>
        </div>

        {/* Payment Options - Only for normal invoices */}
        {posMode === 'normal' && (
          <>
            {/* Payment Method - Dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Phương thức</label>
              <Select value={paymentMethod} onValueChange={(value: 'cash' | 'card' | 'transfer') => setPaymentMethod(value)}>
                <SelectTrigger className="supabase-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4" />
                      Tiền mặt
                    </div>
                  </SelectItem>
                  <SelectItem value="card">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Thẻ
                    </div>
                  </SelectItem>
                  <SelectItem value="transfer">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Chuyển khoản
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Type - Dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Hình thức</label>
              <Select value={paymentType} onValueChange={(value: 'full' | 'partial' | 'debt') => setPaymentType(value)}>
                <SelectTrigger className="supabase-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Thanh toán đủ</div>
                        <div className="text-xs text-muted-foreground">Toàn bộ {formatPrice(total)}</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="partial">
                    <div className="flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Thanh toán một phần</div>
                        <div className="text-xs text-muted-foreground">Trả một phần, còn lại ghi nợ</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="debt">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Ghi nợ toàn bộ</div>
                        <div className="text-xs text-muted-foreground">Thanh toán sau</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Partial Payment Input */}
            {paymentType === 'partial' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Số tiền trả</label>
                <Input
                  type="number"
                  placeholder="Nhập số tiền..."
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  className="supabase-input"
                />
                <div className="text-xs text-muted-foreground">
                  Còn lại: {formatPrice(total - (parseFloat(partialAmount) || 0))}
                </div>
                <div className="text-xs text-muted-foreground">
                  Tổng công nợ: {formatPrice((customer?.current_debt || 0) + (total - (parseFloat(partialAmount) || 0)))}
                </div>
              </div>
            )}

            {/* Cash Payment Details - Compact */}
            {paymentMethod === 'cash' && paymentType === 'full' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Khách trả</label>
                  <Input
                    type="number"
                    placeholder="Nhập số tiền..."
                    value={receivedAmount}
                    onChange={(e) => setReceivedAmount(e.target.value)}
                    className={`supabase-input ${
                      isInsufficientCash ? 'border-destructive' : ''
                    }`}
                  />
                  {isInsufficientCash && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Thiếu {formatPrice(total - receivedValue)}
                    </p>
                  )}
                </div>

                {/* Quick Amount Buttons - Inline */}
                <div className="grid grid-cols-3 gap-2">
                  {quickAmounts.map((amount) => (
                    <Button
                      key={amount.label}
                      variant="outline"
                      size="sm"
                      onClick={() => setReceivedAmount(amount.value.toString())}
                      className="text-xs py-1 h-7"
                    >
                      {amount.label}
                    </Button>
                  ))}
                </div>

                {/* Change - Compact */}
                {receivedAmount && receivedValue >= total && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-700 dark:text-green-300">Tiền thừa:</span>
                      <span className="text-sm font-bold text-green-700 dark:text-green-300">
                        {formatPrice(change)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Warnings - Compact */}
        {exceedsCreditLimit && posMode === 'normal' && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-2">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
              <AlertTriangle className="h-3 w-3" />
              <span className="text-xs">
                Vượt hạn mức {formatPrice(newDebt - (customer?.debt_limit || 0))}
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons - Compact */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="h-9 text-sm"
          >
            Hủy
          </Button>
          <Button
            onClick={handleCheckout}
            disabled={!canProceed || loading}
            className={`h-9 text-sm disabled:opacity-50 ${
              posMode === 'temp_order' 
                ? 'bg-amber-500 hover:bg-amber-600 text-white' 
                : 'bg-brand hover:bg-brand/90 text-brand-foreground'
            }`}
          >
            {loading ? (
              <div className="flex items-center gap-1">
                <div className="animate-spin h-3 w-3 border-2 border-white/30 border-t-white rounded-full" />
                Xử lý...
              </div>
            ) : (
              posMode === 'temp_order' ? 'Tạo phiếu tạm' : 'Hoàn tất'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
