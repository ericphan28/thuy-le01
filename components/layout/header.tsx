"use client"

import { Button } from "@/components/ui/button"
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
import { useEffect, useState, useRef } from "react"
import { User as SupabaseUser } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"

export function Header() {
  const { toggle } = useSidebar()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  // Keyboard shortcut effect
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+K (Windows) or Cmd+K (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault() // Prevent default browser behavior
        searchInputRef.current?.focus()
      }
    }

    // Add event listener
    document.addEventListener('keydown', handleKeyDown)

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

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
      className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border bg-background/95 backdrop-blur-xl px-4 shadow-sm"
    >
      {/* Left Side */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="h-9 w-9 p-0 lg:hidden hover:bg-muted/30"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Professional Search - Supabase Style */}
        <div className="relative hidden sm:block">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border border-border rounded-lg hover:border-brand/30 focus-within:border-brand transition-colors w-64 lg:w-80">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={searchInputRef}
              placeholder="Tìm kiếm sản phẩm, khách hàng..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded border border-border">
              ⌘K
            </div>
          </div>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* Mobile Search */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 sm:hidden hover:bg-muted/30"
          onClick={() => searchInputRef.current?.focus()}
        >
          <Search className="h-5 w-5" />
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0 hover:bg-muted/30">
              <Bell className="h-5 w-5" />
              <Badge 
                variant="destructive" 
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs"
              >
                3
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 bg-card border-border shadow-lg">
            <DropdownMenuLabel className="flex items-center justify-between">
              Thông báo
              <Badge variant="secondary" className="bg-brand/10 text-brand">3 mới</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex flex-col items-start gap-1 p-4 hover:bg-muted/30">
              <div className="flex w-full items-center justify-between">
                <span className="font-medium text-foreground">Hàng sắp hết</span>
                <span className="text-xs text-muted-foreground">2 phút trước</span>
              </div>
              <span className="text-sm text-muted-foreground">
                5 sản phẩm có số lượng tồn kho thấp hơn mức tối thiểu
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 p-4 hover:bg-muted/30">
              <div className="flex w-full items-center justify-between">
                <span className="font-medium text-foreground">Đơn hàng mới</span>
                <span className="text-xs text-muted-foreground">5 phút trước</span>
              </div>
              <span className="text-sm text-muted-foreground">
                Khách hàng Nguyễn Văn A vừa đặt đơn hàng mới
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 p-4 hover:bg-muted/30">
              <div className="flex w-full items-center justify-between">
                <span className="font-medium text-foreground">Thanh toán</span>
                <span className="text-xs text-muted-foreground">10 phút trước</span>
              </div>
              <span className="text-sm text-muted-foreground">
                Nhận được thanh toán ₫1,250,000 từ khách hàng
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Messages */}
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0 hover:bg-muted/30">
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
            <Button variant="ghost" className="flex items-center gap-2 px-3 hover:bg-muted/30 transition-colors">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-brand-foreground font-medium text-sm shadow-sm">
                {getUserInitials()}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-foreground">{getUserDisplayName()}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-card border-border shadow-lg">
            <DropdownMenuLabel className="text-foreground">Tài khoản của tôi</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="hover:bg-muted/30 transition-colors text-foreground">
              <User className="mr-2 h-4 w-4" />
              Hồ sơ cá nhân
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-muted/30 transition-colors text-foreground">
              <Settings className="mr-2 h-4 w-4" />
              Cài đặt
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive hover:bg-destructive/10 transition-colors">
              <LogOut className="mr-2 h-4 w-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.header>
  )
}
