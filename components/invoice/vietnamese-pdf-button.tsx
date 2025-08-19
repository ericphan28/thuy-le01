"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Download, Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface VietnamesePDFButtonProps {
  invoiceId: number
  invoiceCode: string
  className?: string
}

// Tạm thời vô hiệu hóa nút tải PDF tiếng Việt
export function VietnamesePDFButton({ 
  invoiceId, 
  invoiceCode, 
  className 
}: VietnamesePDFButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  const handleDownload = async () => {
    try {
      setIsGenerating(true)
      
      toast.loading('Đang tạo PDF tiếng Việt chuyên nghiệp...', {
        description: 'Vui lòng đợi trong giây lát'
      })

      const response = await fetch(`/api/invoices/${invoiceId}/pdf-vietnamese`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Lỗi tạo PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      // Create download link
      const link = document.createElement('a')
      link.href = url
      link.download = `HoaDon_Vietnamese_Professional_${invoiceCode}_${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Cleanup
      window.URL.revokeObjectURL(url)
      
      // Success state
      setIsCompleted(true)
      setTimeout(() => setIsCompleted(false), 2000)
      
      toast.dismiss()
      toast.success('PDF tiếng Việt đã được tạo thành công!', {
        description: 'File đã được tải xuống với font chuyên nghiệp',
        action: {
          label: 'Tuyệt vời!',
          onClick: () => {}
        }
      })

    } catch (error) {
      console.error('PDF download error:', error)
      toast.dismiss()
      toast.error('Lỗi tạo PDF tiếng Việt', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại sau',
        action: {
          label: 'Thử lại',
          onClick: () => handleDownload()
        }
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return null
}

// Add custom shine animation to globals.css or add it inline
const shineKeyframes = `
@keyframes shine {
  0% { transform: translateX(-100%) skewX(-12deg); }
  100% { transform: translateX(200%) skewX(-12deg); }
}
`
