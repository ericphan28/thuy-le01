import { createClient } from '@/lib/supabase/client'

export interface SystemSetting {
  setting_key: string
  setting_value: string
  setting_type: string
  category: string
  display_name: string
  description: string
  default_value: string
  validation_rules: Record<string, unknown>
  is_required: boolean
  is_system: boolean
  display_order: number
  is_active: boolean
}

export interface BranchSetting {
  branch_setting_id: number
  branch_id: number
  setting_key: string
  setting_value: string
  created_by: string
  created_at: string
  updated_at: string
}

export class SettingsService {
  private supabase = createClient()

  // Get all system settings
  async getSystemSettings(): Promise<SystemSetting[]> {
    const { data, error } = await this.supabase
      .from('system_settings')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true })

    if (error) throw error
    return data || []
  }

  // Get settings by category
  async getSettingsByCategory(category: string): Promise<SystemSetting[]> {
    const { data, error } = await this.supabase
      .from('system_settings')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) throw error
    return data || []
  }

  // Get single setting value
  async getSettingValue(settingKey: string, branchId?: number): Promise<string | null> {
    // Call stored function để get setting với branch fallback
    const { data, error } = await this.supabase
      .rpc('get_setting_value', {
        p_setting_key: settingKey,
        p_branch_id: branchId || null
      })

    if (error) throw error
    return data
  }

  // Update setting value
  async updateSetting(settingKey: string, value: string, branchId?: number, changedBy?: string): Promise<boolean> {
    // Call stored function để update với logging
    const { data, error } = await this.supabase
      .rpc('set_setting_value', {
        p_setting_key: settingKey,
        p_new_value: value,
        p_branch_id: branchId || null,
        p_changed_by: changedBy || 'system',
        p_change_reason: 'Updated via Settings UI'
      })

    if (error) throw error
    return data === true
  }

  // Batch update multiple settings
  async updateMultipleSettings(
    updates: Array<{ key: string; value: string; branchId?: number }>,
    changedBy?: string
  ): Promise<boolean> {
    try {
      for (const update of updates) {
        await this.updateSetting(update.key, update.value, update.branchId, changedBy)
      }
      return true
    } catch (error) {
      console.error('Error updating multiple settings:', error)
      return false
    }
  }

  // Get branch settings
  async getBranchSettings(branchId: number): Promise<BranchSetting[]> {
    const { data, error } = await this.supabase
      .from('branch_settings')
      .select('*')
      .eq('branch_id', branchId)
      .order('setting_key', { ascending: true })

    if (error) throw error
    return data || []
  }

  // Validate setting value
  async validateSettingValue(settingKey: string, value: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('validate_setting_value', {
        p_setting_key: settingKey,
        p_value: value
      })

    if (error) throw error
    return data === true
  }

  // Get settings change log
  async getSettingsChangeLog(limit: number = 50, settingKey?: string) {
    let query = this.supabase
      .from('settings_change_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (settingKey) {
      query = query.eq('setting_key', settingKey)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  // Reset setting to default value
  async resetToDefault(settingKey: string, branchId?: number): Promise<boolean> {
    // Get default value
    const { data: setting, error: settingError } = await this.supabase
      .from('system_settings')
      .select('default_value')
      .eq('setting_key', settingKey)
      .single()

    if (settingError) throw settingError

    // Update with default value
    return await this.updateSetting(settingKey, setting.default_value, branchId, 'system')
  }

  // Get grouped settings by category
  async getGroupedSettings(): Promise<Record<string, SystemSetting[]>> {
    const settings = await this.getSystemSettings()
    const grouped: Record<string, SystemSetting[]> = {}

    settings.forEach(setting => {
      if (!grouped[setting.category]) {
        grouped[setting.category] = []
      }
      grouped[setting.category].push(setting)
    })

    return grouped
  }
}

// Export singleton instance
export const settingsService = new SettingsService()

// Helper functions for common settings
export const getBusinessName = () => settingsService.getSettingValue('business_name')
export const getCurrency = () => settingsService.getSettingValue('default_currency')
export const getVATRate = () => settingsService.getSettingValue('vat_rate')
export const getLowStockThreshold = () => settingsService.getSettingValue('low_stock_threshold')
export const getItemsPerPage = () => settingsService.getSettingValue('items_per_page_default')

// Format currency value
export const formatCurrency = async (amount: number): Promise<string> => {
  const symbol = await settingsService.getSettingValue('currency_symbol') || '₫'
  const decimalPlaces = parseInt(await settingsService.getSettingValue('currency_decimal_places') || '0')
  
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).format(amount).replace('₫', symbol)
}
