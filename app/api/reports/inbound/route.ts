import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import InboundListPDF from '@/components/print/pdf-inbound';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get('supplier_id');
  const status = searchParams.get('status') || 'all';
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const dateField = searchParams.get('date_field') || 'created_at';

  const supabase = await createClient();
  let query = supabase.from('inbound_orders_summary').select('*').order('created_at', { ascending: false });
  if (supplierId) query = query.eq('supplier_id', Number(supplierId));
  if (status && status !== 'all') query = query.eq('status', status);
  if (from) query = query.gte(dateField, from);
  if (to) query = query.lte(dateField, to);

  const { data, error } = await query.limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pdfElement = createElement(InboundListPDF as any, {
    rows: (data as any[]) || [],
    params: {
      supplierId: supplierId ? Number(supplierId) : undefined,
      status,
      from,
      to,
      dateField,
    },
  });

  const buffer = await renderToBuffer(pdfElement as any);
  return new NextResponse(new Uint8Array(buffer as any) as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="inbound-list.pdf"',
    },
  });
}
