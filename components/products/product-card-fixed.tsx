"use client"

import { Product } from '@/lib/services/product-service'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatVND } from '@/lib/utils/currency'
import { 
  Package, 
  AlertTriangle, 
  Pill, 
  Edit, 
  Eye,
  ShoppingCart,
  Barcode
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import Image from 'next/image'

interface ProductCardProps {
  product: Product
  layout?: 'grid' | 'list'
  onEdit?: (product: Product) => void
  onView?: (product: Product) => void
  onAddToCart?: (product: Product) => void
  compact?: boolean
}

export function ProductCard({ 
  product, 
  layout = 'grid',
  onEdit, 
  onView, 
  onAddToCart, 
  compact = false 
}: ProductCardProps) {
  
  // Stock status calculation
  const getStockStatus = () => {
    if (product.current_stock === 0) {
      return { label: 'Hết hàng', color: 'bg-red-500 text-white', variant: 'destructive' as const }
    }
    if (product.current_stock <= product.min_stock) {
      return { label: 'Sắp hết', color: 'bg-orange-500 text-white', variant: 'secondary' as const }
    }
    return { label: 'Còn hàng', color: 'bg-green-500 text-white', variant: 'default' as const }
  }

  const stockStatus = getStockStatus()

  // Handle actions
  const handleEdit = () => onEdit?.(product)
  const handleView = () => onView?.(product)
  const handleAddToCart = () => onAddToCart?.(product)

  if (layout === 'list') {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Product Image */}
            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.product_name}
                  fill
                  sizes="64px"
                  className="object-cover rounded-lg"
                />
              ) : (
                <Package className="h-8 w-8 text-gray-400" />
              )}
            </div>

            {/* Product Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {product.product_name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-500">
                      Mã: {product.product_code}
                    </span>
                    {product.barcode && (
                      <div className="flex items-center text-sm text-gray-500">
                        <Barcode className="h-3 w-3 mr-1" />
                        {product.barcode}
                      </div>
                    )}
                  </div>
                  
                  {/* Category and Brand */}
                  <div className="flex items-center gap-2 mt-1">
                    {product.category && (
                      <Badge variant="outline" className="text-xs">
                        {product.category.category_name}
                      </Badge>
                    )}
                    {product.brand && (
                      <span className="text-xs text-gray-500">{product.brand}</span>
                    )}
                  </div>

                  {/* Medicine and prescription indicators */}
                  <div className="flex items-center gap-2 mt-2">
                    {product.is_medicine && (
                      <Badge variant="outline" className="text-xs">
                        <Pill className="h-3 w-3 mr-1" />
                        Thuốc thú y
                      </Badge>
                    )}
                    {product.requires_prescription && (
                      <Badge variant="outline" className="text-xs text-orange-600">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Cần kê đơn
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Price and Stock */}
                <div className="text-right ml-4">
                  <div className="font-bold text-lg text-blue-600">
                    {formatVND(product.sale_price)}
                  </div>
                  {product.cost_price && (
                    <div className="text-sm text-gray-500 line-through">
                      Vốn: {formatVND(product.cost_price)}
                    </div>
                  )}
                  
                  {/* Stock Status */}
                  <div className="mt-2">
                    <Badge className={stockStatus.color}>
                      {Math.floor(product.current_stock)} sản phẩm
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 ml-4">
                  {onView && (
                    <Button variant="ghost" size="sm" onClick={handleView}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {onEdit && (
                    <Button variant="ghost" size="sm" onClick={handleEdit}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  )}
                  {onAddToCart && product.allow_sale && product.current_stock > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleAddToCart}>
                      <ShoppingCart className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Grid layout (default)
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className={cn("p-4", compact && "p-3")}>
        {/* Product Image */}
        <div className={cn(
          "relative w-full bg-gray-100 rounded-lg mb-3 flex items-center justify-center",
          compact ? "h-32" : "h-40"
        )}>
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.product_name}
              fill
              sizes="(max-width:768px) 100vw, 25vw"
              className="object-cover rounded-lg"
            />
          ) : (
            <Package className={cn("text-gray-400", compact ? "h-8 w-8" : "h-12 w-12")} />
          )}
          
          {/* Stock Badge */}
          <div className="absolute top-2 right-2">
            <Badge className={stockStatus.color}>
              {Math.floor(product.current_stock)}
            </Badge>
          </div>
        </div>

        {/* Product Info */}
        <div className="space-y-2">
          <h3 className={cn(
            "font-semibold text-gray-900 line-clamp-2",
            compact ? "text-sm" : "text-base"
          )}>
            {product.product_name}
          </h3>
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Mã: {product.product_code}</span>
            {product.category && (
              <Badge variant="outline" className="text-xs">
                {product.category.category_name}
              </Badge>
            )}
          </div>

          {/* Barcode */}
          {product.barcode && (
            <div className="flex items-center text-xs text-gray-500">
              <Barcode className="h-3 w-3 mr-1" />
              {product.barcode}
            </div>
          )}

          {/* Brand */}
          {product.brand && (
            <div className="text-xs text-gray-600">
              Thương hiệu: <span className="font-medium">{product.brand}</span>
            </div>
          )}

          {/* Price */}
          <div className="flex items-center justify-between">
            <div>
              <div className={cn(
                "font-bold text-blue-600",
                compact ? "text-sm" : "text-base"
              )}>
                {formatVND(product.sale_price)}
              </div>
              {product.cost_price && (
                <div className="text-xs text-gray-500 line-through">
                  Vốn: {formatVND(product.cost_price)}
                </div>
              )}
            </div>
            
            {/* Quick Actions */}
            <div className="flex items-center gap-1">
              {onView && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleView}>
                  <Eye className="h-3 w-3" />
                </Button>
              )}
              {onEdit && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleEdit}>
                  <Edit className="h-3 w-3" />
                </Button>
              )}
              {onAddToCart && product.allow_sale && product.current_stock > 0 && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleAddToCart}>
                  <ShoppingCart className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Medicine and prescription indicators */}
          <div className="flex items-center gap-1 flex-wrap">
            {product.is_medicine && (
              <Badge variant="outline" className="text-xs">
                <Pill className="h-2 w-2 mr-1" />
                Thuốc
              </Badge>
            )}
            {product.requires_prescription && (
              <Badge variant="outline" className="text-xs text-orange-600">
                <AlertTriangle className="h-2 w-2 mr-1" />
                Kê đơn
              </Badge>
            )}
            {product.current_stock <= product.min_stock && product.current_stock > 0 && (
              <Badge variant="outline" className="text-xs text-red-600">
                Sắp hết
              </Badge>
            )}
          </div>

          {/* Stock Info */}
          <div className="text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Tồn kho: <span className="font-medium">{Math.floor(product.current_stock)}</span></span>
              {product.min_stock > 0 && (
                <span>Tối thiểu: {Math.floor(product.min_stock)}</span>
              )}
            </div>
            {product.available_stock !== product.current_stock && (
              <div className="text-xs text-orange-600 mt-1">
                Có thể bán: {Math.floor(product.available_stock)}
              </div>
            )}
          </div>

          {/* Storage condition */}
          {product.storage_condition && (
            <div className="text-xs text-gray-500">
              Bảo quản: {product.storage_condition}
            </div>
          )}

          {/* Description (only in grid mode and not compact) */}
          {!compact && product.description && (
            <div className="text-xs text-gray-600 line-clamp-2">
              {product.description}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
