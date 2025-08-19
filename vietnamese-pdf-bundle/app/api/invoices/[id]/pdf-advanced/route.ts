import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { generateProfessionalVietnamesePDF } from '@/lib/utils/professional-vietnamese-pdf'
import { generateModernQRPDF } from '@/lib/utils/modern-qr-pdf'
import { generateSecureWatermarkPDF } from '@/lib/utils/secure-watermark-pdf'
import { generateAnalyticsPDF } from '@/lib/utils/analytics-pdf'
import { generateMinimalistPremiumPDF } from '@/lib/utils/minimalist-premium-pdf'
import { generateVietnameseEnterprisePDF } from '@/lib/utils/vietnamese-enterprise-pdf'
import { generateVietnameseSafePDF } from '@/lib/utils/vietnamese-safe-pdf'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const style = searchParams.get('style') || 'professional' // default style
    
    const supabase = createClient()

    // Fetch invoice data
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

    // Fetch invoice details
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

    // MULTIPLE PDF GENERATORS - User can choose style
    let pdfBlob: Blob
    let styleName: string

    switch (style) {
      case 'modern-qr':
        pdfBlob = await generateModernQRPDF(invoiceData)
        styleName = 'Modern_QR'
        break
      
      case 'secure':
        pdfBlob = generateSecureWatermarkPDF(invoiceData)
        styleName = 'Secure_Watermark'
        break
      
      case 'analytics':
        pdfBlob = generateAnalyticsPDF(invoiceData)
        styleName = 'Analytics_Dashboard'
        break
      
      case 'minimalist':
        pdfBlob = generateMinimalistPremiumPDF(invoiceData)
        styleName = 'Minimalist_Premium'
        break
      
      case 'vietnamese-enterprise':
        pdfBlob = generateVietnameseEnterprisePDF(invoiceData)
        styleName = 'Vietnamese_Enterprise'
        break
      
      case 'vietnamese-safe':
        pdfBlob = generateVietnameseSafePDF(invoiceData)
        styleName = 'Vietnamese_Safe_TELEX'
        break
      
      case 'professional':
      default:
        pdfBlob = generateProfessionalVietnamesePDF(invoiceData)
        styleName = 'Professional'
        break
    }

    const pdfBuffer = await pdfBlob.arrayBuffer()

    // Create filename with style indicator
    const dateStr = new Date().toISOString().split('T')[0]
    const vietnameseFilename = `HoaDon_${styleName}_${headerData.invoice_code}_${dateStr}.pdf`

    // Return PDF response
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf; charset=utf-8',
        'Content-Disposition': `attachment; filename="${vietnameseFilename}"`,
        'Content-Language': 'vi-VN',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-PDF-Style': styleName,
        'X-PDF-Features': getStyleFeatures(style)
      }
    })

  } catch (error) {
    console.error('Lỗi tạo PDF với multiple styles:', error)
    return NextResponse.json({ 
      error: 'Lỗi tạo PDF: ' + (error instanceof Error ? error.message : 'Lỗi không xác định'),
      availableStyles: ['professional', 'modern-qr', 'secure', 'analytics', 'minimalist']
    }, { status: 500 })
  }
}

// Helper function để mô tả features của từng style
function getStyleFeatures(style: string): string {
  const features: Record<string, string> = {
    'professional': 'Gradient_Headers,Business_Colors,Professional_Typography',
    'modern-qr': 'QR_Code,Digital_Elements,Modern_Design,Real_Time_Verification',
    'secure': 'Watermark,Security_Patterns,Digital_Hash,Anti_Fraud_Features',
    'analytics': 'Charts_Simulation,Data_Analytics,KPI_Dashboard,Business_Intelligence',
    'minimalist': 'Clean_Design,Minimal_Colors,Premium_Typography,Elegant_Layout'
  }
  
  return features[style] || 'Standard_Features'
}
