"use client"

import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Eye, EyeOff, Loader2, ShieldCheck, User, Lock } from "lucide-react"
import { toast } from "sonner"

export function ProfessionalLoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Handle hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Check if user is already logged in
  useEffect(() => {
    if (!mounted) return

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/dashboard')
      }
    }

    checkAuth()
  }, [mounted, router, supabase])

  // Auth state listener for auto-redirect
  useEffect(() => {
    if (!mounted) return

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          toast.success('🎉 Đăng nhập thành công!', {
            description: 'Chào mừng bạn trở lại',
            duration: 2000
          })
          
          // Small delay for better UX
          setTimeout(() => {
            router.replace('/dashboard')
          }, 500)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [mounted, router, supabase])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email.trim() || !password.trim()) {
      toast.error('❌ Vui lòng điền đầy đủ thông tin', {
        description: 'Email và mật khẩu không được để trống'
      })
      return
    }

    if (!email.includes('@')) {
      toast.error('❌ Email không hợp lệ', {
        description: 'Vui lòng nhập đúng định dạng email'
      })
      return
    }

    setIsLoading(true)

    try {
      toast.loading('🔐 Đang xác thực...', {
        description: 'Vui lòng chờ một chút'
      })

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      toast.dismiss()

      if (error) {
        // Handle specific error types
        if (error.message.includes('Invalid login credentials')) {
          toast.error('❌ Thông tin đăng nhập không đúng', {
            description: 'Email hoặc mật khẩu không chính xác',
            action: {
              label: 'Quên mật khẩu?',
              onClick: () => router.push('/auth/forgot-password')
            }
          })
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('❌ Email chưa được xác thực', {
            description: 'Vui lòng kiểm tra email và xác thực tài khoản'
          })
        } else {
          toast.error('❌ Lỗi đăng nhập', {
            description: error.message
          })
        }
        return
      }

      // Success case is handled by auth state listener
      if (data.session) {
        console.log('Login successful, session:', data.session.user.email)
      }

    } catch (error) {
      toast.dismiss()
      toast.error('❌ Có lỗi xảy ra', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại sau'
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-r from-blue-600 to-blue-700 rounded-full flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">
            Đăng Nhập Hệ Thống
          </CardTitle>
          <CardDescription className="text-gray-600">
            Chào mừng trở lại! Vui lòng đăng nhập để tiếp tục
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email đăng nhập
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Mật khẩu
                </Label>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium transition-all duration-200 shadow-md hover:shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Đăng Nhập
                </>
              )}
            </Button>

            {/* Sign Up Link */}
            <div className="text-center pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Chưa có tài khoản?{" "}
                <Link
                  href="/auth/sign-up"
                  className="font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                >
                  Đăng ký ngay
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-gray-500">
        <p>Bằng việc đăng nhập, bạn đồng ý với</p>
        <p>
          <Link href="/terms" className="hover:underline">Điều khoản sử dụng</Link>
          {" và "}
          <Link href="/privacy" className="hover:underline">Chính sách bảo mật</Link>
        </p>
      </div>
    </div>
  )
}
