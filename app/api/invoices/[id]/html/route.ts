import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = createClient()

    // Fetch invoice data
    const { data: headerData, error: headerError } = await supabase
      .from('invoices')
      .select(`
        *,
        customers!fk_invoices_customer_id (
          customer_id,
          customer_code,
          customer_name,
          phone,
          email,
          address,
          current_debt,
          debt_limit
        )
      `)
      .eq('invoice_id', id)
      .single()

    if (headerError) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Fetch invoice details
    const { data: detailsData, error: detailsError } = await supabase
      .from('invoice_details')
      .select('*')
      .eq('invoice_id', id)
      .order('detail_id')

    if (detailsError) {
      return NextResponse.json({ error: 'Invoice details not found' }, { status: 404 })
    }

    // Transform customer data
    const customerData = Array.isArray(headerData.customers) 
      ? headerData.customers[0] || null
      : headerData.customers

    // Generate HTML directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subtotal = detailsData.reduce((sum: number, item: any) => sum + item.line_total, 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalDiscount = detailsData.reduce((sum: number, item: any) => sum + (item.discount_amount || 0), 0)
    const vatAmount = (subtotal - totalDiscount) * (headerData.vat_rate / 100)
    const grandTotal = subtotal - totalDiscount + vatAmount
    const remainingAmount = grandTotal - headerData.customer_paid

    const htmlContent = `
      <div class="invoice-template bg-white text-black" style="width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #000;">
        
        <!-- Company Header -->
        <div class="company-header text-center" style="border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: bold; color: #1e40af; margin-bottom: 8px; margin-top: 0;">
            XUÂN THÙY VETERINARY PHARMACY
          </h1>
          <div style="font-size: 12px;">
            <p style="margin: 4px 0;"><strong>Địa chỉ:</strong> Số 123, Đường ABC, Phường XYZ, Quận DEF, TP. Hồ Chí Minh</p>
            <p style="margin: 4px 0;"><strong>Điện thoại:</strong> (028) 1234.5678 | <strong>Hotline:</strong> 0901.234.567</p>
            <p style="margin: 4px 0;"><strong>Email:</strong> info@xuanthuy.com | <strong>Website:</strong> www.xuanthuy.com</p>
            <p style="margin: 4px 0;"><strong>Mã số thuế:</strong> 0123456789 | <strong>Số ĐKKD:</strong> 0123456789012</p>
          </div>
        </div>

        <!-- Invoice Title -->
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="font-size: 20px; font-weight: bold; color: #dc2626; letter-spacing: 2px; margin: 0;">
            HÓA ĐƠN BÁN HÀNG
          </h2>
          <p style="font-size: 12px; color: #666; margin: 4px 0;">SALES INVOICE</p>
        </div>

        <!-- Invoice & Customer Info -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 24px;">
          
          <!-- Invoice Info -->
          <div style="border: 1px solid #d1d5db; padding: 16px; background-color: #dbeafe;">
            <h3 style="font-weight: bold; color: #1e40af; margin-bottom: 12px; border-bottom: 1px solid #93c5fd; padding-bottom: 4px; margin-top: 0;">
              📋 THÔNG TIN HÓA ĐƠN
            </h3>
            <div style="font-size: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-weight: 500;">Số hóa đơn:</span>
                <span style="font-weight: bold; color: #dc2626;">${headerData.invoice_code}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-weight: 500;">Ngày lập:</span>
                <span style="font-weight: bold;">${formatDate(headerData.invoice_date)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-weight: 500;">Chi nhánh:</span>
                <span>Chi nhánh ${headerData.branch_id}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-weight: 500;">Trạng thái:</span>
                <span style="padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; ${headerData.status === 'completed' ? 'background-color: #bbf7d0; color: #166534;' : 'background-color: #fef3c7; color: #92400e;'}">
                  ${headerData.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý'}
                </span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="font-weight: 500;">Số items:</span>
                <span style="font-weight: bold;">${detailsData.length} sản phẩm</span>
              </div>
            </div>
          </div>

          <!-- Customer Info -->
          <div style="border: 1px solid #d1d5db; padding: 16px; background-color: #dcfce7;">
            <h3 style="font-weight: bold; color: #166534; margin-bottom: 12px; border-bottom: 1px solid #86efac; padding-bottom: 4px; margin-top: 0;">
              👤 THÔNG TIN KHÁCH HÀNG
            </h3>
            <div style="font-size: 12px;">
              <div style="margin-bottom: 8px;">
                <span style="font-weight: 500;">Tên khách hàng:</span>
                <div style="font-weight: bold; font-size: 16px;">${customerData?.customer_name || 'Khách lẻ'}</div>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-weight: 500;">Mã KH:</span>
                <span>${customerData?.customer_code || 'N/A'}</span>
              </div>
              ${customerData?.phone ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span style="font-weight: 500;">Điện thoại:</span>
                  <span style="font-weight: bold;">${customerData.phone}</span>
                </div>
              ` : ''}
              ${customerData?.email ? `
                <div style="margin-bottom: 8px;">
                  <span style="font-weight: 500;">Email:</span>
                  <div style="color: #2563eb;">${customerData.email}</div>
                </div>
              ` : ''}
              ${customerData?.address ? `
                <div>
                  <span style="font-weight: 500;">Địa chỉ:</span>
                  <div style="color: #374151;">${customerData.address}</div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Products Table -->
        <div style="margin-bottom: 24px;">
          <h3 style="font-weight: bold; color: #374151; margin-bottom: 12px; text-align: center; background-color: #f3f4f6; padding: 8px; border: 1px solid #d1d5db; margin-top: 0;">
            📦 CHI TIẾT SẢN PHẨM
          </h3>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #9ca3af;">
            <thead>
              <tr style="background-color: #2563eb; color: white;">
                <th style="border: 1px solid #9ca3af; padding: 8px; text-align: center; font-weight: bold; font-size: 10px;">STT</th>
                <th style="border: 1px solid #9ca3af; padding: 12px; text-align: left; font-weight: bold; font-size: 10px;">TÊN HÀNG HÓA/DỊCH VỤ</th>
                <th style="border: 1px solid #9ca3af; padding: 8px; text-align: center; font-weight: bold; font-size: 10px;">ĐVT</th>
                <th style="border: 1px solid #9ca3af; padding: 8px; text-align: center; font-weight: bold; font-size: 10px;">SỐ LƯỢNG</th>
                <th style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: bold; font-size: 10px;">ĐƠN GIÁ</th>
                <th style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: bold; font-size: 10px;">THÀNH TIỀN</th>
                <th style="border: 1px solid #9ca3af; padding: 8px; text-align: right; font-weight: bold; font-size: 10px;">GIẢM GIÁ</th>
              </tr>
            </thead>
            <tbody>
              ${
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                detailsData.map((item: any, index: number) => `
                <tr style="${index % 2 === 0 ? 'background-color: white;' : 'background-color: #f9fafb;'}">
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center; font-weight: 500;">
                    ${index + 1}
                  </td>
                  <td style="border: 1px solid #d1d5db; padding: 12px;">
                    <div style="font-weight: 500; color: #111827;">${item.product_name}</div>
                    ${item.product_code ? `<div style="font-size: 10px; color: #6b7280;">Mã: ${item.product_code}</div>` : ''}
                    ${item.brand ? `<div style="font-size: 10px; color: #7c3aed;">Hãng: ${item.brand}</div>` : ''}
                  </td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">
                    ${item.unit || 'Cái'}
                  </td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center; font-weight: bold;">
                    ${item.quantity}
                  </td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">
                    ${formatPrice(item.unit_price)}
                  </td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right; font-weight: bold; color: #059669;">
                    ${formatPrice(item.line_total)}
                  </td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right; color: #dc2626;">
                    ${item.discount_amount > 0 ? formatPrice(item.discount_amount) : '-'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Financial Summary -->
        <div style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
          <div style="width: 384px; border: 2px solid #9ca3af;">
            <div style="background-color: #fef3c7; padding: 16px 16px 8px 16px; border-bottom: 1px solid #9ca3af;">
              <h3 style="font-weight: bold; text-align: center; color: #374151; margin: 0;">💰 TỔNG KẾT TÀI CHÍNH</h3>
            </div>
            <div style="padding: 12px 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span>Tạm tính:</span>
                <span style="font-weight: bold;">${formatPrice(subtotal)}</span>
              </div>
              
              ${totalDiscount > 0 ? `
                <div style="display: flex; justify-content: space-between; align-items: center; color: #dc2626; margin-bottom: 8px;">
                  <span>Tổng giảm giá:</span>
                  <span style="font-weight: bold;">-${formatPrice(totalDiscount)}</span>
                </div>
              ` : ''}
              
              ${headerData.vat_rate > 0 ? `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <span>VAT (${headerData.vat_rate}%):</span>
                  <span style="font-weight: bold;">${formatPrice(vatAmount)}</span>
                </div>
              ` : ''}
              
              <div style="border-top: 2px solid #9ca3af; padding-top: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 16px;">
                  <span style="font-weight: bold;">TỔNG CỘNG:</span>
                  <span style="font-weight: bold; color: #dc2626; font-size: 20px;">${formatPrice(grandTotal)}</span>
                </div>
              </div>
              
              <div style="border-top: 1px solid #d1d5db; padding-top: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; color: #2563eb; margin-bottom: 4px;">
                  <span>Đã thanh toán:</span>
                  <span style="font-weight: bold;">${formatPrice(headerData.customer_paid)}</span>
                </div>
                
                ${remainingAmount > 0 ? `
                  <div style="display: flex; justify-content: space-between; align-items: center; color: #dc2626;">
                    <span style="font-weight: bold;">Còn lại:</span>
                    <span style="font-weight: bold; font-size: 16px;">${formatPrice(remainingAmount)}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Notes -->
        ${headerData.notes ? `
          <div style="margin-bottom: 24px; padding: 16px; background-color: #fefce8; border: 1px solid #facc15; border-radius: 4px;">
            <h4 style="font-weight: bold; color: #a16207; margin-bottom: 8px; margin-top: 0;">📝 GHI CHÚ:</h4>
            <p style="color: #374151; margin: 0;">${headerData.notes}</p>
          </div>
        ` : ''}

        <!-- Signatures -->
        <div style="margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 32px; text-align: center;">
          <div>
            <div style="font-weight: bold; margin-bottom: 8px;">KHÁCH HÀNG</div>
            <div style="height: 64px; border-bottom: 1px solid black; margin-bottom: 8px; margin-top: 32px;"></div>
            <div style="font-size: 10px; color: #6b7280;">(Ký và ghi rõ họ tên)</div>
          </div>
          
          <div>
            <div style="font-weight: bold; margin-bottom: 8px;">NGƯỜI BÁN HÀNG</div>
            <div style="height: 64px; border-bottom: 1px solid black; margin-bottom: 8px; margin-top: 32px;"></div>
            <div style="font-size: 10px; color: #6b7280;">(Ký và ghi rõ họ tên)</div>
          </div>
          
          <div>
            <div style="font-weight: bold; margin-bottom: 8px;">THỦ TRƯỞNG ĐƠN VỊ</div>
            <div style="height: 64px; border-bottom: 1px solid black; margin-bottom: 8px; margin-top: 32px;"></div>
            <div style="font-size: 10px; color: #6b7280;">(Ký và ghi rõ họ tên)</div>
          </div>
        </div>

        <!-- Footer -->
        <div style="margin-top: 32px; text-align: center; font-size: 10px; color: #6b7280; border-top: 1px solid #d1d5db; padding-top: 16px;">
          <p style="margin: 4px 0;">Hóa đơn này được tạo tự động từ hệ thống quản lý Xuân Thùy Veterinary</p>
          <p style="margin: 4px 0;">Cảm ơn quý khách đã sử dụng sản phẩm và dịch vụ của chúng tôi!</p>
          <p style="margin: 8px 0;">🌟 Uy tín - Chất lượng - Chuyên nghiệp 🌟</p>
        </div>
      </div>
    `

    // Create complete HTML document
    const completeHTML = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hóa đơn ${headerData.invoice_code} - Xuân Thùy Veterinary</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print {
      body { margin: 0; padding: 0; }
      .invoice-template { margin: 0; }
      @page { 
        size: A4; 
        margin: 0.5cm; 
      }
    }
    body {
      font-family: Arial, sans-serif;
      background: #f5f5f5;
      margin: 0;
      padding: 20px;
    }
    .print-container {
      background: white;
      box-shadow: 0 0 20px rgba(0,0,0,0.1);
      margin: 0 auto;
      max-width: 210mm;
    }
  </style>
</head>
<body>
  <div class="print-container">
    ${htmlContent}
  </div>
  
  <script>
    // Auto print functionality
    function printInvoice() {
      window.print();
    }
    
    // Add print button for web view
    if (!window.matchMedia('print').matches) {
      const printBtn = document.createElement('button');
      printBtn.innerText = 'In hóa đơn';
      printBtn.className = 'fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded shadow-lg hover:bg-blue-700 z-50';
      printBtn.onclick = printInvoice;
      document.body.appendChild(printBtn);
    }
  </script>
</body>
</html>`

    return new NextResponse(completeHTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    })

  } catch (error) {
    console.error('HTML generation error:', error)
    return NextResponse.json({ error: 'Failed to generate HTML' }, { status: 500 })
  }
}
