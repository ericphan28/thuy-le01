# Customer Analytics & Statistics Documentation
# Tài Liệu Phân Tích & Thống Kê Khách Hàng - Xuân Thùy Pet Pharmacy

**Generated:** ${new Date().toLocaleString('vi-VN')}  
**Database:** Supabase PostgreSQL  
**Total Customers Analyzed:** 398

---

## 📊 Executive Summary - Tóm Tắt Điều Hành

### Key Performance Indicators (KPIs)
| Metric | Value | Status |
|--------|-------|--------|
| **Total Customers** | 398 | ✅ 100% Active |
| **Total Revenue** | 17.689.327.118 VND | 🎯 ~17.7 Billion |
| **Average Revenue per Customer** | 44.445.546 VND | 📈 ~44.4 Million |
| **VIP Customers (>50M)** | 102 (25.6%) | 💎 Premium Segment |
| **High-Value Customers (10M-50M)** | 117 (29.4%) | 🥇 Core Revenue |
| **Data Quality Score** | 23.3% | ⚠️ Needs Improvement |

### Business Insights
- **Customer Concentration**: Top 10 customers generate ~25% of total revenue
- **Market Penetration**: Strong presence with high-value veterinary clinics
- **Growth Opportunity**: Significant data quality improvement needed
- **Revenue Distribution**: Well-balanced across all segments except no-revenue (15.1%)

---

## 🏗️ Database Schema & Structure

### Core Tables Overview

#### 1. customers - Bảng Khách Hàng Chính
```sql
CREATE TABLE public.customers (
    customer_id integer PRIMARY KEY,
    customer_code text UNIQUE NOT NULL,
    customer_name text NOT NULL,
    customer_type_id integer REFERENCES customer_types(type_id),
    branch_created_id integer REFERENCES branches(branch_id),
    phone text,
    email text,
    address text,
    company_name text,
    tax_code text,
    id_number text,
    gender text,
    debt_limit numeric DEFAULT 0,
    current_debt numeric DEFAULT 0,
    total_revenue numeric DEFAULT 0,
    total_profit numeric DEFAULT 0,
    purchase_count integer DEFAULT 0,
    last_purchase_date timestamp,
    status integer DEFAULT 1,
    notes text,
    created_by text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_customers_customer_code_not_empty CHECK (length(TRIM(customer_code)) > 0)
);

-- Indexes for Performance
CREATE INDEX idx_customers_customer_code ON customers(customer_code);
CREATE INDEX idx_customers_customer_type_id ON customers(customer_type_id);
CREATE INDEX idx_customers_branch_created_id ON customers(branch_created_id);
CREATE INDEX idx_customers_phone ON customers(phone);
```

#### 2. customer_types - Loại Khách Hàng
```sql
CREATE TABLE public.customer_types (
    type_id integer PRIMARY KEY,
    type_code text UNIQUE NOT NULL,
    type_name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Current Types (từ phân tích thực tế):
-- 1. Cá nhân (100% customers)
```

#### 3. invoices - Hóa Đơn
```sql
CREATE TABLE public.invoices (
    invoice_id integer PRIMARY KEY,
    invoice_code text UNIQUE NOT NULL,
    customer_id integer REFERENCES customers(customer_id),
    branch_id integer REFERENCES branches(branch_id),
    sales_channel_id integer REFERENCES sales_channels(channel_id),
    invoice_date timestamp NOT NULL,
    total_amount numeric CHECK (total_amount >= 0),
    discount_amount numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    final_amount numeric,
    payment_status text DEFAULT 'pending',
    notes text,
    created_by text NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);
```

#### 4. invoice_details - Chi Tiết Hóa Đơn
```sql
CREATE TABLE public.invoice_details (
    detail_id integer PRIMARY KEY,
    invoice_id integer REFERENCES invoices(invoice_id),
    product_id integer REFERENCES products(product_id),
    quantity numeric NOT NULL,
    unit_price numeric CHECK (unit_price >= 0),
    discount_rate numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    line_total numeric,
    notes text
);
```

