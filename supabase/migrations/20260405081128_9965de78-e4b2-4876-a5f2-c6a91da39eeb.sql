-- Add weekly_trends_refresh column to market_intelligence
ALTER TABLE public.market_intelligence 
ADD COLUMN IF NOT EXISTS weekly_trends_refresh jsonb DEFAULT NULL;

-- Remove old weekly-recommendations cron
SELECT cron.unschedule('weekly-recommendations-monday');

-- Create new weekly-intelligence-refresh cron
SELECT cron.schedule(
  'weekly-intelligence-refresh',
  '0 7 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://btkjdqelvvqmtguhhkdv.supabase.co/functions/v1/weekly-intelligence-refresh',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2pkcWVsdnZxbXRndWhoa2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwODQ0MzUsImV4cCI6MjA4NTY2MDQzNX0.y7H-rbJ71lfGWncANeYcw3JNeWb1saGGYUkPFpkkdw8"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);