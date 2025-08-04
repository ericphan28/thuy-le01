'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { 
  Search, 
  X,
  Users
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

  return (
    <div className="relative">
      {selectedCustomer ? (
        // Ultra minimal selected customer - inline style
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg border border-border">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-brand text-white text-xs font-medium">
              {selectedCustomer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground truncate">
              {selectedCustomer.customer_name}
            </span>
            <span className="text-xs text-muted-foreground ml-2 font-mono">
              {selectedCustomer.customer_code}
            </span>
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Nợ:</span>
            <span className="font-bold text-destructive">
              {formatCurrency(selectedCustomer.current_debt)}
            </span>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearCustomer}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        // Ultra minimal search - inline style
        <div className="relative">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg border border-border">
            <Users className="h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Tìm khách hàng..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setIsExpanded(true)}
              onBlur={() => setTimeout(() => setIsExpanded(false), 200)}
              className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {/* Dropdown results */}
          {isExpanded && searchTerm && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
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
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="bg-brand text-white text-xs">
                        {customer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {customer.customer_name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {customer.customer_code}
                      </p>
                    </div>
                    
                    <div className="text-xs text-destructive font-medium">
                      {formatCurrency(customer.current_debt)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-3 text-muted-foreground">
                  <p className="text-xs">Không tìm thấy</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
