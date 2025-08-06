'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '@/components/ui/select'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, UserCheck, Building, CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface VeterinaryCustomer {
  customer_id: number
  customer_code: string
  customer_name: string
  customer_type_id: number | null
  branch_created_id: number | null
  phone: string | null
  email: string | null
  address: string | null
  company_name: string | null
  tax_code: string | null
  id_number: string | null
  gender: string | null
  debt_limit: number
  current_debt: number
  total_revenue: number
  total_profit: number
  purchase_count: number
  last_purchase_date: string | null
  status: number
  notes: string | null
  created_by: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface CustomerType {
  type_id: number
  type_code: string
  type_name: string
  description: string | null
  is_active: boolean
}

interface CustomerFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  customer?: VeterinaryCustomer | null
  mode: 'create' | 'edit'
}

interface FormData {
  customer_name: string
  customer_type_id: number | null
  phone: string
  email: string
  address: string
  company_name: string
  tax_code: string
  id_number: string
  gender: string
  debt_limit: number
  notes: string
}

const validateVietnamesePhone = (phone: string): boolean => {
  console.log('📞 Validating phone:', phone)
  if (!phone || phone.trim() === '') {
    console.log('📞 Phone is empty, validation passed')
    return true // Empty phone is valid
  }
  
  const phoneRegex = /^(\+84|84|0)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-9]|9[0-9])[0-9]{7}$/
  const isValid = phoneRegex.test(phone.trim())
  console.log('📞 Phone validation result:', { phone: phone.trim(), isValid })
  return isValid
}

const validateTaxCode = (taxCode: string): boolean => {
  console.log('🏢 Validating tax code:', taxCode)
  if (!taxCode || taxCode.trim() === '') {
    console.log('🏢 Tax code is empty, validation passed')
    return true // Optional field
  }
  
  const taxRegex = /^\d{10}(-\d{3})?$/
  const isValid = taxRegex.test(taxCode.trim())
  console.log('🏢 Tax code validation result:', { taxCode: taxCode.trim(), isValid })
  return isValid
}

const generateCustomerCode = async (supabase: ReturnType<typeof createClient>): Promise<string> => {
  const { data } = await supabase
    .from('customers')
    .select('customer_code')
    .order('customer_id', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) {
    return 'KH0001'
  }

  const lastCode = data[0].customer_code
  const match = lastCode.match(/^KH(\d+)$/)
  
  if (match) {
    const nextNumber = parseInt(match[1]) + 1
    return `KH${nextNumber.toString().padStart(4, '0')}`
  }
  
  return 'KH0001'
}

