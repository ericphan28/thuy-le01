// Test script để verify PDF generators
// Chạy: node test-pdf-generators.js

const testData = {
  header: {
    invoice_id: 764,
    invoice_code: "INV250810011",
    invoice_date: "2025-08-10",
    branch_id: 1,
    staff_name: "Admin",
    status: "completed"
  },
  details: [
    {
      product_id: 1,
      product_name: "Thuốc tiêm phòng cho heo",
      quantity: 2,
      unit_price: 150000,
      notes: "Liều lượng: 2ml/con"
    },
    {
      product_id: 2,
      product_name: "Vitamin tổng hợp cho gà",
      quantity: 5,
      unit_price: 80000,
      notes: "Pha với nước uống"
    }
  ],
  customer: {
    customer_id: 1,
    customer_code: "KH000001",
    customer_name: "Trang trại ABC",
    phone: "0907136029",
    email: "farm@example.com",
    address: "123 Đường XYZ, TP.HCM",
    current_debt: 0,
    debt_limit: 5000000
  }
}

console.log('🧪 Test data prepared for PDF generators:')
console.log('📋 Invoice:', testData.header.invoice_code)
console.log('📦 Products:', testData.details.length)
console.log('👤 Customer:', testData.customer.customer_name)
console.log('💰 Total Value:', testData.details.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0).toLocaleString('vi-VN'), 'VNĐ')

console.log('\n🎯 PDF Styles Available:')
console.log('1. 💼 Professional Business - /api/invoices/764/pdf-advanced?style=professional')
console.log('2. 📱 Modern QR Code - /api/invoices/764/pdf-advanced?style=modern-qr')
console.log('3. 🔒 Security Watermark - /api/invoices/764/pdf-advanced?style=secure')
console.log('4. 📊 Analytics Dashboard - /api/invoices/764/pdf-advanced?style=analytics')
console.log('5. ✨ Minimalist Premium - /api/invoices/764/pdf-advanced?style=minimalist')

console.log('\n🚀 Server ready at: http://localhost:3000')
console.log('📄 Test URL: http://localhost:3000/dashboard/invoices/764')

module.exports = testData
