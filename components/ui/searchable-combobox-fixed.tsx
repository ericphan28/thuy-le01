"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

export interface SearchableOption<T = any> {
  value: string;
  label: string;
  subLabel?: string;
  meta?: string[];
  data?: T;
}

interface SearchableComboboxProps<T = any> {
  options: SearchableOption<T>[];
  value?: string;
  onChange: (value: string, option?: SearchableOption<T>) => void;
  placeholder?: string;
  emptyText?: string;
  maxResults?: number;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  showMeta?: boolean;
  footer?: React.ReactNode;
  onQueryChange?: (query: string) => void;
  debounceMs?: number;
  usePortal?: boolean;
}

export const SearchableCombobox = <T,>({
  options,
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  emptyText = 'Không có kết quả',
  maxResults = 100,
  disabled,
  loading,
  className,
  showMeta = true,
  footer,
  onQueryChange,
  debounceMs = 300,
  usePortal = true
}: SearchableComboboxProps<T>) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = options.find(o => o.value === value);

  const filtered = options.filter(o => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (o.label.toLowerCase().includes(q)) return true;
    if (o.subLabel?.toLowerCase().includes(q)) return true;
    if (o.meta?.some(m => m.toLowerCase().includes(q))) return true;
    return false;
  }).slice(0, maxResults);

  const calculateDropdownPosition = useCallback(() => {
    if (!containerRef.current || !usePortal) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = Math.min(288, filtered.length * 50 + 20);
    
    if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
      // Show above
      setDropdownStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        maxHeight: Math.min(288, rect.top - 20)
      });
    } else {
      // Show below
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        maxHeight: Math.min(288, spaceBelow - 20)
      });
    }
  }, [filtered.length, usePortal]);

  useEffect(() => {
    if (open && usePortal) {
      calculateDropdownPosition();
      
      const handleResize = () => calculateDropdownPosition();
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleResize, true);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleResize, true);
      };
    }
  }, [open, usePortal, calculateDropdownPosition]);

  const handleSelect = (opt: SearchableOption<T>) => {
    onChange(opt.value, opt);
    setQuery('');
    setOpen(false);
    setHighlight(0);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      setTimeout(() => inputRef.current?.select(), 0);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
        break;
      case 'Enter':
        if (open && filtered[highlight]) {
          e.preventDefault();
          handleSelect(filtered[highlight]);
        }
        break;
      case 'Escape':
        setOpen(false);
        setQuery('');
        break;
    }
  };

  const displayValue = selectedOption ? selectedOption.label : query;

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedQueryChange = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onQueryChange?.(q), debounceMs);
  };

  const renderDropdown = () => {
    if (!open) return null;
    
    const dropdown = (
      <div 
        className={cn(
          "rounded-md border bg-popover shadow-lg overflow-y-auto animate-in fade-in-0 zoom-in-95",
          usePortal ? "" : "absolute top-full mt-1 w-full z-[9999] max-h-72"
        )}
        style={usePortal ? dropdownStyle : {}}
      >
        {loading && (
          <div className="p-3 text-sm text-muted-foreground">Đang tải...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground">{emptyText}</div>
        )}
        {!loading && filtered.map((opt, i) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => handleSelect(opt)}
            className={cn(
              'w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-none bg-transparent cursor-pointer',
              i === highlight ? 'bg-accent/60' : '',
              opt.value === value ? 'font-medium' : ''
            )}
            onMouseEnter={() => setHighlight(i)}
          >
            <div className="flex justify-between items-center gap-2">
              <span className="truncate">{opt.label}</span>
              {opt.subLabel && (
                <span className="text-xs text-muted-foreground truncate">{opt.subLabel}</span>
              )}
            </div>
            {showMeta && opt.meta && opt.meta.length > 0 && (
              <div className="text-[11px] text-muted-foreground mt-1 flex gap-2 flex-wrap">
                {opt.meta.slice(0,3).map((m, idx) => (
                  <span key={idx} className="px-1 rounded bg-muted/50">{m}</span>
                ))}
              </div>
            )}
          </button>
        ))}
        {footer && (
          <div className="border-t p-2 text-xs text-muted-foreground bg-background sticky bottom-0">{footer}</div>
        )}
      </div>
    );

    if (usePortal && typeof window !== 'undefined') {
      return createPortal(dropdown, document.body);
    }
    
    return dropdown;
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          disabled={disabled}
          value={displayValue}
          onChange={(e) => {
            const q = e.target.value;
            setQuery(q);
            if (selectedOption) {
              setQuery(q);
              if (q !== selectedOption.label) {
                onChange(''); // Clear selection if user types different text
              }
            }
            debouncedQueryChange(q);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-8"
        />
      </div>
      {!usePortal && renderDropdown()}
      {usePortal && renderDropdown()}
    </div>
  );
};
