<div align="center">
  <img alt="Xuân Thùy Veterinary Management System - Hệ thống quản lý thú y" src="https://demo-nextjs-with-supabase.vercel.app/opengraph-image.png">
  <h1 align="center">🐾 Xuân Thùy Veterinary Management System</h1>
  <h2 align="center">Hệ thống Quản lý Bán hàng Thú y</h2>
</div>

<p align="center">
 Hệ thống POS/ERP chuyên nghiệp cho cửa hàng thú y - Phát triển bởi <strong>Gia Kiệm Số</strong>
</p>

<p align="center">
  <a href="#overview"><strong>Tổng quan</strong></a> ·
  <a href="#features"><strong>Tính năng</strong></a> ·
  <a href="#tech-stack"><strong>Công nghệ</strong></a> ·
  <a href="#project-status"><strong>Trạng thái</strong></a> ·
  <a href="#business-modules"><strong>Modules nghiệp vụ</strong></a> ·
  <a href="#getting-started"><strong>Bắt đầu</strong></a>
</p>
<br/>

## 📋 Tổng quan Project {#overview}

### 🏢 **Thông tin Doanh nghiệp**
- **Tên:** Xuân Thùy Veterinary Pharmacy
- **Ngành:** Quản lý bán hàng sản phẩm thú y (Veterinary retail management)
- **Quy mô:** Enterprise-ready với 1000+ khách hàng, 51 nhà cung cấp, 1049+ sản phẩm, 739+ hóa đơn
- **Trạng thái:** **PRODUCTION READY** - Real Dashboard Analytics Integration Complete

### 👨‍💻 **Thông tin Developer**
- **Công ty phát triển:** Gia Kiệm Số (giakiemso.com)
- **Developer:** Thắng Phan
- **Email:** ericphan28@gmail.com
- **Zalo:** 0907136029
- **Facebook:** https://www.facebook.com/thang.phan.334/

### 📊 **Dữ liệu Nghiệp vụ Thực tế**
Project được xây dựng dựa trên dữ liệu thực từ hệ thống KiotViet với:
- **Tổng bản ghi:** 4,134 records từ 12 file Excel
- **Sản phẩm:** 1,049 items (thuốc thú y, vật tư, thiết bị)
- **Khách hàng:** 397 customers (trang trại, cá nhân)
- **Hóa đơn bán hàng:** 739 invoices
- **Chi tiết giao dịch:** 1,407+ transaction details
- **Nhà cung cấp:** 10+ suppliers
- **Giao dịch tài chính:** Đầy đủ dữ liệu thu chi

## 🎯 Trạng thái Project hiện tại {#project-status}

### ✅ **Đã hoàn thành (Phase 1-5 - Real Data Integration)**

## 🚀 **Current Status - August 13, 2025**

### 🎉 **MAJOR MILESTONE: Real Dashboard Analytics Integration**
- ✅ **Live Data Connection:** Dashboard kết nối trực tiếp với Supabase production database
- ✅ **Real Revenue Analytics:** Tính toán doanh thu thật từ `invoices.total_amount`
- ✅ **Live Customer Metrics:** Thống kê khách hàng từ database thực
- ✅ **Inventory Analytics:** Dữ liệu tồn kho trực tiếp từ `products` table
- ✅ **Transaction Monitoring:** Theo dõi đơn hàng real-time từ production data

### 🔧 **Technical Achievements**
- ✅ **Database Schema Fixes:** Corrected table mapping (`invoices` vs `invoice_headers`)
- ✅ **Service Layer:** Complete `DashboardService` với Supabase integration
- ✅ **React Hooks:** `useDashboard()` hook với comprehensive state management
- ✅ **UI Components:** StatCard, RevenueChart, TopProducts với real data visualization
- ✅ **TypeScript:** Zero compilation errors với proper type definitions

### ✅ **Build & Deployment Status**
- 🏗️ **Build Success:** Next.js 15.4.5 compilation successful (npm run build ✅)
- 🔧 **Code Quality:** Zero TypeScript errors, ESLint compliant
- 📱 **Mobile Optimization:** Complete responsive design for all core pages
- ⚡ **Performance:** Mobile-first approach with progressive enhancement

