# 🧪 HƯỚNG DẪN TEST ENHANCED PRICING TRONG POS

## 🎯 **CÁC SẢN PHẨM CÓ PRICING RULES ĐỂ TEST:**

### **📋 1. SẢN PHẨM VỚI PRICING RULES CỐ ĐỊNH (NET PRICE):**

#### **🔥 Test Cases Quan Trọng:**
```
SP000049 → 250,000 VND (có pricing rule đặc biệt)
SP000380 → 45,000 VND  (có pricing rule)
SP000381 → 50,000 VND  (có pricing rule)
SP000384 → 10,000 VND  (có quantity-based rule: 0-13 units)
SP000383 → 10,000 VND  (có quantity-based rule: 5-16 units)
```

#### **💰 Test Cases Giá Cao:**
```
SP000339 → 1,700,000 VND
SP000338 → 1,400,000 VND  
SP000208 → 1,450,000 VND
SP000343 → 1,300,000 VND
```

### **📊 2. VOLUME TIERS CÓ SẴN:**

Dựa trên database, có các volume tiers đang hoạt động để test pricing theo số lượng.

## 🚀 **CÁCH TEST TRONG POS:**

### **Bước 1: Mở POS System**
```
http://localhost:3004/dashboard/pos
```

### **Bước 2: Chọn khách hàng**
- Click vào ô "Chọn khách hàng"
- Tìm và chọn bất kỳ khách hàng nào

### **Bước 3: Test Enhanced Pricing ON/OFF**
- Quan sát toggle "Enhanced Pricing" ở sidebar (desktop)
- Test cả 2 mode: Enhanced và Basic

### **Bước 4: Test Specific Products**

#### **🧪 Test Case 1: SP000049 (Pricing Rule)**
1. Tìm sản phẩm: `SP000049`
2. **Expected Enhanced Price**: 250,000 VND (thay vì sale_price gốc)
3. Thêm vào giỏ hàng
4. **Kiểm tra**: Badge "Tiết kiệm" sẽ hiển thị nếu có giảm giá

#### **🧪 Test Case 2: SP000384 (Quantity-based)**
1. Tìm sản phẩm: `SP000384`
2. **Expected Price**: 10,000 VND (với quantity 1-13)
3. Thêm 5 units vào giỏ hàng
4. **Kiểm tra**: Pricing rule sẽ apply với min_qty=0, max_qty=13

#### **🧪 Test Case 3: SP000380 (Simple Rule)**
1. Tìm sản phẩm: `SP000380`
2. **Expected Price**: 45,000 VND
3. **Kiểm tra**: So sánh với sale_price gốc

#### **🧪 Test Case 4: Volume Testing**
1. Chọn bất kỳ sản phẩm có volume tier
2. Thêm số lượng lớn (5, 10, 20 units)
3. **Kiểm tra**: Volume discount sẽ được áp dụng

### **Bước 5: Quan sát UI Changes**

#### **Enhanced Pricing ON:**
- Badge "Tiết kiệm [số tiền]" hiển thị
- Loading animation khi tính toán
- Giá final được update real-time

#### **Enhanced Pricing OFF:**
- Chế độ pricing truyền thống
- Manual discount system
- VAT calculation đơn giản

## 🔍 **ĐIỂM KIỂM TRA CHI TIẾT:**

### **1. Console Logs (F12 → Console):**
```javascript
// Khi Enhanced Pricing tính toán:
📊 Enhanced Pricing Results: Map {...}
📊 Pricing Summary: { useEnhancedPricing: true, totalSavings: [...] }

// Khi checkout:
🚀 === ENHANCED CHECKOUT PROCESS STARTED ===
💰 Enhanced Payment Calculation: {...}
```

### **2. UI Elements:**
- **Toggle Button**: "Chế độ nâng cao" ↔ "Chế độ cơ bản"
- **Savings Badge**: "Tiết kiệm [amount]" (màu xanh)
- **Loading State**: Spinning dots khi tính toán
- **Final Total**: Thay đổi khi toggle enhanced pricing

### **3. Cart Behavior:**
- **Real-time updates**: Khi thay đổi quantity
- **Stock validation**: Vẫn hoạt động bình thường
- **Price calculation**: Enhanced vs Traditional

## 🎯 **EXPECTED RESULTS:**

### **✅ Enhanced Pricing ON:**
```
Product: SP000049
- Original Price: [sale_price từ DB]
- Enhanced Price: 250,000 VND
- Savings: [original - enhanced]
- Badge: "Tiết kiệm [amount]"
```

### **✅ Enhanced Pricing OFF:**
```
Product: SP000049  
- Price: [sale_price từ DB]
- No enhanced calculation
- Manual discount available
- Traditional VAT calculation
```

## 🚨 **TROUBLESHOOTING:**

### **Nếu Enhanced Pricing không hoạt động:**
1. **Check Console**: Có error messages không?
2. **Check Network**: API calls đến `/api/pricing/simulate`
3. **Check Toggle**: Enhanced Pricing có bật không?
4. **Check Customer**: Đã chọn khách hàng chưa?

### **Debug Commands:**
```javascript
// Trong console browser:
console.log('Cart Pricing Results:', window.__cartPricingResults)
console.log('Enhanced Pricing Service:', window.__enhancedPricingService)
```

## 📱 **TEST TRÊN MOBILE:**

1. Mở `http://localhost:3004/dashboard/pos` trên mobile
2. Cart sẽ hiển thị ở dạng drawer
3. Enhanced pricing vẫn hoạt động
4. Touch "Chi tiết" để xem full cart

## 🎉 **SUCCESS CRITERIA:**

- ✅ Toggle Enhanced Pricing hoạt động
- ✅ Pricing rules được áp dụng chính xác
- ✅ Savings được hiển thị
- ✅ Checkout sử dụng enhanced prices
- ✅ UI responsive và smooth
- ✅ No console errors
- ✅ Database integration hoạt động

**Happy Testing! 🚀**
