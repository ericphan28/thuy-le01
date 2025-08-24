"use client"

import { useSidebar } from "@/lib/store"
import { useTodayRevenue } from "@/lib/hooks/use-today-revenue"
import { cn } from "@/lib/utils"
import { formatCompactVND } from "@/lib/utils/currency"
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
    title: "Bán Hàng & POS",
    icon: ShoppingCart,
    href: "/dashboard/pos",
    badge: "HOT",
    children: [
      { title: "🛒 Point of Sale", href: "/dashboard/pos" },
      { title: "📋 Danh Sách Hóa Đơn", href: "/dashboard/invoices" },
      { title: "🔄 Trả Hàng", href: "/dashboard/returns" },
      { title: "📊 Báo Cáo Bán Hàng", href: "/dashboard/sales/reports" }
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
      { title: "Danh Mục Sản Phẩm", href: "/dashboard/products/catalog" },
      { title: "Quản Lý Cơ Bản", href: "/dashboard/products" },
      { title: "Danh Mục", href: "/dashboard/products/categories" },
      { title: "Đơn Vị", href: "/dashboard/products/units" }
    ]
  },
  {
    title: "Kho Hàng",
    icon: Warehouse,
    href: "/dashboard/inventory",
    badge: "5",
    children: [
      { title: "📊 Tồn Kho", href: "/dashboard/inventory" },
      { title: "📋 Chi Tiết Tồn Kho", href: "/dashboard/inventory/stock" },
      { title: "📝 Xuất Nhập Kho", href: "/dashboard/inventory/movements" },
      { title: "📥 Nhập Hàng", href: "/dashboard/inventory/inbound" },
      { title: "🔍 Kiểm Kho", href: "/dashboard/inventory/count" },
      { title: "⚠️ Cảnh Báo", href: "/dashboard/inventory/alerts" }
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
    href: "/dashboard/debt",
    badge: null,
    children: [
      { title: "💰 Sổ Quỹ", href: "/dashboard/finance/cashbook" },
      { title: "🏦 Công Nợ", href: "/dashboard/debt" },
      { title: "📊 Báo Cáo Tài Chính", href: "/dashboard/finance/reports" }
    ]
  },
  {
    title: "Báo Cáo & Phân Tích",
    icon: BarChart3,
    href: "/dashboard/reports",
    badge: null,
    children: [
      { title: "📈 Doanh Thu", href: "/dashboard/reports/revenue" },
      { title: "💰 Lợi Nhuận", href: "/dashboard/reports/profit" },
      { title: "🏆 Top Sản Phẩm", href: "/dashboard/reports/products" },
      { title: "👥 Phân Tích Khách Hàng", href: "/dashboard/reports/customers" }
    ]
  },
  {
    title: "Chính sách giá",
    icon: TrendingUp,
    href: "/dashboard/pricing",
    badge: null,
    children: [
      { title: "🎯 Mô phỏng giá", href: "/dashboard/pricing/simulator" },
      { title: "📖 Bảng giá", href: "/dashboard/pricing/books" },
      { title: "🏷️ Khuyến mãi", href: "/dashboard/pricing/promotions" },
      { title: "📊 Hợp đồng giá", href: "/dashboard/pricing/contracts" },
      { title: "📈 Bậc số lượng", href: "/dashboard/pricing/tiers" }
    ]
  },
  {
    title: "Cài Đặt",
    icon: Settings,
    href: "/dashboard/settings",
    badge: null,
    children: [
      { title: "🏢 Chi Nhánh", href: "/dashboard/branches" },
      { title: "⚙️ Hệ Thống", href: "/dashboard/settings" },
      { title: "👨‍💼 Người Dùng", href: "/dashboard/users" }
    ]
  }
]

export function Sidebar() {
  const { isOpen, isMobile, setOpen, setMobile } = useSidebar()
  const { revenue, orders, customers, loading, error } = useTodayRevenue()
  const pathname = usePathname()

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setMobile(mobile)
      if (mobile) {
        setOpen(false) // Close in mobile
      } else {
        setOpen(true) // Open in desktop
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [setOpen, setMobile])

  const sidebarVariants = {
    open: {
      width: isMobile ? "100%" : "280px",
      x: 0,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 30
      }
    },
    closed: {
      width: isMobile ? "0px" : "80px",
      x: isMobile ? "-100%" : 0,
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
          "fixed left-0 top-0 z-50 h-full bg-white/95 backdrop-blur-lg border-r border-white/30 shadow-2xl",
          "lg:relative lg:z-0 lg:shadow-xl",
          "dark:bg-gray-900/95 dark:border-gray-700/30",
          // Hide completely in mobile when closed
          !isOpen && isMobile && "hidden"
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
                        : "text-gray-500 group-hover:!text-gray-800 dark:text-gray-400 dark:group-hover:!text-blue-300"
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
                              : "text-gray-700 group-hover:!text-gray-800 dark:text-gray-300 dark:group-hover:!text-blue-300"
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
                              "hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:!text-gray-800 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 dark:hover:!text-blue-300",
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
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-300",
                      loading 
                        ? "bg-gray-300 dark:bg-gray-600 animate-pulse" 
                        : error 
                        ? "bg-red-400 to-red-500" 
                        : "bg-gradient-to-br from-green-400 to-emerald-500"
                    )}>
                      <TrendingUp className={cn(
                        "h-5 w-5 transition-all duration-300",
                        loading ? "text-gray-500" : "text-white"
                      )} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Doanh thu hôm nay
                      </p>
                      {loading ? (
                        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1"></div>
                      ) : error ? (
                        <p className="text-sm text-red-500 dark:text-red-400">
                          Lỗi tải dữ liệu
                        </p>
                      ) : (
                        <p className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent dark:from-green-400 dark:to-emerald-400">
                          {formatCompactVND(revenue)}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Quick stats */}
                  {!loading && !error && (
                    <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                      <div className="text-center p-2 bg-white/60 rounded-lg dark:bg-gray-800/60">
                        <div className="font-semibold text-gray-700 dark:text-gray-300">Đơn hôm nay</div>
                        <div className="text-blue-600 dark:text-blue-400 font-bold">{orders}</div>
                      </div>
                      <div className="text-center p-2 bg-white/60 rounded-lg dark:bg-gray-800/60">
                        <div className="font-semibold text-gray-700 dark:text-gray-300">Khách mới</div>
                        <div className="text-green-600 dark:text-green-400 font-bold">{customers}</div>
                      </div>
                    </div>
                  )}
                  
                  {/* Loading state for stats */}
                  {loading && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="text-center p-2 bg-white/60 rounded-lg">
                        <div className="h-3 bg-gray-200 rounded animate-pulse mb-1"></div>
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                      </div>
                      <div className="text-center p-2 bg-white/60 rounded-lg">
                        <div className="h-3 bg-gray-200 rounded animate-pulse mb-1"></div>
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>
    </>
  )
}