### ✅ **Core Business Modules Complete**
- 📦 **Products Management** - Mobile optimized, 1049+ products
- 🏢 **Suppliers Management** - Mobile optimized, 51 suppliers  
- 👥 **Customers Management** - Complete, 1000+ customers
- 🧾 **Invoices Management** - Complete, 739+ invoices
- ⚙️ **Settings System** - Foundation with 80+ business settings

#### 🏗️ **Kiến trúc & Infrastructure**
- [x] Next.js 15.4.5 App Router với TypeScript
- [x] Supabase Authentication & Database
- [x] PostgreSQL schema hoàn chỉnh (13 tables)
- [x] shadcn/ui + Tailwind CSS + Framer Motion
- [x] Responsive design (mobile-first) với breakpoint strategy

#### 📱 **Mobile Optimization Complete**
- [x] Products page - Responsive grid, touch-friendly UI
- [x] Suppliers page - Mobile-optimized cards and navigation
- [x] Progressive breakpoints (sm:640px, lg:1024px, xl:1280px)
- [x] Mobile-first typography and spacing
- [x] Touch-friendly interactive elements

#### 🔐 **Authentication System**
- [x] Login/Register với Supabase Auth
- [x] Protected routes với AuthWrapper
- [x] User session management
- [x] Auto redirect sau login thành công
- [x] Logout functionality

#### 🎨 **UI/UX Layout**
- [x] **Sidebar Navigation** - Collapsible với animation
  - Menu items: Dashboard, Bán Hàng, Khách Hàng, Sản Phẩm, Kho Hàng, NCC, Tài Chính, Báo Cáo, Chi Nhánh, Cài Đặt
  - Submenu cho các module phức tạp
  - Badge notifications (ví dụ: 5 cảnh báo kho hàng)
  - Mobile responsive với overlay
- [x] **Header Component** - Professional header
  - Search bar (desktop/mobile)
  - Notification dropdown (3 notifications mẫu)
  - Messages dropdown (2 messages mẫu)  
  - Theme switcher (Sáng/Tối/Hệ thống)
  - Real user info với avatar initials
  - User dropdown menu với logout
- [x] **Dashboard Layout** - Main layout wrapper
  - Zustand state management cho sidebar
  - Smooth animations với Framer Motion
  - Dark/Light theme support

#### 📱 **Landing Page**
- [x] **Hero Section** với thông tin Thú Y Thùy Trang
- [x] **Features showcase** (6 tính năng chính)
- [x] **Benefits section** (5 lợi ích)
- [x] **Developer info** với contact details
- [x] **Call-to-action** buttons
- [x] **Professional footer**
- [x] **Responsive design** cho tất cả devices

#### 📊 **Dashboard Page**
- [x] **Quick stats cards** (4 KPIs với dữ liệu mẫu)
- [x] **Recent orders table** (4 đơn hàng gần đây)
- [x] **Low stock alerts** (4 sản phẩm sắp hết)
- [x] **Status badges** và **progress indicators**
- [x] **Interactive elements** và hover effects

### 🔄 **Đang phát triển (Phase 2 - Core Business)**

#### 📦 **Quản lý Sản phẩm** [In Progress]
- [ ] Product listing với pagination
- [ ] Product categories management
- [ ] Units management  
- [ ] Stock tracking
- [ ] Product search & filters

#### 👥 **Quản lý Khách hàng** [Planning]
- [ ] Customer database
- [ ] Customer types & classification
- [ ] Purchase history
- [ ] Debt tracking
- [ ] Customer analytics

#### 🛒 **Quản lý Bán hàng** [Planning]
- [ ] Invoice creation
- [ ] Order processing
- [ ] Return handling
- [ ] Payment tracking

#### 🏪 **Quản lý Kho hàng** [Planning]
- [ ] Inventory management
- [ ] Stock alerts system
- [ ] Inbound/Outbound tracking
- [ ] Stock counting

### 📋 **Kế hoạch (Phase 3 - Advanced Features)**
- [ ] Báo cáo & Analytics
- [ ] Tài chính & Thu chi
- [ ] Nhà cung cấp management
- [ ] Multi-branch support
- [ ] Export/Import functions
- [ ] Backup & Restore

## 🗃️ Database Schema {#database-schema}

### **13 Tables chính đã implement:**

