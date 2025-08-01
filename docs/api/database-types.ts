// Auto-generated TypeScript interfaces from database schema
// Generated at: 2025-08-01T06:29:44.121Z

export interface Branche {
  branch_id: number
  branch_code: unknown
  branch_name: unknown
  address?: string
  phone?: unknown
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface CustomerType {
  type_id: number
  type_code: unknown
  type_name: unknown
  description?: string
  is_active?: boolean
  created_at?: string
}

export interface Customer {
  customer_id: number
  customer_code: unknown
  customer_name: unknown
  customer_type_id?: number
  branch_created_id?: number
  phone?: unknown
  email?: unknown
  address?: string
  company_name?: unknown
  tax_code?: unknown
  id_number?: unknown
  gender?: unknown
  debt_limit?: number
  current_debt?: number
  total_revenue?: number
  total_profit?: number
  purchase_count?: number
  last_purchase_date?: string
  status?: number
  notes?: string
  created_by?: unknown
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface Invoice {
  invoice_id: number
  invoice_code: unknown
  invoice_date: string
  return_code?: unknown
  customer_id?: number
  customer_name: unknown
  branch_id?: number
  total_amount: number
  customer_paid: number
  notes?: string
  status?: unknown
  created_at?: string
  updated_at?: string
}

export interface FinancialTransaction {
  transaction_id: number
  transaction_code: unknown
  transaction_date: string
  transaction_type: unknown
  payer_receiver: unknown
  amount: number
  notes?: string
  created_at?: string
}

export interface InvoiceDetail {
  detail_id: number
  invoice_id?: number
  product_id?: number
  invoice_code: unknown
  product_code: unknown
  product_name: unknown
  customer_code?: unknown
  customer_name: unknown
  branch_id?: number
  delivery_code?: unknown
  pickup_address?: string
  reconciliation_code?: unknown
  invoice_date: string
  created_date?: string
  updated_date?: string
  order_code?: unknown
  customer_phone?: unknown
  customer_address?: string
  customer_region?: unknown
  customer_ward?: string
  receiver_name?: unknown
  receiver_phone?: unknown
  receiver_address?: string
  receiver_region?: unknown
  receiver_ward?: string
  sales_channel?: unknown
  creator?: unknown
  delivery_partner?: string
  delivery_service?: string
  weight_gram?: number
  length_cm?: number
  width_cm?: number
  height_cm?: number
  delivery_fee?: number
  notes?: string
  subtotal: number
  total_discount?: number
  customer_paid?: number
  cash_payment?: number
  card_payment?: number
  transfer_payment?: number
  wallet_payment?: number
  points_payment?: number
  unit?: unknown
  status?: unknown
  barcode?: unknown
  brand?: unknown
  product_notes?: string
  quantity: number
  unit_price: number
  discount_percent?: number
  discount_amount?: number
  sale_price: number
  line_total: number
  cost_price?: number
  profit_amount?: number
  created_at?: string
  customer_id?: number
}

export interface Product {
  product_id: number
  product_code: unknown
  product_name: unknown
  category_id?: number
  base_unit_id?: number
  barcode?: unknown
  product_type?: unknown
  brand?: unknown
  origin?: unknown
  description?: string
  image_url?: unknown
  image_urls?: string
  base_price?: number
  cost_price?: number
  sale_price?: number
  current_stock?: number
  reserved_stock?: number
  available_stock?: number
  min_stock?: number
  max_stock?: number
  is_medicine?: boolean
  requires_prescription?: boolean
  storage_condition?: unknown
  expiry_tracking?: boolean
  allow_sale?: boolean
  track_serial?: boolean
  conversion_rate?: number
  unit_attributes?: string
  related_product_codes?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface ProductCategorie {
  category_id: number
  category_code?: unknown
  category_name: unknown
  parent_category_id?: number
  level_path?: unknown
  description?: string
  is_active?: boolean
  created_at?: string
}

export interface ProductUnit {
  product_unit_id: number
  product_id?: number
  unit_id?: number
  conversion_rate: number
  selling_price?: number
  is_default?: boolean
  created_at?: string
}

export interface PurchaseOrder {
  order_id: number
  order_code: unknown
  order_date: string
  customer_name: unknown
  customer_debt?: number
  customer_paid?: number
  status?: unknown
  notes?: string
  created_at?: string
}

export interface SalesChannel {
  channel_id: number
  channel_code: unknown
  channel_name: unknown
  description?: string
  is_active?: boolean
  created_at?: string
}

export interface Supplier {
  supplier_id: number
  supplier_code: unknown
  supplier_name: unknown
  phone?: unknown
  email?: unknown
  address?: string
  contact_person?: unknown
  tax_code?: unknown
  payment_terms?: number
  notes?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface Unit {
  unit_id: number
  unit_code: unknown
  unit_name: unknown
  unit_symbol?: unknown
  is_base_unit?: boolean
  conversion_rate?: number
  is_active?: boolean
  created_at?: string
}

