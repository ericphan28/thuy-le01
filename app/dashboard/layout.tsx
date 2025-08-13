import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { AuthWrapper } from '@/components/auth-wrapper'

export default function DashboardLayoutWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthWrapper requireAuth={true}>
      <DashboardLayout>{children}</DashboardLayout>
    </AuthWrapper>
  )
}
