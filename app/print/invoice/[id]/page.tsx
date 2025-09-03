import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import PrintToolbar from '@/components/print/print-toolbar'
import '../../../globals-print.css'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>
type Params = Promise<{ id: string }>

export default async function InvoicePrintStandalone({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const sp = await searchParams
  const { id } = await params
  const supabase = await createClient()

  // Compact mode to fit short invoices on one A4 page tightly
  const compact = sp.compact === '1'

  // Load header
  const { data: header, error: headerError } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_id', id)
    .single()

  if (headerError || !header) {
    return <div className="p-6 print-content">Lỗi: Không tìm thấy hóa đơn</div>
  }

  // Load details
  const { data: details, error: detailsError } = await supabase
    .from('invoice_details')
    .select('*')
    .eq('invoice_id', id)
    .order('detail_id')

  if (detailsError) {
    return <div className="p-6 print-content">Lỗi: Không tải được chi tiết hóa đơn</div>
  }

  // Load customer (optional)
  let customer: any = null
  if (header.customer_id) {
    const { data: c } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', header.customer_id)
      .single()
    customer = c || null
  }

  // Load business settings (name, address, phone)
  let businessName = ''
  let businessAddress = ''
  let businessPhone = ''
  try {
    const { data: biz, error: bizErr } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .eq('category', 'business')
      .eq('is_active', true)

    if (!bizErr && biz) {
      const getVal = (k: string) => biz.find((s: any) => s.setting_key === k)?.setting_value || ''
      businessName = getVal('business_name')
      businessAddress = getVal('business_address')
      businessPhone = getVal('business_phone')
    }
  } catch {}

  const rows = details || []
  const subtotal = rows.reduce((sum: number, it: any) => sum + Number(it.line_total || 0), 0)
  const totalDiscount = rows.reduce((sum: number, it: any) => sum + Number(it.discount_amount || 0), 0)
  const preTaxTotal = subtotal - totalDiscount
  const vatRate = Number(header.vat_rate || 0)
  const vatAmount = preTaxTotal * (vatRate / 100)
  const grandTotal = preTaxTotal + vatAmount
  const customerPaid = Number(header.customer_paid || 0)
  const remaining = grandTotal - customerPaid
  
  // Tổng công nợ = nợ hiện tại + nợ mới (nếu có)
  // Chỉ cộng remaining nếu > 0 (khách trả thiếu)
  // Không trừ nếu khách trả thừa (overpaid) vì đây chỉ là 1 hóa đơn
  const totalDebtAfter = (customer?.current_debt || 0) + Math.max(0, remaining)

  const fmt = (n: number) => formatPrice(Number(n || 0))
  const fmtDate = (s?: string | null) => (s ? formatDate(s as any) : '')
  const fmtDateTime = (d: Date) => d.toLocaleString('vi-VN')

  return (
    <div className="a4-page" style={{ fontSize: compact ? '11px' : '12px', padding: compact ? '8mm' as any : '10mm' as any }}>
      <PrintToolbar />

      {/* Top tiny info bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: compact ? 10 : 11, color: '#111', marginBottom: '3mm' }}>
        <div>{fmtDateTime(new Date())}</div>
        <div>Hóa đơn bán hàng</div>
      </div>

      {/* Store header - lấy từ Settings (Business) */}
      <div style={{ textAlign: 'center', lineHeight: 1.25, marginBottom: '2mm' }}>
        <div style={{ fontSize: compact ? 16 : 18, fontWeight: 800 }}>
          {(businessName || 'Cửa Hàng Thú Y').toUpperCase()}
        </div>
        {businessAddress ? (
          <div style={{ fontSize: compact ? 10.5 : 11, marginTop: 2 }}>Đ/C: {businessAddress}</div>
        ) : null}
        {businessPhone ? (
          <div style={{ fontSize: compact ? 10.5 : 11, marginTop: 2 }}>ĐT/Zalo: {businessPhone}</div>
        ) : null}
      </div>

      {/* Title */}
      <div style={{ textAlign: 'center', fontSize: compact ? 14 : 16, fontWeight: 800, textTransform: 'uppercase', margin: '2mm 0 3mm' }}>
        Hóa đơn bán hàng
      </div>

      {/* Invoice meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3mm', marginBottom: '4mm' }}>
        <div style={{ fontSize: compact ? 11 : 12 }}>
          <div><strong>Khách hàng:</strong> {customer?.customer_name || header.customer_name || 'Khách lẻ'}</div>
          <div><strong>Địa chỉ:</strong> {customer?.address || header.customer_address || ''}</div>
          <div><strong>Nhân viên bán hàng:</strong> {header.created_by || ''}</div>
        </div>
        <div style={{ fontSize: compact ? 11 : 12 }}>
          <div><strong>SDT:</strong> {customer?.phone || header.customer_phone || ''}</div>
          <div><strong>Số hóa đơn:</strong> {header.invoice_code || ''}</div>
          <div><strong>Ngày:</strong> {fmtDate(header.invoice_date)}</div>
        </div>
      </div>

      {/* Details table (compact) */}
      <div className="a4-section">
        <table className="a4-table print-keep-together" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '6%', padding: compact ? '4px 6px' : '6px 8px' }}>STT</th>
              <th style={{ width: '16%', padding: compact ? '4px 6px' : '6px 8px' }}>Mã hàng</th>
              <th style={{ padding: compact ? '4px 6px' : '6px 8px' }}>Tên hàng</th>
              <th className="a4-center" style={{ width: '10%', padding: compact ? '4px 6px' : '6px 8px' }}>Số lượng</th>
              <th className="a4-right" style={{ width: '14%', padding: compact ? '4px 6px' : '6px 8px' }}>Đơn giá</th>
              <th className="a4-right" style={{ width: '16%', padding: compact ? '4px 6px' : '6px 8px' }}>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td className="a4-center" colSpan={6}>Không có sản phẩm</td></tr>
            ) : rows.map((r: any, idx: number) => (
              <tr key={r.detail_id ?? idx}>
                <td className="a4-center" style={{ padding: compact ? '3px 6px' : '5px 8px' }}>{idx + 1}</td>
                <td style={{ padding: compact ? '3px 6px' : '5px 8px' }}>{r.product_code || ''}</td>
                <td style={{ padding: compact ? '3px 6px' : '5px 8px' }}>
                  <div style={{ fontWeight: 600 }}>{r.product_name || 'Sản phẩm'}</div>
                </td>
                <td className="a4-center" style={{ padding: compact ? '3px 6px' : '5px 8px', fontWeight: 600 }}>{Number(r.quantity || 0)}</td>
                <td className="a4-right" style={{ padding: compact ? '3px 6px' : '5px 8px' }}>{fmt(Number(r.unit_price || 0))}</td>
                <td className="a4-right" style={{ padding: compact ? '3px 6px' : '5px 8px', fontWeight: 700 }}>{fmt(Number(r.line_total || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary box (right aligned, compact) */}
      <div className="print-keep-together" style={{ width: compact ? '48%' : '55%', marginLeft: 'auto', marginTop: '6mm' }}>
        <div className="a4-summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: compact ? '2px 0' : '4px 0' }}>
          <span>Tổng tiền hàng:</span><strong>{fmt(subtotal)}</strong>
        </div>
        {totalDiscount > 0 && (
          <div className="a4-summary-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c', padding: compact ? '2px 0' : '4px 0' }}>
            <span>Chiết khấu:</span><strong>-{fmt(totalDiscount)}</strong>
          </div>
        )}
        <div className="a4-summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: compact ? '2px 0' : '4px 0' }}>
          <span>Cộng tiền hàng:</span><strong>{fmt(preTaxTotal)}</strong>
        </div>
        {vatRate > 0 && (
          <div className="a4-summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: compact ? '2px 0' : '4px 0' }}>
            <span>VAT ({vatRate}%):</span><strong>{fmt(vatAmount)}</strong>
          </div>
        )}
        <div className="a4-summary-row a4-total" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, padding: compact ? '2px 0' : '4px 0' }}>
          <span>Tổng cộng:</span><strong>{fmt(grandTotal)}</strong>
        </div>
        <div className="a4-summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: compact ? '2px 0' : '4px 0' }}>
          <span>Khách thanh toán:</span><strong>{fmt(customerPaid)}</strong>
        </div>
        {remaining !== 0 && (
          <div className="a4-summary-row" style={{ display: 'flex', justifyContent: 'space-between', color: remaining > 0 ? '#b91c1c' : undefined, padding: compact ? '2px 0' : '4px 0' }}>
            <span>Còn lại:</span><strong>{fmt(remaining)}</strong>
          </div>
        )}
        {customer && (
          <div className="a4-summary-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c', padding: compact ? '2px 0' : '4px 0' }}>
            <span>Tổng công nợ:</span><strong>{fmt(customer.current_debt || 0)}</strong>
          </div>
        )}
      </div>

      {/* Signatures */}
      <div className="print-keep-together" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10mm' }}>
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ fontWeight: 700 }}>Người nhận</div>
          <div className="print-signature-line" style={{ height: '22mm' }}></div>
        </div>
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ fontWeight: 700 }}>Nhân viên bán hàng</div>
          <div className="print-signature-line" style={{ height: '22mm' }}></div>
        </div>
      </div>

      {/* Note */}
      <div style={{ fontStyle: 'italic', marginTop: '6mm', fontSize: compact ? 10.5 : 11 }}>
        Quý khách vui lòng kiểm tra hàng và số lượng hàng theo đơn sau khi nhận hàng. Nếu có vấn đề gì vui lòng báo lại cho người bán.
        Chỉ được đổi, trả hàng trong 3 ngày sau khi nhận hàng. Xin cảm ơn!
      </div>

      {sp.auto === '1' ? (
        <Suspense>
          <script dangerouslySetInnerHTML={{ __html: 'window.print()' }} />
        </Suspense>
      ) : null}
    </div>
  )
}
