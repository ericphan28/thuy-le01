// Base Customer interface dựa trên schema thực tế
export interface Customer {
  customer_id: number
  customer_code: string
  customer_name: string
  customer_type_id?: number
  branch_created_id?: number
  phone?: string
  email?: string
  address?: string
  company_name?: string
  tax_code?: string
  id_number?: string
  gender?: string
  debt_limit: number
  current_debt: number
  total_revenue: number
  total_profit: number
  purchase_count: number
  last_purchase_date?: string
  status: number
  notes?: string
  created_by?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CustomerInsert = Omit<Customer, 'customer_id' | 'created_at' | 'updated_at'>
export type CustomerUpdate = Partial<Omit<Customer, 'customer_id' | 'created_at'>>

// Customer Type
export interface CustomerType {
  type_id: number
  type_name: string
  description?: string
  default_discount_percent: number
  credit_limit_default: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// Invoice types
export interface Invoice {
  invoice_id: number
  invoice_code: string
  customer_id?: number
  branch_id?: number
  invoice_date: string
  due_date?: string
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  paid_amount: number
  balance_due: number
  payment_status: string
  invoice_status: string
  notes?: string
  created_by?: number
  created_at: string
  updated_at: string
}

export interface InvoiceDetail {
  detail_id: number
  invoice_id: number
  product_id: number
  quantity: number
  unit_price: number
  discount_percent: number
  discount_amount: number
  line_total: number
  cost_price?: number
  created_at: string
}

// Extended customer với relationships
export interface CustomerWithStats extends Customer {
  customer_types?: {
    type_name: string
    type_code?: string
    default_discount_percent: number
  }
  total_orders?: number
  total_spent?: number
  avg_order_value?: number
  last_purchase_date?: string
  days_since_last_purchase?: number
  customer_segment?: string
}

// Search parameters
export interface CustomerSearchParams {
  search?: string
  customer_type_id?: number
  is_active?: boolean
  page?: number
  limit?: number
  sort_by?: keyof Customer
  sort_order?: 'asc' | 'desc'
  date_from?: string
  date_to?: string
}

// API Response types
export interface ApiResponse<T> {
  data: T | null
  error: PostgrestError | null
  count?: number
  status?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  error: PostgrestError | null
}

// Supabase error type
export interface PostgrestError {
  message: string
  details: string | null
  hint: string | null
  code: string
}

// RPC Function types
export interface SearchCustomersWithStatsParams {
  search_term?: string
  customer_type_filter?: number
  limit_count?: number
  date_from?: string
}

export interface FinancialSummaryParams {
  date_from?: string
  date_to?: string
}

// Customer Analytics
export interface CustomerStats {
  total_customers: number
  active_customers: number
  new_customers_this_month: number
  vip_customers: number
  total_debt: number
  avg_order_value: number
  customer_segments: {
    vip: number
    regular: number
    new: number
    inactive: number
  }
}

// Customer segments
export type CustomerSegment = 'VIP' | 'Regular' | 'New' | 'Inactive'

// Filter options
export interface CustomerFilters {
  customer_type_id?: number
  is_active?: boolean
  debt_status?: 'no_debt' | 'has_debt' | 'overdue'
  segment?: CustomerSegment
  date_range?: {
    from: string
    to: string
  }
  revenue_range?: {
    min: number
    max: number
  }
}

// Order history
export interface CustomerOrderHistory {
  customer: Customer
  orders: Array<{
    invoice_id: number
    invoice_code: string
    invoice_date: string
    total_amount: number
    payment_status: string
    items_count: number
  }>
  stats: {
    total_orders: number
    total_spent: number
    avg_order_value: number
    first_order_date: string
    last_order_date: string
  }
}

// Error types
export class CustomerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'CustomerError'
  }
}

export class CustomerValidationError extends CustomerError {
  constructor(message: string, public fields: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', fields)
  }
}

export class CustomerNotFoundError extends CustomerError {
  constructor(message: string = 'Customer not found') {
    super(message, 'NOT_FOUND')
  }
}

export class CustomerDuplicateError extends CustomerError {
  constructor(message: string = 'Customer already exists') {
    super(message, 'DUPLICATE_ERROR')
  }
}

// Service result wrapper
export interface ServiceResult<T> {
  success: boolean
  data?: T
  error?: {
    message: string
    code: string
    details?: Record<string, unknown>
  }
  metadata?: {
    timestamp: string
    operation: string
    duration?: number
  }
}
