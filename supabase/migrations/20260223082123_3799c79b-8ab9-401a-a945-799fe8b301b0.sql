-- Add matching_score column to diagnostic_sessions
ALTER TABLE public.diagnostic_sessions ADD COLUMN IF NOT EXISTS matching_score integer;