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
  TrendingUp,
  Menu,
  ChevronLeft,
  Building2,
  Receipt,
  Warehouse,
  AlertTriangle,
  Zap,
  Search,
  Plus,
  FileText
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useEffect } from "react"

const menuItems = [
  {
    title: "Dashboard",
    icon: BarChart3,
    href: "/dashboard",
    priority: "high",
    badge: null,
    description: "Tổng quan kinh doanh và KPIs",
    emoji: "📊"
  },
  {
    title: "Bán Hàng",
    icon: ShoppingCart,
    href: "/dashboard/pos",
    priority: "high",
    badge: "HOT",
    description: "Quy trình bán hàng và POS",
    emoji: "💰",
    children: [
      { title: "🛒 Point of Sale", href: "/dashboard/pos", badge: "PRIMARY" },
      { title: "📋 Hóa Đơn", href: "/dashboard/invoices" },
      { title: "🔄 Trả Hàng", href: "/dashboard/returns" }
    ]
  },
  {
    title: "Kho & Hàng Hóa",
    icon: Package,
    href: "/dashboard/products",
    priority: "high",
    badge: null,
    description: "Quản lý tồn kho và sản phẩm",
    emoji: "📦",
    children: [
      { title: "🏷️ Sản Phẩm", href: "/dashboard/products" },
      { title: "📊 Tồn Kho", href: "/dashboard/inventory" },
      { title: "📥 Nhập Hàng", href: "/dashboard/inventory/inbound" },
      { title: "⚠️ Cảnh Báo", href: "/dashboard/inventory/alerts" }
    ]
  },
  {
    title: "Khách Hàng",
    icon: Users,
    href: "/dashboard/customers",
    priority: "medium",
    badge: null,
    description: "Quản lý quan hệ khách hàng",
    emoji: "👥",
    children: [
      { title: "📋 Danh Sách", href: "/dashboard/customers" },
      { title: "📈 Phân Tích", href: "/dashboard/customers/analytics" },
      { title: "🎯 Phân Khúc", href: "/dashboard/customers/segments" }
    ]
  },
  {
    title: "Nhà Cung Cấp",
    icon: Truck,
    href: "/dashboard/suppliers",
    priority: "medium",
    badge: null,
    description: "Quản lý nhà cung cấp và đối tác",
    emoji: "🚚",
    children: [
      { title: "📋 Danh Sách", href: "/dashboard/suppliers" },
      { title: "📊 Đánh Giá", href: "/dashboard/suppliers/evaluation" },
      { title: "📄 Hợp Đồng", href: "/dashboard/suppliers/contracts" }
    ]
  },
  {
    title: "Tài Chính",
    icon: DollarSign,
    href: "/dashboard/finance",
    priority: "high",
    badge: null,
    description: "Quản lý tài chính và công nợ",
    emoji: "💳",
    children: [
      { title: "💰 Sổ Quỹ", href: "/dashboard/finance/cashbook" },
      { title: "🏦 Công Nợ", href: "/dashboard/debt" },
      { title: "📊 P&L", href: "/dashboard/finance/profit-loss" }
    ]
  },
  {
    title: "Báo Cáo",
    icon: TrendingUp,
    href: "/dashboard/reports",
    priority: "medium",
    badge: null,
    description: "Business Intelligence và báo cáo",
    emoji: "📊",
    children: [
      { title: "📈 Doanh Thu", href: "/dashboard/reports/revenue" },
      { title: "🏆 Top Products", href: "/dashboard/reports/products" },
      { title: "👥 Customer Insights", href: "/dashboard/reports/customers" }
    ]
  },
  {
    title: "Hệ Thống",
    icon: Settings,
    href: "/dashboard/settings",
    priority: "low",
    badge: null,
    description: "Cấu hình và quản trị hệ thống",
    emoji: "⚙️",
    children: [
      { title: "🏢 Chi Nhánh", href: "/dashboard/branches" },
      { title: "⚙️ Cài Đặt", href: "/dashboard/settings" },
      { title: "👨‍💼 Người Dùng", href: "/dashboard/users" }
    ]
  }
]

