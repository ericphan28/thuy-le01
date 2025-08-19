'use client';

import React from 'react';

interface InboundOrder {
  inbound_id: string;
  inbound_code: string;
  supplier_id?: number;
  supplier_name?: string;
  expected_date?: string;
  received_date?: string;
  status: 'PENDING' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  ordered_total_qty?: number;
  received_total_qty?: number;
  total_cost?: number;
  notes?: string;
  created_by: string;
  created_at: string;
}

interface PrintInboundProps {
  order: InboundOrder;
  items: any[];
  onClose: () => void;
}

export default function PrintInbound({ order, items, onClose }: PrintInboundProps) {
  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN');
  };

  React.useEffect(() => {
    // Auto print when component loads
    const timer = setTimeout(() => {
      window.print();
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="print-container">
      {/* Screen buttons */}
      <div className="no-print flex gap-2 p-4">
        <button onClick={handlePrint} className="bg-blue-500 text-white px-4 py-2 rounded">
          In lại
        </button>
        <button onClick={onClose} className="bg-gray-500 text-white px-4 py-2 rounded">
          Đóng
        </button>
      </div>

      {/* Print content */}
      <div className="print-content p-8 max-w-4xl mx-auto bg-white">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">PHIẾU ĐẶT HÀNG</h1>
          <h2 className="text-xl">PURCHASE ORDER</h2>
          <div className="mt-4">
            <span className="bg-gray-100 px-4 py-2 rounded text-lg font-semibold">
              {order.inbound_code}
            </span>
          </div>
        </div>

        {/* Company & Supplier Info */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="font-semibold mb-3 border-b pb-1">THÔNG TIN CÔNG TY</h3>
            <div className="space-y-1 text-sm">
              <p><strong>Công ty:</strong> Nhà Thuốc ABC</p>
              <p><strong>Địa chỉ:</strong> 123 Đường ABC, Quận 1, TP.HCM</p>
              <p><strong>Điện thoại:</strong> (028) 1234-5678</p>
              <p><strong>Email:</strong> info@nhathuocabc.com</p>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-3 border-b pb-1">THÔNG TIN NHÀ CUNG CẤP</h3>
            <div className="space-y-1 text-sm">
              <p><strong>Nhà cung cấp:</strong> {order.supplier_name || 'Chưa xác định'}</p>
              <p><strong>Mã NCC:</strong> {order.supplier_id}</p>
              <p><strong>Liên hệ:</strong> -</p>
            </div>
          </div>
        </div>

        {/* Order Details */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="font-semibold mb-3 border-b pb-1">CHI TIẾT ĐƠN HÀNG</h3>
            <div className="space-y-1 text-sm">
              <p><strong>Ngày đặt:</strong> {formatDate(order.created_at)}</p>
              <p><strong>Ngày dự kiến:</strong> {order.expected_date ? formatDate(order.expected_date) : 'Chưa xác định'}</p>
              <p><strong>Trạng thái:</strong> {order.status}</p>
              <p><strong>Người tạo:</strong> {order.created_by}</p>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-3 border-b pb-1">GHI CHÚ</h3>
            <div className="text-sm">
              <p>{order.notes || 'Không có ghi chú'}</p>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-8">
          <h3 className="font-semibold mb-3 border-b pb-1">DANH SÁCH SẢN PHẨM</h3>
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-3 py-2 text-left">STT</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Mã SP</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Tên sản phẩm</th>
                <th className="border border-gray-300 px-3 py-2 text-center">Số lượng</th>
                <th className="border border-gray-300 px-3 py-2 text-right">Đơn giá</th>
                <th className="border border-gray-300 px-3 py-2 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.item_id}>
                  <td className="border border-gray-300 px-3 py-2 text-center">{index + 1}</td>
                  <td className="border border-gray-300 px-3 py-2">{item.product_code || '-'}</td>
                  <td className="border border-gray-300 px-3 py-2">{item.product_name || 'Sản phẩm không xác định'}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center">{item.ordered_qty}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(item.unit_cost || 0)}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(item.total_cost || 0)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="border border-gray-300 px-3 py-4 text-center text-gray-500">
                    Không có sản phẩm
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={5} className="border border-gray-300 px-3 py-2 text-right">TỔNG CỘNG:</td>
                <td className="border border-gray-300 px-3 py-2 text-right">
                  {formatCurrency(order.total_cost || 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 mt-12">
          <div className="text-center">
            <p className="font-semibold mb-16">NGƯỜI ĐẶT HÀNG</p>
            <div className="border-t border-gray-300 pt-2">
              <p className="text-sm">{order.created_by}</p>
            </div>
          </div>
          <div className="text-center">
            <p className="font-semibold mb-16">NHÀ CUNG CẤP XÁC NHẬN</p>
            <div className="border-t border-gray-300 pt-2">
              <p className="text-sm">{order.supplier_name}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-gray-500">
          <p>Phiếu đặt hàng được tạo tự động từ hệ thống - {formatDate(new Date().toISOString())}</p>
        </div>
      </div>

      <style jsx>{`
        @media print {
          .no-print {
            display: none !important;
          }
          
          .print-content {
            padding: 0;
            margin: 0;
            max-width: none;
            box-shadow: none;
          }
          
          body {
            margin: 0;
            padding: 20px;
            background: white;
          }
          
          table {
            page-break-inside: auto;
          }
          
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          thead {
            display: table-header-group;
          }
          
          tfoot {
            display: table-footer-group;
          }
        }
        
        @media screen {
          .print-container {
            background: #f5f5f5;
            min-height: 100vh;
          }
          
          .print-content {
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            margin: 20px auto;
          }
        }
      `}</style>
    </div>
  );
}
