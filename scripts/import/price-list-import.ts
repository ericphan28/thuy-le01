/*
  Importer: Default Price List (TSV)
  - Reads: public/du-lieu-goc/bang-gia-mac-dinh.txt
  - Maps columns (tab-delimited): code, name, unit, category, stock, price1, price2, price3
  - Updates products: sale_price, base_price, cost_price (no stock updates)
  - Upserts categories by name (best effort)
  Usage (PowerShell):
    npx ts-node scripts/import/price-list-import.ts --file public/du-lieu-goc/bang-gia-mac-dinh.txt
    npx ts-node scripts/import/price-list-import.ts --dry-run
*/

import fs from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

interface Row {
  code?: string
  name?: string
  unit?: string
  category?: string
  stock?: string
  price1?: string
  price2?: string
  price3?: string
}

interface ParsedRow {
  code?: string
  name: string
  unit?: string
  category?: string
  price1: number
  price2: number
  price3: number
  sale_price: number
  suggested_cost?: number | null
}

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const fileArgIdx = args.findIndex(a => a === '--file')
const filePath = fileArgIdx >= 0 ? args[fileArgIdx + 1] : 'public/du-lieu-goc/bang-gia-mac-dinh.txt'

// Load env from .env.local (if present) then .env as fallback
try {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
  dotenv.config()
} catch (e) {
  // ignore
}

function parseNumber(x?: string): number {
  if (!x) return 0
  const v = x.replace(/,/g, '').trim()
  if (!v) return 0
  const n = Number(v)
  return isFinite(n) ? n : 0
}

function resolveSalePrice(p1: number, p2: number, p3: number): number {
  if (p3 > 0) return p3
  if (p2 > 0) return p2
  return p1
}

function resolveSuggestedCost(p1: number, p2: number, p3: number): number | null {
  if (p1 > 0) return p1
  const candidates = [p2, p3].filter(n => n > 0)
  if (candidates.length > 0) return Math.min(...candidates)
  return null
}

function isLikelyValidCode(code?: string) {
  if (!code) return false
  const c = code.trim()
  // Accept typical patterns: SP000123, ABC1234, etc.
  if (/^SP\d{3,}$/.test(c)) return true
  if (/^[A-Z]{2,}\d{3,}$/.test(c)) return true
  return false
}

