'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { 
  Search, 
  Receipt, 
  AlertTriangle,
  Plus,
  Download,
  User,
  Calendar,
  Clock,
  CheckCircle,
  Eye
} from 'lucide-react'

// Invoice interface matching database schema
interface VeterinaryInvoice {
  invoice_id: number
  invoice_code: string
  invoice_date: string
  customer_name: string
  total_amount: number
  customer_paid: number
  status: string
  branch_id: number
  notes: string | null
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<VeterinaryInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'completed' | 'pending'>('all')
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [totalCount, setTotalCount] = useState<number>(0)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(24)

  const supabase = createClient()

  // Fetch invoices function
  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Get total count
      let countQuery = supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })

      if (filterType === 'completed') {
        countQuery = countQuery.eq('status', 'completed')
      } else if (filterType === 'pending') {
        countQuery = countQuery.eq('status', 'pending')
      }

      if (searchTerm) {
        countQuery = countQuery.or(`invoice_code.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%`)
      }

      const { count } = await countQuery
      setTotalCount(count || 0)

      // Main query with sorting
      let query = supabase
        .from('invoices')
        .select('*')

      // Apply filters
      if (filterType === 'completed') {
        query = query.eq('status', 'completed')
      } else if (filterType === 'pending') {
        query = query.eq('status', 'pending')
      }

      // Search
      if (searchTerm) {
        query = query.or(`invoice_code.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%`)
      }

      // Sorting
      const sortField = sortBy === 'date' ? 'invoice_date' : sortBy === 'amount' ? 'total_amount' : 'customer_name'
      query = query.order(sortField, { ascending: sortOrder === 'asc' })

      // Pagination
      const startIndex = (currentPage - 1) * itemsPerPage
      query = query.range(startIndex, startIndex + itemsPerPage - 1)

      const { data, error: fetchError } = await query

      if (fetchError) {
        setError(`Database error: ${fetchError.message}`)
        return
      }

      setInvoices(data || [])
    } catch {
      setError('Không thể tải danh sách hóa đơn')
    } finally {
      setLoading(false)
    }
  }, [filterType, searchTerm, supabase, currentPage, itemsPerPage, sortBy, sortOrder])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  useEffect(() => {
    setCurrentPage(1)
  }, [filterType, searchTerm])

  // Helper functions
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN')
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return { label: 'Hoàn thành', color: 'default' as const }
      case 'pending':
        return { label: 'Chờ xử lý', color: 'secondary' as const }
      default:
        return { label: 'Chờ xử lý', color: 'secondary' as const }
    }
  }

  const handleSort = (field: 'date' | 'amount' | 'customer') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  // Calculate stats from real data
  const stats = {
    total: totalCount,
    completed: invoices.filter(i => i.status === 'completed').length,
    pending: invoices.filter(i => i.status === 'pending').length,
    totalRevenue: invoices.reduce((sum, inv) => sum + (inv.customer_paid || 0), 0)
  }

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600 dark:text-gray-400">Đang tải hóa đơn...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Quản lý Hóa đơn</h1>
        
        <div className="supabase-card p-6">
          <div className="flex items-center space-x-4">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <div>
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">Có lỗi xảy ra</h3>
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        </div>
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
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Quản lý Hóa đơn</h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Quản lý {stats.total} hóa đơn bán hàng</p>
            </div>
            
            <div className="flex items-center gap-2">
              <Link href="/dashboard/pos">
                <Button className="bg-green-600 hover:bg-green-700 text-white font-medium text-sm px-3 py-2">
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Tạo hóa đơn</span>
                  <span className="sm:hidden">Tạo</span>
                </Button>
              </Link>
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
              <div className="text-lg sm:text-2xl font-bold">{stats.total}</div>
              <div className="text-xs sm:text-sm opacity-90">Tổng hóa đơn</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{stats.completed}</div>
              <div className="text-xs sm:text-sm opacity-90">Hoàn thành</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{stats.pending}</div>
              <div className="text-xs sm:text-sm opacity-90">Chờ xử lý</div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{formatPrice(stats.totalRevenue).replace('₫', '')}</div>
              <div className="text-xs sm:text-sm opacity-90">Doanh thu</div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Tìm hóa đơn theo mã hoặc khách hàng..."
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
                  variant={filterType === 'completed' ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs ${filterType === 'completed' ? 'bg-green-600 text-white' : ''}`}
                  onClick={() => setFilterType('completed')}
                >
                  Hoàn thành
                </Badge>
                <Badge 
                  variant={filterType === 'pending' ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs ${filterType === 'pending' ? 'bg-orange-600 text-white' : ''}`}
                  onClick={() => setFilterType('pending')}
                >
                  Chờ xử lý
                </Badge>
              </div>
              
              {/* Sort Options */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={sortBy === 'date' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('date')}
                  className={`min-w-[50px] sm:min-w-[60px] font-medium text-xs sm:text-sm ${
                    sortBy === 'date' 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Ngày {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'amount' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('amount')}
                  className={`min-w-[50px] sm:min-w-[60px] font-medium text-xs sm:text-sm ${
                    sortBy === 'amount' 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Tiền {sortBy === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'customer' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('customer')}
                  className={`min-w-[50px] sm:min-w-[60px] font-medium text-xs sm:text-sm ${
                    sortBy === 'customer' 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  KH {sortBy === 'customer' && (sortOrder === 'asc' ? '↑' : '↓')}
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

      {/* Invoices Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
        {invoices.map((invoice) => {
          const statusBadge = getStatusBadge(invoice.status)
          const remainingAmount = invoice.total_amount - invoice.customer_paid
          const isFullyPaid = remainingAmount === 0
          
          return (
            <div
              key={invoice.invoice_id}
              className="supabase-card p-3 sm:p-4 hover:shadow-lg transition-shadow cursor-pointer"
            >
              {/* Invoice Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <Link 
                    href={`/dashboard/invoices/${invoice.invoice_id}`}
                    className="block hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <h3 className="font-semibold text-sm leading-tight text-gray-900 dark:text-white truncate">
                      {invoice.invoice_code}
                    </h3>
                  </Link>
                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 mt-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(invoice.invoice_date)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadge.color} className="text-xs px-2 py-1">
                    {statusBadge.label}
                  </Badge>
                  <Link href={`/dashboard/invoices/${invoice.invoice_id}`}>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900"
                      title="Xem chi tiết"
                    >
                      <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Customer Info */}
              <div className="flex items-center gap-1 mb-3">
                <User className="h-3 w-3 text-gray-400" />
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate font-medium">
                  {invoice.customer_name}
                </span>
              </div>

              {/* Financial Info */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-bold text-green-600 dark:text-green-400">
                      {formatPrice(invoice.total_amount)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Đã trả: {formatPrice(invoice.customer_paid)}
                    </div>
                    {remainingAmount > 0 && (
                      <div className="text-xs text-red-600 dark:text-red-400">
                        Còn lại: {formatPrice(remainingAmount)}
                      </div>
                    )}
                  </div>
                  
                  {/* Payment Status Icon */}
                  <div className="flex items-center gap-1">
                    {isFullyPaid ? (
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Branch & Payment Status */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Chi nhánh: {invoice.branch_id}
                </span>
                <Badge 
                  variant={isFullyPaid ? 'default' : 'destructive'} 
                  className="text-xs px-2 py-1"
                >
                  {isFullyPaid ? 'Đã TT' : 'Chưa TT'}
                </Badge>
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {invoice.notes}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {invoices.length === 0 && !loading && (
        <div className="text-center py-8">
          <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {searchTerm ? `Không tìm thấy hóa đơn cho "${searchTerm}"` : 'Không có hóa đơn nào'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center sm:text-left">
            Hiển thị {startIndex + 1} - {Math.min(startIndex + itemsPerPage, totalCount)} trên {totalCount} hóa đơn
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
    </div>
  )
}
