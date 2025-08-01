'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Users, 
  Plus, 
  Download, 
  Search, 
  AlertTriangle,
  Phone,
  Mail,
  Building2,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Filter,
  Crown,
  Star,
  UserCheck
} from 'lucide-react'

// 🐾 Customer interface matching database schema and analytics insights
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
  const [itemsPerPage, setItemsPerPage] = useState(20)
  
  // Sorting states
  const [sortBy, setSortBy] = useState<'name' | 'revenue' | 'purchases' | 'created'>('revenue')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const supabase = createClient()

  // 🐾 Core API Call: Fetch veterinary customers with analytics insights
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // First, get total count for filtered customers
      let countQuery = supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      // Apply same filters to count query
      if (filterType === 'vip') {
        countQuery = countQuery.gte('total_revenue', 50000000)
      } else if (filterType === 'high') {
        countQuery = countQuery.gte('total_revenue', 10000000).lt('total_revenue', 50000000)
      } else if (filterType === 'low_data') {
        countQuery = countQuery.or('phone.is.null,email.is.null,address.is.null')
      } else if (filterType === 'churn_risk') {
        // Customers with no purchases in last 90 days or no purchase history
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        countQuery = countQuery.or(`last_purchase_date.is.null,last_purchase_date.lt.${ninetyDaysAgo.toISOString()}`)
      }

      // Apply search to count query
      if (searchTerm) {
        countQuery = countQuery.or(`customer_name.ilike.%${searchTerm}%,customer_code.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
      }

      const { count: filteredCount } = await countQuery
      setTotalCount(filteredCount || 0)

      // Main query with pagination and sorting
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

      // Apply sorting based on business insights
      const sortColumn = sortBy === 'name' ? 'customer_name' 
                       : sortBy === 'revenue' ? 'total_revenue'
                       : sortBy === 'purchases' ? 'purchase_count'
                       : sortBy === 'created' ? 'created_at'
                       : 'total_revenue'
      
      query = query.order(sortColumn, { ascending: sortOrder === 'asc' })

      // Apply veterinary business filters based on analytics insights
      if (filterType === 'vip') {
        // VIP customers: >50M VND (25.6% of customers - top revenue generators)
        query = query.gte('total_revenue', 50000000)
      } else if (filterType === 'high') {
        // High-value customers: 10M-50M VND (29.4% of customers)
        query = query.gte('total_revenue', 10000000).lt('total_revenue', 50000000)
      } else if (filterType === 'low_data') {
        // Data quality issue: customers missing critical contact info
        query = query.or('phone.is.null,email.is.null,address.is.null')
      } else if (filterType === 'churn_risk') {
        // Churn risk: no purchases in last 90 days (veterinary business cycle)
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        query = query.or(`last_purchase_date.is.null,last_purchase_date.lt.${ninetyDaysAgo.toISOString()}`)
      }

      // Search functionality - veterinary specific
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

      // Transform data to handle relationship arrays
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

  // Sorting handler
  const handleSort = (column: 'name' | 'revenue' | 'purchases' | 'created') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(column === 'revenue' || column === 'purchases' ? 'desc' : 'asc')
    }
  }

  // 🚨 Veterinary business logic functions based on analytics insights
  const getCustomerSegment = (revenue: number) => {
    if (revenue >= 50000000) return { label: 'VIP', color: 'default' as const, icon: Crown }
    if (revenue >= 10000000) return { label: 'High', color: 'secondary' as const, icon: Star }
    if (revenue >= 1000000) return { label: 'Medium', color: 'outline' as const, icon: UserCheck }
    if (revenue > 0) return { label: 'Low', color: 'outline' as const, icon: UserCheck }
    return { label: 'No Revenue', color: 'destructive' as const, icon: UserCheck }
  }

  // Data completeness assessment based on analytics
  const getDataCompleteness = (customer: VeterinaryCustomer) => {
    const fields = [customer.phone, customer.email, customer.address, customer.company_name, customer.gender]
    const completedFields = fields.filter(field => field && field.toString().trim() !== '').length
    const percentage = (completedFields / fields.length) * 100
    
    if (percentage >= 80) return { label: 'Complete', color: 'default' as const }
    if (percentage >= 60) return { label: 'Good', color: 'secondary' as const }
    if (percentage >= 40) return { label: 'Partial', color: 'outline' as const }
    return { label: 'Incomplete', color: 'destructive' as const }
  }

  // Churn risk assessment
  const getChurnRisk = (lastPurchaseDate: string | null) => {
    if (!lastPurchaseDate) return { label: 'No History', color: 'destructive' as const }
    
    const daysSince = Math.floor((new Date().getTime() - new Date(lastPurchaseDate).getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysSince > 180) return { label: 'High Risk', color: 'destructive' as const }
    if (daysSince > 90) return { label: 'Medium Risk', color: 'outline' as const }
    if (daysSince > 30) return { label: 'Low Risk', color: 'secondary' as const }
    return { label: 'Active', color: 'default' as const }
  }

  // Format currency helper
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }

  // Statistics for dashboard based on analytics insights
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
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-green-600 bg-clip-text text-transparent">🐾 Quản lý Khách hàng Thú y</h1>
        </div>
        
        <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 via-red-50 to-rose-50 ring-2 ring-red-200/50 rounded-xl backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-full shadow-lg">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-800">Có lỗi xảy ra</h3>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Ultra Compact Header with Inline Stats */}
      <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-3 ring-1 ring-gray-100/50">
        <div className="flex flex-col gap-3">
          {/* Title and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-lg shadow-lg">
                <Users className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-green-600 bg-clip-text text-transparent">
                  Khách hàng Thú y
                </h1>
                <p className="text-xs text-gray-500">
                  {startItem}-{endItem} / {totalCount} khách hàng
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700 h-6 px-1.5 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Thêm
              </Button>
              <Button variant="outline" size="sm" className="bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 h-6 px-1.5 text-xs">
                <Download className="h-3 w-3 mr-1" />
                Xuất
              </Button>
            </div>
          </div>

          {/* Inline Stats - Based on Real Analytics Data */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.total}</div>
              <div className="text-xs opacity-90">Tổng KH</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.vip}</div>
              <div className="text-xs opacity-90">VIP</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.lowData}</div>
              <div className="text-xs opacity-90">Thiếu TT</div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.churnRisk}</div>
              <div className="text-xs opacity-90">Rời bỏ</div>
            </div>
          </div>

          {/* Compact Search and Controls */}
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Tìm khách hàng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-8 border-white/30 bg-white/60 backdrop-blur-sm focus:border-blue-400 focus:ring-blue-400/30 rounded-lg shadow-sm text-sm"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {/* Business-focused Filters */}
              <div className="flex gap-1">
                <Badge 
                  variant={filterType === 'all' ? 'default' : 'outline'}
                  className={`cursor-pointer px-1.5 py-0.5 text-xs font-medium transition-all ${
                    filterType === 'all' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-white/60 border-gray-200 hover:bg-blue-50'
                  }`}
                  onClick={() => setFilterType('all')}
                >
                  Tất cả
                </Badge>
                <Badge 
                  variant={filterType === 'vip' ? 'default' : 'outline'}
                  className={`cursor-pointer px-1.5 py-0.5 text-xs font-medium transition-all ${
                    filterType === 'vip' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-white/60 border-gray-200 hover:bg-purple-50'
                  }`}
                  onClick={() => setFilterType('vip')}
                >
                  VIP
                </Badge>
                <Badge 
                  variant={filterType === 'high' ? 'default' : 'outline'}
                  className={`cursor-pointer px-1.5 py-0.5 text-xs font-medium transition-all ${
                    filterType === 'high' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-white/60 border-gray-200 hover:bg-green-50'
                  }`}
                  onClick={() => setFilterType('high')}
                >
                  High
                </Badge>
                <Badge 
                  variant={filterType === 'low_data' ? 'default' : 'outline'}
                  className={`cursor-pointer px-1.5 py-0.5 text-xs font-medium transition-all ${
                    filterType === 'low_data' 
                      ? 'bg-orange-600 text-white' 
                      : 'bg-white/60 border-gray-200 hover:bg-orange-50'
                  }`}
                  onClick={() => setFilterType('low_data')}
                >
                  Thiếu TT
                </Badge>
                <Badge 
                  variant={filterType === 'churn_risk' ? 'default' : 'outline'}
                  className={`cursor-pointer px-1.5 py-0.5 text-xs font-medium transition-all ${
                    filterType === 'churn_risk' 
                      ? 'bg-red-600 text-white' 
                      : 'bg-white/60 border-gray-200 hover:bg-red-50'
                  }`}
                  onClick={() => setFilterType('churn_risk')}
                >
                  Rời bỏ
                </Badge>
              </div>
              
              {/* Sort & Items Per Page */}
              <div className="flex items-center gap-1">
                <Button
                  variant={sortBy === 'name' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('name')}
                  className="h-6 px-1.5 text-xs"
                >
                  Tên {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'revenue' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('revenue')}
                  className="h-6 px-1.5 text-xs"
                >
                  Doanh thu {sortBy === 'revenue' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'purchases' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('purchases')}
                  className="h-6 px-1.5 text-xs"
                >
                  Mua hàng {sortBy === 'purchases' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                
                <select 
                  value={itemsPerPage} 
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="h-6 px-1 text-xs border border-white/30 bg-white/60 backdrop-blur-sm rounded focus:border-blue-400"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customers Grid */}
      {loading ? (
        // Ultra Compact Loading State
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <Card key={i} className="animate-pulse border-0 shadow-md bg-white/95 backdrop-blur-lg rounded-lg overflow-hidden">
              <CardContent className="p-2">
                <div className="space-y-2">
                  <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-1/2"></div>
                  <div className="h-8 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // Ultra Dense Customers Grid - Veterinary Business Focus
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {customers.map((customer) => {
            const segment = getCustomerSegment(customer.total_revenue)
            const dataCompletion = getDataCompleteness(customer)
            const churnRisk = getChurnRisk(customer.last_purchase_date)
            
            return (
              <Card 
                key={customer.customer_id} 
                className="group border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 bg-white/95 backdrop-blur-lg overflow-hidden rounded-lg ring-1 ring-gray-100/50 hover:ring-blue-200/50"
              >
                <div className={`absolute top-0 left-0 w-full h-0.5 ${
                  segment.label === 'VIP' ? 'bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500' :
                  segment.label === 'High' ? 'bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500' :
                  'bg-gradient-to-r from-blue-500 via-indigo-500 to-green-500'
                }`}></div>
                
                <CardHeader className="pb-1 pt-2 px-2">
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-bold text-gray-900 truncate leading-tight flex items-center gap-1">
                        {segment.label === 'VIP' && <Crown className="h-3 w-3 text-purple-600" />}
                        {segment.label === 'High' && <Star className="h-3 w-3 text-green-600" />}
                        {customer.customer_name}
                      </CardTitle>
                      <p className="text-xs text-gray-500 truncate">
                        {customer.customer_code}
                      </p>
                    </div>
                    <Badge 
                      variant={segment.color}
                      className="text-xs px-1 py-0 flex-shrink-0 h-4"
                    >
                      {segment.label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-2 pt-1 space-y-2">
                  {/* Revenue & Purchase Stats */}
                  <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-green-50 rounded-md p-2">
                    <div className="grid grid-cols-1 gap-1 text-xs">
                      <div>
                        <span className="text-gray-500 text-xs">Doanh thu:</span>
                        <p className="font-bold text-green-600 text-sm">
                          {formatCurrency(customer.total_revenue)}
                        </p>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 text-xs">Đơn hàng: <span className="font-semibold text-blue-600">{customer.purchase_count}</span></span>
                        <span className="text-gray-500 text-xs">Nợ: <span className="font-semibold text-red-600">{formatCurrency(customer.current_debt)}</span></span>
                      </div>
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div className="bg-white/60 rounded-md p-1.5 space-y-1">
                    <div className="flex items-center gap-1 text-xs">
                      <Phone className="h-3 w-3 text-gray-400" />
                      <span className={customer.phone ? 'text-gray-700' : 'text-red-500'}>
                        {customer.phone || 'Chưa có SĐT'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <Mail className="h-3 w-3 text-gray-400" />
                      <span className={customer.email ? 'text-gray-700' : 'text-red-500'}>
                        {customer.email || 'Chưa có email'}
                      </span>
                    </div>
                    {customer.company_name && (
                      <div className="flex items-center gap-1 text-xs">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        <span className="text-gray-700 truncate">{customer.company_name}</span>
                      </div>
                    )}
                  </div>

                  {/* Status Badges */}
                  <div className="flex flex-wrap gap-0.5">
                    <Badge variant={dataCompletion.color} className="text-xs px-1 py-0 h-4">
                      {dataCompletion.label}
                    </Badge>
                    <Badge variant={churnRisk.color} className="text-xs px-1 py-0 h-4">
                      {churnRisk.label}
                    </Badge>
                    {customer.last_purchase_date && (
                      <Badge variant="outline" className="text-xs px-1 py-0 h-4 border-gray-200 text-gray-600">
                        {new Date(customer.last_purchase_date).toLocaleDateString('vi-VN')}
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="border-t border-gray-100 pt-1.5 mt-1.5">
                    <div className="flex justify-between items-center gap-1">
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-1.5 py-0">
                        Chi tiết
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-6 px-1.5 py-0">
                        Liên hệ
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Professional Pagination */}
      {!loading && customers.length > 0 && totalPages > 1 && (
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-xl ring-1 ring-gray-100/50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                Hiển thị <span className="font-semibold">{startItem}</span> đến{' '}
                <span className="font-semibold">{endItem}</span> trong tổng số{' '}
                <span className="font-semibold">{totalCount}</span> khách hàng
              </div>
              
              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="h-8 w-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Analytics Summary */}
      {!loading && customers.length > 0 && customers.length < totalCount && totalPages <= 1 && (
        <Card className="text-center py-6 border-0 shadow-lg bg-gradient-to-r from-blue-50 via-indigo-50 to-green-50 backdrop-blur-xl rounded-xl ring-1 ring-blue-100/50">
          <CardContent>
            <div className="flex flex-col items-center space-y-2">
              <div className="p-2 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-blue-800">
                  Hiển thị {customers.length} / {totalCount} khách hàng
                </h3>
                <p className="text-blue-600 text-sm">
                  Tổng doanh thu: {formatCurrency(customers.reduce((sum, c) => sum + c.total_revenue, 0))} • 
                  Khách hàng VIP: {stats.vip} • 
                  Cần cập nhật thông tin: {stats.lowData}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Empty State */}
      {!loading && customers.length === 0 && (
        <Card className="text-center py-16 border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-xl ring-1 ring-gray-100/50">
          <CardContent>
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-gradient-to-br from-gray-100 to-slate-100 rounded-full shadow-inner">
                <Users className="h-12 w-12 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-gray-800">
                  Không tìm thấy khách hàng
                </h3>
                <p className="text-gray-600 max-w-md">
                  Không có khách hàng nào phù hợp với tiêu chí tìm kiếm của bạn. 
                  Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('')
                  setFilterType('all')
                }}
                className="mt-4 bg-white/60 backdrop-blur-sm border-blue-200 hover:bg-blue-50 transition-all duration-300 h-10 px-6 rounded-lg shadow-sm"
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
