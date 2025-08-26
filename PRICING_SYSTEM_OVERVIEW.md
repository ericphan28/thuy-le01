# 💰 HỆ THỐNG CHÍNH SÁCH GIÁ (PRICING SYSTEM) - TỔNG QUAN NGHIỆP VỤ

## 📋 1. TỔNG QUAN HỆ THỐNG

### 🎯 Mục tiêu nghiệp vụ
- **Quản lý giá bán linh hoạt**: Theo sản phẩm, danh mục, khách hàng, khu vực
- **Chiết khấu tự động**: Dựa trên số lượng mua, hạng khách hàng, thời gian
- **Chính sách giá động**: Thay đổi theo thời gian, chương trình khuyến mãi
- **Báo cáo và phân tích**: Hiệu quả chính sách giá, doanh thu, lợi nhuận

### 🏗️ Kiến trúc hệ thống
```
📊 PRICING SYSTEM
├── 📖 Price Books (Bảng giá)
├── 🏷️ Promotions (Khuyến mãi) 
├── 📈 Volume Tiers (Bậc số lượng) ✅ HOÀN THÀNH
├── 📊 Contracts (Hợp đồng giá)
├── 🎯 Simulator (Mô phỏng giá)
└── ⚙️ Pricing Engine (Công cụ tính giá)
```

## 📈 2. BẬC SỐ LƯỢNG (VOLUME TIERS) - ĐÃ HOÀN THÀNH

### ✅ Tính năng đã triển khai
- **Tạo/Quản lý bậc số lượng**: Form tạo với validation đầy đủ
- **Áp dụng tự động**: Tích hợp vào POS và pricing engine
- **Chiết khấu linh hoạt**: Theo % hoặc số tiền cố định
- **Phạm vi áp dụng**: Sản phẩm cụ thể hoặc danh mục
- **Quản lý thời gian**: Hiệu lực từ/đến ngày
- **Dark mode support**: UI responsive đầy đủ

### 🗃️ Database Schema
```sql
CREATE TABLE volume_tiers (
    tier_id SERIAL PRIMARY KEY,
    scope TEXT NOT NULL, -- 'sku' | 'category'
    product_id INTEGER REFERENCES products(product_id),
    category_id INTEGER REFERENCES product_categories(category_id),
    min_qty NUMERIC(12,2) NOT NULL,
    discount_percent NUMERIC(7,3),
    discount_amount NUMERIC(15,2),
    effective_from TIMESTAMP,
    effective_to TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 🔧 Implementation Notes
- **Không có max_qty**: Database schema chỉ có min_qty, không giới hạn tối đa
- **Manual joins**: Sử dụng manual relationship thay vì foreign keys
- **Client/Server separation**: Form components properly separated
- **Performance optimized**: useCallback, useMemo cho React components

### 📱 UI Components
- **Enhanced Management Page**: `/dashboard/pricing/tiers/enhanced`
- **Create Form**: Client component với real-time validation
- **POS Integration**: Hiển thị chiết khấu trong cart
- **Dark Mode**: Fully supported với CSS variables

## 🏷️ 3. KHUYẾN MÃI (PROMOTIONS) - ĐANG PHÁT TRIỂN

### 📋 Scope hiện tại
- **Buy X Get Y**: Mua X tặng Y
- **Combo discounts**: Giảm giá khi mua combo
- **Time-based**: Khuyến mãi theo thời gian
- **Customer tier**: Theo hạng khách hàng

## 📖 4. BẢNG GIÁ (PRICE BOOKS) - CẦN CẬP NHẬT

### 🎯 Mục tiêu
- **Multi-tier pricing**: Giá bán lẻ, sỉ, đại lý
- **Geographic pricing**: Giá theo khu vực
- **Customer-specific**: Giá riêng cho khách hàng VIP
- **Seasonal pricing**: Giá theo mùa

## ⚙️ 5. PRICING ENGINE - CORE LOGIC

### 🔄 Calculation Flow
```
1. Product Base Price (Giá gốc)
2. Apply Price Book Rules (Áp dụng bảng giá)
3. Apply Volume Tiers ✅ (Chiết khấu số lượng)
4. Apply Promotions (Khuyến mãi)
5. Apply Contract Pricing (Giá hợp đồng)
6. Calculate Final Price (Giá cuối cùng)
```

### 📍 Current Implementation
- **Volume Tiers**: ✅ Fully integrated
- **Base Price Rules**: ✅ Working
- **Manual Overrides**: ✅ Supported
- **Tax Calculation**: ✅ Integrated

## 🚀 6. TRẠNG THÁI HIỆN TẠI

### ✅ Đã hoàn thành
- **Volume Tiers System**: Full CRUD, UI, integration
- **Dark Mode Support**: Toàn bộ pricing UI
- **Database Schema**: Aligned với business logic
- **TypeScript Types**: Type-safe implementation
- **Testing**: Build success, no errors

### 🔄 Đang phát triển
- **Promotions Enhancement**: Complex promotion rules
- **Price Books**: Multi-tier pricing structure
- **Analytics**: Pricing effectiveness reports
- **Contract Pricing**: Long-term pricing agreements

### 📋 TODO Priority
1. **Promotions System**: Buy X Get Y, combo discounts
2. **Price Books Enhancement**: Customer-specific pricing
3. **Analytics Dashboard**: Pricing performance metrics
4. **API Integration**: External pricing services

## 🔧 7. TECHNICAL ARCHITECTURE

### 🏗️ Code Structure
```
/app/dashboard/pricing/
├── /tiers/enhanced/     # Volume Tiers (MAIN) ✅
├── /promotions/         # Promotions Management
├── /books/             # Price Books
├── /contracts/         # Contract Pricing
└── /simulator/         # Price Simulation

