import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateProfessionalVietnamesePDF } from '@/lib/utils/puppeteer-pdf-service'
import type { InvoiceFullData } from '@/lib/types/invoice'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    // Fetch invoice header
    const { data: headerData, error: headerError } = await supabase
      .from('invoices')
      .select('*')
      .eq('invoice_id', id)
      .single()

    if (headerError || !headerData) {
      return NextResponse.json(
        { error: 'Không tìm thấy hóa đơn' },
        { status: 404 }
      )
    }

    // Fetch invoice details
    const { data: detailsData, error: detailsError } = await supabase
      .from('invoice_details')
      .select('*')
      .eq('invoice_id', id)
      .order('detail_id')

    if (detailsError) {
      console.error('Error fetching details:', detailsError)
      return NextResponse.json(
        { error: 'Lỗi khi tải chi tiết hóa đơn' },
        { status: 500 }
      )
    }

    // Fetch customer info
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', headerData.customer_id)
      .single()

    // Don't fail if customer not found, just continue with null
    if (customerError) {
      console.warn('Customer not found:', customerError)
    }

    // Prepare invoice data
    const invoiceData: InvoiceFullData = {
      header: headerData,
      details: detailsData || [],
      customer: customerData
    }

    // Generate PDF using Puppeteer
    const pdfBuffer = await generateProfessionalVietnamesePDF(invoiceData)

    // Create Vietnamese filename
    const dateStr = new Date().toISOString().split('T')[0]
    const vietnameseFilename = `HoaDon_Vietnamese_Professional_${headerData.invoice_code}_${dateStr}.pdf`

    // Return PDF response
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf; charset=utf-8',
        'Content-Disposition': `attachment; filename="${vietnameseFilename}"`,
        'Content-Language': 'vi-VN',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })

  } catch (error) {
    console.error('Vietnamese PDF generation error:', error)
    return NextResponse.json(
      { 
        error: 'Lỗi tạo PDF tiếng Việt',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
