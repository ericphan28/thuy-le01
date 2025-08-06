"use client"

import { useState, useEffect } from 'react'
import { Search, Filter, X, AlertTriangle, Package, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu'
import { motion, AnimatePresence } from 'framer-motion'

interface Category {
  category_id: number
  category_name: string
}

interface ProductSearchProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  categories: Category[]
  selectedCategory: number | null
  onCategoryChange: (categoryId: number | null) => void
  sortBy: 'name' | 'price' | 'stock'
  sortOrder: 'asc' | 'desc'
  onSortChange: (sortBy: 'name' | 'price' | 'stock', order: 'asc' | 'desc') => void
  quickFilters: {
    lowStock: boolean
  }
  onQuickFilterChange: (filter: 'lowStock', value: boolean) => void
  totalCount: number
  isLoading?: boolean
  showOnlyInStock: boolean
  onShowOnlyInStockChange: (value: boolean) => void
}

export function ProductSearch({
  searchTerm,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  sortBy,
  sortOrder,
  onSortChange,
  quickFilters,
  onQuickFilterChange,
  totalCount,
  isLoading = false,
  showOnlyInStock,
  onShowOnlyInStockChange
}: ProductSearchProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Generate search suggestions based on input
  useEffect(() => {
    const commonSearchTerms = [
      'thuốc kháng sinh', 'vitamin', 'thức ăn chó', 'thức ăn mèo',
      'vắc xin', 'thuốc tẩy giun', 'phụ kiện', 'dịch vụ',
      'thuốc da liễu', 'thuốc tiêu hóa', 'thuốc mắt'
    ]
    
    if (searchTerm.length > 1) {
      const filtered = commonSearchTerms.filter(term =>
        term.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 5)
      setSearchSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }, [searchTerm])

  const handleSortClick = (newSortBy: 'name' | 'price' | 'stock') => {
    if (sortBy === newSortBy) {
      // Toggle order if same sort field
      onSortChange(newSortBy, sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // Default to asc for new sort field
      onSortChange(newSortBy, 'asc')
    }
  }

  const activeFiltersCount = Object.values(quickFilters).filter(Boolean).length + 
    (selectedCategory ? 1 : 0)

  const clearAllFilters = () => {
    onCategoryChange(null)
    onQuickFilterChange('lowStock', false)
    onSearchChange('')
  }

  return (
    <div className="space-y-3">
      {/* Main Search Bar */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên, mã sản phẩm, danh mục..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="supabase-input pl-10 pr-20"
            onFocus={() => setShowSuggestions(searchSuggestions.length > 0)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          
          {/* Advanced Search Toggle */}
          <div className="absolute right-2 top-1 flex items-center gap-1">
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="h-6 px-2 text-xs bg-brand/20 text-brand">
                {activeFiltersCount}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="h-8 w-8 p-0 hover:bg-brand/10"
            >
              <Filter className={`h-4 w-4 transition-colors ${
                showAdvanced ? 'text-brand' : 'text-muted-foreground'
              }`} />
            </Button>
          </div>
        </div>

        {/* Search Suggestions */}
        <AnimatePresence>
          {showSuggestions && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-900 border border-border rounded-lg shadow-lg overflow-hidden"
            >
              {searchSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => {
                    onSearchChange(suggestion)
                    setShowSuggestions(false)
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <Search className="h-3 w-3 text-muted-foreground" />
                  {suggestion}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Advanced Filters */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
              {/* Quick Filters */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Bộ lọc nhanh</label>

                {/* Tối ưu filter badges - Gọn gàng hơn */}
                <div className="flex items-center gap-2">
                  {/* Toggle "Chỉ còn hàng" */}
                  <Badge
                    variant={showOnlyInStock ? "default" : "outline"}
                    className={`cursor-pointer transition-all text-xs ${
                      showOnlyInStock 
                        ? 'bg-green-600 text-white hover:bg-green-700' 
                        : 'hover:bg-green-50 hover:text-green-700 hover:border-green-300'
                    }`}
                    onClick={() => onShowOnlyInStockChange(!showOnlyInStock)}
                  >
                    <Package className="w-3 h-3 mr-1" />
                    <span className="hidden sm:inline">Chỉ còn hàng</span>
                    <span className="sm:hidden">Còn hàng</span>
                  </Badge>

                  {/* Filter "Hàng sắp hết" */}
                  <Badge
                    variant={quickFilters.lowStock ? "default" : "outline"}
                    className={`cursor-pointer transition-all text-xs ${
                      quickFilters.lowStock 
                        ? 'bg-red-600 text-white hover:bg-red-700' 
                        : 'hover:bg-red-50 hover:text-red-700 hover:border-red-300'
                    }`}
                    onClick={() => onQuickFilterChange('lowStock', !quickFilters.lowStock)}
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    <span className="hidden sm:inline">Hàng sắp hết</span>
                    <span className="sm:hidden">Sắp hết</span>
                  </Badge>
                </div>
              </div>

              {/* Category & Sort Row */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Category Filter */}
                <div className="flex-1">
                  <label className="text-sm font-medium text-foreground block mb-2">Danh mục</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between supabase-button-secondary"
                      >
                        {selectedCategory 
                          ? categories.find(c => c.category_id === selectedCategory)?.category_name
                          : 'Tất cả danh mục'
                        }
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>Chọn danh mục</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onCategoryChange(null)}>
                        Tất cả danh mục
                      </DropdownMenuItem>
                      {categories.map((category) => (
                        <DropdownMenuItem
                          key={category.category_id}
                          onClick={() => onCategoryChange(category.category_id)}
                        >
                          {category.category_name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Sort Options */}
                <div className="flex-1">
                  <label className="text-sm font-medium text-foreground block mb-2">Sắp xếp</label>
                  <div className="grid grid-cols-3 gap-1 sm:gap-2">
                    <Button
                      variant={sortBy === 'name' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSortClick('name')}
                      className={`text-xs ${
                        sortBy === 'name' 
                          ? 'bg-brand text-brand-foreground hover:bg-brand/90' 
                          : 'supabase-button-secondary'
                      }`}
                    >
                      Tên {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button
                      variant={sortBy === 'price' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSortClick('price')}
                      className={`text-xs ${
                        sortBy === 'price' 
                          ? 'bg-brand text-brand-foreground hover:bg-brand/90' 
                          : 'supabase-button-secondary'
                      }`}
                    >
                      Giá {sortBy === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </Button>
                    <Button
                      variant={sortBy === 'stock' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSortClick('stock')}
                      className={`text-xs ${
                        sortBy === 'stock' 
                          ? 'bg-brand text-brand-foreground hover:bg-brand/90' 
                          : 'supabase-button-secondary'
                      }`}
                    >
                      Kho {sortBy === 'stock' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Clear Filters */}
              {activeFiltersCount > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Xóa bộ lọc ({activeFiltersCount})
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {isLoading ? 'Đang tìm...' : `${totalCount} sản phẩm`}
          </span>
          {searchTerm && (
            <Badge variant="outline" className="text-xs">
              &ldquo;{searchTerm}&rdquo;
            </Badge>
          )}
        </div>
        
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <Filter className="w-3 h-3" />
            {activeFiltersCount} bộ lọc đang áp dụng
          </div>
        )}
      </div>
    </div>
  )
}
