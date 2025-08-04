"use client"

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { 
  Search, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { ProductCard } from '@/components/pos/product-card'
import { CustomerSelector } from '@/components/pos/customer-selector-ultra'
import { CartSummary } from '@/components/pos/cart-summary'
import { CheckoutPanel } from '@/components/pos/checkout-panel'
import type { Product, Customer, CartItem } from '@/lib/types/pos'

const ITEMS_PER_PAGE = 20

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
  
  // Optimistic stock management
  const [optimisticStockUpdates, setOptimisticStockUpdates] = useState<Record<number, number>>({})

  const supabase = createClient()

  // Helper function to get current stock with optimistic updates
  const getCurrentStock = (product: Product): number => {
    const optimisticChange = optimisticStockUpdates[product.product_id] || 0
    return Math.max(0, product.current_stock + optimisticChange)
  }

  // Helper function to update optimistic stock
  const updateOptimisticStock = (productId: number, change: number) => {
    setOptimisticStockUpdates(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) + change
    }))
  }

  // Helper function to clear optimistic updates (after successful DB update)
  const clearOptimisticUpdates = () => {
    setOptimisticStockUpdates({})
  }

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

    // Get current stock with optimistic updates
    const currentStock = getCurrentStock(product)
    const existingItem = cart.find(item => item.product.product_id === product.product_id)
    const currentCartQuantity = existingItem?.quantity || 0
    
    // Check if we can add one more item
    if (currentCartQuantity >= currentStock) {
      toast.error(`Không đủ hàng trong kho. Còn lại: ${currentStock}`)
      return
    }
    
    if (existingItem) {
      updateQuantity(product.product_id, existingItem.quantity + 1)
    } else {
      const newItem: CartItem = {
        product,
        quantity: 1,
        unit_price: product.sale_price,
        line_total: product.sale_price
      }
      setCart([...cart, newItem])
      
      // Optimistic update: decrease stock by 1
      updateOptimisticStock(product.product_id, -1)
    }

    toast.success(`Đã thêm ${product.product_name} vào giỏ hàng`)
  }

  const removeFromCart = (productId: number) => {
    const removedItem = cart.find(item => item.product.product_id === productId)
    if (removedItem) {
      // Optimistic update: increase stock back
      updateOptimisticStock(productId, removedItem.quantity)
    }
    
    setCart(cart.filter(item => item.product.product_id !== productId))
    toast.success('Đã xóa sản phẩm khỏi giỏ hàng')
  }

  const updateQuantity = (productId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId)
      return
    }

    const cartItem = cart.find(item => item.product.product_id === productId)
    if (!cartItem) return

    const product = cartItem.product
    const currentStock = getCurrentStock(product)
    const oldQuantity = cartItem.quantity
    const quantityDiff = newQuantity - oldQuantity

    // Check if we have enough stock for the new quantity
    if (newQuantity > currentStock + oldQuantity) {
      toast.error(`Không đủ hàng trong kho. Còn lại: ${currentStock + oldQuantity}`)
      return
    }

    // Optimistic update: adjust stock based on quantity change
    updateOptimisticStock(productId, -quantityDiff)

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
      
      // Clear optimistic updates and refresh products
      clearOptimisticUpdates()
      
      toast.success(`Hóa đơn ${invoiceCode} đã được tạo thành công!`)
      
      // Refresh products để cập nhật stock từ database
      fetchProducts()
      
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('Lỗi khi tạo hóa đơn')
      
      // Don't clear optimistic updates on error - let user retry
      // The optimistic updates will be cleared on successful checkout or page refresh
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="supabase-container">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 pt-3">
          {/* Products Section - Left Side */}
          <div className="xl:col-span-3 space-y-3">
            {/* Ultra Compact Customer Selection */}
            <CustomerSelector
              customers={customers}
              selectedCustomer={selectedCustomer}
              searchTerm={customerSearch}
              onSearchChange={setCustomerSearch}
              onSelectCustomer={setSelectedCustomer}
              onClearCustomer={() => setSelectedCustomer(null)}
            />

            {/* Product Search and Grid */}
            <Card className="supabase-card">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <div className="p-1.5 bg-brand rounded-lg shadow-sm">
                      <Search className="h-4 w-4 text-brand-foreground" />
                    </div>
                    Sản Phẩm
                    <Badge variant="secondary" className="bg-brand/10 text-brand border-brand/20 ml-2">
                      {totalCount}
                    </Badge>
                  </CardTitle>
                  
                  {/* Integrated Search Input */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      placeholder="Tìm sản phẩm theo tên hoặc mã..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value)
                        setCurrentPage(1)
                      }}
                      className="supabase-input pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-4">
                {loading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="bg-muted h-32 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                      {products.map((product) => {
                        // Create product with optimistic stock
                        const productWithOptimisticStock = {
                          ...product,
                          current_stock: getCurrentStock(product)
                        }
                        
                        return (
                          <ProductCard
                            key={product.product_id}
                            product={productWithOptimisticStock}
                            onAddToCart={addToCart}
                          />
                        )
                      })}
                    </div>

                    {/* Pagination - compact but Supabase colors */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                        <div className="text-sm text-muted-foreground">
                          {currentPage}/{totalPages} - {totalCount} sản phẩm
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="h-8 w-8 p-0 supabase-button-secondary"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <div className="px-3 py-1 text-sm bg-brand text-brand-foreground rounded font-medium min-w-[32px] text-center">
                            {currentPage}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="h-8 w-8 p-0 supabase-button-secondary"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!loading && products.length === 0 && (
                  <div className="text-center py-12">
                    <div className="p-4 bg-muted rounded-2xl w-fit mx-auto mb-4">
                      <Search className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Không tìm thấy sản phẩm</h3>
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
