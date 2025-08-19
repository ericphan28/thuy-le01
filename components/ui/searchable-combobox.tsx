'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface SearchableComboboxProps<T = any> {
  items: T[];
  value?: T;
  onValueChange: (value: T | null) => void;
  getItemId: (item: T) => string | number;
  getItemLabel: (item: T) => string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onSearch?: (query: string) => void;
}

export function SearchableCombobox<T = any>({
  items,
  value,
  onValueChange,
  getItemId,
  getItemLabel,
  placeholder = 'Search...',
  className,
  disabled = false,
  onSearch
}: SearchableComboboxProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<T[]>(items);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter items based on search query
  useEffect(() => {
    if (!searchQuery) {
      setFilteredItems(items);
    } else {
      const filtered = items.filter(item =>
        getItemLabel(item).toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredItems(filtered);
    }
    setHighlightedIndex(-1);
  }, [searchQuery, items, getItemLabel]);

  // Call external search handler if provided
  useEffect(() => {
    if (onSearch) {
      onSearch(searchQuery);
    }
  }, [searchQuery, onSearch]);

  // Handle wheel events on dropdown to ensure smooth scrolling
  useEffect(() => {
    const dropdown = listRef.current;
    if (!dropdown || !isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = dropdown;
      
      // If we can scroll in the direction of the wheel, prevent parent scrolling
      if (
        (e.deltaY > 0 && scrollTop < scrollHeight - clientHeight) ||
        (e.deltaY < 0 && scrollTop > 0)
      ) {
        e.preventDefault();
        e.stopPropagation();
        
        // Manual scroll with smooth animation
        dropdown.scrollTop += e.deltaY;
      }
    };

    // Add passive: false to allow preventDefault
    dropdown.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      dropdown.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen]);

  // Handle input focus
  const handleFocus = () => {
    setIsOpen(true);
  };

  // Handle input blur (with longer delay to allow scrolling and clicking)
  const handleBlur = () => {
    setTimeout(() => setIsOpen(false), 300);
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setIsOpen(true);
  };

  // Handle item selection
  const handleItemSelect = (item: T) => {
    onValueChange(item);
    setSearchQuery(getItemLabel(item));
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const newIndex = prev < filteredItems.length - 1 ? prev + 1 : 0;
          // Scroll to item after state update
          requestAnimationFrame(() => {
            const dropdown = listRef.current;
            if (dropdown && dropdown.children[newIndex]) {
              const item = dropdown.children[newIndex] as HTMLElement;
              const dropdownRect = dropdown.getBoundingClientRect();
              const itemRect = item.getBoundingClientRect();
              
              // Check if item is visible in dropdown
              if (itemRect.bottom > dropdownRect.bottom) {
                dropdown.scrollTop += itemRect.bottom - dropdownRect.bottom + 4;
              } else if (itemRect.top < dropdownRect.top) {
                dropdown.scrollTop -= dropdownRect.top - itemRect.top + 4;
              }
            }
          });
          return newIndex;
        });
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const newIndex = prev > 0 ? prev - 1 : filteredItems.length - 1;
          // Scroll to item after state update
          requestAnimationFrame(() => {
            const dropdown = listRef.current;
            if (dropdown && dropdown.children[newIndex]) {
              const item = dropdown.children[newIndex] as HTMLElement;
              const dropdownRect = dropdown.getBoundingClientRect();
              const itemRect = item.getBoundingClientRect();
              
              // Check if item is visible in dropdown
              if (itemRect.top < dropdownRect.top) {
                dropdown.scrollTop -= dropdownRect.top - itemRect.top + 4;
              } else if (itemRect.bottom > dropdownRect.bottom) {
                dropdown.scrollTop += itemRect.bottom - dropdownRect.bottom + 4;
              }
            }
          });
          return newIndex;
        });
        break;
        
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
          handleItemSelect(filteredItems[highlightedIndex]);
        }
        break;
        
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Calculate dropdown position
  const getDropdownPosition = () => {
    if (!containerRef.current) return { top: 0, left: 0, width: 0 };
    
    const rect = containerRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const dropdownHeight = Math.min(240, Math.max(120, filteredItems.length * 40)); // Dynamic height
    
    let top = rect.bottom + 2; // Small gap
    let left = rect.left;
    let positioning = 'below';
    
    // Ensure dropdown doesn't go outside viewport width
    if (left + rect.width > windowWidth - 20) {
      left = windowWidth - rect.width - 20;
    }
    
    // If dropdown would go below viewport, position above
    if (rect.bottom + dropdownHeight > windowHeight - 20) {
      if (rect.top > dropdownHeight + 20) {
        top = rect.top - dropdownHeight - 2;
        positioning = 'above';
      } else {
        // If no space above or below, position at bottom with scrollable viewport
        const availableHeight = windowHeight - rect.bottom - 40;
        if (availableHeight > 100) {
          top = rect.bottom + 2;
          positioning = 'below-constrained';
        } else {
          // Use available space above
          top = 20;
          positioning = 'top-viewport';
        }
      }
    }
    
    return {
      top,
      left,
      width: rect.width,
      positioning
    };
  };

  // Update display value when value prop changes
  useEffect(() => {
    if (value) {
      setSearchQuery(getItemLabel(value));
    } else {
      setSearchQuery('');
    }
  }, [value, getItemLabel]);

  // Clear button handler
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange(null);
    setSearchQuery('');
    inputRef.current?.focus();
  };

  const position = isOpen ? getDropdownPosition() : null;

  const dropdown = isOpen && position && (
    <div
      className="fixed z-[99999] bg-white border border-gray-200 rounded-md shadow-xl max-h-[240px] overflow-y-auto overflow-x-hidden searchable-dropdown-scroll"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch', // iOS smooth scrolling
        pointerEvents: 'auto', // Ensure clicks work
        willChange: 'scroll-position' // Optimize scrolling
      }}
      ref={listRef}
      onMouseDown={(e) => e.preventDefault()} // Prevent blur when clicking dropdown
      onTouchStart={(e) => e.stopPropagation()} // Allow touch scrolling on mobile
      onWheel={(e) => {
        // Allow wheel scrolling and prevent event from bubbling up
        e.stopPropagation();
        const element = e.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = element;
        
        // Check if we're at the boundaries to allow parent scrolling if needed
        if (
          (e.deltaY < 0 && scrollTop === 0) ||
          (e.deltaY > 0 && scrollTop >= scrollHeight - clientHeight)
        ) {
          // At boundary, allow parent to handle
          return;
        }
        
        // Prevent parent scrolling when we can still scroll
        e.preventDefault();
      }}
    >
      {filteredItems.length === 0 ? (
        <div className="px-3 py-3 text-sm text-gray-500 text-center">
          No items found
        </div>
      ) : (
        filteredItems.map((item, index) => (
          <div
            key={getItemId(item)}
            className={cn(
              "px-3 py-2 cursor-pointer text-sm border-b border-gray-100 last:border-b-0 transition-colors duration-150 select-none",
              {
                "bg-blue-50 text-blue-600 font-medium": index === highlightedIndex,
                "hover:bg-gray-50": index !== highlightedIndex && !(value && getItemId(value) === getItemId(item)),
                "bg-blue-100 text-blue-700 font-medium": value && getItemId(value) === getItemId(item)
              }
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleItemSelect(item);
            }}
            onMouseEnter={() => setHighlightedIndex(index)}
            onMouseDown={(e) => e.preventDefault()} // Prevent blur when clicking item
            style={{ 
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none'
            }}
          >
            {getItemLabel(item)}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onWheel={(e) => {
            // Forward wheel events to dropdown when it's open
            if (isOpen && listRef.current) {
              e.preventDefault();
              const dropdown = listRef.current;
              dropdown.scrollTop += e.deltaY;
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-8"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>
      {typeof window !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}
