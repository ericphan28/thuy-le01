'use client'

import { useState, useEffect } from 'react'
import { settingsService, SystemSetting } from '@/lib/services/settings.service'
import { useSettings } from '@/lib/hooks/useSettings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Settings, 
  Building2,
  DollarSign,
  Package,
  Users,
  Receipt,
  Monitor,
  Activity,
  Bell,
  Shield,
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'
import { motion } from 'framer-motion'

// Categories mapping với icons
const SETTING_CATEGORIES = {
  business: { 
    name: 'Thông Tin Doanh Nghiệp', 
    icon: Building2, 
    color: 'bg-blue-500',
    description: 'Cấu hình thông tin cơ bản của doanh nghiệp'
  },
  financial: { 
    name: 'Tài Chính', 
    icon: DollarSign, 
    color: 'bg-green-500',
    description: 'Thiết lập các thông số tài chính và tiền tệ'
  },
  inventory: { 
    name: 'Kho Hàng', 
    icon: Package, 
    color: 'bg-orange-500',
    description: 'Quản lý tồn kho và cảnh báo hàng hóa'
  },
  customer: { 
    name: 'Khách Hàng', 
    icon: Users, 
    color: 'bg-purple-500',
    description: 'Cài đặt liên quan đến quản lý khách hàng'
  },
  invoice: { 
    name: 'Hóa Đơn', 
    icon: Receipt, 
    color: 'bg-indigo-500',
    description: 'Thiết lập format và quy trình hóa đơn'
  },
  ui: { 
    name: 'Giao Diện', 
    icon: Monitor, 
    color: 'bg-pink-500',
    description: 'Tùy chỉnh giao diện người dùng'
  },
  veterinary: { 
    name: 'Thú Y', 
    icon: Activity, 
    color: 'bg-red-500',
    description: 'Cài đặt chuyên biệt cho nghiệp vụ thú y'
  },
  notification: { 
    name: 'Thông Báo', 
    icon: Bell, 
    color: 'bg-yellow-500',
    description: 'Quản lý thông báo và cảnh báo'
  },
  security: { 
    name: 'Bảo Mật', 
    icon: Shield, 
    color: 'bg-gray-500',
    description: 'Cấu hình bảo mật và sao lưu dữ liệu'
  }
}

