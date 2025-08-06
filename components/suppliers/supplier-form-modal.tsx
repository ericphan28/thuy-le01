'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { 
  Building2, 
  User, 
  Phone, 
  CreditCard,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Supplier {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  tax_code?: string
  payment_terms?: number
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface SupplierFormData {
  supplier_code: string
  supplier_name: string
  contact_person: string
  phone: string
  email?: string
  address?: string
  tax_code?: string
  payment_terms: number
  notes?: string
  is_active: boolean
}

interface FormErrors {
  supplier_name?: string
  contact_person?: string
  phone?: string
  email?: string
  tax_code?: string
  supplier_code?: string
}

interface SupplierFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  supplier?: Supplier | null
  mode: 'create' | 'edit'
}

const PAYMENT_TERMS_OPTIONS = [
  { value: 0, label: 'Thanh toán ngay (0 ngày)' },
  { value: 7, label: 'Trong vòng 7 ngày' },
  { value: 15, label: 'Trong vòng 15 ngày' },
  { value: 30, label: 'Trong vòng 30 ngày' },
  { value: 45, label: 'Trong vòng 45 ngày' },
  { value: 60, label: 'Trong vòng 60 ngày' },
  { value: 90, label: 'Trong vòng 90 ngày' }
]

export function SupplierFormModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  supplier, 
  mode 
}: SupplierFormModalProps) {
  const [formData, setFormData] = useState<SupplierFormData>({
    supplier_code: '',
    supplier_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    tax_code: '',
    payment_terms: 30,
    notes: '',
    is_active: true
  })
  
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  
  const supabase = createClient()

  const generateSupplierCode = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('supplier_code')
        .like('supplier_code', 'NCC%')
        .order('supplier_code', { ascending: false })
        .limit(1)

      if (error) throw error

      let nextNumber = 1
      if (data && data.length > 0) {
        const lastCode = data[0].supplier_code
        const lastNumber = parseInt(lastCode.replace('NCC', ''))
        nextNumber = lastNumber + 1
      }

      const newCode = `NCC${nextNumber.toString().padStart(4, '0')}`
      setFormData(prev => ({ ...prev, supplier_code: newCode }))
    } catch (error) {
      console.error('Error generating supplier code:', error)
      setFormData(prev => ({ ...prev, supplier_code: 'NCC0001' }))
    }
  }, [supabase])

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && supplier) {
        setFormData({
          supplier_code: supplier.supplier_code,
          supplier_name: supplier.supplier_name,
          contact_person: supplier.contact_person || '',
          phone: supplier.phone || '',
          email: supplier.email || '',
          address: supplier.address || '',
          tax_code: supplier.tax_code || '',
          payment_terms: supplier.payment_terms || 30,
          notes: supplier.notes || '',
          is_active: supplier.is_active
        })
      } else {
        // Reset form for create mode
        setFormData({
          supplier_code: '',
          supplier_name: '',
          contact_person: '',
          phone: '',
          email: '',
          address: '',
          tax_code: '',
          payment_terms: 30,
          notes: '',
          is_active: true
        })
        
        // Auto-generate supplier code for new suppliers
        if (mode === 'create') {
          generateSupplierCode()
        }
      }
      setErrors({})
      setActiveTab('basic')
    }
  }, [isOpen, mode, supplier, generateSupplierCode])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Required fields validation
    if (!formData.supplier_name.trim()) {
      newErrors.supplier_name = 'Tên nhà cung cấp là bắt buộc'
    } else if (formData.supplier_name.length < 3) {
      newErrors.supplier_name = 'Tên nhà cung cấp phải có ít nhất 3 ký tự'
    }

    if (!formData.contact_person.trim()) {
      newErrors.contact_person = 'Người liên hệ là bắt buộc'
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Số điện thoại là bắt buộc'
    } else {
      // Vietnamese phone number validation
      const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/
      if (!phoneRegex.test(formData.phone.replace(/\s/g, ''))) {
        newErrors.phone = 'Số điện thoại không đúng định dạng (VD: 0901234567)'
      }
    }

    // Email validation (optional)
    if (formData.email && formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email)) {
        newErrors.email = 'Email không đúng định dạng'
      }
    }

    // Tax code validation (optional but format check if provided)
    if (formData.tax_code && formData.tax_code.trim()) {
      const taxCodeRegex = /^\d{10}$|^\d{13}$/
      if (!taxCodeRegex.test(formData.tax_code)) {
        newErrors.tax_code = 'Mã số thuế phải có 10 hoặc 13 chữ số'
      }
    }

    // Supplier code validation for create mode
    if (mode === 'create' && !formData.supplier_code.trim()) {
      newErrors.supplier_code = 'Mã nhà cung cấp là bắt buộc'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const checkDuplicates = async (): Promise<boolean> => {
    try {
      // Check duplicate supplier code (for create mode)
      if (mode === 'create') {
        const { data: codeCheck } = await supabase
          .from('suppliers')
          .select('supplier_id')
          .eq('supplier_code', formData.supplier_code)
          .single()

        if (codeCheck) {
          setErrors(prev => ({ ...prev, supplier_code: 'Mã nhà cung cấp đã tồn tại' }))
          return false
        }
      }

      // Check duplicate tax code (if provided)
      if (formData.tax_code && formData.tax_code.trim()) {
        const { data: taxCheck } = await supabase
          .from('suppliers')
          .select('supplier_id')
          .eq('tax_code', formData.tax_code)
          .not('supplier_id', 'eq', supplier?.supplier_id || 0)
          .single()

        if (taxCheck) {
          setErrors(prev => ({ ...prev, tax_code: 'Mã số thuế đã tồn tại' }))
          return false
        }
      }

      return true
    } catch {
      // If no duplicates found, single() will throw an error, which is what we want
      return true
    }
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Check for duplicates
      const noDuplicates = await checkDuplicates()
      if (!noDuplicates) {
        setIsSubmitting(false)
        return
      }

      // Prepare data for submission
      const submitData = {
        ...formData,
        phone: formData.phone.replace(/\s/g, ''), // Normalize phone number
        email: formData.email?.toLowerCase() || null,
        tax_code: formData.tax_code || null,
        address: formData.address || null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString()
      }

      if (mode === 'create') {
        const { error } = await supabase
          .from('suppliers')
          .insert([submitData])

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('suppliers')
          .update(submitData)
          .eq('supplier_id', supplier!.supplier_id)

        if (error) throw error
      }

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error saving supplier:', error)
      setErrors({ supplier_name: 'Có lỗi xảy ra khi lưu nhà cung cấp' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: keyof SupplierFormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            {mode === 'create' ? 'Thêm nhà cung cấp mới' : 'Chỉnh sửa nhà cung cấp'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic" className="text-xs sm:text-sm">
              <User className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Thông tin cơ bản</span>
              <span className="sm:hidden">Cơ bản</span>
            </TabsTrigger>
            <TabsTrigger value="contact" className="text-xs sm:text-sm">
              <Phone className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Liên hệ</span>
              <span className="sm:hidden">Liên hệ</span>
            </TabsTrigger>
            <TabsTrigger value="business" className="text-xs sm:text-sm">
              <CreditCard className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Kinh doanh</span>
              <span className="sm:hidden">KD</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplier_code">Mã nhà cung cấp *</Label>
                <Input
                  id="supplier_code"
                  value={formData.supplier_code}
                  onChange={(e) => handleInputChange('supplier_code', e.target.value)}
                  disabled={mode === 'edit'} // Cannot edit code
                  className={errors.supplier_code ? 'border-red-500' : ''}
                />
                {errors.supplier_code && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.supplier_code}
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => handleInputChange('is_active', checked)}
                />
                <Label htmlFor="is_active">Đang hoạt động</Label>
                <Badge variant={formData.is_active ? 'default' : 'secondary'} className="ml-2">
                  {formData.is_active ? 'Hoạt động' : 'Ngừng hoạt động'}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier_name">Tên nhà cung cấp *</Label>
              <Input
                id="supplier_name"
                value={formData.supplier_name}
                onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                placeholder="Nhập tên nhà cung cấp..."
                className={errors.supplier_name ? 'border-red-500' : ''}
              />
              {errors.supplier_name && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.supplier_name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_person">Người liên hệ *</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) => handleInputChange('contact_person', e.target.value)}
                placeholder="Nhập tên người liên hệ..."
                className={errors.contact_person ? 'border-red-500' : ''}
              />
              {errors.contact_person && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.contact_person}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="0901234567 hoặc +84901234567"
                className={errors.phone ? 'border-red-500' : ''}
              />
              {errors.phone && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.phone}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="email@domain.com"
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Địa chỉ</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Nhập địa chỉ đầy đủ..."
                rows={3}
              />
            </div>
          </TabsContent>

          <TabsContent value="business" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="tax_code">Mã số thuế</Label>
              <Input
                id="tax_code"
                value={formData.tax_code}
                onChange={(e) => handleInputChange('tax_code', e.target.value)}
                placeholder="10 hoặc 13 chữ số"
                className={errors.tax_code ? 'border-red-500' : ''}
              />
              {errors.tax_code && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.tax_code}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_terms">Thời hạn thanh toán</Label>
              <Select
                value={formData.payment_terms.toString()}
                onValueChange={(value) => handleInputChange('payment_terms', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Ghi chú</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Ghi chú về nhà cung cấp..."
                rows={4}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {mode === 'create' ? 'Đang thêm...' : 'Đang cập nhật...'}
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                {mode === 'create' ? 'Thêm nhà cung cấp' : 'Cập nhật'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
