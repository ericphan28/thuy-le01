# 📊 PHÂN TÍCH SCHEMA HIỆN TẠI - INVOICES & INVOICE_DETAILS

## 🔍 CURRENT INVOICES TABLE STRUCTURE

### **Cấu trúc hiện tại (từ backup_thuyle_schema_complete.sql)**
```sql
CREATE TABLE public.invoices (
    invoice_id integer NOT NULL,              -- PK
    invoice_code character varying(50) NOT NULL,
    invoice_date timestamp without time zone NOT NULL,
    return_code character varying(50),        -- For returns
    customer_id integer,                      -- FK to customers
    customer_name character varying(255) NOT NULL,
    branch_id integer DEFAULT 1,
    total_amount numeric(15,2) NOT NULL,      -- Final total
    customer_paid numeric(15,2) DEFAULT 0 NOT NULL,
    notes text,
    status character varying(50) DEFAULT 'completed',
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
```

### **❌ THIẾU CÁC FIELD CHO VAT & DISCOUNT:**
- **subtotal_amount**: Tổng tiền trước VAT/discount
- **discount_type**: 'percentage' hoặc 'amount'
- **discount_value**: Giá trị giảm giá  
- **discount_amount**: Số tiền giảm thực tế
- **vat_rate**: Tỷ lệ VAT (%)
- **vat_amount**: Số tiền VAT
- **payment_method**: 'cash', 'card', 'transfer'

## 🔍 CURRENT INVOICE_DETAILS TABLE STRUCTURE

### **Cấu trúc hiện tại (Rất chi tiết!)**
```sql
CREATE TABLE public.invoice_details (
    detail_id integer NOT NULL,              -- PK
    invoice_id integer,                      -- FK to invoices
    product_id integer,                      -- FK to products
    invoice_code character varying(50) NOT NULL,
    product_code character varying(50) NOT NULL,
    product_name character varying(500) NOT NULL,
    customer_code character varying(50),
    customer_name character varying(255) NOT NULL,
    branch_id integer DEFAULT 1,
    
    -- Delivery fields (unused in POS)
    delivery_code character varying(50),
    pickup_address text,
    reconciliation_code character varying(50),
    
    -- Dates
    invoice_date timestamp without time zone NOT NULL,
    created_date timestamp without time zone,
    updated_date timestamp without time zone,
    
    -- Order tracking (unused in POS)
    order_code character varying(50),
    
    -- Customer details (denormalized)
    customer_phone character varying(20),
    customer_address text,
    customer_region character varying(100),
    customer_ward text,
    
    -- Receiver details (for delivery)
    receiver_name character varying(255),
    receiver_phone character varying(20),
    receiver_address text,
    receiver_region character varying(100),
    receiver_ward text,
    
    -- Sales channel
    sales_channel character varying(100),
    creator character varying(100),
    
    -- Delivery details
    delivery_partner text,
    delivery_service text,
    weight_gram numeric(10,2) DEFAULT 0,
    length_cm numeric(8,2) DEFAULT 0,
    width_cm numeric(8,2) DEFAULT 0,
    height_cm numeric(8,2) DEFAULT 0,
    delivery_fee numeric(12,2) DEFAULT 0,
    
    notes text,
    
    -- ✅ FINANCIAL FIELDS (Already comprehensive!)
    subtotal numeric(15,2) NOT NULL,         -- Line subtotal
    total_discount numeric(15,2) DEFAULT 0,  -- Line discount
    customer_paid numeric(15,2) DEFAULT 0,   -- Customer payment
    
    -- ✅ PAYMENT METHOD BREAKDOWN (Already exists!)
    cash_payment numeric(15,2) DEFAULT 0,
    card_payment numeric(15,2) DEFAULT 0,
    transfer_payment numeric(15,2) DEFAULT 0,
    wallet_payment numeric(15,2) DEFAULT 0,
    points_payment numeric(15,2) DEFAULT 0,
    
    -- Product details
    unit character varying(50),
    status character varying(50),
    barcode character varying(100),
    brand character varying(255),
    product_notes text,
    
    -- ✅ PRICING FIELDS (Very detailed!)
    quantity numeric(12,2) NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0,  -- Line-level discount %
    discount_amount numeric(12,2) DEFAULT 0,  -- Line-level discount amount
    sale_price numeric(15,2) NOT NULL,
    line_total numeric(15,2) NOT NULL,
    cost_price numeric(15,2) DEFAULT 0,
    profit_amount numeric(15,2) DEFAULT 0,
    
    created_at timestamp without time zone DEFAULT now(),
    customer_id integer
);
```

