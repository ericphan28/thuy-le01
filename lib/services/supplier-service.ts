import { createClient } from '@/lib/supabase/client'

export interface Supplier {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  phone?: string
  email?: string
  address?: string
  contact_person?: string
  tax_code?: string
  payment_terms?: number
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateSupplierData {
  supplier_name: string
  supplier_code: string
  phone?: string
  email?: string
  address?: string
  contact_person?: string
  tax_code?: string
  payment_terms?: number
  notes?: string
}

export interface SupplierFilters {
  search?: string
  is_active?: boolean
  page?: number
  limit?: number
}

export interface SuppliersResponse {
  suppliers: Supplier[]
  total: number
  page: number
  limit: number
  total_pages: number
}

class SupplierService {
  private supabase = createClient()

  async getSuppliers(filters: SupplierFilters = {}): Promise<SuppliersResponse> {
    try {
      const {
        search = '',
        is_active = true,
        page = 1,
        limit = 50
      } = filters

      let query = this.supabase
        .from('suppliers')
        .select('*', { count: 'exact' })

      // Apply filters
      if (is_active !== undefined) {
        query = query.eq('is_active', is_active)
      }

      if (search?.trim()) {
        query = query.or(`supplier_name.ilike.%${search}%,supplier_code.ilike.%${search}%,contact_person.ilike.%${search}%`)
      }

      // Apply pagination
      const from = (page - 1) * limit
      const to = from + limit - 1
      
      query = query
        .order('supplier_name')
        .range(from, to)

      const { data, error, count } = await query

      if (error) {
        console.error('Error fetching suppliers:', error)
        throw error
      }

      const total = count || 0
      const total_pages = Math.ceil(total / limit)

      return {
        suppliers: data || [],
        total,
        page,
        limit,
        total_pages
      }

    } catch (error) {
      console.error('Error in getSuppliers:', error)
      throw error
    }
  }

  async createSupplier(supplierData: CreateSupplierData) {
    try {
      // Validate required fields
      if (!supplierData.supplier_name?.trim()) {
        throw new Error('Tên nhà cung cấp là bắt buộc')
      }

      if (!supplierData.supplier_code?.trim()) {
        throw new Error('Mã nhà cung cấp là bắt buộc')
      }

      // Check if supplier code already exists
      const { data: existingSupplier, error: checkError } = await this.supabase
        .from('suppliers')
        .select('supplier_code')
        .eq('supplier_code', supplierData.supplier_code)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing supplier:', checkError)
        throw new Error('Lỗi khi kiểm tra mã nhà cung cấp')
      }

      if (existingSupplier) {
        throw new Error('Mã nhà cung cấp đã tồn tại')
      }

      // Prepare data for insertion
      const insertData = {
        supplier_name: supplierData.supplier_name.trim(),
        supplier_code: supplierData.supplier_code.trim(),
        phone: supplierData.phone?.trim() || null,
        email: supplierData.email?.trim() || null,
        address: supplierData.address?.trim() || null,
        contact_person: supplierData.contact_person?.trim() || null,
        tax_code: supplierData.tax_code?.trim() || null,
        payment_terms: supplierData.payment_terms || 0,
        notes: supplierData.notes?.trim() || null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data, error } = await this.supabase
        .from('suppliers')
        .insert([insertData])
        .select()
        .single()

      if (error) {
        console.error('Error creating supplier:', error)
        throw new Error('Lỗi khi tạo nhà cung cấp: ' + error.message)
      }

      return data

    } catch (error) {
      console.error('Error in createSupplier:', error)
      throw error
    }
  }

  async updateSupplier(supplierId: number, supplierData: Partial<CreateSupplierData>) {
    try {
      if (!supplierId) {
        throw new Error('ID nhà cung cấp là bắt buộc')
      }

      // Prepare data for update
      const updateData: any = {
        ...supplierData,
        updated_at: new Date().toISOString()
      }

      // Remove empty strings and convert to null
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === '') {
          updateData[key] = null
        }
      })

      const { data, error } = await this.supabase
        .from('suppliers')
        .update(updateData)
        .eq('supplier_id', supplierId)
        .select()
        .single()

      if (error) {
        console.error('Error updating supplier:', error)
        throw new Error('Lỗi khi cập nhật nhà cung cấp: ' + error.message)
      }

      return data

    } catch (error) {
      console.error('Error in updateSupplier:', error)
      throw error
    }
  }

  async deleteSupplier(supplierId: number) {
    try {
      if (!supplierId) {
        throw new Error('ID nhà cung cấp là bắt buộc')
      }

      // Soft delete - set is_active to false
      const { data, error } = await this.supabase
        .from('suppliers')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('supplier_id', supplierId)
        .select()
        .single()

      if (error) {
        console.error('Error deleting supplier:', error)
        throw new Error('Lỗi khi xóa nhà cung cấp: ' + error.message)
      }

      return data

    } catch (error) {
      console.error('Error in deleteSupplier:', error)
      throw error
    }
  }

  async generateSupplierCode(prefix: string = 'NCC'): Promise<string> {
    try {
      // Get the highest existing supplier code with the same prefix
      const { data, error } = await this.supabase
        .from('suppliers')
        .select('supplier_code')
        .like('supplier_code', `${prefix}%`)
        .order('supplier_code', { ascending: false })
        .limit(1)

      if (error) {
        console.error('Error generating supplier code:', error)
        return `${prefix}001`
      }

      if (!data || data.length === 0) {
        return `${prefix}001`
      }

      const lastCode = data[0].supplier_code
      const numberPart = lastCode.replace(prefix, '')
      const nextNumber = parseInt(numberPart) + 1
      
      return `${prefix}${nextNumber.toString().padStart(3, '0')}`
    } catch (error) {
      console.error('Unexpected error generating supplier code:', error)
      return `${prefix}001`
    }
  }
}

export const supplierService = new SupplierService()
