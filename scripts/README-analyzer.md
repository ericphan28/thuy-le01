# Supabase Customer Analyzer Setup

## 🚀 Cài đặt và chạy

### 1. Cài đặt dependencies
```bash
npm install @supabase/supabase-js @types/node tsx typescript
```

### 2. Cấu hình environment variables
Tạo file `.env.local` trong thư mục root:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Chạy script phân tích
```bash
npx tsx scripts/supabase-customer-analyzer.ts
```

## 📊 Tính năng của script

### ✅ Kiểm tra kết nối database
- Test connection tới Supabase
- Verify credentials và permissions

### 🔍 Phân tích schema
- Phân tích cấu trúc bảng `customers`
- Kiểm tra types và nullable fields
- Extract sample data

### 🔗 Phân tích relationships
- Test relationship customers ↔ invoices
- Verify foreign key constraints
- Check join performance

### 🧪 Test database functions
- `get_financial_summary()` function
- `search_customers_with_stats()` function
- Custom RPC functions

### 🔧 Test CRUD operations
- CREATE: Tạo customer test
- READ: Đọc dữ liệu
- UPDATE: Cập nhật thông tin
- DELETE: Xóa (với cleanup)

### 🔍 Test tìm kiếm và lọc
- Text search với `ilike`
- Filter theo customer_type
- Pagination với `range()`
- Sorting với `order()`

### 📚 Tạo tài liệu API
- JSON API documentation
- TypeScript examples
- Best practices
- Common patterns

## 📂 Output files

Sau khi chạy, script sẽ tạo:
```
docs/api/
├── customer-management-api.json  # Full API documentation
└── README.md                     # Quick start guide
```

## 🛠️ Customization

### Thay đổi Supabase config
Sửa trong constructor của `SupabaseCustomerAnalyzer`:
```typescript
const supabaseUrl = 'YOUR_ACTUAL_SUPABASE_URL'
const supabaseKey = 'YOUR_ACTUAL_SUPABASE_KEY'
```

### Thêm test cases
Extend class với methods mới:
```typescript
async testCustomFunction(): Promise<void> {
  // Your custom test logic
}
```

### Thay đổi output format
Modify `generateAPIDocumentation()` method để customize format.

## 🐛 Troubleshooting

### Connection failed
- Kiểm tra URL và API key
- Verify network connection
- Check Supabase project status

### Schema analysis failed
- Verify table permissions
- Check RLS policies
- Ensure tables exist

### Function testing failed
- Check if functions exist in database
- Verify function permissions
- Check function parameters

## 📝 Next Steps

1. Chạy script để tạo baseline documentation
2. Review generated API docs
3. Customize theo requirements
4. Integrate vào development workflow
5. Setup automation cho CI/CD

## 🔧 Advanced Usage

### Run specific tests only
```typescript
const analyzer = new SupabaseCustomerAnalyzer()
await analyzer.testConnection()
await analyzer.analyzeCustomerSchema()
// Skip other tests
```

### Batch operations testing
```typescript
// Test performance với large datasets
await analyzer.testBatchOperations(1000)
```

### Custom reporting
```typescript
// Generate custom reports
await analyzer.generateCustomReport({
  includePerformanceMetrics: true,
  includeDataSamples: true
})
```
