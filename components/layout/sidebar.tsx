"use client"

import { useSidebar } from "@/lib/store"
import { cn } from "@/lib/utils"
import { 
  BarChart3, 
  Users, 
  Package, 
  ShoppingCart, 
  Truck,
  DollarSign,
  Settings,
  Home,
  Menu,
  ChevronLeft,
  Building2,
  Receipt,
  Warehouse,
  TrendingUp
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useEffect } from "react"

const menuItems = [
  {
    title: "Dashboard",
    icon: Home,
    href: "/dashboard",
    badge: null
  },
  {
    title: "Bán Hàng",
    icon: ShoppingCart,
    href: "/sales",
    badge: null,
    children: [
      { title: "Tạo Hóa Đơn", href: "/sales/invoice" },
      { title: "Đơn Hàng", href: "/sales/orders" },
      { title: "Trả Hàng", href: "/sales/returns" }
    ]
  },
  {
    title: "Khách Hàng",
    icon: Users,
    href: "/dashboard/customers",
    badge: null,
    children: [
      { title: "Danh Sách", href: "/dashboard/customers" },
      { title: "Phân Tích", href: "/dashboard/customers/analytics" },
      { title: "Phân Khúc", href: "/dashboard/customers/segments" }
    ]
  },
  {
    title: "Sản Phẩm",
    icon: Package,
    href: "/dashboard/products",
    badge: null,
    children: [
      { title: "Danh Sách", href: "/dashboard/products/list" },
      { title: "Danh Mục", href: "/dashboard/products/categories" },
      { title: "Đơn Vị", href: "/dashboard/products/units" }
    ]
  },
  {
    title: "Hóa Đơn",
    icon: Receipt,
    href: "/dashboard/invoices",
    badge: null,
    children: [
      { title: "Danh Sách", href: "/dashboard/invoices" },
      { title: "Tạo Mới", href: "/dashboard/invoices/create" },
      { title: "Báo Cáo", href: "/dashboard/invoices/reports" }
    ]
  },
  {
    title: "Kho Hàng",
    icon: Warehouse,
    href: "/inventory",
    badge: "5",
    children: [
      { title: "Tồn Kho", href: "/inventory/stock" },
      { title: "Nhập Hàng", href: "/inventory/inbound" },
      { title: "Kiểm Kho", href: "/inventory/count" }
    ]
  },
  {
    title: "Nhà Cung Cấp",
    icon: Truck,
    href: "/dashboard/suppliers",
    badge: null,
    children: [
      { title: "Danh Sách", href: "/dashboard/suppliers" },
      { title: "Phân Tích", href: "/dashboard/suppliers/analytics" },
      { title: "Hợp Đồng", href: "/dashboard/suppliers/contracts" }
    ]
  },
  {
    title: "Tài Chính",
    icon: DollarSign,
    href: "/finance",
    badge: null,
    children: [
      { title: "Sổ Quỹ", href: "/finance/cashbook" },
      { title: "Công Nợ", href: "/finance/debts" },
      { title: "Báo Cáo", href: "/finance/reports" }
    ]
  },
  {
    title: "Báo Cáo",
    icon: BarChart3,
    href: "/reports",
    badge: null,
    children: [
      { title: "Doanh Thu", href: "/reports/revenue" },
      { title: "Lợi Nhuận", href: "/reports/profit" },
      { title: "Top Sản Phẩm", href: "/reports/dashboard/products" }
    ]
  },
  {
    title: "Chi Nhánh",
    icon: Building2,
    href: "/branches",
    badge: null
  },
  {
    title: "Cài Đặt",
    icon: Settings,
    href: "/dashboard/settings",
    badge: null
  }
]

