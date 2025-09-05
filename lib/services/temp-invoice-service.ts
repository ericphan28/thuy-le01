// =========================================
// TEMP INVOICE SERVICE
// =========================================
// Date: September 4, 2025
// Purpose: Service layer for temp invoice management

import { createClient } from '@/lib/supabase/client'
import type { 
  TempInvoice, 
  TempInvoiceListItem, 
  TempInvoiceWithDetails,
  PriceComparison,
  TempInvoiceConversion
} from '@/lib/types/invoice'

export class TempInvoiceService {
  private supabase = createClient()

  /**
   * Get all temp invoices with pagination and filters
   */
  async getTempInvoices(options: {
    page?: number
    limit?: number
    status?: 'temp_pending' | 'temp_confirmed' | 'temp_ready'
    customerId?: number
    deliveryDateFrom?: string
    deliveryDateTo?: string
    search?: string
  } = {}): Promise<{
    data: TempInvoiceListItem[]
    total: number
    hasMore: boolean
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      customerId,
      deliveryDateFrom,
      deliveryDateTo,
      search
    } = options

    let query = this.supabase
      .from('invoices')
      .select(`
        invoice_id,
        invoice_code,
        invoice_date,
        customer_name,
        total_amount,
        status,
        expected_delivery_date,
        actual_delivery_date,
        notes
      `, { count: 'exact' })
      .eq('invoice_type', 'temp_order')
      .order('expected_delivery_date', { ascending: true })
      .order('created_at', { ascending: false })

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    if (deliveryDateFrom) {
      query = query.gte('expected_delivery_date', deliveryDateFrom)
    }

    if (deliveryDateTo) {
      query = query.lte('expected_delivery_date', deliveryDateTo)
    }

    if (search) {
      query = query.or(`invoice_code.ilike.%${search}%,customer_name.ilike.%${search}%`)
    }

    // Pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      throw new Error(`Failed to fetch temp invoices: ${error.message}`)
    }

    // Calculate days until delivery
    const tempInvoices: TempInvoiceListItem[] = (data || []).map(invoice => {
      const deliveryDate = new Date(invoice.expected_delivery_date)
      const today = new Date()
      const timeDiff = deliveryDate.getTime() - today.getTime()
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24))

      return {
        ...invoice,
        days_until_delivery: daysDiff
      }
    })

    return {
      data: tempInvoices,
      total: count || 0,
      hasMore: to < (count || 0) - 1
    }
  }

  /**
   * Get temp invoice details with items
   */
  async getTempInvoiceDetails(invoiceId: number): Promise<TempInvoiceWithDetails | null> {
    // Get invoice header
    const { data: header, error: headerError } = await this.supabase
      .from('invoices')
      .select(`
        invoice_id,
        invoice_code,
        invoice_date,
        customer_id,
        customer_name,
        total_amount,
        customer_paid,
        status,
        notes,
        discount_type,
        discount_value,
        vat_rate,
        vat_amount,
        invoice_type,
        expected_delivery_date,
        actual_delivery_date,
        created_at,
        updated_at
      `)
      .eq('invoice_id', invoiceId)
      .eq('invoice_type', 'temp_order')
      .single()

    if (headerError) {
      throw new Error(`Failed to fetch temp invoice header: ${headerError.message}`)
    }

    if (!header) {
      return null
    }

    // Get invoice details
    const { data: details, error: detailsError } = await this.supabase
      .from('invoice_details')
      .select(`
        detail_id,
        invoice_id,
        product_id,
        invoice_code,
        product_code,
        product_name,
        quantity,
        unit_price,
        sale_price,
        line_total,
        discount_percent,
        discount_amount,
        profit_amount,
        cost_price,
        unit,
        brand,
        barcode,
        product_notes,
        created_at
      `)
      .eq('invoice_id', invoiceId)

    if (detailsError) {
      throw new Error(`Failed to fetch temp invoice details: ${detailsError.message}`)
    }

    // Get customer details
    const { data: customer, error: customerError } = await this.supabase
      .from('customers')
      .select(`
        customer_id,
        customer_code,
        customer_name,
        phone,
        email,
        address,
        current_debt,
        debt_limit
      `)
      .eq('customer_id', header.customer_id)
      .single()

    if (customerError) {
      console.warn('Failed to fetch customer details:', customerError.message)
    }

    return {
      header: header as TempInvoice,
      details: details || [],
      customer: customer || null
    }
  }

  /**
   * Update temp invoice status
   */
  async updateTempInvoiceStatus(
    invoiceId: number, 
    status: 'temp_pending' | 'temp_confirmed' | 'temp_ready',
    notes?: string
  ): Promise<void> {
    const updateData: any = { 
      status,
      updated_at: new Date().toISOString()
    }

    if (notes) {
      updateData.notes = notes
    }

    const { error } = await this.supabase
      .from('invoices')
      .update(updateData)
      .eq('invoice_id', invoiceId)
      .eq('invoice_type', 'temp_order')

    if (error) {
      throw new Error(`Failed to update temp invoice status: ${error.message}`)
    }
  }

  /**
   * Get price comparison for temp invoice conversion
   */
  async getPriceComparison(invoiceId: number): Promise<TempInvoiceConversion> {
    // Get temp invoice details
    const tempInvoice = await this.getTempInvoiceDetails(invoiceId)
    if (!tempInvoice) {
      throw new Error('Temp invoice not found')
    }

    // Get current prices from products table
    const productIds = tempInvoice.details.map(d => d.product_id)
    const { data: currentProducts, error } = await this.supabase
      .from('products')
      .select('product_id, sale_price')
      .in('product_id', productIds)

    if (error) {
      throw new Error(`Failed to fetch current prices: ${error.message}`)
    }

    const currentPricesMap = new Map(
      currentProducts.map(p => [p.product_id, p.sale_price])
    )

    // Calculate price comparisons
    const priceComparisons: PriceComparison[] = tempInvoice.details.map(detail => {
      const currentPrice = currentPricesMap.get(detail.product_id) || detail.unit_price
      const priceChange = currentPrice - detail.unit_price
      const priceChangePercent = detail.unit_price > 0 
        ? (priceChange / detail.unit_price) * 100 
        : 0

      return {
        product_id: detail.product_id,
        product_code: detail.product_code,
        product_name: detail.product_name,
        temp_price: detail.unit_price,
        current_price: currentPrice,
        price_change: priceChange,
        price_change_percent: priceChangePercent,
        needs_approval: Math.abs(priceChangePercent) > 5 // More than 5% change needs approval
      }
    })

    const totalTempAmount = tempInvoice.details.reduce((sum, d) => sum + d.line_total, 0)
    const totalCurrentAmount = priceComparisons.reduce(
      (sum, p) => sum + (p.current_price * tempInvoice.details.find(d => d.product_id === p.product_id)!.quantity), 
      0
    )

    return {
      temp_invoice_id: invoiceId,
      price_comparisons: priceComparisons,
      total_temp_amount: totalTempAmount,
      total_current_amount: totalCurrentAmount,
      total_price_change: totalCurrentAmount - totalTempAmount,
      requires_manager_approval: priceComparisons.some(p => p.needs_approval)
    }
  }

  /**
   * Convert temp invoice to normal invoice
   */
  async convertToInvoice(
    invoiceId: number,
    conversionData: {
      actualDeliveryDate?: string
      priceAdjustments?: { product_id: number; new_price: number }[]
      paymentMethod?: 'cash' | 'card' | 'transfer'
      paymentType?: 'full' | 'partial' | 'debt'
      receivedAmount?: number
      paidAmount?: number
      debtAmount?: number
      convertedBy?: string
    }
  ): Promise<any> {
    const {
      actualDeliveryDate = new Date().toISOString().split('T')[0],
      priceAdjustments,
      paymentMethod = 'cash',
      paymentType = 'full',
      receivedAmount,
      paidAmount,
      debtAmount = 0,
      convertedBy = 'System'
    } = conversionData

    const { data, error } = await this.supabase.rpc('convert_temp_to_invoice', {
      p_temp_invoice_id: invoiceId,
      p_actual_delivery_date: actualDeliveryDate,
      p_price_adjustments: priceAdjustments || null,
      p_payment_method: paymentMethod,
      p_payment_type: paymentType,
      p_received_amount: receivedAmount || null,
      p_paid_amount: paidAmount || null,
      p_debt_amount: debtAmount,
      p_converted_by: convertedBy
    })

    if (error) {
      throw new Error(`Failed to convert temp invoice: ${error.message}`)
    }

    return data
  }

  /**
   * Cancel temp invoice
   */
  async cancelTempInvoice(invoiceId: number, reason?: string): Promise<void> {
    const updateData: any = {
      status: 'cancelled',
      updated_at: new Date().toISOString()
    }

    if (reason) {
      updateData.notes = `CANCELLED: ${reason}. ${updateData.notes || ''}`
    }

    const { error } = await this.supabase
      .from('invoices')
      .update(updateData)
      .eq('invoice_id', invoiceId)
      .eq('invoice_type', 'temp_order')

    if (error) {
      throw new Error(`Failed to cancel temp invoice: ${error.message}`)
    }
  }

  /**
   * Get temp invoice statistics
   */
  async getTempInvoiceStats(): Promise<{
    total: number
    pending: number
    confirmed: number
    ready: number
    overdue: number
    todayDeliveries: number
  }> {
    const today = new Date().toISOString().split('T')[0]

    const { data: stats, error } = await this.supabase
      .from('invoices')
      .select('status, expected_delivery_date')
      .eq('invoice_type', 'temp_order')
      .neq('status', 'cancelled')

    if (error) {
      throw new Error(`Failed to fetch temp invoice stats: ${error.message}`)
    }

    const result = {
      total: stats.length,
      pending: 0,
      confirmed: 0,
      ready: 0,
      overdue: 0,
      todayDeliveries: 0
    }

    stats.forEach(invoice => {
      switch (invoice.status) {
        case 'temp_pending':
          result.pending++
          break
        case 'temp_confirmed':
          result.confirmed++
          break
        case 'temp_ready':
          result.ready++
          break
      }

      // Check overdue (past expected delivery date)
      if (invoice.expected_delivery_date < today) {
        result.overdue++
      }

      // Check today deliveries
      if (invoice.expected_delivery_date === today) {
        result.todayDeliveries++
      }
    })

    return result
  }
}

// Export singleton instance
export const tempInvoiceService = new TempInvoiceService()
