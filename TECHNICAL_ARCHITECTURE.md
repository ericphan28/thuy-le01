# 🚀 TECHNICAL ARCHITECTURE OVERVIEW - XUÂN THÙY VETERINARY

> Complete technical context for new AI sessions - Updated: September 4, 2025

## 🏗️ TECHNOLOGY STACK

### 🎨 **Frontend Architecture**
```typescript
// Framework & Language
Next.js 15.4.5          // React framework với App Router
TypeScript              // Type safety throughout
Tailwind CSS            // Styling với dark mode support
shadcn/ui               // Component library

// State Management  
React Hooks             // useState, useEffect, useCallback
Client-side Services    // Enhanced Pricing Service V3
Real-time Updates       // Auto-sync cart pricing

// Key Components
POS System              // app/dashboard/pos/page.tsx
Invoice System          // app/dashboard/invoices/
PDF Generation          // Multiple methods support
```

### 🔧 **Backend Architecture**  
```sql
-- Database: Supabase PostgreSQL
-- Core Tables với Real Data:

products (1049+ items)
├── product_id, product_code, product_name
├── sale_price, purchase_price, stock_quantity
└── category_id, supplier_id, is_active

customers (1000+ records)  
├── customer_id, customer_code, customer_name
├── phone, email, address, customer_type
└── current_debt, debt_limit

invoices (739+ transactions)
├── invoice_id, customer_id, invoice_date
├── subtotal, discount_amount, vat_amount
├── total_amount, customer_paid, status
└── created_at, notes

invoice_details (line items)
├── detail_id, invoice_id, product_id
├── quantity, unit_price, discount_amount
└── line_total

-- Pricing System Tables:
pricing_rules
├── rule_id, product_id, customer_id
├── discount_type, discount_value
└── start_date, end_date, is_active

volume_tiers  
├── tier_id, product_id, category_id
├── min_quantity, discount_percentage
└── created_at, is_active

contracts
├── contract_id, customer_id, contract_name
├── start_date, end_date, is_active
└── priority_level, discount_terms
```

### ⚡ **Performance Optimizations**
```sql
-- Database Indexes (Created Sep 4, 2025)
CREATE INDEX idx_products_composite ON products(product_code, is_active, category_id);
CREATE INDEX idx_pricing_rules_active ON pricing_rules(product_id, customer_id, is_active);  
CREATE INDEX idx_volume_tiers_product ON volume_tiers(product_id, min_quantity, is_active);
CREATE INDEX idx_invoices_customer_date ON invoices(customer_id, invoice_date, status);
CREATE INDEX idx_invoice_details_invoice ON invoice_details(invoice_id, product_id);

-- Query Performance: 2000ms → <100ms
-- Manual relationship handling thay vì foreign keys
-- Optimized pricing calculations với composite indexes
```

## 💰 ENHANCED PRICING ENGINE V3

### 🎯 **Priority Logic (Implementation)**
```typescript
// lib/services/enhanced-pricing-service.ts

class EnhancedPricingService {
  async calculatePrice(productId: string, customerId: string, quantity: number) {
    // 1. Contract Pricing (Highest Priority)
    const contractPrice = await this.getContractPrice(productId, customerId)
    if (contractPrice) return contractPrice

    // 2. Pricing Rules (Customer-specific)  
    const rulePrice = await this.getPricingRulePrice(productId, customerId, quantity)
    if (rulePrice) return rulePrice

    // 3. Volume Tiers (Quantity-based)
    const tierPrice = await this.getVolumeTierPrice(productId, quantity)  
    if (tierPrice) return tierPrice

    // 4. List Price (Default)
    return await this.getListPrice(productId)
  }
}

// Usage in POS:
// Cart displays: 185,000đ (contract price)
// vs List Price: 220,000đ (transparent pricing)
```

