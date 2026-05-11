
CREATE TABLE public.shopify_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_order_id TEXT UNIQUE NOT NULL,
  order_number TEXT,
  total_price DECIMAL,
  currency TEXT DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT now(),
  is_from_diagnostic BOOLEAN DEFAULT false,
  diagnostic_session_id TEXT,
  customer_email TEXT
);

-- Enable RLS
ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;

-- Service role full access (webhook inserts with service key)
CREATE POLICY "Service role full access orders"
  ON public.shopify_orders
  FOR ALL
  USING (true)
  WITH CHECK (true);
