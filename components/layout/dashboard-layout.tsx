"use client"

import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { Toaster } from "react-hot-toast"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-green-50/10 dark:from-gray-900 dark:via-blue-900/5 dark:to-green-900/5 overflow-hidden">
      {/* Desktop Sidebar - Hidden on Mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        
        <main 
          className={cn(
            "flex-1 overflow-y-auto",
            "bg-gradient-to-br from-slate-50/60 via-white/40 to-blue-50/20",
            "dark:from-gray-900/80 dark:via-slate-800/40 dark:to-blue-900/10",
            "backdrop-blur-sm scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
            // Performance optimizations
            "will-change-scroll transform-gpu",
            // Mobile bottom nav spacing
            "pb-16 md:pb-0"
          )}
          style={{
            scrollBehavior: 'smooth',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div className="container mx-auto p-4 relative min-h-full">
            {/* Optimized Decorative Background Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
              <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-200/10 to-green-200/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-purple-200/10 to-pink-200/10 rounded-full blur-3xl" />
            </div>
            
            <motion.div 
              className="relative z-10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.3,
                ease: "easeOut"
              }}
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
      
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(255, 255, 255, 0.95)',
            color: 'rgb(15, 23, 42)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(203, 213, 225, 0.3)',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          },
        }}
      />
    </div>
  )
}
