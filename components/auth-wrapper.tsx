"use client"

import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { User } from "@supabase/supabase-js"

interface AuthWrapperProps {
  children: React.ReactNode
  requireAuth?: boolean
}

export function AuthWrapper({ children, requireAuth = false }: AuthWrapperProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)

      if (requireAuth && !user) {
        router.push('/auth/login')
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        
        if (requireAuth && !session?.user) {
          router.push('/auth/login')
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase.auth, requireAuth, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (requireAuth && !user) {
    return null // Will redirect to login
  }

  return <>{children}</>
}
