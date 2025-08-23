/*
  Reconcile unmatched price rows by mapping source -> target product codes via CSV.
  Usage (PowerShell):
    npx tsx scripts\import\reconcile-unmatched.ts --csv scripts\import\reconcile-map.csv
*/

import fs from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

interface MapRow { source_code?: string; source_name?: string; target_code?: string; target_name?: string }

const args = process.argv.slice(2)
const csvIdx = args.findIndex(a => a === '--csv')
const csvPath = csvIdx >= 0 ? args[csvIdx + 1] : 'scripts/import/reconcile-map.csv'

try {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
  dotenv.config()
} catch {}

function parseCSV(content: string): MapRow[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'))
  return lines.map(l => {
    const [source_code, source_name, target_code, target_name] = l.split(',')
    return { source_code: source_code?.trim(), source_name: source_name?.trim(), target_code: target_code?.trim(), target_name: target_name?.trim() }
  })
}

async function main() {
  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined
  const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) as string | undefined
  const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY || process.env.SUPABASE_ANON_KEY) as string | undefined
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
  if (!SUPABASE_URL || !key) {
    console.error('Thiếu SUPABASE_URL hoặc key (ưu tiên SERVICE_ROLE).')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, key)

  const abs = path.resolve(csvPath)
  if (!fs.existsSync(abs)) {
    console.error('Không tìm thấy file CSV:', abs)
    process.exit(1)
  }
  const maps = parseCSV(fs.readFileSync(abs, 'utf8'))
  if (!maps.length) {
    console.log('CSV trống, không có gì để reconcile.')
    return
  }

  let fixed = 0
  for (const m of maps) {
    // lấy các unmatched tương ứng
    let filter: any = {}
    if (m.source_code) filter.product_code = m.source_code
    if (m.source_name) filter.product_name = m.source_name
    const { data: rows, error: selErr } = await supabase
      .from('price_import_unmatched')
      .select('id, product_code, product_name, price1, price2, price3')
      .match(filter)
    if (selErr) { console.error('Lỗi đọc unmatched:', selErr.message); continue }
    if (!rows || rows.length === 0) continue

    // tìm product_id theo target_code/target_name
    let product: any = null
    if (m.target_code) {
      const { data } = await supabase.from('products').select('product_id, product_code').eq('product_code', m.target_code).maybeSingle()
      if (data) product = data
    }
    if (!product && m.target_name) {
      const { data } = await supabase.from('products').select('product_id, product_code').ilike('product_name', m.target_name).maybeSingle()
      if (data) product = data
    }
    if (!product) { console.warn('Không tìm thấy sản phẩm đích cho map:', m); continue }

    for (const r of rows) {
      // tính sale_price theo quy tắc cũ: price3 > price2 > price1
      const sale = Math.max(r.price3 || 0, r.price2 || 0, r.price1 || 0)
      const updates: any = { sale_price: sale, base_price: sale, updated_at: new Date().toISOString() }
      const { error: updErr } = await supabase.from('products').update(updates).eq('product_id', product.product_id)
      if (updErr) { console.error('Lỗi update:', updErr.message); continue }
      fixed++
      // xóa unmatched sau khi đã xử lý
      await supabase.from('price_import_unmatched').delete().eq('id', r.id)
    }
  }

  console.log(`Đã reconcile và cập nhật ${fixed} dòng từ unmatched.`)
}

main().catch(err => { console.error(err); process.exit(1) })
