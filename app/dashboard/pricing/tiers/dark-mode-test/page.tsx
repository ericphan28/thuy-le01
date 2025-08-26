import { Metadata } from 'next'
import { VolumeTiersDarkModeShowcase } from '@/components/pricing/volume-tiers-dark-mode-showcase'

export const metadata: Metadata = {
  title: 'Volume Tiers Dark Mode - Xuân Thùy',
  description: 'Test và showcase dark mode cho hệ thống bậc số lượng',
}

export default function VolumeTiersDarkModePage() {
  return <VolumeTiersDarkModeShowcase />
}
