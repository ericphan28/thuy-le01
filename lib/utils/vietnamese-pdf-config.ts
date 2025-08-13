// Vietnamese PDF Configuration
// Khắc phục vấn đề font nghiêng và hiển thị sai

export const VIETNAMESE_PDF_CONFIG = {
  // Font configuration for Vietnamese text
  fonts: {
    primary: 'times', // Times có hỗ trợ tiếng Việt tốt hơn Helvetica
    fallback: 'courier' // Backup font
  },
  
  // Text encoding
  encoding: 'UTF-8',
  
  // Vietnamese specific characters mapping
  vietnameseCharMap: {
    'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
    'đ': 'd', 'Đ': 'D'
  },
  
  // Layout settings
  layout: {
    margin: 10,
    pageWidth: 190,
    lineHeight: 6,
    headerHeight: 30,
    footerHeight: 25
  },
  
  // Color scheme - Fixed as tuples
  colors: {
    primary: [41, 98, 255] as [number, number, number], // Blue
    secondary: [220, 38, 38] as [number, number, number], // Red
    success: [34, 197, 94] as [number, number, number], // Green
    warning: [245, 158, 11] as [number, number, number], // Orange
    text: [0, 0, 0] as [number, number, number], // Black
    textLight: [107, 114, 128] as [number, number, number], // Gray
    background: [255, 255, 255] as [number, number, number] // White
  }
}

// Helper function to normalize Vietnamese text for PDF
export function normalizeVietnameseText(text: string): string {
  let normalized = text
  
  // Replace Vietnamese characters with base characters if needed
  for (const [vietnamese] of Object.entries(VIETNAMESE_PDF_CONFIG.vietnameseCharMap)) {
    normalized = normalized.replace(new RegExp(vietnamese, 'g'), vietnamese) // Keep original
  }
  
  return normalized
}

// Helper function to setup PDF with Vietnamese support

export function setupVietnamesePDF(pdf: any) {
  // Set default font to Times (better Vietnamese support)
  pdf.setFont(VIETNAMESE_PDF_CONFIG.fonts.primary, 'normal')
  
  // Set encoding
  pdf.setCharSpace(0)
  
  return pdf
}
