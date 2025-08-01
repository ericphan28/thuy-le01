/**
 * Simple Supabase Connection Test
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

function loadEnvFile(): Record<string, string> {
  try {
    const envContent = readFileSync('.env.local', 'utf8')
    const envVars: Record<string, string> = {}
    
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim()
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=')
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim()
        }
      }
    })
    
    return envVars
  } catch (error) {
    console.error('❌ Could not load .env.local file:', error)
    return {}
  }
}

async function testConnection() {
  console.log('🚀 Testing Supabase Connection...')
  console.log('=' .repeat(50))
  
  // Load environment variables
  const envVars = loadEnvFile()
  console.log('📋 Environment variables loaded:')
  console.log('NEXT_PUBLIC_SUPABASE_URL:', envVars.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET')
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY ? `${envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20)}...` : 'NOT SET')
  
  const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  // Validate configuration
  if (!supabaseUrl || supabaseUrl === 'your_url' || !supabaseUrl.startsWith('http')) {
    console.error('❌ Invalid or missing SUPABASE_URL')
    console.error('Please update .env.local with your actual Supabase URL')
    console.error('Example: NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co')
    return
  }
  
  if (!supabaseKey || supabaseKey === 'your_key' || supabaseKey.length < 50) {
    console.error('❌ Invalid or missing SUPABASE_ANON_KEY')
    console.error('Please update .env.local with your actual Supabase anon key')
    console.error('Example: NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
    return
  }
  
  try {
    // Create Supabase client
    console.log('\n🔗 Creating Supabase client...')
    const supabase = createClient(supabaseUrl, supabaseKey)
    console.log('✅ Supabase client created successfully')
    
    // Test basic connection
    console.log('\n🧪 Testing database connection...')
    const { data, error } = await supabase
      .from('customers')
      .select('customer_id')
      .limit(1)
    
    if (error) {
      console.error('❌ Connection test failed:', error.message)
      console.error('Details:', error)
      
      // Provide helpful suggestions based on error
      if (error.message.includes('relation "customers" does not exist')) {
        console.log('\n💡 Suggestion: The "customers" table does not exist in your database.')
        console.log('Please ensure you have imported the schema properly.')
      } else if (error.message.includes('Invalid API key')) {
        console.log('\n💡 Suggestion: Check your API key in .env.local')
      } else if (error.message.includes('JWT')) {
        console.log('\n💡 Suggestion: Your API key might be expired or invalid')
      }
    } else {
      console.log('✅ Database connection successful!')
      console.log(`📊 Sample query returned ${data?.length || 0} records`)
      
      // Test additional tables
      console.log('\n🔍 Testing other tables...')
      
      const tables = ['customer_types', 'invoices', 'products', 'branches']
      for (const table of tables) {
        try {
          const { data: tableData, error: tableError } = await supabase
            .from(table)
            .select('*')
            .limit(1)
          
          if (tableError) {
            console.log(`⚠️  Table "${table}": ${tableError.message}`)
          } else {
            console.log(`✅ Table "${table}": OK (${tableData?.length || 0} sample records)`)
          }
        } catch (err) {
          console.log(`❌ Table "${table}": Error testing`)
        }
      }
      
      // Test RPC functions
      console.log('\n🧮 Testing RPC functions...')
      
      const functions = [
        { name: 'search_customers_with_stats', params: { search_term: '', limit_count: 5 } },
        { name: 'get_financial_summary', params: { date_from: '2025-07-01', date_to: '2025-07-31' } }
      ]
      
      for (const func of functions) {
        try {
          const { data: funcData, error: funcError } = await supabase
            .rpc(func.name, func.params)
          
          if (funcError) {
            console.log(`⚠️  Function "${func.name}": ${funcError.message}`)
          } else {
            console.log(`✅ Function "${func.name}": OK`)
          }
        } catch (err) {
          console.log(`❌ Function "${func.name}": Error testing`)
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    
    if (error instanceof Error && error.message.includes('Invalid URL')) {
      console.log('\n💡 Suggestion: Check your SUPABASE_URL format in .env.local')
      console.log('It should start with https:// and end with .supabase.co')
    }
  }
  
  console.log('\n' + '=' .repeat(50))
  console.log('🏁 Connection test completed')
}

// Run the test
testConnection().catch(console.error)
