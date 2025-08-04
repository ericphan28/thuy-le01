'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { 
  Search, 
  CreditCard, 
  X,
  Users,
  AlertTriangle,
  ChevronDown,
  ChevronUp
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
  const [showDetails, setShowDetails] = useState(false)

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
    <div className="relative bg-card rounded-xl border border-border p-3 shadow-sm">
      {selectedCustomer ? (
        <div className="space-y-3">
          {/* Ultra Compact Selected Customer - Single Line */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Avatar className="h-8 w-8 border border-brand/30">
                <AvatarFallback className="bg-brand text-white text-xs font-semibold">
                  {selectedCustomer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-foreground truncate">
                    {selectedCustomer.customer_name}
                  </h3>
                  <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
                    {selectedCustomer.customer_code}
                  </span>
                </div>
              </div>
              
              {/* Quick debt indicator */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Nợ:</span>
                <span className="text-sm font-bold text-destructive">
                  {formatCurrency(selectedCustomer.current_debt)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearCustomer}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Expandable Details - Only when clicked */}
          {showDetails && (
            <div className="space-y-3 animate-in slide-in-from-top-2 duration-200 pt-2 border-t border-border">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 p-2 rounded-lg">
                  <div className="flex items-center gap-1 mb-1">
                    <CreditCard className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Công nợ</span>
                  </div>
                  <p className="text-sm font-bold text-destructive">
                    {formatCurrency(selectedCustomer.current_debt)}
                  </p>
                </div>

                <div className="bg-muted/30 p-2 rounded-lg">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Hạn mức</span>
                  </div>
                  <p className="text-sm font-bold text-brand">
                    {formatCurrency(selectedCustomer.debt_limit)}
                  </p>
                </div>
              </div>

              <div className="flex justify-center">
                <Badge 
                  variant={getCreditStatus(selectedCustomer.current_debt, selectedCustomer.debt_limit).color}
                  className="text-xs px-2 py-1"
                >
                  {getCreditStatus(selectedCustomer.current_debt, selectedCustomer.debt_limit).label}
                </Badge>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Ultra Compact Search - Single Line */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Khách hàng:</span>
            </div>
            
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Tìm khách hàng..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => setIsExpanded(true)}
                onBlur={() => setTimeout(() => setIsExpanded(false), 200)}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/50 transition-colors"
              />
              
              {/* Compact Search Results - Dropdown Style */}
              {isExpanded && searchTerm && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {customers.length > 0 ? (
                    customers.map((customer) => (
                      <div
                        key={customer.customer_id}
                        onClick={() => {
                          onSelectCustomer(customer)
                          setIsExpanded(false)
                        }}
                        className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border last:border-b-0"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="bg-brand text-white text-xs">
                            {customer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">
                            {customer.customer_name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{customer.customer_code}</span>
                            {customer.phone && <span className="hidden sm:inline">{customer.phone}</span>}
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-xs text-destructive font-medium">
                            {formatCurrency(customer.current_debt)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <Users className="h-4 w-4 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">Không tìm thấy</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
