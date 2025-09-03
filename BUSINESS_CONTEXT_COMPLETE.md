# 🏥 XUÂN THÙY VETERINARY PHARMACY - BUSINESS CONTEXT

## 🏢 Thông tin Doanh nghiệp

**Tên doanh nghiệp:** Xuân Thùy Veterinary Pharmacy  
**Ngành nghề:** Bán lẻ sản phẩm thú y (thuốc, thức ăn, phụ kiện cho thú cưng)  
**Quy mô:** SME với hệ thống quản lý hiện đại  
**Địa chỉ:** Việt Nam  
**Developer:** Thắng Phan - Gia Kiệm Số (ericphan28@gmail.com, Zalo: 0907136029)

## 📊 Dữ liệu Thực tế (REAL DATA)

### 📈 Thống kê Hệ thống
- **1000+ Khách hàng** với debt management system
- **51 Nhà cung cấp** với supplier relationship management  
- **1049+ Sản phẩm** với full catalog và inventory tracking
- **739+ Hóa đơn** với complete transaction history
- **Real-time Inventory** với stock movement tracking

### 🏪 Loại hình Kinh doanh
- **B2C:** Bán lẻ cho chủ thú cưng
- **B2B:** Cung cấp cho phòng khám thú y, pet shop
- **Contract Pricing:** Giá đặc biệt cho khách hàng VIP/bulk

## 💰 HỆ THỐNG PRICING PHỨC TẠP

### 🎯 Priority Logic (Cao xuống Thấp)
1. **Contract Pricing** - Giá hợp đồng (Ưu tiên cao nhất)
2. **Pricing Rules** - Quy tắc giá đặc biệt
3. **Volume Tiers** - Bậc số lượng (bulk discount)
4. **List Price** - Giá niêm yết gốc

### 📋 Ví dụ Pricing Logic
```
Sản phẩm: Thuốc tẩy giun SP000385
- List Price: 220,000đ
- Volume Tier: Mua >= 10 → Giảm 15% = 187,000đ  
- Contract Price: Khách VIP → 185,000đ
- Final Price: 185,000đ (Contract thắng)

POS Cart Display: 185,000đ (giá thực tế khách trả)
Invoice: 185,000đ (consistent với cart)
```

### 🔄 Enhanced Pricing Engine V3
- **Client-side calculation** với real-time updates
- **Auto-sync cart pricing** khi enhanced pricing thay đổi
- **Unified pricing logic** across POS, simulator, invoice
- **Performance optimized** với database indexes

## 📄 HỆ THỐNG HÓA ĐƠN & PDF

### 🖨️ Invoice Features
- **In hóa đơn** với template chuyên nghiệp
- **PDF generation** multiple methods (Puppeteer, Canvas)
- **Auto-print** functionality cho web và PDF
- **Vietnamese formatting** với đúng định dạng tiền tệ

### 💳 Debt Management
- **Tổng công nợ khách hàng** hiển thị real-time
- **Current debt tracking** trong database
- **Debt display** trong POS checkout và PDF invoice
- **Accurate calculations** (5.330k debt example)

## 🛒 HỆ THỐNG POS

### ⚡ Real-time Features
- **Enhanced pricing** với live calculation
- **Cart auto-sync** khi pricing thay đổi
- **Stock management** với optimistic updates
- **Customer selection** với debt display

### 🎯 User Experience
- **Pricing transparency** - hiển thị giá thực tế
- **Fast checkout** với enhanced pricing engine
- **Professional UI** với dark mode support
- **Mobile responsive** cho tablet POS

## 🗄️ DATABASE ARCHITECTURE

### 📊 Core Tables
- **products** - Catalog sản phẩm với pricing info
- **customers** - Thông tin khách hàng + current_debt
- **invoices** - Header hóa đơn với totals
- **invoice_details** - Chi tiết items trong hóa đơn
- **pricing_rules** - Quy tắc giá đặc biệt
- **volume_tiers** - Bậc số lượng discount
- **contracts** - Contract pricing cho khách VIP

### ⚡ Performance Optimization
- **Composite indexes** cho pricing queries
- **Query time** reduced từ 2000ms → <100ms
- **Optimized relationships** manual joins thay vì FK
- **Real-time updates** với efficient queries

## 🛠️ TECHNICAL STACK

### 🎨 Frontend
- **Next.js 15.4.5** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling với dark mode
- **Supabase Client** - Real-time data

### 🔧 Backend  
- **Supabase PostgreSQL** - Database với RLS
- **API Routes** - Server-side logic
- **Edge Functions** - Specialized processing
- **Real-time subscriptions** - Live updates

### 📱 Deployment
- **Vercel** - Production hosting
- **GitHub** - Version control
- **Environment** - Production ready với zero errors

## 🎯 CURRENT STATUS (04/09/2025)

### ✅ COMPLETED SYSTEMS
1. **Enhanced Pricing Engine V3** - Production ready
2. **PDF Invoice System** - Full featured với "Tổng công nợ"
3. **POS System** - Real-time pricing với cart sync
4. **Database Performance** - Optimized với indexes
5. **Production Build** - Zero errors, clean deployment

### 🚀 NEXT PRIORITIES
1. Advanced reporting và analytics
2. Inventory management enhancements  
3. Customer relationship features
4. Mobile app development
5. Integration với third-party services

## 📞 CONTACT & SUPPORT

**Developer:** Thắng Phan - Gia Kiệm Số  
**Email:** ericphan28@gmail.com  
**Zalo:** 0907136029  
**GitHub:** github.com/ericphan28/thuy-le01  
**Production:** https://thuy-le01.vercel.app
