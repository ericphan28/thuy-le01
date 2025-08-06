'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SupplierFormModal } from '@/components/suppliers/supplier-form-modal'
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
  const [itemsPerPage, setItemsPerPage] = useState(24) // Tăng số lượng hiển thị
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)

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
    setEditingSupplier(supplier)
    setShowEditModal(true)
  }

  const handleDelete = (id: number) => {
    console.log('Delete supplier:', id)
  }

  const handleAddSupplier = () => {
    setShowAddModal(true)
  }

  const handleModalSuccess = () => {
    fetchSuppliers() // Refresh data after successful operation
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Quản lý Nhà cung cấp</h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Quản lý {stats.total} nhà cung cấp</p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                onClick={handleAddSupplier}
                className="bg-green-600 hover:bg-green-700 text-white font-medium text-sm px-3 py-2"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Thêm nhà cung cấp</span>
                <span className="sm:hidden">Thêm</span>
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
              <div className="text-lg sm:text-2xl font-bold">{stats.total}</div>
              <div className="text-xs sm:text-sm opacity-90">Tổng nhà cung cấp</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{stats.active}</div>
              <div className="text-xs sm:text-sm opacity-90">Đang hoạt động</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{stats.inactive}</div>
              <div className="text-xs sm:text-sm opacity-90">Ngừng hoạt động</div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold">{stats.hasEmail}</div>
              <div className="text-xs sm:text-sm opacity-90">Có email</div>
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
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2">
              {/* Filter Badges */}
              <div className="flex gap-2 flex-wrap">
                <Badge 
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs ${filterStatus === 'all' ? 'bg-blue-600 text-white' : ''}`}
                  onClick={() => setFilterStatus('all')}
                >
                  Tất cả
                </Badge>
                <Badge 
                  variant={filterStatus === 'active' ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs ${filterStatus === 'active' ? 'bg-green-600 text-white' : ''}`}
                  onClick={() => setFilterStatus('active')}
                >
                  Hoạt động
                </Badge>
                <Badge 
                  variant={filterStatus === 'inactive' ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs ${filterStatus === 'inactive' ? 'bg-gray-600 text-white' : ''}`}
                  onClick={() => setFilterStatus('inactive')}
                >
                  Ngưng hoạt động
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
                  variant={sortBy === 'code' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('code')}
                  className={`min-w-[50px] sm:min-w-[60px] font-medium text-xs sm:text-sm ${
                    sortBy === 'code' 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Mã {sortBy === 'code' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                <Button
                  variant={sortBy === 'created' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('created')}
                  className={`min-w-[70px] sm:min-w-[80px] font-medium text-xs sm:text-sm ${
                    sortBy === 'created' 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="hidden sm:inline">Ngày tạo</span>
                  <span className="sm:hidden">Ngày</span>
                  {sortBy === 'created' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
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

      {/* Suppliers Grid - Compact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
        {paginatedSuppliers.map((supplier) => (
          <div key={supplier.supplier_id} className="supabase-card p-3 sm:p-4 hover:shadow-lg transition-shadow">
            {/* Supplier Avatar */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs sm:text-sm">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-xs sm:text-sm leading-tight text-gray-900 dark:text-white line-clamp-2">
                  {supplier.supplier_name}
                </h3>
                <div className="flex items-center gap-1 sm:gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="truncate">#{supplier.supplier_code}</span>
                  <Badge 
                    variant={supplier.is_active ? 'default' : 'secondary'}
                    className={`text-xs px-1.5 py-0.5 ${supplier.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : ''}`}
                  >
                    {supplier.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Contact Info - Compact */}
            <div className="space-y-1.5 sm:space-y-2 text-xs">
              {supplier.contact_person && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <User className="h-3 w-3 text-blue-500 flex-shrink-0" />
                  <span className="truncate">{supplier.contact_person}</span>
                </div>
              )}
              
              {supplier.phone && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Phone className="h-3 w-3 text-green-500 flex-shrink-0" />
                  <span className="truncate">{supplier.phone}</span>
                </div>
              )}
              
              {supplier.email && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Mail className="h-3 w-3 text-orange-500 flex-shrink-0" />
                  <span className="truncate">{supplier.email}</span>
                </div>
              )}
              
              {supplier.address && (
                <div className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                  <MapPin className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2 text-xs leading-relaxed">{supplier.address}</span>
                </div>
              )}
            </div>

            {/* Additional Info */}
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 text-xs text-gray-500 dark:text-gray-400">
                {supplier.payment_terms !== undefined && (
                  <div className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    <span className="truncate">{getPaymentTermsText(supplier.payment_terms)}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span className="text-xs">{formatDate(supplier.created_at)}</span>
                </div>
              </div>
              
              {/* Tax Code */}
              {supplier.tax_code && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                  MST: {supplier.tax_code}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-1 mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(supplier)}
                className="h-6 w-6 sm:h-7 sm:w-7 p-0 hover:bg-blue-50 dark:hover:bg-blue-900"
              >
                <Edit2 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(supplier.supplier_id)}
                className="h-6 w-6 sm:h-7 sm:w-7 p-0 hover:bg-red-50 dark:hover:bg-red-900"
              >
                <Trash2 className="h-3 w-3 text-red-600 dark:text-red-400" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {paginatedSuppliers.length === 0 && !loading && (
        <div className="text-center py-6 sm:py-8">
          <Building2 className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
          <p className="text-sm sm:text-base text-gray-500">
            {searchTerm ? `Không tìm thấy nhà cung cấp cho "${searchTerm}"` : 'Không có nhà cung cấp nào'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center sm:text-left">
            Hiển thị {startIndex + 1} - {Math.min(startIndex + itemsPerPage, sortedSuppliers.length)} trên {sortedSuppliers.length} nhà cung cấp
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

      {/* Add Supplier Modal */}
      <SupplierFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleModalSuccess}
        mode="create"
      />

      {/* Edit Supplier Modal */}
      <SupplierFormModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setEditingSupplier(null)
        }}
        onSuccess={handleModalSuccess}
        supplier={editingSupplier}
        mode="edit"
      />
    </div>
  )
}
