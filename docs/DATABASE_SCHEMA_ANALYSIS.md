# 📊 PHÂN TÍCH CHI TIẾT DATABASE SCHEMA & DATA - CHUẨN BỊ TẠO SUPABASE FUNCTION

## 🔍 **1. PHÂN TÍCH CẤU TRÚC TABLES CHÍNH**

### **📋 INVOICES TABLE (Hóa đơn chính)**
```sql
CREATE TABLE public.invoices (
    invoice_id integer NOT NULL,                      -- PK, Auto increment
    invoice_code character varying(50) NOT NULL,      -- Unique invoice code
    invoice_date timestamp without time zone NOT NULL,
    return_code character varying(50),                -- For returns (nullable)
    customer_id integer,                              -- FK to customers (nullable)
    customer_name character varying(255) NOT NULL,    -- Denormalized customer name
    branch_id integer DEFAULT 1,                      -- FK to branches
    total_amount numeric(15,2) NOT NULL,              -- Final total >= 0
    customer_paid numeric(15,2) DEFAULT 0 NOT NULL,   -- Amount paid
    notes text,                                       -- ✅ Currently storing VAT/discount as JSON
    status character varying(50) DEFAULT 'completed', -- Order status
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
```

**✅ Constraints:**
- `chk_invoices_invoice_code_not_empty`: Invoice code cannot be empty
- `invoices_total_amount_check`: Total amount must be >= 0

### **📋 INVOICE_DETAILS TABLE (Chi tiết hóa đơn)**
```sql
CREATE TABLE public.invoice_details (
    detail_id integer NOT NULL,                       -- PK, Auto increment
    invoice_id integer,                               -- FK to invoices
    product_id integer,                               -- FK to products
    invoice_code character varying(50) NOT NULL,      -- Denormalized invoice code
    product_code character varying(50) NOT NULL,      -- Denormalized product code
    product_name character varying(500) NOT NULL,     -- Denormalized product name
    customer_name character varying(255) NOT NULL,    -- Denormalized customer name
    
    -- ✅ PRICING FIELDS (Very comprehensive!)
    quantity numeric(12,2) NOT NULL,                  -- Quantity > 0
    unit_price numeric(15,2) NOT NULL,                -- Unit price >= 0
    discount_percent numeric(5,2) DEFAULT 0,          -- Line discount % (0-100)
    discount_amount numeric(12,2) DEFAULT 0,          -- Line discount amount
    sale_price numeric(15,2) NOT NULL,                -- Final sale price >= 0
    line_total numeric(15,2) NOT NULL,                -- Line total >= 0
    subtotal numeric(15,2) NOT NULL,                  -- Line subtotal >= 0
    total_discount numeric(15,2) DEFAULT 0,           -- Total line discount
    
    -- ✅ PAYMENT METHOD BREAKDOWN (Already exists!)
    cash_payment numeric(15,2) DEFAULT 0,             -- Cash portion
    card_payment numeric(15,2) DEFAULT 0,             -- Card portion
    transfer_payment numeric(15,2) DEFAULT 0,         -- Transfer portion
    wallet_payment numeric(15,2) DEFAULT 0,           -- Wallet portion
    points_payment numeric(15,2) DEFAULT 0,           -- Points portion
    customer_paid numeric(15,2) DEFAULT 0,            -- Customer payment
    
    -- ✅ PROFIT TRACKING
    cost_price numeric(15,2) DEFAULT 0,               -- Product cost
    profit_amount numeric(15,2) DEFAULT 0,            -- Calculated profit
    
    -- Extensive denormalized fields for reporting...
    -- (delivery, customer details, etc.)
    
    created_at timestamp without time zone DEFAULT now(),
    customer_id integer
);
```

**✅ Comprehensive Constraints:**
- Quantity must be > 0
- Unit price, sale price, line total, subtotal must be >= 0
- Discount percent must be 0-100%
- Various empty string checks

