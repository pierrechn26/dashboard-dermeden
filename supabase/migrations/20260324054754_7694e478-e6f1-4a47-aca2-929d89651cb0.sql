ALTER TABLE public.client_plan RENAME COLUMN recos_weekly_limit TO recos_monthly_limit;

UPDATE public.client_plan 
SET recos_monthly_limit = CASE 
  WHEN plan = 'starter' THEN 24 
  WHEN plan = 'growth' THEN 60 
  WHEN plan = 'scale' THEN 240 
  ELSE recos_monthly_limit 
END 
WHERE project_id = 'ouate';