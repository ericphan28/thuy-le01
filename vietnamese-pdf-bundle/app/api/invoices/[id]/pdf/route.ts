import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { generateProfessionalVietnamesePDF } from '@/lib/utils/professional-vietnamese-pdf'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = createClient()

    // Fetch invoice data với encoding đặc biệt cho tiếng Việt
    const { data: headerData, error: headerError } = await supabase
      .from('invoices')
      .select(`
        *,
        customers!fk_invoices_customer_id (
          customer_id,
          customer_code,
          customer_name,
          phone,
          email,
          address,
          current_debt,
          debt_limit
        )
      `)
      .eq('invoice_id', id)
      .single()

    if (headerError) {
      return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 })
    }

    // Fetch invoice details với hỗ trợ tiếng Việt đầy đủ
    const { data: detailsData, error: detailsError } = await supabase
      .from('invoice_details')
      .select('*')
      .eq('invoice_id', id)
      .order('detail_id')

    if (detailsError) {
      return NextResponse.json({ error: 'Không tìm thấy chi tiết hóa đơn' }, { status: 404 })
    }

    // Transform customer data
    const customerData = Array.isArray(headerData.customers) 
      ? headerData.customers[0] || null
      : headerData.customers

    const invoiceData = {
      header: headerData,
      details: detailsData || [],
      customer: customerData
    }

    // Generate PROFESSIONAL Vietnamese PDF - TYPOGRAPHY CHUYÊN NGHIỆP
    const pdfBlob = generateProfessionalVietnamesePDF(invoiceData)
    const pdfBuffer = await pdfBlob.arrayBuffer()

    // Create Vietnamese filename với encoding chuẩn
    const dateStr = new Date().toISOString().split('T')[0]
    const vietnameseFilename = `HoaDon_ChuyenNghiep_${headerData.invoice_code}_${dateStr}.pdf`

    // Return PDF response với header tiếng Việt
    return new NextResponse(pdfBuffer, {
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
    console.error('Lỗi tạo PDF chuyên nghiệp:', error)
    return NextResponse.json({ 
      error: 'Lỗi tạo PDF chuyên nghiệp: ' + (error instanceof Error ? error.message : 'Lỗi không xác định') 
    }, { status: 500 })
  }
}
