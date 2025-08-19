# Vietnamese PDF Bundle

This folder contains copies of all files related to Vietnamese PDF export from the project, organized by their original paths for easy reference and reuse.

- app/api/invoices/[id]/pdf-vietnamese/route.ts
- app/api/invoices/[id]/pdf/route.ts (legacy/multi-style)
- app/api/invoices/[id]/pdf-advanced/route.ts (multi-style selector)
- lib/utils/puppeteer-pdf-service.ts (Puppeteer-core + @sparticuz/chromium)
- lib/utils/vietnamese-html-template.ts (HTML template for Puppeteer)
- lib/utils/vietnamese-html-pdf.ts (HTML→Canvas→PDF approach)
- lib/utils/professional-vietnamese-pdf.ts (jsPDF professional)
- lib/utils/vietnamese-enterprise-pdf.ts (jsPDF enterprise)
- lib/utils/vietnamese-safe-pdf.ts (TELEX-safe mapping)
- lib/utils/vietnamese-font-support.ts (jsPDF VN helpers)
- lib/utils/vietnamese-pdf-config.ts (VN PDF config/constants)
- lib/utils/simple-vietnamese-pdf.ts (minimal jsPDF)
- lib/utils/secure-watermark-pdf.ts (security/watermark)
- lib/utils/modern-qr-pdf.ts (QR code variant)
- components/invoice/vietnamese-pdf-button.tsx (download button)
- components/invoice/advanced-pdf-button.tsx (style picker)
- components/invoice/canvas-vietnamese-pdf.tsx (client-side Canvas PDF)
- docs/PDF_TIENg_VIET_EXPORT_GUIDE.md (technical guide)
- CANVAS_PDF_SOLUTION.md (canvas approach notes)

Note: These are copies for documentation/sharing. They aren’t wired to run from this folder.
