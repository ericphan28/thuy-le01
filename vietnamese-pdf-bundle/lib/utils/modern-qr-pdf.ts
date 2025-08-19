import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'

interface ModernQRPDFData {
  header: any
  details: any[]
  customer: any
}

export async function generateModernQRPDF(invoiceData: ModernQRPDFData): Promise<Blob> {
  const { header, details, customer } = invoiceData
  
  // Create PDF with premium settings
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  // MODERN COLOR PALETTE
  const colors = {
    primary: '#1e40af',      // Blue 700
    secondary: '#06b6d4',    // Cyan 500  
    accent: '#f59e0b',       // Amber 500
    success: '#10b981',      // Emerald 500
    text: '#1f2937',         // Gray 800
    lightText: '#6b7280',    // Gray 500
    background: '#f8fafc',   // Slate 50
    white: '#ffffff'
  }

  // PREMIUM FONTS
  doc.setFont('helvetica', 'normal')
  
  // HEADER SECTION với GRADIENT EFFECT (simulated with rectangles)
  // Background gradient simulation
  doc.setFillColor(30, 64, 175) // Blue 700
  doc.rect(0, 0, 210, 45, 'F')
  
  doc.setFillColor(6, 182, 212, 0.8) // Cyan 500 with opacity
  doc.rect(0, 30, 210, 15, 'F')

  // Company Logo Area (placeholder)
  doc.setFillColor(255, 255, 255)
  doc.circle(25, 22, 12, 'F')
  doc.setTextColor(30, 64, 175)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('VET', 21, 26)

  // Company Name - PREMIUM TYPOGRAPHY
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('XUÂN THÙY VETERINARY PHARMACY', 45, 20)
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Nhà thuốc thú y - Đẳng cấp chăn nuôi chuyên nghiệp', 45, 27)
  
  doc.setFontSize(8)
  doc.text('📍 Địa chỉ: 123 Đường ABC, Phường XYZ, TP.HCM  |  📞 (028) 1234.5678', 45, 32)
  doc.text('📧 Email: info@xuanthuy.com  |  🌐 Website: www.xuanthuy.com', 45, 36)
  doc.text('🏛️ MST: 0123456789  |  💼 Giấy phép KD: 123/GP-UBND', 45, 40)

  // INVOICE TITLE với MODERN DESIGN
  let yPos = 60
  
  // Title background
  doc.setFillColor(239, 68, 68) // Red 500
  doc.rect(0, yPos - 5, 210, 18, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('HÓA ĐƠN BÁN HÀNG', 105, yPos + 5, { align: 'center' })
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('SALES INVOICE', 105, yPos + 10, { align: 'center' })

  yPos += 25

  // THÔNG TIN HÓA ĐƠN vs KHÁCH HÀNG - MODERN CARDS
  // Invoice Info Card
  doc.setFillColor(248, 250, 252) // Slate 50
  doc.rect(15, yPos, 85, 35, 'F')
  doc.setDrawColor(203, 213, 225) // Slate 300
  doc.rect(15, yPos, 85, 35, 'S')

  doc.setTextColor(255, 255, 255)
  doc.setFillColor(30, 64, 175) // Blue 700
  doc.rect(15, yPos, 85, 8, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('📋 THÔNG TIN HÓA ĐƠN', 17, yPos + 5)

  doc.setTextColor(31, 41, 55) // Gray 800
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Số hóa đơn: ${header.invoice_code}`, 17, yPos + 12)
  doc.text(`Ngày lập: ${new Date(header.invoice_date).toLocaleDateString('vi-VN')}`, 17, yPos + 17)
  doc.text(`Chi nhánh: Chi nhánh ${header.branch_id}`, 17, yPos + 22)
  doc.text(`Trạng thái: ${header.status || 'Hoàn thành'}`, 17, yPos + 27)
  doc.text(`NV bán hàng: ${header.staff_name || 'Admin'}`, 17, yPos + 32)

  // Customer Info Card
  doc.setFillColor(248, 250, 252)
  doc.rect(110, yPos, 85, 35, 'F')
  doc.setDrawColor(203, 213, 225)
  doc.rect(110, yPos, 85, 35, 'S')

  doc.setTextColor(255, 255, 255)
  doc.setFillColor(16, 185, 129) // Emerald 500
  doc.rect(110, yPos, 85, 8, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('👤 THÔNG TIN KHÁCH HÀNG', 112, yPos + 5)

  doc.setTextColor(31, 41, 55)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const customerName = customer?.customer_name || 'Khách lẻ'
  doc.text(`Tên khách hàng: ${customerName}`, 112, yPos + 12)
  doc.text(`Mã KH: ${customer?.customer_code || 'KH000001'}`, 112, yPos + 17)
  doc.text(`Điện thoại: ${customer?.phone || '0901234567'}`, 112, yPos + 22)
  doc.text(`Email: ${customer?.email || 'customer@example.com'}`, 112, yPos + 27)
  doc.text(`Địa chỉ: ${customer?.address || 'TP.HCM'}`, 112, yPos + 32)

  yPos += 45

  // BẢNG SẢN PHẨM với MODERN DESIGN
  const tableColumn = ['STT', 'TÊN HÀNG HÓA', 'SL', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'GHI CHÚ']
  const tableRows: any[][] = []

  details.forEach((item, index) => {
    const row = [
      (index + 1).toString(),
      item.product_name || `Sản phẩm ${item.product_id}`,
      item.quantity?.toString() || '1',
      new Intl.NumberFormat('vi-VN').format(item.unit_price || 0),
      new Intl.NumberFormat('vi-VN').format((item.unit_price || 0) * (item.quantity || 1)),
      item.notes || '-'
    ]
    tableRows.push(row)
  })

  // MODERN TABLE STYLING
  autoTable(doc, {
    startY: yPos,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      textColor: [31, 41, 55], // Gray 800
      cellPadding: 3,
      lineColor: [203, 213, 225], // Slate 300
      lineWidth: 0.5
    },
    headStyles: {
      fillColor: [30, 64, 175], // Blue 700
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fillColor: [248, 250, 252] // Slate 50
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { cellWidth: 80 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 35 },
      5: { cellWidth: 25 }
    }
  })

  // Calculate totals
  const subtotal = details.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0)
  const vatRate = 0.1 // 10% VAT
  const vatAmount = subtotal * vatRate
  const total = subtotal + vatAmount

  // TỔNG KẾT với MODERN DESIGN
  const finalY = (doc as any).lastAutoTable.finalY + 10

  // Summary Box
  doc.setFillColor(245, 158, 11) // Amber 500
  doc.rect(120, finalY, 75, 25, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('💰 TỔNG KẾT', 122, finalY + 5)

  doc.setTextColor(31, 41, 55)
  doc.setFillColor(254, 252, 232) // Amber 50
  doc.rect(120, finalY + 8, 75, 17, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Tạm tính:`, 122, finalY + 13)
  doc.text(`${new Intl.NumberFormat('vi-VN').format(subtotal)} ₫`, 193, finalY + 13, { align: 'right' })
  
  doc.text(`VAT (10%):`, 122, finalY + 18)
  doc.text(`${new Intl.NumberFormat('vi-VN').format(vatAmount)} ₫`, 193, finalY + 18, { align: 'right' })
  
  doc.setFont('helvetica', 'bold')
  doc.text(`TỔNG CỘNG:`, 122, finalY + 23)
  doc.text(`${new Intl.NumberFormat('vi-VN').format(total)} ₫`, 193, finalY + 23, { align: 'right' })

  // QR CODE SECTION - MODERN FEATURE
  const qrData = JSON.stringify({
    invoice: header.invoice_code,
    date: header.invoice_date,
    total: total,
    customer: customer?.customer_name || 'Khách lẻ',
    company: 'Xuân Thùy Veterinary Pharmacy'
  })

  try {
    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      width: 80,
      margin: 1,
      color: {
        dark: '#1e40af',
        light: '#ffffff'
      }
    })
    
    // Add QR Code
    doc.addImage(qrCodeDataURL, 'PNG', 15, finalY, 20, 20)
    
    doc.setTextColor(30, 64, 175)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('📱 QR Code', 15, finalY + 23)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('Quét để xem chi tiết', 15, finalY + 26)
  } catch (error) {
    console.log('QR Code generation failed:', error)
  }

  // CHỮ KÝ SECTION với MODERN LAYOUT
  const signatureY = finalY + 35

  // Signature boxes
  const boxes = [
    { title: '👨‍💼 NGƯỜI LẬP', x: 30 },
    { title: '👨‍💼 NGƯỜI BÁN', x: 105 },
    { title: '👨‍💼 KHÁCH HÀNG', x: 180 }
  ]

  boxes.forEach(box => {
    doc.setDrawColor(203, 213, 225)
    doc.rect(box.x - 25, signatureY, 50, 25, 'S')
    
    doc.setTextColor(30, 64, 175)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(box.title, box.x, signatureY + 5, { align: 'center' })
    
    doc.setTextColor(107, 114, 128)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('(Ký và ghi rõ họ tên)', box.x, signatureY + 22, { align: 'center' })
  })

  // FOOTER với MODERN DESIGN
  const footerY = 280
  doc.setFillColor(30, 64, 175)
  doc.rect(0, footerY, 210, 17, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('🏥 XUÂN THÙY VETERINARY PHARMACY - Đẳng cấp chăn nuôi chuyên nghiệp', 105, footerY + 5, { align: 'center' })
  doc.text('📞 Hotline: 1900.1234  |  📧 support@xuanthuy.com  |  🌐 www.xuanthuy.com', 105, footerY + 10, { align: 'center' })
  doc.text(`🗓️ In ngày: ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}`, 105, footerY + 15, { align: 'center' })

  return new Blob([doc.output('blob')], { type: 'application/pdf' })
}
