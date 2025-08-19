import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Package, ShoppingCart, Edit, Eye, MoreHorizontal, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { useState } from 'react'

// Extended Product type for catalog
export interface CatalogProduct {
  product_id: number
  product_name: string
  product_code: string
  sale_price: number
  purchase_price: number
  stock_quantity: number
  category_name: string
  unit_name: string
  is_active: boolean
  created_at: string
}

interface CatalogProductCardProps {
  product: CatalogProduct
  onEdit?: (product: CatalogProduct) => void
  onView?: (product: CatalogProduct) => void
  onAddToCart?: (product: CatalogProduct) => void
  onDelete?: (product: CatalogProduct) => void
  compact?: boolean
  selected?: boolean
  onSelectionChange?: (selected: boolean) => void
}

export function CatalogProductCard({ 
  product, 
  onEdit, 
  onView, 
  onAddToCart, 
  onDelete,
  compact = false,
  selected = false,
  onSelectionChange
}: CatalogProductCardProps) {
  const isLowStock = product.stock_quantity <= 5
  const isOutOfStock = product.stock_quantity === 0
  const margin = product.sale_price - product.purchase_price
  const marginPercent = product.purchase_price > 0 ? (margin / product.purchase_price) * 100 : 0

  if (compact) {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {/* Selection Checkbox */}
            {onSelectionChange && (
              <Checkbox
                checked={selected}
                onCheckedChange={onSelectionChange}
                className="mr-4"
              />
            )}

            {/* Product Info */}
            <div className="flex items-center space-x-4 flex-1">
              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">
                  {product.product_name}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {product.product_code}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {product.category_name}
                  </Badge>
                  <span className={`text-xs font-medium ${
                    isOutOfStock 
                      ? 'text-red-600' 
                      : isLowStock 
                        ? 'text-yellow-600' 
                        : 'text-green-600'
                  }`}>
                    {isOutOfStock ? 'Hết hàng' : `${product.stock_quantity} ${product.unit_name}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Price and Actions */}
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="font-bold text-sm">
                  {product.sale_price.toLocaleString('vi-VN')}đ
                </p>
                <p className="text-xs text-muted-foreground">
                  Lãi: {marginPercent.toFixed(1)}%
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onView && (
                    <DropdownMenuItem onClick={() => onView(product)}>
                      <Eye className="h-4 w-4 mr-2" />
                      Xem chi tiết
                    </DropdownMenuItem>
                  )}
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(product)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Chỉnh sửa
                    </DropdownMenuItem>
                  )}
                  {onAddToCart && (
                    <DropdownMenuItem 
                      onClick={() => onAddToCart(product)}
                      disabled={isOutOfStock}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Thêm vào giỏ
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.95 }}
      className="h-full"
    >
      <Card className={`h-full cursor-pointer hover:shadow-lg transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}>
        <CardContent className="p-4 h-full flex flex-col">
          {/* Selection Checkbox */}
          {onSelectionChange && (
            <div className="flex justify-end mb-2">
              <Checkbox
                checked={selected}
                onCheckedChange={onSelectionChange}
              />
            </div>
          )}

          {/* Product Image Placeholder */}
          <div className="w-full h-32 bg-muted rounded-lg flex items-center justify-center mb-3">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>

          {/* Product Info */}
          <div className="flex-1 space-y-2">
            <div>
              <h3 className="font-semibold text-sm line-clamp-2 h-10">
                {product.product_name}
              </h3>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {product.product_code}
              </p>
            </div>

            <div className="space-y-1">
              <Badge variant="outline" className="text-xs">
                {product.category_name}
              </Badge>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tồn kho:</span>
                <span className={`font-medium ${
                  isOutOfStock 
                    ? 'text-red-600' 
                    : isLowStock 
                      ? 'text-yellow-600' 
                      : 'text-green-600'
                }`}>
                  {isOutOfStock ? 'Hết hàng' : `${product.stock_quantity} ${product.unit_name}`}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Lãi:</span>
                <span className="font-medium text-green-600">
                  {marginPercent.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Price */}
            <div className="text-center pt-2 border-t">
              <p className="text-lg font-bold text-foreground">
                {product.sale_price.toLocaleString('vi-VN')}đ
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            {onView && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onView(product)
                }}
                className="flex-1"
              >
                <Eye className="h-3 w-3" />
              </Button>
            )}
            
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(product)
                }}
                className="flex-1"
              >
                <Edit className="h-3 w-3" />
              </Button>
            )}

            {onAddToCart && (
              <Button
                onClick={(e) => {
                  e.stopPropagation()
                  onAddToCart(product)
                }}
                disabled={isOutOfStock}
                size="sm"
                className="flex-1"
              >
                <ShoppingCart className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
