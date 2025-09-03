"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { EnhancedCartSummary } from '@/components/pos/enhanced-cart-summary'
import type { Product, Customer } from '@/lib/types/pos'

export default function EnhancedPOSDemo() {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([])
  const [vatRate, setVatRate] = useState(10)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  // Fetch demo data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch some products for testing
        const { data: productsData } = await supabase
          .from('products')
          .select('product_id, product_code, product_name, sale_price, current_stock, category_id')
          .eq('is_active', true)
          .eq('allow_sale', true)
          .gt('current_stock', 0)
          .limit(10)

        // Fetch some customers
        const { data: customersData } = await supabase
          .from('customers')
          .select('customer_id, customer_code, customer_name, current_debt, debt_limit')
          .limit(5)

        setProducts(productsData || [])
        setCustomers(customersData || [])
      } catch (error) {
        console.error('Error fetching data:', error)
        toast.error('Lỗi khi tải dữ liệu')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [supabase])

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.product_id === product.product_id)
      if (existing) {
        return prev.map(item =>
          item.product.product_id === product.product_id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      } else {
        return [...prev, { product, quantity: 1 }]
      }
    })
    toast.success(`Đã thêm ${product.product_name} vào giỏ hàng`)
  }

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }

    setCart(prev =>
      prev.map(item =>
        item.product.product_id === productId
          ? { ...item, quantity }
          : item
      )
    )
  }

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.product_id !== productId))
    toast.success('Đã xóa sản phẩm khỏi giỏ hàng')
  }

  const handleCheckout = () => {
    toast.success('Bắt đầu quy trình thanh toán...')
    // Here you would implement checkout logic
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Đang tải dữ liệu...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Enhanced POS Demo</h1>
        <p className="text-muted-foreground">
          Demo hệ thống POS với pricing engine và volume tiers integration
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Sản phẩm</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map(product => (
                  <Card key={product.product_id} className="p-4">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm line-clamp-2">
                        {product.product_name}
                      </h3>
                      <div className="text-lg font-bold text-brand">
                        {formatPrice(product.sale_price)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Còn lại: {product.current_stock}
                      </div>
                      <Button
                        onClick={() => addToCart(product)}
                        disabled={product.current_stock <= 0}
                        className="w-full"
                        size="sm"
                      >
                        Thêm vào giỏ
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Customer Selection */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Khách hàng</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                <Button
                  variant={selectedCustomer === null ? "default" : "outline"}
                  onClick={() => setSelectedCustomer(null)}
                  size="sm"
                >
                  Khách lẻ
                </Button>
                {customers.map(customer => (
                  <Button
                    key={customer.customer_id}
                    variant={selectedCustomer?.customer_id === customer.customer_id ? "default" : "outline"}
                    onClick={() => setSelectedCustomer(customer)}
                    size="sm"
                    className="text-left justify-start"
                  >
                    {customer.customer_name}
                  </Button>
                ))}
              </div>
              {selectedCustomer && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <div className="text-sm">
                    <div><strong>Khách hàng:</strong> {selectedCustomer.customer_name}</div>
                    <div><strong>Mã:</strong> {selectedCustomer.customer_code}</div>
                    <div><strong>Công nợ:</strong> {formatPrice(selectedCustomer.current_debt)}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Cart */}
        <div className="lg:col-span-1">
          <EnhancedCartSummary
            rawCartItems={cart}
            selectedCustomer={selectedCustomer}
            vatRate={vatRate}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeFromCart}
            onVatChange={setVatRate}
            onCheckout={handleCheckout}
            isFullHeight={true}
          />
        </div>
      </div>
    </div>
  )
}
