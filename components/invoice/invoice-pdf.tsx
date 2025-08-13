import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font
} from '@react-pdf/renderer'
import type { InvoiceFullData } from '@/lib/types/invoice'
import { formatPrice, formatDate } from '@/lib/utils/invoice'

// Register fonts for Vietnamese support
Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2' },
    { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.woff2', fontWeight: 'bold' }
  ]
})

// Create styles for Vietnamese invoice format
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 20,
    fontFamily: 'Roboto',
    fontSize: 10,
    lineHeight: 1.4
  },
  header: {
    marginBottom: 20,
    borderBottom: 2,
    borderBottomColor: '#000000',
    paddingBottom: 10
  },
  companyInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  companyLeft: {
    flex: 1
  },
  companyRight: {
    flex: 1,
    alignItems: 'flex-end'
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 3,
    color: '#1a365d'
  },
  companyDetails: {
    fontSize: 9,
    marginBottom: 1,
    color: '#4a5568'
  },
  invoiceTitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 15,
    color: '#2d3748',
    textTransform: 'uppercase'
  },
  invoiceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    backgroundColor: '#f7fafc',
    padding: 10,
    borderRadius: 4
  },
  infoSection: {
    flex: 1
  },
  infoLabel: {
    fontSize: 8,
    color: '#718096',
    fontWeight: 'bold',
    marginBottom: 2
  },
  infoValue: {
    fontSize: 10,
    color: '#2d3748',
    marginBottom: 3
  },
  customerSection: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#edf2f7',
    borderRadius: 4
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#2b6cb0'
  },
  customerInfo: {
    flexDirection: 'row'
  },
  customerLeft: {
    flex: 1
  },
  customerRight: {
    flex: 1
  },
  table: {
    marginBottom: 20
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2b6cb0',
    color: 'white',
    fontWeight: 'bold',
    fontSize: 9,
    padding: 8,
    textAlign: 'center'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    padding: 6,
    minHeight: 25,
    alignItems: 'center'
  },
  tableRowAlt: {
    backgroundColor: '#f8fafc'
  },
  col1: { width: '8%', textAlign: 'center' },
  col2: { width: '35%', paddingLeft: 5 },
  col3: { width: '10%', textAlign: 'center' },
  col4: { width: '12%', textAlign: 'right', paddingRight: 5 },
  col5: { width: '12%', textAlign: 'right', paddingRight: 5 },
  col6: { width: '15%', textAlign: 'right', paddingRight: 5 },
  col7: { width: '8%', textAlign: 'right' },
  summary: {
    marginTop: 20,
    alignSelf: 'flex-end',
    width: '50%'
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 10
  },
  summaryLabel: {
    fontSize: 10,
    color: '#4a5568'
  },
  summaryValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2d3748'
  },
  totalRow: {
    borderTopWidth: 2,
    borderTopColor: '#2b6cb0',
    marginTop: 5,
    paddingTop: 8,
    backgroundColor: '#ebf8ff'
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2b6cb0'
  },
  totalValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a365d'
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    borderTop: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15
  },
  signatureSection: {
    width: '30%',
    textAlign: 'center'
  },
  signatureTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#4a5568'
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e0',
    marginTop: 40,
    marginBottom: 5
  },
  signatureName: {
    fontSize: 8,
    color: '#718096'
  },
  legalNote: {
    textAlign: 'center',
    fontSize: 8,
    color: '#718096',
    fontStyle: 'italic'
  },
  productCode: {
    fontSize: 8,
    color: '#718096',
    marginTop: 1
  }
})

interface InvoicePDFProps {
  invoiceData: InvoiceFullData
}

