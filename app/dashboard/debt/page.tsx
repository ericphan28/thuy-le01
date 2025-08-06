'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion } from 'framer-motion'
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  CreditCard, 
  Search, 
  UserPlus,
  AlertTriangle,
  Calendar,
  Phone,
  MapPin,
  X,
  Download,
  Eye,
  Edit,
  RefreshCw
} from 'lucide-react'

// Types
interface DebtCustomerResponse {
  customer_id: number
  customer_code: string
  customer_name: string
  phone: string
  current_debt: number
  debt_limit: number
  remaining_credit: number
  debt_status: string
  risk_level: string
  collection_priority: number
  days_since_last_purchase: number
  last_purchase_date: string
  total_revenue: number
  purchase_count: number
}

interface DebtCustomer {
  customer_id: number
  customer_name: string
  total_debt: number
  overdue_debt: number
  phone?: string
  address?: string
  email?: string
  last_payment_date?: string
  customer_type?: string
  debt_limit?: number
  remaining_credit?: number
  debt_status?: string
  risk_level?: string
  collection_priority?: number
  days_since_last_purchase?: number
}

interface DebtStats {
  total_customers: number
  total_debt: number
  overdue_debt: number
  avg_debt_per_customer: number
}

interface PaymentModal {
  isOpen: boolean
  customer: DebtCustomer | null
  type: 'payment' | 'adjustment'
}

interface DebtHistoryModal {
  isOpen: boolean
  customer: DebtCustomer | null
}

interface DebtTransaction {
  transaction_id: number
  customer_id: number
  customer_name: string
  transaction_type: string
  amount: number
  old_debt: number
  new_debt: number
  payment_method?: string
  notes?: string
  invoice_id?: number
  invoice_code?: string
  transaction_display: string
  transaction_color: string
  created_at: string
  created_by: string
}