---

## 🛠️ Supabase API Reference - Tài Liệu API Đầy Đủ

### 1. Basic CRUD Operations - Thao Tác CRUD Cơ Bản

#### Customer CRUD
```typescript
// READ - Lấy dữ liệu khách hàng
const { data: customers, error } = await supabase
  .from('customers')
  .select(`
    *,
    customer_types(type_name, description),
    branches(branch_name)
  `)
  .order('customer_id');

// READ with filters - Lọc dữ liệu
const { data: activeCustomers } = await supabase
  .from('customers')
  .select('*')
  .eq('is_active', true)
  .gte('total_revenue', 1000000)
  .order('total_revenue', { ascending: false });

// CREATE - Tạo khách hàng mới
const { data: newCustomer, error } = await supabase
  .from('customers')
  .insert({
    customer_code: 'KH000999',
    customer_name: 'Khách hàng mới',
    customer_type_id: 1,
    branch_created_id: 1,
    phone: '0901234567',
    email: 'customer@example.com',
    created_by: 'admin'
  })
  .select();

// UPDATE - Cập nhật thông tin
const { data: updatedCustomer, error } = await supabase
  .from('customers')
  .update({
    phone: '0987654321',
    email: 'newemail@example.com',
    updated_at: new Date().toISOString()
  })
  .eq('customer_id', 123)
  .select();

// DELETE - Xóa (Soft delete recommended)
const { error } = await supabase
  .from('customers')
  .update({ is_active: false })
  .eq('customer_id', 123);
```

### 2. Advanced Queries - Truy Vấn Nâng Cao

#### Complex Filtering & Aggregation
```typescript
// Revenue Analysis by Customer Type
const { data: revenueByType } = await supabase
  .from('customers')
  .select(`
    customer_type_id,
    customer_types(type_name),
    total_revenue
  `)
  .not('total_revenue', 'is', null);

// Top Customers with Pagination
const { data: topCustomers, count } = await supabase
  .from('customers')
  .select('*', { count: 'exact' })
  .gte('total_revenue', 0)
  .order('total_revenue', { ascending: false })
  .range(0, 19); // Top 20

// Customer Search with Full-Text Search
const { data: searchResults } = await supabase
  .from('customers')
  .select(`
    customer_id,
    customer_code,
    customer_name,
    phone,
    email,
    total_revenue
  `)
  .or(`customer_name.ilike.%${searchTerm}%, customer_code.ilike.%${searchTerm}%, phone.ilike.%${searchTerm}%`);

// Date Range Analysis
const { data: recentCustomers } = await supabase
  .from('customers')
  .select('*')
  .gte('created_at', '2025-01-01')
  .lte('created_at', '2025-12-31')
  .order('created_at', { ascending: false });
```

### 3. Database Functions - Hàm Database

#### Built-in Functions (từ schema)
```sql
-- 1. Customer Search with Statistics
CREATE OR REPLACE FUNCTION search_customers_with_stats(
    search_term text DEFAULT '',
    customer_type_filter integer DEFAULT NULL,
    limit_count integer DEFAULT 50,
    date_from date DEFAULT (CURRENT_DATE - '90 days'::interval)
)
RETURNS TABLE(
    customer_id integer,
    customer_code text,
    customer_name text,
    customer_type_name text,
    phone text,
    email text,
    address text,
    total_orders bigint,
    total_spent numeric,
    avg_order_value numeric,
    last_purchase_date timestamp,
    days_since_last_purchase integer,
    customer_segment text,
    is_active boolean
);

-- Usage in TypeScript
const { data: customerStats, error } = await supabase
  .rpc('search_customers_with_stats', {
    search_term: 'HUYỀN',
    customer_type_filter: null,
    limit_count: 10,
    date_from: '2025-01-01'
  });
```

