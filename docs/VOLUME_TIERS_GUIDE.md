# 🎯 VOLUME TIERS (BẬC SỐ LƯỢNG) - HƯỚNG DẪN CHI TIẾT

> **Mục tiêu**: Cung cấp tài liệu đầy đủ về tính năng Volume Tiers (Bậc số lượng) để AI và developer hiểu được cách hoạt động và triển khai.

## 📋 1. TỔNG QUAN

**Volume Tiers** là hệ thống chiết khấu tự động dựa trên số lượng mua của khách hàng. Tính năng này giúp:

- ✅ **Khách hàng**: Tiết kiệm chi phí khi mua số lượng lớn
- ✅ **Nhà thuốc**: Tăng doanh số, xoay vòng hàng tồn nhanh hơn  
- ✅ **Hệ thống**: Tự động hóa việc áp dụng chiết khấu, minh bạch

### **Ví dụ thực tế:**

```
Thuốc Paracetamol 500mg (Giá gốc: 5.000₫/viên)
┌─────────────────────────────────────────────────┐
│ Số lượng     │ Chiết khấu  │ Giá mỗi viên      │
├─────────────────────────────────────────────────┤
│ 1-9 viên     │ 0%          │ 5.000₫           │
│ 10-49 viên   │ 5%          │ 4.750₫           │
│ 50-99 viên   │ 10%         │ 4.500₫           │
│ 100+ viên    │ 15%         │ 4.250₫           │
└─────────────────────────────────────────────────┘

Ví dụ: Khách mua 25 viên
- Áp dụng bậc: "10-49 viên, giảm 5%"
- Tổng tiền gốc: 25 × 5.000₫ = 125.000₫
- Tổng sau chiết khấu: 25 × 4.750₫ = 118.750₫
- Tiết kiệm: 6.250₫
```

## 🗄️ 2. CẤU TRÚC DATABASE

### **Table: `volume_tiers`**

```sql
CREATE TABLE volume_tiers (
  tier_id           serial PRIMARY KEY,
  scope             text NOT NULL,           -- 'sku' hoặc 'category'
  product_id        integer,                 -- ID sản phẩm (nếu scope='sku')
  category_id       integer,                 -- ID danh mục (nếu scope='category')
  min_qty           numeric(12,2) NOT NULL,  -- Số lượng tối thiểu
  max_qty           numeric(12,2),           -- Số lượng tối đa (NULL = không giới hạn)
  discount_percent  numeric(7,3),            -- Chiết khấu % (VD: 10.5%)
  discount_amount   numeric(15,2),           -- Chiết khấu cố định (VD: 5000₫)
  effective_from    timestamp,               -- Thời gian bắt đầu
  effective_to      timestamp,               -- Thời gian kết thúc
  is_active         boolean DEFAULT true,    -- Bật/tắt
  notes             text,                    -- Ghi chú
  created_at        timestamp DEFAULT now()
);
```

### **Quan hệ với tables khác:**
- `products.product_id` ← `volume_tiers.product_id` (khi scope='sku')
- `product_categories.category_id` ← `volume_tiers.category_id` (khi scope='category')

## 🔧 3. KIẾN TRÚC HỆ THỐNG

### **Core Files:**

| File | Mục đích |
|------|----------|
| `lib/services/volume-tiers-service.ts` | Service layer xử lý logic volume tiers |
| `lib/pricing/engine.ts` | Tích hợp volume tiers vào pricing engine |
| `components/pricing/volume-tier-examples.tsx` | Component ví dụ minh họa |
| `components/pricing/create-volume-tier-form.tsx` | Form tạo volume tier |
| `components/pos/volume-tier-display.tsx` | Hiển thị volume tiers trong POS |
| `app/dashboard/pricing/tiers/enhanced/page.tsx` | Trang quản lý volume tiers |

### **Data Flow:**

```
POS Add Product → Check Volume Tiers → Apply Discount → Update Cart
     ↓                    ↓                 ↓             ↓
  Product Info → VolumeTiersService → Calculate Price → Display
```

## 🎮 4. CÁCH HOẠT ĐỘNG

### **Logic áp dụng Volume Tiers:**

