/**
 * Supabase Customer Service
 * Service layer cho quản lý khách hàng với error handling và type safety
 */

import { createClient } from '@supabase/supabase-js'
import type {
  Customer,
  CustomerInsert,
  CustomerUpdate,
  CustomerWithStats,
  CustomerSearchParams,
  PaginatedResponse,
  CustomerStats,
  ServiceResult,
  PostgrestError,
  CustomerType
} from '../types/customer'

export class CustomerService {
  private static supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  /**
   * Xử lý lỗi Supabase một cách structured
   */
  private static handleError(error: PostgrestError, operation: string): ServiceResult<never> {
    console.error(`[CustomerService.${operation}]`, {
      error: error.message,
      code: error.code,
      details: error.details,
      timestamp: new Date().toISOString()
    })

    return {
      success: false,
      error: {
        message: error.message,
        code: error.code,
        details: { operation, hint: error.hint }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        operation
      }
    }
  }

  /**
   * Lấy danh sách khách hàng với pagination và filtering
   */
  static async getCustomers(params: CustomerSearchParams): Promise<PaginatedResponse<Customer>> {
    try {
      let query = this.supabase
        .from('customers')
        .select(`
          *,
          customer_types (
            type_id,
            type_name,
            default_discount_percent
          )
        `, { count: 'exact' })

      // Apply filters
      if (params.search) {
        query = query.or(`customer_name.ilike.%${params.search}%,customer_code.ilike.%${params.search}%,phone.ilike.%${params.search}%`)
      }

      if (params.customer_type_id) {
        query = query.eq('customer_type_id', params.customer_type_id)
      }

      if (params.is_active !== undefined) {
        query = query.eq('is_active', params.is_active)
      }

      // Sorting
      const sortBy = params.sort_by || 'customer_name'
      const sortOrder = params.sort_order || 'asc'
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })

