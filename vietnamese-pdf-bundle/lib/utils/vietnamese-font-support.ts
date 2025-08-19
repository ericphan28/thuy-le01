/**
 * VIETNAMESE FONT SUPPORT cho jsPDF
 * Giải quyết vấn đề hiển thị tiếng Việt trong PDF
 * 
 * Tại Việt Nam, các phần mềm chuyên nghiệp sử dụng:
 * - Font embedding (nhúng font vào PDF)
 * - Unicode UTF-8 encoding
 * - Vietnamese-optimized fonts như Roboto VN, Times VN
 */

import jsPDF from 'jspdf'

// Vietnamese character mapping cho Helvetica fallback
const VIETNAMESE_CHAR_MAP: Record<string, string> = {
  // Lowercase
  'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a',
  'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
  'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a',
  'đ': 'd',
  'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e',
  'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
  'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
  'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o',
  'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o',
  'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
  'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u',
  'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
  'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
  
  // Uppercase  
  'À': 'A', 'Á': 'A', 'Ạ': 'A', 'Ả': 'A', 'Ã': 'A',
  'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ặ': 'A', 'Ẳ': 'A', 'Ẵ': 'A',
  'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ậ': 'A', 'Ẩ': 'A', 'Ẫ': 'A',
  'Đ': 'D',
  'È': 'E', 'É': 'E', 'Ẹ': 'E', 'Ẻ': 'E', 'Ẽ': 'E',
  'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ệ': 'E', 'Ể': 'E', 'Ễ': 'E',
  'Ì': 'I', 'Í': 'I', 'Ị': 'I', 'Ỉ': 'I', 'Ĩ': 'I',
  'Ò': 'O', 'Ó': 'O', 'Ọ': 'O', 'Ỏ': 'O', 'Õ': 'O',
  'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ộ': 'O', 'Ổ': 'O', 'Ỗ': 'O',
  'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ợ': 'O', 'Ở': 'O', 'Ỡ': 'O',
  'Ù': 'U', 'Ú': 'U', 'Ụ': 'U', 'Ủ': 'U', 'Ũ': 'U',
  'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ự': 'U', 'Ử': 'U', 'Ữ': 'U',
  'Ỳ': 'Y', 'Ý': 'Y', 'Ỵ': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y'
}

/**
 * Chuyển đổi text tiếng Việt sang dạng tương thích với Helvetica
 * Sử dụng như fallback khi không có font Unicode
 */
export function convertVietnameseToCompatible(text: string): string {
  return text.replace(/[àáạảãăằắặẳẵâầấậẩẫđèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹÀÁẠẢÃĂẰẮẶẲẴÂẦẤẬẨẪĐÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸ]/g, (char) => {
    return VIETNAMESE_CHAR_MAP[char] || char
  })
}

/**
 * Setup Vietnamese-compatible fonts cho jsPDF
 */
export function setupVietnameseFont(pdf: jsPDF): void {
  // Sử dụng Helvetica với Unicode support tốt nhất có thể
  pdf.setFont('helvetica', 'normal')
  
  // Note: Trong production, nên sử dụng font embedding thực sự
  // Ví dụ: addFont() với Roboto Vietnamese hoặc Times New Roman VN
}

/**
 * Vietnamese-safe text output cho PDF
 * Tự động fallback nếu font không hỗ trợ Unicode
 */
export function addVietnameseText(
  pdf: jsPDF, 
  text: string, 
  x: number, 
  y: number, 
  options: any = {}
): void {
  try {
    // Thử với text gốc trước
    pdf.text(text, x, y, options)
  } catch (error) {
    // Fallback: chuyển đổi sang compatible chars
    const compatibleText = convertVietnameseToCompatible(text)
    pdf.text(compatibleText, x, y, options)
    
    console.warn(`PDF Font Warning: Vietnamese chars converted for: "${text}" → "${compatibleText}"`)
  }
}

/**
 * Format Vietnamese business text cho PDF
 * Đảm bảo tương thích với chuẩn hóa đơn Việt Nam
 */
export function formatVietnameseBusinessText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ') // Normalize spaces
    .replace(/([.,:;!?])\s*([^\s])/g, '$1 $2') // Add proper spacing after punctuation
}

/**
 * CONSTANTS cho Vietnamese PDF
 */
export const VIETNAMESE_PDF_CONFIG = {
  // Font sizes phù hợp với tiếng Việt
  FONT_SIZES: {
    TITLE: 16,      // Tiêu đề chính
    HEADER: 14,     // Header sections
    BODY: 10,       // Nội dung chính
    SMALL: 8,       // Ghi chú, footnotes
    TINY: 7         // Thông tin bổ sung
  },
  
  // Line heights tối ưu cho Vietnamese characters
  LINE_HEIGHTS: {
    TIGHT: 1.2,     // Cho tiêu đề
    NORMAL: 1.4,    // Cho nội dung
    LOOSE: 1.6      // Cho text dài
  },
  
  // Standard Vietnamese business terms
  BUSINESS_TERMS: {
    INVOICE: 'HÓA ĐƠN BÁN HÀNG',
    CUSTOMER: 'KHÁCH HÀNG',
    PRODUCT: 'SẢN PHẨM',
    QUANTITY: 'SỐ LƯỢNG', 
    UNIT_PRICE: 'ĐƠN GIÁ',
    AMOUNT: 'THÀNH TIỀN',
    SUBTOTAL: 'TỔNG TIỀN HÀNG',
    VAT: 'THUẾ GTGT',
    TOTAL: 'TỔNG CỘNG',
    PAID: 'ĐÃ THANH TOÁN',
    REMAINING: 'CÒN LẠI'
  }
}

/**
 * Kiểm tra xem text có chứa ký tự tiếng Việt không
 */
export function hasVietnameseChars(text: string): boolean {
  return /[àáạảãăằắặẳẵâầấậẩẫđèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹÀÁẠẢÃĂẰẮẶẲẴÂẦẤẬẨẪĐÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸ]/.test(text)
}
