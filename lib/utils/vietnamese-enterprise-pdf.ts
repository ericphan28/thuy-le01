import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { formatPrice, formatDate } from '@/lib/utils/invoice'
import { 
  setupVietnameseFont, 
  addVietnameseText, 
  formatVietnameseBusinessText,
  VIETNAMESE_PDF_CONFIG,
  hasVietnameseChars,
  convertVietnameseToCompatible
} from './vietnamese-font-support'

/**
 * VIETNAMESE ENTERPRISE PDF GENERATOR
 * 
 * Công nghệ sử dụng tại Việt Nam:
 * ✅ Font Unicode embedding (như Times VN, Roboto VN)
 * ✅ UTF-8 encoding với fallback system
 * ✅ Business-standard Vietnamese typography
 * ✅ Chuẩn hóa đơn Bộ Tài Chính Việt Nam
 */
export function generateVietnameseEnterprisePDF(invoiceData: InvoiceFullData): Blob {
  try {
    const { header, details, customer } = invoiceData
    
    // Calculate totals
    const subtotal = details.reduce((sum, item) => sum + item.line_total, 0)
    const totalDiscount = details.reduce((sum, item) => sum + (item.discount_amount || 0), 0)
    const vatAmount = (subtotal - totalDiscount) * (header.vat_rate / 100)
    const grandTotal = subtotal - totalDiscount + vatAmount
    const remainingAmount = grandTotal - header.customer_paid

    // Tạo PDF với Unicode support enhanced
    const pdf = new jsPDF('p', 'mm', 'a4')
    
    // Setup Vietnamese font system
    setupVietnameseFont(pdf)
    
    const pageWidth = 210
    const pageHeight = 297
    const margin = 15
    const contentWidth = pageWidth - (margin * 2)
    
    let currentY = margin
    
    // ═══════════════════════════════════════════════════════════════
    // VIETNAMESE ENTERPRISE HEADER
    // ═══════════════════════════════════════════════════════════════
    
    // Professional gradient background
    pdf.setFillColor(0, 51, 102) // Deep blue
    pdf.rect(0, 0, pageWidth, 50, 'F')
    
    // Company logo area
    pdf.setFillColor(255, 215, 0) // Gold accent
    pdf.circle(margin + 12, currentY + 12, 6, 'F')
    pdf.setTextColor(0, 51, 102)
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    addVietnameseText(pdf, 'TVT', margin + 12, currentY + 15, { align: 'center' })
    
    // Company name - VIETNAMESE TYPOGRAPHY
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(20)
    pdf.setFont('helvetica', 'bold')
    const companyName = 'THÚ Y THÙY TRANG'
    addVietnameseText(pdf, companyName, margin + 25, currentY + 8)
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    const subtitle = 'Nhà thuốc thú y thông minh - Smart veterinary solutions'
    addVietnameseText(pdf, subtitle, margin + 25, currentY + 16)
    
    // Contact info với Vietnamese formatting
    pdf.setFontSize(8)
    addVietnameseText(pdf, 'Địa chỉ: 123 Đường ABC, Phường XYZ, Quận DEF, TP.HCM', margin + 25, currentY + 24)
    addVietnameseText(pdf, 'Điện thoại: 0907136029 | Email: ericphan28@gmail.com', margin + 25, currentY + 30)
    addVietnameseText(pdf, 'MST: 0123456789 | Website: thuyletrang.vn', margin + 25, currentY + 36)
    
    currentY += 55
    
    // ═══════════════════════════════════════════════════════════════
    // INVOICE TITLE - CHUẨN VIỆT NAM
    // ═══════════════════════════════════════════════════════════════
    
    pdf.setFillColor(245, 245, 245)
    pdf.rect(margin, currentY, contentWidth, 25, 'F')
    
    pdf.setTextColor(0, 51, 102)
    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    addVietnameseText(pdf, VIETNAMESE_PDF_CONFIG.BUSINESS_TERMS.INVOICE, pageWidth / 2, currentY + 10, { align: 'center' })
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    addVietnameseText(pdf, `Số: ${header.invoice_code}`, pageWidth / 2, currentY + 18, { align: 'center' })
    
    currentY += 35
    
    // ═══════════════════════════════════════════════════════════════
    // CUSTOMER INFO - VIETNAMESE BUSINESS FORMAT
    // ═══════════════════════════════════════════════════════════════
    
    pdf.setTextColor(0, 0, 0)
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    addVietnameseText(pdf, VIETNAMESE_PDF_CONFIG.BUSINESS_TERMS.CUSTOMER, margin, currentY)
    
    currentY += 8
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    
    const customerInfo = [
      `Tên: ${formatVietnameseBusinessText(customer?.customer_name || header.customer_name || 'Khách lẻ')}`,
      `Địa chỉ: ${formatVietnameseBusinessText(customer?.address || header.customer_address || 'Chưa cập nhật')}`,
      `Điện thoại: ${customer?.phone || header.customer_phone || 'Chưa có'}`,
      `Ngày lập: ${formatDate(header.invoice_date)}`,
      `Hình thức TT: Tiền mặt`
    ]
    
    customerInfo.forEach(info => {
      addVietnameseText(pdf, info, margin, currentY)
      currentY += 6
    })
    
    currentY += 10
    
    // ═══════════════════════════════════════════════════════════════
    // PRODUCT TABLE - VIETNAMESE ENTERPRISE DESIGN
    // ═══════════════════════════════════════════════════════════════
    
    const tableColumn = [
      'STT',
      'TÊN SẢN PHẨM',
      'ĐVT',
      'SL',
      'ĐƠN GIÁ',
      'THÀNH TIỀN'
    ]
    
    const tableRows: string[][] = []
    details.forEach((item, index) => {
      const productName = formatVietnameseBusinessText(item.product_name || 'Sản phẩm')
      const unitName = item.unit || 'cái'
      
      const row = [
        (index + 1).toString(),
        hasVietnameseChars(productName) ? convertVietnameseToCompatible(productName) : productName,
        hasVietnameseChars(unitName) ? convertVietnameseToCompatible(unitName) : unitName,
        (item.quantity || 1).toString(),
        formatPrice(item.unit_price || 0),
        formatPrice(item.line_total)
      ]
      tableRows.push(row)
    })
    
    // VIETNAMESE ENTERPRISE TABLE STYLING
    autoTable(pdf, {
      startY: currentY,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        textColor: [0, 0, 0],
        cellPadding: 4,
        lineColor: [0, 51, 102],
        lineWidth: 0.5
      },
      headStyles: {
        fillColor: [0, 51, 102], // Vietnamese enterprise blue
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fillColor: [255, 255, 255]
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { cellWidth: 75 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'right', cellWidth: 30 },
        5: { halign: 'right', cellWidth: 35 }
      }
    })
    
    // ═══════════════════════════════════════════════════════════════
    // VIETNAMESE TOTALS SECTION
    // ═══════════════════════════════════════════════════════════════
    
    const finalY = (pdf as any).lastAutoTable.finalY + 15
    
    // Professional totals box
    pdf.setFillColor(248, 250, 252)
    pdf.rect(pageWidth - 80, finalY, 65, 50, 'F')
    pdf.setDrawColor(0, 51, 102)
    pdf.setLineWidth(1)
    pdf.rect(pageWidth - 80, finalY, 65, 50, 'S')
    
    pdf.setTextColor(0, 0, 0)
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    
    let summaryY = finalY + 8
    const summaryItems = [
      [`${VIETNAMESE_PDF_CONFIG.BUSINESS_TERMS.SUBTOTAL}:`, formatPrice(subtotal)],
      [`Giảm giá:`, formatPrice(totalDiscount)],
      [`${VIETNAMESE_PDF_CONFIG.BUSINESS_TERMS.VAT} (${header.vat_rate}%):`, formatPrice(vatAmount)],
      [`${VIETNAMESE_PDF_CONFIG.BUSINESS_TERMS.TOTAL}:`, formatPrice(grandTotal)],
      [`${VIETNAMESE_PDF_CONFIG.BUSINESS_TERMS.REMAINING}:`, formatPrice(remainingAmount)]
    ]
    
    summaryItems.forEach((item, index) => {
      if (index === summaryItems.length - 2) { // Total row
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
      }
      
      addVietnameseText(pdf, item[0], pageWidth - 75, summaryY)
      addVietnameseText(pdf, item[1], pageWidth - 20, summaryY, { align: 'right' })
      summaryY += 8
      
      if (index === summaryItems.length - 2) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
      }
    })
    
    // ═══════════════════════════════════════════════════════════════
    // VIETNAMESE FOOTER
    // ═══════════════════════════════════════════════════════════════
    
    currentY = finalY + 70
    
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'italic')
    pdf.setTextColor(100, 100, 100)
    
    const footerText = [
      'Cảm ơn Quý khách đã tin tưởng sử dụng dịch vụ của chúng tôi!',
      'Mọi thắc mắc xin liên hệ: 0907136029 hoặc ericphan28@gmail.com',
      'Thú Y Thùy Trang - Đồng hành cùng sự phát triển chăn nuôi Việt Nam'
    ]
    
    footerText.forEach(text => {
      addVietnameseText(pdf, text, pageWidth / 2, currentY, { align: 'center' })
      currentY += 6
    })
    
    // Vietnamese enterprise signature section
    currentY += 15
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    
    addVietnameseText(pdf, 'NGƯỜI BÁN HÀNG', margin + 30, currentY, { align: 'center' })
    addVietnameseText(pdf, 'KHÁCH HÀNG', pageWidth - margin - 30, currentY, { align: 'center' })
    
    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(8)
    addVietnameseText(pdf, '(Ký, họ tên)', margin + 30, currentY + 6, { align: 'center' })
    addVietnameseText(pdf, '(Ký, họ tên)', pageWidth - margin - 30, currentY + 6, { align: 'center' })
    
    // Generate the PDF
    return new Blob([pdf.output('blob')], { type: 'application/pdf' })
    
  } catch (error) {
    console.error('Vietnamese PDF generation failed:', error)
    throw new Error('Không thể tạo PDF tiếng Việt. Vui lòng thử lại.')
  }
}