// Quick Actions - Shortcuts cho các tác vụ quan trọng
const quickActions = [
  { title: "Tạo Hóa Đơn", href: "/dashboard/pos", icon: Plus, hotkey: "Ctrl+N", color: "bg-blue-500" },
  { title: "Thêm Khách Hàng", href: "/dashboard/customers/new", icon: Users, hotkey: "Ctrl+U", color: "bg-green-500" },
  { title: "Tìm Kiếm", href: "/dashboard/search", icon: Search, hotkey: "Ctrl+K", color: "bg-purple-500" },
  { title: "Báo Cáo", href: "/dashboard/reports", icon: FileText, hotkey: "Ctrl+R", color: "bg-orange-500" }
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
      } else {
        setOpen(true)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [setOpen, setMobile])

  const sidebarVariants = {
    open: {
      width: isMobile ? "100%" : "300px",
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

  // Get priority-based styling
  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-l-blue-500 hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100/50"
      case "medium":
        return "border-l-green-500 hover:bg-gradient-to-r hover:from-green-50 hover:to-green-100/50"
      case "low":
        return "border-l-gray-400 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100/50"
      default:
        return "border-l-gray-300"
    }
  }

  const getPriorityActiveStyle = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-gradient-to-r from-blue-500 to-indigo-600 border-l-blue-400"
      case "medium":
        return "bg-gradient-to-r from-green-500 to-emerald-600 border-l-green-400"
      case "low":
        return "bg-gradient-to-r from-gray-500 to-slate-600 border-l-gray-400"
      default:
        return "bg-gradient-to-r from-blue-500 to-indigo-600"
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
          "fixed left-0 top-0 z-50 h-full bg-white/95 backdrop-blur-xl border-r border-white/30 shadow-2xl",
          "lg:relative lg:z-0 lg:shadow-xl",
          "dark:bg-gray-900/95 dark:border-gray-700/30",
          !isOpen && isMobile && "hidden"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b border-white/20 px-4 dark:border-gray-700/30 bg-gradient-to-r from-blue-50/80 to-green-50/50 dark:from-blue-900/30 dark:to-green-900/20">
            <AnimatePresence mode="wait">
              {isOpen && (
                <motion.div
                  variants={contentVariants}
                  initial="closed"
                  animate="open"
                  exit="closed"
                  className="flex items-center gap-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 shadow-lg ring-2 ring-blue-200/50">
                    <Receipt className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      Xuân Thùy
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      Veterinary Management
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(!isOpen)}
              className="h-8 w-8 p-0 hover:bg-white/20"
            >
              {isOpen ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Quick Actions - Only show when expanded */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                variants={contentVariants}
                initial="closed"
                animate="open"
                exit="closed"
                className="p-4 border-b border-white/10 bg-gradient-to-r from-indigo-50/30 to-purple-50/20 dark:from-indigo-900/20 dark:to-purple-900/10"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Quick Actions
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((action) => {
                    const ActionIcon = action.icon
                    return (
                      <Link
                        key={action.href}
                        href={action.href}
                        className="flex items-center gap-2 p-2 rounded-lg bg-white/60 hover:bg-white/80 dark:bg-gray-800/60 dark:hover:bg-gray-800/80 transition-all duration-200 hover:scale-[1.02] shadow-sm border border-white/20"
                        onClick={() => isMobile && setOpen(false)}
                      >
                        <div className={cn("p-1 rounded text-white", action.color)}>
                          <ActionIcon className="h-3 w-3" />
                        </div>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                          {action.title}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {menuItems.map((item) => {
              let isActive = false
              
              if (item.href === '/dashboard' && pathname === '/dashboard') {
                isActive = true
              } else if (item.href !== '/dashboard') {
                isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                
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
                      "group flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-300 relative border-l-4",
                      "hover:shadow-md hover:scale-[1.02]",
                      isActive ? [
                        getPriorityActiveStyle(item.priority),
                        "text-white shadow-lg ring-2 ring-white/20",
                        "transform scale-[1.02]"
                      ] : [
                        getPriorityStyle(item.priority),
                        "bg-white/40 dark:bg-gray-800/40"
                      ]
                    )}
                    onClick={() => isMobile && setOpen(false)}
                  >
                    {/* Priority indicator dot */}
                    <div className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full",
                      item.priority === "high" && "bg-blue-400",
                      item.priority === "medium" && "bg-green-400", 
                      item.priority === "low" && "bg-gray-400"
                    )} />
                    
                    <Icon className={cn(
                      "h-5 w-5 transition-all duration-300 relative z-10",
                      isActive 
                        ? "text-white drop-shadow-sm scale-110" 
                        : "text-gray-600 group-hover:!text-gray-800 dark:text-gray-400"
                    )} />

                    <AnimatePresence mode="wait">
                      {isOpen && (
                        <motion.div
                          variants={contentVariants}
                          initial="closed"
                          animate="open"
                          exit="closed"
                          className="flex flex-1 items-center justify-between"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "font-semibold transition-all duration-300 relative z-10",
                                isActive 
                                  ? "text-white drop-shadow-sm" 
                                  : "text-gray-700 group-hover:!text-gray-900 dark:text-gray-300"
                              )}>
                                {item.title}
                              </span>
                              {item.badge && (
                                <Badge variant={item.badge === "HOT" ? "destructive" : "secondary"} className="text-xs px-2 py-0.5">
                                  {item.badge}
                                </Badge>
                              )}
                            </div>
                            <p className={cn(
                              "text-xs mt-0.5 transition-all duration-300",
                              isActive 
                                ? "text-white/80" 
                                : "text-gray-500 dark:text-gray-400"
                            )}>
                              {item.description}
                            </p>
                          </div>
                          
                          {/* Emoji indicator */}
                          <span className="text-lg opacity-80">
                            {item.emoji}
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Link>

                  {/* Submenu */}
                  {item.children && isOpen && isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="ml-6 mt-2 space-y-1 relative"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-blue-200 via-blue-300 to-transparent dark:from-blue-600/50" />
                      
                      {item.children.map((child) => {
                        const isChildActive = pathname === child.href
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "block rounded-lg px-4 py-2.5 text-sm transition-all duration-200 relative ml-3",
                              "hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:!text-gray-800 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20",
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
                            {isChildActive && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-500 rounded-r-full" />
                            )}
                            <span className="relative z-10 flex items-center gap-2">
                              {child.title}
                              {'badge' in child && child.badge && (
                                <Badge variant="outline" className="text-xs px-1.5 py-0">
                                  {child.badge}
                                </Badge>
                              )}
                            </span>
                          </Link>
                        )
                      })}
                    </motion.div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Enhanced Footer */}
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
                  
                  {/* Quick stats */}
                  <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                    <div className="text-center p-2 bg-white/60 rounded-lg">
                      <div className="font-semibold text-gray-700">Đơn hôm nay</div>
                      <div className="text-blue-600 font-bold">24</div>
                    </div>
                    <div className="text-center p-2 bg-white/60 rounded-lg">
                      <div className="font-semibold text-gray-700">Khách mới</div>
                      <div className="text-green-600 font-bold">8</div>
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