function normalizeNameKey(raw?: string) {
  if (!raw) return ''
  let s = raw.trim()
  // strip leading markers like '#'
  s = s.replace(/^#+\s*/, '')
  // remove content in parentheses for key2 later if needed
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
  s = s.toLowerCase()
  // collapse multiple spaces and punctuation into single spaces
  s = s.replace(/[^a-z0-9]+/g, ' ')
  s = s.trim().replace(/\s+/g, ' ')
  return s
}

function normalizeNameKeyLoose(raw?: string) {
  if (!raw) return ''
  let s = raw.trim()
  s = s.replace(/^#+\s*/, '')
  // drop parenthetical annotations completely
  s = s.replace(/\([^)]*\)/g, ' ')
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  s = s.toLowerCase()
  // remove common unit tokens
  s = s.replace(/\b(ml|lit|l\u00edt|kg|g|ds|chai|lo|lọ|hop|hộp|bo|bộ|bich|bịch)\b/gi, ' ')
  s = s.replace(/[^a-z0-9]+/g, ' ')
  s = s.trim().replace(/\s+/g, ' ')
  return s
}

async function main() {
  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined
  const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) as string | undefined
  const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY || process.env.SUPABASE_ANON_KEY) as string | undefined
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY

  const canConnect = Boolean(SUPABASE_URL && key)
  const supabase = canConnect ? createClient(SUPABASE_URL!, key!) : null as any
  if (!canConnect && !isDryRun) {
    console.error('Missing SUPABASE_URL or key (prefer SUPABASE_SERVICE_ROLE_KEY). For dry-run you can skip envs.')
    process.exit(1)
  }

  const absPath = path.resolve(filePath)
  if (!fs.existsSync(absPath)) {
    console.error('File not found:', absPath)
    process.exit(1)
  }

  const raw = fs.readFileSync(absPath, 'utf8')
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0)

  const rows: Row[] = lines.map(line => {
    const parts = line.split('\t')
    return {
      code: parts[0]?.trim(),
      name: parts[1]?.trim(),
      unit: parts[2]?.trim(),
      category: parts[3]?.trim(),
      stock: parts[4]?.trim(),
      price1: parts[5]?.trim(),
      price2: parts[6]?.trim(),
      price3: parts[7]?.trim(),
    }
  })

  const parsed: ParsedRow[] = rows.map(r => {
    const p1 = parseNumber(r.price1)
    const p2 = parseNumber(r.price2)
    const p3 = parseNumber(r.price3)
    const sale = resolveSalePrice(p1, p2, p3)
    const cost = resolveSuggestedCost(p1, p2, p3)
    return {
      code: r.code && r.code.length > 0 ? r.code : undefined,
      name: (r.name || '').trim(),
      unit: r.unit && r.unit.length > 0 ? r.unit : undefined,
      category: r.category && r.category.length > 0 ? r.category : undefined,
      price1: p1,
      price2: p2,
      price3: p3,
      sale_price: sale,
      suggested_cost: cost,
    }
  })

  // Ensure categories exist (best effort)
  const distinctCategories = Array.from(new Set(parsed.map(p => (p.category || '').trim()).filter(Boolean)))
  if (!canConnect) {
    // Offline analysis
    console.log(`Categories detected: ${distinctCategories.length}`)
  } else {
    for (const catName of distinctCategories) {
      const { data: existing, error: selErr } = await supabase
        .from('product_categories')
        .select('category_id, category_name')
        .ilike('category_name', catName)
        .limit(1)
      if (selErr) {
        console.warn('Category select error:', selErr.message)
        continue
      }
      if (!existing || existing.length === 0) {
        if (isDryRun) {
          console.log(`[DRY] would create category: ${catName}`)
        } else {
          const code = catName.toLowerCase().replace(/\s+/g, '_')
          const { error: insErr } = await supabase
            .from('product_categories')
            .insert({ category_code: code, category_name: catName, is_active: true })
          if (insErr) console.warn('Category insert error:', insErr.message)
        }
      }
    }
  }

  let updated = 0
  const unmatched: ParsedRow[] = []
  // Optional: build an in-memory index of products by normalized names to help match
  let productIndexStrict: Map<string, any[]> | undefined
  let productIndexLoose: Map<string, any[]> | undefined
  async function ensureProductIndexes() {
    if (!canConnect || (productIndexStrict && productIndexLoose)) return
    const { data, error } = await supabase
      .from('products')
      .select('product_id, product_code, product_name, category_id, sale_price, base_price, cost_price')
    if (error) return
    productIndexStrict = new Map()
    productIndexLoose = new Map()
    for (const p of data!) {
      const k1 = normalizeNameKey(p.product_name)
      const k2 = normalizeNameKeyLoose(p.product_name)
      if (k1) {
        const arr = productIndexStrict.get(k1) || []
        arr.push(p)
        productIndexStrict.set(k1, arr)
      }
      if (k2) {
        const arr = productIndexLoose.get(k2) || []
        arr.push(p)
        productIndexLoose.set(k2, arr)
      }
    }
  }
  for (const r of parsed) {
    if (!r.name) continue

    // Try by code first
    let product: any = null
    const codeOk = isLikelyValidCode(r.code)
    if (codeOk && canConnect) {
      const { data, error } = await supabase
        .from('products')
        .select('product_id, product_code, product_name, category_id, sale_price, base_price, cost_price')
        .eq('product_code', r.code)
        .limit(1)
        .maybeSingle()
      if (!error && data) product = data
    }

    // Then by name (case-insensitive exact)
    if (!product && canConnect) {
      const { data, error } = await supabase
        .from('products')
        .select('product_id, product_code, product_name, category_id, sale_price, base_price, cost_price')
        .ilike('product_name', r.name)
        .limit(1)
        .maybeSingle()
      if (!error && data) product = data
    }

    // Finally by normalized keys (strict, then loose) if still not found
    if (!product && canConnect) {
      await ensureProductIndexes()
      const k1 = normalizeNameKey(r.name)
      const k2 = normalizeNameKeyLoose(r.name)
      if (productIndexStrict && k1) {
        const candidates = productIndexStrict.get(k1) || []
        if (candidates.length === 1) product = candidates[0]
      }
      if (!product && productIndexLoose && k2) {
        const candidates = productIndexLoose.get(k2) || []
        if (candidates.length === 1) product = candidates[0]
      }
    }

    if (!product) {
      if (r.price1 === 0 && r.price2 === 0 && r.price3 === 0) {
        // all zero -> record unmatched (reason)
        unmatched.push(r)
      } else {
        unmatched.push(r)
      }
      continue
    }

    // Resolve category id if provided
    let category_id: number | undefined
  if (r.category && canConnect) {
      const { data: catRow } = await supabase
        .from('product_categories')
        .select('category_id, category_name')
        .ilike('category_name', r.category)
        .limit(1)
        .maybeSingle()
      if (catRow) category_id = catRow.category_id
    }

    const updates: Record<string, any> = {
      sale_price: Math.max(0, r.sale_price),
      base_price: Math.max(0, r.sale_price),
      updated_at: new Date().toISOString(),
    }
    if (r.suggested_cost && r.suggested_cost > 0) updates.cost_price = r.suggested_cost
    if (category_id) updates.category_id = category_id

    if (isDryRun) {
      console.log(`[DRY] update product ${product.product_code || product.product_id}:`, updates)
      updated++
    } else if (canConnect) {
      const { error: updErr } = await supabase
        .from('products')
        .update(updates)
        .eq('product_id', product.product_id)
      if (updErr) {
        console.warn('Update error for', product.product_id, updErr.message)
      } else {
        updated++
      }
    }
  }

  // Offline summary when cannot connect
  if (!canConnect) {
    const total = parsed.length
    const withCode = parsed.filter(p => p.code && p.code.trim().length > 0).length
    const zeroAll = parsed.filter(p => p.price1 === 0 && p.price2 === 0 && p.price3 === 0).length
    const price3Avail = parsed.filter(p => p.price3 > 0).length
    const suspiciousService = parsed.filter(p => /cước|vận chuyển|phí/i.test(p.name)).length
    console.log('--- DRY-RUN (offline) SUMMARY ---')
    console.log({ total, withCode, price3Avail, zeroAll, suspiciousService })
  }

  // Write unmatched table for review (optional)
  if (!isDryRun && canConnect && unmatched.length > 0) {
    const rows = unmatched.map(u => ({
      product_code: u.code || null,
      product_name: u.name,
      category_name: u.category || null,
      price1: u.price1,
      price2: u.price2,
      price3: u.price3,
      reason: (u.price1 === 0 && u.price2 === 0 && u.price3 === 0) ? 'all_zero_prices' : 'no_match_by_code_or_name',
      created_at: new Date().toISOString(),
    }))
  const { error: insErr } = await supabase.from('price_import_unmatched').insert(rows)
  if (insErr) console.warn('Insert unmatched error:', insErr.message || 'unknown error', '-> ensure table exists and grants/RLS allow inserts')
  }

  // Always export unmatched to local JSON for review
  try {
    if (unmatched.length > 0) {
      const outDir = path.resolve(process.cwd(), 'json-output')
      const outPath = path.join(outDir, 'price_import_unmatched.json')
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
      const rows = unmatched.map(u => ({
        product_code: u.code || null,
        product_name: u.name,
        category_name: u.category || null,
        price1: u.price1,
        price2: u.price2,
        price3: u.price3,
        reason: (u.price1 === 0 && u.price2 === 0 && u.price3 === 0) ? 'all_zero_prices' : 'no_match_by_code_or_name',
        exported_at: new Date().toISOString(),
      }))
      fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf8')
      console.log('Exported unmatched to', outPath)
    }
  } catch (e) {
    console.warn('Failed to export unmatched file:', (e as Error).message)
  }

  console.log('Done. Updated products:', updated, 'Unmatched:', unmatched.length)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
