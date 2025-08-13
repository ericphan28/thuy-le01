/**
 * Format number as Vietnamese currency
 */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

/**
 * Format number with Vietnamese locale (no currency symbol)
 */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount)
}

/**
 * Format compact currency (e.g., 2.5M, 1.2K)
 */
export function formatCompactVND(amount: number): string {
  if (amount >= 1000000000) {
    return `₫${(amount / 1000000000).toFixed(1)}B`
  } else if (amount >= 1000000) {
    return `₫${(amount / 1000000).toFixed(1)}M`
  } else if (amount >= 1000) {
    return `₫${(amount / 1000).toFixed(1)}K`
  } else {
    return `₫${amount.toLocaleString('vi-VN')}`
  }
}

/**
 * Format growth percentage
 */
export function formatGrowth(percentage: number): string {
  const sign = percentage >= 0 ? '+' : ''
  return `${sign}${percentage.toFixed(1)}%`
}
