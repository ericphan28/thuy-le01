/**
 * PROFESSIONAL PUPPETEER PDF SERVICE
 * High-quality HTML-to-PDF conversion with perfect Vietnamese support
 */

import puppeteer from 'puppeteer'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { generateVietnameseInvoiceHTML } from './vietnamese-html-template'

export async function generateProfessionalVietnamesePDF(invoiceData: InvoiceFullData): Promise<Buffer> {
  let browser = null
  
  try {
    // Launch Puppeteer với options tối ưu
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    })

    const page = await browser.newPage()

    // Set viewport cho A4
    await page.setViewport({
      width: 794,  // A4 width in pixels at 96 DPI
      height: 1123, // A4 height in pixels at 96 DPI
      deviceScaleFactor: 2 // High resolution
    })

    // Generate HTML content
    const htmlContent = generateVietnameseInvoiceHTML(invoiceData)

    // Set HTML content
    await page.setContent(htmlContent, {
      waitUntil: ['networkidle0', 'domcontentloaded']
    })

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready')

    // Generate PDF với options chuyên nghiệp
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm', 
        bottom: '0mm',
        left: '0mm'
      },
      displayHeaderFooter: false
    })

    return Buffer.from(pdfBuffer)

  } catch (error) {
    console.error('PDF generation failed:', error)
    throw new Error('Không thể tạo PDF. Vui lòng thử lại.')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
