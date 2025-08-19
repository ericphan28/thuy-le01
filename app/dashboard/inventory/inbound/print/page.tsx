import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';

// Server component: fetch data on the server and render printable A4 layout
export default async function InboundPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();

  // Read filters (optional)
  const sp = await searchParams;
  const supplierId = sp.supplier_id ? Number(sp.supplier_id) : undefined;
  const status = (sp.status as string) || 'all';
  const from = sp.from as string | undefined;
  const to = sp.to as string | undefined;
  const dateField = (sp.date_field as string) || 'created_at'; // created_at | received_date | expected_date

  // Build query
  let query = supabase.from('inbound_orders_summary').select('*').order('created_at', { ascending: false });
  if (supplierId) query = query.eq('supplier_id', supplierId);
  if (status && status !== 'all') query = query.eq('status', status);
  if (from) query = query.gte(dateField, from);
  if (to) query = query.lte(dateField, to);

  const { data, error } = await query.limit(1000);
  if (error) {
    return (
      <div className="p-6 print-content">
        <h1 className="text-xl font-bold">Lỗi tải dữ liệu</h1>
        <p className="text-red-600">{error.message}</p>
      </div>
    );
  }

  const rows = data || [];
  const totalOrders = rows.length;
  const totals = rows.reduce((acc: any, r: any) => {
    acc.ordered += Number(r.ordered_total_qty || 0);
    acc.received += Number(r.received_total_qty || 0);
    acc.cost += Number(r.total_cost || 0);
    return acc;
  }, { ordered: 0, received: 0, cost: 0 });

  const fmt = (n: number) => n.toLocaleString('vi-VN');
  const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('vi-VN') : '';

  // Print-friendly layout; hide app chrome via globals-print.css
  return (
    <div className="p-6 print-content">
      {/* Header */}
      <div className="print-header">
        <div className="print-company-name">Xuân Thuỳ - Quản Lý Bán Hàng</div>
        <div className="print-invoice-title">Danh sách đơn nhập hàng</div>
        <div>Thời điểm in: {fmtDate(new Date().toISOString())}</div>
      </div>

      {/* Filters summary */}
      <div className="print-info-section">
        <div className="print-info-row"><span>Nhà cung cấp:</span><strong>{supplierId ? `#${supplierId}` : 'Tất cả'}</strong></div>
        <div className="print-info-row"><span>Trạng thái:</span><strong>{status}</strong></div>
        <div className="print-info-row"><span>Khoảng thời gian:</span><strong>{from || '...'} → {to || '...'}</strong> <span className="ml-2">(theo: {dateField})</span></div>
      </div>

      {/* Table */}
      <table className="print-keep-together">
        <thead>
          <tr>
            <th style={{width: '12%'}}>Mã đơn</th>
            <th>Nhà cung cấp</th>
            <th style={{width: '13%'}}>Ngày đặt</th>
            <th style={{width: '13%'}}>Ngày dự kiến</th>
            <th style={{width: '13%'}}>Ngày nhận</th>
            <th style={{width: '12%'}}>Trạng thái</th>
            <th style={{width: '12%'}}>SL đặt/nhận</th>
            <th style={{width: '15%'}}>Tổng tiền</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} style={{textAlign:'center'}}>Không có đơn phù hợp</td>
            </tr>
          )}
          {rows.map((r: any) => {
            const pct = Math.floor((Number(r.received_total_qty||0) / Math.max(1, Number(r.ordered_total_qty||0))) * 100);
            const statusLabel = r.status === 'RECEIVED' ? `Đã nhận (${pct}%)` : r.status === 'PARTIAL' ? `Nhận một phần (${pct}%)` : r.status === 'PENDING' ? 'Chờ nhận' : 'Đã hủy';
            return (
              <tr key={r.inbound_id} className="print-keep-together">
                <td>{r.inbound_code}</td>
                <td>{r.supplier_name || ''}</td>
                <td>{fmtDate(r.created_at)}</td>
                <td>{fmtDate(r.expected_date)}</td>
                <td>{fmtDate(r.received_date)}</td>
                <td>{statusLabel}</td>
                <td>{fmt(Number(r.ordered_total_qty||0))} / {fmt(Number(r.received_total_qty||0))}</td>
                <td>{fmt(Number(r.total_cost||0))} đ</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="print-summary">
        <div className="print-summary-row"><span>Số đơn:</span><strong>{fmt(totalOrders)}</strong></div>
        <div className="print-summary-row"><span>Tổng SL đặt:</span><strong>{fmt(totals.ordered)}</strong></div>
        <div className="print-summary-row"><span>Tổng SL nhận:</span><strong>{fmt(totals.received)}</strong></div>
        <div className="print-total print-summary-row"><span>Tổng tiền:</span><strong>{fmt(totals.cost)} đ</strong></div>
      </div>

      {/* Signatures */}
      <div className="print-signatures">
        <div className="print-signature">
          <div>Người lập</div>
          <div className="print-signature-line" />
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
        <div className="print-signature">
          <div>Kế toán</div>
          <div className="print-signature-line" />
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
        <div className="print-signature">
          <div>Thủ kho</div>
          <div className="print-signature-line" />
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
      </div>

      {/* Trigger print automatically if requested */}
  {sp.auto === '1' ? (
        <Suspense>
          <script dangerouslySetInnerHTML={{ __html: 'window.print()' }} />
        </Suspense>
      ) : null}
    </div>
  );
}
