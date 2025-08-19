"use client";
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export default function OpenInboundPrintButton() {
  const router = useRouter();
  const params = useSearchParams();

  const onClick = () => {
    const q = new URLSearchParams(params as any);
  if (!q.has('auto')) q.set('auto', '1');
  const url = `/print/inbound?${q.toString()}`;
    window.open(url, '_blank');
  };

  return (
    <Button variant="outline" size="sm" onClick={onClick} className="no-print">
      <Printer className="h-4 w-4 mr-2" /> In danh sách
    </Button>
  );
}
