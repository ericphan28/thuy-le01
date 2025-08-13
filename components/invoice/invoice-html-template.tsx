import React from 'react'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

interface InvoiceHTMLTemplateProps {
  invoiceData: InvoiceFullData
}

export const InvoiceHTMLTemplate: React.FC<InvoiceHTMLTemplateProps> = ({ invoiceData }) => {
  const { header, details, customer } = invoiceData

  // Calculate totals
  const subtotal = details.reduce((sum, item) => sum + item.line_total, 0)
  const totalDiscount = details.reduce((sum, item) => sum + (item.discount_amount || 0), 0)
  const vatAmount = (subtotal - totalDiscount) * (header.vat_rate / 100)
  const grandTotal = subtotal - totalDiscount + vatAmount
  const remainingAmount = grandTotal - header.customer_paid

  return (
    <div className="invoice-template bg-white text-black" style={{ 
      width: '210mm', 
      minHeight: '297mm', 
      margin: '0 auto', 
      padding: '20mm',
      fontFamily: 'Arial, sans-serif',
      fontSize: '11pt',
      lineHeight: '1.4',
      color: '#000'
    }}>
      {/* Company Header */}
      <div className="company-header text-center border-b-2 border-black pb-4 mb-6">
        <h1 className="text-2xl font-bold text-blue-800 mb-2">
          XUÂN THÙY VETERINARY PHARMACY
        </h1>
        <div className="text-sm space-y-1">
          <p><strong>Địa chỉ:</strong> Số 123, Đường ABC, Phường XYZ, Quận DEF, TP. Hồ Chí Minh</p>
          <p><strong>Điện thoại:</strong> (028) 1234.5678 | <strong>Hotline:</strong> 0901.234.567</p>
          <p><strong>Email:</strong> info@xuanthuy.com | <strong>Website:</strong> www.xuanthuy.com</p>
          <p><strong>Mã số thuế:</strong> 0123456789 | <strong>Số ĐKKD:</strong> 0123456789012</p>
        </div>
      </div>

      {/* Invoice Title */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-red-600 tracking-wider">
          HÓA ĐƠN BÁN HÀNG
        </h2>
        <p className="text-sm text-gray-600 mt-1">SALES INVOICE</p>
      </div>

      {/* Invoice & Customer Info */}
      <div className="grid grid-cols-2 gap-8 mb-6">
        {/* Invoice Info */}
        <div className="border border-gray-300 p-4 bg-blue-50">
          <h3 className="font-bold text-blue-800 mb-3 border-b border-blue-200 pb-1">
            📋 THÔNG TIN HÓA ĐƠN
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">Số hóa đơn:</span>
              <span className="font-bold text-red-600">{header.invoice_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Ngày lập:</span>
              <span className="font-bold">{formatDate(header.invoice_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Chi nhánh:</span>
              <span>Chi nhánh {header.branch_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Trạng thái:</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                header.status === 'completed' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'
              }`}>
                {header.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Số items:</span>
              <span className="font-bold">{details.length} sản phẩm</span>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="border border-gray-300 p-4 bg-green-50">
          <h3 className="font-bold text-green-800 mb-3 border-b border-green-200 pb-1">
            👤 THÔNG TIN KHÁCH HÀNG
          </h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Tên khách hàng:</span>
              <div className="font-bold text-lg">{customer?.customer_name || 'Khách lẻ'}</div>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Mã KH:</span>
              <span>{customer?.customer_code || 'N/A'}</span>
            </div>
            {customer?.phone && (
              <div className="flex justify-between">
                <span className="font-medium">Điện thoại:</span>
                <span className="font-bold">{customer.phone}</span>
              </div>
            )}
            {customer?.email && (
              <div>
                <span className="font-medium">Email:</span>
                <div className="text-blue-600">{customer.email}</div>
              </div>
            )}
            {customer?.address && (
              <div>
                <span className="font-medium">Địa chỉ:</span>
                <div className="text-gray-700">{customer.address}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="mb-6">
        <h3 className="font-bold text-gray-800 mb-3 text-center bg-gray-100 py-2 border border-gray-300">
          📦 CHI TIẾT SẢN PHẨM
        </h3>
        <table className="w-full border-collapse border border-gray-400">
          <thead>
            <tr className="bg-blue-600 text-white">
              <th className="border border-gray-400 px-2 py-2 text-center font-bold text-xs">STT</th>
              <th className="border border-gray-400 px-3 py-2 text-left font-bold text-xs">TÊN HÀNG HÓA/DỊCH VỤ</th>
              <th className="border border-gray-400 px-2 py-2 text-center font-bold text-xs">ĐVT</th>
              <th className="border border-gray-400 px-2 py-2 text-center font-bold text-xs">SỐ LƯỢNG</th>
              <th className="border border-gray-400 px-2 py-2 text-right font-bold text-xs">ĐƠN GIÁ</th>
              <th className="border border-gray-400 px-2 py-2 text-right font-bold text-xs">THÀNH TIỀN</th>
              <th className="border border-gray-400 px-2 py-2 text-right font-bold text-xs">GIẢM GIÁ</th>
            </tr>
          </thead>
          <tbody>
            {details.map((item, index) => (
              <tr key={item.detail_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-300 px-2 py-2 text-center font-medium">
                  {index + 1}
                </td>
                <td className="border border-gray-300 px-3 py-2">
                  <div className="font-medium text-gray-900">{item.product_name}</div>
                  {item.product_code && (
                    <div className="text-xs text-gray-500">Mã: {item.product_code}</div>
                  )}
                  {item.brand && (
                    <div className="text-xs text-purple-600">Hãng: {item.brand}</div>
                  )}
                </td>
                <td className="border border-gray-300 px-2 py-2 text-center">
                  {item.unit || 'Cái'}
                </td>
                <td className="border border-gray-300 px-2 py-2 text-center font-bold">
                  {item.quantity}
                </td>
                <td className="border border-gray-300 px-2 py-2 text-right">
                  {formatPrice(item.unit_price)}
                </td>
                <td className="border border-gray-300 px-2 py-2 text-right font-bold text-green-600">
                  {formatPrice(item.line_total)}
                </td>
                <td className="border border-gray-300 px-2 py-2 text-right text-red-600">
                  {item.discount_amount > 0 ? formatPrice(item.discount_amount) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Financial Summary */}
      <div className="flex justify-end mb-8">
        <div className="w-96 border-2 border-gray-400">
          <div className="bg-yellow-100 px-4 py-2 border-b border-gray-400">
            <h3 className="font-bold text-center text-gray-800">💰 TỔNG KẾT TÀI CHÍNH</h3>
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className="flex justify-between items-center">
              <span>Tạm tính:</span>
              <span className="font-bold">{formatPrice(subtotal)}</span>
            </div>
            
            {totalDiscount > 0 && (
              <div className="flex justify-between items-center text-red-600">
                <span>Tổng giảm giá:</span>
                <span className="font-bold">-{formatPrice(totalDiscount)}</span>
              </div>
            )}
            
            {header.vat_rate > 0 && (
              <div className="flex justify-between items-center">
                <span>VAT ({header.vat_rate}%):</span>
                <span className="font-bold">{formatPrice(vatAmount)}</span>
              </div>
            )}
            
            <div className="border-t-2 border-gray-400 pt-2">
              <div className="flex justify-between items-center text-lg">
                <span className="font-bold">TỔNG CỘNG:</span>
                <span className="font-bold text-red-600 text-xl">{formatPrice(grandTotal)}</span>
              </div>
            </div>
            
            <div className="border-t border-gray-300 pt-2 space-y-1">
              <div className="flex justify-between items-center text-blue-600">
                <span>Đã thanh toán:</span>
                <span className="font-bold">{formatPrice(header.customer_paid)}</span>
              </div>
              
              {remainingAmount > 0 && (
                <div className="flex justify-between items-center text-red-600">
                  <span className="font-bold">Còn lại:</span>
                  <span className="font-bold text-lg">{formatPrice(remainingAmount)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Method & Notes */}
      {header.notes && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-300 rounded">
          <h4 className="font-bold text-yellow-800 mb-2">📝 GHI CHÚ:</h4>
          <p className="text-gray-700">{header.notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="mt-8 grid grid-cols-3 gap-8 text-center">
        <div>
          <div className="font-bold mb-2">KHÁCH HÀNG</div>
          <div className="h-16 border-b border-black mb-2 mt-8"></div>
          <div className="text-xs text-gray-600">(Ký và ghi rõ họ tên)</div>
        </div>
        
        <div>
          <div className="font-bold mb-2">NGƯỜI BÁN HÀNG</div>
          <div className="h-16 border-b border-black mb-2 mt-8"></div>
          <div className="text-xs text-gray-600">(Ký và ghi rõ họ tên)</div>
        </div>
        
        <div>
          <div className="font-bold mb-2">THỦ TRƯỞNG ĐƠN VỊ</div>
          <div className="h-16 border-b border-black mb-2 mt-8"></div>
          <div className="text-xs text-gray-600">(Ký và ghi rõ họ tên)</div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-gray-500 border-t border-gray-300 pt-4">
        <p>Hóa đơn này được tạo tự động từ hệ thống quản lý Xuân Thùy Veterinary</p>
        <p>Cảm ơn quý khách đã sử dụng sản phẩm và dịch vụ của chúng tôi!</p>
        <p className="mt-2">🌟 Uy tín - Chất lượng - Chuyên nghiệp 🌟</p>
      </div>
    </div>
  )
}
