# ⚙️ SETTINGS SYSTEM OVERVIEW - Xuân Thùy Veterinary Management

## 🎯 System Foundation Architecture - COMPLETED 02/08/2025

### 📋 **TỔNG QUAN SETTINGS SYSTEM**

**Settings System** là foundation module được thiết kế để quản lý tất cả business rules và configuration cho hệ thống quản lý thú y. Module này là **prerequisite** cho tất cả modules khác và đã được implement hoàn chỉnh.

### 🏗️ **DATABASE ARCHITECTURE**

#### **3 Core Tables:**
```sql
1. system_settings (80+ records)
   - Business rules và configuration chính
   - 9 categories covering all business aspects
   - Validation rules với JSONB format
   - Default values và type enforcement

2. branch_settings (4+ records) 
   - Chi nhánh specific overrides
   - References system_settings keys
   - Audit tracking với created_by

3. settings_change_log (audit trail)
   - Complete history của mọi thay đổi
   - Who, what, when, why tracking
   - IP address và user agent logging
```

#### **4 Helper Functions:**
```sql
1. get_setting_value(key, branch_id) -> TEXT
   - Branch-specific với system fallback
   - Performance optimized với proper indexing

2. set_setting_value(key, value, branch_id, user, reason) -> BOOLEAN  
   - Validation before update
   - Automatic change logging

3. get_settings_by_category(category, branch_id) -> TABLE
   - Bulk retrieval for UI forms
   - Sorted by display_order

4. validate_setting_value(key, value) -> BOOLEAN
   - Type checking (string, number, boolean, email, json)
   - Business rule validation
```

### 📱 **UI MANAGEMENT INTERFACE**

#### **Modern Settings Dashboard:**
- **Location:** `/dashboard/settings/page.tsx`
- **Design:** Professional tabbed interface với animations
- **Features:** Real-time validation, change tracking, save/reset functionality
- **Performance:** Optimized loading với proper error handling

#### **9 Settings Categories:**

### 🏢 **1. BUSINESS INFORMATION (6 settings)**
```
business_name: "Xuân Thùy Veterinary Pharmacy"
business_address: Company address
business_phone: Contact phone number  
business_email: Official email
tax_number: Tax registration number
business_license: Veterinary business license
```

### 💰 **2. FINANCIAL SETTINGS (8 settings)**
```
default_currency: "VND" 
currency_symbol: "₫"
currency_decimal_places: 0
vat_rate: 10.0%
discount_limit_percent: 50.0%
payment_methods: ["cash", "transfer", "card"]
credit_limit_default: 5,000,000 VND
invoice_due_days: 30 days
```

### 📦 **3. INVENTORY MANAGEMENT (7 settings)**
```
low_stock_threshold: 10 units
expiry_warning_days: 30 days
auto_reorder_enabled: true
default_markup_percent: 25.0%
track_expiry_medicines: true (mandatory for medicines)
batch_tracking_enabled: true (for vaccines/medicines)
allow_negative_stock: false
```

### 👥 **4. CUSTOMER MANAGEMENT (6 settings)**
```
customer_code_prefix: "KH"
customer_code_length: 6 digits
auto_generate_customer_codes: true
vip_threshold_amount: 50,000,000 VND
loyal_customer_orders: 20 orders minimum
new_customer_credit: 1,000,000 VND
```

### 🧾 **5. INVOICE SETTINGS (6 settings)**
```
invoice_code_prefix: "HD"
invoice_code_length: 6 digits
invoice_numbering_reset: "yearly"
auto_print_receipt: true
require_customer_info: false
invoice_footer_text: "Cảm ơn quý khách đã sử dụng dịch vụ!"
```

### 🖥️ **6. UI/UX SETTINGS (6 settings)**
```
items_per_page_default: 20
default_view_mode: "grid"
enable_animations: true
theme_mode: "light"
compact_mode: false
show_tooltips: true
```

### 🩺 **7. VETERINARY SPECIFIC (5 settings)**
```
require_prescription_validation: true
prescription_validity_days: 30
dosage_calculation_enabled: true
drug_interaction_check: true
vaccine_cold_chain_tracking: true
```