```sql
-- Core Master Data
1. branches (Chi nhánh)
2. customer_types (Loại khách hàng) 
3. customers (Khách hàng - với debt tracking)
4. suppliers (Nhà cung cấp)
5. product_categories (Danh mục sản phẩm)
6. products (Sản phẩm - với inventory management)
7. units (Đơn vị tính)
8. product_units (Quy đổi đơn vị)

-- Transaction Documents  
9. invoices (Hóa đơn bán hàng)
10. invoice_details (Chi tiết hóa đơn)
11. purchase_orders (Đơn đặt hàng)
12. financial_transactions (Giao dịch tài chính)
13. sales_channels (Kênh bán hàng)
```

### **Advanced Functions đã có:**
- `get_financial_summary(date_from, date_to)` - Báo cáo tài chính tổng hợp
- `get_inventory_alerts()` - Cảnh báo tồn kho thông minh
- `dashboard_quick_stats` VIEW - Thống kê nhanh dashboard

## ✨ Tính năng đã implement {#features}

### 🏪 **Dashboard & Navigation**
- **Real-time dashboard** với live stats
- **Sidebar navigation** với submenu động
- **Header** với search, notifications, user profile
- **Theme switching** (Light/Dark/System) bằng tiếng Việt
- **Responsive design** hoạt động mượt mà trên mobile

### 🔐 **Authentication & Security**
- **Supabase Auth** với email/password
- **Protected routes** với AuthWrapper component
- **Session persistence** across browser tabs
- **Auto redirect** sau login/logout
- **Real user info** hiển thị trong header

### 🎨 **UI/UX Excellence**
- **Modern design** với glass morphism
- **Smooth animations** với Framer Motion
- **Professional color scheme** (Blue primary)
- **Consistent typography** (Inter font family)
- **Hover effects** và micro-interactions
- **Loading states** và skeleton screens

### 📊 **Data Visualization Ready**
- **Chart components** structure
- **KPI cards** với trend indicators
- **Status badges** system
- **Progress bars** và completion states
- **Alert systems** với priority levels

## 🛠️ Tech Stack {#tech-stack}

### **Frontend Framework**
- **Next.js 15** - App Router với Server/Client Components
- **TypeScript** - Type safety toàn bộ codebase
- **React 19** - Latest features và performance

### **UI & Styling**  
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - High-quality component library
- **Radix UI** - Headless accessible components
- **Framer Motion** - Advanced animations
- **Lucide React** - Beautiful icon library

### **Backend & Database**
- **Supabase** - PostgreSQL + Auth + Real-time
- **Row Level Security** - Database-level permissions
- **Edge Functions** ready for advanced logic

### **State Management**
- **Zustand** - Lightweight state management
- **React Hook Form** ready for complex forms
- **Zod** ready for schema validation

### **Development Tools**
- **ESLint + Prettier** - Code quality
- **TypeScript** strict mode
- **Hot reload** development experience

## 🏗️ Kiến trúc Project {#architecture}

```
thuyle06-fulldata/
├── app/                    # Next.js App Router
│   ├── auth/              # Authentication pages
│   │   ├── login/         ✅ Login form với redirect
│   │   ├── sign-up/       ✅ Registration form
│   │   ├── confirm/       ✅ Email confirmation
│   │   └── error/         ✅ Error handling
│   ├── dashboard/         ✅ Main dashboard page
│   ├── layout.tsx         ✅ Root layout
│   └── page.tsx           ✅ Landing page (Thú Y Thùy Trang)
├── components/            # Reusable components
│   ├── ui/               ✅ shadcn/ui base components
│   ├── layout/           ✅ Layout components
│   │   ├── sidebar.tsx   ✅ Collapsible sidebar navigation
│   │   ├── header.tsx    ✅ Professional header
│   │   └── dashboard-layout.tsx ✅ Main layout wrapper
│   ├── auth-wrapper.tsx  ✅ Route protection
│   ├── client-auth-button.tsx ✅ Client-side auth
│   └── theme-switcher.tsx ✅ Vietnamese theme names
├── lib/                   # Utilities & configurations
│   ├── supabase/         ✅ Supabase client/server setup
│   ├── store.ts          ✅ Zustand sidebar state
│   └── utils.ts          ✅ Utility functions
├── json-output/          📊 Real business data from KiotViet
│   ├── 01-master-data/   📊 Products, Customers, Suppliers
│   ├── 02-documents/     📊 Invoices, Orders, Transactions
│   └── 03-details/       📊 Transaction line items
├── backup_thuyle_*.sql   📊 Complete PostgreSQL schema
└── README.md             📚 This comprehensive documentation
```

