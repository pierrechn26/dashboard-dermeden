-- ═══════════════════════════════════════════════
-- TABLE 1: market_intelligence
-- ═══════════════════════════════════════════════
CREATE TABLE public.market_intelligence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL DEFAULT 'ouate',
  month_year text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  perplexity_ads jsonb DEFAULT '{}'::jsonb,
  perplexity_email jsonb DEFAULT '{}'::jsonb,
  perplexity_offers jsonb DEFAULT '{}'::jsonb,
  gemini_ads_analysis jsonb DEFAULT '{}'::jsonb,
  gemini_email_analysis jsonb DEFAULT '{}'::jsonb,
  gemini_offers_analysis jsonb DEFAULT '{}'::jsonb,
  personas_snapshot jsonb DEFAULT '{}'::jsonb,
  client_context jsonb DEFAULT '{}'::jsonb,
  generation_duration_ms integer,
  models_used jsonb DEFAULT '{}'::jsonb,
  error_log text,
  CONSTRAINT market_intelligence_project_month_unique UNIQUE (project_id, month_year)
);

CREATE TRIGGER update_market_intelligence_updated_at
  BEFORE UPDATE ON public.market_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.market_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access market_intelligence"
  ON public.market_intelligence FOR ALL TO public
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════
-- TABLE 2: marketing_sources
-- ═══════════════════════════════════════════════
CREATE TABLE public.marketing_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL DEFAULT 'ouate',
  category text NOT NULL,
  source_name text NOT NULL,
  source_url text,
  description text,
  tier integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT marketing_sources_category_check CHECK (category IN ('ads', 'email', 'offers'))
);

ALTER TABLE public.marketing_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access marketing_sources"
  ON public.marketing_sources FOR ALL TO public
  USING (true) WITH CHECK (true);