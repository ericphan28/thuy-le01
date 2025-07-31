# 📦 Products Management Module - Thú Y Thùy Trang

## 🎯 Module Overview

**Mục tiêu:** Xây dựng hệ thống quản lý sản phẩm hoàn chỉnh cho ngành thú y với các tính năng đặc thù như expiry tracking, batch management, và multi-unit support.

**Độ ưu tiên:** HIGH - Next to implement  
**Estimated effort:** 2-3 weeks  
**Database ready:** ✅ Schema + 1,049 real products from KiotViet

## 🗃️ Database Schema Analysis

### **Core Tables Available:**

#### 1. `products` (1,049 records)
```sql
- id (primary key)
- name (varchar 255) - Tên sản phẩm
- sku (varchar 100, unique) - Mã sản phẩm  
- price (decimal 10,2) - Giá bán
- cost_price (decimal 10,2) - Giá vốn
- stock_quantity (integer) - Tồn kho
- category_id (foreign key) - Danh mục
- unit_id (foreign key) - Đơn vị tính
- description (text) - Mô tả
- status (enum: active, inactive) - Trạng thái
- created_at, updated_at - Timestamps
```

#### 2. `product_categories` (Phân cấp danh mục)
```sql
- id (primary key)
- name (varchar 255) - Tên danh mục
- parent_id (nullable) - Danh mục cha
- description (text) - Mô tả
- status (enum: active, inactive)
- sort_order (integer) - Thứ tự hiển thị
```

#### 3. `units` (Đơn vị tính)
```sql
- id (primary key)
- name (varchar 100) - Tên đơn vị (chai, lọ, kg, hộp)
- symbol (varchar 20) - Ký hiệu (ml, g, pcs)
- is_base_unit (boolean) - Đơn vị cơ sở
```

#### 4. `product_units` (Quy đổi đơn vị)
```sql
- id (primary key)
- product_id (foreign key)
- unit_id (foreign key)
- conversion_rate (decimal 10,4) - Tỷ lệ quy đổi
- is_default (boolean) - Đơn vị mặc định
```

### **Available SQL Functions:**
- `get_inventory_alerts()` - Cảnh báo tồn kho thấp
- `dashboard_quick_stats` VIEW - Thống kê nhanh
- Standard CRUD operations với full-text search

## 🎨 UI/UX Design Strategy

### **Layout Architecture:**
```
/dashboard/products/
├── page.tsx          # Main listing với DataTable
├── create/page.tsx   # Add new product form
├── [id]/page.tsx     # Product detail & edit
├── categories/       # Category management
└── import/page.tsx   # Bulk import từ Excel
```

### **Component Structure:**
```
components/products/
├── product-list.tsx       # Main data table
├── product-form.tsx       # Create/Edit form
├── product-card.tsx       # Grid view item
├── product-search.tsx     # Advanced search
├── category-tree.tsx      # Hierarchical categories
├── unit-converter.tsx     # Multi-unit support
├── stock-indicator.tsx    # Visual stock status
└── bulk-actions.tsx       # Mass operations
```

## 🚀 Implementation Roadmap

### **Phase 2A: Core CRUD (Week 1)**
1. **Product Listing Page**
   - DataTable với server-side pagination
   - Real-time search & filtering
   - Category filter tree
   - Stock status indicators
   - Bulk action controls

2. **Product Form**
   - Create/Edit unified form
   - Category selection với tree view
   - Multi-unit support
   - Image upload placeholder
   - Validation với Zod schema

3. **Product Detail View**
   - Comprehensive product info
   - Stock history
   - Related products suggestion
   - Quick edit capabilities

### **Phase 2B: Advanced Features (Week 2)**
1. **Category Management**
   - Hierarchical category tree
   - Drag & drop reordering
   - Category-based pricing rules
   - Bulk category assignment

2. **Inventory Integration**
   - Real-time stock updates
   - Low stock alerts implementation
   - Stock adjustment workflows
   - Inventory movement logs

3. **Search & Filtering**
   - Full-text search with relevance
   - Advanced filters (price, stock, category)
   - Saved search queries
   - Export filtered results

### **Phase 2C: Business Logic (Week 3)**
1. **Veterinary-Specific Features**
   - Expiry date tracking
   - Batch/Lot number management
   - Prescription requirements
   - Temperature storage indicators

2. **Pricing & Units**
   - Multi-tier pricing structure
   - Unit conversion calculator
   - Bulk pricing discounts
   - Cost analysis tools

3. **Integration Ready**
   - API endpoints documentation
   - Data export/import tools
   - Mobile-responsive optimization
   - Performance optimization

## 🔧 Technical Implementation Plan

