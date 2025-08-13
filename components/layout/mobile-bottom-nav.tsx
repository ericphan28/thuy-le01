"use client"

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Home, 
  ShoppingCart, 
  FileText, 
  Users, 
  Plus,
  Package,
  Search,
  UserPlus,
  BarChart3
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mainNavItems = [
  {
    href: '/dashboard',
    label: 'Trang Chủ',
    icon: Home
  },
  {
    href: '/dashboard/pos',
    label: 'Bán Hàng',
    icon: ShoppingCart,
    badge: 'HOT'
  },
  {
    href: '/dashboard/invoices',
    label: 'Hóa Đơn',
    icon: FileText
  },
  {
    href: '/dashboard/customers',
    label: 'Khách Hàng',
    icon: Users
  }
]

const quickActions = [
  {
    href: '/dashboard/pos',
    label: 'Tạo Hóa Đơn',
    icon: ShoppingCart,
    color: 'bg-blue-500',
    description: 'Bán hàng nhanh'
  },
  {
    href: '/dashboard/customers/new',
    label: 'Thêm Khách',
    icon: UserPlus,
    color: 'bg-green-500',
    description: 'Khách hàng mới'
  },
  {
    href: '/dashboard/products/new',
    label: 'Thêm Hàng',
    icon: Package,
    color: 'bg-purple-500',
    description: 'Sản phẩm mới'
  },
  {
    href: '/dashboard/analytics',
    label: 'Báo Cáo',
    icon: BarChart3,
    color: 'bg-orange-500',
    description: 'Thống kê'
  }
]

export function MobileBottomNav() {
  const [showQuickActions, setShowQuickActions] = useState(false)
  const pathname = usePathname()

  const toggleQuickActions = () => {
    setShowQuickActions(!showQuickActions)
  }

  const closeQuickActions = () => {
    setShowQuickActions(false)
  }

  return (
    <>
      {/* Backdrop Overlay */}
      <AnimatePresence>
        {showQuickActions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[100] block md:hidden"
            onClick={closeQuickActions}
          />
        )}
      </AnimatePresence>

      {/* Quick Actions Menu */}
      <AnimatePresence>
        {showQuickActions && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ 
              type: "spring", 
              stiffness: 400, 
              damping: 25,
              duration: 0.3 
            }}
            className="fixed bottom-20 left-4 right-4 z-[110] block md:hidden"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-6 border border-gray-200">
              {/* Header */}
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Thao Tác Nhanh</h3>
                <p className="text-sm text-gray-500">Chọn tác vụ cần thực hiện</p>
              </div>
              
              {/* Actions Grid */}
              <div className="grid grid-cols-2 gap-4">
                {quickActions.map((action, index) => (
                  <motion.div
                    key={action.href}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ 
                      scale: 1, 
                      opacity: 1,
                      transition: { 
                        delay: index * 0.1,
                        type: "spring",
                        stiffness: 300 
                      }
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                  >
                    <Link
                      href={action.href}
                      onClick={closeQuickActions}
                      className="flex flex-col items-center p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all duration-200 group border border-gray-100 hover:border-gray-200"
                    >
                      <div className={cn(
                        "flex items-center justify-center w-14 h-14 rounded-full text-white shadow-lg mb-3 transition-transform duration-200 group-hover:scale-110",
                        action.color
                      )}>
                        <action.icon className="w-7 h-7" />
                      </div>
                      <span className="text-sm font-medium text-gray-900 text-center mb-1">
                        {action.label}
                      </span>
                      <span className="text-xs text-gray-500 text-center leading-tight">
                        {action.description}
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
              
              {/* Close Button */}
              <button
                onClick={closeQuickActions}
                className="w-full mt-4 py-3 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Đóng
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-[90] block md:hidden">
        <div className="flex items-center justify-around h-16 px-2">
          {mainNavItems.slice(0, 2).map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
              badge={item.badge}
            />
          ))}
          
          {/* Central FAB */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={toggleQuickActions}
            className={cn(
              "flex items-center justify-center w-14 h-14 rounded-full shadow-lg relative transition-all duration-300",
              showQuickActions 
                ? "bg-red-500 scale-110" 
                : "bg-gradient-to-r from-blue-500 to-blue-600"
            )}
          >
            <motion.div
              animate={{ rotate: showQuickActions ? 45 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <Plus className="w-7 h-7 text-white" />
            </motion.div>
            {!showQuickActions && (
              <motion.div 
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full" 
              />
            )}
          </motion.button>

          {mainNavItems.slice(2).map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
            />
          ))}
        </div>
      </div>

      {/* Bottom padding for main content */}
      <div className="h-16 block md:hidden" />
    </>
  )
}

interface NavItemProps {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  isActive: boolean
  badge?: string
}

function NavItem({ href, label, icon: Icon, isActive, badge }: NavItemProps) {
  return (
    <Link href={href} className="flex flex-col items-center justify-center min-w-0 flex-1 py-1">
      <div className="relative">
        <motion.div
          whileTap={{ scale: 0.90 }}
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
            isActive 
              ? "bg-blue-100 text-blue-600 shadow-sm" 
              : "text-gray-600 hover:text-blue-600 hover:bg-blue-50"
          )}
        >
          <Icon className="w-5 h-5" />
        </motion.div>
        
        {badge && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm">
            {badge}
          </span>
        )}
        
        {isActive && (
          <motion.div
            layoutId="activeIndicator"
            className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
      </div>
      
      <span className={cn(
        "text-xs mt-1 text-center truncate w-full",
        isActive ? "text-blue-600 font-medium" : "text-gray-600"
      )}>
        {label}
      </span>
    </Link>
  )
}
