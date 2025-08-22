# Pricing & Discount Engine Business Overview

> Mục tiêu: Cung cấp cho AI (Copilot) và developer một cái nhìn đầy đủ về nghiệp vụ định giá hiện tại của dự án mỗi khi khởi tạo session mới.

## 1. Khái niệm chính
- **Price Book (`price_books`)**: Tập hợp các quy tắc giá (price rules) áp dụng cho một kênh / chiến lược. Mỗi `price_rules.price_book_id` trỏ tới một price book.
- **Price Rule (`price_rules`)**: Định nghĩa một điều kiện + hành động điều chỉnh giá.
- **Scope**: Phạm vi áp dụng của quy tắc.
  - `sku`: 1 sản phẩm cụ thể (`sku_code`)
  - `category`: toàn bộ ngành hàng (`category_id`)
  - `tag`: nhóm logic theo nhãn (`tag` text)
- **Action Type** (`action_type`): Cách áp dụng ưu đãi.
  - `net`: đặt giá bán cố định (ghi đè giá nền)
  - `percent`: giảm theo % trên giá nền
  - `amount`: giảm số tiền tuyệt đối
  - `promotion`: chương trình khuyến mãi (hiện tạm xử lý như percent – có thể mở rộng logic riêng)
- **Quantity Range**: Giới hạn số lượng áp dụng bằng `min_qty` (>=) và `max_qty` (<=, nullable = không giới hạn trên).
- **Priority**: Số lớn hơn thắng khi nhiều rule cùng áp dụng (chiều hướng “higher overrides lower”).
- **Active Flag (`is_active`)**: Bật/tắt nhanh rule.
- **Effective Window**: `effective_from` / `effective_to` (có thể null; logic thời gian nửa mở / infinity).

## 2. Schema `price_rules` (tóm tắt trường)
| Field | Type | Ý nghĩa |
|-------|------|--------|
| rule_id | PK | Định danh |
| price_book_id | FK | Thuộc price book nào |
| scope | enum | sku / category / tag |
| sku_code | text? | Dùng khi scope=sku |
| category_id | int? | Dùng khi scope=category |
| tag | text? | Dùng khi scope=tag |
| action_type | enum | net/percent/amount/promotion |
| action_value | numeric | Giá trị hành động (đơn vị phụ thuộc action) |
| min_qty | numeric? | Số lượng tối thiểu (nullable) |
| max_qty | numeric? | Số lượng tối đa (nullable = không giới hạn) |
| priority | int | Ưu tiên (default 100) |
| is_active | boolean | Bật / tắt |
| effective_from | timestamptz? | Bắt đầu hiệu lực |
| effective_to | timestamptz? | Kết thúc hiệu lực |
| notes | text? | Ghi chú nội bộ |

## 3. Nguồn giá nền (Base Price)
Hiện engine dùng: `products.sale_price` (fallback `products.base_price`).

## 4. Engine áp dụng giá (tóm tắt logic hiện tại)
Pseudo:
```
fetch product basePrice
load all rules of price_book_id
filter: is_active = true
filter: time window matches now (effective_from/ effective_to)
filter: quantity conditions (qty >= min_qty AND (max_qty IS NULL OR qty <= max_qty))
filter: scope match (sku OR category OR tag) theo thứ tự ưu tiên tự nhiên
chọn rule có priority cao nhất (max(priority))
áp dụng action:
  net => final = action_value
  percent => final = basePrice * (1 - action_value/100)
  amount => final = max(0, basePrice - action_value)
  promotion => (tạm) final = basePrice * (1 - action_value/100)
rounding: Math.round(100 * value)/100 (có thể cải thiện sau)
```
Nếu không có rule phù hợp: final = basePrice.

## 5. UX Form “SmartPriceRuleForm”
Các bước:
1. Chọn Scope (sku / category / tag) -> hiển thị field phụ tương ứng (picker sản phẩm, picker ngành hàng, input tag).
2. Chọn Action Type (gợi ý động theo scope) – ví dụ scope=sku ưu tiên net/percent/promotion.
3. Thiết lập Giá: action_value + (min_qty, max_qty) + preview giá thời gian thực cho SKU.
4. Thiết lập bổ sung: priority, hiệu lực thời gian, ghi chú, bật/tắt.
5. Submit / Cancel / (Edit mode: Delete).

Bổ sung gần đây:
- Debounce & cache tìm kiếm sản phẩm/category trong pickers để tránh spam API.
- Thêm `max_qty` input & preview điều kiện số lượng ("Áp dụng cho ...").
- Edit page dùng chung Smart form (loại bỏ legacy kép).

## 6. Quy tắc hợp lệ & Validation Summary
| Kiểm tra | Điều kiện |
|----------|----------|
| scope required | scope != '' |
| action_type required | action_type != '' |
| action_value | phải là số; nếu percent: 0–100; nếu amount/net: >=0 |
| scope=sku | sku_code tồn tại |
| scope=category | category_id tồn tại |
| scope=tag | tag non-empty |
| qty range | min_qty >=0; max_qty>=0; min_qty <= max_qty (khi cả hai có) |
| effective window | effective_from <= effective_to (khi cả hai có) |

## 7. Priority Strategy
- Dùng số nguyên, chuẩn hiện tại: default 100.
- High number overrides lower. Có thể sau mở rộng multi-stage evaluation (e.g. scope weight).

## 8. Khả năng mở rộng tương lai (Wishlist)
- Phân lớp rule: base / override / promotional stack.
- Thêm condition theo khách hàng (customer group, channel).
- Volume tiers riêng bảng `volume_tiers` (đang gợi ý trong import doc nhưng chưa implement logic).
- Action type mới: `floor_percent`, `bundle`, `bogo`.
- Công cụ mô phỏng (UI) chọn SKU + Qty + Date để xem stacking.
- Audit log thay đổi giá.

## 9. Trạng thái hiện tại (Aug 2025)
- Create/Edit form thống nhất (SmartPriceRuleForm) ✅
- Debounced search trong pickers ✅
- Delete rule trong edit ✅
- Quantity condition preview ✅
- Validation phía server & client cơ bản ✅
- Chưa trích chung module validate (trùng code create/edit) ❌
- Chưa có thông báo toast/optimistic update ❌
- Engine mới dừng ở single-rule-by-priority (không stacking) ❌

## 10. Hướng dẫn nhanh cho AI / Dev mới
1. Đọc file này + `lib/pricing/engine.ts` để hiểu logic.
2. Form ở `components/pricing/smart-price-rule-form.tsx` – props: mode, initialValues, onDelete.
3. Trang tạo rule: `app/dashboard/pricing/books/[id]/rules/new/page.tsx`.
4. Trang sửa rule: `app/dashboard/pricing/books/[id]/rules/[ruleId]/edit/page.tsx`.
5. Nếu thêm action_type mới: cập nhật enum UI + validation + engine switch.
6. Nếu thay đổi base price source: sửa `engine.ts`.

## 11. Known Gaps / Technical Debt
| Mục | Ghi chú |
|-----|--------|
| Duplicate validation | Create vs Edit lặp code – cần module hóa |
| Promotion semantics | Hiện treat như percent, cần model riêng (date, label) |
| No audit trail | Chưa lưu history thay đổi rule |
| No stack rules | Không support đồng thời nhiều rule (e.g. category + tag) |
| No customer conditions | Chưa có phân nhóm khách hàng |

---
Cập nhật file này khi thay đổi logic để Copilot hiểu bối cảnh định giá.