/lib/services/
├── volume-tiers-service.ts  ✅ COMPLETED
├── pricing-engine.ts        # Core pricing logic
└── promotions-service.ts    # Promotion rules

/components/pricing/
├── volume-tier-*.tsx        ✅ ALL COMPLETED
├── promotion-*.tsx          # Promotion components
└── price-book-*.tsx         # Price book components
```

### 🗄️ Database Relations
```
products → volume_tiers (manual join)
product_categories → volume_tiers (manual join)
price_books → price_rules
customers → customer_pricing
promotions → promotion_rules
```

## 📊 8. BUSINESS METRICS

### 💰 Revenue Impact
- **Volume Discounts**: Tăng average order value
- **Promotions**: Boost sales conversion
- **Customer Retention**: Giá ưu đãi cho VIP
- **Margin Optimization**: Smart pricing strategies

### 📈 KPIs to Track
- **Average Order Value**: Impact of volume tiers
- **Conversion Rate**: Promotion effectiveness
- **Customer Lifetime Value**: Pricing strategy success
- **Profit Margins**: Pricing optimization results

## 🔐 9. SECURITY & PERMISSIONS

### 👥 Role-based Access
- **Admin**: Full pricing control
- **Manager**: Edit prices, view reports
- **Staff**: View prices only
- **Customer**: See final prices only

### 🛡️ Data Protection
- **Price History**: Audit trail for all changes
- **Sensitive Data**: Customer-specific pricing encrypted
- **Access Logs**: Track who changed what prices

## 📚 10. DOCUMENTATION STATUS

### ✅ Updated Documents
- `PRICING_SYSTEM_OVERVIEW.md` (this file)
- Volume Tiers docs (merged into this)

### 🗑️ Deprecated Documents (cần xóa)
- `VOLUME_TIERS_*.md` (multiple files)
- `PRICING_QUICK_EXPLANATION.md`
- `PRICING_FIX_ANALYSIS.md`

### 📝 Next Documentation
- Promotions System Guide
- Price Books Configuration
- Pricing Analytics Setup

---
*Document cập nhật: 2025-08-26*
*Status: Volume Tiers COMPLETED ✅ | Promotions IN PROGRESS 🔄*
