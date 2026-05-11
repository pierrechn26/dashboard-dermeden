
-- Table to store AI-generated funnel recommendations
CREATE TABLE public.funnel_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  week_start DATE NOT NULL,
  step TEXT NOT NULL,
  issue TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMP WITH TIME ZONE,
  kept_from_previous BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.funnel_recommendations ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access recommendations"
  ON public.funnel_recommendations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for efficient weekly lookup
CREATE INDEX idx_funnel_recommendations_week ON public.funnel_recommendations(week_start DESC);
