"use client"

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { 
  Search, 
  ShoppingCart, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { ProductCard } from '@/components/pos/product-card'
import { CustomerSelector } from '@/components/pos/customer-selector'
import { CartSummary } from '@/components/pos/cart-summary'
import { CheckoutPanel } from '@/components/pos/checkout-panel'
import type { Product, Customer, CartItem } from '@/lib/types/pos'

const ITEMS_PER_PAGE = 16

export default function POSPage() {
  // State management
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const supabase = createClient()

  // Fetch products với pagination và search
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      
      let query = supabase
        .from('products')
        .select(`
          product_id,
          product_code,
          product_name,
          sale_price,
          current_stock,
          requires_prescription,
          is_medicine,
          category_id,
          product_categories!fk_products_category_id (
            category_id,
            category_name
          )
        `)
        .eq('is_active', true)
        .eq('allow_sale', true)
        .gt('current_stock', 0) // Chỉ hiển thị sản phẩm còn hàng
        .order('product_name')

      // Search functionality
      if (searchTerm) {
        query = query.or(`product_name.ilike.%${searchTerm}%,product_code.ilike.%${searchTerm}%`)
      }

      // Count total for pagination
      const { count } = await supabase
        .from('products')
        .select('product_id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('allow_sale', true)
        .gt('current_stock', 0)

      if (count) {
        setTotalCount(count)
        setTotalPages(Math.ceil(count / ITEMS_PER_PAGE))
      }

      // Apply pagination
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
      query = query.range(startIndex, startIndex + ITEMS_PER_PAGE - 1)

      const { data, error } = await query

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
      toast.error('Lỗi khi tải danh sách sản phẩm')
    } finally {
      setLoading(false)
    }
  }, [searchTerm, currentPage, supabase])

  // Fetch customers cho search
  const fetchCustomers = useCallback(async () => {
    if (!customerSearch) {
      setCustomers([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('customer_id, customer_code, customer_name, phone, current_debt, debt_limit')
        .eq('is_active', true)
        .or(`customer_name.ilike.%${customerSearch}%,customer_code.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`)
        .limit(10)

      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }, [customerSearch, supabase])

  // Effects
  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchCustomers()
    }, 300)
    return () => clearTimeout(debounce)
  }, [fetchCustomers])

  // Cart functions
  const addToCart = (product: Product) => {
    // Kiểm tra prescription requirement
    if (product.requires_prescription && !selectedCustomer) {
      toast.error('Sản phẩm này cần đơn thuốc. Vui lòng chọn khách hàng trước.')
      return
    }

    const existingItem = cart.find(item => item.product.product_id === product.product_id)
    
    if (existingItem) {
      // Kiểm tra stock
      if (existingItem.quantity >= product.current_stock) {
        toast.error(`Không đủ hàng trong kho. Còn lại: ${product.current_stock}`)
        return
      }
      
      updateQuantity(product.product_id, existingItem.quantity + 1)
    } else {
      const newItem: CartItem = {
        product,
        quantity: 1,
        unit_price: product.sale_price,
        line_total: product.sale_price
      }
      setCart([...cart, newItem])
    }

    toast.success(`Đã thêm ${product.product_name} vào giỏ hàng`)
  }

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.product.product_id !== productId))
    toast.success('Đã xóa sản phẩm khỏi giỏ hàng')
  }

  const updateQuantity = (productId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId)
      return
    }

    const product = cart.find(item => item.product.product_id === productId)?.product
    if (product && newQuantity > product.current_stock) {
      toast.error(`Không đủ hàng trong kho. Còn lại: ${product.current_stock}`)
      return
    }

    setCart(cart.map(item =>
      item.product.product_id === productId
        ? {
            ...item,
            quantity: newQuantity,
            line_total: newQuantity * item.unit_price
          }
        : item
    ))
  }

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0)
  const tax = subtotal * 0.1 // 10% VAT
  const total = subtotal + tax

  // Checkout process
  const handleCheckout = async (paymentData: { method: 'cash' | 'card' | 'transfer', receivedAmount?: number }) => {
    if (cart.length === 0 || !selectedCustomer) return

    try {
      setCheckoutLoading(true)
      
      // Tạo invoice code
      const invoiceCode = `HD${Date.now()}`
      
      // Tạo invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          invoice_code: invoiceCode,
          invoice_date: new Date().toISOString(),
          customer_id: selectedCustomer.customer_id,
          customer_name: selectedCustomer.customer_name,
          total_amount: total,
          customer_paid: paymentData.receivedAmount || total,
          status: 'completed',
          notes: `Thanh toán bằng ${paymentData.method === 'cash' ? 'tiền mặt' : paymentData.method === 'card' ? 'thẻ' : 'chuyển khoản'}`
        })
        .select()
        .single()

      if (invoiceError) throw invoiceError

      // Tạo invoice details
      const invoiceDetails = cart.map(item => ({
        invoice_id: invoice.invoice_id,
        product_id: item.product.product_id,
        invoice_code: invoiceCode,
        product_code: item.product.product_code,
        product_name: item.product.product_name,
        customer_name: selectedCustomer.customer_name,
        invoice_date: new Date().toISOString(),
        quantity: item.quantity,
        unit_price: item.unit_price,
        sale_price: item.unit_price,
        line_total: item.line_total,
        subtotal: item.line_total,
        cash_payment: paymentData.method === 'cash' ? item.line_total : 0,
        card_payment: paymentData.method === 'card' ? item.line_total : 0,
        transfer_payment: paymentData.method === 'transfer' ? item.line_total : 0
      }))

      const { error: detailsError } = await supabase
        .from('invoice_details')
        .insert(invoiceDetails)

      if (detailsError) throw detailsError

      // Update stock
      for (const item of cart) {
        await supabase
          .from('products')
          .update({
            current_stock: item.product.current_stock - item.quantity
          })
          .eq('product_id', item.product.product_id)
      }

      // Reset form
      setCart([])
      setSelectedCustomer(null)
      setCustomerSearch('')
      setShowCheckout(false)
      
      toast.success(`Hóa đơn ${invoiceCode} đã được tạo thành công!`)
      
      // Refresh products để cập nhật stock
      fetchProducts()
      
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('Lỗi khi tạo hóa đơn')
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="supabase-container">
        <div className="supabase-page-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand rounded-xl shadow-lg">
                <ShoppingCart className="h-8 w-8 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Point of Sale</h1>
                <p className="text-muted-foreground">Thú Y Xuân Thùy - Hệ thống bán hàng chuyên nghiệp</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Products Section - Left Side */}
          <div className="xl:col-span-3 space-y-4">
            {/* Customer Selection */}
            <CustomerSelector
              customers={customers}
              selectedCustomer={selectedCustomer}
              searchTerm={customerSearch}
              onSearchChange={setCustomerSearch}
              onSelectCustomer={setSelectedCustomer}
              onClearCustomer={() => setSelectedCustomer(null)}
            />

            {/* Product Search */}
            <Card className="supabase-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-lg text-foreground">
                    <div className="p-1.5 bg-brand rounded-lg shadow-sm">
                      <Search className="h-4 w-4 text-white" />
                    </div>
                    Tìm Sản Phẩm
                  </span>
                  <Badge variant="secondary" className="bg-brand/10 text-brand border-brand/20">
                    {totalCount} sản phẩm
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/60" />
                  <input
                    placeholder="Tìm sản phẩm theo tên hoặc mã..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setCurrentPage(1) // Reset to first page when searching
                    }}
                    className="supabase-input pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Products Grid */}
            <Card className="supabase-card">
              <CardContent className="p-6">
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="bg-muted h-48 rounded-xl"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                      {products.map((product) => (
                        <ProductCard
                          key={product.product_id}
                          product={product}
                          onAddToCart={addToCart}
                        />
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-border gap-4">
                        <div className="text-sm text-muted-foreground order-2 sm:order-1">
                          Trang {currentPage} / {totalPages} - {totalCount} sản phẩm
                        </div>
                        <div className="flex items-center gap-2 order-1 sm:order-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="supabase-button-secondary"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Trước</span>
                          </Button>
                          <div className="px-4 py-2 text-sm bg-brand text-primary-foreground rounded-lg font-medium shadow-lg">
                            {currentPage}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="supabase-button-secondary"
                          >
                            <span className="hidden sm:inline">Sau</span>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!loading && products.length === 0 && (
                  <div className="text-center py-16">
                    <div className="p-4 bg-muted rounded-2xl w-fit mx-auto mb-6">
                      <Search className="h-16 w-16 mx-auto text-muted-foreground opacity-50" />
                    </div>
                    <p className="text-xl font-medium text-foreground mb-2">Không tìm thấy sản phẩm</p>
                    <p className="text-sm text-muted-foreground">Thử tìm kiếm với từ khóa khác hoặc kiểm tra kho hàng</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Cart Section - Right Side */}
          <div className="space-y-4">
            {showCheckout && selectedCustomer ? (
              <CheckoutPanel
                customer={selectedCustomer}
                total={total}
                onCheckout={handleCheckout}
                onCancel={() => setShowCheckout(false)}
                loading={checkoutLoading}
              />
            ) : (
              <CartSummary
                cart={cart}
                onUpdateQuantity={updateQuantity}
                onRemoveItem={removeFromCart}
                onCheckout={() => setShowCheckout(true)}
                disabled={!selectedCustomer || cart.length === 0}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
