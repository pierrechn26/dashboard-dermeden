
CREATE TABLE public.marketing_recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  persona_focus JSONB,
  checklist JSONB,
  ads_recommendations JSONB,
  email_recommendations JSONB,
  offers_recommendations JSONB,
  sources_consulted JSONB,
  status VARCHAR DEFAULT 'active'
);

ALTER TABLE public.marketing_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access marketing_recommendations"
  ON public.marketing_recommendations
  FOR ALL
  USING (true)
  WITH CHECK (true);
