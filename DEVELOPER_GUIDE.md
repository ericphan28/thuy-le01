# �‍💻 Developer Guide - Xuân Thùy Veterinary Management System

## � Overview & Navigation

### Quick Links
- **[Project Status](#project-status)** - Current development state và achievements
- **[Business Context](#business-context)** - Domain knowledge cho veterinary retail
- **[Architecture](#architecture)** - System design và component structure
- **[Dashboard Integration](#dashboard-integration)** - Real data analytics implementation
- **[Developer Workflow](#developer-workflow)** - Daily development practices
- **[Database Schema](#database-schema)** - Supabase tables và relationships
- **[API Reference](#api-reference)** - Service layer documentation

---

## 🎯 Project Status

### ✅ **Production Ready Features (August 13, 2025)**

#### 🔥 **MAJOR ACHIEVEMENT: Real Dashboard Analytics Integration**
- **Live Data Connection:** Dashboard hoàn toàn kết nối với production Supabase
- **Real-time Metrics:** Revenue, customers, products, orders từ database thực
- **Performance Optimized:** Parallel queries với proper loading states
- **Type-safe:** Comprehensive TypeScript definitions cho all analytics data

#### 📊 **Dashboard Components Status**
```typescript
✅ StatCard - Real revenue, customer count, product inventory
✅ RevenueChart - Monthly/daily revenue visualization 
✅ TopProducts - Best selling items với actual sales data
✅ RecentOrders - Latest transactions từ invoices table
✅ useDashboard Hook - Complete state management
✅ DashboardService - Optimized Supabase queries
```

#### 🔧 **Technical Achievements**
- **Database Fixes:** Corrected table name mapping (invoices vs invoice_headers)
- **Service Layer:** Production-ready DashboardService class
- **Error Handling:** Comprehensive try-catch với user-friendly messages
- **Build Success:** Zero TypeScript errors, successful production build
- **ESLint Config:** Simplified configuration to resolve plugin issues
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 🧭 Navigation

### Main Routes
```
/dashboard              # Main dashboard
/dashboard/products     # Products management (✅ Mobile optimized)
/dashboard/suppliers    # Suppliers management (✅ Mobile optimized) 
/dashboard/customers    # Customer management (✅ Complete)
/dashboard/invoices     # Invoice management (✅ Complete)
/dashboard/settings     # Settings system (✅ Complete)
```

### Key Files
```
app/dashboard/          # Main application pages
components/ui/          # Reusable UI components (shadcn/ui)
lib/supabase/          # Database connection and types
lib/services/          # Business logic and API calls
lib/hooks/             # Custom React hooks
```

## 🎨 Design System

### UI Framework
- **Components:** shadcn/ui + Radix UI primitives
- **Styling:** Tailwind CSS with custom configurations
- **Icons:** Lucide React icons
- **Animations:** Framer Motion (minimal usage)

### Responsive Breakpoints
```css
/* Mobile first approach */
default: 0px-639px     /* Mobile */
sm: 640px+             /* Small tablet */
md: 768px+             /* Tablet */
lg: 1024px+            /* Desktop */
xl: 1280px+            /* Large desktop */
2xl: 1536px+           /* Extra large */
```

### Color Palette
```css
/* Primary colors */
Blue: #3B82F6 (primary brand)
Green: #10B981 (success, active)
Orange: #F59E0B (warnings, prescriptions)
Red: #EF4444 (errors, alerts)
Gray: #6B7280 (text, borders)
```

## 🗄️ Database Schema

### Core Tables
```sql
products (1049+ records)
├── product_id, product_code, product_name
├── sale_price, cost_price, current_stock, min_stock
├── is_medicine, requires_prescription, is_active
└── category_id → product_categories

customers (1000+ records)
├── customer_id, customer_code, customer_name
├── phone, email, address, debt
└── customer_group_id → customer_groups

suppliers (51 records)
├── supplier_id, supplier_code, supplier_name
├── contact_person, phone, email, address
└── payment_terms, is_active

invoices (739+ records)
├── invoice_id, invoice_number, total_amount
├── customer_id, payment_status, created_at
└── invoice_details (line items)

-- Settings System (Foundation)
system_settings, branch_settings, settings_change_log
```

## 🛠️ Development Patterns

### TypeScript Interfaces
```typescript
// Always define proper interfaces
interface Product {
  product_id: number
  product_code: string
  product_name: string
  sale_price: number
  current_stock: number
  product_categories?: {
    category_id: number
    category_name: string
  } | null
}
```

### React Hooks Pattern
```typescript
// Use useCallback for data fetching
const fetchData = useCallback(async () => {
  try {
    setLoading(true)
    const { data, error } = await supabase
      .from('table')
      .select('*')
    
    if (error) throw error
    setData(data)
  } catch (error) {
    console.error('Error:', error)
  } finally {
    setLoading(false)
  }
}, [supabase])

useEffect(() => {
  fetchData()
}, [fetchData])
```

### Mobile-First Components
```typescript
// Standard responsive layout
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
  
// Responsive text sizing
<h1 className="text-xl sm:text-2xl font-bold">
<p className="text-xs sm:text-sm text-gray-600">

// Mobile-optimized buttons
<Button className="text-xs sm:text-sm px-3 py-2">
  <span className="hidden sm:inline">Full Text</span>
  <span className="sm:hidden">Short</span>
</Button>
```

## 🔧 Common Tasks

### Adding a New Page
1. Create component in `app/dashboard/your-page/page.tsx`
2. Add TypeScript interfaces for data types
3. Implement responsive design with mobile-first approach
4. Add navigation link in main layout
5. Test on mobile and desktop breakpoints

### Database Operations
```typescript
// Read data
const { data, error } = await supabase
  .from('products')
  .select('*, product_categories(*)')
  .eq('is_active', true)

// Handle relations properly
const transformedData = data?.map(item => ({
  ...item,
  product_categories: Array.isArray(item.product_categories) 
    ? item.product_categories[0] || null
    : item.product_categories
}))
```

### Adding Responsive Features
1. Start with mobile layout (`default` breakpoint)
2. Add tablet improvements (`sm:` classes)
3. Enhance for desktop (`lg:` and `xl:` classes)
4. Test across all breakpoints
5. Ensure touch-friendly interactive elements

## 📱 Mobile Optimization Checklist

- [ ] Responsive grid layouts
- [ ] Touch-friendly button sizes (min 44px)
- [ ] Readable text on small screens
- [ ] Proper text truncation and line clamping
- [ ] Mobile-friendly navigation
- [ ] Optimized spacing and padding
- [ ] Fast loading and smooth interactions

## 🚨 Code Quality Standards

### Must Follow
- ✅ TypeScript strict mode compliance
- ✅ Proper error handling and loading states
- ✅ Mobile-first responsive design
- ✅ Semantic HTML and accessibility
- ✅ Consistent code formatting (Prettier)
- ✅ ESLint compliance

### Avoid
- ❌ Using `any` types (use proper interfaces)
- ❌ Hard-coded values (use constants or settings)
- ❌ Missing error boundaries
- ❌ Non-responsive layouts
- ❌ Skipping mobile testing

## 📚 Documentation

### Essential Reading
- `AI_CONTEXT.md` - Complete project context
- `PROJECT_STATUS.md` - Current development status
- `BUSINESS_ANALYSIS.md` - Business requirements
- `docs/` folder - Technical documentation

### Business Context
- **Industry:** Veterinary pharmacy retail
- **Users:** Store staff, managers, admin
- **Goal:** Complete POS/ERP solution
- **Priority:** User experience and mobile support

## 🎯 Next Development Priorities

1. **POS/Sales System** - Create sales transactions
2. **Inventory Management** - Stock control and alerts  
3. **Reporting Dashboard** - Business analytics
4. **Multi-branch Support** - Extend settings system

---

**🚀 Ready to contribute?** The foundation is solid, codebase is clean, and all patterns are established. Focus on maintaining the quality standards and responsive design principles!
