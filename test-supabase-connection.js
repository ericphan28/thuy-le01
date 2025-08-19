require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Test connection to Supabase
async function testConnection() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;
    
    console.log('🔗 Testing Supabase connection...');
    console.log('URL:', supabaseUrl);
    console.log('Key:', supabaseKey ? `${supabaseKey.substring(0, 20)}...` : 'NOT SET');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not found in environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Test basic query
    const { data: products, error } = await supabase
      .from('products')
      .select('product_id, product_name, current_stock')
      .limit(3);
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Connection successful!');
    console.log('📦 Sample products:', products);
    
    // Test if stock_movements table exists
    const { data: movements, error: movError } = await supabase
      .from('stock_movements')
      .select('movement_id')
      .limit(1);
    
    if (movError) {
      console.log('❌ stock_movements table not found:', movError.message);
      console.log('👉 Please run the SQL migration in Supabase SQL Editor first');
      console.log('📋 Copy and run this file: sql/simple_stock_movements.sql');
    } else {
      console.log('✅ stock_movements table exists!');
      console.log('📊 Sample movements:', movements?.length || 0, 'records');
    }
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();