export function CustomerFormModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  customer, 
  mode 
}: CustomerFormModalProps) {
  console.log('🔄 CustomerFormModal render:', { isOpen, mode, customer: customer?.customer_name })
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
  const [activeTab, setActiveTab] = useState<string>('basic')
  const [formData, setFormData] = useState<FormData>({
    customer_name: '',
    customer_type_id: null,
    phone: '',
    email: '',
    address: '',
    company_name: '',
    tax_code: '',
    id_number: '',
    gender: '',
    debt_limit: 0,
    notes: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const supabase = createClient()

  // Load customer types
  const loadCustomerTypes = useCallback(async () => {
    const { data } = await supabase
      .from('customer_types')
      .select('*')
      .eq('is_active', true)
      .order('type_name')
    
    if (data) {
      setCustomerTypes(data)
    }
  }, [supabase])

  // Initialize form data
  useEffect(() => {
    console.log('🔄 useEffect triggered:', { isOpen, mode, customer: customer?.customer_name })
    
    if (isOpen) {
      console.log('📂 Modal is open, loading customer types...')
      setActiveTab('basic') // Reset to first tab when opening modal
      loadCustomerTypes()
      
      if (mode === 'edit' && customer) {
        console.log('✏️ Edit mode - Loading customer data:', customer.customer_name)
        const editFormData = {
          customer_name: customer.customer_name || '',
          customer_type_id: customer.customer_type_id,
          phone: customer.phone || '',
          email: customer.email || '',
          address: customer.address || '',
          company_name: customer.company_name || '',
          tax_code: customer.tax_code || '',
          id_number: customer.id_number || '',
          gender: customer.gender || '',
          debt_limit: customer.debt_limit || 0,
          notes: customer.notes || ''
        }
        console.log('✏️ Setting edit form data:', editFormData)
        setFormData(editFormData)
      } else {
        console.log('➕ Create mode - Resetting form data')
        const createFormData = {
          customer_name: '',
          customer_type_id: null,
          phone: '',
          email: '',
          address: '',
          company_name: '',
          tax_code: '',
          id_number: '',
          gender: '',
          debt_limit: 0,
          notes: ''
        }
        console.log('➕ Setting create form data:', createFormData)
        setFormData(createFormData)
      }
      setErrors({})
    } else {
      console.log('📂 Modal is closed, keeping current state')
    }
  }, [isOpen, mode, customer, loadCustomerTypes])

  const validateForm = (): boolean => {
    console.log('🔍 Starting form validation with data:', formData)
    const newErrors: Record<string, string> = {}

    if (!formData.customer_name.trim()) {
      console.log('❌ Customer name validation failed:', formData.customer_name)
      newErrors.customer_name = 'Tên khách hàng là bắt buộc'
    } else {
      console.log('✅ Customer name validation passed')
    }

    if (formData.phone && !validateVietnamesePhone(formData.phone)) {
      console.log('❌ Phone validation failed:', formData.phone)
      newErrors.phone = 'Số điện thoại không hợp lệ (VD: 0903123456)'
    } else {
      console.log('✅ Phone validation passed or empty')
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      console.log('❌ Email validation failed:', formData.email)
      newErrors.email = 'Email không hợp lệ'
    } else {
      console.log('✅ Email validation passed or empty')
    }

    if (formData.tax_code && !validateTaxCode(formData.tax_code)) {
      console.log('❌ Tax code validation failed:', formData.tax_code)
      newErrors.tax_code = 'Mã số thuế không hợp lệ (VD: 0123456789 hoặc 0123456789-001)'
    } else {
      console.log('✅ Tax code validation passed or empty')
    }

    if (formData.debt_limit < 0) {
      console.log('❌ Debt limit validation failed:', formData.debt_limit)
      newErrors.debt_limit = 'Hạn mức công nợ không được âm'
    } else {
      console.log('✅ Debt limit validation passed')
    }

    console.log('🔍 Validation errors found:', newErrors)
    setErrors(newErrors)
    
    const isValid = Object.keys(newErrors).length === 0
    console.log('🔍 Form validation result:', isValid)
    return isValid
  }

  const handleSubmit = async () => {
    console.log('💾 handleSubmit called - Starting form submission')
    console.log('📋 Current form data:', formData)
    
    if (!validateForm()) {
      console.log('❌ Form validation failed')
      
      // Show specific error message about which tabs have errors
      const errorTabs: string[] = []
      if (errors.customer_name || errors.phone || errors.email || errors.gender || errors.id_number || errors.address) {
        errorTabs.push('Thông tin cơ bản')
      }
      if (errors.company_name || errors.tax_code) {
        errorTabs.push('Thông tin doanh nghiệp')
      }
      if (errors.debt_limit || errors.notes) {
        errorTabs.push('Thông tin tài chính')
      }
      
      setErrors(prev => ({
        ...prev,
        submit: `Vui lòng kiểm tra và sửa lỗi trong các tab: ${errorTabs.join(', ')}`
      }))
      return
    }

    console.log('✅ Form validation passed, proceeding with submit')
    setIsSubmitting(true)
    try {
      let result

      if (mode === 'create') {
        console.log('➕ Creating new customer...')
        const customerCode = await generateCustomerCode(supabase)
        console.log('🔢 Generated customer code:', customerCode)
        
        const insertData = {
          customer_code: customerCode,
          customer_name: formData.customer_name.trim(),
          customer_type_id: formData.customer_type_id,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          address: formData.address.trim() || null,
          company_name: formData.company_name.trim() || null,
          tax_code: formData.tax_code.trim() || null,
          id_number: formData.id_number.trim() || null,
          gender: formData.gender || null,
          debt_limit: formData.debt_limit,
          notes: formData.notes.trim() || null,
          created_by: 'SYSTEM',
          is_active: true
        }
        
        console.log('📤 Sending insert data:', insertData)
        
        result = await supabase
          .from('customers')
          .insert([insertData])
      } else {
        console.log('✏️ Updating existing customer:', customer?.customer_id)
        
        const updateData = {
          customer_name: formData.customer_name.trim(),
          customer_type_id: formData.customer_type_id,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          address: formData.address.trim() || null,
          company_name: formData.company_name.trim() || null,
          tax_code: formData.tax_code.trim() || null,
          id_number: formData.id_number.trim() || null,
          gender: formData.gender || null,
          debt_limit: formData.debt_limit,
          notes: formData.notes.trim() || null,
          updated_at: new Date().toISOString()
        }
        
        console.log('📤 Sending update data:', updateData)
        
        result = await supabase
          .from('customers')
          .update(updateData)
          .eq('customer_id', customer?.customer_id)
      }

      console.log('📨 Database response:', result)

      if (result.error) {
        console.error('❌ Database error:', result.error)
        setErrors({ submit: 'Có lỗi xảy ra khi lưu dữ liệu' })
        return
      }

      console.log('✅ Customer saved successfully!')
      onSuccess()
      onClose()
    } catch (error) {
      console.error('💥 Error saving customer:', error)
      setErrors({ submit: 'Có lỗi xảy ra khi lưu dữ liệu' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const goToFirstErrorTab = () => {
    if (errors.customer_name || errors.phone || errors.email || errors.gender || errors.id_number || errors.address) {
      setActiveTab('basic')
    } else if (errors.company_name || errors.tax_code) {
      setActiveTab('company')
    } else if (errors.debt_limit || errors.notes) {
      setActiveTab('financial')
    }
  }

  const handleInputChange = (field: keyof FormData, value: string | number | null) => {
    console.log('📝 Form input change:', { field, value })
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      console.log('🔄 Dialog onOpenChange:', { open, currentIsOpen: isOpen })
      if (!open) {
        onClose()
      }
    }}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            {mode === 'create' ? 'Thêm khách hàng mới' : 'Chỉnh sửa khách hàng'}
          </DialogTitle>
        </DialogHeader>

        {/* Error Summary - Show total errors */}
        {Object.keys(errors).filter(key => key !== 'submit').length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-red-500 text-white text-sm rounded-full h-6 w-6 flex items-center justify-center font-bold">
                  {Object.keys(errors).filter(key => key !== 'submit').length}
                </div>
                <p className="text-sm text-red-600 font-medium">
                  Có {Object.keys(errors).filter(key => key !== 'submit').length} lỗi cần khắc phục trước khi lưu
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToFirstErrorTab}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                Đi đến lỗi đầu tiên
              </Button>
            </div>
            <div className="mt-2 text-xs text-red-500">
              Kiểm tra các tab có số đỏ để xem chi tiết lỗi
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              <span>Thông tin cơ bản</span>
              {/* Error count for basic tab */}
              {(errors.customer_name || errors.phone || errors.email || errors.gender || errors.id_number || errors.address) && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {[errors.customer_name, errors.phone, errors.email, errors.gender, errors.id_number, errors.address].filter(Boolean).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="company" className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              <span>Thông tin doanh nghiệp</span>
              {/* Error count for company tab */}
              {(errors.company_name || errors.tax_code) && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {[errors.company_name, errors.tax_code].filter(Boolean).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="financial" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span>Thông tin tài chính</span>
              {/* Error count for financial tab */}
              {(errors.debt_limit || errors.notes) && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {[errors.debt_limit, errors.notes].filter(Boolean).length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer_name">
                  Tên khách hàng <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="customer_name"
                  value={formData.customer_name}
                  onChange={(e) => handleInputChange('customer_name', e.target.value)}
                  placeholder="Nhập tên khách hàng"
                  className={errors.customer_name ? 'border-red-500' : ''}
                />
                {errors.customer_name && (
                  <p className="text-sm text-red-500">{errors.customer_name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer_type">Loại khách hàng</Label>
                <Select
                  value={formData.customer_type_id?.toString() || ''}
                  onValueChange={(value) => handleInputChange('customer_type_id', parseInt(value) || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn loại khách hàng" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map((type) => (
                      <SelectItem key={type.type_id} value={type.type_id.toString()}>
                        {type.type_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="VD: 0903123456"
                  className={errors.phone ? 'border-red-500' : ''}
                />
                {errors.phone && (
                  <p className="text-sm text-red-500">{errors.phone}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="example@email.com"
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Giới tính</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => handleInputChange('gender', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn giới tính" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nam">Nam</SelectItem>
                    <SelectItem value="Nữ">Nữ</SelectItem>
                    <SelectItem value="Khác">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="id_number">CMND/CCCD</Label>
                <Input
                  id="id_number"
                  value={formData.id_number}
                  onChange={(e) => handleInputChange('id_number', e.target.value)}
                  placeholder="Số CMND/CCCD"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Địa chỉ</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Nhập địa chỉ đầy đủ"
                rows={3}
              />
            </div>
          </TabsContent>

          <TabsContent value="company" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Tên công ty</Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => handleInputChange('company_name', e.target.value)}
                  placeholder="Tên công ty (nếu có)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax_code">Mã số thuế</Label>
                <Input
                  id="tax_code"
                  value={formData.tax_code}
                  onChange={(e) => handleInputChange('tax_code', e.target.value)}
                  placeholder="VD: 0123456789 hoặc 0123456789-001"
                  className={errors.tax_code ? 'border-red-500' : ''}
                />
                {errors.tax_code && (
                  <p className="text-sm text-red-500">{errors.tax_code}</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="financial" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="debt_limit">Hạn mức công nợ (VND)</Label>
                <Input
                  id="debt_limit"
                  type="number"
                  min="0"
                  value={formData.debt_limit}
                  onChange={(e) => handleInputChange('debt_limit', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className={errors.debt_limit ? 'border-red-500' : ''}
                />
                {errors.debt_limit && (
                  <p className="text-sm text-red-500">{errors.debt_limit}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Ghi chú</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Ghi chú thêm về khách hàng"
                rows={4}
              />
            </div>
          </TabsContent>
        </Tabs>

        {errors.submit && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{errors.submit}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? 'Đang lưu...' : (mode === 'create' ? 'Thêm khách hàng' : 'Cập nhật')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
