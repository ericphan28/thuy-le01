import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface AnalyticsPDFData {
  header: any
  details: any[]
  customer: any
}

export function generateAnalyticsPDF(invoiceData: AnalyticsPDFData): Blob {
  const { header, details, customer } = invoiceData
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  // ANALYTICS COLOR SCHEME
  const analytics = {
    primary: '#6366f1',      // Indigo 500
    secondary: '#8b5cf6',    // Violet 500
    success: '#10b981',      // Emerald 500
    warning: '#f59e0b',      // Amber 500
    info: '#06b6d4',         // Cyan 500
    dark: '#111827',         // Gray 900
    light: '#f9fafb'         // Gray 50
  }

  // MODERN GRADIENT HEADER
  // Primary gradient
  doc.setFillColor(99, 102, 241) // Indigo 500
  doc.rect(0, 0, 210, 25, 'F')
  
  // Secondary gradient
  doc.setFillColor(139, 92, 246, 0.8) // Violet 500
  doc.rect(0, 15, 210, 20, 'F')

  // COMPANY BRANDING với ANALYTICS STYLE
  doc.setFillColor(255, 255, 255)
  doc.circle(25, 20, 12, 'F')
  doc.setTextColor(99, 102, 241)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('📊', 21, 24)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('XUÂN THÙY ANALYTICS INVOICE', 45, 18)
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('🏥 Nhà thuốc thú y thông minh - Smart veterinary solutions', 45, 25)
  doc.text('📊 Business Intelligence Dashboard | 📈 Real-time Analytics', 45, 30)

  let yPos = 50

  // INVOICE TITLE với ANALYTICS DESIGN
  doc.setFillColor(16, 185, 129) // Emerald 500
  doc.rect(0, yPos - 5, 210, 18, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('📊 HÓA ĐƠN PHÂN TÍCH', 105, yPos + 3, { align: 'center' })
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('ANALYTICS SALES INVOICE - DATA DRIVEN', 105, yPos + 8, { align: 'center' })

  yPos += 25

  // DASHBOARD METRICS - 4 CARDS
  const metrics = [
    { label: 'Tổng đơn hàng', value: details.length, icon: '📦', color: [99, 102, 241] },
    { label: 'Tổng tiền', value: `${new Intl.NumberFormat('vi-VN').format(details.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0))}₫`, icon: '💰', color: [16, 185, 129] },
    { label: 'Khách hàng', value: customer?.customer_name || 'Khách lẻ', icon: '👤', color: [245, 158, 11] },
    { label: 'Trạng thái', value: 'Hoàn thành', icon: '✅', color: [34, 197, 94] }
  ]

  metrics.forEach((metric, index) => {
    const x = 15 + (index * 47)
    const cardWidth = 45
    
    // Card background
    doc.setFillColor(...metric.color as [number, number, number])
    doc.rect(x, yPos, cardWidth, 25, 'F')
    
    // Card content background
    doc.setFillColor(255, 255, 255, 0.9)
    doc.rect(x + 2, yPos + 8, cardWidth - 4, 15, 'F')
    
    // Icon
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12)
    doc.text(metric.icon, x + 5, yPos + 6)
    
    // Label
    doc.setTextColor(17, 24, 39)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(metric.label, x + 4, yPos + 12)
    
    // Value
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    const value = typeof metric.value === 'string' && metric.value.length > 15 
      ? metric.value.substring(0, 15) + '...'
      : metric.value.toString()
    doc.text(value, x + 4, yPos + 16)
  })

  yPos += 35

  // CUSTOMER ANALYTICS SECTION
  doc.setFillColor(249, 250, 251)
  doc.rect(15, yPos, 180, 30, 'F')
  doc.setDrawColor(209, 213, 219)
  doc.rect(15, yPos, 180, 30, 'S')

  // Section header
  doc.setFillColor(99, 102, 241)
  doc.rect(15, yPos, 180, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('📈 CUSTOMER ANALYTICS DASHBOARD', 17, yPos + 5)

  // Analytics data
  doc.setTextColor(17, 24, 39)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  
  const customerAnalytics = [
    `👤 Khách hàng: ${customer?.customer_name || 'Khách lẻ'}`,
    `🆔 Mã KH: ${customer?.customer_code || 'KH000001'}`,
    `📞 Liên hệ: ${customer?.phone || '0901234567'}`,
    `💳 Hạn mức: ${new Intl.NumberFormat('vi-VN').format(customer?.debt_limit || 0)}₫`,
    `💰 Công nợ: ${new Intl.NumberFormat('vi-VN').format(customer?.current_debt || 0)}₫`,
    `📊 Tình trạng: ${(customer?.current_debt || 0) > (customer?.debt_limit || 0) ? '⚠️ Vượt hạn mức' : '✅ Bình thường'}`
  ]

  customerAnalytics.forEach((item, index) => {
    const row = Math.floor(index / 2)
    const col = index % 2
    doc.text(item, 17 + (col * 85), yPos + 13 + (row * 5))
  })

  yPos += 40

  // PRODUCT ANALYTICS TABLE
  const tableColumn = ['#', '📊 SẢN PHẨM ANALYTICS', 'SL', 'GIÁ (₫)', 'TỔNG (₫)', '% RATIO']
  const tableRows: any[][] = []
  
  const totalValue = details.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0)

  details.forEach((item, index) => {
    const itemTotal = (item.unit_price || 0) * (item.quantity || 1)
    const percentage = totalValue > 0 ? ((itemTotal / totalValue) * 100).toFixed(1) : '0'
    
    const row = [
      (index + 1).toString(),
      `${item.product_name || `Sản phẩm ${item.product_id}`}\n📈 ID: ${item.product_id}`,
      item.quantity?.toString() || '1',
      new Intl.NumberFormat('vi-VN').format(item.unit_price || 0),
      new Intl.NumberFormat('vi-VN').format(itemTotal),
      `${percentage}%`
    ]
    tableRows.push(row)
  })

  // ANALYTICS TABLE DESIGN
  autoTable(doc, {
    startY: yPos,
    head: [tableColumn],
    body: tableRows,
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      textColor: [17, 24, 39],
      cellPadding: 3
    },
    headStyles: {
      fillColor: [99, 102, 241],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fillColor: [249, 250, 251]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { cellWidth: 75 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 30 },
      5: { halign: 'center', cellWidth: 25, fillColor: [16, 185, 129], textColor: [255, 255, 255] }
    }
  })

  // FINANCIAL ANALYTICS
  const finalY = (doc as any).lastAutoTable.finalY + 10
  
  // Analytics summary box
  doc.setFillColor(139, 92, 246)
  doc.rect(15, finalY, 180, 35, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('💹 FINANCIAL ANALYTICS SUMMARY', 17, finalY + 7)

  // Financial calculations
  const subtotal = details.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0)
  const vat = subtotal * 0.1
  const total = subtotal + vat
  const avgItemPrice = details.length > 0 ? subtotal / details.length : 0
  const maxItem = details.reduce((max, item) => {
    const itemTotal = (item.unit_price || 0) * (item.quantity || 1)
    return itemTotal > max.value ? { name: item.product_name, value: itemTotal } : max
  }, { name: '', value: 0 })

  // Analytics data grid
  const analyticsData = [
    { label: '💰 Tạm tính:', value: `${new Intl.NumberFormat('vi-VN').format(subtotal)}₫` },
    { label: '📊 VAT (10%):', value: `${new Intl.NumberFormat('vi-VN').format(vat)}₫` },
    { label: '🎯 Tổng cộng:', value: `${new Intl.NumberFormat('vi-VN').format(total)}₫` },
    { label: '📈 TB/sản phẩm:', value: `${new Intl.NumberFormat('vi-VN').format(avgItemPrice)}₫` },
    { label: '🏆 SP cao nhất:', value: maxItem.name || 'N/A' },
    { label: '💎 Giá trị cao nhất:', value: `${new Intl.NumberFormat('vi-VN').format(maxItem.value)}₫` }
  ]

  analyticsData.forEach((item, index) => {
    const row = Math.floor(index / 2)
    const col = index % 2
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(item.label, 17 + (col * 85), finalY + 15 + (row * 5))
    doc.setFont('helvetica', 'bold')
    doc.text(item.value, 17 + (col * 85) + 35, finalY + 15 + (row * 5))
  })

  // VISUAL CHART SIMULATION (Bar chart với ASCII)
  yPos = finalY + 45

  doc.setFillColor(17, 24, 39)
  doc.rect(15, yPos, 180, 25, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('📊 SALES DISTRIBUTION CHART', 17, yPos + 6)

  // Simple bar chart simulation
  const maxValue = Math.max(...details.map(item => (item.unit_price || 0) * (item.quantity || 1)))
  
  details.slice(0, 5).forEach((item, index) => {
    const itemValue = (item.unit_price || 0) * (item.quantity || 1)
    const barHeight = maxValue > 0 ? (itemValue / maxValue) * 10 : 1
    const x = 20 + (index * 30)
    
    // Bar
    doc.setFillColor(16, 185, 129)
    doc.rect(x, yPos + 15 - barHeight, 8, barHeight, 'F')
    
    // Value label
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(6)
    doc.text(`${new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(itemValue)}`, x, yPos + 20)
  })

  // DIGITAL SIGNATURE với ANALYTICS
  const sigY = yPos + 30

  // Signature analytics boxes
  const sigData = [
    { title: '📊 DATA ANALYST', name: 'Nguyễn Văn A', x: 35 },
    { title: '💼 SALES MANAGER', name: 'Trần Thị B', x: 105 },
    { title: '👤 CUSTOMER', name: customer?.customer_name || 'Khách hàng', x: 175 }
  ]

  sigData.forEach(sig => {
    doc.setFillColor(99, 102, 241)
    doc.rect(sig.x - 25, sigY, 50, 25, 'F')
    
    doc.setFillColor(255, 255, 255, 0.9)
    doc.rect(sig.x - 23, sigY + 8, 46, 15, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(sig.title, sig.x, sigY + 5, { align: 'center' })
    
    doc.setTextColor(17, 24, 39)
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.text(sig.name, sig.x, sigY + 15, { align: 'center' })
    doc.text(`${new Date().toLocaleDateString('vi-VN')}`, sig.x, sigY + 19, { align: 'center' })
  })

  // ANALYTICS FOOTER
  const footerY = 275
  doc.setFillColor(17, 24, 39)
  doc.rect(0, footerY, 210, 22, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('📊 XUÂN THÙY ANALYTICS - BUSINESS INTELLIGENCE PLATFORM', 105, footerY + 5, { align: 'center' })
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('📈 Powered by Advanced Analytics Engine | 🤖 AI-Driven Insights', 105, footerY + 10, { align: 'center' })
  doc.text(`📊 Report ID: RPT${Date.now().toString().slice(-6)} | 🕒 Generated: ${new Date().toLocaleString('vi-VN')}`, 105, footerY + 15, { align: 'center' })
  doc.text('📧 analytics@xuanthuy.com | 📞 Analytics Hotline: 1900.ANALYTICS', 105, footerY + 20, { align: 'center' })

  return new Blob([doc.output('blob')], { type: 'application/pdf' })
}
