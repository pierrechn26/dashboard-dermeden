ALTER TABLE public.diagnostic_sessions
  ADD COLUMN IF NOT EXISTS recommended_products TEXT,
  ADD COLUMN IF NOT EXISTS validated_products TEXT;