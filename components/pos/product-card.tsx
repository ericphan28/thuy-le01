import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Package, FileText, ShoppingCart } from 'lucide-react'
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
      whileTap={{ scale: 0.95 }}
      className="h-full"
    >
      <Card className="supabase-product-card h-full cursor-pointer">
        <CardContent className="p-2 sm:p-3 h-full flex flex-col">
          {/* Header với badge kê đơn - bỏ stock indicator */}
          <div className="flex items-start justify-start mb-2">
            {/* Chỉ giữ badge kê đơn vì quan trọng cho POS */}
            {product.requires_prescription && (
              <Badge 
                variant="destructive" 
                className="w-fit text-[10px] sm:text-xs font-medium px-1 sm:px-1.5 py-0.5"
              >
                <FileText className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                <span className="hidden sm:inline">Đơn thuốc</span>
                <span className="sm:hidden">Kê đơn</span>
              </Badge>
            )}
          </div>

          {/* Product info - compact với tên đầy đủ trên mobile */}
          <div className="flex-1 space-y-1.5 sm:space-y-2">
            <div className="min-h-[2.5rem] sm:min-h-[2rem]">
              <h3 className="font-semibold text-xs sm:text-sm text-foreground line-clamp-3 sm:line-clamp-2 group-hover:text-brand transition-colors leading-tight">
                {product.product_name}
              </h3>
              <p className="text-[10px] sm:text-xs font-mono text-muted-foreground mt-1 tracking-wider">
                {product.product_code}
              </p>
            </div>

            {/* Stock info - more compact */}
            <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
              <Package className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-muted-foreground" />
              <span className={`font-semibold ${
                isOutOfStock 
                  ? 'text-destructive' 
                  : isLowStock 
                    ? 'text-amber-600 dark:text-amber-400' 
                    : 'text-brand'
              }`}>
                {isOutOfStock ? 'Hết hàng' : `Còn ${Math.floor(product.current_stock)}`}
              </span>
            </div>

            {/* Price */}
            <div className="text-right">
              <p className="text-sm sm:text-lg lg:text-xl font-bold text-foreground">
                {product.sale_price.toLocaleString('vi-VN')}đ
              </p>
            </div>
          </div>

          {/* Add to cart button - responsive */}
          <Button
            onClick={(e) => {
              e.stopPropagation()
              onAddToCart(product)
            }}
            disabled={isOutOfStock}
            className="supabase-button mt-2 sm:mt-3 w-full h-7 sm:h-8 lg:h-9 text-xs sm:text-sm"
            size="sm"
          >
            <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
            {/* Mobile: chỉ icon hoặc text rất ngắn */}
            <span className="ml-1 sm:ml-2">
              {isOutOfStock ? 'Hết' : 'Thêm'}
            </span>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
