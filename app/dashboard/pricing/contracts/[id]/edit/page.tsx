import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import ContractEditForm from "@/components/pricing/contract-edit-form"
import Link from 'next/link'

export default async function EditContractPage({ params, searchParams }: { 
  params: Promise<{ id: string }>, 
  searchParams: Promise<Record<string, string | string[] | undefined>> 
}) {
  const supabase = await createClient()
  const { id } = await params
  const sp = await searchParams
  const contractId = Number(id)
  const error = sp.error as string
  const confirmDelete = sp.confirm_delete === 'true'

  // Load contract with related data
  const { data: contract, error: contractErr } = await supabase
    .from('contract_prices')
    .select('*')
    .eq('contract_id', contractId)
    .maybeSingle()

  if (contractErr || !contract) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Chỉnh sửa hợp đồng giá</h1>
        <div className="mt-4 text-destructive">Không tìm thấy hợp đồng.</div>
        <Link href="/dashboard/pricing/contracts" className="mt-3 inline-block text-primary hover:underline">
          ← Quay lại danh sách
        </Link>
      </div>
    )
  }

  // Fetch customer and product data separately
  const [{ data: currentCustomer }, { data: currentProduct }] = await Promise.all([
    supabase.from('customers').select('customer_id, customer_name, customer_code').eq('customer_id', contract.customer_id).maybeSingle(),
    supabase.from('products').select('product_id, product_code, product_name, sale_price, cost_price, base_price').eq('product_id', contract.product_id).maybeSingle()
  ])

  // Load dropdown data for editing (increased limits for search functionality)
  const [{ data: customers }, { data: products }] = await Promise.all([
    supabase.from('customers').select('customer_id, customer_name, customer_code').order('customer_name').limit(500),
    supabase.from('products').select('product_id, product_code, product_name, sale_price, cost_price, base_price').order('product_name').limit(1000)
  ])

  async function updateContract(formData: FormData) {
    'use server'
    const customer_id = Number(formData.get('customer_id'))
    const product_id = Number(formData.get('product_id'))
    const net_price = Number(formData.get('net_price'))
    const effective_from = String(formData.get('effective_from') || '') || null
    const effective_to = String(formData.get('effective_to') || '') || null
    const is_active = formData.get('is_active') === 'on'
    const notes = String(formData.get('notes') || '').trim() || null
    
    if (!customer_id || !product_id || !net_price || net_price <= 0) {
      redirect(`/dashboard/pricing/contracts/${contractId}/edit?error=invalid_input`)
    }

    const supabase = await createClient()
    const { error } = await supabase.from('contract_prices').update({
      customer_id,
      product_id,
      net_price,
      effective_from,
      effective_to,
      is_active,
      notes
    }).eq('contract_id', contractId)

    if (error) {
      redirect(`/dashboard/pricing/contracts/${contractId}/edit?error=update_failed`)
    }

    revalidatePath('/dashboard/pricing/contracts')
    redirect('/dashboard/pricing/contracts')
  }

  async function deleteContract(formData: FormData) {
    'use server'
    const confirmed = formData.get('confirmed') === 'true'
    
    if (!confirmed) {
      // Redirect back with confirmation prompt
      redirect(`/dashboard/pricing/contracts/${contractId}/edit?confirm_delete=true`)
    }
    
    const supabase = await createClient()
    await supabase.from('contract_prices').delete().eq('contract_id', contractId)
    revalidatePath('/dashboard/pricing/contracts')
    redirect('/dashboard/pricing/contracts')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Chỉnh sửa hợp đồng giá</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Cập nhật hợp đồng #{contractId}: {currentCustomer?.customer_name} × {currentProduct?.product_name}
        </p>
      </div>

      <ContractEditForm
        contract={contract}
        customers={customers || []}
        products={products || []}
        currentCustomer={currentCustomer}
        currentProduct={currentProduct}
        onSubmit={updateContract}
        onDelete={deleteContract}
      />
    </div>
  )
}