1. **Kiểm tra phạm vi**: 
   - `scope='sku'`: Áp dụng cho 1 sản phẩm cụ thể
   - `scope='category'`: Áp dụng cho toàn bộ danh mục

2. **Kiểm tra điều kiện số lượng**:
   - `quantity >= min_qty` ✅
   - `quantity <= max_qty` (nếu có) ✅
   - `is_active = true` ✅
   - Trong thời gian hiệu lực ✅

3. **Tính toán chiết khấu**:
   ```typescript
   if (tier.discount_percent) {
     discounted_price = original_price * (1 - discount_percent / 100)
   } else if (tier.discount_amount) {
     discounted_price = Math.max(0, original_price - discount_amount)
   }
   ```

4. **Ưu tiên**:
   - Sản phẩm cụ thể (`scope='sku'`) > Danh mục (`scope='category'`)
   - Bậc số lượng cao nhất phù hợp được áp dụng

## 🔗 5. TÍCH HỢP VỚI PRICING ENGINE

Volume Tiers hoạt động **sau** Price Rules trong pipeline:

```
Base Price → Price Rules → Volume Tiers → Final Price
    ↓            ↓             ↓           ↓
  10.000₫ → Net: 9.000₫ → -10%: 8.100₫ → 8.100₫
```

**Ví dụ tích hợp:**
1. Sản phẩm có giá gốc: 10.000₫
2. Price rule áp dụng: Net price 9.000₫
3. Volume tier áp dụng: Giảm 10% → 8.100₫
4. Giá cuối cùng: 8.100₫

## 🎨 6. GIAO DIỆN NGƯỜI DÙNG

### **Management Page** (`/dashboard/pricing/tiers/enhanced`)

**Features:**
- ✅ Ví dụ minh họa cách hoạt động
- ✅ Form tạo volume tier với UX tốt
- ✅ Danh sách volume tiers với preview tính toán
- ✅ Search, pagination, filter
- ✅ Bật/tắt, xóa volume tiers

### **POS Integration**

**Volume Tier Display trong cart:**
- 🎯 Hiển thị bậc đang áp dụng
- 💡 Gợi ý mua thêm để được chiết khấu
- 📊 Thang bậc số lượng trực quan
- 🎉 Tổng tiết kiệm từ volume tiers

## 📊 7. VÍ DỤ THỰC TẾ

### **Thiết lập Volume Tiers cho Vitamin C:**

```typescript
// Tạo volume tier
const vitaminC_tier1 = {
  scope: 'sku',
  product_id: 123,
  min_qty: 5,
  max_qty: 19,
  discount_percent: 8,
  notes: 'Combo gia đình'
}

const vitaminC_tier2 = {
  scope: 'sku', 
  product_id: 123,
  min_qty: 20,
  max_qty: null, // Không giới hạn
  discount_percent: 12,
  notes: 'Mua hàng loạt'
}
```

### **Kết quả trong POS:**

```
Vitamin C 1000mg - Giá gốc: 15.000₫

Khách mua 8 viên:
✅ Áp dụng bậc "Combo gia đình" (5-19 viên, giảm 8%)
- Giá mỗi viên: 13.800₫
- Tổng tiền: 110.400₫
- Tiết kiệm: 9.600₫

💡 Gợi ý: "Mua thêm 12 viên để được giảm 12%"
```

## 🔧 8. API & METHODS

### **VolumeTiersService Methods:**

```typescript
// Tìm bậc số lượng phù hợp
findMatchingTiers(product_id, category_id, quantity, when?)

// Tính giá sau chiết khấu
calculateVolumePrice(product_id, category_id, quantity, original_price, when?)

// Lấy tất cả bậc cho sản phẩm
getProductTiers(product_id)

// Lấy tất cả bậc cho danh mục  
getCategoryTiers(category_id)

// CRUD operations
createTier(tier_data)
updateTier(tier_id, updates)
deleteTier(tier_id)

// Tính ví dụ
calculateExamples(tier, base_price)
```

### **Integration with Pricing Engine:**

