// Invoice related types for the veterinary management system

export interface InvoiceDetail {
  detail_id: number
  invoice_id: number
  product_id: number
  invoice_code: string
  product_code: string
  product_name: string
  quantity: number
  unit_price: number
  sale_price: number
  line_total: number
  discount_percent: number
  discount_amount: number
  profit_amount: number
  cost_price: number
  unit: string | null
  brand: string | null
  barcode: string | null
  product_notes: string | null
  created_at: string
}

export interface InvoiceHeader {
  invoice_id: number
  invoice_code: string
  invoice_date: string
  customer_id: number | null
  customer_name: string
  customer_code: string | null
  customer_phone: string | null
  customer_address: string | null
  branch_id: number
  total_amount: number
  customer_paid: number
  status: 'completed' | 'pending' | 'cancelled' | 'temp_pending' | 'temp_confirmed' | 'temp_ready'
  notes: string | null
  // VAT and Discount fields
  discount_type: 'percentage' | 'amount'
  discount_value: number
  vat_rate: number
  vat_amount: number
  // Temp invoice fields
  invoice_type: 'normal' | 'temp_order'
  expected_delivery_date?: string
  actual_delivery_date?: string
  created_at: string
  updated_at: string
}

export interface InvoiceCustomer {
  customer_id: number
  customer_code: string | null
  customer_name: string
  phone: string | null
  email: string | null
  address: string | null
  current_debt: number
  debt_limit: number
}

export interface InvoiceFullData {
  header: InvoiceHeader
  details: InvoiceDetail[]
  customer: InvoiceCustomer | null
}

export interface InvoiceCalculations {
  subtotal: number
  discountFromDetails: number
  discountFromHeader: number
  vatAmount: number
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  netFromDetails: number
}

export interface InvoiceStatus {
  label: string
  color: string
  icon: React.ComponentType
}

export interface PaymentStatus {
  label: string
  color: string
  icon: React.ComponentType
}

// For invoice listing page
export interface VeterinaryInvoice {
  invoice_id: number
  invoice_code: string
  invoice_date: string
  customer_name: string
  total_amount: number
  customer_paid: number
  status: string
  branch_id: number
  notes: string | null
  // Temp invoice fields
  invoice_type?: 'normal' | 'temp_order'
  expected_delivery_date?: string
  actual_delivery_date?: string
}

// Temp invoice specific types
export interface TempInvoice extends InvoiceHeader {
  invoice_type: 'temp_order'
  expected_delivery_date: string
  status: 'temp_pending' | 'temp_confirmed' | 'temp_ready'
}

export interface TempInvoiceWithDetails {
  header: TempInvoice
  details: InvoiceDetail[]
  customer: InvoiceCustomer | null
}

// Temp invoice management types
export interface TempInvoiceListItem {
  invoice_id: number
  invoice_code: string
  invoice_date: string
  customer_name: string
  total_amount: number
  status: 'temp_pending' | 'temp_confirmed' | 'temp_ready'
  expected_delivery_date: string
  actual_delivery_date?: string
  notes: string | null
  days_until_delivery: number
}

// Price comparison for temp invoice conversion
export interface PriceComparison {
  product_id: number
  product_code: string
  product_name: string
  temp_price: number
  current_price: number
  price_change: number
  price_change_percent: number
  needs_approval: boolean
}

export interface TempInvoiceConversion {
  temp_invoice_id: number
  price_comparisons: PriceComparison[]
  total_temp_amount: number
  total_current_amount: number
  total_price_change: number
  requires_manager_approval: boolean
}
