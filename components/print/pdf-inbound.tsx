import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 24, paddingHorizontal: 28, fontSize: 10 },
  title: { textAlign: 'center', fontSize: 16, fontWeight: 700, marginBottom: 6 },
  subtitle: { textAlign: 'center', fontSize: 10, marginBottom: 10 },
  meta: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  metaItem: { width: '50%', marginBottom: 3 },
  table: { width: 'auto', borderStyle: 'solid', borderWidth: 1 },
  row: { flexDirection: 'row' },
  cellHeader: { flexGrow: 1, padding: 5, fontWeight: 'bold', borderStyle: 'solid', borderWidth: 1, backgroundColor: '#F3F4F6' },
  cell: { flexGrow: 1, padding: 5, borderStyle: 'solid', borderWidth: 1 },
  right: { textAlign: 'right' },
  summary: { marginTop: 10, alignSelf: 'flex-end', width: '60%', borderWidth: 1, borderStyle: 'solid', padding: 8 },
  summaryRow: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  total: { borderTopWidth: 1, borderStyle: 'solid', paddingTop: 4, fontWeight: 700 },
});

export interface InboundSummaryRow {
  inbound_id: string;
  inbound_code: string;
  supplier_name?: string;
  created_at?: string;
  expected_date?: string;
  received_date?: string;
  status: string;
  ordered_total_qty?: number;
  received_total_qty?: number;
  total_cost?: number;
}

function fmt(n: number) { return (n ?? 0).toLocaleString('vi-VN'); }
function fmtDate(s?: string) { return s ? new Date(s).toLocaleDateString('vi-VN') : ''; }

export default function InboundListPDF({ rows, params }: { rows: InboundSummaryRow[]; params: { supplierId?: number; status?: string; from?: string; to?: string; dateField?: string } }) {
  const totals = rows.reduce((a, r) => {
    a.ordered += Number(r.ordered_total_qty || 0);
    a.received += Number(r.received_total_qty || 0);
    a.cost += Number(r.total_cost || 0);
    return a;
  }, { ordered: 0, received: 0, cost: 0 });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>DANH SÁCH ĐƠN NHẬP HÀNG</Text>
        <Text style={styles.subtitle}>Xuân Thuỳ - Quản Lý Bán Hàng • Thời điểm in: {fmtDate(new Date().toISOString())}</Text>

        <View style={styles.meta}>
          <Text style={styles.metaItem}>Nhà cung cấp: {params.supplierId ? `#${params.supplierId}` : 'Tất cả'}</Text>
          <Text style={styles.metaItem}>Trạng thái: {params.status || 'all'}</Text>
          <Text style={styles.metaItem}>Khoảng thời gian: {params.from || '...'} → {params.to || '...'}</Text>
          <Text style={styles.metaItem}>Theo trường ngày: {params.dateField || 'created_at'}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.cellHeader, { width: '14%' }]}>Mã đơn</Text>
            <Text style={[styles.cellHeader, { width: '22%' }]}>Nhà cung cấp</Text>
            <Text style={[styles.cellHeader, { width: '12%' }]}>Ngày đặt</Text>
            <Text style={[styles.cellHeader, { width: '12%' }]}>Ngày dự kiến</Text>
            <Text style={[styles.cellHeader, { width: '12%' }]}>Ngày nhận</Text>
            <Text style={[styles.cellHeader, { width: '13%' }]}>Trạng thái</Text>
            <Text style={[styles.cellHeader, { width: '12%' }, styles.right]}>SL đặt/nhận</Text>
            <Text style={[styles.cellHeader, { width: '13%' }, styles.right]}>Tổng tiền</Text>
          </View>
          {rows.length === 0 ? (
            <View style={styles.row}><Text style={[styles.cell, { width: '100%', textAlign: 'center' }]}>Không có đơn phù hợp</Text></View>
          ) : rows.map(r => {
            const pct = Math.floor((Number(r.received_total_qty||0) / Math.max(1, Number(r.ordered_total_qty||0))) * 100);
            const statusLabel = r.status === 'RECEIVED' ? `Đã nhận (${pct}%)` : r.status === 'PARTIAL' ? `Nhận một phần (${pct}%)` : r.status === 'PENDING' ? 'Chờ nhận' : 'Đã hủy';
            return (
              <View style={styles.row} key={r.inbound_id}>
                <Text style={[styles.cell, { width: '14%' }]}>{r.inbound_code}</Text>
                <Text style={[styles.cell, { width: '22%' }]}>{r.supplier_name || ''}</Text>
                <Text style={[styles.cell, { width: '12%' }]}>{fmtDate(r.created_at)}</Text>
                <Text style={[styles.cell, { width: '12%' }]}>{fmtDate(r.expected_date)}</Text>
                <Text style={[styles.cell, { width: '12%' }]}>{fmtDate(r.received_date)}</Text>
                <Text style={[styles.cell, { width: '13%' }]}>{statusLabel}</Text>
                <Text style={[styles.cell, { width: '12%' }, styles.right]}>{fmt(Number(r.ordered_total_qty||0))} / {fmt(Number(r.received_total_qty||0))}</Text>
                <Text style={[styles.cell, { width: '13%' }, styles.right]}>{fmt(Number(r.total_cost||0))} đ</Text>
              </View>
            )
          })}
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}><Text>Số đơn:</Text><Text>{fmt(rows.length)}</Text></View>
          <View style={styles.summaryRow}><Text>Tổng SL đặt:</Text><Text>{fmt(totals.ordered)}</Text></View>
          <View style={styles.summaryRow}><Text>Tổng SL nhận:</Text><Text>{fmt(totals.received)}</Text></View>
          <View style={[styles.summaryRow, styles.total]}><Text>Tổng tiền:</Text><Text>{fmt(totals.cost)} đ</Text></View>
        </View>
      </Page>
    </Document>
  );
}