```typescript
// Trong simulatePrice()
const volumeTierMatch = await volumeTiersService.calculateVolumePrice(
  product_id, category_id, quantity, basePrice
)

if (volumeTierMatch) {
  final_price = volumeTierMatch.discounted_price
  applied_reason = `Bậc số lượng: ${volumeTierMatch.tier.discount_percent}%`
}
```

## 📈 9. PERFORMANCE & OPTIMIZATION

### **Caching Strategy:**
- Cache volume tiers cho products/categories thường xuyên
- Debounce search trong management interface
- Lazy load available tiers trong POS

### **Database Indexing:**
```sql
-- Indexes cho performance
CREATE INDEX idx_volume_tiers_scope_product ON volume_tiers(scope, product_id) WHERE scope = 'sku';
CREATE INDEX idx_volume_tiers_scope_category ON volume_tiers(scope, category_id) WHERE scope = 'category';
CREATE INDEX idx_volume_tiers_active ON volume_tiers(is_active, min_qty);
```

## 🚀 10. ROADMAP & ENHANCEMENTS

### **Phase 2 Features:**
- [ ] **Multi-product tiers**: Chiết khấu khi mua combo nhiều sản phẩm
- [ ] **Customer group tiers**: Bậc số lượng riêng cho từng nhóm khách hàng
- [ ] **Time-based tiers**: Giờ vàng, khung giờ đặc biệt
- [ ] **Progressive tiers**: Bậc tích lũy theo tổng đơn hàng

### **Advanced Analytics:**
- [ ] **Tier effectiveness**: Thống kê hiệu quả từng bậc số lượng
- [ ] **Revenue impact**: Doanh thu tăng thêm từ volume tiers
- [ ] **Customer behavior**: Phân tích hành vi mua theo bậc

## 💡 11. BEST PRACTICES

### **Thiết lập Volume Tiers hiệu quả:**

1. **Phân tích dữ liệu lịch sử**:
   - Xem patterns mua hàng của khách
   - Xác định số lượng mua trung bình
   - Thiết lập bậc phù hợp

2. **Cân bằng lợi nhuận**:
   - Đảm bảo margin tối thiểu
   - Tính toán ROI cho từng bậc
   - Monitor và điều chỉnh

3. **UX tốt**:
   - Hiển thị rõ ràng lợi ích
   - Gợi ý mua thêm thông minh
   - Transparent pricing

### **Monitoring & Analytics:**

```sql
-- Query phân tích hiệu quả volume tiers
SELECT 
  vt.tier_id,
  vt.min_qty,
  vt.discount_percent,
  COUNT(id.detail_id) as times_used,
  SUM(id.quantity) as total_quantity,
  SUM(id.line_total) as total_revenue,
  AVG(id.line_total) as avg_order_value
FROM volume_tiers vt
LEFT JOIN invoice_details id ON (
  vt.scope = 'sku' AND id.product_id = vt.product_id AND 
  id.quantity >= vt.min_qty
)
WHERE vt.is_active = true
GROUP BY vt.tier_id
ORDER BY total_revenue DESC;
```

## 🎯 12. KÊNH HỖ TRỢ

### **Documentation Files:**
- `VOLUME_TIERS_GUIDE.md` (file này)
- `PRICING_BUSINESS_OVERVIEW.md` (pricing tổng quan)
- `POS_ENHANCEMENT_STRATEGY.md` (tích hợp POS)

### **Demo Data:**
```sql
-- Sample volume tiers
INSERT INTO volume_tiers VALUES
(1, 'sku', 123, NULL, 10, 49, 5.0, NULL, NULL, NULL, true, 'Mua sỉ nhỏ'),
(2, 'sku', 123, NULL, 50, 99, 10.0, NULL, NULL, NULL, true, 'Mua sỉ vừa'),
(3, 'sku', 123, NULL, 100, NULL, 15.0, NULL, NULL, NULL, true, 'Mua sỉ lớn'),
(4, 'category', NULL, 5, 20, NULL, 8.0, NULL, NULL, NULL, true, 'Combo vitamin');
```

---

**🔄 Last Updated**: August 25, 2025  
**📝 Version**: 1.0  
**👨‍💻 Maintained by**: Development Team

> Tài liệu này được cập nhật thường xuyên. Vui lòng kiểm tra version mới nhất khi cần tham khảo.
