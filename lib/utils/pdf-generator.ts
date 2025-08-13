import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { formatPrice, formatDate } from '@/lib/utils/invoice'
import { VIETNAMESE_PDF_CONFIG, setupVietnamesePDF, normalizeVietnameseText } from './vietnamese-pdf-config'

export async function generateInvoicePDFFromHTML(element: HTMLElement): Promise<Blob> {
  try {
    // Create canvas from HTML element
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    })
    
    // Create PDF with Vietnamese support
    const pdf = new jsPDF('p', 'mm', 'a4')
    setupVietnamesePDF(pdf)
    
    const imgWidth = 210 // A4 width in mm
    const pageHeight = 295 // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    
    let position = 0
    
    // Add image to PDF
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    
    // Add more pages if needed
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }
    
    return pdf.output('blob')
  } catch (error) {
    console.error('PDF generation error:', error)
    throw new Error('Failed to generate PDF')
  }
}

export function generateInvoicePDFDirectly(invoiceData: InvoiceFullData): Blob {
  try {
    const { header, details, customer } = invoiceData
    
    // Calculate totals
    const subtotal = details.reduce((sum, item) => sum + item.line_total, 0)
    const totalDiscount = details.reduce((sum, item) => sum + (item.discount_amount || 0), 0)
    const vatAmount = (subtotal - totalDiscount) * (header.vat_rate / 100)
    const grandTotal = subtotal - totalDiscount + vatAmount
    const remainingAmount = grandTotal - header.customer_paid

    // Tạo PDF với cấu hình tiếng Việt chuyên nghiệp
    const pdf = new jsPDF('p', 'mm', 'a4')
    setupVietnamesePDF(pdf)
    
    let yPosition = 15
    const { margin, pageWidth } = VIETNAMESE_PDF_CONFIG.layout
    const leftMargin = margin
    
    // Company Header - Thiết kế chuyên nghiệp
    pdf.setFillColor(...VIETNAMESE_PDF_CONFIG.colors.primary)
    pdf.rect(leftMargin, yPosition, pageWidth, 28, 'F')
    
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(20)
    pdf.setFont('times', 'bold')
    pdf.text('XUAN THUY VETERINARY PHARMACY', 105, yPosition + 8, { align: 'center' })
    
    pdf.setFontSize(10)
    pdf.setFont('times', 'normal')
    pdf.text('Dia chi: So 123, Duong ABC, Phuong XYZ, TP.HCM | DT: (028) 1234.5678', 105, yPosition + 15, { align: 'center' })
    pdf.text('Email: info@xuanthuy.com | MST: 0123456789 | Website: www.xuanthuy.com', 105, yPosition + 20, { align: 'center' })
    
    yPosition += 35
    
    // Invoice Title - Font Times chuẩn
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.secondary)
    pdf.setFontSize(22)
    pdf.setFont('times', 'bold')
    pdf.text('HOA DON BAN HANG', 105, yPosition, { align: 'center' })
    
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.textLight)
    pdf.setFontSize(11)
    pdf.setFont('times', 'normal')
    pdf.text('SALES INVOICE', 105, yPosition + 7, { align: 'center' })
    
    yPosition += 20
    
    // Invoice và Customer Info Boxes
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.text)
    
    // Invoice Info Box
    pdf.setFillColor(219, 234, 254)
    pdf.rect(leftMargin, yPosition, 90, 38, 'F')
    pdf.setDrawColor(59, 130, 246)
    pdf.rect(leftMargin, yPosition, 90, 38, 'S')
    
    pdf.setFontSize(12)
    pdf.setFont('times', 'bold')
    pdf.setTextColor(30, 64, 175)
    pdf.text('THONG TIN HOA DON', leftMargin + 5, yPosition + 8)
    
    pdf.setFontSize(10)
    pdf.setFont('times', 'normal')
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.text)
    
    // Sử dụng normalizeVietnameseText để đảm bảo hiển thị đúng
    pdf.text(normalizeVietnameseText(`So hoa don: ${header.invoice_code}`), leftMargin + 5, yPosition + 16)
    pdf.text(normalizeVietnameseText(`Ngay lap: ${formatDate(header.invoice_date)}`), leftMargin + 5, yPosition + 22)
    pdf.text(normalizeVietnameseText(`Chi nhanh: Chi nhanh ${header.branch_id}`), leftMargin + 5, yPosition + 28)
    
    const statusText = header.status === 'completed' ? 'Hoan thanh' : 'Dang xu ly'
    pdf.text(normalizeVietnameseText(`Trang thai: ${statusText}`), leftMargin + 5, yPosition + 34)
    
    // Customer Info Box
    pdf.setFillColor(220, 252, 231)
    pdf.rect(leftMargin + 100, yPosition, 90, 38, 'F')
    pdf.setDrawColor(...VIETNAMESE_PDF_CONFIG.colors.success)
    pdf.rect(leftMargin + 100, yPosition, 90, 38, 'S')
    
    pdf.setFontSize(12)
    pdf.setFont('times', 'bold')
    pdf.setTextColor(22, 101, 52)
    pdf.text('KHACH HANG', leftMargin + 105, yPosition + 8)
    
    pdf.setFontSize(10)
    pdf.setFont('times', 'normal')
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.text)
    
    const customerName = customer?.customer_name || 'Khach le'
    pdf.text(normalizeVietnameseText(`Ten: ${customerName}`), leftMargin + 105, yPosition + 16)
    pdf.text(normalizeVietnameseText(`Ma KH: ${customer?.customer_code || 'N/A'}`), leftMargin + 105, yPosition + 22)
    if (customer?.phone) {
      pdf.text(normalizeVietnameseText(`DT: ${customer.phone}`), leftMargin + 105, yPosition + 28)
    }
    if (customer?.address) {
      const address = customer.address.length > 30 ? customer.address.substring(0, 30) + '...' : customer.address
      pdf.text(normalizeVietnameseText(`Dia chi: ${address}`), leftMargin + 105, yPosition + 34)
    }
    
    yPosition += 48
    
    // Bảng sản phẩm với AutoTable - Font Times chuẩn
    const tableData = details.map((item, index) => [
      (index + 1).toString(),
      normalizeVietnameseText(item.product_name),
      item.quantity.toString(),
      formatPrice(item.unit_price),
      formatPrice(item.line_total),
      item.discount_amount > 0 ? formatPrice(item.discount_amount) : '-'
    ])

    // Use autoTable với font Times
    autoTable(pdf, {
      startY: yPosition,
      head: [['STT', 'TEN HANG HOA', 'SL', 'DON GIA', 'THANH TIEN', 'GIAM GIA']],
      body: tableData,
      margin: { left: leftMargin, right: leftMargin },
      styles: {
        font: 'times', // Font Times - không nghiêng
        fontSize: 9,
        cellPadding: 3,
        textColor: VIETNAMESE_PDF_CONFIG.colors.text,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        fontStyle: 'normal' // Đảm bảo không nghiêng
      },
      headStyles: {
        fillColor: VIETNAMESE_PDF_CONFIG.colors.primary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        font: 'times'
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251]
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 35, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' }
      }
    })

    // Get final Y position after table

    yPosition = (pdf as any).lastAutoTable.finalY + 10
    
    // Financial Summary Box
    const summaryBoxWidth = 75
    const summaryBoxX = leftMargin + pageWidth - summaryBoxWidth
    
    pdf.setFillColor(254, 243, 199)
    pdf.rect(summaryBoxX, yPosition, summaryBoxWidth, 50, 'F')
    pdf.setDrawColor(...VIETNAMESE_PDF_CONFIG.colors.warning)
    pdf.rect(summaryBoxX, yPosition, summaryBoxWidth, 50, 'S')
    
    // Summary header
    pdf.setFillColor(...VIETNAMESE_PDF_CONFIG.colors.warning)
    pdf.rect(summaryBoxX, yPosition, summaryBoxWidth, 10, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(11)
    pdf.setFont('times', 'bold')
    pdf.text('TONG KET', summaryBoxX + summaryBoxWidth/2, yPosition + 6, { align: 'center' })
    
    // Summary content - Font Times chuẩn
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.text)
    pdf.setFontSize(9)
    pdf.setFont('times', 'normal')
    let summaryY = yPosition + 15
    
    pdf.text('Tam tinh:', summaryBoxX + 5, summaryY)
    pdf.text(formatPrice(subtotal), summaryBoxX + summaryBoxWidth - 5, summaryY, { align: 'right' })
    summaryY += 6
    
    if (totalDiscount > 0) {
      pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.secondary)
      pdf.text('Giam gia:', summaryBoxX + 5, summaryY)
      pdf.text(`-${formatPrice(totalDiscount)}`, summaryBoxX + summaryBoxWidth - 5, summaryY, { align: 'right' })
      pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.text)
      summaryY += 6
    }
    
    if (header.vat_rate > 0) {
      pdf.text(`VAT (${header.vat_rate}%):`, summaryBoxX + 5, summaryY)
      pdf.text(formatPrice(vatAmount), summaryBoxX + summaryBoxWidth - 5, summaryY, { align: 'right' })
      summaryY += 6
    }
    
    // Total line
    pdf.setDrawColor(156, 163, 175)
    pdf.line(summaryBoxX + 5, summaryY, summaryBoxX + summaryBoxWidth - 5, summaryY)
    summaryY += 5
    
    pdf.setFontSize(11)
    pdf.setFont('times', 'bold')
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.secondary)
    pdf.text('TONG CONG:', summaryBoxX + 5, summaryY)
    pdf.text(formatPrice(grandTotal), summaryBoxX + summaryBoxWidth - 5, summaryY, { align: 'right' })
    summaryY += 8
    
    pdf.setFontSize(9)
    pdf.setFont('times', 'normal')
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.primary)
    pdf.text('Da thanh toan:', summaryBoxX + 5, summaryY)
    pdf.text(formatPrice(header.customer_paid), summaryBoxX + summaryBoxWidth - 5, summaryY, { align: 'right' })
    summaryY += 6
    
    if (remainingAmount > 0) {
      pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.secondary)
      pdf.setFont('times', 'bold')
      pdf.text('Con lai:', summaryBoxX + 5, summaryY)
      pdf.text(formatPrice(remainingAmount), summaryBoxX + summaryBoxWidth - 5, summaryY, { align: 'right' })
    }
    
    // Notes section
    if (header.notes) {
      yPosition += 60
      pdf.setFillColor(254, 252, 232)
      pdf.rect(leftMargin, yPosition, pageWidth, 18, 'F')
      pdf.setDrawColor(250, 204, 21)
      pdf.rect(leftMargin, yPosition, pageWidth, 18, 'S')
      
      pdf.setTextColor(161, 98, 7)
      pdf.setFontSize(10)
      pdf.setFont('times', 'bold')
      pdf.text('GHI CHU:', leftMargin + 5, yPosition + 8)
      
      pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.text)
      pdf.setFont('times', 'normal')
      pdf.text(normalizeVietnameseText(header.notes), leftMargin + 5, yPosition + 14)
      
      yPosition += 25
    } else {
      yPosition += 60
    }
    
    // Signatures - Font Times chuẩn
    yPosition = Math.max(yPosition, 240)
    
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.text)
    pdf.setFontSize(10)
    pdf.setFont('times', 'bold')
    
    // Three signature columns
    const col1X = leftMargin + 20
    const col2X = leftMargin + 80
    const col3X = leftMargin + 140
    
    pdf.text('KHACH HANG', col1X, yPosition, { align: 'center' })
    pdf.text('NGUOI BAN HANG', col2X, yPosition, { align: 'center' })
    pdf.text('THU TRUONG DON VI', col3X, yPosition, { align: 'center' })
    
    // Signature lines
    const lineY = yPosition + 25
    pdf.setDrawColor(...VIETNAMESE_PDF_CONFIG.colors.text)
    pdf.line(col1X - 20, lineY, col1X + 20, lineY)
    pdf.line(col2X - 20, lineY, col2X + 20, lineY)
    pdf.line(col3X - 20, lineY, col3X + 20, lineY)
    
    pdf.setFontSize(8)
    pdf.setFont('times', 'normal')
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.textLight)
    pdf.text('(Ky va ghi ro ho ten)', col1X, lineY + 6, { align: 'center' })
    pdf.text('(Ky va ghi ro ho ten)', col2X, lineY + 6, { align: 'center' })
    pdf.text('(Ky va ghi ro ho ten)', col3X, lineY + 6, { align: 'center' })
    
    // Footer
    pdf.setFontSize(8)
    pdf.setTextColor(...VIETNAMESE_PDF_CONFIG.colors.textLight)
    pdf.text('Hoa don duoc tao tu dong tu he thong Xuan Thuy Veterinary', 105, lineY + 18, { align: 'center' })
    pdf.text('Uy tin - Chat luong - Chuyen nghiep', 105, lineY + 24, { align: 'center' })
    
    return pdf.output('blob')
  } catch (error) {
    console.error('PDF generation error:', error)
    throw new Error('Failed to generate PDF')
  }
}
