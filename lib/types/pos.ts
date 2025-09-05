// Shared types for POS system

export interface Product {
  product_id: number
  product_code: string
  product_name: string
  sale_price: number
  current_stock: number
  category_id: number | null
  requires_prescription?: boolean
  is_medicine?: boolean
}

export interface Customer {
  customer_id: number
  customer_code: string
  customer_name: string
  phone?: string
  current_debt: number
  debt_limit: number
}

export interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  line_total: number
}

export interface PaymentData {
  method: 'cash' | 'card' | 'transfer'
  receivedAmount?: number
}

// POS Mode types
export type POSMode = 'normal' | 'temp_order'

// Temp order specific data
export interface TempOrderData {
  expected_delivery_date: string
  notes?: string
}

// Enhanced payment data for checkout
export interface CheckoutPaymentData {
  method: 'cash' | 'card' | 'transfer'
  paymentType: 'full' | 'partial' | 'debt'
  receivedAmount?: number
  partialAmount?: number
  // Temp order data (when POS mode is temp_order)
  tempOrderData?: TempOrderData
}

// POS Settings/State
export interface POSSettings {
  mode: POSMode
  vatRate: number
  discountType: 'percentage' | 'amount'
  discountValue: number
  useEnhancedPricing: boolean
}
