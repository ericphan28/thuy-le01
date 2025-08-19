import { createClient } from '@/lib/supabase/client'

export interface Product {
  product_id: number
  product_code: string
  product_name: string
  category_id?: number
  barcode?: string
  product_type: string
  brand?: string
  origin?: string
  description?: string
  image_url?: string
  image_urls?: string
  base_price: number
  cost_price: number
  sale_price: number
  current_stock: number
  reserved_stock: number
  available_stock: number
  min_stock: number
  max_stock: number
  is_medicine: boolean
  requires_prescription: boolean
  storage_condition?: string
  expiry_tracking: boolean
  allow_sale: boolean
  track_serial: boolean
  conversion_rate: number
  unit_attributes?: string
  related_product_codes?: string
  is_active: boolean
  created_at: string
  updated_at: string
  
  // Joined fields
  category?: ProductCategory
}

export interface ProductCategory {
  category_id: number
  category_code: string
  category_name: string
  parent_category_id?: number
  level_path?: string
  description?: string
  is_active: boolean
  created_at: string
}

export interface ProductFilters {
  search?: string
  category_id?: number
  is_medicine?: boolean
  low_stock?: boolean
  out_of_stock?: boolean
  brand?: string
  sort_by?: 'product_name' | 'sale_price' | 'current_stock' | 'created_at'
  sort_order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface ProductStats {
  total_products: number
  active_products: number
  low_stock_count: number
  out_of_stock_count: number
  medicine_count: number
  total_value: number
  total_inventory_value: number
}

class ProductService {
  private supabase = createClient()

  async getProducts(filters: ProductFilters = {}) {
    try {
      console.log('🔍 ProductService.getProducts called with filters:', filters)
      
      let query = this.supabase
        .from('products')
        .select('*', { count: 'exact' })
        .eq('is_active', true)

      // Apply filters
      if (filters.search) {
        console.log('🔍 Applying search filter:', filters.search)
        query = query.or(`product_name.ilike.%${filters.search}%,product_code.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%,brand.ilike.%${filters.search}%`)
      }

      if (filters.category_id) {
        console.log('🏷️ Applying category filter:', filters.category_id)
        query = query.eq('category_id', filters.category_id)
      }

      if (filters.is_medicine !== undefined) {
        console.log('💊 Applying medicine filter:', filters.is_medicine)
        query = query.eq('is_medicine', filters.is_medicine)
      }

      if (filters.out_of_stock) {
        console.log('📦 Applying out of stock filter:', filters.out_of_stock)
        query = query.eq('current_stock', 0)
      }

      if (filters.brand && filters.brand !== 'all') {
        console.log('🏪 Applying brand filter:', filters.brand)
        query = query.ilike('brand', `%${filters.brand}%`)
      }

      // Sorting
      const sortBy = filters.sort_by || 'product_name'
      const sortOrder = filters.sort_order || 'asc'
      console.log('📊 Applying sort:', { sortBy, sortOrder })
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })

      // Pagination
      const page = filters.page || 1
      const limit = filters.limit || 20
      const offset = (page - 1) * limit
      console.log('📄 Applying pagination:', { page, limit, offset })
      query = query.range(offset, offset + limit - 1)

      console.log('🚀 Executing query...')
      const { data, error, count } = await query
      
      console.log('✅ Query result:', { count, dataLength: data?.length, error: error ? JSON.stringify(error) : null })

      if (error) {
        console.error('❌ Error fetching products:', error)
        throw new Error(`Failed to fetch products: ${error.message || JSON.stringify(error)}`)
      }

      // Transform data to match Product interface
      let transformedProducts = data?.map(item => ({
        ...item,
        category: undefined // Temporarily remove category join to debug
      })) || []

      // Apply client-side low_stock filter if needed
      if (filters.low_stock) {
        transformedProducts = transformedProducts.filter(product => 
          product.current_stock <= product.min_stock
        )
      }

      return {
        products: transformedProducts as Product[],
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit)
      }
    } catch (error) {
      console.error('ProductService.getProducts error:', error)
      throw error
    }
  }

  async getProductById(productId: number) {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select(`
          *,
          product_categories!fk_products_category_id(*)
        `)
        .eq('product_id', productId)
        .eq('is_active', true)
        .single()

      if (error) {
        throw new Error(`Failed to fetch product: ${error.message}`)
      }

      // Transform category data
      const transformedData = {
        ...data,
        category: data.product_categories || undefined
      }

      return transformedData as Product
    } catch (error) {
      console.error('ProductService.getProductById error:', error)
      throw error
    }
  }

  async getCategories() {
    try {
      const { data, error } = await this.supabase
        .from('product_categories')
        .select('*')
        .eq('is_active', true)
        .order('category_name')

      if (error) {
        throw new Error(`Failed to fetch categories: ${error.message}`)
      }

      return data as ProductCategory[]
    } catch (error) {
      console.error('ProductService.getCategories error:', error)
      throw error
    }
  }

  async getProductStats(): Promise<ProductStats> {
    try {
      // Get basic counts
      const { data: products } = await this.supabase
        .from('products')
        .select('current_stock, min_stock, is_medicine, sale_price, is_active')

      if (!products) {
        throw new Error('Failed to fetch product stats')
      }

      const totalInventoryValue = products
        .filter(p => p.is_active)
        .reduce((sum, p) => sum + (p.current_stock * p.sale_price), 0)

      const stats: ProductStats = {
        total_products: products.length,
        active_products: products.filter(p => p.is_active).length,
        low_stock_count: products.filter(p => p.is_active && p.current_stock <= p.min_stock).length,
        out_of_stock_count: products.filter(p => p.is_active && p.current_stock === 0).length,
        medicine_count: products.filter(p => p.is_active && p.is_medicine).length,
        total_value: totalInventoryValue,
        total_inventory_value: totalInventoryValue
      }

      return stats
    } catch (error) {
      console.error('ProductService.getProductStats error:', error)
      throw error
    }
  }

  async getBrands() {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('brand')
        .eq('is_active', true)
        .not('brand', 'is', null)
        .order('brand')

      if (error) {
        throw new Error(`Failed to fetch brands: ${error.message}`)
      }

      // Get unique brands
      const brands = [...new Set(data.map(item => item.brand).filter(Boolean))]
      return brands as string[]
    } catch (error) {
      console.error('ProductService.getBrands error:', error)
      throw error
    }
  }

  async createProduct(productData: Partial<Product>) {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .insert([productData])
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create product: ${error.message}`)
      }

      return data as Product
    } catch (error) {
      console.error('ProductService.createProduct error:', error)
      throw error
    }
  }

  async updateProduct(productId: number, productData: Partial<Product>) {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .update({
          ...productData,
          updated_at: new Date().toISOString()
        })
        .eq('product_id', productId)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update product: ${error.message}`)
      }

      return data as Product
    } catch (error) {
      console.error('ProductService.updateProduct error:', error)
      throw error
    }
  }

  async deleteProduct(productId: number) {
    try {
      const { error } = await this.supabase
        .from('products')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('product_id', productId)

      if (error) {
        throw new Error(`Failed to delete product: ${error.message}`)
      }

      return true
    } catch (error) {
      console.error('ProductService.deleteProduct error:', error)
      throw error
    }
  }

  async getLowStockProducts(limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('low_stock_products')
        .select('*')
        .limit(limit)

      if (error) {
        throw new Error(`Failed to fetch low stock products: ${error.message}`)
      }

      return data
    } catch (error) {
      console.error('ProductService.getLowStockProducts error:', error)
      throw error
    }
  }
}

export const productService = new ProductService()