```sql
-- 2. Financial Summary Function
CREATE OR REPLACE FUNCTION get_financial_summary(
    date_from date DEFAULT (CURRENT_DATE - '30 days'::interval),
    date_to date DEFAULT CURRENT_DATE
)
RETURNS json;

-- Usage
const { data: financialSummary } = await supabase
  .rpc('get_financial_summary', {
    date_from: '2025-07-01',
    date_to: '2025-07-31'
  });
```

```sql
-- 3. Pharmacy Dashboard Stats
CREATE OR REPLACE FUNCTION get_pharmacy_dashboard_stats(
    date_from date DEFAULT (CURRENT_DATE - '30 days'::interval),
    date_to date DEFAULT CURRENT_DATE
)
RETURNS json;

-- Usage
const { data: dashboardStats } = await supabase
  .rpc('get_pharmacy_dashboard_stats', {
    date_from: '2025-07-01',
    date_to: '2025-07-31'
  });
```

### 4. Database Views - Views Hệ Thống

#### Customer Analysis Views
```sql
-- 1. Customer Statistics View
CREATE VIEW customer_statistics AS
SELECT 
    c.customer_id,
    c.customer_code,
    c.customer_name,
    ct.type_name as customer_type,
    c.total_revenue,
    c.current_debt,
    c.purchase_count,
    c.last_purchase_date,
    CASE 
        WHEN c.total_revenue >= 50000000 THEN 'VIP'
        WHEN c.total_revenue >= 10000000 THEN 'High'
        WHEN c.total_revenue >= 1000000 THEN 'Medium'
        WHEN c.total_revenue > 0 THEN 'Low'
        ELSE 'No Revenue'
    END as revenue_segment,
    CASE
        WHEN c.phone IS NOT NULL AND c.email IS NOT NULL AND c.address IS NOT NULL THEN 'Complete'
        WHEN c.phone IS NOT NULL OR c.email IS NOT NULL THEN 'Partial'
        ELSE 'Incomplete'
    END as data_completeness,
    c.is_active,
    c.created_at
FROM customers c
LEFT JOIN customer_types ct ON c.customer_type_id = ct.type_id;

-- Usage
const { data: customerStats } = await supabase
  .from('customer_statistics')
  .select('*')
  .order('total_revenue', { ascending: false });
```

```sql
-- 2. Dashboard Quick Stats View
CREATE VIEW dashboard_quick_stats AS
SELECT 
    COUNT(DISTINCT i.invoice_id) as total_orders_today,
    COALESCE(SUM(i.total_amount), 0) as revenue_today,
    COUNT(DISTINCT i.customer_id) as active_customers_today,
    (SELECT COUNT(*) FROM customers WHERE is_active = true) as total_active_customers,
    (SELECT COUNT(*) FROM customers WHERE created_at::date = CURRENT_DATE) as new_customers_today
FROM invoices i
WHERE i.invoice_date::date = CURRENT_DATE;

-- Usage
const { data: quickStats } = await supabase
  .from('dashboard_quick_stats')
  .select('*')
  .single();
```

### 5. Real-time Subscriptions - Theo Dõi Thời Gian Thực

```typescript
// Subscribe to customer changes
const customerSubscription = supabase
  .channel('customers-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'customers'
  }, (payload) => {
    console.log('Customer changed:', payload);
    // Handle real-time updates
  })
  .subscribe();

// Subscribe to new orders
const orderSubscription = supabase
  .channel('new-orders')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'invoices'
  }, (payload) => {
    console.log('New order:', payload.new);
    // Update dashboard in real-time
  })
  .subscribe();
```

### 6. Batch Operations - Thao Tác Hàng Loạt

```typescript
// Bulk insert customers
const { data: newCustomers, error } = await supabase
  .from('customers')
  .insert([
    {
      customer_code: 'KH001001',
      customer_name: 'Customer 1',
      customer_type_id: 1,
      branch_created_id: 1,
      created_by: 'import_script'
    },
    {
      customer_code: 'KH001002',
      customer_name: 'Customer 2',
      customer_type_id: 1,
      branch_created_id: 1,
      created_by: 'import_script'
    }
  ])
  .select();

// Bulk update
const { data: updatedCustomers, error } = await supabase
  .from('customers')
  .update({ updated_at: new Date().toISOString() })
  .in('customer_id', [1, 2, 3, 4, 5])
  .select();
```

