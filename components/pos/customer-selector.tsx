'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

    <Card className="supabase-card">
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg text-foreground">
            <div className="p-1.5 bg-brand rounded-lg">
              <Users className="h-4 w-4 text-primary-foreground" />
            </div>
            Khách Hàng
          </span>
          {selectedCustomer && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearCustomer}
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
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
            <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-xl border border-border">
              <Avatar className="h-12 w-12 border-2 border-brand/30">
                <AvatarFallback className="bg-brand text-primary-foreground font-semibold">
                  {selectedCustomer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-lg mb-1">
                  {selectedCustomer.customer_name}
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    <span className="font-mono">{selectedCustomer.customer_code}</span>
                  </div>
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{selectedCustomer.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Credit Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-muted/30 p-4 rounded-xl border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Công nợ hiện tại</span>
                </div>
                <p className="text-xl font-bold text-destructive">
                  {formatCurrency(selectedCustomer.current_debt)}
                </p>
              </div>

              <div className="bg-muted/30 p-4 rounded-xl border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Hạn mức tín dụng</span>
                </div>
                <p className="text-xl font-bold text-brand">
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
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Tìm khách hàng theo tên, mã hoặc số điện thoại..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => setIsExpanded(true)}
                className="supabase-input pl-10"
              />
            </div>

            {/* Customer Results */}
            {isExpanded && searchTerm && (
              <div className="max-h-64 overflow-y-auto space-y-2 bg-card rounded-xl p-2 border border-border shadow-supabase">
                {customers.length > 0 ? (
                  customers.map((customer) => (
                    <div
                      key={customer.customer_id}
                      onClick={() => {
                        onSelectCustomer(customer)
                        setIsExpanded(false)
                      }}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-border"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-brand text-white text-xs">
                          {customer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">
                          {customer.customer_name}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="font-mono">{customer.customer_code}</span>
                          {customer.phone && <span>{customer.phone}</span>}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Nợ</p>
                        <p className="text-sm font-medium text-destructive">
                          {formatCurrency(customer.current_debt)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Không tìm thấy khách hàng</p>
                  </div>
                )}
              </div>
            )}

            {!searchTerm && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium text-foreground">Chọn khách hàng</p>
                <p className="text-sm">Tìm kiếm và chọn khách hàng để tiếp tục</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
