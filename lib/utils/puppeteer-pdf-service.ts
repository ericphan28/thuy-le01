/**
 * PROFESSIONAL PUPPETEER PDF SERVICE
 * High-quality HTML-to-PDF conversion with perfect Vietnamese support
 */

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { generateVietnameseInvoiceHTML } from './vietnamese-html-template'

export async function generateProfessionalVietnamesePDF(invoiceData: InvoiceFullData): Promise<Buffer> {
  let browser = null
  
  try {
    // Resolve executable path depending on platform
    const executablePath = await resolveExecutablePath()

    // Launch Puppeteer with platform-aware options
    const isLambdaLike = process.platform !== 'win32' && process.platform !== 'darwin'
    browser = await puppeteer.launch({
      args: isLambdaLike ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: isLambdaLike ? chromium.defaultViewport : undefined,
      executablePath,
      headless: true,
    })

    const page = await browser.newPage()

    // Set viewport cho A4
    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 2,
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

async function resolveExecutablePath(): Promise<string> {
  // 1) Explicit override
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }

  // 2) Windows: try common Chrome/Edge locations
  if (process.platform === 'win32') {
    const pf = process.env['PROGRAMFILES'] || 'C:/Program Files'
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)'
    const candidates = [
      // Google Chrome
      path.join(pf, 'Google/Chrome/Application/chrome.exe'),
      path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
      // Microsoft Edge (Chromium)
      path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
    ]
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const st = fs.statSync(p)
          if (st.isFile()) return p
        }
      } catch {}
    }
    // Do NOT fall back to sparticuz on Windows (returns a folder => ENOENT)
    throw new Error('Không tìm thấy Chrome/Edge để tạo PDF trên Windows. Hãy cài Chrome/Edge hoặc đặt PUPPETEER_EXECUTABLE_PATH=đường_dẫn_đến_chrome.exe')
  }

  // 3) macOS: default Chrome locations
  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    const maybe = await chromium.executablePath()
    if (maybe && fs.existsSync(maybe)) return maybe
    throw new Error('Không tìm thấy Chrome/Edge trên macOS. Hãy cài Chrome hoặc đặt PUPPETEER_EXECUTABLE_PATH')
  }

  // 4) Linux / serverless (Lambda, Docker Alpine, etc.)
  const linuxPath = await chromium.executablePath()
  if (linuxPath && fs.existsSync(linuxPath)) return linuxPath
  // Some distros use chromium or chromium-browser in /usr/bin
  const linuxCandidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
  for (const p of linuxCandidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('Không tìm thấy Chromium trên Linux. Hãy đảm bảo cài đặt chromium hoặc dùng @sparticuz/chromium đúng môi trường')
}
