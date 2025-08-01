'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Download, 
  Search, 
  AlertTriangle,
  Phone,
  Mail,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Filter,
  Truck,
  UserCheck
} from 'lucide-react'

// 🐾 Supplier interface matching database schema and analytics insights
interface VeterinarySupplier {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  phone: string | null
  email: string | null
  address: string | null
  contact_person: string | null
  tax_code: string | null
  payment_terms: number | null
  notes: string | null
  is_active: boolean
  created_at: string
}

export default function VeterinarySuppliersPage() {
  const [suppliers, setSuppliers] = useState<VeterinarySupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'complete' | 'incomplete' | 'standard_terms' | 'custom_terms'>('all')
  const [totalCount, setTotalCount] = useState<number>(0)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  
  // Sorting states
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'terms' | 'contact'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const supabase = createClient()

  // 🐾 Core API Call: Fetch veterinary suppliers with analytics insights
  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // First, get total count for filtered suppliers
      let countQuery = supabase
        .from('suppliers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      // Apply same filters to count query
      if (filterType === 'complete') {
        countQuery = countQuery.not('phone', 'is', null).not('email', 'is', null).not('address', 'is', null)
      } else if (filterType === 'incomplete') {
        countQuery = countQuery.or('phone.is.null,email.is.null,address.is.null')
      } else if (filterType === 'standard_terms') {
        countQuery = countQuery.eq('payment_terms', 30)
      } else if (filterType === 'custom_terms') {
        countQuery = countQuery.neq('payment_terms', 30)
      }

      // Apply search to count query
      if (searchTerm) {
        countQuery = countQuery.or(`supplier_name.ilike.%${searchTerm}%,supplier_code.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
      }

      const { count: filteredCount } = await countQuery
      setTotalCount(filteredCount || 0)

      // Main query with pagination and sorting
      let query = supabase
        .from('suppliers')
        .select(`
          supplier_id,
          supplier_code,
          supplier_name,
          phone,
          email,
          address,
          contact_person,
          tax_code,
          payment_terms,
          notes,
          is_active,
          created_at
        `)
        .eq('is_active', true)

      // Apply sorting based on business insights
      const sortColumn = sortBy === 'name' ? 'supplier_name' 
                       : sortBy === 'created' ? 'created_at'
                       : sortBy === 'terms' ? 'payment_terms'
                       : sortBy === 'contact' ? 'contact_person'
                       : 'supplier_name'
      
      query = query.order(sortColumn, { ascending: sortOrder === 'asc' })

      // Apply veterinary business filters based on analytics insights
      if (filterType === 'complete') {
        // Complete suppliers: have phone, email, and address
        query = query.not('phone', 'is', null).not('email', 'is', null).not('address', 'is', null)
      } else if (filterType === 'incomplete') {
        // Incomplete data: missing critical contact info
        query = query.or('phone.is.null,email.is.null,address.is.null')
      } else if (filterType === 'standard_terms') {
        // Standard payment terms: 30 days (100% of suppliers based on analytics)
        query = query.eq('payment_terms', 30)
      } else if (filterType === 'custom_terms') {
        // Custom payment terms: not 30 days
        query = query.neq('payment_terms', 30)
      }

      // Search functionality - veterinary specific
      if (searchTerm) {
        query = query.or(`supplier_name.ilike.%${searchTerm}%,supplier_code.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,contact_person.ilike.%${searchTerm}%`)
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

      setSuppliers(data || [])
    } catch (err) {
      console.error('Suppliers fetch error:', err)
      setError('Không thể tải danh sách nhà cung cấp')
    } finally {
      setLoading(false)
    }
  }, [filterType, searchTerm, supabase, currentPage, itemsPerPage, sortBy, sortOrder])

  // Load suppliers on component mount and when filters change
  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filterType, searchTerm, sortBy, sortOrder])

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / itemsPerPage)
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalCount)

  // Sorting handler
  const handleSort = (column: 'name' | 'created' | 'terms' | 'contact') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  // 🚨 Veterinary business logic functions based on analytics insights
  const getDataCompleteness = (supplier: VeterinarySupplier) => {
    const fields = [supplier.phone, supplier.email, supplier.address, supplier.contact_person, supplier.tax_code]
    const completedFields = fields.filter(field => field && field.toString().trim() !== '').length
    const percentage = (completedFields / fields.length) * 100
    
    if (percentage >= 80) return { label: 'Complete', color: 'default' as const }
    if (percentage >= 60) return { label: 'Good', color: 'secondary' as const }
    if (percentage >= 40) return { label: 'Partial', color: 'outline' as const }
    return { label: 'Incomplete', color: 'destructive' as const }
  }

  // Payment terms assessment
  const getPaymentTermsStatus = (terms: number | null) => {
    if (!terms) return { label: 'Not Set', color: 'destructive' as const }
    if (terms === 30) return { label: 'Standard', color: 'default' as const }
    if (terms < 30) return { label: 'Fast', color: 'secondary' as const }
    return { label: 'Extended', color: 'outline' as const }
  }

  // Statistics for dashboard based on analytics insights
  const stats = {
    total: suppliers.length,
    complete: suppliers.filter(s => s.phone && s.email && s.address).length,
    incomplete: suppliers.filter(s => !s.phone || !s.email || !s.address).length,
    standardTerms: suppliers.filter(s => s.payment_terms === 30).length,
    customTerms: suppliers.filter(s => s.payment_terms && s.payment_terms !== 30).length
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-green-600 bg-clip-text text-transparent">🐾 Quản lý Nhà cung cấp Thú y</h1>
        </div>
        
        <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 via-red-50 to-rose-50 ring-2 ring-red-200/50 rounded-xl backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-full shadow-lg">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-800">Lỗi tải dữ liệu</h3>
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
                <Truck className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-green-600 bg-clip-text text-transparent">Nhà cung cấp</h1>
                <p className="text-xs text-gray-500">{totalCount} nhà cung cấp</p>
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
              <div className="text-xs opacity-90">Tổng NCC</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.complete}</div>
              <div className="text-xs opacity-90">Đầy đủ</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.incomplete}</div>
              <div className="text-xs opacity-90">Thiếu TT</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.standardTerms}</div>
              <div className="text-xs opacity-90">TT chuẩn</div>
            </div>
          </div>

          {/* Compact Search and Controls */}
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Tìm nhà cung cấp..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-8 border-white/30 bg-white/60 backdrop-blur-sm focus:border-blue-400 focus:ring-blue-400/30 rounded-lg shadow-sm text-sm"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {/* Filter Buttons */}
              <div className="flex gap-1">
                <Button 
                  variant={filterType === 'all' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setFilterType('all')}
                  className="h-6 px-1.5 text-xs"
                >
                  Tất cả
                </Button>
                <Button 
                  variant={filterType === 'complete' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setFilterType('complete')}
                  className="h-6 px-1.5 text-xs"
                >
                  Đầy đủ
                </Button>
                <Button 
                  variant={filterType === 'incomplete' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setFilterType('incomplete')}
                  className="h-6 px-1.5 text-xs"
                >
                  Thiếu TT
                </Button>
                <Button 
                  variant={filterType === 'standard_terms' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setFilterType('standard_terms')}
                  className="h-6 px-1.5 text-xs"
                >
                  TT chuẩn
                </Button>
              </div>
              
              {/* Sort Controls */}
              <div className="flex items-center gap-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleSort('name')}
                  className="h-6 px-1.5 text-xs"
                >
                  Tên {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleSort('terms')}
                  className="h-6 px-1.5 text-xs"
                >
                  TT {sortBy === 'terms' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleSort('created')}
                  className="h-6 px-1.5 text-xs"
                >
                  Ngày {sortBy === 'created' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Suppliers Grid */}
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
        // Ultra Dense Suppliers Grid - Veterinary Business Focus
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {suppliers.map((supplier) => {
            const dataCompletion = getDataCompleteness(supplier)
            const paymentTermsStatus = getPaymentTermsStatus(supplier.payment_terms)
            
            return (
              <Card 
                key={supplier.supplier_id} 
                className="group border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 bg-white/95 backdrop-blur-lg overflow-hidden rounded-lg ring-1 ring-gray-100/50 hover:ring-blue-200/50"
              >
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-green-500"></div>
                
                <CardHeader className="pb-1 pt-2 px-2">
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-gray-900 truncate">{supplier.supplier_name}</h3>
                      <p className="text-xs text-gray-500 truncate">{supplier.supplier_code}</p>
                    </div>
                    <Badge variant={dataCompletion.color} className="text-xs h-4 px-1">
                      {dataCompletion.label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-2 pt-1 space-y-2">
                  {/* Contact Information */}
                  <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-green-50 rounded-md p-2">
                    <div className="space-y-1">
                      {supplier.contact_person && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <UserCheck className="h-3 w-3" />
                          <span className="truncate">{supplier.contact_person}</span>
                        </div>
                      )}
                      {supplier.phone && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Phone className="h-3 w-3" />
                          <span className="truncate">{supplier.phone}</span>
                        </div>
                      )}
                      {supplier.email && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{supplier.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Payment Terms */}
                  <div className="bg-white/60 rounded-md p-1.5 text-center">
                    <Badge variant={paymentTermsStatus.color} className="text-xs h-4 px-2">
                      {supplier.payment_terms ? `${supplier.payment_terms} ngày` : 'Chưa set'}
                    </Badge>
                    <p className="text-xs text-gray-500 mt-0.5">{paymentTermsStatus.label}</p>
                  </div>

                  {/* Quick Info Tags */}
                  <div className="flex flex-wrap gap-0.5">
                    {supplier.tax_code && (
                      <Badge variant="outline" className="text-xs h-4 px-1">MST</Badge>
                    )}
                    {supplier.address && (
                      <Badge variant="outline" className="text-xs h-4 px-1">Địa chỉ</Badge>
                    )}
                    {supplier.notes && (
                      <Badge variant="outline" className="text-xs h-4 px-1">Ghi chú</Badge>
                    )}
                  </div>

                  {/* Creation Date */}
                  <div className="border-t border-gray-100 pt-1.5 mt-1.5">
                    <p className="text-xs text-gray-400 text-center">
                      {new Date(supplier.created_at).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Professional Pagination */}
      {!loading && suppliers.length > 0 && totalPages > 1 && (
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-xl ring-1 ring-gray-100/50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                Hiển thị <span className="font-semibold">{startItem}</span> đến{' '}
                <span className="font-semibold">{endItem}</span> trong tổng số{' '}
                <span className="font-semibold">{totalCount}</span> nhà cung cấp
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
                
                <span className="px-4 py-2 text-sm font-medium">
                  {currentPage} / {totalPages}
                </span>
                
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
      {!loading && suppliers.length > 0 && suppliers.length < totalCount && totalPages <= 1 && (
        <Card className="text-center py-6 border-0 shadow-lg bg-gradient-to-r from-blue-50 via-indigo-50 to-green-50 backdrop-blur-xl rounded-xl ring-1 ring-blue-100/50">
          <CardContent>
            <div className="flex flex-col items-center space-y-2">
              <div className="p-2 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full">
                <Truck className="h-8 w-8 text-blue-600" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-blue-800">Hiển thị {suppliers.length} nhà cung cấp</h3>
                <p className="text-sm text-blue-600">Tổng cộng có {totalCount} nhà cung cấp trong hệ thống</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Empty State */}
      {!loading && suppliers.length === 0 && (
        <Card className="text-center py-16 border-0 shadow-lg bg-white/80 backdrop-blur-xl rounded-xl ring-1 ring-gray-100/50">
          <CardContent>
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-gradient-to-br from-gray-100 to-slate-100 rounded-full shadow-inner">
                <Truck className="h-12 w-12 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-700">Không tìm thấy nhà cung cấp</h3>
                <p className="text-gray-500">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
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
