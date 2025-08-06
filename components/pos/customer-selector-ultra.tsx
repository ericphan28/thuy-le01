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
        // Professional selected customer display - Supabase style
        <div className="supabase-card p-2 sm:p-3 bg-card border border-border hover:border-brand/30 transition-colors">
          <div className="flex items-center gap-2 sm:gap-3">
            <Avatar className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-brand/20">
              <AvatarFallback className="bg-brand text-brand-foreground text-xs sm:text-sm font-semibold">
                {selectedCustomer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                  {selectedCustomer.customer_name}
                </span>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-mono bg-muted px-1 sm:px-2 py-0.5 rounded">
                  {selectedCustomer.customer_code}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1">
                <div className="flex items-center gap-1 text-[10px] sm:text-xs">
                  <span className="text-muted-foreground">Nợ:</span>
                  <span className={`font-bold ${selectedCustomer.current_debt > 0 ? 'text-destructive' : 'text-brand'}`}>
                    {formatCurrency(selectedCustomer.current_debt)}
                  </span>
                </div>
                {selectedCustomer.phone && (
                  <div className="text-[10px] sm:text-xs text-muted-foreground font-mono">
                    📞 {selectedCustomer.phone}
                  </div>
                )}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearCustomer}
              className="h-6 w-6 sm:h-8 sm:w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
            >
              <X className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      ) : (
        // Professional search input - Supabase style
        <div className="relative">
          <div className="supabase-card p-0 bg-card border border-border hover:border-brand/30 focus-within:border-brand transition-colors">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3">
              <div className="p-1 sm:p-1.5 sm:bg-brand/10 rounded-lg">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 text-brand flex-shrink-0" />
              </div>
              <div className="flex-1">
                <input
                  placeholder="Tìm khách hàng theo tên, mã, hoặc số điện thoại"
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onFocus={() => setIsExpanded(true)}
                  onBlur={() => setTimeout(() => setIsExpanded(false), 200)}
                  className="w-full bg-transparent text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <div className="p-1 bg-muted/30 rounded">
                <Search className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground flex-shrink-0" />
              </div>
            </div>
          </div>

          {/* Professional dropdown results - Supabase style */}
          {isExpanded && searchTerm && (
            <div className="absolute z-50 top-full mt-2 left-0 right-0 supabase-card bg-card border border-border shadow-lg max-h-64 overflow-y-auto">
              {customers.length > 0 ? (
                <div className="p-2">
                  <div className="text-xs text-muted-foreground mb-2 px-2 font-medium">
                    Tìm thấy {customers.length} khách hàng
                  </div>
                  {customers.map((customer, index) => (
                    <div
                      key={customer.customer_id}
                      onClick={() => {
                        onSelectCustomer(customer)
                        setIsExpanded(false)
                      }}
                      className={`flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer transition-colors rounded-lg ${
                        index < customers.length - 1 ? 'border-b border-border/50' : ''
                      }`}
                    >
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarFallback className="bg-brand text-brand-foreground text-xs font-semibold">
                          {customer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {customer.customer_name}
                          </p>
                          <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                            {customer.customer_code}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          {customer.phone && (
                            <p className="text-xs text-muted-foreground font-mono">
                              📞 {customer.phone}
                            </p>
                          )}
                          <div className="text-xs">
                            <span className="text-muted-foreground">Nợ: </span>
                            <span className={`font-medium ${customer.current_debt > 0 ? 'text-destructive' : 'text-brand'}`}>
                              {formatCurrency(customer.current_debt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 px-4">
                  <div className="p-3 bg-muted/30 rounded-lg w-fit mx-auto mb-3">
                    <Users className="h-8 w-8 text-muted-foreground opacity-50" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">Không tìm thấy khách hàng</p>
                  <p className="text-xs text-muted-foreground">Thử tìm kiếm với từ khóa khác</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
