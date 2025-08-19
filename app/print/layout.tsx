import type { Metadata } from 'next';
import '../globals-print.css';

export const metadata: Metadata = {
  title: 'In báo cáo',
};

// Note: this is a segment layout (NOT root). Do not include <html>/<body> to avoid
// conflicts with the app root layout and hydration mismatches.
export default function PrintRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
