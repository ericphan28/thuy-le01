# Hướng dẫn kỹ thuật: Xuất PDF Tiếng Việt đẹp (dùng cho dự án khác)

Tài liệu ngắn gọn để Copilot hiểu và tạo chức năng “Xuất PDF Tiếng Việt đẹp” trong dự án khác (ví dụ quản lý farm). Tập trung công nghệ và cách triển khai, không ràng buộc nghiệp vụ hóa đơn.

## Mục tiêu
- Tạo file PDF A4 chuyên nghiệp, hiển thị tiếng Việt đúng dấu, dễ in/gửi qua email.
- Render server-side từ dữ liệu DB/API, trả về HTTP `application/pdf` với tên file tiếng Việt (UTF-8).

## Lựa chọn công nghệ
1) HTML/CSS → PDF bằng Puppeteer (Chromium headless)
- Ưu: Fidelity cao (WYSIWYG), dùng được `@page`, `page-break`, CSS nâng cao.
- Nhược: Cần Chromium headless; trên serverless (Vercel) dùng `@sparticuz/chromium`, runtime Node.js (không Edge).
- Khuyến nghị khi cần bản in “đẹp” và nhất quán với bản HTML.

2) `@react-pdf/renderer` (React → PDF)
- Ưu: Thuần Node, dễ deploy serverless, không cần Chromium.
- Nhược: Layout/table phức tạp hạn chế; phải đăng ký font thủ công.
- Khuyến nghị nếu môi trường không cho chạy Chromium.

3) PDFKit/pdf-lib
- Toàn quyền kiểm soát nhưng tốn công layout, khó đạt “đẹp” nhanh.

Khuyến nghị tổng quát: Nếu được, dùng Puppeteer; nếu không, dùng `@react-pdf/renderer` có đăng ký font Việt.

## Font tiếng Việt (bắt buộc)
- Dùng font có đủ glyph VN: Noto Sans/Serif, Inter VN, Roboto (bản hỗ trợ VN), Arial Unicode MS…
- Puppeteer: bundle font vào môi trường deploy (lambda layer/binary assets) để Chromium tìm thấy.
- React-PDF: `Font.register({ family: 'NotoSans', src: '/path/NotoSans-Regular.ttf' })` và set `fontFamily`.

## Thiết kế layout A4
- `@page { size: A4; margin: 0.3–1cm }`.
- Tránh vỡ dòng bảng: `table, tr, td { page-break-inside: avoid; break-inside: avoid; }`.
- Căn phải cột số/tiền, dùng `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`.
- Sử dụng lớp `.a4-page` (padding cố định), kèm “compact mode” (giảm font/padding) để gom 1 trang khi nội dung ngắn.
- Header/summary cố định vị trí; hạn chế shadow lớn gây overflow.

## API/Endpoint (gợi ý hợp đồng)
- `GET /api/reports/<entity>/pdf?from=...&to=...&filters=...`
- Response: `application/pdf` (binary); headers:
  - `Content-Disposition: attachment; filename="BaoCao_<Ten>_<YYYY-MM-DD>.pdf"`
  - `Content-Language: vi-VN`
  - Cache: `no-cache` (tùy nhu cầu)
- Status: `200` thành công; `404` không có dữ liệu; `500` lỗi kết xuất.
- Bảo mật: kiểm tra session/role trước khi xuất.

## Luồng server (chuẩn)
1) Nhận request → parse query/filters.
2) Fetch dữ liệu từ DB (server-side) → chuẩn hóa `{ header, items, summary }`.
3) Render PDF (Puppeteer render HTML hoặc React-PDF render component).
4) Trả về `Uint8Array`/`Buffer` với headers phù hợp.
5) Log lỗi/giới hạn rate nếu cần.

## Gợi ý cấu trúc thư mục
- `utils/pdf/puppeteer-service.ts` (mở Chromium, render HTML → PDF).
- `templates/pdf/<entity>.html.ts` (tạo HTML string) hoặc component React renderToString.
- `api/reports/<entity>/pdf/route.ts` (fetch, render, response).
- `public/fonts/` (bundle font VN).  

## Snippets định hướng (rút gọn)

HTML → PDF (Puppeteer, định hướng):
```ts
// puppeteer-service.ts (định hướng)
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export async function renderHtmlToPdf(html: string) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  })
  await browser.close()
  return pdf // Buffer | Uint8Array
}
```

React → PDF (`@react-pdf/renderer`, định hướng):
```ts
// pdf.tsx (định hướng)
import { Document, Page, Text, View, Font, StyleSheet } from '@react-pdf/renderer'
Font.register({ family: 'NotoSans', src: '/path/NotoSans-Regular.ttf' })
const styles = StyleSheet.create({ page: { padding: 24, fontFamily: 'NotoSans' } })
export function ReportPdf({ data }: { data: any }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text>Tiêu đề báo cáo</Text>
        {/* nội dung */}
      </Page>
    </Document>
  )
}
```

Endpoint (Next.js App Router):
```ts
// route.ts (định hướng)
import { NextResponse } from 'next/server'
export async function GET(req: Request) {
  // fetch data → html/pdfBuffer
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf; charset=utf-8',
      'Content-Disposition': 'attachment; filename="BaoCao.pdf"',
      'Content-Language': 'vi-VN',
      'Cache-Control': 'no-cache',
    },
  })
}
```

## Hiệu năng & triển khai
- Puppeteer trên Vercel: runtime Node.js; dùng `@sparticuz/chromium`.
- Tối ưu font (subset), nén ảnh; tránh render quá nhiều trang trong 1 request.
- Có thể cache kết quả PDF ngắn hạn nếu dữ liệu ít thay đổi.

## Định dạng vi-VN
- Tiền: `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`.
- Ngày: `toLocaleDateString('vi-VN')`; cân nhắc timezone VN.

## Kiểm thử bắt buộc
- Dấu tiếng Việt (ă â ê ô ơ ư đ) hiển thị chuẩn.
- Bảng dài không vỡ hàng; tổng cuối đúng.
- Filename tiếng Việt tải về đúng.
- Trường hợp dữ liệu rỗng/lỗi → HTTP status chuẩn.

## Fallback in nhanh (HTML print)
- Trang HTML A4-styled `/print/<entity>` + `window.print()` cho in tại quầy.
- Không “đẹp”/ổn định bằng PDF, nhưng rất nhanh và không cần Chromium.
