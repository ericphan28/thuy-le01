# 🔄 Veterinary Products - Supabase API Flow Documentation

## 🎯 Overview
Tài liệu này mô tả luồng nghiệp vụ và các API calls của Supabase được sử dụng trong module Products Management cho cửa hàng thuốc thú y.

## 📊 Database Schema Reference
```sql
-- Core tables cho veterinary products
products (1,049 records)
├── id (primary key)
├── name (varchar 255) - Tên thuốc/sản phẩm
├── sku (varchar 100, unique) - Mã sản phẩm
├── price (decimal 10,2) - Giá bán
├── cost_price (decimal 10,2) - Giá vốn
├── stock_quantity (integer) - Tồn kho
├── category_id (foreign key) - Danh mục
├── unit_id (foreign key) - Đơn vị tính
├── expiry_date (date) - Hạn sử dụng [VET-SPECIFIC]
├── batch_number (varchar) - Số lô [VET-SPECIFIC]
├── prescription_required (boolean) - Cần đơn thuốc [VET-SPECIFIC]
├── description (text) - Mô tả
├── status (enum: active, inactive)
└── created_at, updated_at

product_categories
├── id, name, parent_id
├── animal_type (chó, mèo, chim, cá) [VET-SPECIFIC]
└── medicine_group (vaccine, kháng sinh, vitamin) [VET-SPECIFIC]

units
├── id, name (Liều, Viên, Chai, Hộp, ml)
└── symbol, is_base_unit
```

## 🌐 Browser Client API Calls

### **1. PRODUCTS LISTING (Core Flow)**

#### **GET Products with Filters**
```typescript
// API Call: supabase.from('products').select()
const { data: products, error } = await supabase
  .from('products')
  .select(`
    id,
    name,
    sku,
    price,
    cost_price,
    stock_quantity,
    expiry_date,
    batch_number,
    prescription_required,
    status,
    product_categories!inner(
      id,
      name,
      animal_type,
      medicine_group
    ),
    units!inner(
      name,
      symbol
    )
  `)
  .eq('status', 'active')
  .order('name', { ascending: true })
  .limit(50)
```

**Nghiệp vụ:** Lấy danh sách sản phẩm thú y với thông tin category và đơn vị

#### **SEARCH Products (Vietnamese)**
```typescript
// API Call: Full-text search cho tiếng Việt
const { data: searchResults } = await supabase
  .from('products')
  .select('*')
  .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`)
  .eq('status', 'active')
```

**Nghiệp vụ:** Tìm kiếm theo tên thuốc, SKU, hoạt chất

#### **FILTER by Animal Type**
```typescript
// API Call: Lọc theo loại động vật
const { data: dogProducts } = await supabase
  .from('products')
  .select(`*, product_categories!inner(animal_type)`)
  .eq('product_categories.animal_type', 'chó')
  .eq('status', 'active')
```

**Nghiệp vụ:** Lọc sản phẩm theo loại động vật (chó, mèo, chim, cá)

### **2. INVENTORY MANAGEMENT (Veterinary-Specific)**

#### **GET Low Stock Alerts**
```typescript
// API Call: Sản phẩm sắp hết hàng
const { data: lowStockProducts } = await supabase
  .from('products')
  .select('*')
  .lte('stock_quantity', 10)
  .eq('status', 'active')
  .order('stock_quantity', { ascending: true })
```

**Nghiệp vụ:** Cảnh báo thuốc sắp hết, ưu tiên thuốc cần đơn

#### **GET Expiry Alerts**
```typescript
// API Call: Sản phẩm sắp hết hạn
const thirtyDaysFromNow = new Date()
thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

const { data: expiringProducts } = await supabase
  .from('products')
  .select('*')
  .lte('expiry_date', thirtyDaysFromNow.toISOString())
  .eq('status', 'active')
  .order('expiry_date', { ascending: true })
```

**Nghiệp vụ:** Theo dõi hạn sử dụng thuốc, vaccine

#### **GET Prescription Required Products**
```typescript
// API Call: Thuốc cần đơn thuốc
const { data: prescriptionProducts } = await supabase
  .from('products')
  .select('*')
  .eq('prescription_required', true)
  .eq('status', 'active')
```

**Nghiệp vụ:** Quản lý thuốc kê đơn, kiểm soát pháp lý

### **3. REAL-TIME SUBSCRIPTIONS**

#### **Stock Updates Subscription**
```typescript
// API Call: Real-time stock changes
const stockSubscription = supabase
  .channel('stock_updates')
  .on('postgres_changes', 
    { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'products',
      filter: 'stock_quantity=lt.10'
    }, 
    (payload) => {
      // Cập nhật UI khi stock thay đổi
      handleStockAlert(payload.new)
    }
  )
  .subscribe()
