# Chính sách giá & chiết khấu (Ma trận chiết khấu)

Mục tiêu: Chuẩn hóa cách áp dụng giá/chiết khấu theo nhiều cấp, không phải chỉnh giá gốc của sản phẩm.

## Thứ tự ưu tiên (cao → thấp)
1) Giá hợp đồng (khách × sản phẩm, giá ròng/net)
2) Bảng giá theo nhóm khách/kênh/chi nhánh/danh mục
3) Khuyến mãi (chiến dịch, combo/gói, voucher)
4) Bậc số lượng (theo sản phẩm/danh mục)
5) Chiết khấu mặc định theo nhóm khách/khách
6) Giá niêm yết (list/MSRP) ở sản phẩm

Nguyên tắc: best-price hoặc stacking có trần; chặn dưới min-margin; loại trừ hàng “không giảm”.

## Thực thể chính
- Bảng giá (Price Books), Quy tắc giá, Giá hợp đồng, Khuyến mãi, Bậc số lượng, Loại trừ & trần, Phê duyệt.

## Quy trình nghiệp vụ
- Thu thập rule hợp lệ theo khách/kênh/chi nhánh/thời gian → áp dụng theo ưu tiên → kiểm tra trần/min-margin → phê duyệt nếu vượt → ghi audit lý do.

## KPI
- AOV, % đơn có KM, min-margin violations, doanh thu theo rule, attach rate.
