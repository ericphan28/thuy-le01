"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Edit, Package, Loader2, Barcode, AlertTriangle, Pill } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { productService, Product } from "@/lib/services/product-service"
import { formatVND } from "@/lib/utils/currency"

export default function ViewProductPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productId = searchParams.get('id')
  
  const [isLoading, setIsLoading] = useState(true)
  const [product, setProduct] = useState<Product | null>(null)

  // Load product on mount
  useEffect(() => {
    const loadProduct = async () => {
      if (!productId) {
        toast.error('Không tìm thấy ID sản phẩm')
        router.push('/dashboard/products/catalog')
        return
      }

      try {
        setIsLoading(true)
        
        const result = await productService.getProducts({ 
          page: 1, 
          limit: 1000, 
          search: productId
        })
        
        const foundProduct = result.products.find(p => p.product_id.toString() === productId)
        
        if (!foundProduct) {
          toast.error('Không tìm thấy sản phẩm')
          router.push('/dashboard/products/catalog')
          return
        }

        setProduct(foundProduct)
        
      } catch (error) {
        console.error('Error loading product:', error)
        toast.error('Có lỗi khi tải thông tin sản phẩm')
        router.push('/dashboard/products/catalog')
      } finally {
        setIsLoading(false)
      }
    }
    
    loadProduct()
  }, [productId, router])

  // Stock status calculation
  const getStockStatus = (product: Product) => {
    if (product.current_stock === 0) {
      return { label: 'Hết hàng', color: 'bg-red-500 text-white', variant: 'destructive' as const }
    }
    if (product.current_stock <= product.min_stock) {
      return { label: 'Sắp hết', color: 'bg-orange-500 text-white', variant: 'secondary' as const }
    }
    return { label: 'Còn hàng', color: 'bg-green-500 text-white', variant: 'default' as const }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Đang tải thông tin sản phẩm...</p>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Package className="h-8 w-8 mx-auto mb-4 text-gray-400" />
          <p>Không tìm thấy sản phẩm</p>
        </div>
      </div>
    )
  }

  const stockStatus = getStockStatus(product)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/products/catalog">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chi Tiết Sản Phẩm</h1>
            <p className="text-gray-600">{product.product_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/products/edit?id=${product.product_id}`}>
            <Button className="flex items-center gap-2">
              <Edit className="h-4 w-4" />
              Chỉnh Sửa
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Image */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-6">
              <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center mb-4 overflow-hidden relative">
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={product.product_name}
                    fill
                    className="object-cover rounded-lg"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 300px"
                    priority
                  />
                ) : (
                  <Package className="h-20 w-20 text-gray-400" />
                )}
              </div>
              
              {/* Quick Stats */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Trạng thái kho:</span>
                  <Badge className={stockStatus.color}>
                    {stockStatus.label}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Tồn kho:</span>
                  <span className="font-medium">{Math.floor(product.current_stock)} sản phẩm</span>
                </div>
                
                {product.min_stock > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Tối thiểu:</span>
                    <span className="text-sm">{Math.floor(product.min_stock)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Product Details */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Thông Tin Chi Tiết
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Tên sản phẩm</label>
                  <p className="text-lg font-semibold">{product.product_name}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Mã sản phẩm</label>
                  <p className="font-mono">{product.product_code}</p>
                </div>
                
                {product.barcode && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Mã vạch</label>
                    <div className="flex items-center gap-2">
                      <Barcode className="h-4 w-4" />
                      <p className="font-mono">{product.barcode}</p>
                    </div>
                  </div>
                )}
                
                {product.brand && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Thương hiệu</label>
                    <p>{product.brand}</p>
                  </div>
                )}
                
                {product.category && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Danh mục</label>
                    <Badge variant="outline">{product.category.category_name}</Badge>
                  </div>
                )}
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Loại sản phẩm</label>
                  <p>{product.product_type || 'Không xác định'}</p>
                </div>
              </div>

              <Separator />

              {/* Pricing */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Giá bán</label>
                  <p className="text-2xl font-bold text-blue-600">{formatVND(product.sale_price)}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Giá vốn</label>
                  <p className="text-lg">{formatVND(product.cost_price)}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Giá cơ bản</label>
                  <p className="text-lg">{formatVND(product.base_price)}</p>
                </div>
              </div>

              <Separator />

              {/* Stock Management */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Tồn kho hiện tại</label>
                  <p className="text-xl font-semibold">{Math.floor(product.current_stock)}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Đã đặt trước</label>
                  <p className="text-lg">{Math.floor(product.reserved_stock || 0)}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Có thể bán</label>
                  <p className="text-lg">{Math.floor(product.available_stock || 0)}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Tối đa</label>
                  <p className="text-lg">{Math.floor(product.max_stock || 0)}</p>
                </div>
              </div>

              <Separator />

              {/* Special Properties */}
              <div className="space-y-3">
                <h3 className="font-semibold">Thuộc tính đặc biệt</h3>
                <div className="flex flex-wrap gap-2">
                  {product.is_medicine && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Pill className="h-3 w-3" />
                      Thuốc thú y
                    </Badge>
                  )}
                  {product.requires_prescription && (
                    <Badge variant="outline" className="flex items-center gap-1 text-orange-600">
                      <AlertTriangle className="h-3 w-3" />
                      Cần kê đơn
                    </Badge>
                  )}
                  {!product.allow_sale && (
                    <Badge variant="destructive">Không cho phép bán</Badge>
                  )}
                  {!product.is_active && (
                    <Badge variant="secondary">Không hoạt động</Badge>
                  )}
                  {product.track_serial && (
                    <Badge variant="outline">Theo dõi serial</Badge>
                  )}
                  {product.expiry_tracking && (
                    <Badge variant="outline">Theo dõi hạn sử dụng</Badge>
                  )}
                </div>
              </div>

              {/* Description */}
              {product.description && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Mô tả</h3>
                    <p className="text-gray-700 whitespace-pre-wrap">{product.description}</p>
                  </div>
                </>
              )}

              {/* Additional Info */}
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
                <div>
                  <span className="font-medium">Ngày tạo:</span> {new Date(product.created_at).toLocaleDateString('vi-VN')}
                </div>
                <div>
                  <span className="font-medium">Cập nhật cuối:</span> {new Date(product.updated_at).toLocaleDateString('vi-VN')}
                </div>
                {product.origin && (
                  <div>
                    <span className="font-medium">Xuất xứ:</span> {product.origin}
                  </div>
                )}
                {product.storage_condition && (
                  <div>
                    <span className="font-medium">Điều kiện bảo quản:</span> {product.storage_condition}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
