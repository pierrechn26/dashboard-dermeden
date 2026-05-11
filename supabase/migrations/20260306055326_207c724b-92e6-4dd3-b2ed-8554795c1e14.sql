CREATE TABLE public.api_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  edge_function TEXT NOT NULL,
  api_provider TEXT NOT NULL CHECK (api_provider IN ('gemini', 'perplexity')),
  model TEXT,
  tokens_used INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_api_usage_logs_created ON public.api_usage_logs(created_at);
CREATE INDEX idx_api_usage_logs_provider ON public.api_usage_logs(api_provider);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access api_usage_logs"
ON public.api_usage_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);