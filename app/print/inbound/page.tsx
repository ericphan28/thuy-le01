import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import PrintToolbar from '@/components/print/print-toolbar';
import '../../globals-print.css';

export const dynamic = 'force-dynamic';

export default async function InboundPrintStandalone({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const sp = await searchParams;
  const supplierId = sp.supplier_id ? Number(sp.supplier_id) : undefined;
  const status = (sp.status as string) || 'all';
  const from = sp.from as string | undefined;
  const to = sp.to as string | undefined;
  const dateField = (sp.date_field as string) || 'created_at';

  let query = supabase.from('inbound_orders_summary').select('*').order('created_at', { ascending: false });
  if (supplierId) query = query.eq('supplier_id', supplierId);
  if (status && status !== 'all') query = query.eq('status', status);
  if (from) query = query.gte(dateField, from);
  if (to) query = query.lte(dateField, to);

  const { data, error } = await query.limit(1000);
  if (error) {
    return <div className="p-6 print-content">Lỗi: {error.message}</div>;
  }

  const rows = data || [];
  const totals = rows.reduce((acc: any, r: any) => {
    acc.orders += 1;
    acc.ordered += Number(r.ordered_total_qty || 0);
    acc.received += Number(r.received_total_qty || 0);
    acc.cost += Number(r.total_cost || 0);
    return acc;
  }, { orders: 0, ordered: 0, received: 0, cost: 0 });

  const fmt = (n: number) => n.toLocaleString('vi-VN');
  const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('vi-VN') : '';

  return (
    <div className="a4-page">
      <PrintToolbar />
      <h1 className="a4-title">Danh sách đơn nhập hàng</h1>
      <div className="a4-subtitle">Xuân Thuỳ - Quản Lý Bán Hàng &nbsp;•&nbsp; Thời điểm in: {fmtDate(new Date().toISOString())}</div>

      <div className="a4-meta">
        <div className="a4-meta-item"><strong>Nhà cung cấp:</strong> {supplierId ? `#${supplierId}` : 'Tất cả'}</div>
        <div className="a4-meta-item"><strong>Trạng thái:</strong> {status}</div>
        <div className="a4-meta-item"><strong>Khoảng thời gian:</strong> {from || '...'} → {to || '...'}</div>
        <div className="a4-meta-item"><strong>Theo trường ngày:</strong> {dateField}</div>
      </div>

      <div className="a4-section">
        <table className="a4-table">
          <thead>
            <tr>
              <th style={{width:'14%'}}>Mã đơn</th>
              <th>Nhà cung cấp</th>
              <th style={{width:'12%'}}>Ngày đặt</th>
              <th style={{width:'12%'}}>Ngày dự kiến</th>
              <th style={{width:'12%'}}>Ngày nhận</th>
              <th style={{width:'13%'}}>Trạng thái</th>
              <th style={{width:'12%'}} className="a4-right">SL đặt/nhận</th>
              <th style={{width:'15%'}} className="a4-right">Tổng tiền</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="a4-center">Không có đơn phù hợp</td></tr>
            ) : rows.map((r: any) => {
              const pct = Math.floor((Number(r.received_total_qty||0) / Math.max(1, Number(r.ordered_total_qty||0))) * 100);
              const statusLabel = r.status === 'RECEIVED' ? `Đã nhận (${pct}%)` : r.status === 'PARTIAL' ? `Nhận một phần (${pct}%)` : r.status === 'PENDING' ? 'Chờ nhận' : 'Đã hủy';
              return (
                <tr key={r.inbound_id}>
                  <td>{r.inbound_code}</td>
                  <td>{r.supplier_name || ''}</td>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{fmtDate(r.expected_date)}</td>
                  <td>{fmtDate(r.received_date)}</td>
                  <td>{statusLabel}</td>
                  <td className="a4-right">{fmt(Number(r.ordered_total_qty||0))} / {fmt(Number(r.received_total_qty||0))}</td>
                  <td className="a4-right">{fmt(Number(r.total_cost||0))} đ</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="a4-summary">
        <div className="a4-summary-row"><span>Số đơn:</span><strong>{fmt(totals.orders)}</strong></div>
        <div className="a4-summary-row"><span>Tổng SL đặt:</span><strong>{fmt(totals.ordered)}</strong></div>
        <div className="a4-summary-row"><span>Tổng SL nhận:</span><strong>{fmt(totals.received)}</strong></div>
        <div className="a4-summary-row a4-total"><span>Tổng tiền:</span><strong>{fmt(totals.cost)} đ</strong></div>
      </div>

  {sp.auto === '1' ? (
        <Suspense>
          <script dangerouslySetInnerHTML={{ __html: 'window.print()' }} />
        </Suspense>
      ) : null}
    </div>
  );
}
