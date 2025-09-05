'use client'

import { useState, useRef } from 'react'
import { Calendar } from 'lucide-react'

interface VietnameseDateInputProps {
  value?: string // ISO format yyyy-mm-dd
  onChange: (value: string) => void
  placeholder?: string
  min?: string
  required?: boolean
  className?: string
}

export function VietnameseDateInput({
  value,
  onChange,
  placeholder = "dd/MM/yyyy",
  min,
  required = false,
  className = ""
}: VietnameseDateInputProps) {
  const hiddenInputRef = useRef<HTMLInputElement>(null)

  // Convert ISO date to Vietnamese format dd/MM/yyyy
  const formatDateVN = (isoDate: string) => {
    if (!isoDate) return ''
    const date = new Date(isoDate)
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const handleClick = () => {
    hiddenInputRef.current?.click()
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  const displayValue = value ? formatDateVN(value) : ''

  return (
    <div className="relative">
      {/* Visible input showing Vietnamese format */}
      <div
        onClick={handleClick}
        className={`flex items-center px-3 py-1.5 text-sm border border-amber-300 rounded-md bg-white cursor-pointer hover:border-amber-400 focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-amber-500 ${className}`}
      >
        <Calendar className="mr-2 h-4 w-4 text-amber-600" />
        <span className={displayValue ? "text-gray-900" : "text-gray-400"}>
          {displayValue || placeholder}
        </span>
      </div>
      
      {/* Hidden native date input */}
      <input
        ref={hiddenInputRef}
        type="date"
        value={value || ''}
        onChange={handleDateChange}
        min={min}
        required={required}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </div>
  )
}
