"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Save, Package, Loader2 } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { productCreateService } from "@/lib/services/product-create-service"

export default function NewProductSimplePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    product_name: '',
    product_code: '',
    sale_price: '',
    current_stock: '0',
    min_stock: '0'
  })

  // Generate product code on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const generatedCode = await productCreateService.generateProductCode('SP')
        setFormData(prev => ({
          ...prev,
          product_code: generatedCode
        }))
      } catch (error) {
        console.error('Error loading initial data:', error)
        toast.error('Có lỗi khi tải dữ liệu ban đầu')
      }
    }
    
    loadData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      console.log('Form data before create:', formData)
      
      const result = await productCreateService.createProduct({
        product_name: formData.product_name,
        product_code: formData.product_code,
        sale_price: parseFloat(formData.sale_price) || 0,
        current_stock: parseInt(formData.current_stock) || 0,
        min_stock: parseInt(formData.min_stock) || 0,
        allow_sale: true,
        is_active: true
      })
      
      console.log('Create result:', result)
      
      if (result.success) {
        toast.success('Sản phẩm đã được tạo thành công!')
        router.push('/dashboard/products/catalog')
      } else {
        toast.error(result.error || 'Có lỗi xảy ra khi tạo sản phẩm')
      }
    } catch (error) {
      console.error('Error creating product:', error)
      toast.error('Có lỗi xảy ra khi tạo sản phẩm')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/products/catalog">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Thêm Sản Phẩm Mới (Đơn giản)</h1>
            <p className="text-gray-600">Tạo sản phẩm mới trong kho hàng</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-green-600" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông Tin Cơ Bản</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product_name">Tên Sản Phẩm *</Label>
                <Input
                  id="product_name"
                  name="product_name"
                  value={formData.product_name}
                  onChange={handleChange}
                  placeholder="Nhập tên sản phẩm"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="product_code">Mã Sản Phẩm *</Label>
                <Input
                  id="product_code"
                  name="product_code"
                  value={formData.product_code}
                  onChange={handleChange}
                  placeholder="SP001"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sale_price">Giá Bán *</Label>
                <Input
                  id="sale_price"
                  name="sale_price"
                  type="number"
                  value={formData.sale_price}
                  onChange={handleChange}
                  placeholder="0"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="current_stock">Số Lượng Tồn</Label>
                <Input
                  id="current_stock"
                  name="current_stock"
                  type="number"
                  value={formData.current_stock}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="min_stock">Tồn Kho Tối Thiểu</Label>
                <Input
                  id="min_stock"
                  name="min_stock"
                  type="number"
                  value={formData.min_stock}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" className="flex items-center gap-2" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isLoading ? 'Đang tạo...' : 'Tạo Sản Phẩm'}
              </Button>
              <Link href="/dashboard/products/catalog">
                <Button variant="outline" disabled={isLoading}>
                  Hủy
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
