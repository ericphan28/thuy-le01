'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface ResetPriceBookProps {
  priceBookId: number
  priceBookName: string
  onResetComplete?: () => void
}

export default function ResetPriceBook({ priceBookId, priceBookName, onResetComplete }: ResetPriceBookProps) {
  const [resetType, setResetType] = useState<string>('')
  const [isResetting, setIsResetting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string>('')

  const resetOptions = [
    {
      value: 'clear',
      name: 'Xóa sạch quy tắc',
      description: 'Xóa tất cả quy tắc giá, chỉ dùng giá niêm yết từ sản phẩm',
      color: 'bg-red-50 border-red-200 text-red-700',
      icon: '🧹'
    },
    {
      value: 'basic',
      name: 'Quy tắc cơ bản',
      description: 'Áp dụng quy tắc giảm giá theo số lượng cơ bản (5+ món: -5%, 10+ món: -10%)',
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      icon: '📋'
    },
    {
      value: 'pos_template',
      name: 'Template POS chuyên nghiệp',
      description: 'Bộ quy tắc được thiết kế đặc biệt cho bán hàng tại quầy POS',
      color: 'bg-green-50 border-green-200 text-green-700',
      icon: '🏪'
    }
  ]

  const handleReset = async () => {
    if (!resetType) {
      setError('Vui lòng chọn loại reset')
      return
    }

    setIsResetting(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/pricing/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceBookId,
          resetType
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Có lỗi xảy ra khi reset')
      }

      setResult(data)
      if (onResetComplete) {
        onResetComplete()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsResetting(false)
    }
  }

  const selectedOption = resetOptions.find(opt => opt.value === resetType)

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🔄 Reset bảng giá về mặc định
          <Badge variant="outline">{priceBookName}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Reset Type Selection */}
        <div className="space-y-4">
          <label className="text-sm font-medium">Chọn loại reset:</label>
          {resetOptions.map((option) => (
            <div 
              key={option.value}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                resetType === option.value 
                  ? option.color + ' border-current' 
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
              onClick={() => setResetType(option.value)}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{option.icon}</div>
                <div className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {option.name}
                    {resetType === option.value && (
                      <Badge className="bg-current text-white border-0">
                        ✓ Đã chọn
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {option.description}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Preview */}
        {selectedOption && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="font-medium text-amber-800 mb-2">
              🔍 Xem trước thay đổi:
            </div>
            <div className="text-sm text-amber-700">
              {selectedOption.value === 'clear' && (
                <>
                  • Xóa tất cả quy tắc giá hiện có<br/>
                  • Chỉ sử dụng giá niêm yết (sale_price) từ sản phẩm<br/>
                  • Phù hợp khi muốn bán theo giá gốc, không áp dụng khuyến mãi
                </>
              )}
              {selectedOption.value === 'basic' && (
                <>
                  • Xóa tất cả quy tắc hiện có<br/>
                  • Tạo 2 quy tắc giảm giá: 5+ món (-5%), 10+ món (-10%)<br/>
                  • Áp dụng cho tất cả sản phẩm<br/>
                  • Phù hợp cho shop nhỏ, khuyến khích mua nhiều
                </>
              )}
              {selectedOption.value === 'pos_template' && (
                <>
                  • Xóa tất cả quy tắc hiện có<br/>
                  • Tạo 3 quy tắc chuyên nghiệp: 3+ món (-3%), 7+ món (-7%), 15+ món (-5,000đ)<br/>
                  • Thiết kế đặc biệt cho bán hàng tại quầy<br/>
                  • Phù hợp cho cửa hàng có lượng khách đông
                </>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            ❌ {error}
          </div>
        )}

        {/* Success Display */}
        {result && result.success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
            <div className="font-medium mb-2">{result.message}</div>
            <div className="text-sm">
              • Loại reset: {result.details.resetType}<br/>
              • Quy tắc đã xóa: {result.details.rulesDeleted}<br/>
              • Quy tắc mới tạo: {result.details.rulesCreated}<br/>
            </div>
            {result.suggestion && (
              <div className="mt-2 text-sm font-medium">
                💡 {result.suggestion}
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="flex gap-2 pt-4 border-t">
          <Button 
            onClick={handleReset}
            disabled={!resetType || isResetting}
            variant={resetType === 'clear' ? 'destructive' : 'default'}
            className="flex-1"
          >
            {isResetting ? (
              <>🔄 Đang reset...</>
            ) : (
              <>🚀 Thực hiện reset</>
            )}
          </Button>
          
          {result && (
            <Button 
              variant="outline" 
              onClick={() => {
                setResult(null)
                setError('')
                setResetType('')
              }}
            >
              Reset lại form
            </Button>
          )}
        </div>

        {/* Warning */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-orange-700 text-sm">
          ⚠️ <strong>Cảnh báo:</strong> Thao tác này sẽ thay đổi hoặc xóa các quy tắc giá hiện tại. 
          Hãy đảm bảo bạn hiểu rõ tác động trước khi thực hiện.
        </div>
      </CardContent>
    </Card>
  )
}
