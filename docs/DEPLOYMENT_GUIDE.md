# 📋 DEPLOYMENT STEPS - SUPABASE POS CHECKOUT FUNCTION

## 🚀 **STEP 1: DEPLOY FUNCTION TO SUPABASE**

### **Option A: Supabase Dashboard (Recommended)**
1. Login to Supabase Dashboard
2. Go to **SQL Editor**
3. Copy content from `sql/pos_checkout_function.sql`
4. Click **Run** to create function

### **Option B: Command Line**
```bash
# Using Supabase CLI
supabase db push

# Or using psql
psql -h your-db-host -p 5432 -U postgres -d your-db-name -f sql/pos_checkout_function.sql
```

## 🧪 **STEP 2: TEST FUNCTION**

### **Test 1: Simple Checkout**
```sql
-- Test basic checkout
SELECT public.create_pos_invoice(
    p_customer_id := 833,  -- Test customer: Thắng bida (test)
    p_cart_items := '[
        {"product_id": 1, "quantity": 1, "unit_price": 50000}
    ]'::jsonb,
    p_vat_rate := 0,
    p_discount_type := 'percentage',
    p_discount_value := 0,
    p_payment_method := 'cash',
    p_received_amount := 50000
);
```

### **Test 2: With VAT & Discount**
```sql
-- Test with VAT and discount
SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 2, "unit_price": 50000},
        {"product_id": 2, "quantity": 1, "unit_price": 30000}
    ]'::jsonb,
    p_vat_rate := 10,  -- 10% VAT
    p_discount_type := 'percentage',
    p_discount_value := 5,  -- 5% discount
    p_payment_method := 'cash',
    p_received_amount := 150000
);
```

### **Test 3: Error Cases**
```sql
-- Test insufficient stock
SELECT public.create_pos_invoice(
    p_customer_id := 833,
    p_cart_items := '[
        {"product_id": 1, "quantity": 9999999, "unit_price": 50000}
    ]'::jsonb
);

-- Test invalid customer
SELECT public.create_pos_invoice(
    p_customer_id := 99999,
    p_cart_items := '[
        {"product_id": 1, "quantity": 1, "unit_price": 50000}
    ]'::jsonb
);
```

## 🔧 **STEP 3: UPDATE FRONTEND CODE**

### **Replace Direct Insert với Function Call:**

```typescript
// OLD: Direct inserts (current)
const { data: invoice, error: invoiceError } = await supabase
  .from('invoices')
  .insert(invoiceData)

// NEW: Function call
const { data: result, error } = await supabase.rpc('create_pos_invoice', {
  p_customer_id: selectedCustomer.customer_id,
  p_cart_items: cart.map(item => ({
    product_id: item.product.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price
  })),
  p_vat_rate: vatRate,
  p_discount_type: discountType,
  p_discount_value: discountValue,
  p_payment_method: paymentData.method,
  p_received_amount: paymentData.receivedAmount,
  p_branch_id: 1,
  p_created_by: 'POS System'
})

if (error) {
  console.error('Function call error:', error)
  return
}

const functionResult = result as any
if (!functionResult.success) {
  console.error('Business logic error:', functionResult.error)
  toast.error(functionResult.error)
  return
}

// Success!
console.log('Invoice created:', functionResult.invoice_code)
toast.success(`Hóa đơn ${functionResult.invoice_code} đã được tạo thành công!`)
```

## 📊 **STEP 4: VERIFY RESULTS**

### **Check Data Integrity:**
```sql
-- Verify invoice was created
SELECT * FROM invoices 
WHERE invoice_code = 'HD...'  -- Replace with actual invoice code
ORDER BY created_at DESC LIMIT 1;

-- Verify invoice details
SELECT * FROM invoice_details 
WHERE invoice_code = 'HD...'  -- Replace with actual invoice code;

-- Verify stock was updated
SELECT product_id, product_name, current_stock 
FROM products 
WHERE product_id IN (...);  -- Replace with actual product IDs

-- Verify customer stats updated
SELECT customer_id, customer_name, current_debt, total_revenue, purchase_count 
FROM customers 
WHERE customer_id = ...;  -- Replace with actual customer ID
```

## 🚨 **STEP 5: ERROR MONITORING**

### **Common Error Codes:**
- `INVALID_INPUT`: Missing required parameters
- `CUSTOMER_NOT_FOUND`: Invalid customer ID
- `VALIDATION_FAILED`: Stock/business rule violations
- `DEBT_LIMIT_EXCEEDED`: Customer debt limit exceeded
- `INSUFFICIENT_PAYMENT`: Not enough payment
- `DATABASE_ERROR`: SQL errors

### **Monitoring Queries:**
```sql
-- Check recent function calls (if logging enabled)
SELECT * FROM pg_stat_user_functions 
WHERE funcname = 'create_pos_invoice';

-- Check for any constraint violations
SELECT * FROM information_schema.check_constraints 
WHERE constraint_schema = 'public';
```

## 🎯 **STEP 6: PERFORMANCE OPTIMIZATION**

### **If needed, add indexes:**
```sql
-- Invoice lookup optimization
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date 
ON invoices(customer_id, invoice_date DESC);

-- Product stock lookup optimization  
CREATE INDEX IF NOT EXISTS idx_products_active_stock 
ON products(is_active, allow_sale, current_stock) 
WHERE is_active = true AND allow_sale = true;

-- Customer debt lookup optimization
CREATE INDEX IF NOT EXISTS idx_customers_active_debt 
ON customers(is_active, current_debt, debt_limit) 
WHERE is_active = true;
```

---

## 🚀 **READY TO DEPLOY!**

Function được thiết kế để tương thích 100% với schema hiện tại và có thể thay thế hoàn toàn direct insert approach hiện tại.

**Advantages của Function approach:**
- ✅ Transaction safety
- ✅ Business logic centralized  
- ✅ Better error handling
- ✅ Comprehensive validation
- ✅ Audit trail
- ✅ Performance optimization potential
