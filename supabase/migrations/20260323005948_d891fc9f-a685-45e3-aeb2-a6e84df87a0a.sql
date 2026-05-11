
-- 1. TABLE client_plan
CREATE TABLE IF NOT EXISTS public.client_plan (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'scale')),
  sessions_limit integer NOT NULL DEFAULT 500,
  aski_limit integer NOT NULL DEFAULT 100,
  recos_weekly_limit integer NOT NULL DEFAULT 6,
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access client_plan"
  ON public.client_plan FOR ALL
  TO public USING (true) WITH CHECK (true);

CREATE TRIGGER update_client_plan_updated_at
  BEFORE UPDATE ON public.client_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. TABLE usage_tracking
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'weekly')),
  period_start date NOT NULL,
  sessions_used integer NOT NULL DEFAULT 0,
  aski_conversations_used integer NOT NULL DEFAULT 0,
  recos_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, period_type, period_start)
);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access usage_tracking"
  ON public.usage_tracking FOR ALL
  TO public USING (true) WITH CHECK (true);

CREATE TRIGGER update_usage_tracking_updated_at
  BEFORE UPDATE ON public.usage_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Insérer Ouate : plan Scale
INSERT INTO public.client_plan (project_id, plan, sessions_limit, aski_limit, recos_weekly_limit, billing_cycle)
VALUES ('ouate', 'scale', 50000, 2000, 60, 'annual')
ON CONFLICT (project_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      sessions_limit = EXCLUDED.sessions_limit,
      aski_limit = EXCLUDED.aski_limit,
      recos_weekly_limit = EXCLUDED.recos_weekly_limit,
      billing_cycle = EXCLUDED.billing_cycle,
      updated_at = now();
