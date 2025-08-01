# 🔧 Setup Supabase cho Customer Management

## 📋 Các bước cần thực hiện:

### 1. **Tạo Supabase Project** (nếu chưa có)
```bash
# Truy cập https://app.supabase.com
# Tạo project mới hoặc sử dụng project có sẵn
```

### 2. **Lấy thông tin kết nối**
Trong Supabase Dashboard → Settings → API:
- **Project URL**: `https://your-project-id.supabase.co` 
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 3. **Import Schema vào Supabase**
```sql
-- Chạy nội dung file backup_thuyle_schema_complete.sql trong SQL Editor
-- Hoặc sử dụng migration tools
```

### 4. **Cập nhật .env.local**
```bash
# Thay thế với thông tin thực tế của bạn
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key-here
```

### 5. **Test kết nối**
```bash
npx tsx scripts/test-supabase-connection.ts
```

## 🎯 **Demo với Local Database** (Alternative)

Nếu bạn muốn test ngay với local database:

### Option 1: Supabase CLI
```bash
# Install Supabase CLI
npm install -g supabase

# Start local development
supabase start

# Sẽ tạo local instance với:
# - URL: http://localhost:54321
# - Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...
```

### Option 2: Docker PostgreSQL
```bash
# Start PostgreSQL container
docker run --name postgres-test -e POSTGRES_PASSWORD=password -e POSTGRES_DB=xuanthuy -p 5432:5432 -d postgres:15

# Import schema
psql -h localhost -U postgres -d xuanthuy -f backup_thuyle_schema_complete.sql
```

## 🔍 **Current Status Check**

Chạy lệnh này để kiểm tra:
```bash
npx tsx scripts/test-supabase-connection.ts
```

### Expected Output (khi config đúng):
```
🚀 Testing Supabase Connection...
==================================================
📋 Environment variables loaded:
NEXT_PUBLIC_SUPABASE_URL: https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6...

🔗 Creating Supabase client...
✅ Supabase client created successfully

🧪 Testing database connection...
✅ Database connection successful!
📊 Sample query returned 0 records

🔍 Testing other tables...
✅ Table "customer_types": OK (0 sample records)
✅ Table "invoices": OK (0 sample records)
...
```

## 💡 **Quick Fix - Fake Data Test**

Nếu bạn muốn test ngay với fake data:

```typescript
// Temporary test script
const DEMO_URL = 'https://demo.supabase.co'  
const DEMO_KEY = 'demo-key'

// Sẽ fail nhưng test được code logic
```

## 🚀 **Next Steps**

1. **Setup thực tế**: Get Supabase credentials và import schema
2. **Run full analyzer**: `npx tsx scripts/supabase-customer-analyzer.ts`
3. **Generate docs**: Tự động tạo API documentation
4. **Integration**: Sử dụng trong Next.js app

## ❓ **Cần hỗ trợ?**

Hãy cho tôi biết bạn muốn:
- [ ] Setup Supabase project mới
- [ ] Import schema từ backup file  
- [ ] Test với local database
- [ ] Tạo fake data để test
- [ ] Modify script để work offline

Tôi sẽ hướng dẫn chi tiết từng bước!