export function Sidebar() {
  const { isOpen, isMobile, setOpen, setMobile } = useSidebar()
  const pathname = usePathname()

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setMobile(mobile)
      if (mobile) {
        setOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [setOpen, setMobile])

  const sidebarVariants = {
    open: {
      width: isMobile ? "100%" : "280px",
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 30
      }
    },
    closed: {
      width: isMobile ? "0px" : "80px",
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 30
      }
    }
  }

  const contentVariants = {
    open: {
      opacity: 1,
      x: 0,
      transition: {
        delay: 0.1,
        duration: 0.2
      }
    },
    closed: {
      opacity: 0,
      x: -20,
      transition: {
        duration: 0.2
      }
    }
  }

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobile && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        variants={sidebarVariants}
        animate={isOpen ? "open" : "closed"}
        className={cn(
          "fixed left-0 top-0 z-50 h-full bg-white/90 backdrop-blur-xl border-r border-white/30 shadow-2xl",
          "lg:relative lg:z-0 lg:shadow-xl",
          "dark:bg-gray-900/90 dark:border-gray-700/30"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b border-white/20 px-4 dark:border-gray-700/30 bg-gradient-to-r from-blue-50/50 to-green-50/30 dark:from-blue-900/20 dark:to-green-900/10">
            <AnimatePresence mode="wait">
              {isOpen && (
                <motion.div
                  variants={contentVariants}
                  initial="closed"
                  animate="open"
                  exit="closed"
                  className="flex items-center gap-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 shadow-lg ring-2 ring-blue-200/50">
                    <Receipt className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      Xuân Thùy
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Quản Lý Bán Hàng
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(!isOpen)}
              className="h-8 w-8 p-0"
            >
              {isOpen ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {menuItems.map((item) => {
              // Improved logic for highlighting active pages
              let isActive = false
              
              if (item.href === '/dashboard' && pathname === '/dashboard') {
                // Exact match for dashboard home
                isActive = true
              } else if (item.href !== '/dashboard') {
                // For other pages, check if current path starts with item href
                isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                
                // Special handling for sub-pages
                if (item.children) {
                  isActive = isActive || item.children.some(child => pathname === child.href)
                }
              }
              
              const Icon = item.icon

              return (
                <div key={item.href}>
                    <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300 relative",
                      "hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:shadow-sm dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20",
                      isActive && [
                        "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg",
                        "ring-2 ring-blue-200/50 dark:ring-blue-700/50",
                        "transform scale-[1.02] hover:scale-[1.02]",
                        "shadow-blue-500/25 dark:shadow-blue-400/25"
                      ]
                    )}
                    onClick={() => isMobile && setOpen(false)}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full shadow-sm" />
                    )}
                    
                    <Icon className={cn(
                      "h-5 w-5 transition-all duration-300 relative z-10",
                      isActive 
                        ? "text-white drop-shadow-sm scale-110" 
                        : "text-gray-500 group-hover:text-blue-600 dark:text-gray-400 dark:group-hover:text-blue-400"
                    )} />                    <AnimatePresence mode="wait">
                      {isOpen && (
                        <motion.div
                          variants={contentVariants}
                          initial="closed"
                          animate="open"
                          exit="closed"
                          className="flex flex-1 items-center justify-between"
                        >
                          <span className={cn(
                            "font-medium transition-all duration-300 relative z-10",
                            isActive 
                              ? "text-white drop-shadow-sm font-semibold" 
                              : "text-gray-700 group-hover:text-blue-600 dark:text-gray-300 dark:group-hover:text-blue-400"
                          )}>
                            {item.title}
                          </span>
                          {item.badge && (
                            <span className={cn(
                              "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold transition-all relative z-10",
                              isActive 
                                ? "bg-white/20 text-white backdrop-blur-sm shadow-sm" 
                                : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                            )}>
                              {item.badge}
                            </span>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Link>

                  {/* Submenu - Always show if parent is active */}
                  {item.children && isOpen && isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="ml-6 mt-2 space-y-1 relative"
                    >
                      {/* Submenu connector line */}
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-blue-200 to-transparent dark:from-blue-600/50" />
                      
                      {item.children.map((child) => {
                        const isChildActive = pathname === child.href
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "block rounded-lg px-4 py-2.5 text-sm transition-all duration-200 relative ml-2",
                              "hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:text-blue-700 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20",
                              "hover:shadow-sm hover:scale-[1.01]",
                              isChildActive 
                                ? [
                                    "text-blue-700 dark:text-blue-400 font-semibold",
                                    "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30",
                                    "shadow-sm ring-1 ring-blue-200/50 dark:ring-blue-700/30",
                                    "scale-[1.01]"
                                  ]
                                : "text-gray-600 dark:text-gray-400"
                            )}
                            onClick={() => isMobile && setOpen(false)}
                          >
                            {/* Active indicator for submenu */}
                            {isChildActive && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-500 rounded-r-full" />
                            )}
                            <span className="relative z-10">{child.title}</span>
                          </Link>
                        )
                      })}
                    </motion.div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-white/20 p-4 dark:border-gray-700/30 bg-gradient-to-r from-green-50/50 to-blue-50/30 dark:from-green-900/10 dark:to-blue-900/20">
            <AnimatePresence mode="wait">
              {isOpen && (
                <motion.div
                  variants={contentVariants}
                  initial="closed"
                  animate="open"
                  exit="closed"
                  className="rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50 to-green-50 p-4 shadow-sm ring-1 ring-blue-100/50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-green-900/20 dark:ring-blue-800/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg">
                      <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Doanh thu hôm nay
                      </p>
                      <p className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent dark:from-green-400 dark:to-emerald-400">
                        ₫2,456,000
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>
    </>
  )
}
