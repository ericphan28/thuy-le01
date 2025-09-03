/**
 * VIETNAMESE INVOICE HTML TEMPLATE
 * Professional HTML template for perfect Vietnamese PDF generation
 */

import type { InvoiceFullData } from '@/lib/types/invoice'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

export function generateVietnameseInvoiceHTML(invoiceData: InvoiceFullData): string {
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
    <title>Hóa Đơn Bán Hàng - ${header.invoice_code}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        /* VIETNAMESE INVOICE STYLES */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        @page {
            size: A4;
            margin: 0;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #1f2937;
            background: white;
            width: 210mm;
            min-height: 297mm;
            padding: 20mm;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        /* HEADER SECTION */
        .invoice-header {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%);
            color: white;
            padding: 24px 30px;
            margin: -20mm -20mm 24px -20mm;
            position: relative;
            overflow: hidden;
        }
        
        .invoice-header::before {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 200px;
            height: 200px;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            border-radius: 50%;
            transform: translate(50px, -50px);
        }
        
        .header-content {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .company-logo {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            color: #1e40af;
            width: 64px;
            height: 64px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            flex-shrink: 0;
        }
        
        .company-info {
            flex: 1;
        }
        
        .company-name {
            font-size: 28px;
            font-weight: 800;
            margin-bottom: 6px;
            letter-spacing: -0.5px;
        }
        
        .company-subtitle {
            font-size: 16px;
            margin-bottom: 12px;
            opacity: 0.95;
            font-weight: 500;
        }
        
        .company-contact {
            font-size: 13px;
            line-height: 1.4;
            opacity: 0.9;
        }
        
        /* INVOICE TITLE */
        .invoice-title-section {
            text-align: center;
            margin: 32px 0;
            position: relative;
        }
        
        .invoice-title {
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            border: 3px solid #1e40af;
            border-radius: 12px;
            padding: 20px;
            display: inline-block;
            min-width: 400px;
        }
        
        .invoice-title h1 {
            font-size: 24px;
            font-weight: 700;
            color: #1e40af;
            margin-bottom: 8px;
            letter-spacing: 1px;
        }
        
        .invoice-meta {
            font-size: 14px;
            color: #6b7280;
            font-weight: 500;
        }
        
        /* CUSTOMER INFO */
        .customer-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin: 32px 0;
        }
        
        .info-card {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            position: relative;
        }
        
        .info-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: linear-gradient(to bottom, #1e40af, #3b82f6);
            border-radius: 2px 0 0 2px;
        }
        
        .info-title {
            font-size: 16px;
            font-weight: 700;
            color: #1e40af;
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .info-item {
            display: flex;
            margin-bottom: 8px;
            font-size: 13px;
        }
        
        .info-label {
            font-weight: 600;
            color: #4b5563;
            min-width: 100px;
            flex-shrink: 0;
        }
        
        .info-value {
            color: #1f2937;
            font-weight: 500;
        }
        
        /* PRODUCTS TABLE */
        .table-section {
            margin: 32px 0;
        }
        
        .table-title {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            padding: 16px 20px;
            border-radius: 8px 8px 0 0;
            font-size: 16px;
            font-weight: 700;
            text-align: center;
            letter-spacing: 0.5px;
        }
        
        .products-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            border-radius: 0 0 8px 8px;
            overflow: hidden;
        }
        
        .products-table th {
            background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
            color: white;
            padding: 14px 12px;
            text-align: center;
            font-weight: 600;
            font-size: 13px;
            border-bottom: 2px solid #1d4ed8;
        }
        
        .products-table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
        }
        
        .products-table tbody tr:nth-child(even) {
            background: #f8fafc;
        }
        
        .products-table tbody tr:hover {
            background: #eff6ff;
        }
        
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .font-medium { font-weight: 500; }
        .font-semibold { font-weight: 600; }
        
        /* TOTALS SECTION */
        .totals-section {
            display: flex;
            justify-content: flex-end;
            margin: 32px 0;
        }
        
        .totals-card {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border: 2px solid #1e40af;
            border-radius: 12px;
            padding: 0;
            min-width: 350px;
            overflow: hidden;
            box-shadow: 0 8px 25px rgba(30, 64, 175, 0.15);
        }
        
        .totals-header {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            padding: 16px 20px;
            text-align: center;
            font-weight: 700;
            font-size: 16px;
            letter-spacing: 0.5px;
        }
        
        .totals-body {
            padding: 20px;
        }
        
        .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            font-size: 14px;
        }
        
        .total-row:not(:last-child) {
            border-bottom: 1px solid #e5e7eb;
        }
        
        .total-row.grand-total {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            margin: 12px -20px -20px -20px;
            padding: 16px 20px;
            font-size: 16px;
            font-weight: 700;
        }
        
        .total-label {
            font-weight: 600;
            color: #4b5563;
        }
        
        .total-value {
            font-weight: 700;
            color: #1f2937;
        }
        
        .grand-total .total-label,
        .grand-total .total-value {
            color: white;
        }
        
        /* FOOTER */
        .invoice-footer {
            margin-top: 48px;
            text-align: center;
        }
        
        .footer-message {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border: 1px solid #0ea5e9;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            font-size: 13px;
            color: #0c4a6e;
            line-height: 1.6;
        }
        
        .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 32px;
        }
        
        .signature {
            text-align: center;
            width: 200px;
        }
        
        .signature-title {
            font-weight: 700;
            color: #1e40af;
            font-size: 14px;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .signature-line {
            border-bottom: 2px solid #1e40af;
            width: 150px;
            margin: 40px auto 8px auto;
        }
        
        .signature-note {
            font-style: italic;
            color: #6b7280;
            font-size: 12px;
        }
        
        /* PRINT STYLES */
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <!-- HEADER -->
    <div class="invoice-header">
        <div class="header-content">
            <div class="company-logo">TVT</div>
            <div class="company-info">
                <div class="company-name">THÚ Y THÙY TRANG</div>
                <div class="company-subtitle">Nhà thuốc thú y thông minh - Smart veterinary solutions</div>
                <div class="company-contact">
                    📍 123 Đường ABC, Phường XYZ, Quận DEF, TP.HCM<br>
                    📞 0907136029 | ✉️ ericphan28@gmail.com<br>
                    🏛️ MST: 0123456789 | 🌐 thuyletrang.vn
                </div>
            </div>
        </div>
    </div>

    <!-- INVOICE TITLE -->
    <div class="invoice-title-section">
        <div class="invoice-title">
            <h1>HÓA ĐƠN BÁN HÀNG</h1>
            <div class="invoice-meta">
                Số: <strong>${header.invoice_code}</strong> | 
                Ngày: <strong>${formatDate(header.invoice_date)}</strong>
            </div>
        </div>
    </div>

    <!-- CUSTOMER & INVOICE INFO -->
    <div class="customer-section">
        <div class="info-card">
            <div class="info-title">📋 Thông Tin Hóa Đơn</div>
            <div class="info-item">
                <span class="info-label">Số hóa đơn:</span>
                <span class="info-value">${header.invoice_code}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Ngày lập:</span>
                <span class="info-value">${formatDate(header.invoice_date)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Chi nhánh:</span>
                <span class="info-value">Chi nhánh 1</span>
            </div>
            <div class="info-item">
                <span class="info-label">Trạng thái:</span>
                <span class="info-value">${header.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý'}</span>
            </div>
        </div>

        <div class="info-card">
            <div class="info-title">👥 Thông Tin Khách Hàng</div>
            <div class="info-item">
                <span class="info-label">Tên khách hàng:</span>
                <span class="info-value">${customer?.customer_name || header.customer_name || 'Khách lẻ'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Mã KH:</span>
                <span class="info-value">${customer?.customer_code || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Điện thoại:</span>
                <span class="info-value">${customer?.phone || header.customer_phone || 'Chưa có'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Địa chỉ:</span>
                <span class="info-value">${customer?.address || header.customer_address || 'Chưa cập nhật'}</span>
            </div>
        </div>
    </div>

    <!-- PRODUCTS TABLE -->
    <div class="table-section">
        <div class="table-title">📦 CHI TIẾT SẢN PHẨM</div>
        <table class="products-table">
            <thead>
                <tr>
                    <th style="width: 50px;">STT</th>
                    <th style="width: 300px;">TÊN SẢN PHẨM</th>
                    <th style="width: 80px;">ĐVT</th>
                    <th style="width: 70px;">SỐ LƯỢNG</th>
                    <th style="width: 100px;">ĐƠN GIÁ</th>
                    <th style="width: 120px;">THÀNH TIỀN</th>
                    <th style="width: 80px;">GIẢM GIÁ</th>
                </tr>
            </thead>
            <tbody>
                ${details.map((item, index) => `
                    <tr>
                        <td class="text-center font-medium">${index + 1}</td>
                        <td class="text-left font-medium">
                            ${item.product_name || 'Sản phẩm'}
                            ${item.product_code ? `<br><small style="color: #6b7280;">(Mã: ${item.product_code})</small>` : ''}
                        </td>
                        <td class="text-center">${item.unit || 'cái'}</td>
                        <td class="text-center font-semibold">${item.quantity || 1}</td>
                        <td class="text-right font-semibold">${formatPrice(item.unit_price || 0)}</td>
                        <td class="text-right font-semibold" style="color: #059669;">${formatPrice(item.line_total)}</td>
                        <td class="text-right">${formatPrice(item.discount_amount || 0)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <!-- TOTALS -->
    <div class="totals-section">
        <div class="totals-card">
            <div class="totals-header">💰 TỔNG KẾT</div>
            <div class="totals-body">
                <div class="total-row">
                    <span class="total-label">Tổng tiền hàng:</span>
                    <span class="total-value">${formatPrice(subtotal)}</span>
                </div>
                <div class="total-row">
                    <span class="total-label">Tổng giảm giá:</span>
                    <span class="total-value">-${formatPrice(totalDiscount)}</span>
                </div>
                <div class="total-row">
                    <span class="total-label">VAT (${header.vat_rate}%):</span>
                    <span class="total-value">${formatPrice(vatAmount)}</span>
                </div>
                <div class="total-row">
                    <span class="total-label">Đã thanh toán:</span>
                    <span class="total-value">${formatPrice(header.customer_paid)}</span>
                </div>
                <div class="total-row grand-total">
                    <span class="total-label">TỔNG CỘNG:</span>
                    <span class="total-value">${formatPrice(grandTotal)}</span>
                </div>
                ${remainingAmount > 0 ? `
                <div class="total-row" style="background: #fef3c7; color: #92400e; margin: 8px -20px 0 -20px; padding: 12px 20px;">
                    <span class="total-label">Còn nợ:</span>
                    <span class="total-value">${formatPrice(remainingAmount)}</span>
                </div>
                ` : ''}
                ${customer ? `
                <div class="total-row" style="background: #fee2e2; color: #dc2626; margin: 8px -20px -20px -20px; padding: 12px 20px;">
                    <span class="total-label">Tổng công nợ:</span>
                    <span class="total-value">${formatPrice(customer.current_debt || 0)}</span>
                </div>
                ` : ''}
            </div>
        </div>
    </div>

    <!-- FOOTER -->
    <div class="invoice-footer">
        <div class="footer-message">
            🙏 <strong>Cảm ơn Quý khách đã tin tưởng sử dụng dịch vụ của chúng tôi!</strong><br>
            📞 Mọi thắc mắc xin liên hệ: <strong>0907136029</strong> hoặc <strong>ericphan28@gmail.com</strong><br>
            🌟 <strong>Thú Y Thùy Trang - Đồng hành cùng sự phát triển chăn nuôi Việt Nam</strong>
        </div>

        <div class="signatures">
            <div class="signature">
                <div class="signature-title">Người Bán Hàng</div>
                <div class="signature-line"></div>
                <div class="signature-note">(Ký, họ tên)</div>
            </div>
            <div class="signature">
                <div class="signature-title">Khách Hàng</div>
                <div class="signature-line"></div>
                <div class="signature-note">(Ký, họ tên)</div>
            </div>
        </div>
    </div>
</body>
</html>
  `
}
