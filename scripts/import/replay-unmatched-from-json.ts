/*
  Replay unmatched rows (from json-output/price_import_unmatched.json) into DB
  Usage (PowerShell):
    npx tsx scripts\import\replay-unmatched-from-json.ts
    npx tsx scripts\import\replay-unmatched-from-json.ts --file json-output\price_import_unmatched.json
*/

import fs from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

type UnmatchedRow = {
  product_code: string | null
  product_name: string
  category_name: string | null
  price1: number
  price2: number
  price3: number
  reason: string
  exported_at?: string
}

const args = process.argv.slice(2)
const fileArgIdx = args.findIndex(a => a === '--file')
const filePath = fileArgIdx >= 0 ? args[fileArgIdx + 1] : 'json-output/price_import_unmatched.json'

// Load envs
try {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
  dotenv.config()
} catch {}

async function main() {
  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined
  const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) as string | undefined
  const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY || process.env.SUPABASE_ANON_KEY) as string | undefined
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !key) {
    console.error('Missing SUPABASE_URL or key (prefer SUPABASE_SERVICE_ROLE_KEY).')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, key)

  const abs = path.resolve(filePath)
  if (!fs.existsSync(abs)) {
    console.error('File not found:', abs)
    process.exit(1)
  }

  const rows: UnmatchedRow[] = JSON.parse(fs.readFileSync(abs, 'utf8'))
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No rows to insert.')
    return
  }

  // Normalize shape to DB columns
  const mapped = rows.map(r => ({
    product_code: r.product_code ?? null,
    product_name: r.product_name,
    category_name: r.category_name ?? null,
    price1: r.price1 ?? 0,
    price2: r.price2 ?? 0,
    price3: r.price3 ?? 0,
    reason: r.reason || 'no_match_by_code_or_name',
    created_at: new Date().toISOString(),
  }))

  const chunkSize = 500
  let inserted = 0
  for (let i = 0; i < mapped.length; i += chunkSize) {
    const chunk = mapped.slice(i, i + chunkSize)
    const { error } = await supabase.from('price_import_unmatched').insert(chunk)
    if (error) {
      console.error('Insert error:', error.message)
      process.exit(1)
    }
    inserted += chunk.length
  }

  console.log(`Inserted ${inserted} unmatched rows into price_import_unmatched`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
