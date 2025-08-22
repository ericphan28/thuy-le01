import Link from 'next/link'

export default function PricingHomePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Chính sách giá</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Quản lý Price Books, quy tắc giá, hợp đồng giá, khuyến mãi và bậc số lượng.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/books">Bảng giá</Link>
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/contracts">Hợp đồng giá</Link>
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/promotions">Khuyến mãi</Link>
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/tiers">Bậc số lượng</Link>
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/preview">Mô phỏng giá</Link>
      </div>
    </div>
  )
}
