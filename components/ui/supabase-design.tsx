import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface SupabaseCardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'glass' | 'elevated'
}

export function SupabaseCard({ children, className, variant = 'default' }: SupabaseCardProps) {
  const variants = {
    default: 'bg-card text-card-foreground border border-border shadow-sm',
    glass: 'bg-card/90 backdrop-blur-xl text-card-foreground border border-border shadow-lg',
    elevated: 'bg-card text-card-foreground border border-border shadow-supabase-lg'
  }

  return (
    <div className={cn('rounded-lg', variants[variant], className)}>
      {children}
    </div>
  )
}

interface SupabaseButtonProps {
  children: ReactNode
  className?: string
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  disabled?: boolean
}

export function SupabaseButton({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md',
  onClick,
  disabled = false
}: SupabaseButtonProps) {
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground'
  }

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 py-2 text-sm',
    lg: 'h-12 px-8 text-base'
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  )
}

interface SupabaseInputProps {
  placeholder?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
  type?: string
}

export function SupabaseInput({ 
  placeholder, 
  value, 
  onChange, 
  className, 
  type = 'text' 
}: SupabaseInputProps) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    />
  )
}
