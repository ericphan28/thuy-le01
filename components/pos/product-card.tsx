import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Package, Pill, FileText, ShoppingCart } from 'lucide-react'
import type { Product } from '@/lib/types/pos'

interface ProductCardProps {
  product: Product
  onAddToCart: (product: Product) => void
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const isLowStock = product.current_stock < 10
  const isOutOfStock = product.current_stock === 0

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="h-full"
    >
      <Card className="supabase-product-card h-full">
        <CardContent className="p-4 h-full flex flex-col">
          {/* Header với badges */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex flex-col gap-1.5">
              {product.is_medicine && (
                <Badge 
                  variant="secondary" 
                  className="w-fit text-xs bg-brand/10 text-brand border-brand/20 font-medium"
                >
                  <Pill className="w-3 h-3 mr-1" />
                  Thuốc
                </Badge>
              )}
              {product.requires_prescription && (
                <Badge 
                  variant="destructive" 
                  className="w-fit text-xs font-medium"
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Đơn thuốc
                </Badge>
              )}
            </div>
            
            {/* Stock status indicator */}
            <div className={`w-3 h-3 rounded-full ${
              isOutOfStock 
                ? 'bg-red-500 shadow-lg shadow-red-500/50' 
                : isLowStock 
                  ? 'bg-amber-500 shadow-lg shadow-amber-500/50' 
                  : 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
            }`} />
          </div>

          {/* Product info */}
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="font-semibold text-sm text-foreground line-clamp-2 group-hover:text-brand transition-colors leading-tight">
                {product.product_name}
              </h3>
              <p className="text-xs font-mono text-muted-foreground mt-1 tracking-wider">
                {product.product_code}
              </p>
            </div>

            {/* Category */}
            <div className="text-xs text-muted-foreground bg-muted px-2.5 py-1.5 rounded-lg w-fit border border-border">
              {product.product_categories?.category_name || 'Không phân loại'}
            </div>

            {/* Stock info */}
            <div className="flex items-center gap-2 text-xs">
              <Package className="w-3.5 h-3.5 text-muted-foreground" />
              <span className={`font-semibold ${
                isOutOfStock 
                  ? 'text-destructive' 
                  : isLowStock 
                    ? 'text-amber-600 dark:text-amber-400' 
                    : 'text-brand'
              }`}>
                {isOutOfStock ? 'Hết hàng' : `Còn ${product.current_stock}`}
              </span>
            </div>

            {/* Price */}
            <div className="text-right">
              <p className="text-xl font-bold text-foreground">
                {product.sale_price.toLocaleString('vi-VN')}đ
              </p>
            </div>
          </div>

          {/* Add to cart button */}
          <Button
            onClick={(e) => {
              e.stopPropagation()
              onAddToCart(product)
            }}
            disabled={isOutOfStock}
            className="supabase-button mt-4 w-full"
            size="sm"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            {isOutOfStock ? 'Hết hàng' : 'Thêm vào giỏ'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
