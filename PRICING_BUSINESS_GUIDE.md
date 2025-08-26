# Hướng Dẫn Nghiệp Vụ Tính Giá Sản Phẩm

## 📋 Tổng Quan
Hệ thống tính giá hoạt động theo nguyên tắc **ưu tiên quy tắc** (Rule Priority) để tự động áp dụng giá tốt nhất cho khách hàng.

## 🎯 Ví Dụ Cụ Thể: Sản Phẩm SP000049 (#AGR POX 1000DS)

### Giá Gốc Sản Phẩm
- **Giá niêm yết**: 220.000₫

### Các Quy Tắc Giá Được Áp Dụng

#### 1️⃣ Quy Tắc Cơ Bản (Rule #1)
```
🏷️ Loại: Giá cố định (net price)
💰 Giá áp dụng: 190.000₫
📦 Số lượng: 1 - 30 sản phẩm  
⭐ Độ ưu tiên: 100
✅ Trạng thái: Đang hoạt động
```

#### 2️⃣ Quy Tắc Giảm Giá Số Lượng Lớn (Rule #672)
```
🏷️ Loại: Giảm giá (amount discount)
💰 Giá giảm: 5.000₫
📦 Số lượng: Từ 3 sản phẩm trở lên
⭐ Độ ưu tiên: 100
✅ Trạng thái: Đang hoạt động
```

#### 3️⃣ Quy Tắc Tag HOT (Rule #667)
```
🏷️ Loại: Giảm giá theo tag
💰 Giá giảm: 5.000₫
📦 Số lượng: Từ 2 sản phẩm trở lên
🏆 Tag: HOT
⭐ Độ ưu tiên: 120 (cao nhất)
❌ Trạng thái: Tạm thời tắt (đang sửa lỗi)
```

## 🧮 Cách Tính Giá Thực Tế

### Trường Hợp 1: Mua 1 sản phẩm
```
Số lượng: 1
Áp dụng: Rule #1 (190.000₫)
Kết quả: 1 × 190.000₫ = 190.000₫
```

### Trường Hợp 2: Mua 10 sản phẩm  
```
Số lượng: 10
Quy tắc có thể áp dụng:
- Rule #1: 190.000₫ (qty 1-30) - Priority 100
- Rule #672: 220.000₫ - 5.000₫ = 215.000₫ (qty ≥3) - Priority 100

Kết quả: Chọn Rule #1 (vì cùng priority nhưng rule_id nhỏ hơn)
Tổng tiền: 10 × 190.000₫ = 1.900.000₫
```

### Trường Hợp 3: Mua 35 sản phẩm
```
Số lượng: 35
Quy tắc có thể áp dụng:
- Rule #1: Không áp dụng (chỉ cho qty ≤ 30)
- Rule #672: 220.000₫ - 5.000₫ = 215.000₫ (qty ≥3) - Priority 100

Kết quả: Áp dụng Rule #672
Tổng tiền: 35 × 215.000₫ = 7.525.000₫
```

## 🔄 Thuật Toán Ưu Tiên

Hệ thống chọn quy tắc theo thứ tự:
1. **Priority cao nhất** (số càng lớn càng ưu tiên)
2. **Scope cụ thể nhất**: sku > category > tag > all
3. **Rule ID nhỏ nhất** (quy tắc tạo trước được ưu tiên)

## 📊 Bảng Tóm Tắt Giá SP000049

| Số Lượng | Quy Tắc Áp Dụng | Giá/Sản Phẩm | Lý Do |
|----------|-----------------|-------------|--------|
| 1-2      | Rule #1         | 190.000₫    | Giá cố định |
| 3-30     | Rule #1         | 190.000₫    | Rule #1 ưu tiên hơn #672 |
| 31+      | Rule #672       | 215.000₫    | Rule #1 không áp dụng |

## 🛠️ Trạng Thái Hiện Tại
- ✅ **Hoạt động bình thường**: Giá 190k cho qty 1-30
- ⚠️ **Đã sửa lỗi**: Tag rules tạm thời tắt để tránh áp giá sai
- 🔄 **Kế hoạch**: Sẽ kích hoạt lại tag system khi hoàn thiện

## 💡 Lưu Ý Quan Trọng

### Cho Nhân Viên Bán Hàng:
- Với số lượng 1-30: Luôn báo giá 190.000₫
- Với số lượng >30: Báo giá 215.000₫  
- Khách hàng mua nhiều không có lợi hơn (do rule đặc biệt)

### Cho Quản Lý:
- Có thể tạo thêm rule để khuyến khích mua số lượng lớn
- Cần xem xét logic pricing khi qty > 30
- Tag system cần được kiểm tra trước khi kích hoạt lại

## 📞 Hỗ Trợ
Nếu có thắc mắc về giá sản phẩm, liên hệ bộ phận IT để kiểm tra quy tắc giá.
