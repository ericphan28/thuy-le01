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

  return (
    <Button
      onClick={handleDownload}
      disabled={isGenerating}
      className={`
        relative overflow-hidden group
        bg-gradient-to-r from-blue-600 to-blue-700 
        hover:from-blue-700 hover:to-blue-800
        border-0 text-white shadow-lg 
        transition-all duration-300 ease-in-out
        hover:shadow-xl hover:scale-105
        disabled:opacity-70 disabled:cursor-not-allowed
        ${className}
      `}
      size="lg"
    >
      {/* Background animation */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-500 opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
      
      {/* Content */}
      <div className="relative flex items-center gap-2.5">
        {isGenerating ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-semibold">Đang tạo PDF...</span>
          </>
        ) : isCompleted ? (
          <>
            <CheckCircle className="h-5 w-5 text-green-300" />
            <span className="font-semibold">Hoàn thành!</span>
          </>
        ) : (
          <>
            <div className="relative">
              <FileText className="h-5 w-5 transition-transform group-hover:scale-110" />
              <Download className="h-3 w-3 absolute -bottom-1 -right-1 text-blue-200" />
            </div>
            <span className="font-semibold">
              🇻🇳 Tải PDF Tiếng Việt
            </span>
          </>
        )}
      </div>

      {/* Shine effect */}
      <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-10 group-hover:animate-[shine_0.8s_ease-in-out] transition-opacity" />
    </Button>
  )
}

// Add custom shine animation to globals.css or add it inline
const shineKeyframes = `
@keyframes shine {
  0% { transform: translateX(-100%) skewX(-12deg); }
  100% { transform: translateX(200%) skewX(-12deg); }
}
`
