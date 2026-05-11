ALTER TABLE public.marketing_recommendations 
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS pre_calculated_context jsonb;