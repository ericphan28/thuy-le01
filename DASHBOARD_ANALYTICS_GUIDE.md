# 📊 Dashboard Analytics Guide - Real Data Integration

## 🎯 Overview

Dashboard đã được **hoàn toàn chuyển đổi** từ mock data sang **live production data** từ Supabase database. Tất cả analytics hiện tại đều dựa trên dữ liệu thực từ business operations.

## 🏗️ Architecture

### Service Layer
```typescript
// lib/services/dashboard-service.ts
export class DashboardService {
  private supabase = createClient()

  // Real revenue calculations from invoices table
  async getDashboardStats(): Promise<DashboardStats>
  
  // 30-day revenue trends from actual transactions  
  async getRevenueData(): Promise<RevenueData[]>
  
  // Best selling products from invoice_details
  async getTopProducts(): Promise<TopProduct[]>
  
  // Latest transactions with customer info
  async getRecentOrders(): Promise<RecentOrder[]>
}
```

### React Hook Integration
```typescript
// lib/hooks/use-dashboard.ts
export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueData[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Loads all dashboard data in parallel
  const loadDashboardData = async () => { ... }
}
```

## 📈 Analytics Components

### 1. StatCard Component
**Purpose**: Display key business metrics with growth indicators

```typescript
// components/dashboard/stat-card.tsx
<StatCard
  title="Tổng Doanh Thu"
  value={stats?.totalRevenue || 0}
  icon={DollarSign}
  growth={stats?.revenueGrowth || 0}
  prefix="₫"
  loading={loading}
/>
```

**Data Source**: 
- Revenue: Sum of `invoices.total_amount` where `status='completed'`
- Growth: Comparison với previous month's revenue

### 2. Revenue Chart
**Purpose**: 30-day revenue trend visualization

```typescript
// components/dashboard/revenue-chart.tsx
<RevenueChart data={revenueData} loading={loading} />
```

**Data Source**:
- Daily revenue aggregation from `invoices` table
- Last 30 days transaction data
- Grouped by `invoice_date` with sum calculations

### 3. Top Products Widget
**Purpose**: Best selling products analysis

```typescript
// components/dashboard/dashboard-widgets.tsx
<TopProducts products={topProducts} loading={loading} />
```

**Data Source**:
- Aggregated from `invoice_details` joined with `invoices`
- Grouped by `product_id` with quantity and revenue calculations
- Filtered for completed transactions only

### 4. Recent Orders Widget
**Purpose**: Latest transaction monitoring

```typescript
<RecentOrders orders={recentOrders} loading={loading} />
```

**Data Source**:
- Latest 10 records from `invoices` table
- Ordered by `invoice_date` descending
- Includes customer information and status

## 🗄️ Database Schema

### Key Tables Used

#### invoices
```sql
-- Main transactions table
invoice_id (PRIMARY KEY)
invoice_code (UNIQUE)
customer_id (FOREIGN KEY)
customer_name
total_amount
status (completed, pending, cancelled)
invoice_date
created_at
updated_at
```

#### invoice_details
```sql
-- Line items for each invoice
detail_id (PRIMARY KEY)
invoice_id (FOREIGN KEY → invoices)
product_id (FOREIGN KEY → products)
product_name
quantity
unit_price
line_total
```

#### customers
```sql
-- Customer master data
customer_id (PRIMARY KEY)
customer_code (UNIQUE)
customer_name
current_debt
total_revenue
is_active
created_at
```

#### products
```sql
-- Product catalog
product_id (PRIMARY KEY)
product_code (UNIQUE)
product_name
current_stock
sale_price
is_active
created_at
```

## 📊 Real Data Metrics

### Revenue Calculations
```typescript
// Monthly revenue growth
const currentMonthRevenue = sum(invoices.total_amount) 
  WHERE invoice_date >= startOfMonth 
  AND status = 'completed'

const growthRate = ((current - previous) / previous) * 100
```

### Order Analytics
```typescript
// Total orders with status breakdown
const totalOrders = count(*) FROM invoices
const completedOrders = count(*) WHERE status = 'completed'
const pendingOrders = count(*) WHERE status = 'pending'
```

### Customer Analytics
```typescript
// Customer growth and segmentation
const totalCustomers = count(*) FROM customers WHERE is_active = true
const newCustomers = count(*) WHERE created_at >= startOfMonth
```

### Product Performance
```typescript
// Top products by quantity and revenue
SELECT 
  product_id,
  product_name,
  SUM(quantity) as total_quantity,
  SUM(line_total) as total_revenue
FROM invoice_details
JOIN invoices ON invoice_details.invoice_id = invoices.invoice_id
WHERE invoices.status = 'completed'
GROUP BY product_id, product_name
ORDER BY total_revenue DESC
```

## 🔄 Data Flow

### 1. Initial Load
```typescript
useEffect(() => {
  loadDashboardData()
}, [])
```

### 2. Parallel Data Fetching
```typescript
const [
  statsData,
  revenueData, 
  topProductsData,
  recentOrdersData
] = await Promise.all([
  dashboardService.getDashboardStats(),
  dashboardService.getRevenueData(),
  dashboardService.getTopProducts(),
  dashboardService.getRecentOrders()
])
```

### 3. State Updates
```typescript
setStats(statsData)
setRevenueData(revenueData)
setTopProducts(topProductsData)
setRecentOrders(recentOrdersData)
setLoading(false)
```

## 🎨 UI Features

### Loading States
- Skeleton components during data fetching
- Animated loading spinners
- Progressive loading of widgets

### Error Handling
- Try/catch blocks in all data fetching
- User-friendly error messages
- Retry functionality

### Responsive Design
- Mobile-first approach
- Grid layouts that adapt to screen size
- Touch-friendly interactions

### Vietnamese Localization
- Currency formatting (₫)
- Date/time in Vietnamese format
- Business-appropriate labels

## 🔧 Development Features

### Debug Panel (Development Mode)
```typescript
{process.env.NODE_ENV === 'development' && (
  <Card className="border-dashed">
    <CardHeader>
      <CardTitle className="text-sm">🔧 Debug Info</CardTitle>
    </CardHeader>
    <CardContent className="text-xs text-gray-600">
      <div className="grid grid-cols-2 gap-4">
        <div><strong>Stats:</strong> {stats ? '✅ Loaded' : '❌ Empty'}</div>
        <div><strong>Revenue Data:</strong> {revenueData.length} points</div>
        <div><strong>Top Products:</strong> {topProducts.length} items</div>
        <div><strong>Recent Orders:</strong> {recentOrders.length} items</div>
      </div>
    </CardContent>
  </Card>
)}
```

### Refresh Functionality
```typescript
const refetch = async () => {
  setLoading(true)
  await loadDashboardData()
}
```

## 🚀 Performance Optimizations

### Database Queries
- Indexed columns for fast lookups
- Optimized JOIN operations
- Date range filters for large datasets

### React Optimizations
- useMemo for expensive calculations
- useCallback for event handlers
- Proper dependency arrays in useEffect

### Caching Strategy
- Supabase client-side caching
- Component-level state management
- Efficient re-rendering patterns

---

**Status**: ✅ **PRODUCTION READY** với real data integration  
**Last Updated**: August 13, 2025  
**Next Phase**: Advanced analytics và custom reporting
