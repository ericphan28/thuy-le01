import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import ContractCreateForm from "@/components/pricing/contract-create-form"

export default async function NewContractPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const sp = await searchParams
  const error = sp.error as string

  // Load dropdown data (increased limits for search functionality)
  const [{ data: customers }, { data: products }] = await Promise.all([
    supabase.from('customers').select('customer_id, customer_name, customer_code').order('customer_name').limit(500),
    supabase.from('products').select('product_id, product_code, product_name, sale_price, cost_price, base_price').order('product_name').limit(1000)
  ])

  async function createContract(formData: FormData) {
    'use server'
    const customer_id = Number(formData.get('customer_id'))
    const product_id = Number(formData.get('product_id'))
    const net_price = Number(formData.get('net_price'))
    const effective_from = String(formData.get('effective_from') || '') || null
    const effective_to = String(formData.get('effective_to') || '') || null
    const notes = String(formData.get('notes') || '').trim() || null
    
    if (!customer_id || !product_id || !net_price || net_price <= 0) {
      redirect('/dashboard/pricing/contracts/new?error=invalid_input')
    }

    const supabase = await createClient()
    const { error } = await supabase.from('contract_prices').insert({
      customer_id,
      product_id,
      net_price,
      effective_from,
      effective_to,
      is_active: true,
      notes
    })

    if (error) {
      redirect('/dashboard/pricing/contracts/new?error=create_failed')
    }

    revalidatePath('/dashboard/pricing/contracts')
    redirect('/dashboard/pricing/contracts')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Tạo hợp đồng giá mới</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Thiết lập giá riêng cho khách hàng × sản phẩm cụ thể
        </p>
      </div>

      {error && (
        <div className="mb-4 border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-3 text-sm">
          {error === 'invalid_input' && 'Vui lòng nhập đầy đủ thông tin hợp lệ.'}
          {error === 'create_failed' && 'Không thể tạo hợp đồng. Có thể đã tồn tại hợp đồng cho khách hàng và sản phẩm này.'}
        </div>
      )}

      <ContractCreateForm
        customers={customers || []}
        products={products || []}
        onSubmit={createContract}
      />

      <div className="mt-8 border-t pt-6">
        <h3 className="font-medium mb-3">Lưu ý</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <div>• <strong>Ưu tiên cao:</strong> Giá hợp đồng sẽ được ưu tiên áp dụng trước các quy tắc giá khác.</div>
          <div>• <strong>Hiệu lực:</strong> Để trống ngày bắt đầu/kết thúc nếu muốn áp dụng vô thời hạn.</div>
          <div>• <strong>Không trùng lặp:</strong> Mỗi khách hàng chỉ nên có 1 hợp đồng giá cho 1 sản phẩm trong cùng thời điểm.</div>
        </div>
      </div>
    </div>
  )
}
