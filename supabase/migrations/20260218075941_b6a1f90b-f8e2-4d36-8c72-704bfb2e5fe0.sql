ALTER TABLE public.diagnostic_sessions
  ADD COLUMN checkout_started boolean NOT NULL DEFAULT false,
  ADD COLUMN checkout_at timestamptz NULL;