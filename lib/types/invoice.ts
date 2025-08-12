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
  status: 'completed' | 'pending' | 'cancelled'
  notes: string | null
  // VAT and Discount fields
  discount_type: 'percentage' | 'amount'
  discount_value: number
  vat_rate: number
  vat_amount: number
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
}
