# SUPPLIER ANALYTICS DOCUMENTATION

## Overview
This document provides comprehensive analytics and API reference for the supplier management system in the veterinary pharmacy application.

**Generated:** 2025-08-01T08:17:45.171Z  
**Total Suppliers Analyzed:** 51

## Executive Summary

### Key Metrics
- **Total Suppliers:** 51
- **Active Suppliers:** 51 (100.0%)
- **Inactive Suppliers:** 0 (0.0%)
- **Average Payment Terms:** 30.0 days

### Data Quality Assessment
- **Complete Name & Code:** 51/51 (100.0%)
- **Contact Information:** 51/51 (100.0%)
- **Address Information:** 0/51 (0.0%)
- **Tax Information:** 0/51 (0.0%)

## Database Schema

### Suppliers Table Structure
```sql
CREATE TABLE public.suppliers (
    supplier_id integer NOT NULL,
    supplier_code character varying(50) NOT NULL,
    supplier_name character varying(255) NOT NULL,
    phone character varying(20),
    email character varying(255),
    address text,
    contact_person character varying(255),
    tax_code character varying(50),
    payment_terms integer DEFAULT 0,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
```

### Field Descriptions
- **supplier_id**: Primary key, auto-increment integer
- **supplier_code**: Unique identifier for supplier (VARCHAR 50)
- **supplier_name**: Full name of the supplier (VARCHAR 255)
- **phone**: Contact phone number (VARCHAR 20)
- **email**: Email address (VARCHAR 255)
- **address**: Physical address (TEXT)
- **contact_person**: Primary contact person name (VARCHAR 255)
- **tax_code**: Tax identification number (VARCHAR 50)
- **payment_terms**: Payment terms in days (INTEGER, default 0)
- **notes**: Additional notes (TEXT)
- **is_active**: Active status (BOOLEAN, default true)
- **created_at**: Record creation timestamp
- **updated_at**: Last update timestamp

## Business Intelligence Insights

### Payment Terms Analysis
- **30 days**: 51 suppliers (100.0%)

### Contact Method Distribution
- **Email Only**: 0 suppliers
- **Phone Only**: 51 suppliers
- **Both Email & Phone**: 0 suppliers
- **No Contact Info**: 0 suppliers

### Supplier Status Distribution
- **Active Suppliers**: 51 (100.0%)
- **Inactive Suppliers**: 0 (0.0%)

## API Reference

### Supabase Client Integration

#### Basic Setup
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### TypeScript Interface
```typescript
interface VeterinarySupplier {
  supplier_id: number;
  supplier_code: string;
  supplier_name: string;
  phone?: string;
  email?: string;
  address?: string;
  contact_person?: string;
  tax_code?: string;
  payment_terms?: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### CRUD Operations

#### Read Operations

##### Get All Suppliers
```typescript
const { data: suppliers, error } = await supabase
  .from('suppliers')
  .select('*')
  .order('supplier_name');
```

##### Get Active Suppliers Only
```typescript
const { data: activeSuppliers, error } = await supabase
  .from('suppliers')
  .select('*')
  .eq('is_active', true)
  .order('supplier_name');
```

##### Get Supplier by ID
```typescript
const { data: supplier, error } = await supabase
  .from('suppliers')
  .select('*')
  .eq('supplier_id', supplierId)
  .single();
```

##### Search Suppliers by Name
```typescript
const { data: suppliers, error } = await supabase
  .from('suppliers')
  .select('*')
  .ilike('supplier_name', `%${searchTerm}%`)
  .order('supplier_name');
```

##### Get Suppliers with Payment Terms
```typescript
const { data: suppliers, error } = await supabase
  .from('suppliers')
  .select('*')
  .gt('payment_terms', 0)
  .order('payment_terms', { ascending: false });
```

#### Create Operations

##### Create New Supplier
```typescript
const { data: newSupplier, error } = await supabase
  .from('suppliers')
  .insert({
    supplier_code: 'SUP001',
    supplier_name: 'ABC Medical Supplies',
    phone: '0123456789',
    email: 'contact@abcmedical.com',
    address: '123 Main St, City',
    contact_person: 'John Doe',
    tax_code: '123456789',
    payment_terms: 30,
    notes: 'Reliable supplier for medical equipment',
    is_active: true
  })
  .select()
  .single();
