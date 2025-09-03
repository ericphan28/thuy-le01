"use client"

import { useState, useEffect, useCallback } from 'react'
import { enhancedPricingService, type CartPricing, type EnhancedCustomer } from '@/lib/services/enhanced-pricing-service'
import type { Product, Customer } from '@/lib/types/pos'
import { toast } from 'sonner'

interface UseEnhancedPricingOptions {
  vatRate?: number
  enableVolumeDiscounts?: boolean
  enableRealTimeValidation?: boolean
}

export function useEnhancedPricing(
  cartItems: { product: Product; quantity: number }[],
  selectedCustomer: Customer | null,
  options: UseEnhancedPricingOptions = {}
) {
  const {
    vatRate = 0,
    enableVolumeDiscounts = true,
    enableRealTimeValidation = true
  } = options

  const [cartPricing, setCartPricing] = useState<CartPricing | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [stockValidation, setStockValidation] = useState<{ valid: boolean; errors: string[] }>({ 
    valid: true, 
    errors: [] 
  })
  const [lastCalculationTime, setLastCalculationTime] = useState<number>(0)

  // Convert customer to enhanced customer format
  const enhancedCustomer: EnhancedCustomer | null = selectedCustomer ? {
    ...selectedCustomer,
    customer_type: 'individual',
    price_book_id: null
  } : null

  // Debounced pricing calculation
  const calculatePricing = useCallback(async () => {
    if (cartItems.length === 0) {
      setCartPricing(null)
      setStockValidation({ valid: true, errors: [] })
      return
    }

    setIsCalculating(true)
    const startTime = Date.now()
    
    try {
      // Calculate enhanced pricing
      const pricing = await enhancedPricingService.calculateCartPricing(
        cartItems,
        {
          customer: enhancedCustomer,
          price_book_id: enhancedCustomer?.price_book_id,
          include_volume_tiers: enableVolumeDiscounts,
          tax_rate: vatRate
        }
      )

      setCartPricing(pricing)
      setLastCalculationTime(Date.now() - startTime)

      // Validate stock if enabled
      if (enableRealTimeValidation) {
        const validation = await enhancedPricingService.validateCartStock(cartItems)
        setStockValidation(validation)

        if (!validation.valid && validation.errors.length > 0) {
          toast.warning(`${validation.errors.length} sản phẩm không đủ tồn kho`, {
            description: validation.errors[0]
          })
        }
      }

    } catch (error) {
      console.error('Error calculating enhanced pricing:', error)
      toast.error('Lỗi khi tính toán giá')
      
      // Fallback to basic calculation
      const basicSubtotal = cartItems.reduce((sum, item) => 
        sum + (item.product.sale_price * item.quantity), 0
      )
      const basicTax = basicSubtotal * vatRate / 100
      
      setCartPricing({
        items: cartItems.map(item => ({
          product: item.product,
          quantity: item.quantity,
          unit_price: item.product.sale_price,
          subtotal: item.product.sale_price * item.quantity
        })),
        subtotal: basicSubtotal,
        total_discount: 0,
        tax_amount: basicTax,
        final_total: basicSubtotal + basicTax,
        applied_rules: [],
        volume_tier_savings: 0
      })
    } finally {
      setIsCalculating(false)
    }
  }, [cartItems, enhancedCustomer, vatRate, enableVolumeDiscounts, enableRealTimeValidation])

  // Auto-calculate when dependencies change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      calculatePricing()
    }, 100) // Small debounce to avoid excessive calculations

    return () => clearTimeout(timeoutId)
  }, [calculatePricing])

  // Get pricing summary
  const pricingSummary = {
    itemCount: cartItems.length,
    totalQuantity: cartItems.reduce((sum, item) => sum + item.quantity, 0),
    originalSubtotal: cartItems.reduce((sum, item) => sum + (item.product.sale_price * item.quantity), 0),
    finalSubtotal: cartPricing?.subtotal || 0,
    totalSavings: cartPricing?.total_discount || 0,
    volumeTierSavings: cartPricing?.volume_tier_savings || 0,
    ruleBasedSavings: (cartPricing?.total_discount || 0) - (cartPricing?.volume_tier_savings || 0),
    taxAmount: cartPricing?.tax_amount || 0,
    finalTotal: cartPricing?.final_total || 0,
    appliedRulesCount: cartPricing?.applied_rules.length || 0
  }

  // Format price helper
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price)
  }

  // Get individual item pricing
  const getItemPricing = (productId: number) => {
    const item = cartPricing?.items.find(item => item.product.product_id === productId)
    if (!item) return null

    const originalPrice = item.product.sale_price
    const finalPrice = item.unit_price
    const discount = originalPrice - finalPrice
    const discountPercent = originalPrice > 0 ? (discount / originalPrice) * 100 : 0

    return {
      originalPrice,
      finalPrice,
      discount,
      discountPercent,
      appliedRule: item.applied_rule,
      volumeTierMatch: item.volume_tier_match,
      totalSavings: discount * item.quantity
    }
  }

  // Check if pricing is better than basic
  const hasPricingAdvantages = (cartPricing?.total_discount || 0) > 0

  return {
    // Pricing data
    cartPricing,
    pricingSummary,
    stockValidation,
    
    // State
    isCalculating,
    lastCalculationTime,
    hasPricingAdvantages,
    
    // Methods
    calculatePricing,
    getItemPricing,
    formatPrice,
    
    // Validation
    canCheckout: cartPricing && stockValidation.valid && cartItems.length > 0,
    hasStockIssues: !stockValidation.valid,
    stockErrors: stockValidation.errors
  }
}
