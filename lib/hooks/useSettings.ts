import { useState, useEffect, useCallback } from 'react'
import { settingsService, SystemSetting } from '@/lib/services/settings.service'

export function useSettings() {
  const [settings, setSettings] = useState<Record<string, SystemSetting[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const groupedSettings = await settingsService.getGroupedSettings()
      setSettings(groupedSettings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return {
    settings,
    loading,
    error,
    refetch: loadSettings
  }
}

export function useSetting(settingKey: string, branchId?: number) {
  const [value, setValue] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadValue = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const settingValue = await settingsService.getSettingValue(settingKey, branchId)
      setValue(settingValue)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load setting')
    } finally {
      setLoading(false)
    }
  }, [settingKey, branchId])

  const updateValue = useCallback(async (newValue: string) => {
    try {
      setError(null)
      const success = await settingsService.updateSetting(settingKey, newValue, branchId)
      if (success) {
        setValue(newValue)
      } else {
        throw new Error('Failed to update setting')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update setting')
      throw err
    }
  }, [settingKey, branchId])

  useEffect(() => {
    loadValue()
  }, [loadValue])

  return {
    value,
    loading,
    error,
    updateValue,
    refetch: loadValue
  }
}

export function useSettingsByCategory(category: string) {
  const [settings, setSettings] = useState<SystemSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const categorySettings = await settingsService.getSettingsByCategory(category)
      setSettings(categorySettings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load category settings')
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return {
    settings,
    loading,
    error,
    refetch: loadSettings
  }
}

// Hook for common business settings
export function useBusinessSettings() {
  const businessName = useSetting('business_name')
  const businessAddress = useSetting('business_address')
  const businessPhone = useSetting('business_phone')
  const businessEmail = useSetting('business_email')
  const taxNumber = useSetting('tax_number')

  return {
    businessName: businessName.value,
    businessAddress: businessAddress.value,
    businessPhone: businessPhone.value,
    businessEmail: businessEmail.value,
    taxNumber: taxNumber.value,
    loading: businessName.loading || businessAddress.loading || businessPhone.loading || businessEmail.loading || taxNumber.loading
  }
}

// Hook for financial settings
export function useFinancialSettings() {
  const currency = useSetting('default_currency')
  const currencySymbol = useSetting('currency_symbol')
  const vatRate = useSetting('vat_rate')
  const decimalPlaces = useSetting('currency_decimal_places')

  return {
    currency: currency.value,
    currencySymbol: currencySymbol.value,
    vatRate: parseFloat(vatRate.value || '0'),
    decimalPlaces: parseInt(decimalPlaces.value || '0'),
    loading: currency.loading || currencySymbol.loading || vatRate.loading || decimalPlaces.loading
  }
}

// Hook for inventory settings
export function useInventorySettings() {
  const lowStockThreshold = useSetting('low_stock_threshold')
  const expiryWarningDays = useSetting('expiry_warning_days')
  const autoReorderEnabled = useSetting('auto_reorder_enabled')
  const allowNegativeStock = useSetting('allow_negative_stock')

  return {
    lowStockThreshold: parseInt(lowStockThreshold.value || '10'),
    expiryWarningDays: parseInt(expiryWarningDays.value || '30'),
    autoReorderEnabled: autoReorderEnabled.value === 'true',
    allowNegativeStock: allowNegativeStock.value === 'true',
    loading: lowStockThreshold.loading || expiryWarningDays.loading || autoReorderEnabled.loading || allowNegativeStock.loading
  }
}

// Hook for UI settings
export function useUISettings() {
  const itemsPerPage = useSetting('items_per_page_default')
  const viewMode = useSetting('default_view_mode')
  const themeMode = useSetting('theme_mode')
  const compactMode = useSetting('compact_mode')

  return {
    itemsPerPage: parseInt(itemsPerPage.value || '20'),
    viewMode: viewMode.value || 'grid',
    themeMode: themeMode.value || 'light',
    compactMode: compactMode.value === 'true',
    loading: itemsPerPage.loading || viewMode.loading || themeMode.loading || compactMode.loading
  }
}