```

##### Bulk Insert Suppliers
```typescript
const { data: newSuppliers, error } = await supabase
  .from('suppliers')
  .insert([
    {
      supplier_code: 'SUP001',
      supplier_name: 'Supplier One',
      is_active: true
    },
    {
      supplier_code: 'SUP002', 
      supplier_name: 'Supplier Two',
      is_active: true
    }
  ])
  .select();
```

#### Update Operations

##### Update Supplier Information
```typescript
const { data: updatedSupplier, error } = await supabase
  .from('suppliers')
  .update({
    supplier_name: 'Updated Supplier Name',
    phone: '0987654321',
    email: 'newemail@supplier.com',
    contact_person: 'Jane Smith',
    payment_terms: 45,
    updated_at: new Date().toISOString()
  })
  .eq('supplier_id', supplierId)
  .select()
  .single();
```

##### Deactivate Supplier
```typescript
const { data: deactivatedSupplier, error } = await supabase
  .from('suppliers')
  .update({ 
    is_active: false,
    updated_at: new Date().toISOString()
  })
  .eq('supplier_id', supplierId)
  .select()
  .single();
```

##### Reactivate Supplier
```typescript
const { data: reactivatedSupplier, error } = await supabase
  .from('suppliers')
  .update({ 
    is_active: true,
    updated_at: new Date().toISOString()
  })
  .eq('supplier_id', supplierId)
  .select()
  .single();
```

#### Delete Operations

##### Soft Delete (Recommended)
```typescript
const { data: deletedSupplier, error } = await supabase
  .from('suppliers')
  .update({ 
    is_active: false,
    notes: (notes || '') + ' [DELETED: ' + new Date().toISOString() + ']',
    updated_at: new Date().toISOString()
  })
  .eq('supplier_id', supplierId)
  .select()
  .single();
```

##### Hard Delete (Use with caution)
```typescript
const { data: deletedSupplier, error } = await supabase
  .from('suppliers')
  .delete()
  .eq('supplier_id', supplierId)
  .select()
  .single();
```

### Advanced Queries

#### Suppliers with Complete Contact Information
```typescript
const { data: completeContacts, error } = await supabase
  .from('suppliers')
  .select('*')
  .not('email', 'is', null)
  .not('phone', 'is', null)
  .neq('email', '')
  .neq('phone', '')
  .eq('is_active', true);
```

#### Suppliers by Payment Terms Range
```typescript
const { data: suppliers, error } = await supabase
  .from('suppliers')
  .select('*')
  .gte('payment_terms', 30)
  .lte('payment_terms', 60)
  .eq('is_active', true)
  .order('payment_terms');
```

#### Suppliers Missing Tax Information
```typescript
const { data: incompleteTax, error } = await supabase
  .from('suppliers')
  .select('*')
  .or('tax_code.is.null,tax_code.eq.')
  .eq('is_active', true)
  .order('supplier_name');