```

**Nghiệp vụ:** Cập nhật real-time khi tồn kho thay đổi

### **4. CATEGORIES & UNITS**

#### **GET Veterinary Categories Tree**
```typescript
// API Call: Hierarchical categories
const { data: categories } = await supabase
  .from('product_categories')
  .select('*')
  .eq('status', 'active')
  .order('sort_order', { ascending: true })
```

**Nghiệp vụ:** Danh mục phân cấp cho sản phẩm thú y

#### **GET Units for Conversion**
```typescript
// API Call: Đơn vị tính và quy đổi
const { data: units } = await supabase
  .from('units')
  .select(`
    *,
    product_units(
      product_id,
      conversion_rate,
      is_default
    )
  `)
```

**Nghiệp vụ:** Quy đổi đơn vị (liều, viên, ml, chai)

## 🔍 Advanced Business Logic APIs

### **5. DOSAGE CALCULATION**
```typescript
// API Call: Tính liều theo cân nặng
const { data: product } = await supabase
  .from('products')
  .select('*')
  .eq('id', productId)
  .single()

// Business logic calculation
const dosage = calculateVeterinaryDosage(
  product.dosage_per_kg,
  animalWeight,
  product.concentration
)
```

**Nghiệp vụ:** Tính liều thuốc cho động vật theo cân nặng

### **6. BATCH TRACKING**
```typescript
// API Call: Theo dõi lô sản xuất
const { data: batchInfo } = await supabase
  .from('products')
  .select('batch_number, expiry_date, manufacturer')
  .eq('batch_number', batchNumber)
```

**Nghiệp vụ:** Truy xuất nguồn gốc, recall management

### **7. PROFIT ANALYSIS**
```typescript
// API Call: Phân tích lợi nhuận
const { data: profitData } = await supabase
  .from('products')
  .select('price, cost_price, stock_quantity')
  .eq('status', 'active')

// Business calculation
const totalProfit = profitData.reduce((sum, product) => {
  return sum + ((product.price - product.cost_price) * product.stock_quantity)
}, 0)
```

**Nghiệp vụ:** Báo cáo tài chính, phân tích margin

## 🚨 Error Handling & Security

### **RLS (Row Level Security)**
```sql
-- Policy cho products table
CREATE POLICY "Users can view active products" ON products
  FOR SELECT USING (status = 'active' AND auth.role() = 'authenticated');

CREATE POLICY "Veterinarians can prescribe" ON products
  FOR SELECT USING (
    prescription_required = true AND 
    auth.jwt() ->> 'user_role' = 'veterinarian'
  );
```

### **Error Handling Pattern**
```typescript
try {
  const { data, error } = await supabase
    .from('products')
    .select('*')
  
  if (error) {
    console.error('Supabase error:', error.message)
    throw new Error(`Database error: ${error.message}`)
  }
  
  return data
} catch (error) {
  // Log to monitoring service
  console.error('Products API error:', error)
  throw error
}
```

## 📊 Performance Optimization

### **Indexes cho Vietnamese Search**
```sql
-- Database indexes cần thiết
CREATE INDEX idx_products_name_search 
  ON products USING gin(to_tsvector('vietnamese', name));

CREATE INDEX idx_products_expiry_status 
  ON products(expiry_date, status) 
  WHERE expiry_date IS NOT NULL;

CREATE INDEX idx_products_prescription_stock 
  ON products(prescription_required, stock_quantity, status);
```

### **Pagination Pattern**
```typescript
// API Call: Server-side pagination
const { data, count } = await supabase
  .from('products')
  .select('*', { count: 'exact' })
  .range(startIndex, endIndex)
  .order('name')
```

## 🎯 API Call Summary

| **Use Case** | **API Pattern** | **Frequency** | **Real-time** |
|--------------|----------------|---------------|---------------|
| Products List | `select()` với joins | High | ❌ |
| Search | `or()` với `ilike` | High | ❌ |
| Stock Alerts | `lte()` filtering | Medium | ✅ |
| Expiry Check | Date filtering | Daily | ✅ |
| Categories | Hierarchical select | Low | ❌ |
| Real-time Stock | Subscriptions | Continuous | ✅ |

## 🔄 Data Flow Diagram
```
User Action → Browser Client → Supabase API → PostgreSQL
    ↓              ↓              ↓            ↓
[Search] → [createClient()] → [from().select()] → [Query execution]
    ↓              ↓              ↓            ↓
[Results] ← [React State] ← [Response data] ← [Database results]
```

---

**🐾 Document này sẽ được cập nhật khi implement thêm tính năng mới cho veterinary business logic.**
