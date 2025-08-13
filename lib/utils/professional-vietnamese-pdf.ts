import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

// Professional Vietnamese PDF Generator
// Tuân thủ chuẩn hóa đơn Việt Nam và thiết kế chuyên nghiệp

export function generateProfessionalVietnamesePDF(invoiceData: InvoiceFullData): Blob {
  try {
    const { header, details, customer } = invoiceData
    
    // Calculate totals
    const subtotal = details.reduce((sum, item) => sum + item.line_total, 0)
    const totalDiscount = details.reduce((sum, item) => sum + (item.discount_amount || 0), 0)
    const vatAmount = (subtotal - totalDiscount) * (header.vat_rate / 100)
    const grandTotal = subtotal - totalDiscount + vatAmount
    const remainingAmount = grandTotal - header.customer_paid

    // Tạo PDF với chuẩn A4 và font chuyên nghiệp
    const pdf = new jsPDF('p', 'mm', 'a4')
    
    // Sử dụng Helvetica với encoding đặc biệt cho tiếng Việt
    pdf.setFont('helvetica', 'normal')
    
    const pageWidth = 210
    const pageHeight = 297
    const margin = 15
    const contentWidth = pageWidth - (margin * 2)
    
    let currentY = margin
    
    // ═══════════════════════════════════════════════════════════════
    // HEADER COMPANY - THIẾT KẾ CHUYÊN NGHIỆP
    // ═══════════════════════════════════════════════════════════════
    
    // Background gradient cho header
    pdf.setFillColor(240, 248, 255) // Light blue background
    pdf.rect(0, 0, pageWidth, 45, 'F')
    
    // Logo placeholder (có thể thêm logo sau)
    pdf.setFillColor(59, 130, 246) // Blue
    pdf.circle(margin + 15, currentY + 15, 8, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('VET', margin + 15, currentY + 18, { align: 'center' })
    
    // Company name - Typography chuyên nghiệp
    pdf.setTextColor(15, 23, 42) // Slate 900
    pdf.setFontSize(24)
    pdf.setFont('helvetica', 'bold')
    pdf.text('XUÂN THÙY VETERINARY PHARMACY', margin + 35, currentY + 12)
    
    // Company subtitle
    pdf.setTextColor(71, 85, 105) // Slate 600
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Nhà thuốc thú y - Dụng cụ chăn nuôi chuyên nghiệp', margin + 35, currentY + 20)
    
    // Company info với icon
    pdf.setTextColor(100, 116, 139) // Slate 500
    pdf.setFontSize(9)
    pdf.text('📍 Địa chỉ: Số 123, Đường ABC, Phường XYZ, TP.HCM', margin + 35, currentY + 28)
    pdf.text('📞 Điện thoại: (028) 1234.5678 | 📧 Email: info@xuanthuy.com', margin + 35, currentY + 33)
    pdf.text('🏢 MST: 0123456789 | 🌐 Website: www.xuanthuy.com', margin + 35, currentY + 38)
    
    currentY += 55
    
    // ═══════════════════════════════════════════════════════════════
    // INVOICE TITLE - CHUẨN HÓA ĐƠN VIỆT NAM
    // ═══════════════════════════════════════════════════════════════
    
    // Title background
    pdf.setFillColor(239, 68, 68) // Red 500
    pdf.rect(margin, currentY - 5, contentWidth, 25, 'F')
    
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(22)
    pdf.setFont('helvetica', 'bold')
    pdf.text('HÓA ĐƠN BÁN HÀNG', pageWidth / 2, currentY + 8, { align: 'center' })
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.text('SALES INVOICE', pageWidth / 2, currentY + 15, { align: 'center' })
    
    currentY += 35
    
    // ═══════════════════════════════════════════════════════════════
    // INVOICE INFO SECTION - 2 CỘT CHUYÊN NGHIỆP
    // ═══════════════════════════════════════════════════════════════
    
    const leftColX = margin
    const rightColX = margin + (contentWidth / 2) + 5
    const colWidth = (contentWidth / 2) - 5
    
    // Left Column - Invoice Information
    pdf.setFillColor(219, 234, 254) // Blue 100
    pdf.rect(leftColX, currentY, colWidth, 50, 'F')
    pdf.setDrawColor(59, 130, 246) // Blue 500
    pdf.rect(leftColX, currentY, colWidth, 50, 'S')
    
    pdf.setTextColor(30, 58, 138) // Blue 800
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('📋 THÔNG TIN HÓA ĐƠN', leftColX + 5, currentY + 10)
    
    pdf.setTextColor(15, 23, 42) // Slate 900
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    
    const invoiceInfo = [
      `Số hóa đơn: ${header.invoice_code}`,
      `Ngày lập: ${formatDate(header.invoice_date)}`,
      `Chi nhánh: Chi nhánh ${header.branch_id}`,
      `Trạng thái: ${header.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý'}`
    ]
    
    invoiceInfo.forEach((info, index) => {
      pdf.text(info, leftColX + 5, currentY + 20 + (index * 7))
    })
    
    // Right Column - Customer Information
    pdf.setFillColor(220, 252, 231) // Green 100
    pdf.rect(rightColX, currentY, colWidth, 50, 'F')
    pdf.setDrawColor(34, 197, 94) // Green 500
    pdf.rect(rightColX, currentY, colWidth, 50, 'S')
    
    pdf.setTextColor(22, 101, 52) // Green 800
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('👤 THÔNG TIN KHÁCH HÀNG', rightColX + 5, currentY + 10)
    
    pdf.setTextColor(15, 23, 42) // Slate 900
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    
    const customerName = customer?.customer_name || 'Khách lẻ'
    const customerInfo = [
      `Tên khách hàng: ${customerName}`,
      `Mã KH: ${customer?.customer_code || 'N/A'}`,
      `Điện thoại: ${customer?.phone || 'N/A'}`,
      `Địa chỉ: ${customer?.address ? (customer.address.length > 40 ? customer.address.substring(0, 40) + '...' : customer.address) : 'N/A'}`
    ]
    
    customerInfo.forEach((info, index) => {
      pdf.text(info, rightColX + 5, currentY + 20 + (index * 7))
    })
    
    currentY += 65
    
    // ═══════════════════════════════════════════════════════════════
    // PRODUCTS TABLE - BẢNG SẢN PHẨM CHUYÊN NGHIỆP
    // ═══════════════════════════════════════════════════════════════
    
    // Table title
    pdf.setFillColor(248, 250, 252) // Slate 50
    pdf.rect(margin, currentY, contentWidth, 12, 'F')
    pdf.setDrawColor(203, 213, 225) // Slate 300
    pdf.rect(margin, currentY, contentWidth, 12, 'S')
    
    pdf.setTextColor(51, 65, 85) // Slate 700
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('📦 CHI TIẾT SẢN PHẨM', pageWidth / 2, currentY + 8, { align: 'center' })
    
    currentY += 18
    
    // Prepare table data với formatting chuyên nghiệp
    const tableData = details.map((item, index) => [
      (index + 1).toString(),
      item.product_name + (item.product_code ? `\n(Mã: ${item.product_code})` : ''),
      item.quantity.toString(),
      formatPrice(item.unit_price),
      formatPrice(item.line_total),
      item.discount_amount > 0 ? formatPrice(item.discount_amount) : '-'
    ])

    // Professional table với AutoTable
    autoTable(pdf, {
      startY: currentY,
      head: [['STT', 'TÊN HÀNG HÓA', 'SL', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'GIẢM GIÁ']],
      body: tableData,
      margin: { left: margin, right: margin },
      
      // Table styling - Chuyên nghiệp
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 4,
        textColor: [15, 23, 42], // Slate 900
        lineColor: [203, 213, 225], // Slate 300
        lineWidth: 0.5,
        overflow: 'linebreak'
      },
      
      // Header styling
      headStyles: {
        fillColor: [59, 130, 246], // Blue 500
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'center'
      },
      
      // Alternating row colors
      alternateRowStyles: {
        fillColor: [248, 250, 252] // Slate 50
      },
      
      // Column specific styling
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' }, // STT
        1: { cellWidth: 85, halign: 'left' },   // Product name
        2: { cellWidth: 15, halign: 'center' }, // Quantity
        3: { cellWidth: 25, halign: 'right' },  // Unit price
        4: { cellWidth: 25, halign: 'right' },  // Line total
        5: { cellWidth: 20, halign: 'right' }   // Discount
      },
      
      // Body cell styling
      bodyStyles: {
        valign: 'middle'
      }
    })

    // Get table end position
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = (pdf as any).lastAutoTable.finalY + 15
    
    // ═══════════════════════════════════════════════════════════════
    // FINANCIAL SUMMARY - TỔNG KẾT TÀI CHÍNH
    // ═══════════════════════════════════════════════════════════════
    
    const summaryX = margin + contentWidth - 85
    const summaryWidth = 80
    
    // Summary box với gradient
    pdf.setFillColor(254, 249, 195) // Yellow 100
    pdf.rect(summaryX, currentY, summaryWidth, 65, 'F')
    pdf.setDrawColor(245, 158, 11) // Amber 500
    pdf.setLineWidth(1)
    pdf.rect(summaryX, currentY, summaryWidth, 65, 'S')
    
    // Summary header
    pdf.setFillColor(245, 158, 11) // Amber 500
    pdf.rect(summaryX, currentY, summaryWidth, 12, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('💰 TỔNG KẾT', summaryX + summaryWidth/2, currentY + 8, { align: 'center' })
    
    // Summary items
    pdf.setTextColor(15, 23, 42) // Slate 900
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    
    let summaryY = currentY + 20
    const summaryItems = [
      { label: 'Tạm tính:', value: formatPrice(subtotal), bold: false },
      ...(totalDiscount > 0 ? [{ label: 'Giảm giá:', value: `-${formatPrice(totalDiscount)}`, bold: false, color: [239, 68, 68] as [number, number, number] }] : []),
      ...(header.vat_rate > 0 ? [{ label: `VAT (${header.vat_rate}%):`, value: formatPrice(vatAmount), bold: false }] : []),
    ]
    
    summaryItems.forEach((item) => {
      if (item.color) pdf.setTextColor(item.color[0], item.color[1], item.color[2])
      else pdf.setTextColor(15, 23, 42)
      
      pdf.text(item.label, summaryX + 5, summaryY)
      pdf.text(item.value, summaryX + summaryWidth - 5, summaryY, { align: 'right' })
      summaryY += 6
    })
    
    // Separator line
    pdf.setDrawColor(156, 163, 175) // Gray 400
    pdf.line(summaryX + 5, summaryY + 2, summaryX + summaryWidth - 5, summaryY + 2)
    summaryY += 8
    
    // Total
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(239, 68, 68) // Red 500
    pdf.text('TỔNG CỘNG:', summaryX + 5, summaryY)
    pdf.text(formatPrice(grandTotal), summaryX + summaryWidth - 5, summaryY, { align: 'right' })
    summaryY += 10
    
    // Payment info
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(59, 130, 246) // Blue 500
    pdf.text('Đã thanh toán:', summaryX + 5, summaryY)
    pdf.text(formatPrice(header.customer_paid), summaryX + summaryWidth - 5, summaryY, { align: 'right' })
    summaryY += 6
    
    if (remainingAmount > 0) {
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(239, 68, 68) // Red 500
      pdf.text('Còn lại:', summaryX + 5, summaryY)
      pdf.text(formatPrice(remainingAmount), summaryX + summaryWidth - 5, summaryY, { align: 'right' })
    }
    
    // ═══════════════════════════════════════════════════════════════
    // NOTES SECTION
    // ═══════════════════════════════════════════════════════════════
    
    if (header.notes) {
      currentY += 75
      
      pdf.setFillColor(254, 252, 232) // Yellow 50
      pdf.rect(margin, currentY, contentWidth, 20, 'F')
      pdf.setDrawColor(250, 204, 21) // Yellow 400
      pdf.rect(margin, currentY, contentWidth, 20, 'S')
      
      pdf.setTextColor(161, 98, 7) // Yellow 800
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text('📝 GHI CHÚ:', margin + 5, currentY + 8)
      
      pdf.setTextColor(15, 23, 42) // Slate 900
      pdf.setFont('helvetica', 'normal')
      pdf.text(header.notes, margin + 5, currentY + 15)
      
      currentY += 25
    } else {
      currentY += 75
    }
    
    // ═══════════════════════════════════════════════════════════════
    // SIGNATURE SECTION - CHÂN KÝ CHUẨN VIỆT NAM
    // ═══════════════════════════════════════════════════════════════
    
    currentY = Math.max(currentY, pageHeight - 60) // Ensure signatures are at bottom
    
    pdf.setTextColor(15, 23, 42) // Slate 900
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    
    // Three signature columns với spacing chuyên nghiệp
    const sig1X = margin + 25
    const sig2X = pageWidth / 2
    const sig3X = pageWidth - margin - 25
    
    pdf.text('KHÁCH HÀNG', sig1X, currentY, { align: 'center' })
    pdf.text('NGƯỜI BÁN HÀNG', sig2X, currentY, { align: 'center' })
    pdf.text('THỦ TRƯỞNG ĐƠN VỊ', sig3X, currentY, { align: 'center' })
    
    // Professional signature lines
    const lineY = currentY + 25
    pdf.setDrawColor(15, 23, 42) // Slate 900
    pdf.setLineWidth(0.5)
    pdf.line(sig1X - 30, lineY, sig1X + 30, lineY)
    pdf.line(sig2X - 30, lineY, sig2X + 30, lineY)
    pdf.line(sig3X - 30, lineY, sig3X + 30, lineY)
    
    // Signature instructions
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(100, 116, 139) // Slate 500
    pdf.text('(Ký và ghi rõ họ tên)', sig1X, lineY + 8, { align: 'center' })
    pdf.text('(Ký và ghi rõ họ tên)', sig2X, lineY + 8, { align: 'center' })
    pdf.text('(Ký và ghi rõ họ tên)', sig3X, lineY + 8, { align: 'center' })
    
    // ═══════════════════════════════════════════════════════════════
    // FOOTER - CHUYÊN NGHIỆP
    // ═══════════════════════════════════════════════════════════════
    
    pdf.setFontSize(8)
    pdf.setTextColor(100, 116, 139) // Slate 500
    pdf.text('Hóa đơn được tạo tự động từ hệ thống quản lý Xuân Thùy Veterinary', pageWidth / 2, lineY + 20, { align: 'center' })
    pdf.text('🌟 Uy tín - Chất lượng - Chuyên nghiệp - Phục vụ tận tâm 🌟', pageWidth / 2, lineY + 26, { align: 'center' })
    
    return pdf.output('blob')
    
  } catch (error) {
    console.error('Professional PDF generation error:', error)
    throw new Error('Không thể tạo PDF chuyên nghiệp')
  }
}
