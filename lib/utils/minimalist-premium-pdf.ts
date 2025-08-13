import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface MinimalistPDFData {
  header: any
  details: any[]
  customer: any
}

export function generateMinimalistPremiumPDF(invoiceData: MinimalistPDFData): Blob {
  const { header, details, customer } = invoiceData
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  // MINIMALIST COLOR PALETTE
  const minimal = {
    black: '#000000',
    darkGray: '#374151',      // Gray 700
    mediumGray: '#6b7280',    // Gray 500
    lightGray: '#d1d5db',     // Gray 300
    veryLightGray: '#f9fafb', // Gray 50
    white: '#ffffff',
    accent: '#3b82f6'         // Blue 500
  }

  // CLEAN HEADER - MINIMALIST APPROACH
  // Simple line at top
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(2)
  doc.line(15, 15, 195, 15)

  // Company name - Clean typography
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'normal') // Not bold for minimalist feel
  doc.text('XUÂN THÙY', 15, 28)
  
  doc.setFontSize(12)
  doc.setTextColor(107, 114, 128) // Gray 500
  doc.text('VETERINARY PHARMACY', 15, 35)

  // Contact info - Right aligned, minimal
  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  doc.text('123 Đường ABC, TP.HCM', 195, 25, { align: 'right' })
  doc.text('(028) 1234.5678', 195, 30, { align: 'right' })
  doc.text('info@xuanthuy.com', 195, 35, { align: 'right' })

  // Subtle separator line
  doc.setDrawColor(209, 213, 219) // Gray 300
  doc.setLineWidth(0.5)
  doc.line(15, 45, 195, 45)

  let yPos = 60

  // INVOICE TITLE - MINIMALIST
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'normal')
  doc.text('HÓA ĐƠN', 15, yPos)
  
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text('SALES INVOICE', 15, yPos + 6)

  // Invoice number - Right side
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text(header.invoice_code, 195, yPos, { align: 'right' })
  
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  doc.text(new Date(header.invoice_date).toLocaleDateString('vi-VN'), 195, yPos + 6, { align: 'right' })

  yPos += 25

  // CLEAN INFORMATION LAYOUT
  // Customer info - Left column
  doc.setTextColor(107, 114, 128)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('BÁN CHO:', 15, yPos)

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  const customerName = customer?.customer_name || 'Khách lẻ'
  doc.text(customerName, 15, yPos + 8)

  doc.setTextColor(107, 114, 128)
  doc.setFontSize(9)
  if (customer?.address) {
    doc.text(customer.address, 15, yPos + 15)
  }
  if (customer?.phone) {
    doc.text(customer.phone, 15, yPos + 22)
  }

  // Invoice details - Right column
  doc.setTextColor(107, 114, 128)
  doc.setFontSize(9)
  doc.text('CHI TIẾT:', 120, yPos)

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(9)
  doc.text(`Chi nhánh: ${header.branch_id}`, 120, yPos + 8)
  doc.text(`Nhân viên: ${header.staff_name || 'Admin'}`, 120, yPos + 15)
  doc.text(`Trạng thái: ${header.status || 'Hoàn thành'}`, 120, yPos + 22)

  yPos += 40

  // MINIMALIST TABLE
  const tableColumn = ['', 'SẢN PHẨM', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN']
  const tableRows: any[][] = []

  details.forEach((item, index) => {
    const row = [
      (index + 1).toString(),
      item.product_name || `Sản phẩm ${item.product_id}`,
      item.quantity?.toString() || '1',
      new Intl.NumberFormat('vi-VN').format(item.unit_price || 0),
      new Intl.NumberFormat('vi-VN').format((item.unit_price || 0) * (item.quantity || 1))
    ]
    tableRows.push(row)
  })

  // CLEAN TABLE DESIGN
  autoTable(doc, {
    startY: yPos,
    head: [tableColumn],
    body: tableRows,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      cellPadding: { top: 4, bottom: 4, left: 0, right: 0 },
      lineColor: [209, 213, 219], // Gray 300
      lineWidth: 0.25
    },
    headStyles: {
      fillColor: [249, 250, 251], // Gray 50
      textColor: [107, 114, 128], // Gray 500
      fontSize: 9,
      fontStyle: 'normal',
      cellPadding: { top: 6, bottom: 6, left: 0, right: 0 }
    },
    bodyStyles: {
      fillColor: [255, 255, 255]
    },
    columnStyles: {
      0: { halign: 'right', cellWidth: 15 },
      1: { cellWidth: 80 },
      2: { halign: 'center', cellWidth: 25 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 35 }
    },
    didDrawPage: function(_data: any) {
      // Add subtle lines only
      doc.setDrawColor(209, 213, 219)
      doc.setLineWidth(0.25)
    }
  })

  // MINIMALIST TOTALS
  const subtotal = details.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0)
  const vat = subtotal * 0.1
  const total = subtotal + vat

  const finalY = (doc as any).lastAutoTable.finalY + 15

  // Simple totals section
  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.25)
  doc.line(120, finalY, 195, finalY)

  doc.setTextColor(107, 114, 128)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Tạm tính', 125, finalY + 8)
  doc.text('VAT (10%)', 125, finalY + 15)

  doc.setTextColor(0, 0, 0)
  doc.text(`${new Intl.NumberFormat('vi-VN').format(subtotal)}`, 190, finalY + 8, { align: 'right' })
  doc.text(`${new Intl.NumberFormat('vi-VN').format(vat)}`, 190, finalY + 15, { align: 'right' })

  // Total line
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(120, finalY + 20, 195, finalY + 20)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('TỔNG CỘNG', 125, finalY + 28)
  doc.text(`${new Intl.NumberFormat('vi-VN').format(total)}`, 190, finalY + 28, { align: 'right' })

  // Currency
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  doc.text('VNĐ', 192, finalY + 28)

  // MINIMAL SIGNATURE SECTION
  const sigY = finalY + 50

  // Simple signature boxes without borders
  doc.setTextColor(107, 114, 128)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')

  doc.text('NGƯỜI BÁN', 40, sigY, { align: 'center' })
  doc.text('KHÁCH HÀNG', 160, sigY, { align: 'center' })

  // Signature lines
  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.25)
  doc.line(15, sigY + 20, 65, sigY + 20)
  doc.line(135, sigY + 20, 185, sigY + 20)

  // MINIMAL FOOTER
  const footerY = 280

  // Simple bottom line
  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.25)
  doc.line(15, footerY, 195, footerY)

  doc.setTextColor(107, 114, 128)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('XUÂN THÙY VETERINARY PHARMACY', 105, footerY + 5, { align: 'center' })
  doc.text(`Ngày in: ${new Date().toLocaleDateString('vi-VN')}`, 105, footerY + 10, { align: 'center' })

  return new Blob([doc.output('blob')], { type: 'application/pdf' })
}
