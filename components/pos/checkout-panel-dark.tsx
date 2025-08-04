import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    receivedAmount?: number
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
  
  const handleCheckout = () => {
    if (paymentMethod === 'cash' && (isInsufficientCash || receivedValue === 0)) {
      return
    }
    
    onCheckout({
      method: paymentMethod,
      receivedAmount: paymentMethod === 'cash' ? receivedValue : total
    })
  }

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
    <Card className="border border-slate-700/50 shadow-2xl bg-slate-800/90 backdrop-blur-xl sticky top-4">
      <CardHeader className="pb-3 border-b border-slate-700/50">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg text-white">
            <div className="p-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg">
              <Receipt className="h-4 w-4 text-white" />
            </div>
            Thanh Toán
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-slate-400 hover:text-white hover:bg-slate-700/50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* Customer Info */}
        {customer && (
          <div className="p-4 bg-slate-700/30 rounded-xl border border-slate-600/30 space-y-3">
            <h3 className="font-semibold text-white">Khách hàng</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-300">{customer.customer_name}</span>
                <span className="text-xs text-slate-400 font-mono">{customer.customer_code}</span>
              </div>
              {customer.phone && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">SĐT:</span>
                  <span className="text-slate-300">{customer.phone}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Công nợ:</span>
                <span className="text-red-400 font-medium">{formatPrice(customer.current_debt)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Order Total */}
        <div className="bg-slate-700/20 p-4 rounded-xl border border-slate-600/30">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Tổng thanh toán</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            {formatPrice(total)}
          </p>
        </div>

        {/* Payment Methods */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-300">Phương thức thanh toán</h3>
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
                      ? `${method.bgColor} ${method.borderColor} ${method.textColor}`
                      : 'bg-slate-700/20 border-slate-600/30 text-slate-400 hover:bg-slate-700/30 hover:border-slate-600/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      isSelected 
                        ? `bg-gradient-to-r ${method.color}` 
                        : 'bg-slate-600/30'
                    }`}>
                      <Icon className="h-4 w-4 text-white" />
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

        {/* Cash Payment Input */}
        {paymentMethod === 'cash' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Khách trả</label>
              <Input
                type="number"
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(e.target.value)}
                placeholder="Nhập số tiền khách trả..."
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20"
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Số tiền nhanh</label>
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map((amount) => (
                  <Button
                    key={amount.label}
                    variant="outline"
                    size="sm"
                    onClick={() => setReceivedAmount(amount.value.toString())}
                    className="border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700 hover:text-white text-xs py-2"
                  >
                    {amount.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Change Display */}
            {receivedValue > 0 && (
              <div className={`p-3 rounded-xl border ${
                receivedValue >= total
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {receivedValue >= total ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  <span className="text-xs font-medium">
                    {receivedValue >= total ? 'Tiền thừa:' : 'Thiếu:'}
                  </span>
                </div>
                <p className="text-lg font-bold">
                  {receivedValue >= total 
                    ? formatPrice(change)
                    : formatPrice(total - receivedValue)
                  }
                </p>
              </div>
            )}
          </div>
        )}

        {/* Checkout Button */}
        <Button
          onClick={handleCheckout}
          disabled={loading || isInsufficientCash}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-4 shadow-lg hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-700 disabled:shadow-none"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Đang xử lý...
            </div>
          ) : (
            <>
              <CheckCircle className="w-5 h-5 mr-2" />
              Hoàn tất thanh toán
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