### **📋 PRODUCTS TABLE (Sản phẩm)**
```sql
CREATE TABLE public.products (
    product_id integer NOT NULL,                      -- PK, Auto increment
    product_code character varying(50) NOT NULL,      -- Unique product code
    product_name character varying(500) NOT NULL,
    category_id integer,                              -- FK to categories
    
    -- ✅ PRICING & INVENTORY
    cost_price numeric(15,2) DEFAULT 0,               -- Purchase cost
    sale_price numeric(15,2) DEFAULT 0,               -- Selling price
    current_stock numeric(15,2) DEFAULT 0,            -- Current inventory
    reserved_stock numeric(10,2) DEFAULT 0,           -- Reserved stock
    available_stock numeric(10,2) DEFAULT 0,          -- Available stock
    min_stock numeric(15,2) DEFAULT 0,                -- Minimum threshold
    max_stock numeric(15,2) DEFAULT 0,                -- Maximum capacity
    
    -- ✅ MEDICINE SPECIFIC
    is_medicine boolean DEFAULT false,                -- Is pharmaceutical
    requires_prescription boolean DEFAULT false,      -- Needs prescription
    storage_condition character varying(255),         -- Storage requirements
    expiry_tracking boolean DEFAULT false,            -- Track expiry dates
    
    -- ✅ SALES CONTROL
    allow_sale boolean DEFAULT true,                  -- Can be sold
    track_serial boolean DEFAULT false,               -- Serial tracking
    is_active boolean DEFAULT true,                   -- Active status
    
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
```

### **📋 CUSTOMERS TABLE (Khách hàng)**
```sql
CREATE TABLE public.customers (
    customer_id integer NOT NULL,                     -- PK, Auto increment
    customer_code character varying(50) NOT NULL,     -- Unique customer code
    customer_name character varying(255) NOT NULL,
    customer_type_id integer DEFAULT 1,               -- FK to customer types
    
    -- ✅ DEBT MANAGEMENT (Critical for checkout!)
    debt_limit numeric(15,2) DEFAULT 0,               -- Maximum debt allowed
    current_debt numeric(15,2) DEFAULT 0,             -- Current outstanding debt
    
    -- ✅ ANALYTICS
    total_revenue numeric(15,2) DEFAULT 0,            -- Lifetime revenue
    total_profit numeric(15,2) DEFAULT 0,             -- Lifetime profit
    purchase_count integer DEFAULT 0,                 -- Number of purchases
    last_purchase_date timestamp without time zone,   -- Last purchase
    
    -- Contact & personal info
    phone character varying(20),
    email character varying(255),
    address text,
    gender character varying(10),
    
    status integer DEFAULT 1,                         -- Customer status
    is_active boolean DEFAULT true,                   -- Active flag
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
```

## 🔍 **2. PHÂN TÍCH DỮ LIỆU THỰC TẾ**

### **📊 INVOICE DATA SAMPLE:**
```sql
-- Sample invoice record:
570	HD004774	2025-07-07 14:23:21.723	\N	906	ANH CHÍNH - VÔ NHIỄM	1	4100000.00	0.00	\N	completed
```

**Quan sát:**
- ✅ Invoice codes follow pattern: HD + timestamp
- ✅ Total amounts in VND (Vietnamese Dong)
- ✅ Customer paid = 0 (indicating debt/credit sales)
- ✅ Notes field currently NULL (not storing VAT/discount info)

### **📊 CUSTOMER DATA SAMPLE:**
```sql
-- Sample customer with debt info:
830	KH000424	CHỊ TRINH - VĨNH CỬU 4K	1	1	\N	\N	\N	50000000.00	0.00	0.00	0.00	0	\N
```

**Quan sát:**
- ✅ Customer codes: KH + sequential number
- ✅ Debt limits: 50,000,000 VND (50M VND standard)
- ✅ Current debt tracking in place
- ✅ Revenue/profit analytics ready

## 🔍 **3. BUSINESS LOGIC REQUIREMENTS**

### **🚨 CRITICAL VALIDATIONS NEEDED:**
1. **Stock Validation**: Ensure sufficient inventory before sale
2. **Debt Limit Check**: Verify customer debt + new amount ≤ debt_limit
3. **Prescription Check**: Validate prescription for medicine products
4. **VAT/Discount Logic**: Proper calculation and storage
5. **Payment Integrity**: Payment method totals must match invoice total

