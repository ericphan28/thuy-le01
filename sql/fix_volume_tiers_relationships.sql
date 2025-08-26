-- ✅ Fix Volume Tiers Relationships - Add Missing Foreign Key Constraints

-- Add foreign key constraint for product_id to products table
ALTER TABLE public.volume_tiers 
ADD CONSTRAINT fk_volume_tiers_product_id 
FOREIGN KEY (product_id) REFERENCES public.products(product_id) 
ON UPDATE CASCADE ON DELETE CASCADE;

-- Add foreign key constraint for category_id to product_categories table  
ALTER TABLE public.volume_tiers 
ADD CONSTRAINT fk_volume_tiers_category_id 
FOREIGN KEY (category_id) REFERENCES public.product_categories(category_id) 
ON UPDATE CASCADE ON DELETE CASCADE;

-- Add check constraint to ensure either product_id or category_id is set (but not both)
ALTER TABLE public.volume_tiers 
ADD CONSTRAINT check_volume_tiers_scope 
CHECK (
  (product_id IS NOT NULL AND category_id IS NULL) OR 
  (product_id IS NULL AND category_id IS NOT NULL)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_volume_tiers_product_id 
ON public.volume_tiers(product_id) 
WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_volume_tiers_category_id 
ON public.volume_tiers(category_id) 
WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_volume_tiers_scope_active 
ON public.volume_tiers(scope, is_active) 
WHERE is_active = true;

-- Create composite index for pricing queries
CREATE INDEX IF NOT EXISTS idx_volume_tiers_pricing 
ON public.volume_tiers(product_id, min_qty, is_active) 
WHERE product_id IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_volume_tiers_category_pricing 
ON public.volume_tiers(category_id, min_qty, is_active) 
WHERE category_id IS NOT NULL AND is_active = true;

-- Verify the relationships are working
SELECT 
  'volume_tiers -> products' as relationship,
  COUNT(*) as count
FROM volume_tiers vt 
LEFT JOIN products p ON vt.product_id = p.product_id 
WHERE vt.product_id IS NOT NULL;

SELECT 
  'volume_tiers -> product_categories' as relationship,
  COUNT(*) as count  
FROM volume_tiers vt 
LEFT JOIN product_categories pc ON vt.category_id = pc.category_id 
WHERE vt.category_id IS NOT NULL;
