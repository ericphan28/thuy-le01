/**
 * ULTIMATE VIETNAMESE PDF SOLUTION
 * HTML → Canvas → Image → PDF (100% Vietnamese Compatible)
 * 
 * Approach này được các phần mềm PDF chuyên nghiệp sử dụng:
 * - Render HTML với perfect Vietnamese fonts
 * - Convert to high-resolution image
 * - Embed image into PDF (không qua text encoding)
 */

"use client"

import { useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Button } from '@/components/ui/button'
import { FileText, Download, Loader2, CheckCircle, Image } from 'lucide-react'
import { toast } from 'sonner'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

interface CanvasVietnamesePDFProps {
  invoiceData: InvoiceFullData
  className?: string
}

// Generate Vietnamese HTML for Canvas rendering
function generateVietnameseHTMLForCanvas(invoiceData: InvoiceFullData): string {
  const { header, details, customer } = invoiceData
  
  // Calculations
  const subtotal = details.reduce((sum, item) => sum + item.line_total, 0)
  const totalDiscount = details.reduce((sum, item) => sum + (item.discount_amount || 0), 0)
  const vatAmount = (subtotal - totalDiscount) * (header.vat_rate / 100)
  const grandTotal = subtotal - totalDiscount + vatAmount
  const remainingAmount = grandTotal - header.customer_paid

  return `
    <div style="
      font-family: 'Inter', 'Segoe UI', 'Arial Unicode MS', Arial, sans-serif;
      width: 794px;
      min-height: 1123px;
      background: white;
      padding: 30px;
      font-size: 13px;
      line-height: 1.4;
      color: #1f2937;
      position: relative;
    ">
      <!-- COMPACT HEADER -->
      <div style="
        background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
        color: white;
        padding: 20px 25px;
        margin: -30px -30px 20px -30px;
        display: flex;
        align-items: center;
        gap: 15px;
      ">
        <div style="
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
          color: #1e40af;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 14px;
          flex-shrink: 0;
        ">TVT</div>
        <div style="flex: 1;">
          <div style="font-size: 22px; font-weight: 800; margin-bottom: 4px;">
            THÚ Y THÙY TRANG
          </div>
          <div style="font-size: 12px; opacity: 0.9; line-height: 1.3;">
            📍 123 Đường ABC, Phường XYZ, TP.HCM | 📞 0907136029<br>
            ✉️ ericphan28@gmail.com | 🏛️ MST: 0123456789
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 18px; font-weight: 700; margin-bottom: 2px;">HÓA ĐƠN</div>
          <div style="font-size: 13px; opacity: 0.9;">
            ${header.invoice_code}<br>
            ${formatDate(header.invoice_date)}
          </div>
        </div>
      </div>

      <!-- CUSTOMER & INVOICE INFO - 2 COLUMNS COMPACT -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;">
        <!-- Customer Info -->
        <div style="
          border: 2px solid #e2e8f0;
          border-left: 4px solid #1e40af;
          border-radius: 8px;
          padding: 15px;
          background: #f8fafc;
        ">
          <div style="
            font-size: 14px;
            font-weight: 700;
            color: #1e40af;
            margin-bottom: 10px;
            text-transform: uppercase;
          ">� KHÁCH HÀNG</div>
          <div style="font-size: 12px; margin-bottom: 6px;">
            <strong>Tên:</strong> ${customer?.customer_name || header.customer_name || 'Khách lẻ'}
          </div>
          <div style="font-size: 12px; margin-bottom: 6px;">
            <strong>Mã KH:</strong> ${customer?.customer_code || 'N/A'}
          </div>
          <div style="font-size: 12px; margin-bottom: 6px;">
            <strong>SĐT:</strong> ${customer?.phone || header.customer_phone || 'Chưa có'}
          </div>
          <div style="font-size: 12px;">
            <strong>Địa chỉ:</strong> ${customer?.address || header.customer_address || 'Chưa cập nhật'}
          </div>
        </div>

        <!-- Invoice Summary -->
        <div style="
          border: 2px solid #e2e8f0;
          border-left: 4px solid #059669;
          border-radius: 8px;
          padding: 15px;
          background: #f0fdf4;
        ">
          <div style="
            font-size: 14px;
            font-weight: 700;
            color: #059669;
            margin-bottom: 10px;
            text-transform: uppercase;
          ">� TỔNG KẾT</div>
          <div style="font-size: 12px; margin-bottom: 6px;">
            <strong>Số items:</strong> ${details.length} sản phẩm
          </div>
          <div style="font-size: 12px; margin-bottom: 6px;">
            <strong>Tổng tiền:</strong> ${formatPrice(subtotal)}
          </div>
          <div style="font-size: 12px; margin-bottom: 6px;">
            <strong>Giảm giá:</strong> ${formatPrice(totalDiscount)}
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #059669; padding-top: 4px; border-top: 1px solid #d1fae5;">
            <strong>THÀNH TIỀN: ${formatPrice(grandTotal)}</strong>
          </div>
        </div>
      </div>

      <!-- PRODUCTS TABLE - OPTIMIZED -->
      <div style="margin: 20px 0;">
        <div style="
          background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
          color: white;
          padding: 12px 15px;
          border-radius: 6px 6px 0 0;
          font-size: 14px;
          font-weight: 700;
          text-align: center;
        ">📦 CHI TIẾT SẢN PHẨM</div>
        
        <table style="
          width: 100%;
          border-collapse: collapse;
          background: white;
          border-radius: 0 0 6px 6px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
        ">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 10px 8px; text-align: center; font-weight: 600; font-size: 12px; width: 40px; border-bottom: 1px solid #e2e8f0;">STT</th>
              <th style="padding: 10px 8px; text-align: left; font-weight: 600; font-size: 12px; border-bottom: 1px solid #e2e8f0;">TÊN SẢN PHẨM</th>
              <th style="padding: 10px 8px; text-align: center; font-weight: 600; font-size: 12px; width: 60px; border-bottom: 1px solid #e2e8f0;">SL</th>
              <th style="padding: 10px 8px; text-align: right; font-weight: 600; font-size: 12px; width: 90px; border-bottom: 1px solid #e2e8f0;">ĐƠN GIÁ</th>
              <th style="padding: 10px 8px; text-align: right; font-weight: 600; font-size: 12px; width: 100px; border-bottom: 1px solid #e2e8f0;">THÀNH TIỀN</th>
            </tr>
          </thead>
          <tbody>
            ${details.map((item, index) => `
              <tr style="background: ${index % 2 === 0 ? '#fafafa' : 'white'}; border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px; text-align: center; font-size: 12px;">${index + 1}</td>
                <td style="padding: 8px; text-align: left; font-size: 12px;">
                  <div style="font-weight: 600; color: #1f2937;">${item.product_name || 'Sản phẩm'}</div>
                  ${item.product_code ? `<div style="color: #6b7280; font-size: 10px;">Mã: ${item.product_code}</div>` : ''}
                </td>
                <td style="padding: 8px; text-align: center; font-size: 12px; font-weight: 600;">${item.quantity || 1}</td>
                <td style="padding: 8px; text-align: right; font-size: 12px; font-weight: 600;">${formatPrice(item.unit_price || 0)}</td>
                <td style="padding: 8px; text-align: right; font-size: 12px; font-weight: 600; color: #059669;">${formatPrice(item.line_total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- PAYMENT INFO - COMPACT ROW -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin: 20px 0;">
        <!-- Payment Method -->
        <div style="
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          background: #f8fafc;
          text-align: center;
        ">
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">PHƯƠNG THỨC</div>
          <div style="font-size: 13px; font-weight: 600; color: #1f2937;">Tiền mặt</div>
        </div>
        
        <!-- Paid Amount -->
        <div style="
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          background: #f0fdf4;
          text-align: center;
        ">
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">ĐÃ THANH TOÁN</div>
          <div style="font-size: 13px; font-weight: 600; color: #059669;">${formatPrice(header.customer_paid)}</div>
        </div>
        
        <!-- Remaining -->
        <div style="
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          background: ${remainingAmount > 0 ? '#fef2f2' : '#f0fdf4'};
          text-align: center;
        ">
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">CÒN LẠI</div>
          <div style="font-size: 13px; font-weight: 600; color: ${remainingAmount > 0 ? '#dc2626' : '#059669'};">${formatPrice(remainingAmount)}</div>
        </div>
      </div>

      <!-- FOOTER - COMPACT -->
      <div style="margin-top: 30px;">
        <div style="
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border: 1px solid #0ea5e9;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 20px;
          font-size: 12px;
          color: #0c4a6e;
          text-align: center;
          line-height: 1.5;
        ">
          🙏 <strong>Cảm ơn Quý khách đã tin tưởng sử dụng dịch vụ!</strong><br>
          📞 Hotline: <strong>0907136029</strong> | ✉️ <strong>ericphan28@gmail.com</strong>
        </div>

        <div style="display: flex; justify-content: space-between; margin-top: 25px;">
          <div style="text-align: center; width: 180px;">
            <div style="
              font-weight: 700;
              color: #1e40af;
              font-size: 13px;
              margin-bottom: 6px;
              text-transform: uppercase;
            ">Người Bán Hàng</div>
            <div style="
              border-bottom: 2px solid #1e40af;
              width: 120px;
              margin: 30px auto 6px auto;
            "></div>
            <div style="font-style: italic; color: #6b7280; font-size: 11px;">(Ký, họ tên)</div>
          </div>
          <div style="text-align: center; width: 180px;">
            <div style="
              font-weight: 700;
              color: #1e40af;
              font-size: 13px;
              margin-bottom: 6px;
              text-transform: uppercase;
            ">Khách Hàng</div>
            <div style="
              border-bottom: 2px solid #1e40af;
              width: 120px;
              margin: 30px auto 6px auto;
            "></div>
            <div style="font-style: italic; color: #6b7280; font-size: 11px;">(Ký, họ tên)</div>
          </div>
        </div>
      </div>
    </div>
  `
}

export function CanvasVietnamesePDF({ invoiceData, className }: CanvasVietnamesePDFProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  const handleGeneratePDF = async () => {
    try {
      setIsGenerating(true)
      
      toast.loading('📄 Đang tạo PDF tiếng Việt...', {
        description: 'Đang xử lý font chuyên nghiệp'
      })

      // Create temporary div with HTML content
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = generateVietnameseHTMLForCanvas(invoiceData)
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-10000px'
      tempDiv.style.top = '0'
      tempDiv.style.width = '794px'
      tempDiv.style.zIndex = '-1000'
      
      document.body.appendChild(tempDiv)

      // Wait for fonts to load
      await document.fonts.ready

      // Convert to canvas with high quality
      const canvas = await html2canvas(tempDiv, {
        scale: 2, // High resolution
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
        logging: false
      })

      // Remove temp div
      document.body.removeChild(tempDiv)

      // Create PDF with image
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgData = canvas.toDataURL('image/png', 1.0) // Max quality
      
      // Add image to PDF (this bypasses text encoding issues!)
      pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, '', 'FAST')

      // Download PDF with compact filename
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const filename = `HD_${invoiceData.header.invoice_code}_${dateStr}.pdf`
      pdf.save(filename)

      // Success state
      setIsCompleted(true)
      setTimeout(() => setIsCompleted(false), 2000)
      
      toast.dismiss()
      toast.success('🎉 PDF tiếng Việt hoàn thành!', {
        description: 'Font Vietnamese hiển thị hoàn hảo',
        action: {
          label: 'Tuyệt vời!',
          onClick: () => {}
        }
      })

    } catch (error) {
      console.error('Canvas PDF generation error:', error)
      toast.dismiss()
      toast.error('❌ Lỗi tạo PDF tiếng Việt', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại',
        action: {
          label: 'Thử lại',
          onClick: () => handleGeneratePDF()
        }
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Button
      onClick={handleGeneratePDF}
      disabled={isGenerating}
      className={`
        relative overflow-hidden group
        bg-gradient-to-r from-emerald-600 to-emerald-700 
        hover:from-emerald-700 hover:to-emerald-800
        border-0 text-white shadow-lg 
        transition-all duration-300 ease-in-out
        hover:shadow-xl hover:scale-105
        disabled:opacity-70 disabled:cursor-not-allowed
        ${className}
      `}
      size="sm"
    >
      {/* Background animation */}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-emerald-500 opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
      
      {/* Content */}
      <div className="relative flex items-center gap-2">
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">Đang tạo...</span>
          </>
        ) : isCompleted ? (
          <>
            <CheckCircle className="h-4 w-4 text-emerald-300" />
            <span className="font-medium">Hoàn thành!</span>
          </>
        ) : (
          <>
            <div className="relative">
              <FileText className="h-4 w-4 transition-transform group-hover:scale-110" />
              <Download className="h-2.5 w-2.5 absolute -bottom-0.5 -right-0.5 text-emerald-200" />
            </div>
            <span className="font-medium">
              PDF Tiếng Việt
            </span>
          </>
        )}
      </div>

      {/* Shine effect */}
      <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-10 group-hover:animate-[shine_0.8s_ease-in-out] transition-opacity" />
    </Button>
  )
}