### 🔄 **Real-time Cart Sync**
```typescript
// app/dashboard/pos/page.tsx

const updateCartWithEnhancedPricing = useCallback(() => {
  if (cartPricingResults.size === 0) return
  
  setCart(currentCart => 
    currentCart.map(item => {
      const pricingResult = cartPricingResults.get(item.product.product_id)
      if (pricingResult && pricingResult.final_price !== item.unit_price) {
        return {
          ...item,
          unit_price: pricingResult.final_price,
          line_total: item.quantity * pricingResult.final_price
        }
      }
      return item
    })
  )
}, [cartPricingResults])

// Auto-sync khi pricing results thay đổi
useEffect(() => {
  if (cartPricingResults.size > 0) {
    updateCartWithEnhancedPricing()
  }
}, [cartPricingResults, updateCartWithEnhancedPricing])
```

## 📄 PDF & INVOICE SYSTEM

### 🖨️ **Multiple PDF Methods**
```typescript
// 1. Vietnamese PDF Bundle (Primary)
// app/api/invoices/[id]/pdf-vietnamese/route.ts
// Uses: Vietnamese HTML template → PDF conversion

// 2. Puppeteer PDF (Advanced)  
// app/api/invoices/[id]/pdf-advanced/route.ts
// Uses: Headless Chrome → Professional PDF

// 3. Canvas HTML2PDF (Alternative)
// app/api/invoices/[id]/pdf/route.ts  
// Uses: HTML Canvas → PDF generation

// 4. Print Template (Web)
// app/print/invoice/[id]/page.tsx
// Uses: Browser print với auto-print functionality
```

### 📊 **Invoice Template Enhancement**
```typescript
// app/api/invoices/[id]/html/route.ts

// Fixed "Tổng công nợ" calculation:
const remainingAmount = grandTotal - headerData.customer_paid

// PDF Template với styling chuyên nghiệp:
${remainingAmount > 0 ? `
  <div style="display: flex; justify-content: space-between; color: #dc2626;">
    <span style="font-weight: bold;">Còn lại:</span>
    <span style="font-weight: bold;">${formatPrice(remainingAmount)}</span>
  </div>
` : ''}

${customerData ? `
  <div style="border-top: 1px solid #e5e7eb; margin-top: 8px; padding-top: 8px;">
    <span style="font-weight: bold;">Tổng công nợ:</span>
    <span style="font-weight: bold;">${formatPrice(customerData.current_debt || 0)}</span>
  </div>
` : ''}

// Result: Shows accurate 5.330k debt instead of wrong 5.420k
```

## 🛒 POS SYSTEM FEATURES

### ⚡ **Real-time Features**
- **Enhanced Pricing:** Live calculation với priority logic
- **Cart Auto-sync:** Pricing updates khi enhanced pricing thay đổi  
- **Stock Management:** Optimistic updates với real inventory
- **Customer Selection:** Debt display và contract pricing
- **Professional UI:** Dark mode support, mobile responsive

### 🎯 **User Experience Flow**
1. **Product Selection:** Search từ 1049+ products
2. **Price Calculation:** Enhanced pricing engine applies discounts
3. **Cart Display:** Shows final price (185k vs 220k list)
4. **Customer Selection:** Contract pricing automatically applied
5. **Checkout:** Accurate totals với debt management
6. **Invoice Generation:** PDF/Print với "Tổng công nợ"

## 🚀 DEPLOYMENT & PRODUCTION

### 🌐 **Production Environment**
```bash
# Hosting: Vercel
# Domain: https://thuy-le01.vercel.app
# Database: Supabase PostgreSQL (Production)
# Build: Next.js production build - Zero errors
# Performance: Optimized với database indexes

# Recent Deployment (Sep 4, 2025):
git commit -m "🔧 Fix infinite loop và hoàn thiện PDF hóa đơn"
git push origin main
# Result: Clean build, stable production
```

### 🔍 **Code Quality**
- **TypeScript:** Strict type checking, zero errors
- **ESLint:** Clean code standards  
- **Performance:** useCallback optimization, no infinite loops
- **Build Success:** Production ready, verified deployment
- **Real Data:** 100% live data integration

### 📱 **Cross-platform**
- **Desktop:** Full-featured POS interface
- **Tablet:** Touch-friendly POS for retail
- **Mobile:** Responsive design cho management
- **Print:** Auto-print functionality cho invoices

---

> **🎯 Key Takeaway:** Complete veterinary pharmacy management system với enhanced pricing engine, real-time POS, professional PDF generation, và optimized database performance. Production ready với 1000+ customers và 1049+ products real data.
