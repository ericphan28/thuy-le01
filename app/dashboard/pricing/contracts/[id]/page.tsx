import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import Link from 'next/link'

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params
  const contractId = Number(id)

  const { data: contract, error } = await supabase
    .from('contract_prices')
    .select('*')
    .eq('contract_id', contractId)
    .maybeSingle()

  if (error || !contract) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Chi tiết hợp đồng giá</h1>
        <div className="mt-4 text-destructive">Không tìm thấy hợp đồng.</div>
        <Link href="/dashboard/pricing/contracts" className="mt-3 inline-block text-primary hover:underline">
          ← Quay lại danh sách
        </Link>
      </div>
    )
  }

  // Fetch customer and product data separately
  const [{ data: customerData }, { data: productData }] = await Promise.all([
    supabase.from('customers').select('customer_id, customer_name, customer_code, phone, email').eq('customer_id', contract.customer_id).maybeSingle(),
    supabase.from('products').select('product_id, product_code, product_name, sale_price, base_price, cost_price').eq('product_id', contract.product_id).maybeSingle()
  ])

  const customer = customerData
  const product = productData
  const listPrice = product?.sale_price || product?.base_price || 0
  const contractPrice = Number(contract.net_price)
  const savings = listPrice > contractPrice ? listPrice - contractPrice : 0
  const discountPercent = listPrice > 0 ? ((savings / listPrice) * 100) : 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Hợp đồng giá #{contractId}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chi tiết hợp đồng giá riêng cho khách hàng và sản phẩm
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/pricing/contracts/${contractId}/edit`} className="px-3 py-1.5 rounded border hover:bg-accent">
            Chỉnh sửa
          </Link>
          <Link href="/dashboard/pricing/contracts" className="px-3 py-1.5 rounded border hover:bg-accent">
            ← Quay lại
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contract Info */}
        <div className="space-y-6">
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">Thông tin hợp đồng</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Trạng thái:</span>
                <div>
                  {contract.is_active ? (
                    <Badge>Đang hoạt động</Badge>
                  ) : (
                    <Badge variant="outline">Tạm dừng</Badge>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hiệu lực từ:</span>
                <span>{contract.effective_from ? new Date(contract.effective_from).toLocaleDateString('vi-VN') : 'Không giới hạn'}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hiệu lực đến:</span>
                <span>{contract.effective_to ? new Date(contract.effective_to).toLocaleDateString('vi-VN') : 'Không giới hạn'}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ngày tạo:</span>
                <span>{new Date(contract.created_at).toLocaleDateString('vi-VN')}</span>
              </div>
            </div>
            
            {contract.notes && (
              <div className="mt-4 p-3 bg-muted/30 rounded">
                <div className="text-sm font-medium mb-1">Ghi chú</div>
                <div className="text-sm text-muted-foreground">{contract.notes}</div>
              </div>
            )}
          </div>

          {/* Customer Info */}
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">Thông tin khách hàng</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tên:</span>
                <span className="font-medium">{customer?.customer_name || 'N/A'}</span>
              </div>
              
              {customer?.customer_code && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Mã KH:</span>
                  <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{customer.customer_code}</span>
                </div>
              )}
              
              {customer?.phone && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Điện thoại:</span>
                  <span>{customer.phone}</span>
                </div>
              )}
              
              {customer?.email && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span>{customer.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product & Pricing Info */}
        <div className="space-y-6">
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">Thông tin sản phẩm & Giá</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tên sản phẩm:</span>
                  <span className="font-medium text-right">{product?.product_name || 'N/A'}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Mã sản phẩm:</span>
                  <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{product?.product_code || 'N/A'}</span>
                </div>
              </div>
              
              {/* Price comparison cards - mobile optimized */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                <div className="p-2 bg-blue-50 border border-blue-200 rounded text-center">
                  <div className="text-xs font-medium text-blue-700">GIÁ NIÊM YẾT</div>
                  <div className="font-semibold text-blue-600">
                    {listPrice.toLocaleString('vi-VN')}₫
                  </div>
                </div>
                
                <div className="p-2 bg-orange-50 border border-orange-200 rounded text-center">
                  <div className="text-xs font-medium text-orange-700">GIÁ GỐC</div>
                  <div className="font-semibold text-orange-600">
                    {Number(product?.cost_price || 0).toLocaleString('vi-VN')}₫
                  </div>
                </div>
                
                <div className="p-2 bg-gray-50 border border-gray-200 rounded text-center">
                  <div className="text-xs font-medium text-gray-700">GIÁ CƠ SỞ</div>
                  <div className="font-semibold text-gray-600">
                    {Number(product?.base_price || 0).toLocaleString('vi-VN')}₫
                  </div>
                </div>
              </div>
              
              {product?.cost_price && listPrice > 0 && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-center">
                  <div className="text-xs font-medium text-green-700">LN NIÊM YẾT</div>
                  <div className="text-green-600 font-semibold">
                    {(((listPrice - product.cost_price) / listPrice) * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-green-50 border-green-200">
            <h3 className="font-medium mb-3 text-green-800">Giá hợp đồng & Lợi nhuận</h3>
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {contractPrice.toLocaleString('vi-VN')}₫
                </div>
                <div className="text-sm text-muted-foreground">Giá áp dụng cho khách hàng</div>
              </div>
              
              {product?.cost_price && product.cost_price > 0 && (
                <div className="text-center border-t border-green-200 pt-3">
                  <div className="text-lg font-bold text-green-700">
                    LN: {(((contractPrice - product.cost_price) / contractPrice) * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-green-600">
                    Lãi: {(contractPrice - product.cost_price).toLocaleString('vi-VN')}₫/SP
                  </div>
                </div>
              )}
              
              {savings > 0 && (
                <div className="text-center border-t border-green-200 pt-3">
                  <div className="text-lg font-medium text-green-700">
                    Tiết kiệm: {savings.toLocaleString('vi-VN')}₫
                  </div>
                  <div className="text-sm text-green-600">
                    Giảm {discountPercent.toFixed(1)}% so với giá niêm yết
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">Thao tác nhanh</h3>
            <div className="space-y-2">
              <Link 
                href={`/dashboard/pricing/preview?customer_id=${customer?.customer_id}&sku=${product?.product_code}&qty=1`}
                className="block w-full px-3 py-2 text-sm border rounded hover:bg-accent text-center"
              >
                Mô phỏng giá bán
              </Link>
              
              <Link 
                href={`/dashboard/customers/${customer?.customer_id}`}
                className="block w-full px-3 py-2 text-sm border rounded hover:bg-accent text-center"
              >
                Xem thông tin khách hàng
              </Link>
              
              <Link 
                href={`/dashboard/products/catalog?q=${product?.product_code}`}
                className="block w-full px-3 py-2 text-sm border rounded hover:bg-accent text-center"
              >
                Xem thông tin sản phẩm
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
