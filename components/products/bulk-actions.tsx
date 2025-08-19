'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Download,
  Upload,
  Trash2,
  MoreHorizontal,
  FileSpreadsheet,
  Copy,
  Archive
} from 'lucide-react'
import { toast } from 'sonner'
import { CatalogProduct } from './catalog-product-card'

interface BulkActionsProps {
  products: CatalogProduct[]
  selectedProducts: number[]
  onSelectionChange: (selected: number[]) => void
  onBulkDelete: (productIds: number[]) => Promise<void>
  onExport: () => void
  onImport: (file: File) => void
}

export function BulkActions({
  products,
  selectedProducts,
  onSelectionChange,
  onBulkDelete,
  onExport,
  onImport
}: BulkActionsProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const isAllSelected = products.length > 0 && selectedProducts.length === products.length
  const isPartialSelected = selectedProducts.length > 0 && selectedProducts.length < products.length

  const handleSelectAll = () => {
    if (isAllSelected) {
      onSelectionChange([])
    } else {
      onSelectionChange(products.map(p => p.product_id))
    }
  }

  const handleBulkDelete = async () => {
    try {
      setIsDeleting(true)
      await onBulkDelete(selectedProducts)
      setShowDeleteDialog(false)
      onSelectionChange([])
      toast.success(`Đã xóa ${selectedProducts.length} sản phẩm`)
    } catch (error) {
      console.error('Bulk delete error:', error)
      toast.error('Lỗi khi xóa sản phẩm')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onImport(file)
    }
  }

  const selectedProductsData = products.filter(p => selectedProducts.includes(p.product_id))
  const totalValue = selectedProductsData.reduce((sum, p) => sum + (p.sale_price * p.stock_quantity), 0)

  if (selectedProducts.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Checkbox
                checked={isAllSelected}
                onCheckedChange={handleSelectAll}
                className="data-[state=indeterminate]:bg-primary"
                {...(isPartialSelected && { 'data-state': 'indeterminate' })}
              />
              <span className="text-sm text-muted-foreground">
                Chọn sản phẩm để thực hiện tác vụ hàng loạt
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-4 w-4 mr-2" />
                Xuất Excel
              </Button>
              
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Nhập Excel
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Checkbox
              checked={isAllSelected}
              onCheckedChange={handleSelectAll}
              className="data-[state=indeterminate]:bg-primary"
              {...(isPartialSelected && { 'data-state': 'indeterminate' })}
            />
            <div>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary">
                  {selectedProducts.length} sản phẩm được chọn
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Tổng giá trị: {totalValue.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={onExport}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Xuất đã chọn
            </Button>

            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Xóa ({selectedProducts.length})
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Xác nhận xóa sản phẩm</DialogTitle>
                  <DialogDescription>
                    Bạn có chắc chắn muốn xóa {selectedProducts.length} sản phẩm đã chọn?
                    <br />
                    <br />
                    <strong>Các sản phẩm sẽ bị xóa:</strong>
                    <ul className="mt-2 text-sm list-disc list-inside max-h-32 overflow-y-auto">
                      {selectedProductsData.map(product => (
                        <li key={product.product_id}>
                          {product.product_name} ({product.product_code})
                        </li>
                      ))}
                    </ul>
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowDeleteDialog(false)}
                    disabled={isDeleting}
                  >
                    Hủy
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => toast.info('Chức năng đang phát triển')}>
                  <Copy className="h-4 w-4 mr-2" />
                  Sao chép sản phẩm
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Chức năng đang phát triển')}>
                  <Archive className="h-4 w-4 mr-2" />
                  Lưu trữ
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onSelectionChange([])}
                  className="text-muted-foreground"
                >
                  Bỏ chọn tất cả
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
