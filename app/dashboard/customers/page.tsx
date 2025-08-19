'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { CustomerFormModal } from '@/components/customers/customer-form-modal'
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
  MapPin,
  Edit2,
  Trash2
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
  id_number: string | null
  gender: string | null
  debt_limit: number
  current_debt: number
  total_revenue: number
  total_profit: number
  purchase_count: number
  last_purchase_date: string | null
  status: number
  notes: string | null
  created_by: string | null
  is_active: boolean
  created_at: string
  updated_at: string
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
  const [filterType, setFilterType] = useState<'all' | 'vip' | 'high' | 'low_data' | 'churn_risk' | 'inactive' | 'has_debt'>('all')
  const [totalCount, setTotalCount] = useState<number>(0)
  const [inactiveCount, setInactiveCount] = useState<number>(0)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(20)

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<VeterinaryCustomer | null>(null)
  
  // Sorting states
  const [sortBy] = useState<'name' | 'revenue' | 'purchases' | 'created'>('revenue')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')

  const supabase = createClient()

  // 🐾 Core API Call: Fetch veterinary customers
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Special handling: filter 'has_debt' should page only customers with current_debt > 0
      if (filterType === 'has_debt') {
        // 1) Pull debt customers from RPC using same logic as Debt dashboard
        const { data: debtRows, error: debtErr } = await supabase
          .rpc('search_debt_customers', {
            search_term: searchTerm || '',
            debt_status_filter: 'all',
            risk_level_filter: 'all',
            limit_count: 100000
          })

        if (debtErr) {
          console.error('Supabase RPC error (search_debt_customers):', debtErr)
          setError(`Lỗi database: ${debtErr.message}`)
          setCustomers([])
          setTotalCount(0)
          setLoading(false)
          return
        }

        // 2) Keep only customers that owe the store (current_debt > 0)
        const debtCustomers = (debtRows as any[] | null) || []
        const owing = debtCustomers.filter((r: any) => Number(r?.current_debt || 0) > 0)

        // 3) Update total for pagination and slice current page
        const total = owing.length
        setTotalCount(total)

        const startIndex = (currentPage - 1) * itemsPerPage
        const pageSlice = owing.slice(startIndex, startIndex + itemsPerPage)
        const pageIds = pageSlice.map((r: any) => Number(r.customer_id))

        // Early exit if empty page
        if (pageIds.length === 0) {
          setCustomers([])
          // still compute inactive count for header
          const { count: inactiveCountResult } = await supabase
            .from('customers')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', false)
          setInactiveCount(inactiveCountResult || 0)
          setLoading(false)
          return
        }

        // 4) Fetch base customer info only for those IDs (active customers by default)
        let baseQuery = supabase
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
          .in('customer_id', pageIds)
          .eq('is_active', true)

        const { data: pageData, error: pageErr } = await baseQuery
        if (pageErr) {
          console.error('Supabase error (fetch page customers by IDs):', pageErr)
          setError(`Lỗi database: ${pageErr.message}`)
          setCustomers([])
          setLoading(false)
          return
        }

        // 5) Normalize rows and merge debt value from RPC for consistency
        const debtMap = new Map<number, number>()
        pageSlice.forEach((r: any) => debtMap.set(Number(r.customer_id), Number(r.current_debt || 0)))

        const transformedCustomers: VeterinaryCustomer[] = (pageData || []).map((item: any) => ({
          ...item,
          id_number: (item.id_number as string | null) || null,
          notes: (item.notes as string | null) || null,
          created_by: (item.created_by as string | null) || null,
          updated_at: (item.updated_at as string) || (item.created_at as string),
          customer_types: Array.isArray(item.customer_types) ? item.customer_types[0] : item.customer_types,
          branches: Array.isArray(item.branches) ? item.branches[0] : item.branches,
          current_debt: debtMap.get(Number(item.customer_id)) ?? Number(item.current_debt || 0)
        }))

        // 6) Compute purchase counts for these customers
        let countsById: Record<number, number> = {}
        const { data: invoiceRows, error: invoiceErr } = await supabase
          .from('invoices')
          .select('customer_id')
          .in('customer_id', pageIds)
        if (!invoiceErr && Array.isArray(invoiceRows)) {
          countsById = invoiceRows.reduce((acc: Record<number, number>, row: any) => {
            const cid = Number(row.customer_id)
            acc[cid] = (acc[cid] || 0) + 1
            return acc
          }, {})
        }

        const finalCustomers = transformedCustomers
          // preserve order as in pageSlice (priority from RPC)
          .sort((a, b) => pageIds.indexOf(a.customer_id) - pageIds.indexOf(b.customer_id))
          .map(c => ({
            ...c,
            purchase_count: Math.max(Number(c.purchase_count || 0), countsById[c.customer_id] || 0)
          }))

        // inactive counter for header
        const { count: inactiveCountResult } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', false)
        setInactiveCount(inactiveCountResult || 0)

        setCustomers(finalCustomers)
        setLoading(false)
        return
      }

      // Get total count for filtered customers
      let countQuery = supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })

      // Apply filters for count
      if (filterType === 'inactive') {
        countQuery = countQuery.eq('is_active', false)
      } else {
        countQuery = countQuery.eq('is_active', true)
        if (filterType === 'vip') {
          countQuery = countQuery.gte('total_revenue', 50000000)
        } else if (filterType === 'high') {
          countQuery = countQuery.gte('total_revenue', 10000000).lt('total_revenue', 50000000)
        } else if (filterType === 'low_data') {
          countQuery = countQuery.or('phone.is.null,email.is.null,address.is.null')
        } else if (filterType === 'churn_risk') {
          const ninetyDaysAgo = new Date()
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
          countQuery = countQuery.or(`last_purchase_date.is.null,last_purchase_date.lt.${ninetyDaysAgo.toISOString()}`)
        }
      }

      if (searchTerm) {
        countQuery = countQuery.or(`customer_name.ilike.%${searchTerm}%,customer_code.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
      }

      const { count: filteredCount } = await countQuery
      setTotalCount(filteredCount || 0)

      // Get inactive count for stats
      const { count: inactiveCountResult } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', false)
      
      setInactiveCount(inactiveCountResult || 0)

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
        
      // Set base filter for active/inactive
      if (filterType === 'inactive') {
        query = query.eq('is_active', false)
      } else {
        query = query.eq('is_active', true)
      }

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

      // Transform data with safe field access
      const transformedCustomers: VeterinaryCustomer[] = (data || []).map((item: any) => ({
        ...item,
        id_number: (item.id_number as string | null) || null,
        notes: (item.notes as string | null) || null,
        created_by: (item.created_by as string | null) || null,
        updated_at: (item.updated_at as string) || (item.created_at as string),
        customer_types: Array.isArray(item.customer_types) ? item.customer_types[0] : item.customer_types,
        branches: Array.isArray(item.branches) ? item.branches[0] : item.branches,
      }))

      // Secondary fetch: compute invoice counts for the current page's customers
      const pageIds = transformedCustomers.map(c => c.customer_id)
      let countsById: Record<number, number> = {}
      if (pageIds.length > 0) {
        const { data: invoiceRows, error: invoiceErr } = await supabase
          .from('invoices')
          .select('customer_id')
          .in('customer_id', pageIds)

        if (!invoiceErr && Array.isArray(invoiceRows)) {
          countsById = invoiceRows.reduce((acc: Record<number, number>, row: any) => {
            const cid = Number(row.customer_id)
            acc[cid] = (acc[cid] || 0) + 1
            return acc
          }, {})
        }
      }

      // Third fetch: get up-to-date current_debt using the same RPC as debt page
      // Then map only for the current page's customers
      let debtById: Record<number, number> = {}
      try {
        const { data: debtCustomers, error: debtRpcErr } = await supabase.rpc('search_debt_customers', {
          search_term: '',
          debt_status_filter: 'all',
          risk_level_filter: 'all',
          limit_count: 10000
        })
        if (!debtRpcErr && Array.isArray(debtCustomers)) {
          debtById = (debtCustomers as any[]).reduce((acc: Record<number, number>, row: any) => {
            const cid = Number(row.customer_id)
            if (pageIds.includes(cid)) {
              acc[cid] = Number(row.current_debt || 0)
            }
            return acc
          }, {})
        }
      } catch {}

      const finalCustomers = transformedCustomers.map(c => ({
        ...c,
        purchase_count: Math.max(Number(c.purchase_count || 0), countsById[c.customer_id] || 0),
        current_debt: typeof debtById[c.customer_id] === 'number' ? debtById[c.customer_id] : Number(c.current_debt || 0)
      }))

  // For non 'has_debt' cases, use the computed list as-is
  setCustomers(finalCustomers)
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

  // Modal handlers
  const handleAddCustomer = useCallback(() => {
    console.log('🔵 handleAddCustomer called - Opening modal for new customer')
    setSelectedCustomer(null)
    setIsModalOpen(true)
    console.log('🔵 Modal state updated:', { isModalOpen: true, selectedCustomer: null })
  }, [])

  const handleEditCustomer = useCallback((customer: VeterinaryCustomer) => {
    console.log('🟢 handleEditCustomer called for customer:', customer.customer_name)
    setSelectedCustomer(customer)
    setIsModalOpen(true)
    console.log('🟢 Modal state updated:', { isModalOpen: true, selectedCustomer: customer.customer_code })
  }, [])

  const handleModalSuccess = useCallback(() => {
    console.log('✅ handleModalSuccess called - Modal operation completed')
    setIsModalOpen(false)
    setSelectedCustomer(null)
    fetchCustomers() // Refresh data after successful operation
  }, [fetchCustomers])

  const handleDeleteCustomer = useCallback(async (customer: VeterinaryCustomer) => {
    console.log('🗑️ handleDeleteCustomer called for customer:', customer.customer_name)
    
    try {
      // First, check if customer has any invoices/orders
      console.log('🔍 Checking if customer has related orders/invoices...')
      const { data: invoices, error: invoiceCheckError } = await supabase
        .from('invoices')
        .select('invoice_id')
        .eq('customer_id', customer.customer_id)
        .limit(1)

      if (invoiceCheckError) {
        console.error('❌ Error checking invoices:', invoiceCheckError)
        alert('Có lỗi xảy ra khi kiểm tra dữ liệu liên quan.')
        return
      }

      const hasInvoices = invoices && invoices.length > 0
      console.log('🔍 Customer has invoices:', hasInvoices)

      if (hasInvoices) {
        // Customer has related data - offer deactivation instead
        const userChoice = window.confirm(
          `⚠️ KHÔNG THỂ XÓA KHÁCH HÀNG\n\n` +
          `Khách hàng "${customer.customer_name}" (${customer.customer_code}) không thể xóa vì:\n` +
          `• Còn có đơn hàng/hóa đơn trong hệ thống\n` +
          `• Dữ liệu này được bảo vệ để đảm bảo tính toàn vẹn\n\n` +
          `🔄 THAY VÀO ĐÓ:\n` +
          `Bạn có muốn VÔ HIỆU HÓA khách hàng này không?\n` +
          `(Khách hàng sẽ bị ẩn khỏi danh sách nhưng dữ liệu vẫn được giữ lại)\n\n` +
          `Nhấn OK để vô hiệu hóa, Cancel để hủy bỏ.`
        )

        if (!userChoice) {
          console.log('🗑️ Deactivation cancelled by user')
          return
        }

        // Deactivate customer instead of deleting
        console.log('🔄 Deactivating customer instead of deleting...')
        const { error: deactivateError } = await supabase
          .from('customers')
          .update({ 
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .eq('customer_id', customer.customer_id)

        if (deactivateError) {
          console.error('❌ Deactivation error:', deactivateError)
          alert('Có lỗi xảy ra khi vô hiệu hóa khách hàng: ' + deactivateError.message)
          return
        }

        console.log('✅ Customer deactivated successfully')
        alert(`✅ Đã vô hiệu hóa khách hàng "${customer.customer_name}" thành công!\n\n` +
              `Khách hàng này sẽ không hiển thị trong danh sách hoạt động nhưng dữ liệu đơn hàng vẫn được bảo toàn.`)
        fetchCustomers()
        
      } else {
        // Customer has no related data - can be safely deleted
        const isConfirmed = window.confirm(
          `🗑️ XÓA KHÁCH HÀNG\n\n` +
          `Bạn có chắc chắn muốn XÓA VĨNH VIỄN khách hàng "${customer.customer_name}" (${customer.customer_code})?\n\n` +
          `⚠️ Hành động này không thể hoàn tác!\n\n` +
          `Nhấn OK để xóa, Cancel để hủy bỏ.`
        )

        if (!isConfirmed) {
          console.log('🗑️ Delete cancelled by user')
          return
        }

        console.log('🗑️ Proceeding with permanent delete...')
        const { error } = await supabase
          .from('customers')
          .delete()
          .eq('customer_id', customer.customer_id)

        if (error) {
          console.error('❌ Delete error:', error)
          
          // Check if it's a foreign key constraint error
          if (error.message.includes('foreign key') || error.message.includes('violates')) {
            alert(
              `❌ KHÔNG THỂ XÓA KHÁCH HÀNG\n\n` +
              `Khách hàng "${customer.customer_name}" có dữ liệu liên quan trong hệ thống.\n\n` +
              `Vui lòng liên hệ quản trị viên để được hỗ trợ.`
            )
          } else {
            alert('Có lỗi xảy ra khi xóa khách hàng: ' + error.message)
          }
          return
        }

        console.log('✅ Customer deleted successfully')
        alert(`✅ Đã xóa khách hàng "${customer.customer_name}" thành công!`)
        fetchCustomers()
      }

    } catch (error) {
      console.error('💥 Error in delete process:', error)
      alert('Có lỗi xảy ra trong quá trình xử lý. Vui lòng thử lại.')
    }
  }, [supabase, fetchCustomers])

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
    }).length,
    inactive: inactiveCount
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
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleAddCustomer}
                className="supabase-button-secondary h-6 px-1.5 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Thêm
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-2">
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
            <div className="bg-gray-500 text-white rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{stats.inactive}</div>
              <div className="text-xs">Vô hiệu</div>
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
            
            {/* Filter Options */}
            <div className="flex flex-wrap gap-1">
              <Button
                variant={filterType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('all')}
                className="h-8 px-2 text-xs"
              >
                Tất cả
              </Button>
              <Button
                variant={filterType === 'has_debt' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('has_debt')}
                className="h-8 px-2 text-xs"
              >
                Có nợ
              </Button>
              <Button
                variant={filterType === 'vip' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('vip')}
                className="h-8 px-2 text-xs"
              >
                VIP
              </Button>
              <Button
                variant={filterType === 'high' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('high')}
                className="h-8 px-2 text-xs"
              >
                Tiềm năng
              </Button>
              <Button
                variant={filterType === 'low_data' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('low_data')}
                className="h-8 px-2 text-xs"
              >
                Thiếu TT
              </Button>
              <Button
                variant={filterType === 'churn_risk' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('churn_risk')}
                className="h-8 px-2 text-xs"
              >
                Rời bỏ
              </Button>
              <Button
                variant={filterType === 'inactive' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('inactive')}
                className="h-8 px-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                Đã vô hiệu
              </Button>
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
              <Card key={customer.customer_id} className={`supabase-product-card ${!customer.is_active ? 'opacity-60 border-gray-300' : ''}`}>
                <CardHeader className="pb-1 pt-2 px-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarFallback className={`text-xs font-semibold ${!customer.is_active ? 'bg-gray-400 text-gray-700' : 'bg-brand text-primary-foreground'}`}>
                          {customer.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <h3 className={`font-semibold text-xs leading-tight truncate ${!customer.is_active ? 'text-gray-500' : 'text-foreground'}`}>
                            {customer.customer_name}
                          </h3>
                          {!customer.is_active && (
                            <span className="text-xs px-1 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px]">
                              VÔ HIỆU
                            </span>
                          )}
                        </div>
                        <p className={`text-xs font-mono truncate ${!customer.is_active ? 'text-gray-400' : 'text-muted-foreground'}`}>
                          {customer.customer_code}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditCustomer(customer)}
                          className="h-6 w-6 p-0 hover:bg-blue-50 text-blue-600"
                          title="Chỉnh sửa khách hàng"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCustomer(customer)}
                          className="h-6 w-6 p-0 hover:bg-red-50 text-red-600"
                          title="Xóa khách hàng"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Badge variant={segment.color} className="text-xs px-1 py-0">
                        {segment.label}
                      </Badge>
                    </div>
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
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Công nợ:</span>
                      <span className={`text-xs font-semibold ${customer.current_debt > 0 ? 'text-red-600' : 'text-foreground'}`}>
                        {formatCurrency(customer.current_debt || 0)}
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

      {/* Customer Form Modal */}
      <CustomerFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedCustomer(null)
        }}
        customer={selectedCustomer}
        mode={selectedCustomer ? 'edit' : 'create'}
        onSuccess={handleModalSuccess}
      />
    </div>
  )
}