## 🚀 Getting Started {#getting-started}

### **Yêu cầu hệ thống:**
- Node.js 18+ 
- npm/yarn/pnpm
- Supabase account

### **Installation:**

```bash
# Clone repository
git clone [repository-url]
cd thuyle06-fulldata

# Install dependencies  
npm install

# Setup environment
cp .env.example .env.local
# Cập nhật SUPABASE_URL và SUPABASE_ANON_KEY

# Run development server
npm run dev
```

### **Workflow sử dụng:**
1. **Truy cập:** http://localhost:3000
2. **Landing page:** Giới thiệu về Thú Y Thùy Trang
3. **Đăng ký/Đăng nhập:** `/auth/sign-up` hoặc `/auth/login`
4. **Dashboard:** Tự động redirect sau login thành công
5. **Navigation:** Sử dụng sidebar để điều hướng modules

## 📈 Roadmap Development

### **Phase 2 - Core Business (Q1 2025)**
- [ ] **Product Management** - CRUD sản phẩm với categories
- [ ] **Customer Management** - Database khách hàng với history
- [ ] **Basic Sales** - Tạo hóa đơn đơn giản
- [ ] **Inventory Tracking** - Theo dõi tồn kho basic

### **Phase 3 - Advanced Features (Q2 2025)**  
- [ ] **Financial Reports** - Implement các function SQL có sẵn
- [ ] **Purchase Orders** - Quản lý đặt hàng từ NCC
- [ ] **Multi-branch** - Support nhiều chi nhánh
- [ ] **Advanced Analytics** - Charts và insights

### **Phase 4 - Enterprise Features (Q3 2025)**
- [ ] **Mobile App** - React Native companion
- [ ] **API Integration** - Tích hợp với accounting systems
- [ ] **Backup/Restore** - Data management tools
- [ ] **Multi-tenant** - Hỗ trợ nhiều doanh nghiệp

## 💡 Key Implementation Notes

### **Authentication Flow:**
```typescript
// Login success → redirect to /dashboard
// Protected routes use AuthWrapper component
// Real user info displayed in header
// Logout → redirect to /auth/login
```

### **State Management:**
```typescript
// Zustand store for sidebar state (open/closed, mobile detection)
// User state managed by Supabase auth context
// Theme state managed by next-themes
```

### **Database Connection:**
```typescript
// Server Components: use createClient from @/lib/supabase/server  
// Client Components: use createClient from @/lib/supabase/client
// Real-time subscriptions ready for live updates
```

### **Responsive Design:**
```css
/* Mobile-first approach */
/* Sidebar: full overlay on mobile, collapsible on desktop */
/* Header: simplified on mobile, full features on desktop */
/* Dashboard: stacked cards on mobile, grid on desktop */
```

## 🎯 Business Logic Implementation Ready

### **Modules nghiệp vụ đã chuẩn bị:**
1. **Bán hàng** - Invoice creation, order processing
2. **Khách hàng** - CRM với debt tracking  
3. **Sản phẩm** - Catalog với categories & units
4. **Kho hàng** - Inventory với alerts system
5. **Tài chính** - Financial tracking & reporting
6. **Báo cáo** - Analytics với charts
7. **Nhà cung cấp** - Supplier management
8. **Chi nhánh** - Multi-location support

### **SQL Functions sẵn sàng:**
- Financial summary với profit calculation
- Inventory alerts với thresholds  
- Dashboard quick stats với real-time data
- Customer analytics với purchase history

---

## 📞 Support & Contact

**Developer:** Thắng Phan - Gia Kiệm Số  
**Email:** ericphan28@gmail.com  
**Zalo:** 0907136029  
**Website:** giakiemso.com  
**Facebook:** https://www.facebook.com/thang.phan.334/

---

<p align="center">
  <strong>🏥 Được xây dựng đặc biệt cho ngành Thú Y với hiểu biết sâu sắc về quy trình kinh doanh 🐾</strong>
</p>
