CREATE TABLE public.recommendation_staging (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'step1_pending',
  generation_type text NOT NULL,
  persona_data jsonb,
  perplexity_results jsonb,
  gemini_synthesis jsonb,
  client_context jsonb,
  error_message text,
  expires_at timestamptz DEFAULT (now() + interval '15 minutes')
);

ALTER TABLE public.recommendation_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access recommendation_staging"
  ON public.recommendation_staging
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_recommendation_staging_status ON public.recommendation_staging(status);
CREATE INDEX idx_recommendation_staging_expires_at ON public.recommendation_staging(expires_at);