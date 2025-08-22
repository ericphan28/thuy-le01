import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export default async function EditPriceBookPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params
  const bookId = Number(id)

  const { data: book, error } = await supabase
    .from('price_books')
    .select('*')
    .eq('price_book_id', bookId)
    .maybeSingle()

  if (error || !book) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Chỉnh sửa bảng giá</h1>
        <div className="mt-4 text-destructive">Không tìm thấy bảng giá.</div>
      </div>
    )
  }

  async function updateBook(formData: FormData) {
    'use server'
    const name = String(formData.get('name') || '').trim()
    const channel = String(formData.get('channel') || '').trim() || null
    const branch_id = formData.get('branch_id') ? Number(formData.get('branch_id')) : null
    const customer_group = String(formData.get('customer_group') || '').trim() || null
    const effective_from = String(formData.get('effective_from') || '') || null
    const effective_to = String(formData.get('effective_to') || '') || null
    const is_active = formData.get('is_active') === 'on'
    const notes = String(formData.get('notes') || '').trim() || null

    if (!name) {
      redirect(`/dashboard/pricing/books/${bookId}/edit?error=missing_name`)
    }

    const supabase = await createClient()
    await supabase.from('price_books').update({
      name,
      channel,
      branch_id,
      customer_group,
      effective_from,
      effective_to,
      is_active,
      notes
    }).eq('price_book_id', bookId)

    revalidatePath(`/dashboard/pricing/books/${bookId}`)
    redirect(`/dashboard/pricing/books/${bookId}`)
  }

  async function deleteBook() {
    'use server'
    const supabase = await createClient()
    await supabase.from('price_books').delete().eq('price_book_id', bookId)
    revalidatePath('/dashboard/pricing/books')
    redirect('/dashboard/pricing/books')
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Chỉnh sửa bảng giá</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Cập nhật thông tin bảng giá: {book.name}
        </p>
      </div>

      <form action={updateBook} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tên bảng giá <span className="text-destructive">*</span></label>
          <input 
            name="name" 
            defaultValue={book.name} 
            className="w-full border rounded px-3 py-2" 
            required 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Kênh bán</label>
            <input 
              name="channel" 
              defaultValue={book.channel || ''} 
              className="w-full border rounded px-3 py-2" 
              placeholder="POS, Online, Wholesale..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Chi nhánh ID</label>
            <input 
              name="branch_id" 
              type="number"
              defaultValue={book.branch_id || ''} 
              className="w-full border rounded px-3 py-2" 
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Nhóm khách hàng</label>
          <input 
            name="customer_group" 
            defaultValue={book.customer_group || ''} 
            className="w-full border rounded px-3 py-2" 
            placeholder="VIP, Regular, Wholesale..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Hiệu lực từ</label>
            <input 
              name="effective_from" 
              type="date"
              defaultValue={book.effective_from ? new Date(book.effective_from).toISOString().split('T')[0] : ''} 
              className="w-full border rounded px-3 py-2" 
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Hiệu lực đến</label>
            <input 
              name="effective_to" 
              type="date"
              defaultValue={book.effective_to ? new Date(book.effective_to).toISOString().split('T')[0] : ''} 
              className="w-full border rounded px-3 py-2" 
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input 
              name="is_active" 
              type="checkbox" 
              defaultChecked={book.is_active}
              className="rounded"
            />
            <span className="text-sm font-medium">Kích hoạt bảng giá</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Ghi chú</label>
          <textarea 
            name="notes" 
            defaultValue={book.notes || ''} 
            className="w-full border rounded px-3 py-2 h-20" 
            placeholder="Mô tả thêm về bảng giá..."
          />
        </div>

        <div className="flex items-center gap-3 pt-4">
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">
            Lưu thay đổi
          </button>
          <a href={`/dashboard/pricing/books/${bookId}`} className="px-4 py-2 border rounded hover:bg-accent">
            Hủy
          </a>
          <form action={deleteBook} className="ml-auto">
            <button 
              type="submit" 
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded hover:opacity-90"
              onClick={(e) => {
                if (!confirm('Bạn có chắc muốn xóa bảng giá này? Hành động này không thể hoàn tác.')) {
                  e.preventDefault()
                }
              }}
            >
              Xóa bảng giá
            </button>
          </form>
        </div>
      </form>
    </div>
  )
}
