import { createClient } from '@/lib/supabase/client';

// Test script to debug inbound orders loading
async function testInboundOrders() {
  const supabase = createClient();
  
  console.log('=== Testing Inbound Orders API ===');
  
  try {
    // 1. Test direct view query
    const { data: viewData, error: viewError } = await supabase
      .from('inbound_orders_summary')
      .select('*');
    
    console.log('Direct view query result:', {
      data: viewData,
      error: viewError,
      count: viewData?.length
    });
    
    if (viewData) {
      console.log('Sample record:', viewData[0]);
    }
    
    // 2. Test suppliers query
    const { data: suppliersData, error: suppliersError } = await supabase
      .from('suppliers')
      .select('supplier_id, supplier_name')
      .limit(5);
    
    console.log('Suppliers query result:', {
      data: suppliersData,
      error: suppliersError
    });
    
    // 3. Test filtered query (like in the component)
    if (suppliersData && suppliersData.length > 0) {
      const firstSupplierId = suppliersData[0].supplier_id;
      
      const { data: filteredData, error: filteredError } = await supabase
        .from('inbound_orders_summary')
        .select('*')
        .eq('supplier_id', firstSupplierId);
      
      console.log(`Filtered by supplier_id ${firstSupplierId}:`, {
        data: filteredData,
        error: filteredError
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).testInboundOrders = testInboundOrders;
}

export default testInboundOrders;
