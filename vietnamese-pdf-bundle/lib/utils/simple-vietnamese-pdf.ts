import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

// Phiên bản đơn giản để khắc phục font nghiêng
export function generateSimpleVietnamesePDF(invoiceData: InvoiceFullData): Blob {
  try {
    const { header, details, customer } = invoiceData
    
    // Calculate totals
    const subtotal = details.reduce((sum, item) => sum + item.line_total, 0)
    const totalDiscount = details.reduce((sum, item) => sum + (item.discount_amount || 0), 0)
    const vatAmount = (subtotal - totalDiscount) * (header.vat_rate / 100)
    const grandTotal = subtotal - totalDiscount + vatAmount
    const remainingAmount = grandTotal - header.customer_paid

    // Tạo PDF với font Times Roman (chuẩn nhất cho tiếng Việt)
    const pdf = new jsPDF('p', 'mm', 'a4')
    
    // Thiết lập font Times Roman chuẩn
    pdf.setFont('times', 'normal')
    
    let yPosition = 20
    const leftMargin = 15
    // const pageWidth = 180 // Commented out as not used
    
    // Company Header - Đơn giản nhưng chuyên nghiệp
    pdf.setFontSize(18)
    pdf.setFont('times', 'bold')
    pdf.text('XUAN THUY VETERINARY PHARMACY', 105, yPosition, { align: 'center' })
    yPosition += 8
    
    pdf.setFontSize(10)
    pdf.setFont('times', 'normal')
    pdf.text('Dia chi: So 123, Duong ABC, Phuong XYZ, TP.HCM', 105, yPosition, { align: 'center' })
    yPosition += 5
    pdf.text('Dien thoai: (028) 1234.5678 | MST: 0123456789', 105, yPosition, { align: 'center' })
    yPosition += 15
    
    // Invoice Title
    pdf.setFontSize(16)
    pdf.setFont('times', 'bold')
    pdf.text('HOA DON BAN HANG', 105, yPosition, { align: 'center' })
    yPosition += 10
    
    pdf.setFontSize(10)
    pdf.setFont('times', 'normal')
    pdf.text('SALES INVOICE', 105, yPosition, { align: 'center' })
    yPosition += 15
    
    // Invoice Info - 2 cột
    pdf.setFont('times', 'bold')
    pdf.text('THONG TIN HOA DON', leftMargin, yPosition)
    pdf.text('THONG TIN KHACH HANG', leftMargin + 100, yPosition)
    yPosition += 8
    
    pdf.setFont('times', 'normal')
    // Cột trái - Invoice info
    pdf.text(`So hoa don: ${header.invoice_code}`, leftMargin, yPosition)
    pdf.text(`Ngay lap: ${formatDate(header.invoice_date)}`, leftMargin, yPosition + 5)
    pdf.text(`Chi nhanh: Chi nhanh ${header.branch_id}`, leftMargin, yPosition + 10)
    const statusText = header.status === 'completed' ? 'Hoan thanh' : 'Dang xu ly'
    pdf.text(`Trang thai: ${statusText}`, leftMargin, yPosition + 15)
    
    // Cột phải - Customer info
    const customerName = customer?.customer_name || 'Khach le'
    pdf.text(`Ten KH: ${customerName}`, leftMargin + 100, yPosition)
    pdf.text(`Ma KH: ${customer?.customer_code || 'N/A'}`, leftMargin + 100, yPosition + 5)
    if (customer?.phone) {
      pdf.text(`Dien thoai: ${customer.phone}`, leftMargin + 100, yPosition + 10)
    }
    if (customer?.address && customer.address.length > 0) {
      const address = customer.address.length > 40 ? customer.address.substring(0, 40) + '...' : customer.address
      pdf.text(`Dia chi: ${address}`, leftMargin + 100, yPosition + 15)
    }
    
    yPosition += 25
    
    // Bảng sản phẩm với AutoTable - Font Times
    const tableData = details.map((item, index) => [
      (index + 1).toString(),
      item.product_name,
      item.quantity.toString(),
      formatPrice(item.unit_price),
      formatPrice(item.line_total),
      item.discount_amount > 0 ? formatPrice(item.discount_amount) : '-'
    ])

    autoTable(pdf, {
      startY: yPosition,
      head: [['STT', 'TEN HANG HOA', 'SL', 'DON GIA', 'THANH TIEN', 'GIAM GIA']],
      body: tableData,
      margin: { left: leftMargin, right: leftMargin },
      styles: {
        font: 'times',
        fontSize: 9,
        cellPadding: 2,
        textColor: [0, 0, 0],
        fontStyle: 'normal' // Đảm bảo không nghiêng
      },
      headStyles: {
        fillColor: [41, 98, 255],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        font: 'times'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 80 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' }
      }
    })

    // Get table end position

    yPosition = (pdf as any).lastAutoTable.finalY + 15
    
    // Tổng kết tài chính - Bên phải
    const summaryX = leftMargin + 120
    pdf.setFont('times', 'bold')
    pdf.text('TONG KET:', summaryX, yPosition)
    yPosition += 8
    
    pdf.setFont('times', 'normal')
    pdf.text(`Tam tinh: ${formatPrice(subtotal)}`, summaryX, yPosition)
    yPosition += 5
    
    if (totalDiscount > 0) {
      pdf.text(`Giam gia: -${formatPrice(totalDiscount)}`, summaryX, yPosition)
      yPosition += 5
    }
    
    if (header.vat_rate > 0) {
      pdf.text(`VAT (${header.vat_rate}%): ${formatPrice(vatAmount)}`, summaryX, yPosition)
      yPosition += 5
    }
    
    // Đường kẻ
    pdf.line(summaryX, yPosition, summaryX + 60, yPosition)
    yPosition += 5
    
    pdf.setFont('times', 'bold')
    pdf.text(`TONG CONG: ${formatPrice(grandTotal)}`, summaryX, yPosition)
    yPosition += 8
    
    pdf.setFont('times', 'normal')
    pdf.text(`Da thanh toan: ${formatPrice(header.customer_paid)}`, summaryX, yPosition)
    yPosition += 5
    
    if (remainingAmount > 0) {
      pdf.setFont('times', 'bold')
      pdf.text(`Con lai: ${formatPrice(remainingAmount)}`, summaryX, yPosition)
    }
    
    // Ghi chú
    if (header.notes) {
      yPosition += 15
      pdf.setFont('times', 'bold')
      pdf.text('GHI CHU:', leftMargin, yPosition)
      yPosition += 5
      pdf.setFont('times', 'normal')
      pdf.text(header.notes, leftMargin, yPosition)
      yPosition += 10
    }
    
    // Chân ký
    yPosition = Math.max(yPosition + 15, 250)
    
    pdf.setFont('times', 'bold')
    pdf.text('KHACH HANG', leftMargin + 20, yPosition, { align: 'center' })
    pdf.text('NGUOI BAN HANG', leftMargin + 80, yPosition, { align: 'center' })
    pdf.text('THU TRUONG', leftMargin + 140, yPosition, { align: 'center' })
    
    // Đường ký
    const lineY = yPosition + 20
    pdf.line(leftMargin, lineY, leftMargin + 40, lineY)
    pdf.line(leftMargin + 60, lineY, leftMargin + 100, lineY)
    pdf.line(leftMargin + 120, lineY, leftMargin + 160, lineY)
    
    pdf.setFont('times', 'normal')
    pdf.setFontSize(8)
    pdf.text('(Ky va ghi ro ho ten)', leftMargin + 20, lineY + 6, { align: 'center' })
    pdf.text('(Ky va ghi ro ho ten)', leftMargin + 80, lineY + 6, { align: 'center' })
    pdf.text('(Ky va ghi ro ho ten)', leftMargin + 140, lineY + 6, { align: 'center' })
    
    // Footer
    pdf.setFontSize(8)
    pdf.text('Hoa don duoc tao tu dong tu he thong', 105, lineY + 15, { align: 'center' })
    
    return pdf.output('blob')
  } catch (error) {
    console.error('Simple PDF generation error:', error)
    throw new Error('Failed to generate simple PDF')
  }
}
