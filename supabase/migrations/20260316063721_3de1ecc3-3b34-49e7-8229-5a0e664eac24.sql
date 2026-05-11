
-- Add input_tokens, output_tokens, total_tokens columns to api_usage_logs
ALTER TABLE public.api_usage_logs
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created ON public.api_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider ON public.api_usage_logs(api_provider);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_model ON public.api_usage_logs(model);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_edge_function ON public.api_usage_logs(edge_function);

-- Backfill total_tokens from existing tokens_used column
UPDATE public.api_usage_logs SET total_tokens = COALESCE(tokens_used, 0) WHERE total_tokens = 0 OR total_tokens IS NULL;
