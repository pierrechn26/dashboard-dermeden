-- === Phase 2.E — Cron weekly: scrape-commercial-facts ===
-- Cf. backlog #2.7 et #5.3.
-- Schedule: Monday 08:00 UTC. Calls scrape-commercial-facts which reads
-- tenant_config.website_url, walks the footer/nav links, and refreshes
-- tenant_commercial_facts via Gemini Flash extraction.
--
-- IMPORTANT for the onboarding runbook: the URL hardcoded below points to
-- the template's project_ref (btkjdqelvvqmtguhhkdv). Each new tenant has a
-- distinct Supabase project and must update this URL + JWT (anon key)
-- after the migration is replayed in their project. Same convention as the
-- existing weekly-intelligence-refresh cron.
--
-- pg_cron and pg_net extensions are already enabled by earlier migrations
-- (20260219005453, 20260329104714) so no extension setup is needed here.

SELECT cron.schedule(
  'scrape-commercial-facts-weekly',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://btkjdqelvvqmtguhhkdv.supabase.co/functions/v1/scrape-commercial-facts',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2pkcWVsdnZxbXRndWhoa2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwODQ0MzUsImV4cCI6MjA4NTY2MDQzNX0.y7H-rbJ71lfGWncANeYcw3JNeWb1saGGYUkPFpkkdw8"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);
