
ALTER TABLE public.diagnostic_sessions
  ADD COLUMN selected_cart_amount numeric NULL,
  ADD COLUMN cart_selected_at timestamptz NULL;
