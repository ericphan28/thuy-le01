# 📋 POS CHECKOUT PROCESS - DATABASE OPERATIONS

## 🔄 CHECKOUT WORKFLOW

### 1. **Validation Phase**
```javascript
// Kiểm tra điều kiện checkout
if (cart.length === 0 || !selectedCustomer) return
```

### 2. **Calculation Phase**
```javascript
// Tính toán chi tiết
const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0)
const discountAmount = discountType === 'percentage' 
  ? (subtotal * discountValue) / 100
  : Math.min(discountValue, subtotal)
const afterDiscount = subtotal - discountAmount
const tax = afterDiscount * (vatRate / 100)
const total = afterDiscount + tax
```

## 📊 DATABASE OPERATIONS

### 3. **Invoice Creation (invoices table)**
```sql
INSERT INTO invoices (
  invoice_code,          -- Generated: HD{timestamp}
  invoice_date,          -- Current timestamp ISO string
  customer_id,           -- ID khách hàng được chọn
  customer_name,         -- Tên khách hàng (denormalized)
  subtotal_amount,       -- 🆕 Tổng tiền trước VAT và giảm giá
  discount_type,         -- 🆕 'percentage' hoặc 'amount'
  discount_value,        -- 🆕 Giá trị giảm giá (% hoặc số tiền)
  discount_amount,       -- 🆕 Số tiền giảm giá thực tế
  vat_rate,             -- 🆕 Tỷ lệ VAT (%)
  vat_amount,           -- 🆕 Số tiền VAT
  total_amount,          -- Tổng tiền sau VAT và giảm giá
  customer_paid,         -- Số tiền khách trả
  payment_method,        -- 🆕 'cash', 'card', 'transfer'
  status,                -- 'completed'
  notes                  -- Chi tiết bổ sung
) VALUES (...)
```

**🆕 Enhanced Invoice Schema Benefits:**
- **Separate VAT tracking**: Detailed VAT calculation storage
- **Discount analytics**: Track discount effectiveness
- **Payment method analysis**: Payment preference insights
- **Financial reporting**: Accurate tax and discount reports

### 4. **Invoice Details Creation (invoice_details table)**
```sql
INSERT INTO invoice_details (
  invoice_id,            -- FK to invoices.invoice_id
  product_id,            -- FK to products.product_id
  invoice_code,          -- Denormalized invoice code
  product_code,          -- Denormalized product code
  product_name,          -- Denormalized product name
  customer_name,         -- Denormalized customer name
  invoice_date,          -- Denormalized invoice date
  quantity,              -- Số lượng bán
  unit_price,            -- Giá bán đơn vị
  sale_price,            -- = unit_price (legacy)
  line_total,            -- quantity * unit_price
  subtotal,              -- = line_total (legacy)
  cash_payment,          -- Tiền mặt (nếu method = 'cash')
  card_payment,          -- Tiền thẻ (nếu method = 'card')
  transfer_payment       -- Tiền chuyển khoản (nếu method = 'transfer')
) VALUES (...)
```

### 5. **Stock Update (products table)**
```sql
UPDATE products 
SET current_stock = current_stock - {quantity}
WHERE product_id = {product_id}
```

## 🎯 BUSINESS LOGIC DETAILS

### **VAT Calculation**
- **Input**: VAT rate (0%, 5%, 8%, 10%)
- **Applied on**: Subtotal AFTER discount
- **Formula**: `tax = (subtotal - discount) * (vatRate / 100)`

### **Discount Calculation**
- **Percentage**: `discount = subtotal * (discountValue / 100)`
- **Fixed Amount**: `discount = Math.min(discountValue, subtotal)`
- **Applied on**: Subtotal BEFORE VAT

### **Payment Methods**
- **cash**: Tiền mặt
- **card**: Thẻ tín dụng/ghi nợ
- **transfer**: Chuyển khoản

### **Final Total Formula**
```javascript
subtotal = Σ(quantity × unit_price)
discountAmount = calculateDiscount(subtotal, discountType, discountValue)
afterDiscount = subtotal - discountAmount
tax = afterDiscount × (vatRate / 100)
total = afterDiscount + tax
```

## 🔍 DATABASE SCHEMA INSIGHTS

### **invoices Table Fields**
- `invoice_code`: Unique identifier (HD{timestamp})
- `subtotal_amount`: 🆕 Amount before VAT and discount
- `discount_type`: 🆕 'percentage' or 'amount'
- `discount_value`: 🆕 Discount value (% or fixed amount)
- `discount_amount`: 🆕 Actual discount money amount
- `vat_rate`: 🆕 VAT percentage (0%, 5%, 8%, 10%)
- `vat_amount`: 🆕 Actual VAT money amount
- `total_amount`: Final amount after all calculations
- `customer_paid`: Amount customer actually paid
- `payment_method`: 🆕 'cash', 'card', or 'transfer'
- `notes`: Business context and additional details

**🔍 Database Analytics Capabilities:**
- **VAT Reports**: Sum VAT by rate, date, customer
- **Discount Analysis**: Effectiveness of different discount strategies
- **Payment Method Trends**: Cash vs Card vs Transfer usage
- **Revenue Breakdown**: Subtotal vs VAT vs Discount contributions

### **invoice_details Table Fields**
- **Denormalized data**: Customer name, product name, etc. for reporting
- **Payment breakdown**: Separate fields for cash/card/transfer amounts
- **Line-level calculations**: Each product line with quantities and totals

### **Stock Management**
- **Optimistic updates**: UI shows immediate stock changes
- **Database updates**: Actual stock reduction happens at checkout
- **Error handling**: Optimistic updates cleared on successful checkout

## 🚨 CONSOLE LOGGING

Checkout process logs:
1. **🚀 Checkout Started**: Initial state
2. **📄 Invoice Code**: Generated code
3. **💾 Invoice Data**: Complete invoice object with VAT/discount fields
4. **✅ Invoice Created**: Success confirmation
5. **📝 Invoice Details**: All line items
6. **📦 Stock Updates**: Per-product stock changes
7. **🎉 Completion**: Final summary
8. **💥 Errors**: Detailed error context

## 📊 ENHANCED DATABASE SCHEMA

### **SQL Migration Required**
Run `sql/enhance_invoice_schema.sql` to add:
- VAT tracking fields
- Discount tracking fields  
- Payment method field
- Indexes for reporting
- Validation constraints
- Reporting views

### **Reporting Views Created**
- `vw_invoice_summary`: Detailed invoice analysis
- `vw_daily_vat_discount_report`: Daily financial summaries

## 📈 DATA FLOW

```
Cart Items → Calculations → Invoice → Invoice Details → Stock Updates → Success
     ↓            ↓           ↓           ↓              ↓           ↓
  Validate → VAT/Discount → DB Insert → Line Items → Inventory → Cleanup
```
