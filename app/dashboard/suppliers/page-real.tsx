'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
  Search, 
  Building2, 
  Plus,
  Download,
  Edit2,
  Trash2,
  Phone,
  Mail,
  MapPin,
  User,
  Calendar,
  CreditCard
} from 'lucide-react'

interface Supplier {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  tax_code?: string
  payment_terms?: number
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'created'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const supabase = createClient()

  // Fetch suppliers từ Supabase
  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabase
        .from('suppliers')
        .select(`
          supplier_id,
          supplier_code,
          supplier_name,
          contact_person,
          phone,
          email,
          address,
          tax_code,
          payment_terms,
          notes,
          is_active,
          created_at,
          updated_at  
        `)
        .order('supplier_name', { ascending: true })

      if (error) {
        console.error('Error fetching suppliers:', error)
        return
      }

      setSuppliers(data || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN')
  }

  const getPaymentTermsText = (days?: number) => {
    if (!days || days === 0) return 'Thanh toán ngay'
    return `${days} ngày`
  }

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         supplier.supplier_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (supplier.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
    
    if (filterStatus === 'active') return matchesSearch && supplier.is_active
    if (filterStatus === 'inactive') return matchesSearch && !supplier.is_active
    
    return matchesSearch
  })

  const sortedSuppliers = [...filteredSuppliers].sort((a, b) => {
    let aVal: string | number, bVal: string | number
    
    switch (sortBy) {
      case 'code':
        aVal = a.supplier_code
        bVal = b.supplier_code
        break
      case 'created':
        aVal = new Date(a.created_at).getTime()
        bVal = new Date(b.created_at).getTime()
        break
      default:
        aVal = a.supplier_name
        bVal = b.supplier_name
    }
    
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1
    } else {
      return aVal < bVal ? 1 : -1
    }
  })

  const totalPages = Math.ceil(sortedSuppliers.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedSuppliers = sortedSuppliers.slice(startIndex, startIndex + itemsPerPage)

  const handleSort = (field: 'name' | 'code' | 'created') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const handleEdit = (supplier: Supplier) => {
    console.log('Edit supplier:', supplier)
  }

  const handleDelete = (id: number) => {
    console.log('Delete supplier:', id)
  }

  // Calculate stats from real data
  const stats = {
    total: suppliers.length,
    active: suppliers.filter(s => s.is_active).length,
    inactive: suppliers.filter(s => !s.is_active).length,
    hasEmail: suppliers.filter(s => s.email && s.email.trim() !== '').length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600 dark:text-gray-400">Đang tải nhà cung cấp...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="supabase-card">
        <div className="flex flex-col gap-4">
          {/* Title and Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quản lý Nhà cung cấp</h1>
              <p className="text-gray-600 dark:text-gray-400">Quản lý {stats.total} nhà cung cấp</p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button className="supabase-button">
                <Plus className="h-4 w-4 mr-2" />
                Thêm nhà cung cấp
              </Button>
              <Button variant="outline" className="supabase-button">
                <Download className="h-4 w-4 mr-2" />
                Xuất Excel
              </Button>
            </div>
          </div>

          {/* Real Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm opacity-90">Tổng nhà cung cấp</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.active}</div>
              <div className="text-sm opacity-90">Đang hoạt động</div>
            </div>
            <div className="bg-gradient-to-r from-gray-500 to-slate-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.inactive}</div>
              <div className="text-sm opacity-90">Ngừng hoạt động</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.hasEmail}</div>
              <div className="text-sm opacity-90">Có email</div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Tìm nhà cung cấp theo tên, mã hoặc người liên hệ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 supabase-input"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {/* Filter Badges */}
              <div className="flex gap-2">
                <Badge 
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  className={`cursor-pointer ${filterStatus === 'all' ? 'bg-blue-600 text-white' : ''}`}
                  onClick={() => setFilterStatus('all')}
                >
                  Tất cả
                </Badge>
                <Badge 
                  variant={filterStatus === 'active' ? 'default' : 'outline'}
                  className={`cursor-pointer ${filterStatus === 'active' ? 'bg-green-600 text-white' : ''}`}
                  onClick={() => setFilterStatus('active')}
                >
                  Hoạt động
                </Badge>
                <Badge 
                  variant={filterStatus === 'inactive' ? 'default' : 'outline'}
                  className={`cursor-pointer ${filterStatus === 'inactive' ? 'bg-gray-600 text-white' : ''}`}
                  onClick={() => setFilterStatus('inactive')}
                >
                  Ngưng hoạt động
                </Badge>
              </div>
              
              {/* Sort Options */}
              <div className="flex items-center gap-2">
                <Button
                  variant={sortBy === 'name' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('name')}
                  className="supabase-button"
                >
                  Tên {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'code' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('code')}
                  className="supabase-button"
                >
                  Mã {sortBy === 'code' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'created' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('created')}
                  className="supabase-button"
                >
                  Ngày tạo {sortBy === 'created' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                
                <select 
                  value={itemsPerPage.toString()} 
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="h-8 px-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded focus:border-blue-400"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Suppliers Cards */}
      <div className="space-y-4">
        {paginatedSuppliers.map((supplier) => (
          <div key={supplier.supplier_id} className="supabase-card p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              {/* Main Info */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    <Building2 className="h-6 w-6" />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {supplier.supplier_name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span>Mã: {supplier.supplier_code}</span>
                      <Badge 
                        variant={supplier.is_active ? 'default' : 'secondary'}
                        className={supplier.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : ''}
                      >
                        {supplier.is_active ? 'Hoạt động' : 'Ngưng hoạt động'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Contact Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  {supplier.contact_person && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <User className="h-4 w-4 text-blue-500" />
                      <span>{supplier.contact_person}</span>
                    </div>
                  )}
                  
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Phone className="h-4 w-4 text-green-500" />
                      <span>{supplier.phone}</span>
                    </div>
                  )}
                  
                  {supplier.email && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Mail className="h-4 w-4 text-orange-500" />
                      <span className="truncate">{supplier.email}</span>
                    </div>
                  )}
                  
                  {supplier.address && (
                    <div className="flex items-start gap-2 text-gray-600 dark:text-gray-400 md:col-span-2">
                      <MapPin className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{supplier.address}</span>
                    </div>
                  )}
                  
                  {supplier.payment_terms !== undefined && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <CreditCard className="h-4 w-4 text-purple-500" />
                      <span>Thanh toán: {getPaymentTermsText(supplier.payment_terms)}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span>Tạo: {formatDate(supplier.created_at)}</span>
                  </div>
                </div>

                {/* Tax Code */}
                {supplier.tax_code && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Mã số thuế:</span> {supplier.tax_code}
                  </div>
                )}

                {/* Notes */}
                {supplier.notes && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Ghi chú:</span> 
                    <span className="ml-1 line-clamp-2">{supplier.notes}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(supplier)}
                  className="hover:bg-blue-50 dark:hover:bg-blue-900"
                >
                  <Edit2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(supplier.supplier_id)}
                  className="hover:bg-red-50 dark:hover:bg-red-900"
                >
                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {paginatedSuppliers.length === 0 && !loading && (
        <div className="text-center py-8">
          <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">
            {searchTerm ? `Không tìm thấy nhà cung cấp cho "${searchTerm}"` : 'Không có nhà cung cấp nào'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Hiển thị {startIndex + 1} - {Math.min(startIndex + itemsPerPage, sortedSuppliers.length)} trên {sortedSuppliers.length} nhà cung cấp
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="supabase-button"
            >
              Trước
            </Button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Trang {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="supabase-button"
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