### 🔔 **8. NOTIFICATIONS (5 settings)**
```
email_notifications_enabled: true
sms_notifications_enabled: false
low_stock_notification: true
expiry_notification: true
payment_reminder_enabled: true
```

### 🔒 **9. SECURITY & BACKUP (4 settings)**
```
auto_backup_enabled: true
backup_retention_days: 30
session_timeout_minutes: 120
password_min_length: 6
```

## 🛠️ **TECHNICAL IMPLEMENTATION**

### **Service Layer:**
```typescript
// lib/services/settings.service.ts
export class SettingsService {
  - getSystemSettings(): Promise<SystemSetting[]>
  - getSettingsByCategory(category): Promise<SystemSetting[]>
  - getSettingValue(key, branchId?): Promise<string>
  - updateSetting(key, value, branchId?, user?): Promise<boolean>
  - updateMultipleSettings(updates[], user?): Promise<boolean>
  - validateSettingValue(key, value): Promise<boolean>
}
```

### **React Hooks:**
```typescript
// lib/hooks/useSettings.ts  
export function useSettings() // Load all settings grouped by category
export function useSetting(key, branchId?) // Single setting management
export function useSettingsByCategory(category) // Category-specific loading
export function useBusinessSettings() // Business info shortcuts
export function useFinancialSettings() // Financial shortcuts
export function useInventorySettings() // Inventory shortcuts
```

## 🔄 **INTEGRATION WITH OTHER MODULES**

### **How Other Modules Consume Settings:**

#### **Products Module:**
```typescript
const { lowStockThreshold, defaultMarkup } = useInventorySettings()
const { trackExpiry, batchTracking } = useInventorySettings()

// Auto-calculate sale price
const salePrice = costPrice * (1 + defaultMarkup/100)

// Check low stock warning  
const isLowStock = currentStock <= lowStockThreshold
```

#### **Customer Module:**
```typescript
const { customerPrefix, codeLength } = useSettings()
const { vipThreshold, defaultCredit } = useSettings()

// Auto-generate customer code
const newCustomerCode = `${customerPrefix}${nextId.toString().padStart(codeLength, '0')}`

// Check VIP status
const isVIP = totalPurchases >= vipThreshold
```

#### **Invoice Module:**
```typescript
const { invoicePrefix, vatRate } = useFinancialSettings()
const { footerText, autoPrint } = useSettings()

// Auto-generate invoice code
const invoiceCode = `${invoicePrefix}${nextInvoiceId}`

// Calculate VAT
const vatAmount = subtotal * (vatRate / 100)
```

#### **Sales Creation (Next Phase):**
```typescript
const { allowNegativeStock, discountLimit } = useInventorySettings()
const { paymentMethods, requireCustomer } = useFinancialSettings()

// Validate stock before sale
if (!allowNegativeStock && requestedQty > currentStock) {
  throw new Error('Insufficient stock')
}

// Validate discount
if (discountPercent > discountLimit) {
  throw new Error('Discount exceeds limit')
}
```

## 🎯 **BUSINESS IMPACT**

### **Centralized Configuration:**
- ✅ **Consistency:** All modules follow same business rules
- ✅ **Flexibility:** Easy customization without code changes  
- ✅ **Multi-branch:** Different settings per location
- ✅ **Audit Trail:** Complete change history for compliance

### **Operational Benefits:**
- ✅ **Reduced Errors:** Centralized validation prevents inconsistencies
- ✅ **Easy Updates:** Change business rules without developer intervention
- ✅ **Compliance:** Veterinary-specific rules enforced automatically
- ✅ **Scalability:** Easy to add new settings as business grows

### **Ready for Phase 2:**
- ✅ **Sales Creation:** All pricing rules và validation ready
- ✅ **POS System:** Payment methods và receipt formatting configured
- ✅ **Inventory Control:** Stock rules và thresholds established
- ✅ **Customer Management:** VIP tiers và credit limits defined

## 🚀 **NEXT STEPS**

With Settings System complete, we can now implement:

1. **Sales Creation POS System** - All business rules available
2. **Advanced Reporting** - Configuration-driven reports  
3. **Mobile Apps** - Settings API ready for consumption
4. **Third-party Integrations** - Centralized configuration management

The Settings System serves as the **foundation** that enables consistent, configurable, and scalable business operations across the entire veterinary management system.
