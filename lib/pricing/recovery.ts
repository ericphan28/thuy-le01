// Price book recovery utilities
import { createClient } from '@/lib/supabase/server'

export interface PriceBookBackup {
  price_book_id: number
  name: string
  channel: string
  customer_group: string | null
  effective_from: string | null
  effective_to: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  rules: any[]
}

export async function backupPriceBook(priceBookId: number): Promise<PriceBookBackup | null> {
  const supabase = await createClient()
  
  try {
    // Get price book details
    const { data: priceBook, error: bookError } = await supabase
      .from('price_books')
      .select('*')
      .eq('price_book_id', priceBookId)
      .single()
    
    if (bookError || !priceBook) {
      console.error('Failed to backup price book:', bookError)
      return null
    }
    
    // Get all rules for this price book
    const { data: rules, error: rulesError } = await supabase
      .from('price_rules')
      .select('*')
      .eq('price_book_id', priceBookId)
    
    if (rulesError) {
      console.error('Failed to backup price rules:', rulesError)
      return null
    }
    
    return {
      ...priceBook,
      rules: rules || []
    }
  } catch (error) {
    console.error('Backup process failed:', error)
    return null
  }
}

export async function restorePriceBook(backup: PriceBookBackup): Promise<{ success: boolean; newId?: number; error?: string }> {
  const supabase = await createClient()
  
  try {
    // Create new price book
    const { data: newPriceBook, error: bookError } = await supabase
      .from('price_books')
      .insert({
        name: `${backup.name} (Khôi phục)`,
        channel: backup.channel,
        customer_group: backup.customer_group,
        effective_from: backup.effective_from,
        effective_to: backup.effective_to,
        is_active: true, // Always activate restored price book
        notes: `Khôi phục từ bảng giá bị xóa. Ghi chú gốc: ${backup.notes || 'Không có'}`
      })
      .select('price_book_id')
      .single()
    
    if (bookError || !newPriceBook) {
      return { success: false, error: `Failed to create price book: ${bookError?.message}` }
    }
    
    // Restore rules if any exist
    if (backup.rules.length > 0) {
      const rulesToInsert = backup.rules.map(rule => ({
        price_book_id: newPriceBook.price_book_id,
        scope: rule.scope,
        sku_code: rule.sku_code,
        category_id: rule.category_id,
        tag: rule.tag,
        action_type: rule.action_type,
        action_value: rule.action_value,
        min_qty: rule.min_qty,
        max_qty: rule.max_qty,
        priority: rule.priority,
        effective_from: rule.effective_from,
        effective_to: rule.effective_to,
        is_active: rule.is_active,
        notes: `Khôi phục từ rule ${rule.rule_id}. ${rule.notes || ''}`
      }))
      
      const { error: rulesError } = await supabase
        .from('price_rules')
        .insert(rulesToInsert)
      
      if (rulesError) {
        console.warn('Failed to restore some price rules:', rulesError)
        // Don't fail the entire recovery just because rules failed
      }
    }
    
    return { success: true, newId: newPriceBook.price_book_id }
    
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createEmergencyPriceBook(): Promise<{ success: boolean; id?: number; error?: string }> {
  const supabase = await createClient()
  
  try {
    const { data: newPriceBook, error } = await supabase
      .from('price_books')
      .insert({
        name: 'Bảng giá Khẩn cấp',
        channel: 'POS',
        is_active: true,
        notes: 'Bảng giá được tạo khẩn cấp khi không có bảng giá nào khả dụng',
        created_at: new Date().toISOString()
      })
      .select('price_book_id')
      .single()
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    return { success: true, id: newPriceBook?.price_book_id }
    
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
