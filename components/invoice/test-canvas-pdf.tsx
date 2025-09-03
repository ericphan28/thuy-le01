'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { FileDown, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { toast } from 'sonner'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

interface TestCanvasPDFProps {
  invoiceId: number
}

export default function TestCanvasPDF({ invoiceId }: TestCanvasPDFProps) {
  const [loading, setLoading] = useState(false)

  const generatePDF = async () => {
    try {
      setLoading(true)
      const supabase = createClient()

      // Fetch invoice data
      const { data: header } = await supabase
        .from('invoices')
        .select('*')
        .eq('invoice_id', invoiceId)
        .single()

      const { data: details } = await supabase
        .from('invoice_details')
        .select('*')
        .eq('invoice_id', invoiceId)

      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', header?.customer_id)
        .single()

      if (!header) throw new Error('Không tìm thấy hóa đơn')

      // Create HTML template
      const subtotal = (details || []).reduce((sum: number, item: any) => sum + item.line_total, 0)
      const totalDiscount = (details || []).reduce((sum: number, item: any) => sum + (item.discount_amount || 0), 0)
      const vatAmount = (subtotal - totalDiscount) * (header.vat_rate / 100)
      const grandTotal = subtotal - totalDiscount + vatAmount
      const remainingAmount = grandTotal - header.customer_paid

      const htmlContent = `
        <div style="
          font-family: 'Inter', Arial, sans-serif;
          width: 794px;
          background: white;
          padding: 30px;
          color: #1f2937;
        ">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1e40af; font-size: 24px; margin: 0;">THÚ Y THÚY TRANG</h1>
            <div style="color: #6b7280; font-size: 14px;">Hóa đơn bán hàng</div>
            <div style="color: #6b7280; font-size: 14px;">Số: ${header.invoice_code}</div>
          </div>

          <!-- Customer Info -->
          <div style="margin-bottom: 20px;">
            <div><strong>Khách hàng:</strong> ${customer?.customer_name || header.customer_name || 'Khách lẻ'}</div>
            <div><strong>SĐT:</strong> ${customer?.phone || ''}</div>
            <div><strong>Ngày:</strong> ${formatDate(header.invoice_date)}</div>
          </div>

          <!-- Products Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">STT</th>
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Tên sản phẩm</th>
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">SL</th>
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">Đơn giá</th>
                <th style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${(details || []).map((item: any, index: number) => `
                <tr>
                  <td style="border: 1px solid #d1d5db; padding: 8px;">${index + 1}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px;">${item.product_name}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${item.quantity}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${formatPrice(item.unit_price)}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${formatPrice(item.line_total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Summary -->
          <div style="margin-left: auto; width: 300px;">
            <div style="display: flex; justify-content: space-between; padding: 4px 0;">
              <span>Tổng tiền hàng:</span>
              <strong>${formatPrice(subtotal)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;">
              <span>Tổng cộng:</span>
              <strong>${formatPrice(grandTotal)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;">
              <span>Đã thanh toán:</span>
              <strong>${formatPrice(header.customer_paid)}</strong>
            </div>
            ${remainingAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #dc2626;">
              <span>Còn lại:</span>
              <strong>${formatPrice(remainingAmount)}</strong>
            </div>
            ` : ''}
            ${customer ? `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #dc2626; border-top: 1px solid #e5e7eb; margin-top: 8px; padding-top: 8px;">
              <span>Tổng công nợ:</span>
              <strong>${formatPrice(customer.current_debt || 0)}</strong>
            </div>
            ` : ''}
          </div>
        </div>
      `

      // Create temporary element
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = htmlContent
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-9999px'
      tempDiv.style.top = '-9999px'
      document.body.appendChild(tempDiv)

      // Generate canvas
      const canvas = await html2canvas(tempDiv.firstElementChild as HTMLElement, {
        width: 794,
        height: 1123,
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      })

      // Remove temp element
      document.body.removeChild(tempDiv)

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgData = canvas.toDataURL('image/png')
      pdf.addImage(imgData, 'PNG', 0, 0, 210, 297)
      
      // Download
      pdf.save(`HoaDon_${header.invoice_code}_${new Date().toISOString().split('T')[0]}.pdf`)
      
      toast.success('🎉 PDF đã được tạo thành công!')

    } catch (error) {
      console.error('PDF generation error:', error)
      toast.error('Lỗi tạo PDF: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={generatePDF}
      disabled={loading}
      className="h-8 w-8 p-0 hover:bg-emerald-100 dark:hover:bg-emerald-900"
      title="Tạo PDF với Tổng công nợ"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
      ) : (
        <FileDown className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
      )}
    </Button>
  )
}
