import { createClient } from '@/lib/supabase/client'
import { CreateProductData } from './product-create-service'

export interface UpdateProductData extends Partial<CreateProductData> {
  product_id: number
}

export interface UpdateProductResponse {
  success: boolean
  data?: any
  error?: string
}

export class ProductUpdateService {
  private supabase = createClient()

  async updateProduct(productData: UpdateProductData): Promise<UpdateProductResponse> {
    try {
      console.log('Updating product with data:', productData)

      // Validate required fields
      if (!productData.product_id) {
        return {
          success: false,
          error: 'ID sản phẩm là bắt buộc'
        }
      }

      if (productData.product_name && !productData.product_name?.trim()) {
        return {
          success: false,
          error: 'Tên sản phẩm không được để trống'
        }
      }

      if (productData.sale_price && productData.sale_price <= 0) {
        return {
          success: false,
          error: 'Giá bán phải lớn hơn 0'
        }
      }

      // Check if product exists
      const { data: existingProduct, error: checkError } = await this.supabase
        .from('products')
        .select('product_id')
        .eq('product_id', productData.product_id)
        .single()

      if (checkError) {
        console.error('Error checking existing product:', checkError)
        return {
          success: false,
          error: 'Không tìm thấy sản phẩm: ' + checkError.message
        }
      }

      // Prepare data for update - only include fields that are provided
      const updateData: any = {
        updated_at: new Date().toISOString()
      }

      // Only update fields that are provided
      if (productData.product_name !== undefined) {
        updateData.product_name = productData.product_name.trim()
      }
      
      if (productData.product_code !== undefined) {
        updateData.product_code = productData.product_code.trim()
      }
      
      if (productData.sale_price !== undefined) {
        updateData.sale_price = productData.sale_price
      }
      
      if (productData.cost_price !== undefined) {
        updateData.cost_price = productData.cost_price
      }
      
      if (productData.base_price !== undefined) {
        updateData.base_price = productData.base_price
      }
      
      if (productData.category_id !== undefined) {
        updateData.category_id = productData.category_id
      }
      
      if (productData.base_unit_id !== undefined) {
        updateData.base_unit_id = productData.base_unit_id
      }
      
      if (productData.current_stock !== undefined) {
        updateData.current_stock = productData.current_stock
      }
      
      if (productData.min_stock !== undefined) {
        updateData.min_stock = productData.min_stock
      }
      
      if (productData.max_stock !== undefined) {
        updateData.max_stock = productData.max_stock
      }
      
      if (productData.description !== undefined) {
        updateData.description = productData.description?.trim() || null
      }
      
      if (productData.brand !== undefined) {
        updateData.brand = productData.brand?.trim() || null
      }
      
      if (productData.origin !== undefined) {
        updateData.origin = productData.origin?.trim() || null
      }
      
      if (productData.barcode !== undefined) {
        updateData.barcode = productData.barcode?.trim() || null
      }
      
      if (productData.image_url !== undefined) {
        updateData.image_url = productData.image_url?.trim() || null
      }
      
      if (productData.product_type !== undefined) {
        updateData.product_type = productData.product_type
      }
      
      if (productData.is_medicine !== undefined) {
        updateData.is_medicine = productData.is_medicine
      }
      
      if (productData.requires_prescription !== undefined) {
        updateData.requires_prescription = productData.requires_prescription
      }
      
      if (productData.allow_sale !== undefined) {
        updateData.allow_sale = productData.allow_sale
      }
      
      if (productData.is_active !== undefined) {
        updateData.is_active = productData.is_active
      }
      
      if (productData.storage_condition !== undefined) {
        updateData.storage_condition = productData.storage_condition?.trim() || null
      }
      
      if (productData.expiry_tracking !== undefined) {
        updateData.expiry_tracking = productData.expiry_tracking
      }
      
      if (productData.track_serial !== undefined) {
        updateData.track_serial = productData.track_serial
      }
      
      if (productData.conversion_rate !== undefined) {
        updateData.conversion_rate = productData.conversion_rate
      }
      
      if (productData.unit_attributes !== undefined) {
        updateData.unit_attributes = productData.unit_attributes?.trim() || null
      }
      
      if (productData.related_product_codes !== undefined) {
        updateData.related_product_codes = productData.related_product_codes?.trim() || null
      }

      console.log('Updating product data:', updateData)

      // Update the product
      const { data, error } = await this.supabase
        .from('products')
        .update(updateData)
        .eq('product_id', productData.product_id)
        .select('*')
        .single()

      if (error) {
        console.error('Error updating product:', error)
        return {
          success: false,
          error: 'Lỗi khi cập nhật sản phẩm: ' + error.message
        }
      }

      console.log('Product updated successfully:', data)

      return {
        success: true,
        data: data
      }

    } catch (error) {
      console.error('Unexpected error updating product:', error)
      return {
        success: false,
        error: 'Lỗi không mong muốn: ' + (error as Error).message
      }
    }
  }

  async deleteProduct(productId: number): Promise<UpdateProductResponse> {
    try {
      // Soft delete by setting is_active to false
      const { data, error } = await this.supabase
        .from('products')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('product_id', productId)
        .select('*')
        .single()

      if (error) {
        console.error('Error deleting product:', error)
        return {
          success: false,
          error: 'Lỗi khi xóa sản phẩm: ' + error.message
        }
      }

      return {
        success: true,
        data: data
      }

    } catch (error) {
      console.error('Unexpected error deleting product:', error)
      return {
        success: false,
        error: 'Lỗi không mong muốn: ' + (error as Error).message
      }
    }
  }
}

export const productUpdateService = new ProductUpdateService()