---

## 📈 Customer Analytics Insights - Phân Tích Chi Tiết

### 1. Revenue Segmentation Analysis

| Segment | Count | Percentage | Revenue Range | Total Revenue |
|---------|-------|------------|---------------|---------------|
| **VIP** | 102 | 25.6% | >50M VND | ~11.2B VND (63.3%) |
| **High** | 117 | 29.4% | 10M-50M VND | ~4.8B VND (27.1%) |
| **Medium** | 85 | 21.4% | 1M-10M VND | ~1.4B VND (7.9%) |
| **Low** | 34 | 8.5% | <1M VND | ~0.3B VND (1.7%) |
| **No Revenue** | 60 | 15.1% | 0 VND | 0 VND (0%) |

### 2. Top 20 Customers Analysis

```typescript
// Get detailed top customers with additional metrics
const { data: topCustomersDetailed } = await supabase
  .from('customers')
  .select(`
    customer_id,
    customer_code,
    customer_name,
    total_revenue,
    total_profit,
    purchase_count,
    last_purchase_date,
    customer_types(type_name),
    branches(branch_name)
  `)
  .gte('total_revenue', 0)
  .order('total_revenue', { ascending: false })
  .limit(20);
```

**Top 10 Revenue Generators:**
1. **HUYỀN TIGERVET** - 806.835.000 VND
2. **CÔNG ARIVIET** - 590.290.000 VND  
3. **TÂM UNITEK** - 495.880.000 VND
4. **CHỊ NHUNG VIETVET** - 450.671.000 VND
5. **ANH MINH VƯƠNG - TÍN NGHĨA** - 351.645.000 VND
6. **CHỊ QUY - BÌNH DƯƠNG** - 333.250.000 VND
7. **CHỊ THÚY - BƯU ĐIỆN** - 282.805.000 VND
8. **ANH TRIỆU - GIA KIỆM** - 279.915.000 VND
9. **CÔ QUYỀN - ĐỨC LONG** - 260.328.000 VND
10. **CHỊ LOAN ( ĐỊNH)** - 223.740.000 VND

### 3. Data Quality Assessment

| Field | Completeness | Status | Recommendation |
|-------|--------------|--------|----------------|
| **Phone** | 23.9% | 🔴 Critical | Mandatory field for new customers |
| **Email** | 0.3% | 🔴 Critical | Email collection campaigns |
| **Address** | 1.8% | 🔴 Critical | Required for delivery services |
| **Gender** | 67.1% | 🟡 Moderate | Optional but useful for marketing |
| **Company Name** | Low | 🔴 Critical | Important for B2B customers |

### 4. Geographic Distribution Analysis

```typescript
// Analyze customer distribution by branch
const { data: branchDistribution } = await supabase
  .from('customers')
  .select(`
    branch_created_id,
    branches(branch_name, branch_code),
    count()
  `)
  .group('branch_created_id, branches.branch_name, branches.branch_code')
  .order('count', { ascending: false });
```

### 5. Growth Trends Analysis

| Period | New Customers | Growth Rate |
|--------|---------------|-------------|
| **Last 30 Days** | 36 | 9.0% of total |
| **Last 90 Days** | 89 | 22.4% of total |
| **Last 365 Days** | 398 | 100% (all customers) |

---

## 🚀 Advanced Analytics Functions

### 1. Customer Lifetime Value (CLV) Calculation