```

### Analytics Functions

#### Get Supplier Statistics
```typescript
async function getSupplierStats() {
  const { data: suppliers, error } = await supabase
    .from('suppliers')
    .select('*');
    
  if (error || !suppliers) return null;
  
  return {
    total: suppliers.length,
    active: suppliers.filter(s => s.is_active).length,
    inactive: suppliers.filter(s => !s.is_active).length,
    withEmail: suppliers.filter(s => s.email && s.email.trim() !== '').length,
    withPhone: suppliers.filter(s => s.phone && s.phone.trim() !== '').length,
    withTaxCode: suppliers.filter(s => s.tax_code && s.tax_code.trim() !== '').length,
    averagePaymentTerms: suppliers.reduce((sum, s) => sum + (s.payment_terms || 0), 0) / suppliers.length
  };
}
```

#### Supplier Business Intelligence
```typescript
async function getSupplierBusinessIntelligence() {
  const { data: suppliers, error } = await supabase
    .from('suppliers')
    .select('*');
    
  if (error || !suppliers) return null;
  
  // Payment terms distribution
  const paymentTermsDistribution = suppliers.reduce((acc, supplier) => {
    const terms = supplier.payment_terms || 0;
    acc[terms] = (acc[terms] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  // Contact method analysis
  const contactAnalysis = {
    emailOnly: suppliers.filter(s => s.email && !s.phone).length,
    phoneOnly: suppliers.filter(s => s.phone && !s.email).length,
    both: suppliers.filter(s => s.email && s.phone).length,
    neither: suppliers.filter(s => !s.email && !s.phone).length
  };
  
  return {
    paymentTermsDistribution,
    contactAnalysis,
    dataQualityScore: calculateSupplierDataQuality(suppliers)
  };
}

function calculateSupplierDataQuality(suppliers: VeterinarySupplier[]) {
  const totalFields = 8; // name, code, phone, email, address, contact_person, tax_code, payment_terms
  
  const qualityScores = suppliers.map(supplier => {
    let filledFields = 0;
    if (supplier.supplier_name?.trim()) filledFields++;
    if (supplier.supplier_code?.trim()) filledFields++;
    if (supplier.phone?.trim()) filledFields++;
    if (supplier.email?.trim()) filledFields++;
    if (supplier.address?.trim()) filledFields++;
    if (supplier.contact_person?.trim()) filledFields++;
    if (supplier.tax_code?.trim()) filledFields++;
    if (supplier.payment_terms && supplier.payment_terms > 0) filledFields++;
    
    return (filledFields / totalFields) * 100;
  });
  
  return {
    average: qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length,
    high: qualityScores.filter(score => score >= 80).length,
    medium: qualityScores.filter(score => score >= 50 && score < 80).length,
    low: qualityScores.filter(score => score < 50).length
  };
}
```

### Real-Time Subscriptions

#### Subscribe to Supplier Changes
```typescript
const supplierSubscription = supabase
  .channel('suppliers_channel')
  .on('postgres_changes', 
    { 
      event: '*', 
      schema: 'public', 
      table: 'suppliers' 
    }, 
    (payload) => {
      console.log('Supplier change detected:', payload);
      // Handle real-time updates
    }
  )
  .subscribe();
```

#### Subscribe to New Suppliers
```typescript
const newSupplierSubscription = supabase
  .channel('new_suppliers')
  .on('postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'suppliers'
    },
    (payload) => {
      console.log('New supplier added:', payload.new);
      // Handle new supplier
    }
  )
  .subscribe();
```

## UI Components Integration

### Supplier Dashboard Components
```typescript
// Supplier status badge component
function SupplierStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "default" : "secondary"}>
      {isActive ? "Active" : "Inactive"}
    </Badge>
  );
}

// Payment terms display
function PaymentTermsDisplay({ terms }: { terms: number }) {
  if (terms === 0) return <span className="text-muted-foreground">Cash</span>;
  return <span>{terms} days</span>;
}

