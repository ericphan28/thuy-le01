'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import type { Customer } from '@/lib/types/pos'

interface CheckoutPanelProps {
  customer: Customer | null
  total: number
  onCheckout: (paymentData: {
    method: 'cash' | 'card' | 'transfer'
    paymentType: 'full' | 'partial' | 'debt'
    receivedAmount?: number
    partialAmount?: number
  }) => void
  onCancel: () => void
  loading?: boolean
}

export function CheckoutPanel({ customer, total, onCheckout, onCancel, loading = false }: CheckoutPanelProps) {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash')
  const [receivedAmount, setReceivedAmount] = useState('')

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  const receivedValue = receivedAmount ? parseFloat(receivedAmount) : 0
  const change = Math.max(0, receivedValue - total)
  const isInsufficientCash = paymentMethod === 'cash' && receivedValue < total
  
  // Credit check - Warning instead of blocking
  const newDebt = customer ? customer.current_debt + total : 0
  const exceedsCreditLimit = customer ? newDebt > customer.debt_limit : false
  const creditUtilization = customer && customer.debt_limit > 0 
    ? (newDebt / customer.debt_limit) * 100 
    : 0

  // Payment type options
  const [paymentType, setPaymentType] = useState<'full' | 'partial' | 'debt'>('full')
  const [partialAmount, setPartialAmount] = useState('')

  // Allow checkout with warnings instead of blocking
  const canProceed = customer && (() => {
    switch (paymentType) {
      case 'full':
        return paymentMethod !== 'cash' || receivedValue >= total
      case 'partial':
        const partialValue = parseFloat(partialAmount) || 0
        return partialValue > 0 && partialValue <= total
      case 'debt':
        return true // Always allow debt transactions
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

  // Quick amount buttons for cash
  const quickAmounts = [
    { label: 'Vừa đủ', value: total },
    { label: 'Tròn trăm', value: Math.ceil(total / 100) * 100 },
    { label: 'Tròn nghìn', value: Math.ceil(total / 1000) * 1000 }
  ]

  const paymentMethods = [
    {
      id: 'cash' as const,
      label: 'Tiền mặt',
      icon: Banknote,
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-500/20',
      textColor: 'text-green-400',
      borderColor: 'border-green-500/30'
    },
    {
      id: 'card' as const,
      label: 'Thẻ',
      icon: CreditCard,
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-500/20',
      textColor: 'text-blue-400',
      borderColor: 'border-blue-500/30'
    },
    {
      id: 'transfer' as const,
      label: 'Chuyển khoản',
      icon: Smartphone,
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-500/20',
      textColor: 'text-purple-400',
      borderColor: 'border-purple-500/30'
    }
  ]

  return (
    <Card className="supabase-card sticky top-4">
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg text-foreground">
            <div className="p-1.5 bg-brand rounded-lg">
              <Receipt className="h-4 w-4 text-primary-foreground" />
            </div>
            Thanh Toán
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="supabase-button-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* Customer Info */}
        {customer && (
          <div className="supabase-product-card p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-medium text-foreground">{customer.customer_name}</span>
              {exceedsCreditLimit ? (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Vượt hạn mức
                </Badge>
              ) : (
                <Badge variant="default" className="flex items-center gap-1 bg-brand/10 text-brand border-brand/20">
                  <CheckCircle className="h-3 w-3" />
                  Hợp lệ
                </Badge>
              )}
            </div>
            
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Công nợ hiện tại:</span>
                <span className="text-foreground">{formatPrice(customer.current_debt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sau giao dịch:</span>
                <span className={exceedsCreditLimit ? 'text-destructive font-medium' : 'text-foreground'}>
                  {formatPrice(newDebt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hạn mức:</span>
                <span className="text-brand">{formatPrice(customer.debt_limit)}</span>
              </div>
              
              {/* Credit utilization bar */}
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Sử dụng hạn mức</span>
                  <span className="text-foreground">{creditUtilization.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      creditUtilization > 100 
                        ? 'bg-destructive' 
                        : creditUtilization >= 90 
                        ? 'bg-orange-500' 
                        : creditUtilization >= 70 
                        ? 'bg-yellow-500' 
                        : 'bg-brand'
                    }`}
                    style={{ width: `${Math.min(100, creditUtilization)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment Total */}
        <div className="bg-muted p-4 rounded-xl border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Tổng thanh toán</span>
          </div>
          <p className="text-2xl font-bold text-brand">
            {formatPrice(total)}
          </p>
        </div>

        {/* Payment Methods */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Phương thức thanh toán</h3>
          <div className="grid grid-cols-1 gap-2">
            {paymentMethods.map((method) => {
              const Icon = method.icon
              const isSelected = paymentMethod === method.id
              
              return (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className={`w-full p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                    isSelected
                      ? 'bg-brand/10 border-brand text-brand'
                      : 'bg-muted border-border text-muted-foreground hover:bg-muted/80 hover:border-border/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      isSelected 
                        ? 'bg-brand' 
                        : 'bg-muted'
                    }`}>
                      <Icon className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <span className="font-medium">{method.label}</span>
                    {isSelected && (
                      <CheckCircle className="h-4 w-4 ml-auto" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Payment Type Options */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Hình thức thanh toán</h3>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setPaymentType('full')}
              className={`w-full p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                paymentType === 'full'
                  ? 'bg-brand/10 border-brand text-brand'
                  : 'bg-muted border-border text-muted-foreground hover:bg-muted/80 hover:border-border/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  paymentType === 'full' ? 'bg-brand' : 'bg-muted'
                }`}>
                  <CheckCircle className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <span className="font-medium">Thanh toán đủ</span>
                  <p className="text-xs opacity-70">Thanh toán toàn bộ {formatPrice(total)}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setPaymentType('partial')}
              className={`w-full p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                paymentType === 'partial'
                  ? 'bg-brand/10 border-brand text-brand'
                  : 'bg-muted border-border text-muted-foreground hover:bg-muted/80 hover:border-border/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  paymentType === 'partial' ? 'bg-brand' : 'bg-muted'
                }`}>
                  <Calculator className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <span className="font-medium">Thanh toán một phần</span>
                  <p className="text-xs opacity-70">Trả một phần, còn lại ghi nợ</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setPaymentType('debt')}
              className={`w-full p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                paymentType === 'debt'
                  ? 'bg-brand/10 border-brand text-brand'
                  : 'bg-muted border-border text-muted-foreground hover:bg-muted/80 hover:border-border/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  paymentType === 'debt' ? 'bg-brand' : 'bg-muted'
                }`}>
                  <CreditCard className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <span className="font-medium">Ghi nợ toàn bộ</span>
                  <p className="text-xs opacity-70">Ghi nợ toàn bộ, thanh toán sau</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Partial Payment Input */}
        {paymentType === 'partial' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Số tiền thanh toán</label>
              <Input
                type="number"
                placeholder="Nhập số tiền thanh toán..."
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                className="supabase-input"
              />
              <div className="text-xs text-muted-foreground">
                Còn lại ghi nợ: {formatPrice(total - (parseFloat(partialAmount) || 0))}
              </div>
              <div className="text-xs text-muted-foreground">
                Tổng công nợ: {formatPrice((customer?.current_debt || 0) + (total - (parseFloat(partialAmount) || 0)))}
              </div>
            </div>
          </div>
        )}

        {/* Cash Payment Details */}
        {paymentMethod === 'cash' && paymentType === 'full' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Khách trả</label>
              <Input
                type="number"
                placeholder="Nhập số tiền khách trả..."
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(e.target.value)}
                className={`supabase-input ${
                  isInsufficientCash ? 'border-destructive focus:border-destructive' : ''
                }`}
              />
              {isInsufficientCash && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3" />
                  Số tiền không đủ. Cần thêm {formatPrice(total - receivedValue)}
                </p>
              )}
            </div>

            {/* Quick Amount Buttons */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Số tiền nhanh</label>
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map((amount) => (
                  <Button
                    key={amount.label}
                    variant="outline"
                    size="sm"
                    onClick={() => setReceivedAmount(amount.value.toString())}
                    className="supabase-button-secondary text-xs py-2"
                  >
                    {amount.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Change Calculation */}
            {receivedAmount && receivedValue >= total && (
              <div className="p-3 bg-brand/10 rounded-xl border border-brand/20">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-3 w-3 text-brand" />
                  <span className="text-sm font-medium text-brand">Tiền thừa:</span>
                </div>
                <p className="text-lg font-bold text-brand">
                  {formatPrice(change)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Warning Messages */}
        {exceedsCreditLimit && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <div className="flex items-center gap-2 text-orange-700 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                Cảnh báo: Vượt hạn mức tín dụng
              </span>
            </div>
            <div className="text-xs text-orange-600 space-y-1">
              <p>• Hạn mức hiện tại: {formatPrice(customer?.debt_limit || 0)}</p>
              <p>• Công nợ sau giao dịch: {formatPrice(newDebt)}</p>
              <p>• Vượt: {formatPrice(newDebt - (customer?.debt_limit || 0))}</p>
              <p className="mt-2 font-medium">Giao dịch vẫn có thể được thực hiện với thông báo này.</p>
            </div>
          </div>
        )}

        {paymentType === 'partial' && partialAmount && parseFloat(partialAmount) >= total && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-2 text-blue-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">
                Số tiền thanh toán {'>'}= tổng hóa đơn. Chuyển sang &quot;Thanh toán đủ&quot;?
              </span>
            </div>
          </div>
        )}

        {paymentType === 'debt' && (
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
            <div className="flex items-center gap-2 text-purple-700">
              <CreditCard className="h-4 w-4" />
              <span className="text-sm">
                Toàn bộ {formatPrice(total)} sẽ được ghi vào công nợ của khách hàng.
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-4">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="supabase-button-secondary"
          >
            Hủy
          </Button>
          <Button
            onClick={handleCheckout}
            disabled={!canProceed || loading}
            className="supabase-button disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                Đang xử lý...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Hoàn tất ({formatPrice(total)})
              </div>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