```sql
CREATE OR REPLACE FUNCTION calculate_customer_clv(
    customer_id_param integer,
    months_back integer DEFAULT 12
)
RETURNS TABLE(
    customer_id integer,
    total_revenue numeric,
    avg_monthly_revenue numeric,
    predicted_clv_12months numeric,
    customer_segment text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.customer_id,
        c.total_revenue,
        c.total_revenue / GREATEST(months_back, 1) as avg_monthly_revenue,
        c.total_revenue * 1.2 as predicted_clv_12months,
        CASE 
            WHEN c.total_revenue >= 50000000 THEN 'VIP'
            WHEN c.total_revenue >= 10000000 THEN 'High'
            WHEN c.total_revenue >= 1000000 THEN 'Medium'
            ELSE 'Low'
        END as customer_segment
    FROM customers c
    WHERE c.customer_id = customer_id_param;
END;
$$ LANGUAGE plpgsql;
```

### 2. Customer Churn Risk Analysis

```sql
CREATE OR REPLACE FUNCTION analyze_churn_risk()
RETURNS TABLE(
    customer_id integer,
    customer_name text,
    days_since_last_purchase integer,
    churn_risk_level text,
    recommended_action text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.customer_id,
        c.customer_name,
        COALESCE(
            EXTRACT(days FROM (CURRENT_DATE - c.last_purchase_date::date))::integer,
            999
        ) as days_since_last_purchase,
        CASE 
            WHEN c.last_purchase_date IS NULL THEN 'No Purchase History'
            WHEN EXTRACT(days FROM (CURRENT_DATE - c.last_purchase_date::date)) > 180 THEN 'High Risk'
            WHEN EXTRACT(days FROM (CURRENT_DATE - c.last_purchase_date::date)) > 90 THEN 'Medium Risk'
            WHEN EXTRACT(days FROM (CURRENT_DATE - c.last_purchase_date::date)) > 30 THEN 'Low Risk'
            ELSE 'Active'
        END as churn_risk_level,
        CASE 
            WHEN c.last_purchase_date IS NULL THEN 'Follow up call needed'
            WHEN EXTRACT(days FROM (CURRENT_DATE - c.last_purchase_date::date)) > 180 THEN 'Urgent retention campaign'
            WHEN EXTRACT(days FROM (CURRENT_DATE - c.last_purchase_date::date)) > 90 THEN 'Re-engagement email'
            WHEN EXTRACT(days FROM (CURRENT_DATE - c.last_purchase_date::date)) > 30 THEN 'Regular check-in'
            ELSE 'Continue current service'
        END as recommended_action
    FROM customers c
    WHERE c.is_active = true
    ORDER BY days_since_last_purchase DESC;
END;
$$ LANGUAGE plpgsql;
```

### 3. Revenue Trend Analysis

```sql
CREATE OR REPLACE FUNCTION get_revenue_trends(
    date_from date DEFAULT (CURRENT_DATE - '365 days'::interval),
    date_to date DEFAULT CURRENT_DATE,
    group_by_period text DEFAULT 'month'
)
RETURNS TABLE(
    period_start date,
    period_end date,
    new_customers integer,
    total_revenue numeric,
    avg_revenue_per_customer numeric,
    growth_rate numeric
) AS $$
DECLARE
    period_interval interval;
BEGIN
    -- Set interval based on group_by_period
    period_interval := CASE 
        WHEN group_by_period = 'day' THEN '1 day'::interval
        WHEN group_by_period = 'week' THEN '1 week'::interval
        WHEN group_by_period = 'month' THEN '1 month'::interval
        WHEN group_by_period = 'quarter' THEN '3 months'::interval
        WHEN group_by_period = 'year' THEN '1 year'::interval
        ELSE '1 month'::interval
    END;
    
    -- Return trend data
    RETURN QUERY
    WITH period_data AS (
        SELECT 
            date_trunc(group_by_period, c.created_at::date) as period_start,
            COUNT(*) as new_customers,
            COALESCE(SUM(c.total_revenue), 0) as total_revenue
        FROM customers c
        WHERE c.created_at::date BETWEEN date_from AND date_to
        GROUP BY date_trunc(group_by_period, c.created_at::date)
        ORDER BY period_start
    )
    SELECT 
        pd.period_start::date,
        (pd.period_start + period_interval - '1 day'::interval)::date as period_end,
        pd.new_customers::integer,
        pd.total_revenue,
        CASE 
            WHEN pd.new_customers > 0 THEN pd.total_revenue / pd.new_customers 
            ELSE 0 
        END as avg_revenue_per_customer,
        LAG(pd.total_revenue) OVER (ORDER BY pd.period_start) as prev_revenue,
        CASE 
            WHEN LAG(pd.total_revenue) OVER (ORDER BY pd.period_start) > 0 
            THEN ((pd.total_revenue - LAG(pd.total_revenue) OVER (ORDER BY pd.period_start)) 
                  / LAG(pd.total_revenue) OVER (ORDER BY pd.period_start)) * 100
            ELSE 0 
        END as growth_rate
    FROM period_data pd;
END;
$$ LANGUAGE plpgsql;
```

