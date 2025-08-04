'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { 
  Users, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  Star,
  Crown,
  UserCheck,
  AlertTriangle,
  Phone,
  Mail,
  MapPin
} from 'lucide-react'

// 🐾 Customer interface matching database schema
interface VeterinaryCustomer {
  customer_id: number
  customer_code: string
  customer_name: string
  customer_type_id: number | null
  branch_created_id: number | null
  phone: string | null
  email: string | null
  address: string | null
  company_name: string | null
  tax_code: string | null
  gender: string | null
  debt_limit: number
  current_debt: number
  total_revenue: number
  total_profit: number
  purchase_count: number
  last_purchase_date: string | null
  status: number
  is_active: boolean
  created_at: string
  customer_types?: {
    type_id: number
    type_name: string
  } | null
  branches?: {
    branch_id: number
    branch_name: string
  } | null
}

export default function VeterinaryCustomersPage() {
  const [customers, setCustomers] = useState<VeterinaryCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'vip' | 'high' | 'low_data' | 'churn_risk'>('all')
  const [totalCount, setTotalCount] = useState<number>(0)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(20)
  
  // Sorting states
  const [sortBy] = useState<'name' | 'revenue' | 'purchases' | 'created'>('revenue')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')

  const supabase = createClient()

  // 🐾 Core API Call: Fetch veterinary customers
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Get total count for filtered customers
      let countQuery = supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      if (searchTerm) {
        countQuery = countQuery.or(`customer_name.ilike.%${searchTerm}%,customer_code.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
      }

      const { count: filteredCount } = await countQuery
      setTotalCount(filteredCount || 0)

      // Main query with pagination
      let query = supabase
        .from('customers')
        .select(`
          customer_id,
          customer_code,
          customer_name,
          customer_type_id,
          branch_created_id,
          phone,
          email,
          address,
          company_name,
          tax_code,
          gender,
          debt_limit,
          current_debt,
          total_revenue,
          total_profit,
          purchase_count,
          last_purchase_date,
          status,
          is_active,
          created_at,
          customer_types!fk_customers_customer_type_id (
            type_id,
            type_name
          ),
          branches!customers_branch_created_id_fkey (
            branch_id,
            branch_name
          )
        `)
        .eq('is_active', true)

      // Apply sorting
      const sortColumn = sortBy === 'name' ? 'customer_name' 
                       : sortBy === 'revenue' ? 'total_revenue'
                       : sortBy === 'purchases' ? 'purchase_count'
                       : sortBy === 'created' ? 'created_at'
                       : 'total_revenue'
      
      query = query.order(sortColumn, { ascending: sortOrder === 'asc' })

      // Apply filters
      if (filterType === 'vip') {
        query = query.gte('total_revenue', 50000000)
      } else if (filterType === 'high') {
        query = query.gte('total_revenue', 10000000).lt('total_revenue', 50000000)
      } else if (filterType === 'low_data') {
        query = query.or('phone.is.null,email.is.null,address.is.null')
      } else if (filterType === 'churn_risk') {
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        query = query.or(`last_purchase_date.is.null,last_purchase_date.lt.${ninetyDaysAgo.toISOString()}`)
      }

      // Search functionality
      if (searchTerm) {
        query = query.or(`customer_name.ilike.%${searchTerm}%,customer_code.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%`)
      }

      // Apply pagination
      const startIndex = (currentPage - 1) * itemsPerPage
      query = query.range(startIndex, startIndex + itemsPerPage - 1)

      const { data, error: fetchError } = await query

      if (fetchError) {
        console.error('Supabase error:', fetchError)
        setError(`Lỗi database: ${fetchError.message}`)
        return
      }

      // Transform data
      const transformedCustomers: VeterinaryCustomer[] = (data || []).map(item => ({
        ...item,
        customer_types: Array.isArray(item.customer_types) ? item.customer_types[0] : item.customer_types,
        branches: Array.isArray(item.branches) ? item.branches[0] : item.branches
      }))

      setCustomers(transformedCustomers)
    } catch (err) {
      console.error('Customers fetch error:', err)
      setError('Không thể tải danh sách khách hàng')
    } finally {
      setLoading(false)
    }
  }, [filterType, searchTerm, supabase, currentPage, itemsPerPage, sortBy, sortOrder])

  // Load customers on component mount and when filters change
  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filterType, searchTerm, sortBy, sortOrder])

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / itemsPerPage)
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalCount)

  // Business logic functions
  const getCustomerSegment = (revenue: number) => {
    if (revenue >= 50000000) return { label: 'VIP', color: 'default' as const, icon: Crown }
    if (revenue >= 10000000) return { label: 'High', color: 'secondary' as const, icon: Star }
    if (revenue >= 1000000) return { label: 'Medium', color: 'outline' as const, icon: UserCheck }
    if (revenue > 0) return { label: 'Low', color: 'outline' as const, icon: UserCheck }
    return { label: 'No Revenue', color: 'destructive' as const, icon: UserCheck }
  }

  const getDataCompleteness = (customer: VeterinaryCustomer) => {
    const fields = [customer.phone, customer.email, customer.address, customer.company_name, customer.gender]
    const completedFields = fields.filter(field => field && field.toString().trim() !== '').length
    const percentage = (completedFields / fields.length) * 100
    
    if (percentage >= 80) return { label: 'Complete', color: 'default' as const }
    if (percentage >= 60) return { label: 'Good', color: 'secondary' as const }
    if (percentage >= 40) return { label: 'Partial', color: 'outline' as const }
    return { label: 'Incomplete', color: 'destructive' as const }
  }

  const getChurnRisk = (lastPurchaseDate: string | null) => {
    if (!lastPurchaseDate) return { label: 'No History', color: 'destructive' as const }
    
    const daysSince = Math.floor((new Date().getTime() - new Date(lastPurchaseDate).getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysSince > 180) return { label: 'High Risk', color: 'destructive' as const }
    if (daysSince > 90) return { label: 'Medium Risk', color: 'outline' as const }
    if (daysSince > 30) return { label: 'Low Risk', color: 'secondary' as const }
    return { label: 'Active', color: 'default' as const }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }

  // Statistics
  const stats = {
    total: customers.length,
    vip: customers.filter(c => c.total_revenue >= 50000000).length,
    highValue: customers.filter(c => c.total_revenue >= 10000000 && c.total_revenue < 50000000).length,
    lowData: customers.filter(c => !c.phone || !c.email || !c.address).length,
    churnRisk: customers.filter(c => {
      if (!c.last_purchase_date) return true
      const daysSince = Math.floor((new Date().getTime() - new Date(c.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24))
      return daysSince > 90
    }).length
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">🐾 Quản lý Khách hàng Thú y</h1>
        </div>
        
        <Card className="supabase-card">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-destructive rounded-full shadow-lg">
                <AlertTriangle className="h-6 w-6 text-destructive-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Có lỗi xảy ra</h3>
                <p className="text-muted-foreground">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header with Stats */}
      <div className="supabase-card">
        <div className="flex flex-col gap-3">
          {/* Title and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-brand rounded-lg shadow-lg">
                <Users className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">🐾 Khách hàng Thú y</h1>
                <p className="text-xs text-muted-foreground">{totalCount.toLocaleString('vi-VN')} khách hàng</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="supabase-button-secondary h-6 px-1.5 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Thêm
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-brand text-primary-foreground rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.total}</div>
              <div className="text-xs opacity-90">Tổng KH</div>
            </div>
            <div className="bg-secondary text-secondary-foreground rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.vip}</div>
              <div className="text-xs">VIP</div>
            </div>
            <div className="bg-muted text-muted-foreground rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.highValue}</div>
              <div className="text-xs">Tiềm năng</div>
            </div>
            <div className="bg-destructive text-destructive-foreground rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.churnRisk}</div>
              <div className="text-xs">Rời bỏ</div>
            </div>
          </div>

          {/* Search and Controls */}
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Tìm khách hàng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="supabase-input pl-10 h-8"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Customers Grid */}
      {loading ? (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <Card key={i} className="supabase-card animate-pulse">
              <CardContent className="p-2">
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                  <div className="h-8 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {customers.map((customer) => {
            const segment = getCustomerSegment(customer.total_revenue)
            const dataCompletion = getDataCompleteness(customer)
            const churnRisk = getChurnRisk(customer.last_purchase_date)
            
            return (
              <Card key={customer.customer_id} className="supabase-product-card">
                <CardHeader className="pb-1 pt-2 px-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarFallback className="bg-brand text-primary-foreground text-xs font-semibold">
                          {customer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-xs text-foreground leading-tight truncate">
                          {customer.customer_name}
                        </h3>
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          {customer.customer_code}
                        </p>
                      </div>
                    </div>
                    <Badge variant={segment.color} className="text-xs px-1 py-0">
                      {segment.label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-2 pt-1 space-y-2">
                  <div className="space-y-1">
                    {customer.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span className="truncate">{customer.phone}</span>
                      </div>
                    )}
                    {customer.email && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                    {customer.address && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{customer.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Doanh thu:</span>
                      <span className="text-xs font-semibold text-brand">
                        {formatCurrency(customer.total_revenue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Đơn hàng:</span>
                      <span className="text-xs font-semibold text-foreground">
                        {customer.purchase_count}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-1 flex-wrap">
                    <Badge variant={dataCompletion.color} className="text-xs px-1 py-0">
                      {dataCompletion.label}
                    </Badge>
                    <Badge variant={churnRisk.color} className="text-xs px-1 py-0">
                      {churnRisk.label}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && customers.length > 0 && totalPages > 1 && (
        <Card className="supabase-card">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                Hiển thị {startItem} đến {endItem} trong tổng số {totalCount} khách hàng
              </div>
              
              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="supabase-button-secondary"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <span className="text-sm text-foreground px-3">
                  {currentPage} / {totalPages}
                </span>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="supabase-button-secondary"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && customers.length === 0 && (
        <Card className="supabase-card text-center py-16">
          <CardContent>
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-muted rounded-full">
                <Users className="h-12 w-12 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Không tìm thấy khách hàng</h3>
                <p className="text-muted-foreground">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('')
                  setFilterType('all')
                }}
                className="supabase-button-secondary"
              >
                <Filter className="h-4 w-4 mr-2" />
                Xóa bộ lọc
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
