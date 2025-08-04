'use client'

import { useState, useEffect } from 'react'
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
  User,
  MapPin
} from 'lucide-react'

interface Supplier {
  id: number
  code: string
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  tax_code?: string
  payment_terms?: number
  is_active: boolean
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'payment_terms'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  // Mock data for demo
  useEffect(() => {
    const mockSuppliers: Supplier[] = [
      {
        id: 1,
        code: 'SUP001',
        name: 'Công ty TNHH Thuốc thú y ABC',
        contact_person: 'Nguyễn Văn A',
        phone: '0901234567',
        email: 'contact@abc.com',
        address: '123 Đường ABC, Q1, TP.HCM',
        tax_code: '0123456789',
        payment_terms: 30,
        is_active: true
      },
      {
        id: 2,
        code: 'SUP002',
        name: 'Nhà phân phối thức ăn DEF',
        contact_person: 'Trần Thị B',
        phone: '0907654321',
        email: 'info@def.com',
        address: '456 Đường DEF, Q2, TP.HCM',
        tax_code: '0987654321',
        payment_terms: 15,
        is_active: true
      },
      {
        id: 3,
        code: 'SUP003',
        name: 'Kho dụng cụ thú y XYZ',
        contact_person: 'Lê Văn C',
        phone: '0903456789',
        email: 'support@xyz.com',
        address: '789 Đường XYZ, Q3, TP.HCM',
        payment_terms: 7,
        is_active: false
      }
    ]
    
    setSuppliers(mockSuppliers)
    setLoading(false)
  }, [])

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         supplier.code.toLowerCase().includes(searchTerm.toLowerCase())
    
    if (filterType === 'active') return matchesSearch && supplier.is_active
    if (filterType === 'inactive') return matchesSearch && !supplier.is_active
    
    return matchesSearch
  })

  const sortedSuppliers = [...filteredSuppliers].sort((a, b) => {
    let aVal: string | number, bVal: string | number
    
    switch (sortBy) {
      case 'code':
        aVal = a.code
        bVal = b.code
        break
      case 'payment_terms':
        aVal = a.payment_terms || 0
        bVal = b.payment_terms || 0
        break
      default:
        aVal = a.name
        bVal = b.name
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

  const handleSort = (field: 'name' | 'code' | 'payment_terms') => {
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

  // Calculate stats
  const stats = {
    total: suppliers.length,
    active: suppliers.filter(s => s.is_active).length,
    inactive: suppliers.filter(s => !s.is_active).length,
    shortTerms: suppliers.filter(s => (s.payment_terms || 0) <= 15).length
  }

  if (loading) {
    return <div className="p-8 text-center">Đang tải...</div>
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
              <p className="text-gray-600 dark:text-gray-400">Quản lý thông tin nhà cung cấp và đối tác</p>
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

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm opacity-90">Tổng NCC</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.active}</div>
              <div className="text-sm opacity-90">Đang hoạt động</div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.inactive}</div>
              <div className="text-sm opacity-90">Tạm dừng</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{stats.shortTerms}</div>
              <div className="text-sm opacity-90">Thanh toán ngắn</div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Tìm nhà cung cấp..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 supabase-input"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {/* Filter Badges */}
              <div className="flex gap-2">
                <Badge 
                  variant={filterType === 'all' ? 'default' : 'outline'}
                  className={`cursor-pointer ${filterType === 'all' ? 'bg-blue-600 text-white' : ''}`}
                  onClick={() => setFilterType('all')}
                >
                  Tất cả
                </Badge>
                <Badge 
                  variant={filterType === 'active' ? 'default' : 'outline'}
                  className={`cursor-pointer ${filterType === 'active' ? 'bg-green-600 text-white' : ''}`}
                  onClick={() => setFilterType('active')}
                >
                  Hoạt động
                </Badge>
                <Badge 
                  variant={filterType === 'inactive' ? 'default' : 'outline'}
                  className={`cursor-pointer ${filterType === 'inactive' ? 'bg-red-600 text-white' : ''}`}
                  onClick={() => setFilterType('inactive')}
                >
                  Tạm dừng
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
                  variant={sortBy === 'payment_terms' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort('payment_terms')}
                  className="supabase-button"
                >
                  TT {sortBy === 'payment_terms' && (sortOrder === 'asc' ? '↑' : '↓')}
                </Button>
                
                <select 
                  value={itemsPerPage.toString()} 
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="h-8 px-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded focus:border-blue-400"
                >
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedSuppliers.map((supplier) => (
          <div
            key={supplier.id}
            className="supabase-card p-4 hover:shadow-lg transition-shadow"
          >
            {/* Supplier Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-800 dark:to-blue-900 rounded-lg">
                  <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1">
                    {supplier.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {supplier.code}
                  </p>
                </div>
              </div>
              
              <Badge 
                variant={supplier.is_active ? 'default' : 'secondary'}
                className={`text-xs ${
                  supplier.is_active 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {supplier.is_active ? 'Hoạt động' : 'Tạm dừng'}
              </Badge>
            </div>

            {/* Contact Info */}
            <div className="space-y-2 mb-3">
              {supplier.contact_person && (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <User className="h-3 w-3" />
                  <span className="truncate">{supplier.contact_person}</span>
                </div>
              )}
              {supplier.phone && (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Phone className="h-3 w-3" />
                  <span className="truncate">{supplier.phone}</span>
                </div>
              )}
              {supplier.email && (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{supplier.email}</span>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{supplier.address}</span>
                </div>
              )}
            </div>

            {/* Payment Terms & Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs">
                {supplier.payment_terms ? (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Thanh toán: </span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {supplier.payment_terms} ngày
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400">Chưa thiết lập</span>
                )}
              </div>
              
              {/* Quick Actions */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(supplier)}
                  className="h-7 w-7 p-0 hover:bg-blue-50 dark:hover:bg-blue-900"
                >
                  <Edit2 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(supplier.id)}
                  className="h-7 w-7 p-0 hover:bg-red-50 dark:hover:bg-red-900"
                >
                  <Trash2 className="h-3 w-3 text-red-600 dark:text-red-400" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {paginatedSuppliers.length === 0 && (
        <div className="text-center py-8">
          <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Không tìm thấy nhà cung cấp nào</p>
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