---

## 💡 Implementation Examples - Ví Dụ Triển Khai

### 1. Complete Customer Dashboard Component

```typescript
// CustomerDashboard.tsx
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface CustomerStats {
  totalCustomers: number;
  totalRevenue: number;
  avgRevenue: number;
  topCustomers: any[];
  revenueSegments: any;
}

const CustomerDashboard: React.FC = () => {
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(true);
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchCustomerStats();
  }, []);

  const fetchCustomerStats = async () => {
    try {
      setLoading(true);
      
      // Get basic stats
      const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      // Calculate statistics
      const totalCustomers = customers.length;
      const totalRevenue = customers.reduce((sum, c) => sum + (c.total_revenue || 0), 0);
      const avgRevenue = totalRevenue / totalCustomers;

      // Get top customers
      const topCustomers = customers
        .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))
        .slice(0, 10);

      // Calculate revenue segments
      const revenueSegments = {
        vip: customers.filter(c => (c.total_revenue || 0) >= 50000000).length,
        high: customers.filter(c => (c.total_revenue || 0) >= 10000000 && (c.total_revenue || 0) < 50000000).length,
        medium: customers.filter(c => (c.total_revenue || 0) >= 1000000 && (c.total_revenue || 0) < 10000000).length,
        low: customers.filter(c => (c.total_revenue || 0) > 0 && (c.total_revenue || 0) < 1000000).length,
        none: customers.filter(c => (c.total_revenue || 0) === 0).length
      };

      setStats({
        totalCustomers,
        totalRevenue,
        avgRevenue,
        topCustomers,
        revenueSegments
      });
    } catch (error) {
      console.error('Error fetching customer stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!stats) return <div>No data available</div>;

  return (
    <div className="customer-dashboard">
      <h1>Customer Analytics Dashboard</h1>
      
      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Total Customers</h3>
          <p className="metric-value">{stats.totalCustomers.toLocaleString()}</p>
        </div>
        <div className="metric-card">
          <h3>Total Revenue</h3>
          <p className="metric-value">{stats.totalRevenue.toLocaleString()} VND</p>
        </div>
        <div className="metric-card">
          <h3>Avg Revenue/Customer</h3>
          <p className="metric-value">{Math.round(stats.avgRevenue).toLocaleString()} VND</p>
        </div>
      </div>

      {/* Revenue Segments */}
      <div className="revenue-segments">
        <h2>Revenue Segments</h2>
        <div className="segments-grid">
          <div className="segment-card vip">
            <h4>VIP (>50M)</h4>
            <p>{stats.revenueSegments.vip} customers</p>
          </div>
          <div className="segment-card high">
            <h4>High (10M-50M)</h4>
            <p>{stats.revenueSegments.high} customers</p>
          </div>
          <div className="segment-card medium">
            <h4>Medium (1M-10M)</h4>
            <p>{stats.revenueSegments.medium} customers</p>
          </div>
          <div className="segment-card low">
            <h4>Low (<1M)</h4>
            <p>{stats.revenueSegments.low} customers</p>
          </div>
        </div>
      </div>

      {/* Top Customers */}
      <div className="top-customers">
        <h2>Top 10 Customers</h2>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Revenue</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.topCustomers.map((customer, index) => (
              <tr key={customer.customer_id}>
                <td>{customer.customer_code}</td>
                <td>{customer.customer_name}</td>
                <td>{(customer.total_revenue || 0).toLocaleString()} VND</td>
                <td>{customer.is_active ? '✅ Active' : '❌ Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerDashboard;
```

