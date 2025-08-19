"use client"

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Trash2, LogOut, RefreshCw, Bug } from 'lucide-react'

export function AuthDebugPanel() {
  const [status, setStatus] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const clearAllSessions = async () => {
    setStatus('🧹 Clearing all sessions...')
    
    // 1. Supabase logout
    await supabase.auth.signOut()
    
    // 2. Clear local storage
    localStorage.clear()
    sessionStorage.clear()
    
    // 3. Clear cookies via JS
    document.cookie.split(";").forEach(function(c) { 
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
    });
    
    setStatus('✅ Sessions cleared! Ready for fresh login test')
    
    // 4. Redirect to login after small delay
    setTimeout(() => {
      window.location.href = '/auth/login'
    }, 1000)
  }

  const checkAuthStatus = async () => {
    setStatus('🔍 Checking auth status...')
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      setStatus(`❌ Auth Error: ${error.message}`)
    } else if (session) {
      setStatus(`✅ Logged in as: ${session.user.email}`)
    } else {
      setStatus('❌ No active session')
    }
  }

  const forceLogout = async () => {
    setStatus('🚪 Force logout...')
    await supabase.auth.signOut()
    setStatus('✅ Logged out successfully')
    setTimeout(() => {
      router.push('/auth/login')
    }, 500)
  }

  const testRedirectFlow = () => {
    setStatus('🔄 Testing redirect flow...')
    // Clear session first then try to access dashboard
    clearAllSessions()
  }

  return (
    <div className="fixed top-4 right-4 z-[200] bg-white border border-gray-300 rounded-lg shadow-lg p-4 w-80">
      <div className="flex items-center gap-2 mb-3">
        <Bug className="h-5 w-5 text-orange-500" />
        <h3 className="font-semibold text-gray-900">Auth Debug Panel</h3>
      </div>
      
      <div className="space-y-2 mb-4">
        <Button 
          onClick={checkAuthStatus} 
          variant="outline" 
          size="sm" 
          className="w-full justify-start"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Check Auth Status
        </Button>
        
        <Button 
          onClick={forceLogout} 
          variant="outline" 
          size="sm" 
          className="w-full justify-start text-orange-600 hover:text-orange-700"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Force Logout
        </Button>
        
        <Button 
          onClick={clearAllSessions} 
          variant="outline" 
          size="sm" 
          className="w-full justify-start text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear All Sessions
        </Button>
        
        <Button 
          onClick={testRedirectFlow} 
          variant="default" 
          size="sm" 
          className="w-full justify-start bg-blue-600 hover:bg-blue-700"
        >
          <Bug className="h-4 w-4 mr-2" />
          Test Fresh Login Flow
        </Button>
      </div>
      
      {status && (
        <div className="text-xs p-2 bg-gray-50 rounded border">
          <span className="font-mono">{status}</span>
        </div>
      )}
    </div>
  )
}
