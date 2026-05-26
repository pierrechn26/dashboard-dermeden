-- Bloc 2 — Add tone_label column to diagnostic_sessions.
-- tone_label is a human-readable label derived from the dominant priority
-- (e.g. "Ludique", "Autonomie"). Per-tenant label maps live in tenant_config;
-- in the template the map is empty by default.
ALTER TABLE public.diagnostic_sessions
  ADD COLUMN IF NOT EXISTS tone_label TEXT;