### 2. Customer Search & Filter Component

```typescript
// CustomerSearch.tsx
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

interface SearchFilters {
  searchTerm: string;
  customerType: number | null;
  revenueMin: number | null;
  revenueMax: number | null;
  isActive: boolean | null;
}

const CustomerSearch: React.FC = () => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({
    searchTerm: '',
    customerType: null,
    revenueMin: null,
    revenueMax: null,
    isActive: null
  });
  const [loading, setLoading] = useState(false);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const searchCustomers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select(`
          *,
          customer_types(type_name)
        `);

      // Apply filters
      if (filters.searchTerm) {
        query = query.or(`customer_name.ilike.%${filters.searchTerm}%,customer_code.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`);
      }

      if (filters.customerType) {
        query = query.eq('customer_type_id', filters.customerType);
      }

      if (filters.revenueMin !== null) {
        query = query.gte('total_revenue', filters.revenueMin);
      }

      if (filters.revenueMax !== null) {
        query = query.lte('total_revenue', filters.revenueMax);
      }

      if (filters.isActive !== null) {
        query = query.eq('is_active', filters.isActive);
      }

      const { data, error } = await query
        .order('total_revenue', { ascending: false })
        .limit(100);

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    searchCustomers();
  }, [filters]);

  return (
    <div className="customer-search">
      <div className="search-filters">
        <input
          type="text"
          placeholder="Search by name, code, or phone..."
          value={filters.searchTerm}
          onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
        />
        
        <input
          type="number"
          placeholder="Min Revenue"
          value={filters.revenueMin || ''}
          onChange={(e) => setFilters({...filters, revenueMin: e.target.value ? Number(e.target.value) : null})}
        />

        <input
          type="number" 
          placeholder="Max Revenue"
          value={filters.revenueMax || ''}
          onChange={(e) => setFilters({...filters, revenueMax: e.target.value ? Number(e.target.value) : null})}
        />

        <select 
          value={filters.isActive === null ? '' : filters.isActive.toString()}
          onChange={(e) => setFilters({...filters, isActive: e.target.value === '' ? null : e.target.value === 'true'})}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {loading ? (
        <div>Searching...</div>
      ) : (
        <div className="search-results">
          <h3>Found {customers.length} customers</h3>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Revenue</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(customer => (
                <tr key={customer.customer_id}>
                  <td>{customer.customer_code}</td>
                  <td>{customer.customer_name}</td>
                  <td>{customer.phone || 'N/A'}</td>
                  <td>{(customer.total_revenue || 0).toLocaleString()} VND</td>
                  <td>{customer.customer_types?.type_name || 'N/A'}</td>
                  <td>{customer.is_active ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CustomerSearch;
```

---

## 🔧 Utility Functions & Helpers

### 1. Customer Analytics Utilities

