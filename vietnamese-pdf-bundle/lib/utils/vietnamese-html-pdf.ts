/**
 * VIETNAMESE HTML-TO-PDF SOLUTION
 * 
 * Approach khác hoàn toàn: Tạo HTML với CSS fonts rồi convert to PDF
 * Đây là cách các phần mềm PDF Việt Nam chuyên nghiệp sử dụng
 */

import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

/**
 * Generate Vietnamese HTML Invoice Template
 */
function generateVietnameseHTML(invoiceData: InvoiceFullData): string {
  const { header, details, customer } = invoiceData
  
  // Calculations
  const subtotal = details.reduce((sum, item) => sum + item.line_total, 0)
  const totalDiscount = details.reduce((sum, item) => sum + (item.discount_amount || 0), 0)
  const vatAmount = (subtotal - totalDiscount) * (header.vat_rate / 100)
  const grandTotal = subtotal - totalDiscount + vatAmount
  const remainingAmount = grandTotal - header.customer_paid

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hóa Đơn Bán Hàng</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Roboto', 'Arial Unicode MS', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            color: #000;
            background: white;
            width: 794px; /* A4 width at 96 DPI */
            min-height: 1123px; /* A4 height at 96 DPI */
            padding: 40px;
        }
        
        .header {
            background: linear-gradient(135deg, #003366 0%, #0066cc 100%);
            color: white;
            padding: 20px;
            margin: -40px -40px 30px -40px;
            position: relative;
        }
        
        .logo {
            background: #FFD700;
            color: #003366;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
            float: left;
            margin-right: 20px;
        }
        
        .company-info {
            overflow: hidden;
        }
        
        .company-name {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 5px;
        }
        
        .company-subtitle {
            font-size: 14px;
            margin-bottom: 10px;
            opacity: 0.9;
        }
        
        .contact-info {
            font-size: 11px;
            line-height: 1.3;
        }
        
        .invoice-title {
            text-align: center;
            background: #f5f5f5;
            padding: 15px;
            margin: 20px 0;
            border: 2px solid #003366;
        }
        
        .invoice-title h1 {
            font-size: 22px;
            color: #003366;
            font-weight: 700;
            margin-bottom: 5px;
        }
        
        .invoice-number {
            font-size: 12px;
            color: #666;
        }
        
        .customer-section {
            margin: 20px 0;
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #003366;
        }
        
        .customer-title {
            font-size: 16px;
            font-weight: 700;
            color: #003366;
            margin-bottom: 10px;
        }
        
        .customer-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            font-size: 12px;
        }
        
        .table-container {
            margin: 20px 0;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }
        
        th {
            background: #003366;
            color: white;
            padding: 10px 8px;
            text-align: center;
            font-weight: 700;
            border: 1px solid #003366;
        }
        
        td {
            padding: 8px;
            border: 1px solid #ddd;
            text-align: center;
        }
        
        td:nth-child(2) {
            text-align: left;
            font-weight: 500;
        }
        
        td:nth-child(5), td:nth-child(6) {
            text-align: right;
            font-weight: 600;
        }
        
        tbody tr:nth-child(even) {
            background: #f9f9f9;
        }
        
        .totals {
            float: right;
            width: 300px;
            margin: 20px 0;
            background: #f8f9fa;
            border: 2px solid #003366;
        }
        
        .totals table {
            width: 100%;
            font-size: 12px;
        }
        
        .totals th {
            background: #003366;
            color: white;
            text-align: center;
            padding: 8px;
        }
        
        .totals td {
            padding: 6px 10px;
            border: 1px solid #ddd;
        }
        
        .totals .total-row {
            background: #003366;
            color: white;
            font-weight: 700;
        }
        
        .footer {
            clear: both;
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #666;
            line-height: 1.5;
        }
        
        .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 30px;
            font-size: 12px;
        }
        
        .signature {
            text-align: center;
            width: 200px;
        }
        
        .signature-title {
            font-weight: 700;
            color: #003366;
            margin-bottom: 5px;
        }
        
        .signature-note {
            font-style: italic;
            color: #666;
            font-size: 10px;
        }
        
        @media print {
            body {
                margin: 0;
                padding: 20px;
            }
            .header {
                margin: -20px -20px 20px -20px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">TVT</div>
        <div class="company-info">
            <div class="company-name">THÚ Y THÙY TRANG</div>
            <div class="company-subtitle">Nhà thuốc thú y thông minh - Smart veterinary solutions</div>
            <div class="contact-info">
                Địa chỉ: 123 Đường ABC, Phường XYZ, Quận DEF, TP.HCM<br>
                Điện thoại: 0907136029 | Email: ericphan28@gmail.com<br>
                MST: 0123456789 | Website: thuyletrang.vn
            </div>
        </div>
    </div>

    <div class="invoice-title">
        <h1>HÓA ĐƠN BÁN HÀNG</h1>
        <div class="invoice-number">Số: ${header.invoice_code}</div>
    </div>

    <div class="customer-section">
        <div class="customer-title">THÔNG TIN KHÁCH HÀNG</div>
        <div class="customer-info">
            <div><strong>Tên khách hàng:</strong> ${customer?.customer_name || header.customer_name || 'Khách lẻ'}</div>
            <div><strong>Mã KH:</strong> ${customer?.customer_code || 'N/A'}</div>
            <div><strong>Địa chỉ:</strong> ${customer?.address || header.customer_address || 'Chưa cập nhật'}</div>
            <div><strong>Điện thoại:</strong> ${customer?.phone || header.customer_phone || 'Chưa có'}</div>
            <div><strong>Ngày lập:</strong> ${formatDate(header.invoice_date)}</div>
            <div><strong>Hình thức TT:</strong> Tiền mặt</div>
        </div>
    </div>

    <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th style="width: 40px;">STT</th>
                    <th style="width: 280px;">TÊN SẢN PHẨM</th>
                    <th style="width: 60px;">ĐVT</th>
                    <th style="width: 50px;">SL</th>
                    <th style="width: 100px;">ĐƠN GIÁ</th>
                    <th style="width: 120px;">THÀNH TIỀN</th>
                </tr>
            </thead>
            <tbody>
                ${details.map((item, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${item.product_name || 'Sản phẩm'}</td>
                        <td>${item.unit || 'cái'}</td>
                        <td>${item.quantity || 1}</td>
                        <td>${formatPrice(item.unit_price || 0)}</td>
                        <td>${formatPrice(item.line_total)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="totals">
        <table>
            <thead>
                <tr>
                    <th colspan="2">TỔNG KẾT</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Tổng tiền hàng:</strong></td>
                    <td style="text-align: right;">${formatPrice(subtotal)}</td>
                </tr>
                <tr>
                    <td><strong>Giảm giá:</strong></td>
                    <td style="text-align: right;">${formatPrice(totalDiscount)}</td>
                </tr>
                <tr>
                    <td><strong>VAT (${header.vat_rate}%):</strong></td>
                    <td style="text-align: right;">${formatPrice(vatAmount)}</td>
                </tr>
                <tr class="total-row">
                    <td><strong>TỔNG CỘNG:</strong></td>
                    <td style="text-align: right;"><strong>${formatPrice(grandTotal)}</strong></td>
                </tr>
                <tr>
                    <td><strong>Còn lại:</strong></td>
                    <td style="text-align: right;">${formatPrice(remainingAmount)}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="footer">
        <p>Cảm ơn Quý khách đã tin tưởng sử dụng dịch vụ của chúng tôi!</p>
        <p>Mọi thắc mắc xin liên hệ: 0907136029 hoặc ericphan28@gmail.com</p>
        <p><strong>Thú Y Thùy Trang - Đồng hành cùng sự phát triển chăn nuôi Việt Nam</strong></p>
        
        <div class="signatures">
            <div class="signature">
                <div class="signature-title">NGƯỜI BÁN HÀNG</div>
                <div class="signature-note">(Ký, họ tên)</div>
            </div>
            <div class="signature">
                <div class="signature-title">KHÁCH HÀNG</div>
                <div class="signature-note">(Ký, họ tên)</div>
            </div>
        </div>
    </div>
</body>
</html>
  `
}

/**
 * VIETNAMESE HTML-TO-PDF GENERATOR
 * Sử dụng HTML với Roboto font để đảm bảo Vietnamese 100%
 */
export async function generateVietnameseHTMLPDF(invoiceData: InvoiceFullData): Promise<Blob> {
  try {
    // Tạo HTML template
    const htmlContent = generateVietnameseHTML(invoiceData)
    
    // Tạo temporary div để render HTML
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = htmlContent
    tempDiv.style.position = 'absolute'
    tempDiv.style.left = '-9999px'
    tempDiv.style.top = '0'
    document.body.appendChild(tempDiv)
    
    // Convert HTML to canvas
    const canvas = await html2canvas(tempDiv, {
      scale: 2, // High resolution
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      width: 794,
      height: 1123
    })
    
    // Remove temp div
    document.body.removeChild(tempDiv)
    
    // Create PDF from canvas
    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgData = canvas.toDataURL('image/png')
    
    pdf.addImage(imgData, 'PNG', 0, 0, 210, 297)
    
    return new Blob([pdf.output('blob')], { type: 'application/pdf' })
    
  } catch (error) {
    console.error('Vietnamese HTML-to-PDF generation failed:', error)
    throw new Error('Không thể tạo PDF từ HTML. Vui lòng thử lại.')
  }
}
