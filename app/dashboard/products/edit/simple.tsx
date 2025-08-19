"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Save, Edit, Loader2 } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { productCreateService } from "@/lib/services/product-create-service"
import { productUpdateService } from "@/lib/services/product-update-service"
import { productService } from "@/lib/services/product-service"

export default function EditProductSimplePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productId = searchParams.get('id')
  
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingProduct, setIsLoadingProduct] = useState(true)
  const [categories, setCategories] = useState<any[]>([])
  const [originalProduct, setOriginalProduct] = useState<any>(null)
  
  const [formData, setFormData] = useState({
    product_name: '',
    product_code: '',
    sale_price: '',
    cost_price: '',
    category_id: '',
    current_stock: '0',
    min_stock: '0',
    description: '',
    brand: '',
    origin: '',
    is_medicine: false,
    requires_prescription: false,
    allow_sale: true
  })

  // Load product and categories on mount
  useEffect(() => {
    const loadData = async () => {
      if (!productId) {
        toast.error('Không tìm thấy ID sản phẩm')
        router.push('/dashboard/products/catalog')
        return
      }

      try {
        setIsLoadingProduct(true)
        
        // Load categories
        const categoriesData = await productCreateService.getCategories()
        setCategories(categoriesData)
        
        // Load product details
        const result = await productService.getProducts({ 
          page: 1, 
          limit: 1000, 
          search: '',
          category_id: undefined,
          is_medicine: undefined,
          low_stock: undefined,
          out_of_stock: undefined,
          brand: undefined
        })
        
        const product = result.products.find(p => p.product_id.toString() === productId)
        
        if (!product) {
          toast.error('Không tìm thấy sản phẩm')
          router.push('/dashboard/products/catalog')
          return
        }

        setOriginalProduct(product)
        
        // Populate form with product data
        setFormData({
          product_name: product.product_name || '',
          product_code: product.product_code || '',
          sale_price: product.sale_price?.toString() || '0',
          cost_price: product.cost_price?.toString() || '',
          category_id: product.category?.category_id?.toString() || '',
          current_stock: product.current_stock?.toString() || '0',
          min_stock: product.min_stock?.toString() || '0',
          description: product.description || '',
          brand: product.brand || '',
          origin: product.origin || '',
          is_medicine: product.is_medicine || false,
          requires_prescription: product.requires_prescription || false,
          allow_sale: product.allow_sale !== false
        })
        
      } catch (error) {
        console.error('Error loading product data:', error)
        toast.error('Có lỗi khi tải dữ liệu sản phẩm')
        router.push('/dashboard/products/catalog')
      } finally {
        setIsLoadingProduct(false)
      }
    }
    
    loadData()
  }, [productId, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      if (!originalProduct) return
      
      const result = await productUpdateService.updateProduct({
        product_id: originalProduct.product_id,
        product_name: formData.product_name,
        product_code: formData.product_code,
        sale_price: parseFloat(formData.sale_price) || 0,
        cost_price: formData.cost_price ? parseFloat(formData.cost_price) : undefined,
        category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
        current_stock: parseInt(formData.current_stock) || 0,
        min_stock: parseInt(formData.min_stock) || 0,
        description: formData.description || undefined,
        brand: formData.brand || undefined,
        origin: formData.origin || undefined,
        is_medicine: formData.is_medicine,
        requires_prescription: formData.requires_prescription,
        allow_sale: formData.allow_sale
      })
      
      if (result.success) {
        toast.success('Sản phẩm đã được cập nhật thành công!')
        router.push('/dashboard/products/catalog')
      } else {
        toast.error(result.error || 'Có lỗi xảy ra khi cập nhật sản phẩm')
      }
    } catch (error) {
      console.error('Error updating product:', error)
      toast.error('Có lỗi xảy ra khi cập nhật sản phẩm')
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

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }))
  }

  if (isLoadingProduct) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Đang tải dữ liệu sản phẩm...</p>
        </div>
      </div>
    )
  }

  if (!originalProduct) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Edit className="h-8 w-8 mx-auto mb-4 text-gray-400" />
          <p>Không tìm thấy sản phẩm</p>
        </div>
      </div>
    )
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
            <h1 className="text-2xl font-bold text-gray-900">Chỉnh Sửa Sản Phẩm</h1>
            <p className="text-gray-600">Cập nhật thông tin: {originalProduct.product_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Edit className="h-5 w-5 text-blue-600" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông Tin Sản Phẩm</CardTitle>
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
                <Label htmlFor="product_code">Mã Sản Phẩm</Label>
                <Input
                  id="product_code"
                  name="product_code"
                  value={formData.product_code}
                  onChange={handleChange}
                  placeholder="SP001"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Label htmlFor="cost_price">Giá Vốn</Label>
                <Input
                  id="cost_price"
                  name="cost_price"
                  type="number"
                  value={formData.cost_price}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category_id">Danh Mục</Label>
                <Select value={formData.category_id} onValueChange={(value) => handleSelectChange('category_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn danh mục" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.category_id} value={category.category_id.toString()}>
                        {category.category_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brand">Thương Hiệu</Label>
                <Input
                  id="brand"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  placeholder="Tên thương hiệu"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="origin">Nhà Sản Xuất</Label>
                <Input
                  id="origin"
                  name="origin"
                  value={formData.origin}
                  onChange={handleChange}
                  placeholder="Tên nhà sản xuất"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_medicine"
                  checked={formData.is_medicine}
                  onCheckedChange={(checked) => handleCheckboxChange('is_medicine', !!checked)}
                />
                <Label htmlFor="is_medicine">Là thuốc thú y</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requires_prescription"
                  checked={formData.requires_prescription}
                  onCheckedChange={(checked) => handleCheckboxChange('requires_prescription', !!checked)}
                />
                <Label htmlFor="requires_prescription">Cần kê đơn</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allow_sale"
                  checked={formData.allow_sale}
                  onCheckedChange={(checked) => handleCheckboxChange('allow_sale', !!checked)}
                />
                <Label htmlFor="allow_sale">Cho phép bán</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Mô Tả</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Mô tả chi tiết về sản phẩm..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" className="flex items-center gap-2" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isLoading ? 'Đang lưu...' : 'Lưu Thay Đổi'}
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