### **🔄 TRANSACTION REQUIREMENTS:**
1. **Atomicity**: All operations must succeed or all fail
2. **Stock Updates**: Decrease product stock atomically
3. **Customer Updates**: Update debt, revenue, purchase stats
4. **Audit Trail**: Proper logging and timestamps

## 🎯 **4. FUNCTION DESIGN REQUIREMENTS**

### **📝 INPUT PARAMETERS:**
```sql
CREATE OR REPLACE FUNCTION create_pos_invoice(
    p_customer_id INTEGER,                    -- Customer ID (required)
    p_cart_items JSONB,                      -- Cart items with quantities
    p_vat_rate NUMERIC DEFAULT 0,            -- VAT rate (0, 5, 8, 10)
    p_discount_type VARCHAR DEFAULT 'percentage', -- 'percentage' or 'amount'
    p_discount_value NUMERIC DEFAULT 0,      -- Discount value
    p_payment_method VARCHAR DEFAULT 'cash', -- 'cash', 'card', 'transfer'
    p_received_amount NUMERIC DEFAULT NULL,  -- Amount received (for change)
    p_branch_id INTEGER DEFAULT 1           -- Branch ID
) RETURNS JSONB
```

### **🔄 TRANSACTION FLOW:**
1. **🔍 Validate Input**
   - Check customer exists and is active
   - Validate all cart products exist and available
   - Check prescription requirements

2. **💰 Calculate Totals**
   - Subtotal from cart items
   - Apply discount (percentage or amount)
   - Calculate VAT on post-discount amount
   - Final total = subtotal - discount + VAT

3. **🚨 Business Validations**
   - Check stock availability for all items
   - Verify customer debt limit won't be exceeded
   - Validate payment amount if provided

4. **💾 Create Invoice Records**
   - Insert into invoices table with calculated totals
   - Generate unique invoice code (HD + timestamp)
   - Store VAT/discount details in notes as JSON

5. **📋 Create Invoice Details**
   - Insert line items with payment method breakdown
   - Apply line-level calculations
   - Store profit calculations

6. **📦 Update Inventory**
   - Decrease product stock atomically
   - Update available stock calculations

7. **👤 Update Customer Stats**
   - Increase current debt (if not fully paid)
   - Update total revenue and purchase count
   - Set last purchase date

8. **✅ Return Result**
   - Return success with invoice details
   - Include any warnings or notes

### **⚠️ ERROR HANDLING:**
- Stock insufficient
- Customer debt limit exceeded
- Product requires prescription
- Payment amount insufficient
- Database constraint violations

## 🎯 **5. MIGRATION CONSIDERATIONS**

### **✅ EXISTING SCHEMA COMPATIBLE:**
- No structural changes needed
- Use existing payment breakdown fields
- Store enhanced data in notes field as JSON
- All constraints already in place

### **📊 REPORTING READY:**
- Payment method breakdown available
- Profit tracking built-in
- Customer analytics supported
- Inventory impact tracked

## 🚀 **6. IMPLEMENTATION STRATEGY**

### **Phase 1: Create Function**
- Implement core transaction logic
- Add comprehensive validation
- Ensure atomicity with transactions

### **Phase 2: Frontend Integration**
- Modify checkout to call function instead of direct inserts
- Add proper error handling
- Update logging to use function results

### **Phase 3: Testing & Monitoring**
- Test with existing data
- Monitor performance
- Validate business logic

### **Phase 4: Optional Enhancements**
- Add real-time inventory alerts
- Implement advanced discount rules
- Add promotion/loyalty support

---

**🎯 READY TO CREATE SUPABASE FUNCTION!**

The schema analysis is complete. The database is well-structured with comprehensive constraints, proper indexing, and excellent support for the POS checkout requirements. We can now proceed to create a robust Supabase function that leverages all existing schema features while adding the VAT/discount functionality in a transaction-safe manner.
