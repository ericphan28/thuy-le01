# 🧪 HƯỚNG DẪN TEST CỤ THỂ - ENHANCED PRICING

## 🎯 **CÁC SẢN PHẨM CÓ PRICING RULES ĐỂ TEST**

### **📋 Từ data đã phân tích, các sản phẩm SAU có pricing rules:**

#### **🔥 1. SP000380 - BÓNG ÚM INTERHEAT (100w)**
```
Original Price: 50,000 VND
Enhanced Price: 45,000 VND  
Savings: 5,000 VND (10%)
Rule: Net pricing 45,000 VND
```

#### **🔥 2. SP000381 - BÓNG ÚM INTERHEAT (175w)**
```
Original Price: 50,000 VND
Enhanced Price: 50,000 VND
Rule: Net pricing 50,000 VND  
```

#### **🔥 3. SP000384 - KIM 12x13 (Vỉ)**
```
Original Price: 10,000 VND
Enhanced Price: 10,000 VND
Rule: Net pricing 10,000 VND (Qty: 0-13)
Special: Quantity-based rule!
```

#### **🔥 4. SP000383 - KIM 9x13 (Vỉ)**
```
Original Price: 10,000 VND  
Enhanced Price: 10,000 VND
Rule: Net pricing 10,000 VND (Qty: 5-16)
Special: Quantity-based rule!
```

#### **💰 5. Sản phẩm giá cao để test:**
```
SP000339 → 1,700,000 VND
SP000208 → 1,450,000 VND
SP000343 → 1,300,000 VND
SP000338 → 1,400,000 VND
```

## 🚀 **CÁCH TEST TRONG POS**

### **Bước 1: Mở POS**
```
http://localhost:3004/dashboard/pos
```

### **Bước 2: Chọn khách hàng**
- Click "Chọn khách hàng"
- Chọn bất kỳ khách hàng nào từ danh sách

### **Bước 3: Test Enhanced Pricing Toggle**

#### **Test Case 1: SP000380**
1. **Tìm sản phẩm**: Gõ "SP000380" hoặc "BÓNG ÚM"
2. **Observe**: Enhanced Pricing ON → Giá sẽ là 45,000 VND
3. **Toggle OFF**: Click "Chế độ cơ bản" → Giá trở về 50,000 VND
4. **Expected**: Badge "Tiết kiệm 5,000₫" khi Enhanced ON

#### **Test Case 2: SP000384 (Quantity-based)**
1. **Tìm sản phẩm**: Gõ "SP000384" hoặc "KIM 12x13"
2. **Thêm 1 unit**: Enhanced pricing sẽ apply
3. **Thêm 5 units**: Vẫn trong range 0-13, rule apply
4. **Thêm 15 units**: Vượt max_qty=13, observe behavior

#### **Test Case 3: SP000383 (Min quantity rule)**
1. **Tìm sản phẩm**: Gõ "SP000383" hoặc "KIM 9x13"
2. **Thêm 1 unit**: Rule chưa apply (min_qty=5)
3. **Thêm 5 units**: Rule bắt đầu apply
4. **Thêm 10 units**: Trong range 5-16, rule apply
5. **Thêm 20 units**: Vượt max_qty=16, observe behavior

#### **Test Case 4: High-value products**
1. **Test SP000339**: Giá cao, observe pricing calculation
2. **Test multiple items**: Mix high/low value products
3. **Check totals**: Enhanced vs Traditional pricing

## 🔍 **ĐIỂM KIỂM TRA**

### **1. UI Elements to Check:**
- ✅ **Toggle Button**: "Enhanced Pricing" switch
- ✅ **Savings Badge**: "Tiết kiệm [amount]" màu xanh
- ✅ **Loading State**: Spinning animation
- ✅ **Price Display**: Real-time updates
- ✅ **Cart Total**: Changes when toggle

### **2. Console Logs (F12):**
```javascript
// Expected logs:
📊 Enhanced Pricing Results: Map(...)
📊 Pricing Summary: {useEnhancedPricing: true, totalSavings: ...}
🚀 === ENHANCED CHECKOUT PROCESS STARTED ===
```

### **3. Network Tab (F12):**
```
// API calls when adding to cart:
POST /api/pricing/simulate
{
  "sku": "SP000380",
  "qty": 1
}

Response:
{
  "final_price": 45000,
  "final_savings": 5000,
  "applied_rule": {...}
}
```

## 📱 **Mobile Testing**

1. **Open mobile view** của POS
2. **Cart drawer**: Touch "Chi tiết" để mở
3. **Enhanced pricing**: Vẫn hoạt động trên mobile
4. **Checkout**: Full functionality

## 🎯 **Expected Results**

### **✅ SP000380 Enhanced Pricing ON:**
```
- Product: BÓNG ÚM INTERHEAT (100w)
- Original: 50,000 VND
- Enhanced: 45,000 VND  
- Savings: 5,000 VND
- Badge: "Tiết kiệm 5.000₫"
- Console: Pricing rule applied
```

### **✅ SP000384 Quantity Testing:**
```
- 1-13 units: Enhanced pricing applies
- 14+ units: Rule may not apply (max_qty=13)
- Real-time calculation as quantity changes
```

### **✅ Enhanced Pricing OFF:**
```
- All products: Original sale_price
- No savings badge
- Traditional discount system available
- Manual VAT calculation
```

## 🚨 **Troubleshooting**

### **If Enhanced Pricing not working:**
1. **Check Console**: Any JavaScript errors?
2. **Check Network**: API calls successful?
3. **Check Toggle**: Enhanced Pricing enabled?
4. **Check Customer**: Customer selected?

### **Debug Commands:**
```javascript
// In browser console:
localStorage.getItem('enhanced_pricing_debug') 
// Should show debug info
```

## 🏆 **Success Criteria**

- ✅ **Toggle works**: Can switch between Enhanced/Basic
- ✅ **Pricing rules apply**: SP000380 shows 45k instead of 50k
- ✅ **Quantity rules work**: SP000384/SP000383 quantity logic
- ✅ **Savings display**: Badge shows correct savings
- ✅ **Cart calculation**: Totals update correctly
- ✅ **Checkout works**: Enhanced prices used in payment
- ✅ **Mobile responsive**: Works on phone/tablet
- ✅ **No errors**: Console clean, no network errors

## 🎉 **READY TO TEST!**

**Server đang chạy tại:** `http://localhost:3004/dashboard/pos`

**Enhanced Pricing đã được tích hợp thành công!** 🚀

Bây giờ bạn có thể test với các sản phẩm cụ thể có pricing rules và thấy sự khác biệt rõ ràng giữa Enhanced và Traditional pricing!