// Data quality indicator
function SupplierDataQuality({ supplier }: { supplier: VeterinarySupplier }) {
  const calculateQuality = () => {
    let score = 0;
    const fields = [
      supplier.supplier_name,
      supplier.supplier_code,
      supplier.phone,
      supplier.email,
      supplier.address,
      supplier.contact_person,
      supplier.tax_code,
      supplier.payment_terms
    ];
    
    fields.forEach(field => {
      if (field && String(field).trim() !== '' && field !== 0) score++;
    });
    
    return (score / fields.length) * 100;
  };
  
  const quality = calculateQuality();
  const getQualityColor = () => {
    if (quality >= 80) return "text-green-600";
    if (quality >= 50) return "text-yellow-600";
    return "text-red-600";
  };
  
  return (
    <span className={getQualityColor()}>
      {quality.toFixed(0)}%
    </span>
  );
}
```

## Sample Data

### Representative Supplier Records

#### Supplier 1
- **ID:** 112
- **Code:** NCC000051
- **Name:** HẢI CJ
- **Phone:** 451625
- **Email:** N/A
- **Address:** N/A
- **Contact Person:** N/A
- **Tax Code:** N/A
- **Payment Terms:** 30 days
- **Status:** Active
- **Created:** 7/23/2025

#### Supplier 2
- **ID:** 113
- **Code:** NCC000050
- **Name:** TRẦN GIA
- **Phone:** 566431552
- **Email:** N/A
- **Address:** N/A
- **Contact Person:** N/A
- **Tax Code:** N/A
- **Payment Terms:** 30 days
- **Status:** Active
- **Created:** 7/16/2025

#### Supplier 3
- **ID:** 114
- **Code:** NCC000049
- **Name:** CÔNG TY TÂN TIẾN
- **Phone:** 15462546
- **Email:** N/A
- **Address:** N/A
- **Contact Person:** N/A
- **Tax Code:** N/A
- **Payment Terms:** 30 days
- **Status:** Active
- **Created:** 7/15/2025

#### Supplier 4
- **ID:** 115
- **Code:** NCC000048
- **Name:** TIỆM ĐOÁN
- **Phone:** 4562154
- **Email:** N/A
- **Address:** N/A
- **Contact Person:** N/A
- **Tax Code:** N/A
- **Payment Terms:** 30 days
- **Status:** Active
- **Created:** 7/15/2025

#### Supplier 5
- **ID:** 116
- **Code:** NCC000047
- **Name:** TÂM UNITEX
- **Phone:** 1356433
- **Email:** N/A
- **Address:** N/A
- **Contact Person:** N/A
- **Tax Code:** N/A
- **Payment Terms:** 30 days
- **Status:** Active
- **Created:** 7/10/2025


## Performance Optimization

### Indexing Recommendations
```sql
-- Index for supplier lookups by code
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);

-- Index for active supplier queries
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

-- Index for supplier name searches
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(supplier_name);

-- Index for payment terms queries
CREATE INDEX IF NOT EXISTS idx_suppliers_payment_terms ON suppliers(payment_terms);

-- Composite index for active suppliers by name
CREATE INDEX IF NOT EXISTS idx_suppliers_active_name ON suppliers(is_active, supplier_name);
```

### Query Performance Tips
1. **Use specific field selection** instead of SELECT *
2. **Implement pagination** for large datasets
3. **Use appropriate indexes** for search operations
4. **Consider materialized views** for complex analytics
5. **Batch operations** when possible

## Error Handling

### Common Error Scenarios
```typescript
async function handleSupplierOperations() {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*');
      
    if (error) {
      // Handle specific error types
      if (error.code === 'PGRST116') {
        console.error('No rows returned');
      } else if (error.code === '23505') {
        console.error('Duplicate supplier code');
      } else {
        console.error('Database error:', error.message);
      }
      return;
    }
    
    // Process successful response
    return data;
  } catch (error) {
    console.error('Unexpected error:', error);
    throw error;
  }
}
```

## Best Practices

### Data Validation
1. **Supplier Code**: Must be unique and non-empty
2. **Supplier Name**: Required field, should be meaningful
3. **Email**: Validate format if provided
4. **Phone**: Validate format and country code
5. **Payment Terms**: Should be non-negative integer
6. **Tax Code**: Validate format according to local requirements

### Business Rules
1. **Deactivation**: Use soft delete instead of hard delete
2. **Audit Trail**: Always update `updated_at` timestamp
3. **Data Quality**: Regular cleanup of incomplete records
4. **Relationship Integrity**: Check dependencies before deletion
5. **Contact Information**: Prioritize complete contact details

### Security Considerations
1. **RLS Policies**: Implement row-level security
2. **Input Validation**: Sanitize all user inputs
3. **Access Control**: Limit supplier data access by role
4. **Audit Logging**: Track all supplier modifications
5. **Data Encryption**: Encrypt sensitive information

---

**Document Version:** 1.0  
**Last Updated:** 2025-08-01T08:17:45.238Z  
**Next Review Date:** 2025-08-31

*This documentation is automatically generated based on real supplier data analysis and should be updated as the system evolves.*
