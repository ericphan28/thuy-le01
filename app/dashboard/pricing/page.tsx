import Link from 'next/link'

export default function PricingHomePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Chính sách giá</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Quản lý Price Books, quy tắc giá, hợp đồng giá, khuyến mãi và bậc số lượng.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/books">
          <div className="font-medium">📚 Bảng giá</div>
          <div className="text-sm text-muted-foreground mt-1">Quản lý price books và rules</div>
        </Link>
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/contracts">
          <div className="font-medium">📋 Hợp đồng giá</div>
          <div className="text-sm text-muted-foreground mt-1">Giá đặc biệt cho khách hàng</div>
        </Link>
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/promotions">
          <div className="font-medium">🎉 Khuyến mãi</div>
          <div className="text-sm text-muted-foreground mt-1">Chương trình khuyến mãi</div>
        </Link>
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/tiers/enhanced">
          <div className="font-medium">🎯 Bậc số lượng</div>
          <div className="text-sm text-muted-foreground mt-1">Chiết khấu theo số lượng mua</div>
        </Link>
        <Link className="border rounded-lg p-4 hover:bg-accent" href="/dashboard/pricing/preview">
          <div className="font-medium">🔍 Mô phỏng giá</div>
          <div className="text-sm text-muted-foreground mt-1">Test pricing engine</div>
        </Link>
        <Link className="border rounded-lg p-4 hover:bg-accent border-blue-200 bg-blue-50" href="/api/volume-tiers/test">
          <div className="font-medium text-blue-700">🧪 Test Volume Tiers</div>
          <div className="text-sm text-blue-600 mt-1">API testing endpoint</div>
        </Link>
      </div>
    </div>
  )
}