export const InvoicePDF: React.FC<InvoicePDFProps> = ({ invoiceData }) => {
  const { header, details, customer } = invoiceData

  // Calculate totals
  const subtotal = details.reduce((sum, item) => sum + item.line_total, 0)
  const totalDiscount = details.reduce((sum, item) => sum + (item.discount_amount || 0), 0)
  const vatAmount = (subtotal - totalDiscount) * (header.vat_rate / 100)
  const grandTotal = subtotal - totalDiscount + vatAmount
  const remainingAmount = grandTotal - header.customer_paid

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companyInfo}>
            <View style={styles.companyLeft}>
              <Text style={styles.companyName}>XUÂN THÙY VETERINARY PHARMACY</Text>
              <Text style={styles.companyDetails}>Địa chỉ: [Địa chỉ công ty]</Text>
              <Text style={styles.companyDetails}>Điện thoại: [Số điện thoại]</Text>
              <Text style={styles.companyDetails}>Email: [Email công ty]</Text>
              <Text style={styles.companyDetails}>Website: [Website công ty]</Text>
            </View>
            <View style={styles.companyRight}>
              <Text style={styles.companyDetails}>Mã số thuế: [MST]</Text>
              <Text style={styles.companyDetails}>Số ĐKKD: [Số ĐKKD]</Text>
              <Text style={styles.companyDetails}>Ngày cấp: [Ngày cấp]</Text>
              <Text style={styles.companyDetails}>Nơi cấp: [Nơi cấp]</Text>
            </View>
          </View>
        </View>

        {/* Invoice Title */}
        <Text style={styles.invoiceTitle}>HÓA ĐƠN BÁN HÀNG</Text>

        {/* Invoice Information */}
        <View style={styles.invoiceInfo}>
          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>SỐ HÓA ĐƠN:</Text>
            <Text style={styles.infoValue}>{header.invoice_code}</Text>
            <Text style={styles.infoLabel}>NGÀY LẬP:</Text>
            <Text style={styles.infoValue}>{formatDate(header.invoice_date)}</Text>
          </View>
          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>CHI NHÁNH:</Text>
            <Text style={styles.infoValue}>Chi nhánh {header.branch_id}</Text>
            <Text style={styles.infoLabel}>TRẠNG THÁI:</Text>
            <Text style={styles.infoValue}>{header.status}</Text>
          </View>
        </View>

        {/* Customer Information */}
        <View style={styles.customerSection}>
          <Text style={styles.sectionTitle}>THÔNG TIN KHÁCH HÀNG</Text>
          <View style={styles.customerInfo}>
            <View style={styles.customerLeft}>
              <Text style={styles.infoLabel}>Tên khách hàng:</Text>
              <Text style={styles.infoValue}>{customer?.customer_name || 'Khách lẻ'}</Text>
              <Text style={styles.infoLabel}>Mã khách hàng:</Text>
              <Text style={styles.infoValue}>{customer?.customer_code || 'N/A'}</Text>
            </View>
            <View style={styles.customerRight}>
              <Text style={styles.infoLabel}>Số điện thoại:</Text>
              <Text style={styles.infoValue}>{customer?.phone || 'N/A'}</Text>
              <Text style={styles.infoLabel}>Địa chỉ:</Text>
              <Text style={styles.infoValue}>{customer?.address || 'N/A'}</Text>
            </View>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={styles.col1}>STT</Text>
            <Text style={styles.col2}>TÊN HÀNG HÓA/DỊCH VỤ</Text>
            <Text style={styles.col3}>ĐVT</Text>
            <Text style={styles.col4}>SỐ LƯỢNG</Text>
            <Text style={styles.col5}>ĐƠN GIÁ</Text>
            <Text style={styles.col6}>THÀNH TIỀN</Text>
            <Text style={styles.col7}>GIẢM GIÁ</Text>
          </View>

          {/* Table Rows */}
          {details.map((item, index) => (
            <View 
              key={item.detail_id} 
              style={[styles.tableRow, ...(index % 2 === 1 ? [styles.tableRowAlt] : [])]}
            >
              <Text style={styles.col1}>{index + 1}</Text>
              <View style={styles.col2}>
                <Text>{item.product_name}</Text>
                {item.product_code && (
                  <Text style={styles.productCode}>Mã: {item.product_code}</Text>
                )}
              </View>
              <Text style={styles.col3}>{item.unit || 'Cái'}</Text>
              <Text style={styles.col4}>{item.quantity}</Text>
              <Text style={styles.col5}>{formatPrice(item.unit_price)}</Text>
              <Text style={styles.col6}>{formatPrice(item.line_total)}</Text>
              <Text style={styles.col7}>
                {item.discount_amount > 0 ? formatPrice(item.discount_amount) : '-'}
              </Text>
            </View>
          ))}
        </View>

        {/* Financial Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tạm tính:</Text>
            <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
          </View>
          
          {totalDiscount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tổng giảm giá:</Text>
              <Text style={styles.summaryValue}>-{formatPrice(totalDiscount)}</Text>
            </View>
          )}
          
          {header.vat_rate > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>VAT ({header.vat_rate}%):</Text>
              <Text style={styles.summaryValue}>{formatPrice(vatAmount)}</Text>
            </View>
          )}
          
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>TỔNG CỘNG:</Text>
            <Text style={styles.totalValue}>{formatPrice(grandTotal)}</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Đã thanh toán:</Text>
            <Text style={styles.summaryValue}>{formatPrice(header.customer_paid)}</Text>
          </View>
          
          {remainingAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Còn lại:</Text>
              <Text style={styles.summaryValue}>{formatPrice(remainingAmount)}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <View style={styles.signatureSection}>
              <Text style={styles.signatureTitle}>KHÁCH HÀNG</Text>
              <Text style={styles.signatureLine}></Text>
              <Text style={styles.signatureName}>(Ký và ghi rõ họ tên)</Text>
            </View>
            
            <View style={styles.signatureSection}>
              <Text style={styles.signatureTitle}>NGƯỜI BÁN HÀNG</Text>
              <Text style={styles.signatureLine}></Text>
              <Text style={styles.signatureName}>(Ký và ghi rõ họ tên)</Text>
            </View>
            
            <View style={styles.signatureSection}>
              <Text style={styles.signatureTitle}>THỦ TRƯỞNG ĐƠN VỊ</Text>
              <Text style={styles.signatureLine}></Text>
              <Text style={styles.signatureName}>(Ký và ghi rõ họ tên)</Text>
            </View>
          </View>
          
          <Text style={styles.legalNote}>
            Hóa đơn này được tạo tự động từ hệ thống quản lý Xuân Thùy Veterinary
          </Text>
        </View>
      </Page>
    </Document>
  )
}
