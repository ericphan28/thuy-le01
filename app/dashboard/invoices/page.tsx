'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
  Search, 
  Receipt, 
  AlertTriangle, 
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Download,
  User,
  Calendar,
  DollarSign
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
  const [totalCount, setTotalCount] = useState<number>(0)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

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

      // Main query
      let query = supabase
        .from('invoices')
        .select('*')
        .order('invoice_date', { ascending: false })

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
  }, [filterType, searchTerm, supabase, currentPage, itemsPerPage])

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

  // Statistics
  const stats = {
    total: totalCount,
    completed: invoices.filter(i => i.status === 'completed').length,
    pending: invoices.filter(i => i.status === 'pending').length
  }

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / itemsPerPage)
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalCount)

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-green-600 bg-clip-text text-transparent">
          🧾 Quản lý Hóa đơn
        </h1>
        
        <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 via-red-50 to-rose-50 ring-2 ring-red-200/50 rounded-xl backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-green-600 bg-clip-text text-transparent">
          🧾 Quản lý Hóa đơn
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
            <Download className="h-3 w-3 mr-1" />
            Xuất Excel
          </Button>
          <Button size="sm" className="h-8 px-3 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            Tạo hóa đơn
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 via-blue-50 to-cyan-50 ring-2 ring-blue-200/50 rounded-xl backdrop-blur-xl">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-700">Tổng hóa đơn</p>
                <p className="text-lg font-bold text-blue-900">{stats.total.toLocaleString('vi-VN')}</p>
              </div>
              <Receipt className="h-4 w-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-br from-green-50 via-green-50 to-emerald-50 ring-2 ring-green-200/50 rounded-xl backdrop-blur-xl">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-green-700">Hoàn thành</p>
                <p className="text-lg font-bold text-green-900">{stats.completed.toLocaleString('vi-VN')}</p>
              </div>
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-br from-yellow-50 via-yellow-50 to-orange-50 ring-2 ring-yellow-200/50 rounded-xl backdrop-blur-xl">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-yellow-700">Chờ xử lý</p>
                <p className="text-lg font-bold text-yellow-900">{stats.pending.toLocaleString('vi-VN')}</p>
              </div>
              <Calendar className="h-4 w-4 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-gradient-to-r from-white/80 via-white/90 to-white/80 backdrop-blur-xl rounded-xl border-0 shadow-lg ring-2 ring-white/50">
        <div className="p-3">
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Search Input */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-1.5 h-3 w-3 text-gray-400" />
                <Input
                  placeholder="Tìm mã hóa đơn, khách hàng..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-6 pl-7 pr-3 text-xs"
                />
              </div>
            </div>
            
            {/* Filter Pills */}
            <div className="flex items-center gap-1">
              <Badge 
                variant={filterType === 'all' ? 'default' : 'outline'}
                className="cursor-pointer px-1.5 py-0.5 text-xs"
                onClick={() => setFilterType('all')}
              >
                Tất cả
              </Badge>
              <Badge 
                variant={filterType === 'completed' ? 'default' : 'outline'}
                className="cursor-pointer px-1.5 py-0.5 text-xs"
                onClick={() => setFilterType('completed')}
              >
                Hoàn thành
              </Badge>
              <Badge 
                variant={filterType === 'pending' ? 'default' : 'outline'}
                className="cursor-pointer px-1.5 py-0.5 text-xs"
                onClick={() => setFilterType('pending')}
              >
                Chờ xử lý
              </Badge>
              
              <select 
                value={itemsPerPage} 
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="h-6 px-1 text-xs border rounded"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Invoices Grid */}
      {loading ? (
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {[...Array(12)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-2">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-8 bg-gray-200 rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {invoices.map((invoice) => {
            const statusBadge = getStatusBadge(invoice.status)
            const remainingAmount = invoice.total_amount - invoice.customer_paid
            
            return (
              <Card 
                key={invoice.invoice_id} 
                className="group border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 bg-white/95 backdrop-blur-lg overflow-hidden rounded-lg"
              >
                <CardHeader className="pb-1 pt-2 px-2">
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-bold text-gray-900 truncate">
                        {invoice.invoice_code}
                      </CardTitle>
                      <p className="text-xs text-gray-500 truncate">
                        <Calendar className="inline h-3 w-3 mr-1" />
                        {formatDate(invoice.invoice_date)}
                      </p>
                    </div>
                    <Badge variant={statusBadge.color} className="text-xs px-1.5 py-0.5">
                      {statusBadge.label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="px-2 pb-2 pt-0">
                  {/* Customer Info */}
                  <div className="flex items-center gap-1 mb-2">
                    <User className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-600 truncate font-medium">
                      {invoice.customer_name}
                    </span>
                  </div>

                  {/* Financial Info */}
                  <div className="space-y-1 mb-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Tổng tiền:</span>
                      <span className="text-xs font-bold text-green-600">
                        {formatPrice(invoice.total_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Đã trả:</span>
                      <span className="text-xs font-semibold text-blue-600">
                        {formatPrice(invoice.customer_paid)}
                      </span>
                    </div>
                    {remainingAmount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Còn lại:</span>
                        <span className="text-xs font-semibold text-red-600">
                          {formatPrice(remainingAmount)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Branch Info */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Chi nhánh: {invoice.branch_id}</span>
                    {remainingAmount === 0 ? (
                      <Badge variant="default" className="text-xs px-1.5 py-0.5">
                        Đã thanh toán
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                        Chưa thanh toán
                      </Badge>
                    )}
                  </div>

                  {/* Notes */}
                  {invoice.notes && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {invoice.notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-xl rounded-xl border-0 shadow-lg ring-2 ring-white/50 p-3">
          <div className="text-xs text-gray-600">
            Hiển thị {startItem} - {endItem} / {totalCount} hóa đơn
          </div>
          
          <div className="flex items-center space-x-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-7 w-7 p-0"
            >
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-3 w-3" />
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
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="h-7 w-7 p-0 text-xs"
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
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-7 w-7 p-0"
            >
              <ChevronsRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