export default function SettingsPage() {
  const { settings, loading, refetch } = useSettings()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('business')
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form data when settings load
  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      const initialFormData: Record<string, string> = {}
      Object.values(settings).flat().forEach(setting => {
        initialFormData[setting.setting_key] = setting.setting_value || setting.default_value || ''
      })
      setFormData(initialFormData)
    }
  }, [settings])

  // Save settings using service
  const saveSettings = async () => {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      // Prepare updates
      const updates = Object.entries(formData).map(([key, value]) => ({
        key,
        value
      }))

      // Use service to update multiple settings
      const success = await settingsService.updateMultipleSettings(updates, 'admin')
      
      if (success) {
        setSuccess('Cài đặt đã được lưu thành công!')
        setHasChanges(false)
        await refetch() // Refresh settings
      } else {
        throw new Error('Failed to save settings')
      }
      
    } catch (err) {
      console.error('Error saving settings:', err)
      setError(err instanceof Error ? err.message : 'Không thể lưu cài đặt')
    } finally {
      setSaving(false)
    }
  }

  // Handle form change
  const handleInputChange = (settingKey: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [settingKey]: value
    }))
    setHasChanges(true)
  }

  // Reset form
  const resetForm = () => {
    const initialFormData: Record<string, string> = {}
    Object.values(settings).flat().forEach(setting => {
      initialFormData[setting.setting_key] = setting.setting_value || setting.default_value || ''
    })
    setFormData(initialFormData)
    setHasChanges(false)
  }

  // Render setting input based on type
  const renderSettingInput = (setting: SystemSetting) => {
    const value = formData[setting.setting_key] || ''
    
    switch (setting.setting_type) {
      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={setting.setting_key}
              checked={value === 'true'}
              onCheckedChange={(checked) => 
                handleInputChange(setting.setting_key, checked ? 'true' : 'false')
              }
            />
            <Label 
              htmlFor={setting.setting_key}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {setting.display_name}
            </Label>
          </div>
        )
      
      case 'number':
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.setting_key}>{setting.display_name}</Label>
            <Input
              id={setting.setting_key}
              type="number"
              value={value}
              onChange={(e) => handleInputChange(setting.setting_key, e.target.value)}
              placeholder={setting.description}
              className="w-full"
            />
          </div>
        )
      
      case 'select':
        const validationRules = setting.validation_rules as { options?: string[] }
        const options = validationRules?.options || []
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.setting_key}>{setting.display_name}</Label>
            <select
              id={setting.setting_key}
              value={value}
              onChange={(e) => handleInputChange(setting.setting_key, e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {options.map((option: string) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        )
      
      case 'text':
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.setting_key}>{setting.display_name}</Label>
            <textarea
              id={setting.setting_key}
              value={value}
              onChange={(e) => handleInputChange(setting.setting_key, e.target.value)}
              placeholder={setting.description}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        )
      
      default: // string, email
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.setting_key}>{setting.display_name}</Label>
            <Input
              id={setting.setting_key}
              type={setting.setting_type === 'email' ? 'email' : 'text'}
              value={value}
              onChange={(e) => handleInputChange(setting.setting_key, e.target.value)}
              placeholder={setting.description}
              className="w-full"
            />
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Cài Đặt Hệ Thống</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="w-24 h-4 bg-muted animate-pulse rounded" />
                <div className="w-8 h-8 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="w-16 h-6 bg-muted animate-pulse rounded mb-2" />
                <div className="w-full h-4 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Cài Đặt Hệ Thống
          </h2>
          <p className="text-muted-foreground">
            Quản lý và tùy chỉnh các thiết lập cho hệ thống quản lý thú y
          </p>
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center space-x-2">
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center space-x-2"
            >
              <Button
                variant="outline"
                onClick={resetForm}
                disabled={saving}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Hoàn Tác
              </Button>
              <Button
                onClick={saveSettings}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Đang Lưu...' : 'Lưu Cài Đặt'}
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center p-4">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-3" />
              <p className="text-red-800">{error}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-green-200 bg-green-50">
            <CardContent className="flex items-center p-4">
              <CheckCircle className="h-5 w-5 text-green-600 mr-3" />
              <p className="text-green-800">{success}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(SETTING_CATEGORIES).map(([key, category]) => {
          const categorySettings = settings[key] || []
          const IconComponent = category.icon
          
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card 
                className={`cursor-pointer transition-all hover:shadow-md ${
                  activeTab === key ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setActiveTab(key)}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {category.name}
                  </CardTitle>
                  <div className={`p-2 rounded-full ${category.color} text-white`}>
                    <IconComponent className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{categorySettings.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {category.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9">
          {Object.entries(SETTING_CATEGORIES).map(([key, category]) => (
            <TabsTrigger key={key} value={key} className="text-xs">
              {category.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(SETTING_CATEGORIES).map(([categoryKey, category]) => (
          <TabsContent key={categoryKey} value={categoryKey} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className={`p-2 rounded-full ${category.color} text-white`}>
                    <category.icon className="h-5 w-5" />
                  </div>
                  {category.name}
                </CardTitle>
                <p className="text-muted-foreground">{category.description}</p>
              </CardHeader>
            </Card>

            <div className="grid gap-6">
              {(settings[categoryKey] || []).map((setting) => (
                <motion.div
                  key={setting.setting_key}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Card>
                    <CardContent className="pt-6">
                      {renderSettingInput(setting)}
                      {setting.description && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {setting.description}
                        </p>
                      )}
                      {setting.is_required && (
                        <Badge variant="destructive" className="mt-2">
                          Bắt buộc
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