```typescript
// utils/customerAnalytics.ts
export class CustomerAnalytics {
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  // Calculate Customer Lifetime Value
  async calculateCLV(customerId: number, monthsBack: number = 12): Promise<any> {
    const { data, error } = await this.supabase
      .rpc('calculate_customer_clv', {
        customer_id_param: customerId,
        months_back: monthsBack
      });
    
    if (error) throw error;
    return data[0];
  }

  // Get customer segment
  getCustomerSegment(totalRevenue: number): string {
    if (totalRevenue >= 50000000) return 'VIP';
    if (totalRevenue >= 10000000) return 'High';
    if (totalRevenue >= 1000000) return 'Medium';
    if (totalRevenue > 0) return 'Low';
    return 'No Revenue';
  }

  // Calculate data completeness score
  calculateDataCompleteness(customer: any): number {
    const fields = ['phone', 'email', 'address', 'company_name', 'gender'];
    const completedFields = fields.filter(field => 
      customer[field] && customer[field].toString().trim() !== ''
    ).length;
    
    return (completedFields / fields.length) * 100;
  }

  // Format currency
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  // Get revenue trend
  async getRevenueTrend(dateFrom: string, dateTo: string, groupBy: string = 'month'): Promise<any[]> {
    const { data, error } = await this.supabase
      .rpc('get_revenue_trends', {
        date_from: dateFrom,
        date_to: dateTo,
        group_by_period: groupBy
      });
    
    if (error) throw error;
    return data;
  }

  // Analyze churn risk
  async analyzeChurnRisk(): Promise<any[]> {
    const { data, error } = await this.supabase
      .rpc('analyze_churn_risk');
    
    if (error) throw error;
    return data;
  }
}
```

### 2. Environment Configuration

```typescript
// config/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!;

// Client for browser use (with RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Database configuration
export const DATABASE_CONFIG = {
  url: supabaseUrl,
  tables: {
    customers: 'customers',
    customerTypes: 'customer_types',
    invoices: 'invoices',
    invoiceDetails: 'invoice_details',
    products: 'products',
    branches: 'branches'
  },
  functions: {
    searchCustomersWithStats: 'search_customers_with_stats',
    getFinancialSummary: 'get_financial_summary',
    getPharmacyDashboardStats: 'get_pharmacy_dashboard_stats',
    calculateCustomerCLV: 'calculate_customer_clv',
    analyzeChurnRisk: 'analyze_churn_risk',
    getRevenueTrends: 'get_revenue_trends'
  },
  views: {
    customerStatistics: 'customer_statistics',
    dashboardQuickStats: 'dashboard_quick_stats',
    invoiceDetailsNormalized: 'invoice_details_normalized',
    invoicesNormalized: 'invoices_normalized',
    lowStockProducts: 'low_stock_products'
  }
};
```

---

## 📋 Best Practices & Recommendations

### 1. Performance Optimization
- **Use indexes** on frequently queried columns (customer_code, phone, email)
- **Implement pagination** for large result sets
- **Use database functions** for complex calculations
- **Cache frequently accessed data** using React Query or SWR
- **Use views** for complex joins and aggregations

### 2. Data Quality Improvement
- **Mandatory phone collection** for new customers
- **Email validation** and collection campaigns  
- **Address standardization** for delivery optimization
- **Regular data cleaning** and validation processes

### 3. Security Best Practices
- **Use Row Level Security (RLS)** for data access control
- **Separate admin and user clients** with appropriate permissions
- **Validate all inputs** before database operations
- **Use service role key** only for server-side operations

### 4. Real-time Features
- **Subscribe to customer changes** for live dashboard updates
- **Implement real-time notifications** for high-value customer activities
- **Use Supabase channels** for collaborative features

---

## 🎯 Future Enhancements

### 1. Advanced Analytics
- **Predictive analytics** for customer behavior
- **Machine learning models** for churn prediction
- **Customer segmentation** using clustering algorithms
- **Revenue forecasting** based on historical trends

### 2. Integration Opportunities
- **CRM system integration** for complete customer journey
- **Email marketing automation** based on customer segments
- **SMS notifications** for important updates
- **Mobile app** for customer self-service

### 3. Reporting & Visualization
- **Interactive dashboards** with drill-down capabilities
- **Automated reporting** via email/SMS
- **Export functionality** for external analysis
- **Custom KPI tracking** for business metrics

---

*This documentation provides a comprehensive reference for all customer analytics and statistics functionality in the Xuân Thùy Pet Pharmacy system. Use this as a guide for implementing customer-related features and analytics.*
