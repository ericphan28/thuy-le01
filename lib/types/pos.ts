// Shared types for POS system

export interface Product {
  product_id: number
  product_code: string
  product_name: string
  sale_price: number
  current_stock: number
  requires_prescription: boolean
  is_medicine: boolean
  category_id: number
  product_categories: {
    category_id: number
    category_name: string
  }[]
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
