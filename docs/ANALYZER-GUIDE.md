# Xuân Thùy Customer Management - Testing & Documentation

## 🎯 Mục đích
Script này được tạo để:
- ✅ Phân tích schema database thực tế từ Supabase
- ✅ Test các API endpoints và RPC functions  
- ✅ Tạo tài liệu API comprehensive
- ✅ Validate data integrity và performance

## 🚀 Cách sử dụng

### 1. Setup Environment
```bash
# Copy và điền thông tin Supabase
cp .env.example .env.local

# Chỉnh sửa .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Chạy Script Analyzer
```bash
# Chạy full analysis
npx tsx scripts/supabase-customer-analyzer.ts

# Hoặc với npm script (nếu đã config)
npm run analyze
```

### 3. Xem kết quả
```
docs/api/
├── customer-management-api.json  # Full API documentation
└── README.md                     # Quick start guide
```

## 📊 Tính năng của Script

### ✅ Database Connection Test
- Kiểm tra kết nối Supabase
- Verify credentials và permissions
- Test basic query performance

### 🔍 Schema Analysis  
- Analyze table structure: `customers`, `customer_types`, `invoices`
- Check field types, constraints, relationships
- Extract sample data for documentation

### 🧪 API Testing
- **CRUD Operations**: Create, Read, Update, Delete
- **Search & Filter**: Text search, type filtering, pagination  
- **RPC Functions**: Test stored procedures
- **Error Handling**: Connection errors, validation errors

### 📚 Documentation Generation
- JSON API specification
- TypeScript interface definitions
- Usage examples và best practices
- Error codes và troubleshooting

## 🛠️ Customization

### Thêm test cases mới
```typescript
class SupabaseCustomerAnalyzer {
  async testCustomFeature(): Promise<void> {
    console.log('🧪 Testing custom feature...')
    // Your test logic here
  }
}
```

### Modify API documentation format
```typescript
async generateAPIDocumentation(): Promise<void> {
  const apiDoc = {
    // Customize documentation structure
    title: "Your Custom Title",
    // ... rest of documentation
  }
}
```

## 📈 Expected Output

### Console Output
```
🚀 Starting Supabase Customer Management Analysis...
============================================================
🧪 Testing database connection...
✅ Database connection successful
📊 Analyzing customers table schema...
✅ Schema analyzed: 24 fields found
🔗 Analyzing customer-invoice relationships...
✅ Relationship analysis complete: 3 customers with invoices
🧮 Testing database functions...
📈 Testing get_financial_summary...
✅ get_financial_summary working
🔧 Testing CRUD operations...
➕ Testing CREATE operation...
✅ CREATE successful, ID: 123
📚 Generating API documentation...
✅ API documentation generated: ./docs/api/customer-management-api.json
============================================================
🎉 Analysis completed successfully!
```

### Generated Files
1. **customer-management-api.json** - Complete API specification
2. **README.md** - Developer quick start guide
3. **customer.ts** - TypeScript type definitions
4. **customerService.ts** - Service layer implementation

## ⚠️ Troubleshooting

### Connection Issues
```
❌ Database connection failed: Connection failed: Invalid API key
```
**Solution**: Check Supabase URL và API key trong `.env.local`

### Permission Errors  
```
❌ Schema analysis failed: permission denied for table customers
```
**Solution**: Verify RLS policies và table permissions

### Function Not Found
```
❌ Function testing failed: function search_customers_with_stats() does not exist
```
**Solution**: Function chưa được tạo trong database

### CRUD Test Failures
```
❌ CREATE failed: duplicate key value violates unique constraint
```
**Solution**: Database có constraint conflicts

## 🔧 Advanced Usage

### Run Specific Tests Only
```typescript
const analyzer = new SupabaseCustomerAnalyzer()
await analyzer.testConnection()
await analyzer.analyzeCustomerSchema()
// Skip other tests
```

### Custom Configuration
```typescript
const analyzer = new SupabaseCustomerAnalyzer()
analyzer.outputDir = './custom-docs'
analyzer.testDataPrefix = 'CUSTOM_TEST_'
```

### Batch Testing
```typescript
// Test with larger datasets
await analyzer.testBatchOperations(1000)
await analyzer.testConcurrentAccess(10)
```

## 📋 Checklist Trước Deployment

- [ ] Script chạy thành công without errors
- [ ] Tất cả API endpoints tested
- [ ] Documentation được generate đầy đủ
- [ ] Types definitions accurate với schema
- [ ] Error handling comprehensive
- [ ] Performance benchmarks acceptable
- [ ] Security review completed

## 🔗 Integration với Development Workflow

### CI/CD Pipeline
```yaml
# .github/workflows/api-docs.yml
- name: Generate API Documentation
  run: npx tsx scripts/supabase-customer-analyzer.ts
- name: Deploy Documentation  
  run: # Deploy docs to hosting
```

### Pre-commit Hook
```bash
# Chạy analyzer trước mỗi commit
npx tsx scripts/supabase-customer-analyzer.ts
```

---

**Script này đảm bảo customer management API được document đầy đủ, tested kỹ lưỡng và sẵn sàng cho production deployment.**
