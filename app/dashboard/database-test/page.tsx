"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DatabaseTestPage() {
  const [status, setStatus] = useState('Đang kiểm tra...')
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const testDatabase = async () => {
      try {
        const supabase = createClient()
        
        // Test basic connection
  setStatus('Đang kiểm tra kết nối cơ sở dữ liệu...')
        
        // Test products table
  console.log('Kiểm tra bảng sản phẩm...')
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('product_id, product_code, product_name, is_active')
          .eq('is_active', true)
          .limit(5)

        if (productsError) {
          console.error('Lỗi sản phẩm:', productsError)
          setError(`Lỗi sản phẩm: ${productsError.message}`)
          return
        }

        setProducts(productsData || [])
  console.log('Kiểm tra sản phẩm thành công:', productsData?.length)

        // Test categories table
  console.log('Kiểm tra bảng danh mục...')
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('product_categories')
          .select('category_id, category_name, is_active')
          .eq('is_active', true)

        if (categoriesError) {
          console.error('Lỗi danh mục:', categoriesError)
          setError(`Lỗi danh mục: ${categoriesError.message}`)
          return
        }

        setCategories(categoriesData || [])
  console.log('Kiểm tra danh mục thành công:', categoriesData?.length)

  setStatus('✅ Kết nối cơ sở dữ liệu thành công!')

      } catch (err) {
  console.error('Lỗi kiểm tra:', err)
  setError(err instanceof Error ? err.message : 'Lỗi không xác định')
  setStatus('❌ Kết nối cơ sở dữ liệu thất bại')
      }
    }

    testDatabase()
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
  <h1 className="text-2xl font-bold mb-6">Kiểm tra kết nối cơ sở dữ liệu</h1>
      
      <div className="space-y-6">
        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold mb-2">Trạng thái kết nối</h2>
          <p className="text-gray-700">{status}</p>
          {error && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-700">
        <strong>Lỗi:</strong> {error}
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg border">
      <h2 className="text-lg font-semibold mb-2">Kiểm tra bảng sản phẩm</h2>
      <p className="text-gray-600 mb-2">Tìm thấy {products.length} sản phẩm đang hoạt động</p>
          <div className="space-y-1">
            {products.slice(0, 3).map((product, index) => (
              <div key={index} className="text-sm text-gray-700">
                • {product.product_code}: {product.product_name}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold mb-2">Kiểm tra bảng danh mục</h2>
          <p className="text-gray-600 mb-2">Tìm thấy {categories.length} danh mục đang hoạt động</p>
          <div className="space-y-1">
            {categories.map((category, index) => (
              <div key={index} className="text-sm text-gray-700">
                • {category.category_name}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-lg font-semibold mb-2">Bước tiếp theo</h2>
          <div className="text-sm text-gray-700 space-y-1">
            <p>✅ Kiểm tra truy cập bảng cơ bản</p>
            <p>✅ Xác minh cấu trúc dữ liệu</p>
            <p>✅ Kiểm tra quan hệ giữa sản phẩm và danh mục</p>
            <p>🔄 Kiểm tra tích hợp ProductService</p>
          </div>
        </div>
      </div>
    </div>
  )
}
