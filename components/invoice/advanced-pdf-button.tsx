"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  FileText, 
  QrCode, 
  Shield, 
  BarChart3, 
  Minimize2,
  ChevronDown,
  Sparkles
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

interface AdvancedPDFButtonProps {
  invoiceId: number
  invoiceCode: string
  className?: string
}

interface PDFStyle {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  features: string[]
  color: string
  premium?: boolean
}

const pdfStyles: PDFStyle[] = [
  {
    id: 'professional',
    name: '💼 Professional Business',
    description: 'Thiết kế doanh nghiệp chuyên nghiệp với gradient và typography hiện đại',
    icon: <FileText className="h-4 w-4" />,
    features: ['Gradient Headers', 'Business Colors', 'Professional Typography', 'Modern Layout'],
    color: 'bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300',
  },
  {
    id: 'vietnamese-safe',
    name: '🛡️ Vietnamese SAFE',
    description: 'PDF tiếng Việt an toàn 100% với TELEX notation - Không bao giờ lỗi font',
    icon: <Shield className="h-4 w-4" />,
    features: ['TELEX Safe Encoding', '100% Compatibility', 'Times Font', 'Enterprise Grade'],
    color: 'bg-emerald-50 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300',
    premium: true
  },
  {
    id: 'vietnamese-enterprise',
    name: '🇻🇳 Vietnamese Enterprise',
    description: 'PDF tiếng Việt Enterprise với Unicode support và font chuyên nghiệp',
    icon: <FileText className="h-4 w-4" />,
    features: ['Vietnamese Unicode', 'Enterprise Format', 'UTF-8 Support', 'Business Standard'],
    color: 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300',
    premium: true
  },
  {
    id: 'modern-qr',
    name: '📱 Modern QR Code',
    description: 'PDF hiện đại với QR code và các yếu tố digital tiên tiến',
    icon: <QrCode className="h-4 w-4" />,
    features: ['QR Code Verification', 'Digital Elements', 'Smart Design', 'Mobile Ready'],
    color: 'bg-cyan-50 dark:bg-cyan-900 border-cyan-200 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300',
    premium: true
  },
  {
    id: 'secure',
    name: '🔒 Security Watermark',
    description: 'PDF bảo mật với watermark và các tính năng chống giả mạo',
    icon: <Shield className="h-4 w-4" />,
    features: ['Security Watermark', 'Anti-Fraud Pattern', 'Digital Hash', 'Protection Level'],
    color: 'bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300',
    premium: true
  },
  {
    id: 'analytics',
    name: '📊 Analytics Dashboard',
    description: 'PDF với biểu đồ phân tích và dashboard business intelligence',
    icon: <BarChart3 className="h-4 w-4" />,
    features: ['Data Analytics', 'Visual Charts', 'KPI Dashboard', 'Business Intelligence'],
    color: 'bg-purple-50 dark:bg-purple-900 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300',
    premium: true
  },
  {
    id: 'minimalist',
    name: '✨ Minimalist Premium',
    description: 'Thiết kế tối giản cao cấp với typography thanh lịch',
    icon: <Minimize2 className="h-4 w-4" />,
    features: ['Clean Design', 'Premium Typography', 'Elegant Layout', 'Subtle Colors'],
    color: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300',
    premium: true
  }
]

export function AdvancedPDFButton({ invoiceId, invoiceCode, className }: AdvancedPDFButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<string>('')

  const handlePDFGeneration = async (style: PDFStyle) => {
    try {
      setIsLoading(true)
      setSelectedStyle(style.id)
      
      toast.info(`🔄 Đang tạo ${style.name}: ${style.description}...`)
      
      // Call advanced PDF API with style parameter
      const response = await fetch(`/api/invoices/${invoiceId}/pdf-advanced?style=${style.id}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/pdf',
          'Accept-Language': 'vi-VN',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      
      // Create download URL
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Get style name for filename
      const styleName = style.name.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_')
      const dateStr = new Date().toISOString().split('T')[0]
      link.download = `HoaDon_${styleName}_${invoiceCode}_${dateStr}.pdf`
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      // Success toast with style-specific message
      toast.success(`✅ ${style.name} Hoàn thành! Đã tải thành công hóa đơn ${invoiceCode} với ${style.features.length} tính năng cao cấp`)

    } catch (error) {
      console.error('Lỗi tạo PDF advanced:', error)
      toast.error(`❌ Lỗi tạo ${style.name}: ${error instanceof Error ? error.message : 'Vui lòng thử lại.'}`)
    } finally {
      setIsLoading(false)
      setSelectedStyle('')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={isLoading}
          className={`bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900 dark:to-purple-900 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:from-blue-100 hover:to-purple-100 dark:hover:from-blue-800 dark:hover:to-purple-800 ${className}`}
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
              Đang tạo PDF...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              PDF Cao Cấp
              <ChevronDown className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          Chọn Kiểu PDF Chuyên Nghiệp
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {pdfStyles.map((style) => (
          <DropdownMenuItem
            key={style.id}
            onClick={() => handlePDFGeneration(style)}
            disabled={isLoading}
            className="flex flex-col items-start gap-2 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-2 w-full">
              <div className={`p-2 rounded-md ${style.color.split(' ')[0]} ${style.color.split(' ')[1]}`}>
                {style.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{style.name}</span>
                  {style.premium && (
                    <span className="text-xs bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-2 py-1 rounded-full">
                      PREMIUM
                    </span>
                  )}
                  {selectedStyle === style.id && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                  )}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {style.description}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-1 w-full">
              {style.features.map((feature, index) => (
                <span
                  key={index}
                  className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded"
                >
                  {feature}
                </span>
              ))}
            </div>
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        <div className="p-2 text-xs text-gray-500 dark:text-gray-400">
          💡 Mỗi kiểu PDF có những tính năng và thiết kế độc đáo riêng
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
