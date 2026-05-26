-- Bloc 2 — Add granular UTM tracking columns to diagnostic_sessions.
-- utm_source / utm_campaign already exist as top-level columns; this migration
-- adds the remaining standard UTM fields plus paid-ads click identifiers so
-- the webhook can persist them without resorting to JSONB.
ALTER TABLE public.diagnostic_sessions
  ADD COLUMN IF NOT EXISTS utm_medium  TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term    TEXT,
  ADD COLUMN IF NOT EXISTS gclid       TEXT,
  ADD COLUMN IF NOT EXISTS fbclid      TEXT;
