
ALTER TABLE public.marketing_recommendations
  ADD COLUMN IF NOT EXISTS ads_v2 jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS offers_v2 jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS emails_v2 jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS campaigns_overview jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommendation_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS generation_config jsonb NOT NULL DEFAULT '{}'::jsonb;