      // Pagination
      const page = params.page || 1
      const limit = params.limit || 20
      const from = (page - 1) * limit
      const to = from + limit - 1

      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) {
        return {
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
          error
        }
      }

      return {
        data: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        },
        error: null
      }

    } catch (error) {
      return {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        error: error as PostgrestError
      }
    }
  }

  /**
   * Lấy thông tin chi tiết khách hàng theo ID
   */
  static async getCustomerById(id: number): Promise<ServiceResult<Customer>> {
    try {
      const { data, error } = await this.supabase
        .from('customers')
        .select(`
          *,
          customer_types (
            type_id,
            type_name,
            default_discount_percent,
            description
          )
        `)
        .eq('customer_id', id)
        .single()

      if (error) {
        return this.handleError(error, 'getCustomerById')
      }

      return {
        success: true,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'getCustomerById'
        }
      }

    } catch (error) {
      return this.handleError(error as PostgrestError, 'getCustomerById')
    }
  }

  /**
   * Tạo khách hàng mới
   */
  static async createCustomer(customerData: CustomerInsert): Promise<ServiceResult<Customer>> {
    try {
      // Tạo customer_code tự động nếu không có
      if (!customerData.customer_code) {
        const timestamp = Date.now().toString().slice(-6)
        customerData.customer_code = `KH${timestamp}`
      }

      const { data, error } = await this.supabase
        .from('customers')
        .insert([{
          ...customerData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select(`
          *,
          customer_types (
            type_id,
            type_name,
            default_discount_percent
          )
        `)
        .single()

      if (error) {
        return this.handleError(error, 'createCustomer')
      }

      return {
        success: true,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'createCustomer'
        }
      }

    } catch (error) {
      return this.handleError(error as PostgrestError, 'createCustomer')
    }
  }

  /**
   * Cập nhật thông tin khách hàng
   */
  static async updateCustomer(id: number, updates: CustomerUpdate): Promise<ServiceResult<Customer>> {
    try {
      const { data, error } = await this.supabase
        .from('customers')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('customer_id', id)
        .select(`
          *,
          customer_types (
            type_id,
            type_name,
            default_discount_percent
          )
        `)
        .single()

      if (error) {
        return this.handleError(error, 'updateCustomer')
      }

      return {
        success: true,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'updateCustomer'
        }
      }

    } catch (error) {
      return this.handleError(error as PostgrestError, 'updateCustomer')
    }
  }

  /**
   * Xóa mềm khách hàng (set is_active = false)
   */
  static async deleteCustomer(id: number): Promise<ServiceResult<Customer>> {
    try {
      const { data, error } = await this.supabase
        .from('customers')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('customer_id', id)
        .select()
        .single()

      if (error) {
        return this.handleError(error, 'deleteCustomer')
      }

      return {
        success: true,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'deleteCustomer'
        }
      }

    } catch (error) {
      return this.handleError(error as PostgrestError, 'deleteCustomer')
    }
  }

  /**
   * Tìm kiếm khách hàng với thống kê (sử dụng RPC function)
   */
  static async searchCustomersWithStats(params: {
    search_term?: string
    customer_type_filter?: number
    limit_count?: number
    date_from?: string
  }): Promise<ServiceResult<CustomerWithStats[]>> {
    try {
      const { data, error } = await this.supabase.rpc('search_customers_with_stats', {
        search_term: params.search_term || '',
        customer_type_filter: params.customer_type_filter || null,
        limit_count: params.limit_count || 50,
        date_from: params.date_from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      })

      if (error) {
        return this.handleError(error, 'searchCustomersWithStats')
      }

      return {
        success: true,
        data: data || [],
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'searchCustomersWithStats'
        }
      }

    } catch (error) {
      return this.handleError(error as PostgrestError, 'searchCustomersWithStats')
    }
  }

  /**
   * Lấy thống kê tổng quan khách hàng
   */
  static async getCustomerStats(): Promise<ServiceResult<CustomerStats>> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      // Chạy parallel queries để tối ưu performance
      const [
        totalCustomersResult,
        activeCustomersResult,
        newCustomersResult,
        vipCustomersResult,
        debtSummaryResult
      ] = await Promise.all([
        this.supabase.from('customers').select('customer_id', { count: 'exact' }),
        this.supabase.from('customers').select('customer_id', { count: 'exact' }).eq('is_active', true),
        this.supabase.from('customers').select('customer_id', { count: 'exact' }).gte('created_at', thirtyDaysAgo),
        this.supabase.from('customers').select('customer_id', { count: 'exact' }).gte('total_revenue', 10000000),
        this.supabase.from('customers').select('current_debt, total_revenue').eq('is_active', true)
      ])

      // Tính toán stats
      const totalDebt = debtSummaryResult.data?.reduce((sum, customer) => sum + (customer.current_debt || 0), 0) || 0
      const totalRevenue = debtSummaryResult.data?.reduce((sum, customer) => sum + (customer.total_revenue || 0), 0) || 0
      const avgOrderValue = activeCustomersResult.count ? totalRevenue / activeCustomersResult.count : 0

      const stats: CustomerStats = {
        total_customers: totalCustomersResult.count || 0,
        active_customers: activeCustomersResult.count || 0,
        new_customers_this_month: newCustomersResult.count || 0,
        vip_customers: vipCustomersResult.count || 0,
        total_debt: totalDebt,
        avg_order_value: avgOrderValue,
        customer_segments: {
          vip: vipCustomersResult.count || 0,
          regular: (activeCustomersResult.count || 0) - (vipCustomersResult.count || 0) - (newCustomersResult.count || 0),
          new: newCustomersResult.count || 0,
          inactive: (totalCustomersResult.count || 0) - (activeCustomersResult.count || 0)
        }
      }

      return {
        success: true,
        data: stats,
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'getCustomerStats'
        }
      }

    } catch (error) {
      return this.handleError(error as PostgrestError, 'getCustomerStats')
    }
  }

  /**
   * Lấy danh sách loại khách hàng
   */
  static async getCustomerTypes(): Promise<ServiceResult<CustomerType[]>> {
    try {
      const { data, error } = await this.supabase
        .from('customer_types')
        .select('*')
        .eq('is_active', true)
        .order('type_name')

      if (error) {
        return this.handleError(error, 'getCustomerTypes')
      }

      return {
        success: true,
        data: data || [],
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'getCustomerTypes'
        }
      }

    } catch (error) {
      return this.handleError(error as PostgrestError, 'getCustomerTypes')
    }
  }

  /**
   * Cập nhật thống kê khách hàng sau khi có đơn hàng mới
   */
  static async updateCustomerStats(customerId: number, orderTotal: number): Promise<ServiceResult<Customer>> {
    try {
      // Sử dụng RPC function để đảm bảo atomic update
      const { data, error } = await this.supabase.rpc('update_customer_stats_safe', {
        p_customer_id: customerId,
        p_order_total: orderTotal,
        p_increment_count: 1
      })

      if (error) {
        return this.handleError(error, 'updateCustomerStats')
      }

      return {
        success: true,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'updateCustomerStats'
        }
      }

    } catch (error) {
      return this.handleError(error as PostgrestError, 'updateCustomerStats')
    }
  }
}
