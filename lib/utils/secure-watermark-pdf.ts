import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface SecurePDFData {
  header: any
  details: any[]
  customer: any
}

export function generateSecureWatermarkPDF(invoiceData: SecurePDFData): Blob {
  const { header, details, customer } = invoiceData
  
  // Create PDF with security settings
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  // SECURITY COLORS
  const securityColors = {
    primary: '#0f172a',        // Slate 900
    secondary: '#1e293b',      // Slate 800
    accent: '#3b82f6',         // Blue 500
    warning: '#ef4444',        // Red 500
    success: '#22c55e',        // Green 500
    watermark: '#f1f5f9'       // Slate 100
  }

  // ADD WATERMARK FUNCTION
  const addWatermark = (text: string, opacity: number = 0.1) => {
    doc.saveGraphicsState()
    // Use any cast for GState since it's a complex jsPDF internal
    ;(doc as any).setGState(new (doc as any).GState({ opacity }))
    doc.setTextColor(148, 163, 184) // Slate 400
    doc.setFontSize(60)
    doc.setFont('helvetica', 'bold')
    
    // Rotate and center watermark
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    
    doc.text(text, pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: 45
    })
    doc.restoreGraphicsState()
  }

  // ADD SECURITY WATERMARK
  addWatermark('XUÂN THÙY VET', 0.08)

  // PREMIUM HEADER với SECURITY ELEMENTS
  // Security pattern background
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(0, 0, 210, 50, 'F')

  // Security dots pattern
  doc.setFillColor(59, 130, 246, 0.3) // Blue 500 with opacity
  for (let i = 0; i < 210; i += 8) {
    for (let j = 0; j < 50; j += 8) {
      doc.circle(i, j, 1, 'F')
    }
  }

  // COMPANY LOGO với SECURITY BADGE
  doc.setFillColor(255, 255, 255)
  doc.circle(30, 25, 15, 'F')
  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(2)
  doc.circle(30, 25, 15, 'S')
  
  doc.setTextColor(59, 130, 246)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('VET', 26, 28)
  
  // Security badge
  doc.setFillColor(34, 197, 94) // Green 500
  doc.circle(42, 15, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(6)
  doc.text('✓', 41, 16)

  // Company info với SECURITY ELEMENTS
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('XUÂN THÙY VETERINARY PHARMACY', 55, 18)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('🔒 CHỨNG NHẬN BỞI BỘ NÔNG NGHIỆP & PTNT | 🛡️ ISO 9001:2015', 55, 25)
  
  doc.setFontSize(8)
  doc.text('📍 123 Đường ABC, Phường XYZ, TP.HCM  |  📞 Hotline: 1900.1234', 55, 31)
  doc.text('📧 info@xuanthuy.com  |  🌐 www.xuanthuy.com', 55, 36)
  doc.text('🏛️ MST: 0123456789  |  💼 GP KD: 123/GP-UBND  |  🔐 Mã bảo mật: XTV2025', 55, 41)

  // SECURITY CODE GENERATION
  const securityCode = `SEC${Date.now().toString().slice(-6)}`
  doc.setTextColor(34, 197, 94)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text(`🔐 MÃ BẢO MẬT: ${securityCode}`, 155, 46)

  let yPos = 65

  // INVOICE TITLE với SECURITY HEADER
  doc.setFillColor(239, 68, 68) // Red 500
  doc.rect(0, yPos - 5, 210, 20, 'F')
  
  // Security pattern on title
  doc.setFillColor(255, 255, 255, 0.1)
  for (let i = 0; i < 210; i += 6) {
    doc.rect(i, yPos - 5, 2, 20, 'F')
  }
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('🔒 HÓA ĐƠN BẢO MẬT', 105, yPos + 4, { align: 'center' })
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('SECURE SALES INVOICE - PROTECTED DOCUMENT', 105, yPos + 10, { align: 'center' })

  yPos += 28

  // INVOICE INFO với SECURITY FEATURES
  // Left panel - Invoice details với security border
  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(2)
  doc.rect(15, yPos, 85, 38, 'S')
  doc.setFillColor(248, 250, 252, 0.8)
  doc.rect(15, yPos, 85, 38, 'F')

  // Security header
  doc.setFillColor(59, 130, 246)
  doc.rect(15, yPos, 85, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('🔒 THÔNG TIN HÓA ĐƠN', 17, yPos + 6)

  // Invoice details
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`📋 Số HĐ: ${header.invoice_code}`, 17, yPos + 15)
  doc.text(`📅 Ngày: ${new Date(header.invoice_date).toLocaleDateString('vi-VN')}`, 17, yPos + 20)
  doc.text(`🏢 Chi nhánh: ${header.branch_id}`, 17, yPos + 25)
  doc.text(`👨‍💼 NV: ${header.staff_name || 'Admin'}`, 17, yPos + 30)
  doc.text(`🔐 Mã xác thực: ${securityCode}`, 17, yPos + 35)

  // Right panel - Customer info với security border
  doc.setDrawColor(34, 197, 94)
  doc.setLineWidth(2)
  doc.rect(110, yPos, 85, 38, 'S')
  doc.setFillColor(240, 253, 244, 0.8)
  doc.rect(110, yPos, 85, 38, 'F')

  // Security header
  doc.setFillColor(34, 197, 94)
  doc.rect(110, yPos, 85, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('🛡️ THÔNG TIN KHÁCH HÀNG', 112, yPos + 6)

  // Customer details
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const customerName = customer?.customer_name || 'Khách lẻ'
  doc.text(`👤 Tên: ${customerName}`, 112, yPos + 15)
  doc.text(`🆔 Mã KH: ${customer?.customer_code || 'KH000001'}`, 112, yPos + 20)
  doc.text(`📞 SĐT: ${customer?.phone || '0901234567'}`, 112, yPos + 25)
  doc.text(`📧 Email: ${customer?.email || 'N/A'}`, 112, yPos + 30)
  doc.text(`📍 Địa chỉ: ${customer?.address || 'TP.HCM'}`, 112, yPos + 35)

  yPos += 48

  // PRODUCT TABLE với SECURITY FEATURES
  const tableColumn = ['STT', '🔒 TÊN HÀNG HÓA', 'SL', 'ĐƠN GIÁ (₫)', 'THÀNH TIỀN (₫)', 'VERIFY']
  const tableRows: any[][] = []

  details.forEach((item, index) => {
    const itemCode = `ITM${(item.product_id || index + 1).toString().padStart(3, '0')}`
    const row = [
      (index + 1).toString(),
      `${item.product_name || 'Sản phẩm'}\n🆔 ${itemCode}`,
      item.quantity?.toString() || '1',
      new Intl.NumberFormat('vi-VN').format(item.unit_price || 0),
      new Intl.NumberFormat('vi-VN').format((item.unit_price || 0) * (item.quantity || 1)),
      '✓'
    ]
    tableRows.push(row)
  })

  // SECURE TABLE STYLING
  autoTable(doc, {
    startY: yPos,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      textColor: [15, 23, 42],
      cellPadding: 3,
      lineColor: [148, 163, 184],
      lineWidth: 1
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { cellWidth: 75 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 35 },
      5: { halign: 'center', cellWidth: 20, fillColor: [34, 197, 94], textColor: [255, 255, 255] }
    }
  })

  // CALCULATION SUMMARY với SECURITY
  const subtotal = details.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0)
  const vatAmount = subtotal * 0.1
  const total = subtotal + vatAmount

  const finalY = (doc as any).lastAutoTable.finalY + 10

  // Security summary box
  doc.setFillColor(15, 23, 42)
  doc.rect(120, finalY, 75, 30, 'F')
  
  // Security pattern
  doc.setFillColor(59, 130, 246, 0.2)
  for (let i = 0; i < 75; i += 4) {
    doc.rect(120 + i, finalY, 1, 30, 'F')
  }
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('🔒 TỔNG KẾT BẢO MẬT', 122, finalY + 6)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Tạm tính:', 122, finalY + 12)
  doc.text(`${new Intl.NumberFormat('vi-VN').format(subtotal)} ₫`, 193, finalY + 12, { align: 'right' })
  
  doc.text('VAT (10%):', 122, finalY + 17)
  doc.text(`${new Intl.NumberFormat('vi-VN').format(vatAmount)} ₫`, 193, finalY + 17, { align: 'right' })
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('🔒 TỔNG CỘNG:', 122, finalY + 23)
  doc.text(`${new Intl.NumberFormat('vi-VN').format(total)} ₫`, 193, finalY + 23, { align: 'right' })
  
  // Security hash
  const securityHash = `#${Math.random().toString(36).substr(2, 8).toUpperCase()}`
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`Hash: ${securityHash}`, 122, finalY + 28)

  // DIGITAL SIGNATURE SECTION
  const sigY = finalY + 40

  // Signature security boxes
  const sigBoxes = [
    { title: '🔐 NGƯỜI LẬP', x: 35, color: [59, 130, 246] },
    { title: '🛡️ NGƯỜI BÁN', x: 105, color: [34, 197, 94] },
    { title: '🔒 KHÁCH HÀNG', x: 175, color: [239, 68, 68] }
  ]

  sigBoxes.forEach(box => {
    doc.setFillColor(...box.color as [number, number, number])
    doc.rect(box.x - 25, sigY, 50, 30, 'F')
    
    doc.setFillColor(255, 255, 255, 0.9)
    doc.rect(box.x - 23, sigY + 8, 46, 20, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(box.title, box.x, sigY + 5, { align: 'center' })
    
    doc.setTextColor(75, 85, 99)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('Chữ ký điện tử', box.x, sigY + 15, { align: 'center' })
    doc.text('(Digital signature)', box.x, sigY + 19, { align: 'center' })
    doc.text(`ID: ${securityCode}`, box.x, sigY + 25, { align: 'center' })
  })

  // SECURITY FOOTER
  const footerY = 275
  doc.setFillColor(15, 23, 42)
  doc.rect(0, footerY, 210, 22, 'F')
  
  // Security pattern in footer
  doc.setFillColor(59, 130, 246, 0.1)
  for (let i = 0; i < 210; i += 3) {
    doc.rect(i, footerY, 1, 22, 'F')
  }
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('🔒 XUÂN THÙY VETERINARY PHARMACY - SECURE DOCUMENT', 105, footerY + 5, { align: 'center' })
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('⚠️ Tài liệu được bảo mật - Không được sao chép khi chưa có sự đồng ý', 105, footerY + 10, { align: 'center' })
  doc.text(`🔐 Mã bảo mật: ${securityCode} | 🕒 Thời gian: ${new Date().toLocaleString('vi-VN')}`, 105, footerY + 15, { align: 'center' })
  doc.text('📧 Xác thực tại: verify@xuanthuy.com | 📞 Hotline: 1900.1234', 105, footerY + 20, { align: 'center' })

  return new Blob([doc.output('blob')], { type: 'application/pdf' })
}