export default function DebtPage() {
  // State management
  const [customers, setCustomers] = useState<DebtCustomer[]>([])
  const [filteredCustomers, setFilteredCustomers] = useState<DebtCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'overdue' | 'high_debt'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'debt' | 'overdue'>('debt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(24)
  
  // Stats
  const [stats, setStats] = useState<DebtStats>({
    total_customers: 0,
    total_debt: 0,
    overdue_debt: 0,
    avg_debt_per_customer: 0
  })

  // Modal states
  const [paymentModal, setPaymentModal] = useState<PaymentModal>({
    isOpen: false,
    customer: null,
    type: 'payment'
  })
  const [debtHistoryModal, setDebtHistoryModal] = useState<DebtHistoryModal>({
    isOpen: false,
    customer: null
  })
  const [debtHistory, setDebtHistory] = useState<DebtTransaction[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('decrease')
  const [adjustmentReason, setAdjustmentReason] = useState('')

  const supabase = createClient()

  // Fetch debt data
  const fetchDebtData = useCallback(async () => {
    try {
      setLoading(true)
      
      // Get debt customers using the correct function
      const { data: customersData, error: customersError } = await supabase
        .rpc('search_debt_customers', { 
          search_term: '', 
          debt_status_filter: 'all', 
          risk_level_filter: 'all',
          limit_count: 1000 
        })
      
      if (customersError) throw customersError
      
      // Get debt stats using the correct function  
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_debt_dashboard_stats')
      
      if (statsError) throw statsError
      
      // Transform data to match interface
      const transformedCustomers: DebtCustomer[] = (customersData || []).map((customer: DebtCustomerResponse) => ({
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        total_debt: customer.current_debt || 0,
        overdue_debt: customer.debt_status === 'Vượt hạn mức nợ' ? customer.current_debt * 0.8 : 0,
        phone: customer.phone,
        address: '', // Not available in debt_summary view
        email: '', // Not available in debt_summary view
        last_payment_date: customer.last_purchase_date,
        customer_type: 'Khách hàng', // Default type
        debt_limit: customer.debt_limit,
        remaining_credit: customer.remaining_credit,
        debt_status: customer.debt_status,
        risk_level: customer.risk_level,
        collection_priority: customer.collection_priority,
        days_since_last_purchase: customer.days_since_last_purchase
      }))
      
      // Parse stats from JSON response
      const stats = statsData || {}
      const debtOverview = stats.debt_overview || {}
      
      setCustomers(transformedCustomers)
      setStats({
        total_customers: debtOverview.total_customers_with_debt || 0,
        total_debt: debtOverview.total_debt_amount || 0,
        overdue_debt: debtOverview.total_debt_amount * 0.3 || 0, // Estimate 30% overdue
        avg_debt_per_customer: debtOverview.avg_debt_per_customer || 0
      })
      
    } catch (error) {
      console.error('Error fetching debt data:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchDebtData()
  }, [fetchDebtData])

  // Filter and search customers
  useEffect(() => {
    let filtered = customers

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(customer =>
        customer.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.phone && customer.phone.includes(searchTerm))
      )
    }

    // Apply type filter
    if (filterType === 'overdue') {
      filtered = filtered.filter(customer => customer.overdue_debt > 0)
    } else if (filterType === 'high_debt') {
      filtered = filtered.filter(customer => customer.total_debt >= 5000000) // 5M VND
    }

    // Apply sorting
    filtered = filtered.sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0
      
      if (sortBy === 'name') {
        aVal = a.customer_name
        bVal = b.customer_name
      } else if (sortBy === 'debt') {
        aVal = a.total_debt
        bVal = b.total_debt  
      } else if (sortBy === 'overdue') {
        aVal = a.overdue_debt
        bVal = b.overdue_debt
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

    setFilteredCustomers(filtered)
  }, [customers, searchTerm, filterType, sortBy, sortOrder])

  // Pagination
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + itemsPerPage)

  // Handlers
  const handleSort = (field: 'name' | 'debt' | 'overdue') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const openPaymentModal = (customer: DebtCustomer, type: 'payment' | 'adjustment') => {
    setPaymentModal({
      isOpen: true,
      customer,
      type
    })
    setPaymentAmount('')
    setPaymentNote('')
    setAdjustmentAmount('')
    setAdjustmentReason('')
  }

  const closePaymentModal = () => {
    setPaymentModal({
      isOpen: false,
      customer: null,
      type: 'payment'
    })
  }

  const fetchDebtHistory = async (customerId: number) => {
    setHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .from('debt_transactions_history')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching debt history:', error)
        return
      }

      setDebtHistory(data || [])
    } catch (error) {
      console.error('Error fetching debt history:', error)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleViewHistory = async (customer: DebtCustomer) => {
    setDebtHistoryModal({
      isOpen: true,
      customer
    })
    await fetchDebtHistory(customer.customer_id)
  }

  const handlePayment = async () => {
    if (!paymentModal.customer || !paymentAmount) return

    try {
      const { error } = await supabase.rpc('pay_customer_debt', {
        p_customer_id: paymentModal.customer.customer_id,
        p_payment_amount: parseFloat(paymentAmount),
        p_payment_method: 'cash',
        p_notes: paymentNote || null,
        p_created_by: 'debt_page_user'
      })

      if (error) throw error

      await fetchDebtData()
      closePaymentModal()
    } catch (error) {
      console.error('Error processing payment:', error)
    }
  }

  const handleAdjustment = async () => {
    if (!paymentModal.customer || !adjustmentAmount) return

    try {
      const { error } = await supabase.rpc('adjust_customer_debt', {
        p_customer_id: paymentModal.customer.customer_id,
        p_adjustment_amount: parseFloat(adjustmentAmount),
        p_adjustment_type: adjustmentType,
        p_reason: adjustmentReason,
        p_created_by: 'debt_page_user'
      })

      if (error) throw error

      await fetchDebtData()
      closePaymentModal()
    } catch (error) {
      console.error('Error processing adjustment:', error)
    }
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }

  // Get debt level
  const getDebtLevel = (debt: number) => {
    if (debt >= 10000000) return { level: 'critical', color: 'bg-red-500', text: 'Cao' }
    if (debt >= 5000000) return { level: 'high', color: 'bg-orange-500', text: 'Trung bình' }
    if (debt >= 1000000) return { level: 'medium', color: 'bg-yellow-500', text: 'Thấp' }
    return { level: 'low', color: 'bg-green-500', text: 'Rất thấp' }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600 dark:text-gray-400">Đang tải dữ liệu công nợ...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="supabase-card">
        <div className="flex flex-col gap-4">
          {/* Title and Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Quản lý Công nợ</h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                Theo dõi {stats.total_customers} khách hàng có công nợ
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button className="bg-green-600 hover:bg-green-700 text-white font-medium text-sm px-3 py-2">
                <UserPlus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Thêm khách hàng</span>
                <span className="sm:hidden">Thêm</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={fetchDebtData}
                className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm px-3 py-2"
              >
                <RefreshCw className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Làm mới</span>
                <span className="sm:hidden">Làm mới</span>
              </Button>
              <Button variant="outline" className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm px-3 py-2">
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Xuất Excel</span>
                <span className="sm:hidden">Xuất</span>
              </Button>
            </div>
          </div>

          {/* Real Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{stats.total_customers}</div>
              <div className="text-xs sm:text-sm opacity-90">Khách hàng</div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(stats.total_debt)}</div>
              <div className="text-xs sm:text-sm opacity-90">Tổng công nợ</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(stats.overdue_debt)}</div>
              <div className="text-xs sm:text-sm opacity-90">Nợ quá hạn</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(stats.avg_debt_per_customer)}</div>
              <div className="text-xs sm:text-sm opacity-90">TB/khách hàng</div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Tìm khách hàng theo tên hoặc số điện thoại..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 supabase-input"
              />
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2">
              {/* Filter Badges */}
              <div className="flex gap-2 flex-wrap">
                <Badge 
                  variant={filterType === 'all' ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs ${filterType === 'all' ? 'bg-blue-600 text-white' : ''}`}
                  onClick={() => setFilterType('all')}
                >
                  Tất cả
                </Badge>
                <Badge 
                  variant={filterType === 'overdue' ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs ${filterType === 'overdue' ? 'bg-orange-600 text-white' : ''}`}
                  onClick={() => setFilterType('overdue')}
                >
                  Quá hạn
                </Badge>
                <Badge 
                  variant={filterType === 'high_debt' ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs ${filterType === 'high_debt' ? 'bg-red-600 text-white' : ''}`}
                  onClick={() => setFilterType('high_debt')}
                >
                  Nợ cao
                </Badge>
              </div>
              
              {/* Sort Options */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={sortBy === 'name' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('name')}
                  className={`min-w-[50px] sm:min-w-[60px] font-medium text-xs sm:text-sm ${
                    sortBy === 'name' 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Tên {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'debt' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('debt')}
                  className={`min-w-[50px] sm:min-w-[60px] font-medium text-xs sm:text-sm ${
                    sortBy === 'debt' 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Nợ {sortBy === 'debt' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'overdue' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('overdue')}
                  className={`min-w-[50px] sm:min-w-[60px] font-medium text-xs sm:text-sm ${
                    sortBy === 'overdue' 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Quá hạn {sortBy === 'overdue' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                
                <select 
                  value={itemsPerPage.toString()} 
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="h-8 px-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded focus:border-blue-400"
                >
                  <option value="24">24</option>
                  <option value="48">48</option>
                  <option value="96">96</option>
                  <option value="192">192</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
        {paginatedCustomers.map((customer) => {
          const debtLevel = getDebtLevel(customer.total_debt)
          
          return (
            <motion.div
              key={customer.customer_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="supabase-card p-3 sm:p-4 hover:shadow-lg transition-shadow"
            >
              {/* Customer Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm leading-tight text-gray-900 dark:text-white line-clamp-2">
                    {customer.customer_name}
                  </h3>
                  {customer.customer_type && (
                    <span className="inline-block mt-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                      {customer.customer_type}
                    </span>
                  )}
                </div>
                
                {/* Debt Level Badge */}
                <div className="ml-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${debtLevel.color}`}>
                    {debtLevel.text}
                  </span>
                </div>
              </div>

              {/* Debt Info */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Tổng nợ:</span>
                  <span className="font-bold text-sm text-red-600 dark:text-red-400">
                    {formatCurrency(customer.total_debt)}
                  </span>
                </div>
                
                {customer.overdue_debt > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Quá hạn:</span>
                    <span className="font-medium text-sm text-orange-600 dark:text-orange-400">
                      {formatCurrency(customer.overdue_debt)}
                    </span>
                  </div>
                )}
              </div>

              {/* Contact Info */}
              {(customer.phone || customer.address) && (
                <div className="space-y-1 mb-3 text-xs text-gray-600 dark:text-gray-400">
                  {customer.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      <span className="truncate">{customer.phone}</span>
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{customer.address}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Last Payment */}
              {customer.last_payment_date && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>TT cuối: {new Date(customer.last_payment_date).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  onClick={() => openPaymentModal(customer, 'payment')}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium text-xs h-7"
                >
                  <CreditCard className="h-3 w-3 mr-1" />
                  Thu nợ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openPaymentModal(customer, 'adjustment')}
                  className="h-7 w-7 p-0 hover:bg-blue-50 dark:hover:bg-blue-900"
                >
                  <Edit className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewHistory(customer)}
                  className="h-7 w-7 p-0 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Eye className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                </Button>
              </div>

              {/* Overdue Warning */}
              {customer.overdue_debt > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Có nợ quá hạn</span>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Empty State */}
      {paginatedCustomers.length === 0 && !loading && (
        <div className="text-center py-8">
          <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">
            {searchTerm ? `Không tìm thấy khách hàng cho "${searchTerm}"` : 'Không có khách hàng nào có công nợ'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center sm:text-left">
            Hiển thị {startIndex + 1} - {Math.min(startIndex + itemsPerPage, filteredCustomers.length)} trên {filteredCustomers.length} khách hàng
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 text-xs sm:text-sm px-3 py-2"
            >
              Trước
            </Button>
            <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 px-2">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 text-xs sm:text-sm px-3 py-2"
            >
              Sau
            </Button>
          </div>
        </div>
      )}

      {/* Debt History Modal */}
      {debtHistoryModal.isOpen && debtHistoryModal.customer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-800 rounded-lg p-4 w-full max-w-5xl max-h-[90vh] overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Lịch sử công nợ
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Xem chi tiết các giao dịch công nợ
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDebtHistoryModal({ isOpen: false, customer: null })}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Customer Info Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="lg:col-span-2 text-center lg:text-left">
                <p className="text-xs text-gray-600 dark:text-gray-400">Khách hàng</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  {debtHistoryModal.customer.customer_name}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 dark:text-gray-400">Tổng nợ hiện tại</p>
                <p className="text-base font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(debtHistoryModal.customer.total_debt)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 dark:text-gray-400">Nợ quá hạn</p>
                <p className="text-base font-bold text-orange-600 dark:text-orange-400">
                  {formatCurrency(debtHistoryModal.customer.overdue_debt)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 dark:text-gray-400">Thanh toán cuối</p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {debtHistoryModal.customer.last_payment_date 
                    ? new Date(debtHistoryModal.customer.last_payment_date).toLocaleDateString('vi-VN')
                    : 'Chưa có'
                  }
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 dark:text-gray-400">Số giao dịch</p>
                <p className="text-base font-bold text-blue-600 dark:text-blue-400">
                  {debtHistory.length}
                </p>
              </div>
            </div>

            {/* Transaction History */}
            <div className="overflow-y-auto max-h-[60vh]">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-sm text-gray-600">Đang tải...</span>
                </div>
              ) : debtHistory.length > 0 ? (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden lg:block">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Loại</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Thời gian</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Số tiền</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nợ trước</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nợ sau</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">PT/HĐ</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {debtHistory.map((transaction, index) => (
                          <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                transaction.transaction_type === 'debt_payment' 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : transaction.transaction_type === 'debt_increase'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              }`}>
                                {transaction.transaction_display}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                              {new Date(transaction.created_at).toLocaleString('vi-VN', {
                                day: '2-digit',
                                month: '2-digit', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-bold text-sm ${
                                transaction.amount > 0 
                                  ? 'text-green-600 dark:text-green-400' 
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {transaction.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(transaction.amount))}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-sm text-gray-600 dark:text-gray-400">
                              {formatCurrency(transaction.old_debt)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-sm">
                              {formatCurrency(transaction.new_debt)}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              <div className="space-y-1">
                                {transaction.payment_method && (
                                  <div className="text-gray-600 dark:text-gray-400">
                                    PT: {transaction.payment_method}
                                  </div>
                                )}
                                {transaction.invoice_code && (
                                  <div className="text-blue-600 dark:text-blue-400">
                                    HĐ: {transaction.invoice_code}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 max-w-xs">
                              <div className="truncate" title={transaction.notes || ''}>
                                {transaction.notes || '-'}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="lg:hidden space-y-2">
                    {debtHistory.map((transaction, index) => (
                      <div
                        key={index}
                        className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {/* Header row with type and date */}
                            <div className="flex items-center justify-between mb-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                transaction.transaction_type === 'debt_payment' 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : transaction.transaction_type === 'debt_increase'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              }`}>
                                {transaction.transaction_display}
                              </span>
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                {new Date(transaction.created_at).toLocaleString('vi-VN')}
                              </span>
                            </div>
                            
                            {/* Compact info grid */}
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div>
                                <p className="text-gray-600 dark:text-gray-400 mb-1">Số tiền</p>
                                <p className={`font-bold ${
                                  transaction.amount > 0 
                                    ? 'text-green-600 dark:text-green-400' 
                                    : 'text-red-600 dark:text-red-400'
                                }`}>
                                  {transaction.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(transaction.amount))}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600 dark:text-gray-400 mb-1">Nợ trước</p>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {formatCurrency(transaction.old_debt)}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600 dark:text-gray-400 mb-1">Nợ sau</p>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {formatCurrency(transaction.new_debt)}
                                </p>
                              </div>
                            </div>

                            {/* Additional info row */}
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-4">
                                {transaction.payment_method && (
                                  <span className="text-gray-600 dark:text-gray-400">
                                    PT: {transaction.payment_method}
                                  </span>
                                )}
                                {transaction.invoice_code && (
                                  <span className="text-blue-600 dark:text-blue-400">
                                    HĐ: {transaction.invoice_code}
                                  </span>
                                )}
                              </div>
                            </div>

                            {transaction.notes && (
                              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-600 rounded text-xs">
                                <p className="text-gray-900 dark:text-white">{transaction.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">Chưa có lịch sử giao dịch</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Payment/Adjustment Modal */}
      {paymentModal.isOpen && paymentModal.customer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {paymentModal.type === 'payment' ? 'Thu nợ khách hàng' : 'Điều chỉnh công nợ'}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={closePaymentModal}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Khách hàng</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">{paymentModal.customer.customer_name}</p>
                <p className="text-sm font-medium text-red-600">
                  Nợ hiện tại: {formatCurrency(paymentModal.customer.total_debt)}
                </p>
              </div>

              {paymentModal.type === 'payment' ? (
                <>
                  <div>
                    <Label htmlFor="payment-amount" className="text-sm font-medium">
                      Số tiền thu (VNĐ)
                    </Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Nhập số tiền..."
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="payment-note" className="text-sm font-medium">
                      Ghi chú (tùy chọn)
                    </Label>
                    <Textarea
                      id="payment-note"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="Ghi chú về thanh toán..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handlePayment}
                      disabled={!paymentAmount}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Thu nợ
                    </Button>
                    <Button
                      variant="outline"
                      onClick={closePaymentModal}
                      className="flex-1"
                    >
                      Hủy
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-sm font-medium">Loại điều chỉnh</Label>
                    <Select value={adjustmentType} onValueChange={(value: 'increase' | 'decrease') => setAdjustmentType(value)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="decrease">Giảm nợ</SelectItem>
                        <SelectItem value="increase">Tăng nợ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="adjustment-amount" className="text-sm font-medium">
                      Số tiền điều chỉnh (VNĐ)
                    </Label>
                    <Input
                      id="adjustment-amount"
                      type="number"
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(e.target.value)}
                      placeholder="Nhập số tiền..."
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="adjustment-reason" className="text-sm font-medium">
                      Lý do điều chỉnh
                    </Label>
                    <Textarea
                      id="adjustment-reason"
                      value={adjustmentReason}
                      onChange={(e) => setAdjustmentReason(e.target.value)}
                      placeholder="Nhập lý do điều chỉnh..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleAdjustment}
                      disabled={!adjustmentAmount || !adjustmentReason}
                      className={adjustmentType === 'increase' ? 'flex-1 bg-red-600 hover:bg-red-700' : 'flex-1 bg-blue-600 hover:bg-blue-700'}
                    >
                      {adjustmentType === 'increase' ? 'Tăng nợ' : 'Giảm nợ'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={closePaymentModal}
                      className="flex-1"
                    >
                      Hủy
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}