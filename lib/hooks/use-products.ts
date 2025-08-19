"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { productService, Product, ProductCategory, ProductFilters, ProductStats } from '@/lib/services/product-service'

export function useProducts(externalFilters: ProductFilters = {}) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0
  })

  // Use external filters directly to avoid state sync issues
  // Simple pass-through; rely on caller to provide stable object or accept re-fetch
  const filters = externalFilters

  // Create a stable key for filters to satisfy exhaustive-deps without deep compare each render
  const filtersKey = JSON.stringify(filters);

  const fetchProducts = useCallback(async () => {
    try {
      console.log('🔄 useProducts.fetchProducts called with filters:', filters)
      setLoading(true)
      setError(null)
      const result = await productService.getProducts(filters)
      
      console.log('📋 Products fetched:', { 
        count: result.products.length, 
        total: result.total,
        page: result.page 
      })
      
      setProducts(result.products)
      setPagination({
        page: result.page,
        limit: result.limit,
        total: result.total,
        total_pages: result.total_pages
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch products'
      setError(errorMessage)
      console.error('useProducts.fetchProducts error:', err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    console.log('🔄 useProducts.useEffect triggered - filters changed:', filters)
    fetchProducts()
  }, [fetchProducts, filters])

  const updateFilters = useCallback((newFilters: Partial<ProductFilters>) => {
    console.log('🔧 updateFilters called:', { 
      oldFilters: filters, 
      newFilters, 
      merged: { ...filters, ...newFilters, page: newFilters.page || 1 }
    })
    // This function is not needed anymore since we use external filters directly
    // Just log for debugging
  }, [filters])

  const refetch = useCallback(() => {
    fetchProducts()
  }, [fetchProducts])

  return {
    products,
    loading,
    error,
    pagination,
    filters,
    updateFilters,
    refetch
  }
}

export function useProductCategories() {
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await productService.getCategories()
        setCategories(data)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch categories'
        setError(errorMessage)
        console.error('useProductCategories error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCategories()
  }, [])

  return { categories, loading, error }
}

export function useProductStats() {
  const [stats, setStats] = useState<ProductStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await productService.getProductStats()
      setStats(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch stats'
      setError(errorMessage)
      console.error('useProductStats error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, error, refetch: fetchStats }
}

export function useProduct(productId: number | null) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!productId) {
      setProduct(null)
      return
    }

    const fetchProduct = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await productService.getProductById(productId)
        setProduct(data)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch product'
        setError(errorMessage)
        console.error('useProduct error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [productId])

  return { product, loading, error }
}

export function useBrands() {
  const [brands, setBrands] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await productService.getBrands()
        setBrands(data)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch brands'
        setError(errorMessage)
        console.error('useBrands error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchBrands()
  }, [])

  return { brands, loading, error }
}
