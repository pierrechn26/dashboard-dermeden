
-- Create recommendation_usage table
CREATE TABLE public.recommendation_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  month_year text NOT NULL,
  total_generated integer NOT NULL DEFAULT 0,
  monthly_limit integer NOT NULL DEFAULT 36,
  plan text NOT NULL DEFAULT 'starter',
  generations_log jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT recommendation_usage_project_month_unique UNIQUE (project_id, month_year)
);

-- Enable RLS
ALTER TABLE public.recommendation_usage ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access recommendation_usage"
  ON public.recommendation_usage
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- updated_at trigger
CREATE TRIGGER update_recommendation_usage_updated_at
  BEFORE UPDATE ON public.recommendation_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add generation_type column to marketing_recommendations
ALTER TABLE public.marketing_recommendations
  ADD COLUMN IF NOT EXISTS generation_type text DEFAULT 'global';

-- Add generated_categories column to marketing_recommendations
ALTER TABLE public.marketing_recommendations
  ADD COLUMN IF NOT EXISTS generated_categories jsonb DEFAULT '["ads","offers","emails"]'::jsonb;
