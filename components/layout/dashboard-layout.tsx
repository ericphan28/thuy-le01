"use client"

import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { Toaster } from "react-hot-toast"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        
        <motion.main 
          className={cn(
            "flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900",
            "transition-all duration-300 ease-in-out"
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="container mx-auto p-6">
            {children}
          </div>
        </motion.main>
      </div>
      
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--background)',
            color: 'var(--foreground)',
          },
        }}
      />
    </div>
  )
}
