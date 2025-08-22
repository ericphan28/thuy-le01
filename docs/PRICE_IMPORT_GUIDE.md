# Hướng dẫn nhập “Bảng giá mặc định” (từ file TSV)

Tệp nguồn: `public/du-lieu-goc/bang-gia-mac-dinh.txt` (phân tách bằng Tab)

## 1) Cấu trúc cột và ánh xạ
- Cột 1: Mã SP (product_code) — ví dụ: `SP000771`; có một số dòng không chuẩn (ví dụ mã “1” hoặc lặp lại tên). Nếu mã trống/không hợp lệ, sẽ đối sánh theo tên sản phẩm.
- Cột 2: Tên SP (product_name)
- Cột 3: Đơn vị (unit) — có thể trống; nếu khớp đơn vị hệ thống sẽ gán, không bắt buộc.
- Cột 4: Danh mục (category_name)
- Cột 5: Số lượng (stock gợi ý) — KHÔNG cập nhật tồn kho trong đợt nhập giá (tránh ghi đè). Dùng để đối chiếu nếu cần.
- Cột 6: Giá 1 (price1)
- Cột 7: Giá 2 (price2)
- Cột 8: Giá 3 (price3)

Quy tắc suy ra giá:
- sale_price (giá bán dùng tại POS): lấy ưu tiên `price3 > 0` → `price2 > 0` → `price1`.
- base_price: = `sale_price` (tạm coi là giá niêm yết mặc định).
- cost_price (giá vốn): ưu tiên `price1` nếu > 0; nếu `price1 = 0` thì lấy min dương của (price2, price3); nếu không có số hợp lệ thì GIỮ NGUYÊN giá vốn cũ.

Bỏ qua tồn kho trong lần nhập giá này để không phá vỡ sổ kho. Các dòng có cả 3 giá đều bằng 0 sẽ được đưa vào “unmatched” để rà soát thủ công.

## 2) Kiểm tra dữ liệu bất thường
- Mã SP không chuẩn hoặc trống (ví dụ: mã là “1” hoặc sử dụng tên). Sẽ đối sánh theo tên nếu mã không dùng được.
- Hàng dịch vụ/vận chuyển (ví dụ: “CƯỚC XE”, “PHÍ GIAO”) có tồn kho rất lớn. Không cập nhật tồn.
- Một số dòng `price3 = 0` (không có giá bán lẻ công bố). Khi đó dùng `price2` hoặc `price1`.
- Danh mục có biến thể chữ hoa/thường. Bộ nhập chuẩn hóa bằng so khớp không phân biệt hoa/thường.

## 3) Hai cách nhập
- Cách A (khuyến nghị): chạy script Node `scripts/import/price-list-import.ts` (dùng Supabase API), có log chi tiết unmatched.
- Cách B: dùng SQL `sql/20250819_price_import.sql` với psql (staging + update an toàn).

## 4) Chạy bằng Node (Cách A)
Yêu cầu biến môi trường (`.env.local`): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ưu tiên Service Role để bỏ qua RLS) hoặc ANON KEY nếu policy cho phép.

PowerShell:
```powershell
# Chạy importer (đọc tệp TSV, upsert danh mục + cập nhật giá sản phẩm)
npx tsx scripts/import/price-list-import.ts --file public/du-lieu-goc/bang-gia-mac-dinh.txt

# Dry-run (không ghi DB)
npx tsx scripts/import/price-list-import.ts --dry-run
```
Flags:
- `--dry-run`: chỉ phân tích, không ghi DB; in thống kê map và unmatched.
- `--file`: đường dẫn tệp, mặc định `public/du-lieu-goc/bang-gia-mac-dinh.txt`.

## 5) Chạy bằng psql (Cách B)
Mở `sql/20250819_price_import.sql` và làm theo hướng dẫn trong file:
- Tạo bảng staging `stg_price_list`.
- Dùng `\\copy` để nạp từ `public/du-lieu-goc/bang-gia-mac-dinh.txt`.
- Chạy khối cập nhật giá sản phẩm và ghi log unmatched.

Ví dụ (thay thông số kết nối):
```powershell
psql "host=... port=... user=... dbname=... sslmode=require" -f sql/20250819_price_import.sql
```
Khi psql dừng tại bước `\\copy`, hãy nhập đúng đường dẫn tệp (trên Windows dùng `C:\\...` hoặc `D:\\...`).

## 6) Liên kết với “Chính sách giá”
- Duy trì `products.sale_price` là giá nền mặc định.
- Ngoại lệ/khuyến mãi/bậc số lượng quản trong `price_books`, `price_rules`, `volume_tiers`.
- Sau khi nhập giá nền, tạo 1 “Bảng giá POS mặc định” và chỉ thêm quy tắc cho SKU cần khác giá nền.

## 7) Kiểm thử nhanh
- Lấy mẫu 10 SKU bất kỳ, kiểm tra `sale_price`, `cost_price` trên UI.
- Test 3 nhóm: (a) price3>0, (b) price3=0 nhưng price2>0, (c) cả 3 giá = 0 (đi unmatched).
- Xuất danh sách `price_import_unmatched` để bổ sung thủ công.

---
Đi kèm: `scripts/import/price-list-import.ts`, `sql/20250819_price_import.sql`.
