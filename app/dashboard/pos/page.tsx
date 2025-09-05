"use client"

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { 
  Search, 
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { ProductCard } from '@/components/pos/product-card'
import { ProductSearch } from '@/components/pos/product-search'
import { CustomerSelector } from '@/components/pos/customer-selector-ultra'
import { CartSummaryOptimized } from '@/components/pos/cart-summary-optimized'
import { CheckoutPanelOptimized } from '@/components/pos/checkout-panel-optimized'
import { EnhancedCartSummary } from '@/components/pos/enhanced-cart-summary'
import { EnhancedPricingService, type EnhancedProduct, type EnhancedPricingResult } from '@/lib/services/enhanced-pricing-service-v3'
import type { Product, Customer, CartItem, POSMode, TempOrderData } from '@/lib/types/pos'

const ITEMS_PER_PAGE = 20

// Helper function để format ngày theo định dạng Việt Nam dd/MM/yyyy
const formatDateVN = (dateString: string) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric'
  })
}

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
  const [useEnhancedPricing, setUseEnhancedPricing] = useState(true) // BẬT LẠI
  
  // POS Mode state (NEW)
  const [posMode, setPosMode] = useState<POSMode>('normal')
  const [tempOrderData, setTempOrderData] = useState<TempOrderData>({
    expected_delivery_date: '',
    notes: ''
  })
  
  // VAT and Discount management
  const [vatRate, setVatRate] = useState(0) // Default 0%
  const [discountType, setDiscountType] = useState<'percentage' | 'amount'>('percentage')
  const [discountValue, setDiscountValue] = useState(0)
  
  // Advanced Search & Filter state
  const [categories, setCategories] = useState<{category_id: number, category_name: string}[]>([])
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'stock'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [quickFilters, setQuickFilters] = useState({
    medicine: false,
    prescription: false,
    lowStock: false
  })
  const [showOnlyInStock, setShowOnlyInStock] = useState(true) // Mặc định chỉ hiển thị sản phẩm còn hàng
  
  // Enhanced Pricing state
  const [enhancedPricingService] = useState(() => new EnhancedPricingService())
  const [cartPricingResults, setCartPricingResults] = useState<Map<number, EnhancedPricingResult>>(new Map())
  const [pricingLoading, setPricingLoading] = useState(false)
  
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

  // Function to update cart with enhanced pricing results
  const updateCartWithEnhancedPricing = useCallback(() => {
    if (cartPricingResults.size === 0) return
    
    setCart(currentCart => {
      let hasChanges = false
      const updatedCart = currentCart.map(item => {
        const pricingResult = cartPricingResults.get(item.product.product_id)
        if (pricingResult && pricingResult.final_price !== item.unit_price) {
          hasChanges = true
          // Update với enhanced pricing
          return {
            ...item,
            unit_price: pricingResult.final_price,
            line_total: item.quantity * pricingResult.final_price
          }
        }
        return item
      })
      
      // Chỉ cập nhật nếu thực sự có thay đổi
      return hasChanges ? updatedCart : currentCart
    })
  }, [cartPricingResults])

  // Fetch products với pagination, search và advanced filters
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      
      // Optimized query for POS - reduced fields and better indexing
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
          category_id
        `)
        .eq('is_active', true)
        .eq('allow_sale', true)

      // Stock filter - điều chỉnh theo toggle với tối ưu index
      if (showOnlyInStock) {
        query = query.gt('current_stock', 0) // Sử dụng idx_products_stock_check
      }

      // Search functionality - tối ưu cho composite index
      if (searchTerm) {
        query = query.or(`product_name.ilike.%${searchTerm}%,product_code.ilike.%${searchTerm}%`)
      }

      // Category filter
      if (selectedCategory) {
        query = query.eq('category_id', selectedCategory)
      }

      // Quick filters
      if (quickFilters.medicine) {
        query = query.eq('is_medicine', true)
      }
      if (quickFilters.prescription) {
        query = query.eq('requires_prescription', true)
      }
      if (quickFilters.lowStock) {
        query = query.lt('current_stock', 10) // Consider low stock < 10
      }

      // Sorting - sử dụng index tối ưu
      const sortField = sortBy === 'name' ? 'product_name' : 
                       sortBy === 'price' ? 'sale_price' : 'current_stock'
      query = query.order(sortField, { ascending: sortOrder === 'asc' })

      // Count total for pagination - tối ưu với same filters
      let countQuery = supabase
        .from('products')
        .select('product_id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('allow_sale', true)

      // Stock filter cho count query
      if (showOnlyInStock) {
        countQuery = countQuery.gt('current_stock', 0)
      }

      // Apply same filters to count query
      if (searchTerm) {
        countQuery = countQuery.or(`product_name.ilike.%${searchTerm}%,product_code.ilike.%${searchTerm}%`)
      }
      if (selectedCategory) {
        countQuery = countQuery.eq('category_id', selectedCategory)
      }
      if (quickFilters.medicine) {
        countQuery = countQuery.eq('is_medicine', true)
      }
      if (quickFilters.prescription) {
        countQuery = countQuery.eq('requires_prescription', true)
      }
      if (quickFilters.lowStock) {
        countQuery = countQuery.lt('current_stock', 10)
      }

      const { count } = await countQuery

      if (count) {
        setTotalCount(count)
        setTotalPages(Math.ceil(count / ITEMS_PER_PAGE))
      }

      // Apply pagination
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
      query = query.range(startIndex, startIndex + ITEMS_PER_PAGE - 1)

      const { data, error } = await query

      if (error) throw error
      
      // No need to transform data anymore since we're not fetching product_categories
      setProducts(data || [])
    } catch (error: any) {
      console.error('Error fetching products:', {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      })
  toast.error(`Không tải được danh sách sản phẩm: ${error?.message || 'lỗi không xác định'}`)
    } finally {
      setLoading(false)
    }
  }, [searchTerm, currentPage, selectedCategory, sortBy, sortOrder, quickFilters, showOnlyInStock, supabase])

  // Fetch categories for filter dropdown
  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('product_categories')
        .select('category_id, category_name')
        .eq('is_active', true)
        .order('category_name')

      if (error) throw error
      setCategories(data || [])
    } catch (error: any) {
      console.error('Error fetching categories:', {
        error,
        message: error?.message,
        details: error?.details
      })
    }
  }, [supabase])

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
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchCustomers()
    }, 300)
    return () => clearTimeout(debounce)
  }, [fetchCustomers])

  // Handler functions for advanced search
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1) // Reset to first page when searching
  }

  const handleCategoryChange = (categoryId: number | null) => {
    setSelectedCategory(categoryId)
    setCurrentPage(1)
  }

  const handleSortChange = (newSortBy: 'name' | 'price' | 'stock', order: 'asc' | 'desc') => {
    setSortBy(newSortBy)
    setSortOrder(order)
    setCurrentPage(1)
  }

  const handleQuickFilterChange = (filter: 'medicine' | 'prescription' | 'lowStock', value: boolean) => {
    setQuickFilters(prev => ({
      ...prev,
      [filter]: value
    }))
    setCurrentPage(1)
  }

  // Cart functions
  const addToCart = async (product: Product) => {
    // Kiểm tra nếu sản phẩm hết hàng
    const currentStock = getCurrentStock(product)
    if (currentStock <= 0) {
  toast.error('Sản phẩm đã hết hàng')
      return
    }

    // Get current stock with optimistic updates
    const existingItem = cart.find(item => item.product.product_id === product.product_id)
    const currentCartQuantity = existingItem?.quantity || 0
    
    // Check if we can add one more item
    if (currentCartQuantity >= currentStock) {
  toast.error(`Không đủ tồn kho. Còn lại: ${currentStock}`)
      return
    }
    
    // Tính enhanced pricing cho sản phẩm này NGAY LẬP TỨC
    let finalPrice = product.sale_price
    console.log('🔍 Enhanced pricing check:', {
      useEnhancedPricing,
      hasSelectedCustomer: !!selectedCustomer,
      customerId: selectedCustomer?.customer_id,
      productName: product.product_name,
      salePrice: product.sale_price
    })
    
    if (useEnhancedPricing && selectedCustomer) {
      try {
        const enhancedProduct = {
          product_id: product.product_id,
          product_code: product.product_code,
          product_name: product.product_name,
          sale_price: product.sale_price,
          current_stock: product.current_stock,
          category_id: product.category_id || 0
        }
        
        const pricingResult = await enhancedPricingService.calculateProductPrice(
          enhancedProduct,
          existingItem ? existingItem.quantity + 1 : 1,
          {
            include_volume_tiers: true,
            include_price_rules: true,
            tax_rate: vatRate,
            customer_id: selectedCustomer.customer_id?.toString()
          }
        )
        
        finalPrice = pricingResult.final_price
        
        // Cập nhật pricing results
        setCartPricingResults(prev => new Map(prev.set(product.product_id, pricingResult)))
        
        console.log('🎯 Enhanced pricing applied:', {
          product: product.product_name,
          originalPrice: product.sale_price,
          finalPrice: pricingResult.final_price,
          savings: pricingResult.final_savings,
          source: pricingResult.pricing_source
        })
      } catch (error) {
        console.error('Failed to calculate enhanced pricing:', error)
      }
    }
    
    if (existingItem) {
      // Update existing item với enhanced pricing
      const newQuantity = existingItem.quantity + 1
      setCart(cart.map(item =>
        item.product.product_id === product.product_id
          ? {
              ...item,
              quantity: newQuantity,
              unit_price: finalPrice,
              line_total: newQuantity * finalPrice
            }
          : item
      ))
      
      // Optimistic update: decrease stock by 1
      updateOptimisticStock(product.product_id, -1)
    } else {
      const newItem: CartItem = {
        product,
        quantity: 1,
        unit_price: finalPrice,
        line_total: finalPrice
      }
      setCart([...cart, newItem])
      
      // Optimistic update: decrease stock by 1
      updateOptimisticStock(product.product_id, -1)
    }

  toast.success(`Đã thêm ${product.product_name} (${finalPrice.toLocaleString('vi-VN')}đ) vào giỏ`)
  }

  const removeFromCart = (productId: number) => {
    const removedItem = cart.find(item => item.product.product_id === productId)
    if (removedItem) {
      // Optimistic update: increase stock back
      updateOptimisticStock(productId, removedItem.quantity)
    }
    
    setCart(cart.filter(item => item.product.product_id !== productId))
  toast.success('Đã xóa khỏi giỏ')
  }

  // Recalculate enhanced pricing for entire cart
  const recalculateCartPricing = async () => {
    if (!useEnhancedPricing || !selectedCustomer || cart.length === 0) return

    console.log('🔄 Recalculating entire cart pricing...')
    
    const updatedCart = await Promise.all(
      cart.map(async (item) => {
        try {
          const enhancedProduct = {
            product_id: item.product.product_id,
            product_code: item.product.product_code,
            product_name: item.product.product_name,
            sale_price: item.product.sale_price,
            current_stock: item.product.current_stock,
            category_id: item.product.category_id || 0
          }
          
          const pricingResult = await enhancedPricingService.calculateProductPrice(
            enhancedProduct,
            item.quantity,
            {
              include_volume_tiers: true,
              include_price_rules: true,
              tax_rate: vatRate,
              customer_id: selectedCustomer.customer_id?.toString()
            }
          )
          
          // Update pricing results
          setCartPricingResults(prev => new Map(prev.set(item.product.product_id, pricingResult)))
          
          return {
            ...item,
            unit_price: pricingResult.final_price,
            line_total: item.quantity * pricingResult.final_price
          }
        } catch (error) {
          console.error('Failed to recalculate pricing for product:', item.product.product_name, error)
          return item // Keep original if failed
        }
      })
    )

    setCart(updatedCart)
  }

  // Effect to recalculate pricing when customer changes
  useEffect(() => {
    recalculateCartPricing()
  }, [selectedCustomer?.customer_id, useEnhancedPricing])

  const updateQuantity = async (productId: number, newQuantity: number) => {
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
  toast.error(`Không đủ tồn kho. Còn lại: ${currentStock + oldQuantity}`)
      return
    }

    // Optimistic update: adjust stock based on quantity change
    updateOptimisticStock(productId, -quantityDiff)

    // Recalculate enhanced pricing with new quantity
    let finalPrice = product.sale_price
    if (useEnhancedPricing && selectedCustomer) {
      try {
        const enhancedProduct = {
          product_id: product.product_id,
          product_code: product.product_code,
          product_name: product.product_name,
          sale_price: product.sale_price,
          current_stock: product.current_stock,
          category_id: product.category_id || 0
        }
        
        const pricingResult = await enhancedPricingService.calculateProductPrice(
          enhancedProduct,
          newQuantity,
          {
            include_volume_tiers: true,
            include_price_rules: true,
            tax_rate: vatRate,
            customer_id: selectedCustomer.customer_id?.toString()
          }
        )
        
        finalPrice = pricingResult.final_price
        
        // Update pricing results
        setCartPricingResults(prev => new Map(prev.set(productId, pricingResult)))
        
        console.log('🔄 Enhanced pricing recalculated on quantity change:', {
          product: product.product_name,
          oldQuantity,
          newQuantity,
          finalPrice,
          savings: pricingResult.final_savings
        })
      } catch (error) {
        console.error('Failed to recalculate enhanced pricing:', error)
      }
    }

    setCart(cart.map(item =>
      item.product.product_id === productId
        ? {
            ...item,
            quantity: newQuantity,
            unit_price: finalPrice, // Use recalculated price
            line_total: newQuantity * finalPrice
          }
        : item
    ))
  }

  // Calculations with VAT and Discount
  const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0)
  
  // Calculate discount
  const discountAmount = discountType === 'percentage' 
    ? (subtotal * discountValue) / 100
    : Math.min(discountValue, subtotal) // Don't allow discount > subtotal
  
  const afterDiscount = subtotal - discountAmount
  const tax = afterDiscount * (vatRate / 100) // VAT based on selected rate
  const total = afterDiscount + tax

  // Convert cart to enhanced products for pricing
  const convertCartToEnhancedProducts = useCallback(() => {
    return cart.map(item => ({
      product_id: item.product.product_id,
      product_code: item.product.product_code || '',
      product_name: item.product.product_name,
      sale_price: item.product.sale_price,
      base_price: item.product.sale_price, // Use sale_price as base_price fallback
      current_stock: item.product.current_stock,
      category_id: item.product.category_id || 0
    } as EnhancedProduct))
  }, [cart])

  // Enhanced pricing calculation với request tracking
  const [lastPricingCacheKey, setLastPricingCacheKey] = useState<string>('')
  
  const calculateEnhancedPricing = useCallback(async () => {
    if (cart.length === 0) {
      setCartPricingResults(new Map())
      return
    }

    // Ngăn multiple calls đồng thời
    if (pricingLoading) return

    // Tạo cache key để tránh tính toán lại không cần thiết
    const cacheKey = JSON.stringify({
      cart: cart.map(item => ({ id: item.product.product_id, qty: item.quantity })),
      customer: selectedCustomer?.customer_id,
      vat: vatRate
    })
    
    // Nếu cache key giống lần trước, không tính lại
    if (lastPricingCacheKey === cacheKey) {
      return
    }
    
    setLastPricingCacheKey(cacheKey)

    setPricingLoading(true)
    console.log('🚀 Starting enhanced pricing calculation for', cart.length, 'items')
    
    try {
      const enhancedProducts = convertCartToEnhancedProducts()
      const newPricingResults = new Map<number, EnhancedPricingResult>()

      // Calculate pricing for each cart item
      for (const cartItem of cart) {
        const enhancedProduct = enhancedProducts.find(p => p.product_id === cartItem.product.product_id)
        if (enhancedProduct) {
          const result = await enhancedPricingService.calculateProductPrice(
            enhancedProduct,
            cartItem.quantity,
            {
              include_volume_tiers: true,
              include_price_rules: true,
              tax_rate: vatRate,
              customer_id: selectedCustomer?.customer_id?.toString()
            }
          )
          newPricingResults.set(cartItem.product.product_id, result)
        }
      }

      setCartPricingResults(newPricingResults)
    } catch (error) {
      console.error('Enhanced pricing calculation error:', error)
    } finally {
      setPricingLoading(false)
    }
  }, [enhancedPricingService, convertCartToEnhancedProducts, vatRate, selectedCustomer])

  // Calculate totals with enhanced pricing
  const calculateTotals = useCallback(() => {
    let enhancedSubtotal = 0
    let enhancedSavings = 0
    
    cart.forEach(item => {
      const pricingResult = cartPricingResults.get(item.product.product_id)
      if (pricingResult && useEnhancedPricing) {
        enhancedSubtotal += pricingResult.final_price * item.quantity
        enhancedSavings += pricingResult.final_savings * item.quantity
      } else {
        enhancedSubtotal += item.line_total
      }
    })

    // Traditional discount calculation if not using enhanced pricing
    const traditionalDiscountAmount = !useEnhancedPricing 
      ? (discountType === 'percentage' ? (enhancedSubtotal * discountValue) / 100 : Math.min(discountValue, enhancedSubtotal))
      : 0

    const finalSubtotalAfterDiscount = enhancedSubtotal - traditionalDiscountAmount
    const enhancedTax = finalSubtotalAfterDiscount * (vatRate / 100)
    const finalTotal = finalSubtotalAfterDiscount + enhancedTax

    return {
      subtotal: enhancedSubtotal,
      discountAmount: useEnhancedPricing ? enhancedSavings : traditionalDiscountAmount,
      tax: enhancedTax,
      total: finalTotal,
      savings: enhancedSavings
    }
  }, [cart, cartPricingResults, useEnhancedPricing, discountType, discountValue, vatRate])

  // Get calculated values
  const {
    subtotal: finalSubtotal,
    discountAmount: finalDiscountAmount,
    tax: enhancedTax,
    total: finalTotal,
    savings: totalSavings
  } = calculateTotals()

  // Create raw cart items for components that need it
  const rawCartItems = cart.map(item => ({
    product: item.product,
    quantity: item.quantity
  }))

  // Update enhanced pricing when cart changes với debounce - CHỈ TÍNH KHI THÊM/XÓA SẢN PHẨM
  useEffect(() => {
    if (useEnhancedPricing && cart.length > 0) {
      const debounceTimer = setTimeout(() => {
        calculateEnhancedPricing()
      }, 500) // Tăng debounce lên 500ms
      
      return () => clearTimeout(debounceTimer)
    } else if (cart.length === 0) {
      setCartPricingResults(new Map())
    }
  }, [cart.length, selectedCustomer?.customer_id, vatRate]) // BỎ useEnhancedPricing khỏi deps

  // TẮT auto-update cart pricing - CHỈ CẬP NHẬT KHI NGƯỜI DÙNG THAY ĐỔI
  // useEffect(() => {
  //   if (cartPricingResults.size > 0 && useEnhancedPricing) {
  //     updateCartWithEnhancedPricing()
  //   }
  // }, [cartPricingResults, useEnhancedPricing])

  // Checkout process - Using Enhanced Pricing + Supabase Function
  const handleCheckout = async (paymentData: { 
    method: 'cash' | 'card' | 'transfer'
    paymentType: 'full' | 'partial' | 'debt'
    receivedAmount?: number
    partialAmount?: number
  }) => {
    if (cart.length === 0 || !selectedCustomer) return

    // Validate temp order requirements
    if (posMode === 'temp_order') {
      console.log('🔍 Validating temp order:', {
        expectedDeliveryDate: tempOrderData.expected_delivery_date,
        notes: tempOrderData.notes,
        posMode,
        cart: cart.length
      })
      
      if (!tempOrderData.expected_delivery_date) {
  toast.error('Chọn ngày xuất dự kiến cho phiếu tạm')
        return
      }
      
      const deliveryDate = new Date(tempOrderData.expected_delivery_date)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      if (deliveryDate <= new Date()) {
  toast.error('Ngày xuất phải sau hôm nay')
        return
      }
      
      console.log('✅ Temp order validation passed')
    }

    const formatPrice = (price: number) => {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
      }).format(price)
    }

    console.log('🚀 === ENHANCED CHECKOUT PROCESS STARTED ===')
    console.log('📋 Cart Items:', cart)
    console.log('👤 Selected Customer:', selectedCustomer)
    console.log('💰 Payment Data:', paymentData)
    console.log('📊 Enhanced Pricing Results:', Object.fromEntries(cartPricingResults))
    console.log('📊 Pricing Summary:', {
      useEnhancedPricing,
      totalSavings,
      pricingLoading
    })
    console.log('📊 Traditional Calculation:', {
      subtotal,
      vatRate,
      discountType,
      discountValue,
      discountAmount,
      tax,
      total
    })
    console.log('💡 Final Values Used:', {
      finalSubtotal,
      finalDiscountAmount,
      finalTotal,
      enhancedTax
    })

    try {
      setCheckoutLoading(true)
      
      // Prepare cart items for function - Use Enhanced Pricing Results
      const cartItems = cart.map(item => {
        const pricingResult = cartPricingResults.get(item.product.product_id)
        const finalPrice = pricingResult?.final_price || item.unit_price
        
        console.log(`📊 Item ${item.product.product_code}: Original ${item.unit_price} → Enhanced ${finalPrice}`)
        
        return {
          product_id: item.product.product_id,
          quantity: item.quantity,
          unit_price: finalPrice // Use enhanced pricing result
        }
      })
      
      console.log('📦 Cart Items for Function:', cartItems)
      
      // Calculate payment amounts based on enhanced pricing
      let paidAmount = 0
      let debtAmount = 0
      
      switch (paymentData.paymentType) {
        case 'full':
          paidAmount = finalTotal
          debtAmount = 0
          break
        case 'partial':
          paidAmount = paymentData.partialAmount || 0
          debtAmount = finalTotal - paidAmount
          break
        case 'debt':
          paidAmount = 0
          debtAmount = finalTotal
          break
      }
      
      console.log('💰 Enhanced Payment Calculation:', {
        paymentType: paymentData.paymentType,
        enhancedTotal: finalTotal,
        traditionalTotal: total,
        savings: finalTotal - total,
        paidAmount,
        debtAmount
      })
      
      // Call Supabase function with temp invoice support
      const { data: functionResult, error: functionError } = await supabase
        .rpc('create_pos_invoice', {
          p_customer_id: selectedCustomer.customer_id,
          p_cart_items: cartItems,
          p_vat_rate: vatRate,
          p_discount_type: discountType,
          p_discount_value: discountValue,
          p_payment_method: paymentData.method,
          p_received_amount: paymentData.receivedAmount || null,
          p_paid_amount: posMode === 'temp_order' ? 0 : paidAmount, // No payment for temp orders
          p_debt_amount: posMode === 'temp_order' ? 0 : debtAmount, // No debt for temp orders
          p_payment_type: posMode === 'temp_order' ? 'temp_order' : paymentData.paymentType,
          p_branch_id: 1,
          p_created_by: 'POS System',
          // NEW PARAMETERS
          p_invoice_type: posMode,
          p_expected_delivery_date: posMode === 'temp_order' ? tempOrderData.expected_delivery_date : null,
          p_notes: posMode === 'temp_order' ? tempOrderData.notes || null : null
        })

      if (functionError) {
        console.error('❌ Function Call Error Details:', {
          message: functionError.message,
          details: functionError.details,
          hint: functionError.hint,
          code: functionError.code,
          fullError: functionError
        })
        throw new Error(`Database function error: ${functionError.message || JSON.stringify(functionError)}`)
      }
      
      console.log('📊 Function Result:', functionResult)
      console.log('📊 Function Result Type:', typeof functionResult)
      console.log('📊 Function Result Keys:', Object.keys(functionResult || {}))
      console.log('📊 Function Result JSON:', JSON.stringify(functionResult, null, 2))
      
      // Check if function was successful
      if (!functionResult || !functionResult.success) {
  const errorMessage = functionResult?.error || 'Lỗi không xác định'
        const errorCode = functionResult?.error_code || 'UNKNOWN_ERROR'
        
        console.error('❌ Function Returned Error:', {
          error: errorMessage,
          error_code: errorCode,
          error_details: functionResult?.error_details,
          full_result: functionResult
        })
        console.error('❌ Function Result Full JSON:', JSON.stringify(functionResult, null, 2))
        
        // Show specific error messages to user
        switch (errorCode) {
          case 'CUSTOMER_NOT_FOUND':
            toast.error('Khách hàng không tồn tại hoặc ngưng hoạt động')
            break
          case 'INSUFFICIENT_STOCK':
            toast.error('Không đủ tồn kho')
            break
          case 'INSUFFICIENT_PAYMENT':
            toast.error('Số tiền thanh toán chưa đủ')
            break
          case 'INVALID_VAT_RATE':
            toast.error('Thuế VAT không hợp lệ')
            break
          default:
            toast.error(errorMessage)
        }
        
        return // Exit without clearing cart
      }
      
      // Success! Process the result
      const invoiceCode = functionResult.invoice_code
      const totalAmount = functionResult.totals?.total_amount || finalTotal
      const changeAmount = functionResult.totals?.change_amount || 0
      
      console.log('✅ Invoice Created Successfully by Function!')
      console.log('� Invoice Code:', invoiceCode)
      console.log('💰 Total Amount:', formatPrice(totalAmount))
      if (changeAmount > 0) {
        console.log('� Change Amount:', formatPrice(changeAmount))
      }
      
      // Show detailed success message based on invoice type and payment
      let successMessage = ''
      
      if (posMode === 'temp_order') {
        const deliveryDate = formatDateVN(tempOrderData.expected_delivery_date)
        successMessage = `Phiếu tạm ${invoiceCode} đã được tạo thành công! Ngày xuất dự kiến: ${deliveryDate}`
      } else {
        successMessage = `Hóa đơn ${invoiceCode} đã được tạo thành công!`
        
        switch (paymentData.paymentType) {
          case 'full':
            if (changeAmount > 0) {
              successMessage += ` Tiền thừa: ${formatPrice(changeAmount)}`
            }
            break
          case 'partial':
            successMessage += ` Đã thanh toán: ${formatPrice(paidAmount)}, ghi nợ: ${formatPrice(debtAmount)}`
            break
          case 'debt':
            successMessage += ` Toàn bộ ${formatPrice(finalTotal)} đã được ghi vào công nợ`
            break
        }
      }
      
      // Show warnings if any
      if (functionResult.warnings && functionResult.warnings.length > 0) {
        functionResult.warnings.forEach((warning: string) => {
          toast.warning(warning)
        })
      }
      
  toast.success(successMessage)
      
      // Reset form
      console.log('🧹 Resetting Form State...')
      setCart([])
      setCartPricingResults(new Map()) // Clear enhanced pricing results
      setSelectedCustomer(null)
      setCustomerSearch('')
      setShowCheckout(false)
      setVatRate(0) // Reset VAT to 0%
      setDiscountValue(0) // Reset discount
      setDiscountType('percentage')
      
      // Reset temp order data
      setTempOrderData({
        expected_delivery_date: '',
        notes: ''
      })
      
      // Clear optimistic updates and refresh products
      clearOptimisticUpdates()
      
      console.log('🎉 Checkout Process Completed Successfully!')
      console.log('� Function Response Summary:', {
        invoice_id: functionResult.invoice_id,
        invoice_code: functionResult.invoice_code,
        customer_name: functionResult.customer_name,
        totals: functionResult.totals,
        summary: functionResult.summary,
        customer_info: functionResult.customer_info
      })
      
      // Refresh products để cập nhật stock từ database
      fetchProducts()
      
    } catch (error) {
      console.error('💥 CHECKOUT ERROR:', error)
      console.error('📊 Error Context:', {
        cart,
        selectedCustomer,
        paymentData,
        subtotal,
        vatRate,
        discountType,
        discountValue,
        discountAmount,
        tax,
        total
      })
  toast.error('Tạo hóa đơn thất bại, thử lại sau')
      
      // Don't clear optimistic updates on error - let user retry
      // The optimistic updates will be cleared on successful checkout or page refresh
    } finally {
      setCheckoutLoading(false)
      console.log('🏁 Checkout Process Finished (Success or Error)')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="supabase-container">
        {/* POS Mode Toggle - Show on all screens */}
        <div className="pt-3 pb-1">
          <Card className="supabase-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-foreground">Chế độ POS</h2>
                  <div className="flex rounded-lg border border-border p-1 bg-muted/30">
                    <Button
                      variant={posMode === 'normal' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setPosMode('normal')}
                      className={`h-8 px-3 ${posMode === 'normal' ? 'bg-brand text-brand-foreground shadow-sm' : 'hover:bg-muted'}`}
                    >
                      🛒 Bán Hàng Thường
                    </Button>
                    <Button
                      variant={posMode === 'temp_order' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setPosMode('temp_order')}
                      className={`h-8 px-3 ${posMode === 'temp_order' ? 'bg-amber-500 text-white shadow-sm' : 'hover:bg-muted'}`}
                    >
                      📝 Tạo Phiếu Tạm
                    </Button>
                  </div>
                </div>
                
                {posMode === 'temp_order' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      📝 Phiếu tạm
                      {tempOrderData.expected_delivery_date && 
                        ` • ${formatDateVN(tempOrderData.expected_delivery_date)}`
                      }
                    </Badge>
                  </div>
                )}
              </div>
              
              {/* Temp Order Settings - Desktop */}
              {posMode === 'temp_order' && (
                <div className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50/50 space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-amber-800 whitespace-nowrap">
                      Ngày xuất dự kiến:
                    </label>
                    <input
                      type="date"
                      value={tempOrderData.expected_delivery_date}
                      onChange={(e) => setTempOrderData(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                      min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                      className="flex-1 px-3 py-1.5 text-sm border border-amber-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                      required
                    />
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <label className="text-sm font-medium text-amber-800 whitespace-nowrap mt-1">
                      Ghi chú:
                    </label>
                    <textarea
                      value={tempOrderData.notes}
                      onChange={(e) => setTempOrderData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Ghi chú cho phiếu tạm (tùy chọn)..."
                      className="flex-1 px-3 py-1.5 text-sm border border-amber-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Mobile: Stack vertically, Desktop: Side by side */}
        <div className="flex flex-col xl:grid xl:grid-cols-4 gap-3 pt-3">
          {/* Products Section - Left Side */}
          <div className="xl:col-span-3 space-y-3 order-2 xl:order-1">
            {/* Ultra Compact Customer Selection */}
            <CustomerSelector
              customers={customers}
              selectedCustomer={selectedCustomer}
              searchTerm={customerSearch}
              onSearchChange={setCustomerSearch}
              onSelectCustomer={setSelectedCustomer}
              onClearCustomer={() => setSelectedCustomer(null)}
            />

            {/* Customer Info Card - Show important details */}
            {selectedCustomer && (
              <Card className="supabase-card border-blue-200 bg-blue-50/30">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-blue-900">{selectedCustomer.customer_name}</h4>
                      <p className="text-sm text-blue-700">
                        📞 {selectedCustomer.phone || 'Chưa có SĐT'} • 
                        🆔 {selectedCustomer.customer_code || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-blue-900">
                        💰 Công nợ hiện tại
                      </div>
                      <div className={`text-lg font-bold ${
                        selectedCustomer.current_debt > 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {new Intl.NumberFormat('vi-VN', {
                          style: 'currency',
                          currency: 'VND'
                        }).format(selectedCustomer.current_debt)}
                      </div>
                      {selectedCustomer.debt_limit > 0 && (
                        <div className="text-xs text-blue-600">
                          Hạn mức: {new Intl.NumberFormat('vi-VN', {
                            style: 'currency',
                            currency: 'VND'
                          }).format(selectedCustomer.debt_limit)}
                        </div>
                      )}
                      
                      {/* Debt Warning */}
                      {selectedCustomer.current_debt > selectedCustomer.debt_limit * 0.8 && selectedCustomer.debt_limit > 0 && (
                        <div className="text-xs text-orange-600 font-medium mt-1">
                          ⚠️ Gần đạt hạn mức
                        </div>
                      )}
                      
                      {selectedCustomer.current_debt >= selectedCustomer.debt_limit && selectedCustomer.debt_limit > 0 && (
                        <div className="text-xs text-red-600 font-bold mt-1">
                          🚫 Vượt hạn mức
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* (Đã gỡ hiển thị Enhanced Pricing theo yêu cầu) */}
                </CardContent>
              </Card>
            )}

            {/* Product Search and Grid */}
            <Card className="supabase-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <div className="p-1.5 bg-brand rounded-lg shadow-sm">
                    <Search className="h-4 w-4 text-brand-foreground" />
                  </div>
                  Sản Phẩm
                  <Badge variant="secondary" className="bg-brand/10 text-brand border-brand/20 ml-2">
                    {totalCount}
                  </Badge>
                </CardTitle>
              </CardHeader>
              
              <CardContent className="p-4 space-y-4">
                {/* Advanced Product Search */}
                <ProductSearch
                  searchTerm={searchTerm}
                  onSearchChange={handleSearchChange}
                  categories={categories}
                  selectedCategory={selectedCategory}
                  onCategoryChange={handleCategoryChange}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSortChange={handleSortChange}
                  quickFilters={quickFilters}
                  onQuickFilterChange={handleQuickFilterChange}
                  totalCount={totalCount}
                  isLoading={loading}
                  showOnlyInStock={showOnlyInStock}
                  onShowOnlyInStockChange={setShowOnlyInStock}
                />
                
                {/* Product Grid */}
                {loading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="bg-muted h-32 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3">
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
          <div className="space-y-4 order-1 xl:order-2 min-h-0">
            {/* Mobile: Show cart summary with view details button */}
            <div className="xl:hidden">
              {cart.length > 0 ? (
                <Card className="supabase-card">
                  <CardContent className="p-3">
                    <div className="space-y-3">
                      {/* Customer info - Compact display */}
                      {selectedCustomer && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                                  {selectedCustomer.customer_name}
                                </span>
                                {selectedCustomer.current_debt > 0 && (
                                  <Badge 
                                    variant={selectedCustomer.current_debt > (selectedCustomer.debt_limit || 0) ? "destructive" : "secondary"}
                                    className="text-[10px] px-1.5 py-0.5"
                                  >
                                    {selectedCustomer.current_debt > (selectedCustomer.debt_limit || 0) ? "Vượt hạn mức" : "Có công nợ"}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-blue-700 dark:text-blue-300">
                                <span>
                                  Công nợ hiện tại: <span className="font-medium">
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedCustomer.current_debt || 0)}
                                  </span>
                                </span>
                                <span>•</span>
                                <span>
                                  Sau giao dịch: <span className={`font-medium ${(selectedCustomer.current_debt || 0) + total > (selectedCustomer.debt_limit || 0) ? 'text-red-600' : 'text-green-600'}`}>
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format((selectedCustomer.current_debt || 0) + finalTotal)}
                                  </span>
                                </span>
                              </div>
                              {selectedCustomer.debt_limit && (selectedCustomer.current_debt || 0) + finalTotal > selectedCustomer.debt_limit && (
                                <div className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                                  ⚠️ Vượt hạn mức: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedCustomer.debt_limit)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Header with actions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="h-4 w-4 text-brand" />
                          <span className="text-sm font-medium">
                            {cart.length} sản phẩm
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-brand">
                            {new Intl.NumberFormat('vi-VN', {
                              style: 'currency',
                              currency: 'VND'
                            }).format(finalTotal)}
                          </div>
                          <div className="flex gap-2 mt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowCheckout(true)}
                              className="text-xs px-2 py-1"
                            >
                              Chi tiết
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                if (selectedCustomer) {
                                  setShowCheckout(true)
                                }
                              }}
                              disabled={!selectedCustomer || cart.length === 0}
                              className="bg-brand hover:bg-brand/90 text-brand-foreground text-xs px-2 py-1"
                            >
                              Thanh toán
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Compact cart items list - Max 3 items visible */}
                      <div className="max-h-32 overflow-y-auto space-y-1.5 border-t border-border pt-2">
                        {cart.slice(0, 3).map((item) => (
                          <div key={item.product.product_id} className="flex items-center justify-between bg-muted/30 p-2 rounded-md">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium bg-brand text-brand-foreground px-1.5 py-0.5 rounded text-[10px]">
                                  {item.quantity}x
                                </span>
                                <span className="text-xs truncate text-foreground">
                                  {item.product.product_name}
                                </span>
                              </div>
                            </div>
                            <div className="text-xs font-medium text-brand ml-2">
                              {new Intl.NumberFormat('vi-VN', {
                                style: 'currency',
                                currency: 'VND'
                              }).format(item.line_total)}
                            </div>
                          </div>
                        ))}
                        {cart.length > 3 && (
                          <div className="text-center py-1">
                            <span className="text-xs text-muted-foreground">
                              ... và {cart.length - 3} sản phẩm khác
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="supabase-card">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-center text-muted-foreground">
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      <span className="text-sm">Giỏ hàng trống</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Desktop: Full cart display - Sticky positioning with header offset */}
            <div className="hidden xl:block sticky top-20 self-start">
              {/* (Đã gỡ toggle Enhanced Pricing theo yêu cầu) */}

              {showCheckout && selectedCustomer ? (
                <CheckoutPanelOptimized
                  customer={selectedCustomer}
                  total={finalTotal}
                  posMode={posMode}
                  tempOrderData={tempOrderData}
                  onCheckout={handleCheckout}
                  onCancel={() => setShowCheckout(false)}
                  loading={checkoutLoading}
                />
              ) : useEnhancedPricing ? (
                <CartSummaryOptimized
                  cart={cart}
                  subtotal={finalSubtotal}
                  discountAmount={finalDiscountAmount}
                  tax={enhancedTax}
                  total={finalTotal}
                  vatRate={vatRate}
                  discountType={discountType}
                  discountValue={discountValue}
                  onUpdateQuantity={updateQuantity}
                  onRemoveItem={removeFromCart}
                  onVatChange={setVatRate}
                  onDiscountTypeChange={setDiscountType}
                  onDiscountValueChange={setDiscountValue}
                  onCheckout={() => setShowCheckout(true)}
                  disabled={!selectedCustomer || cart.length === 0}
                />
              ) : (
                <CartSummaryOptimized
                  cart={cart}
                  subtotal={finalSubtotal}
                  discountAmount={finalDiscountAmount}
                  tax={enhancedTax}
                  total={finalTotal}
                  vatRate={vatRate}
                  discountType={discountType}
                  discountValue={discountValue}
                  onUpdateQuantity={updateQuantity}
                  onRemoveItem={removeFromCart}
                  onVatChange={setVatRate}
                  onDiscountTypeChange={setDiscountType}
                  onDiscountValueChange={setDiscountValue}
                  onCheckout={() => setShowCheckout(true)}
                  disabled={!selectedCustomer || cart.length === 0}
                />
              )} 
            </div>
          </div>
        </div>

        {/* Mobile Cart Drawer - Full featured */}
        {showCheckout && (
          <div className="xl:hidden fixed inset-0 z-50 bg-black/50">
            <div className="absolute inset-x-0 bottom-0 bg-background rounded-t-xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-brand" />
                  <h2 className="text-lg font-semibold">
                    {selectedCustomer ? 'Thanh toán' : 'Giỏ hàng'}
                  </h2>
                  {cart.length > 0 && (
                    <Badge variant="secondary" className="bg-brand/10 text-brand border-brand/20">
                      {cart.length} sản phẩm
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCheckout(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content - Scrollable with full height */}
              <div className="flex-1 overflow-y-auto p-4">
                {selectedCustomer ? (
                  <CheckoutPanelOptimized
                    customer={selectedCustomer}
                    total={finalTotal}
                    posMode={posMode}
                    tempOrderData={tempOrderData}
                    onCheckout={handleCheckout}
                    onCancel={() => setShowCheckout(false)}
                    loading={checkoutLoading}
                  />
                ) : (
                  <div className="space-y-4 h-full">
                    {/* Customer selection notice */}
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        Vui lòng chọn khách hàng để tiếp tục thanh toán
                      </p>
                    </div>

                    {/* Cart items - Remove height restriction to show all items */}
                    <div className="flex-1">
                      <CartSummaryOptimized
                        cart={cart}
                        subtotal={finalSubtotal}
                        discountAmount={finalDiscountAmount}
                        tax={enhancedTax}
                        total={finalTotal}
                        vatRate={vatRate}
                        discountType={discountType}
                        discountValue={discountValue}
                        onUpdateQuantity={updateQuantity}
                        onRemoveItem={removeFromCart}
                        onVatChange={setVatRate}
                        onDiscountTypeChange={setDiscountType}
                        onDiscountValueChange={setDiscountValue}
                        onCheckout={() => {
                          if (selectedCustomer) {
                            // Stay in checkout mode if customer selected
                          } else {
                            setShowCheckout(false)
                          }
                        }}
                        disabled={!selectedCustomer || cart.length === 0}
                        isFullHeight={true}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
