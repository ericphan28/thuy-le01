"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Package, ArrowRight } from 'lucide-react'

export default function ProductsPage() {
  const router = useRouter()

  useEffect(() => {
    // Automatically redirect to the new catalog page after 3 seconds
    const timer = setTimeout(() => {
      router.push('/dashboard/products/catalog')
    }, 3000)

    return () => clearTimeout(timer)
  }, [router])

  const goToCatalog = () => {
    router.push('/dashboard/products/catalog')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            <Package className="h-16 w-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Trang sản phẩm đã được nâng cấp
            </h1>
            <p className="text-gray-600">
              Chúng tôi đã tạo ra một trang danh mục sản phẩm hoàn toàn mới với nhiều tính năng mạnh mẽ hơn.
            </p>
          </div>

          <div className="space-y-4">
            <Button 
              onClick={goToCatalog}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Đi đến Danh mục Sản phẩm Mới
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            
            <div className="text-sm text-gray-500">
              Tự động chuyển hướng sau 3 giây...
            </div>
          </div>

          <div className="mt-6 text-xs text-gray-400 space-y-1">
            <div>✅ Tìm kiếm và lọc nâng cao</div>
            <div>✅ Hiển thị Grid/List linh hoạt</div>
            <div>✅ Thống kê kinh doanh real-time</div>
            <div>✅ Tích hợp đầy đủ với database</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