## 🎯 PHÂN TÍCH TÍNH NĂNG HIỆN TẠI

### **✅ ĐÃ CÓ SẴN (Rất tốt!):**
1. **Payment method breakdown**: `cash_payment`, `card_payment`, `transfer_payment`
2. **Line-level discount**: `discount_percent`, `discount_amount`
3. **Profit tracking**: `cost_price`, `profit_amount`
4. **Comprehensive denormalization**: Product/customer info được duplicate
5. **Delivery tracking**: Full logistics support

### **❌ THIẾU (Cần bổ sung ở invoice level):**
1. **Invoice-level VAT**: Không có field VAT ở invoice level
2. **Invoice-level discount**: Chỉ có line-level discount
3. **Subtotal tracking**: Không có subtotal trước VAT/discount ở invoice level

## 🚨 VẤN ĐỀ VỚI MIGRATION HIỆN TẠI

### **❌ Conflict với schema hiện tại:**
```sql
-- Code hiện tại cố gắng insert fields không tồn tại:
subtotal_amount,    -- ❌ Không tồn tại trong invoices table
discount_type,      -- ❌ Không tồn tại
discount_value,     -- ❌ Không tồn tại  
discount_amount,    -- ❌ Không tồn tại
vat_rate,          -- ❌ Không tồn tại
vat_amount,        -- ❌ Không tồn tại
payment_method     -- ❌ Không tồn tại
```

### **✅ Mapping vào schema hiện tại:**
```sql
-- Có thể sử dụng:
total_amount,       -- ✅ Đã có (final total)
customer_paid,      -- ✅ Đã có  
notes,             -- ✅ Đã có (có thể lưu VAT/discount info)

-- Payment method có thể tính từ invoice_details:
-- Nếu cash_payment > 0 → method = 'cash'
-- Nếu card_payment > 0 → method = 'card'  
-- Nếu transfer_payment > 0 → method = 'transfer'
```

## 💡 CHIẾN LƯỢC FIX

### **Option 1: Minimal Change (Khuyến nghị)**
1. **Sử dụng existing fields** trong invoice_details
2. **Calculate totals** từ invoice_details lên invoice level
3. **Store VAT/discount info** trong `notes` field (JSON format)

### **Option 2: Full Schema Enhancement**
1. **Chạy migration SQL** để thêm fields vào invoices table
2. **Update code** để sử dụng new fields
3. **Migrate existing data** với default values

## 🎯 RECOMMENDED APPROACH

### **Immediate Fix (cho current checkout):**
```javascript
// Sử dụng existing schema, calculate payment method từ invoice_details
const invoiceData = {
  invoice_code: invoiceCode,
  invoice_date: new Date().toISOString(),
  customer_id: selectedCustomer.customer_id,
  customer_name: selectedCustomer.customer_name,
  total_amount: total,                    // ✅ Existing field
  customer_paid: paymentData.receivedAmount || total, // ✅ Existing field
  notes: JSON.stringify({                 // ✅ Store detailed info in JSON
    payment_method: paymentData.method,
    vat_rate: vatRate,
    vat_amount: tax,
    discount_type: discountType,
    discount_value: discountValue,
    discount_amount: discountAmount,
    subtotal_amount: subtotal
  })
}

// Invoice details với payment breakdown
const invoiceDetails = cart.map(item => ({
  // ... existing fields ...
  cash_payment: paymentData.method === 'cash' ? item.line_total : 0,    // ✅ Existing
  card_payment: paymentData.method === 'card' ? item.line_total : 0,    // ✅ Existing  
  transfer_payment: paymentData.method === 'transfer' ? item.line_total : 0, // ✅ Existing
  discount_percent: 0,                    // ✅ Line-level discount (if needed)
  discount_amount: 0,                     // ✅ Line-level discount (if needed)
}))
```

## 🎯 NEXT STEPS

1. **✅ Fix checkout code** để tương thích với existing schema
2. **🔄 Optional**: Chạy migration sau để có dedicated fields
3. **📊 Create views** để report VAT/discount từ notes JSON
4. **🧪 Test thoroughly** với existing data
