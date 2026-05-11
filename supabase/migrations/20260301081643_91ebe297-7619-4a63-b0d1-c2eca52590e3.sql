
-- Create ouate_products table for Shopify product sync
CREATE TABLE public.ouate_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_product_id BIGINT UNIQUE NOT NULL,
  title VARCHAR NOT NULL,
  handle VARCHAR NOT NULL,
  description TEXT,
  product_type VARCHAR,
  vendor VARCHAR,
  tags TEXT[],
  price_min NUMERIC(10,2),
  price_max NUMERIC(10,2),
  variants JSONB,
  images JSONB,
  status VARCHAR DEFAULT 'active',
  published_at TIMESTAMPTZ,
  shopify_url TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ouate_products_status ON public.ouate_products(status);
CREATE INDEX idx_ouate_products_title ON public.ouate_products(title);

-- RLS
ALTER TABLE public.ouate_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ouate_products"
ON public.ouate_products
FOR SELECT
USING (true);

CREATE POLICY "Service role full access ouate_products"
ON public.ouate_products
FOR ALL
USING (true)
WITH CHECK (true);
