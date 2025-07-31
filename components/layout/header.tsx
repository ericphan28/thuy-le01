"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { useSidebar } from "@/lib/store"
import { 
  Bell, 
  Search, 
  Menu, 
  Mail,
  Settings,
  User,
  ChevronDown,
  LogOut
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useEffect, useState } from "react"
import { User as SupabaseUser } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"

export function Header() {
  const { toggle } = useSidebar()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const getUserDisplayName = () => {
    if (!user) return "Guest User"
    return user.user_metadata?.full_name || user.email?.split('@')[0] || "User"
  }

  const getUserInitials = () => {
    if (!user) return "GU"
    const name = getUserDisplayName()
    return name.split(' ').map((word: string) => word[0]).join('').substring(0, 2).toUpperCase()
  }

  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-white/20 bg-white/80 backdrop-blur-xl px-4 shadow-lg dark:border-gray-700/30 dark:bg-gray-800/80"
    >
      {/* Left Side */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="h-9 w-9 p-0 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Tìm kiếm sản phẩm, khách hàng..."
            className="w-64 pl-10 lg:w-80 bg-white/60 border-white/30 backdrop-blur-sm focus:bg-white/80 focus:border-blue-300 transition-all"
          />
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* Mobile Search */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 sm:hidden"
        >
          <Search className="h-5 w-5" />
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0">
              <Bell className="h-5 w-5" />
              <Badge 
                variant="destructive" 
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs"
              >
                3
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 bg-white/95 backdrop-blur-xl border-white/20 shadow-2xl">
            <DropdownMenuLabel className="flex items-center justify-between">
              Thông báo
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">3 mới</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex flex-col items-start gap-1 p-4">
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">Hàng sắp hết</span>
                <span className="text-xs text-gray-500">2 phút trước</span>
              </div>
              <span className="text-sm text-gray-600">
                5 sản phẩm có số lượng tồn kho thấp hơn mức tối thiểu
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 p-4">
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">Đơn hàng mới</span>
                <span className="text-xs text-gray-500">5 phút trước</span>
              </div>
              <span className="text-sm text-gray-600">
                Khách hàng Nguyễn Văn A vừa đặt đơn hàng mới
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 p-4">
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">Thanh toán</span>
                <span className="text-xs text-gray-500">10 phút trước</span>
              </div>
              <span className="text-sm text-gray-600">
                Nhận được thanh toán ₫1,250,000 từ khách hàng
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Messages */}
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0">
          <Mail className="h-5 w-5" />
          <Badge 
            variant="destructive" 
            className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs"
          >
            2
          </Badge>
        </Button>

        {/* Theme Switcher */}
        <ThemeSwitcher />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-3 hover:bg-white/60 transition-all">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-white font-medium text-sm shadow-lg">
                {getUserInitials()}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium">{getUserDisplayName()}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-white/20 shadow-2xl">
            <DropdownMenuLabel>Tài khoản của tôi</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="hover:bg-blue-50 transition-colors">
              <User className="mr-2 h-4 w-4" />
              Hồ sơ cá nhân
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-blue-50 transition-colors">
              <Settings className="mr-2 h-4 w-4" />
              Cài đặt
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="mr-2 h-4 w-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.header>
  )
}
