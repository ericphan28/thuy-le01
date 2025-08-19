import { createClient } from '@/lib/supabase/client'

export interface CreateProductData {
  product_name: string
  product_code: string
  sale_price: number
  cost_price?: number
  base_price?: number
  category_id?: number
  base_unit_id?: number
  current_stock: number
  min_stock: number
  max_stock?: number
  description?: string
  brand?: string
  origin?: string
  barcode?: string
  image_url?: string
  product_type?: string
  is_medicine?: boolean
  requires_prescription?: boolean
  allow_sale?: boolean
  is_active?: boolean
  storage_condition?: string
  expiry_tracking?: boolean
  track_serial?: boolean
  conversion_rate?: number
  unit_attributes?: string
  related_product_codes?: string
}

export interface CreateProductResponse {
  success: boolean
  data?: any
  error?: string
}

export class ProductCreateService {
  private supabase = createClient()

  async createProduct(productData: CreateProductData): Promise<CreateProductResponse> {
    try {
      console.log('Creating product with data:', productData)

      // Test Supabase connection first
      try {
        const { data: testData, error: testError } = await this.supabase
          .from('products')
          .select('count')
          .limit(1)
        
        if (testError) {
          console.error('Supabase connection test failed:', testError)
          return {
            success: false,
            error: 'Lỗi kết nối database: ' + testError.message
          }
        }
        console.log('Supabase connection test successful')
      } catch (connError) {
        console.error('Supabase connection error:', connError)
        return {
          success: false,
          error: 'Không thể kết nối database'
        }
      }

      // Validate required fields
      if (!productData.product_name?.trim()) {
        return {
          success: false,
          error: 'Tên sản phẩm là bắt buộc'
        }
      }

      if (!productData.product_code?.trim()) {
        return {
          success: false,
          error: 'Mã sản phẩm là bắt buộc'
        }
      }

      if (!productData.sale_price || productData.sale_price <= 0) {
        return {
          success: false,
          error: 'Giá bán phải lớn hơn 0'
        }
      }

      // Check if product code already exists
      const { data: existingProduct, error: checkError } = await this.supabase
        .from('products')
        .select('product_id')
        .eq('product_code', productData.product_code)
        .maybeSingle()

      if (checkError) {
        console.error('Error checking existing product:', checkError)
        return {
          success: false,
          error: 'Lỗi khi kiểm tra mã sản phẩm: ' + checkError.message
        }
      }

      if (existingProduct) {
        return {
          success: false,
          error: 'Mã sản phẩm đã tồn tại'
        }
      }

      // Prepare minimal data for insertion - only required fields
      const insertData: any = {
        product_name: productData.product_name.trim(),
        product_code: productData.product_code.trim(),
        sale_price: productData.sale_price,
        cost_price: productData.cost_price || 0,
        base_price: productData.base_price || productData.sale_price,
        current_stock: productData.current_stock || 0,
        min_stock: productData.min_stock || 0,
        max_stock: productData.max_stock || 0,
        is_medicine: productData.is_medicine || false,
        requires_prescription: productData.requires_prescription || false,
        allow_sale: productData.allow_sale !== false,
        is_active: productData.is_active !== false,
        expiry_tracking: productData.expiry_tracking || false,
        track_serial: productData.track_serial || false,
        conversion_rate: productData.conversion_rate || 1.0,
        product_type: productData.product_type || 'Hàng hóa'
      }

      // Add optional fields only if they have values
      if (productData.category_id) {
        insertData.category_id = productData.category_id
      }
      
      if (productData.base_unit_id) {
        insertData.base_unit_id = productData.base_unit_id
      } else {
        // Set default base_unit_id to 6 (from DB schema)
        insertData.base_unit_id = 6
      }
      
      if (productData.description?.trim()) {
        insertData.description = productData.description.trim()
      }
      
      if (productData.brand?.trim()) {
        insertData.brand = productData.brand.trim()
      }
      
      if (productData.origin?.trim()) {
        insertData.origin = productData.origin.trim()
      }
      
      if (productData.barcode?.trim()) {
        insertData.barcode = productData.barcode.trim()
      }
      
      if (productData.image_url?.trim()) {
        insertData.image_url = productData.image_url.trim()
      }
      
      if (productData.storage_condition?.trim()) {
        insertData.storage_condition = productData.storage_condition.trim()
      }
      
      if (productData.unit_attributes?.trim()) {
        insertData.unit_attributes = productData.unit_attributes.trim()
      }
      
      if (productData.related_product_codes?.trim()) {
        insertData.related_product_codes = productData.related_product_codes.trim()
      }

      console.log('Inserting product data:', insertData)

      // Insert the product - without complex relationship select to avoid conflicts
      const { data, error } = await this.supabase
        .from('products')
        .insert([insertData])
        .select('*')
        .single()

      if (error) {
        console.error('Error creating product:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        console.error('Insert data was:', JSON.stringify(insertData, null, 2))
        return {
          success: false,
          error: 'Lỗi khi tạo sản phẩm: ' + error.message
        }
      }

      console.log('Product created successfully:', data)

      return {
        success: true,
        data: data
      }

    } catch (error) {
      console.error('Unexpected error creating product:', error)
      return {
        success: false,
        error: 'Lỗi không mong muốn: ' + (error as Error).message
      }
    }
  }

  // Get all categories for the form dropdown
  async getCategories() {
    try {
      const { data, error } = await this.supabase
        .from('product_categories')
        .select('*')
        .eq('is_active', true)
        .order('category_name')

      if (error) {
        console.error('Error fetching categories:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Unexpected error fetching categories:', error)
      return []
    }
  }

  // Get all units for the form dropdown
  async getUnits() {
    try {
      const { data, error } = await this.supabase
        .from('units')
        .select('*')
        .eq('is_active', true)
        .order('unit_name')

      if (error) {
        console.error('Error fetching units:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Unexpected error fetching units:', error)
      return []
    }
  }

  // Generate a unique product code
  async generateProductCode(prefix: string = 'SP'): Promise<string> {
    try {
      // Get the highest existing product code with the same prefix
      const { data, error } = await this.supabase
        .from('products')
        .select('product_code')
        .like('product_code', `${prefix}%`)
        .order('product_code', { ascending: false })
        .limit(1)

      if (error) {
        console.error('Error generating product code:', error)
        return `${prefix}001`
      }

      if (!data || data.length === 0) {
        return `${prefix}001`
      }

      const lastCode = data[0].product_code
      const numberPart = lastCode.replace(prefix, '')
      const nextNumber = parseInt(numberPart) + 1
      
      return `${prefix}${nextNumber.toString().padStart(3, '0')}`
    } catch (error) {
      console.error('Unexpected error generating product code:', error)
      return `${prefix}001`
    }
  }
}

export const productCreateService = new ProductCreateService()
