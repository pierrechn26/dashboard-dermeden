
-- Add new V3 columns to marketing_recommendations
ALTER TABLE public.marketing_recommendations
  ADD COLUMN IF NOT EXISTS brief text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sources_inspirations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS persona_cible text,
  ADD COLUMN IF NOT EXISTS persona_code text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS action_status text NOT NULL DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_results jsonb,
  ADD COLUMN IF NOT EXISTS feedback_score text,
  ADD COLUMN IF NOT EXISTS feedback_entered_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_notes text;
