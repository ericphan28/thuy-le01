'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { 
  Search, 
  User, 
  Phone, 
  CreditCard, 
  X,
  Users,
  AlertTriangle
} from 'lucide-react'
import type { Customer } from '@/lib/types/pos'

interface CustomerSelectorProps {
  customers: Customer[]
  selectedCustomer: Customer | null
  searchTerm: string
  onSearchChange: (term: string) => void
  onSelectCustomer: (customer: Customer) => void
  onClearCustomer: () => void
}

export function CustomerSelector({
  customers,
  selectedCustomer,
  searchTerm,
  onSearchChange,
  onSelectCustomer,
  onClearCustomer
}: CustomerSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }

  const getCreditStatus = (debt: number, limit: number) => {
    if (debt >= limit) return { label: 'Vượt hạn mức', color: 'destructive' as const }
    if (debt > limit * 0.8) return { label: 'Gần hạn mức', color: 'secondary' as const }
    return { label: 'Tín dụng tốt', color: 'default' as const }
  }

  return (
    <Card className="border border-slate-700/50 shadow-2xl bg-slate-800/90 backdrop-blur-xl">
      <CardHeader className="pb-3 border-b border-slate-700/50">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg text-white">
            <div className="p-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg">
              <Users className="h-4 w-4 text-white" />
            </div>
            Khách Hàng
          </span>
          {selectedCustomer && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearCustomer}
              className="text-slate-400 hover:text-white hover:bg-slate-700/50"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {selectedCustomer ? (
          <div className="space-y-4">
            {/* Selected Customer Info */}
            <div className="flex items-start gap-4 p-4 bg-slate-700/30 rounded-xl border border-slate-600/30">
              <Avatar className="h-12 w-12 border-2 border-cyan-500/30">
                <AvatarFallback className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold">
                  {selectedCustomer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white text-lg mb-1">
                  {selectedCustomer.customer_name}
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-mono">{selectedCustomer.customer_code}</span>
                  </div>
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span>{selectedCustomer.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Credit Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-700/20 p-4 rounded-xl border border-slate-600/30">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-300">Công nợ hiện tại</span>
                </div>
                <p className="text-xl font-bold text-red-400">
                  {formatCurrency(selectedCustomer.current_debt)}
                </p>
              </div>

              <div className="bg-slate-700/20 p-4 rounded-xl border border-slate-600/30">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-300">Hạn mức tín dụng</span>
                </div>
                <p className="text-xl font-bold text-emerald-400">
                  {formatCurrency(selectedCustomer.debt_limit)}
                </p>
              </div>
            </div>

            {/* Credit Status Badge */}
            <div className="flex justify-center">
              <Badge 
                variant={getCreditStatus(selectedCustomer.current_debt, selectedCustomer.debt_limit).color}
                className="text-sm px-4 py-2"
              >
                {getCreditStatus(selectedCustomer.current_debt, selectedCustomer.debt_limit).label}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Tìm khách hàng theo tên, mã hoặc số điện thoại..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => setIsExpanded(true)}
                className="pl-10 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-purple-500 focus:ring-purple-500/20"
              />
            </div>

            {/* Customer Results */}
            {isExpanded && searchTerm && (
              <div className="max-h-64 overflow-y-auto space-y-2 bg-slate-900/50 rounded-xl p-2 border border-slate-600/30">
                {customers.length > 0 ? (
                  customers.map((customer) => (
                    <div
                      key={customer.customer_id}
                      onClick={() => {
                        onSelectCustomer(customer)
                        setIsExpanded(false)
                      }}
                      className="flex items-center gap-3 p-3 hover:bg-slate-700/50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-600/30"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs">
                          {customer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm truncate">
                          {customer.customer_name}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <span className="font-mono">{customer.customer_code}</span>
                          {customer.phone && <span>{customer.phone}</span>}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Nợ</p>
                        <p className="text-sm font-medium text-red-400">
                          {formatCurrency(customer.current_debt)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Không tìm thấy khách hàng</p>
                  </div>
                )}
              </div>
            )}

            {!searchTerm && (
              <div className="text-center py-8 text-slate-400">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium text-slate-300">Chọn khách hàng</p>
                <p className="text-sm">Tìm kiếm và chọn khách hàng để tiếp tục</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