### **Database Optimization:**
```sql
-- Essential indexes for performance
CREATE INDEX idx_products_name_search ON products USING gin(to_tsvector('vietnamese', name));
CREATE INDEX idx_products_category_status ON products(category_id, status);
CREATE INDEX idx_products_stock_status ON products(stock_quantity, status);
CREATE INDEX idx_categories_parent_sort ON product_categories(parent_id, sort_order);
```

### **API Design Pattern:**
```typescript
// RESTful API structure
GET    /api/products              # List with pagination & filters
POST   /api/products              # Create new product
GET    /api/products/{id}         # Get product details
PUT    /api/products/{id}         # Update product
DELETE /api/products/{id}         # Soft delete product
GET    /api/products/search       # Advanced search
POST   /api/products/bulk         # Bulk operations
```

### **State Management Strategy:**
```typescript
// Zustand store for products module
interface ProductsState {
  products: Product[]
  categories: Category[]
  currentProduct: Product | null
  filters: ProductFilters
  pagination: PaginationState
  loading: boolean
  error: string | null
}
```

## 🎯 Success Metrics & KPIs

### **Technical Metrics:**
- **Page Load Time:** < 2 seconds for product listing
- **Search Response:** < 500ms for any search query
- **Data Accuracy:** 100% consistency with database
- **Mobile Performance:** Full functionality on mobile devices

### **Business Metrics:**
- **User Adoption:** Track daily active users in products module
- **Operation Efficiency:** Reduce product creation time by 50%
- **Data Quality:** Minimize duplicate/incomplete product records
- **Search Effectiveness:** Track search-to-action conversion

## 💡 Key Features Highlights

### **1. Veterinary-Specific Search**
- Full-text search trong tiếng Việt (vaccine, thuốc tẩy giun, kháng sinh)
- Search by SKU, tên thuốc, hoạt chất
- Tìm theo loại động vật (chó, mèo, chim, cá)
- Tìm theo nhóm thuốc (vaccine, kháng sinh, vitamin)

### **2. Medicine Inventory Management**
- Visual stock indicators với priority cho thuốc cần đơn
- Expiry date alerts (30/60/90 ngày)
- Batch/Lot tracking cho vaccine và thuốc
- Cold chain monitoring cho vaccine

### **3. Veterinary Category System**
- Phân loại theo nhóm thuốc: Vaccine, Kháng sinh, Tẩy giun, Vitamin
- Phân loại theo động vật: Chó, Mèo, Chim, Cá, Gia súc
- Category-based prescription requirements
- Veterinary product regulations compliance

### **4. Prescription & Compliance**
- Prescription-required product flagging
- Veterinary license verification
- Controlled substance tracking
- Usage dosage calculator theo cân nặng

### **5. Veterinary Unit System**
- Đơn vị y tế: Liều, Viên, Ống tiêm, ml
- Dosage calculator (mg/kg body weight)
- Treatment course tracking
- Bulk vs retail packaging

## 🔐 Security & Permissions

### **Access Control Levels:**
- **Admin:** Full CRUD access, category management
- **Manager:** Product CRUD, limited category access
- **Staff:** Read access, stock updates only
- **View Only:** Reporting và analytics

### **Data Protection:**
- Input sanitization cho all forms
- File upload validation cho images
- SQL injection prevention
- XSS protection trong search

## 📊 Analytics & Reporting

### **Product Performance Metrics:**
- Top selling products by category
- Profit margin analysis
- Stock turnover rates
- Seasonal demand patterns

### **Inventory Reports:**
- Low stock alerts dashboard
- Dead stock identification
- Fast-moving vs slow-moving analysis
- Reorder recommendations

## 🎨 UI/UX Standards

### **Design Consistency:**
- Follow established design system (shadcn/ui)
- Vietnamese interface throughout
- Consistent color coding (Red: low stock, Green: healthy, Yellow: warning)
- Mobile-first responsive design

### **User Experience Priorities:**
1. **Speed:** Fast loading và smooth interactions
2. **Clarity:** Clear visual hierarchy và status indicators
3. **Efficiency:** Minimize clicks to complete tasks
4. **Accessibility:** Support for different screen sizes và input methods

## 🚀 Next Steps

### **Immediate Actions (Next 2 days):**
1. Set up product database connections và test queries
2. Create basic product listing page với sample data
3. Implement category filter tree component
4. Set up routing structure cho products module

### **Week 1 Goals:**
- Complete product listing với full functionality
- Working create/edit product forms
- Basic search và filtering
- Category management foundation

### **Success Criteria:**
- ✅ All CRUD operations working
- ✅ Real-time search functional
- ✅ Mobile responsive design
- ✅ No TypeScript/ESLint errors
- ✅ Performance benchmarks met

---

**Ready to implement:** All infrastructure in place, database schema ready, design system established. This module will serve as the foundation for all other business modules in the veterinary management system.
