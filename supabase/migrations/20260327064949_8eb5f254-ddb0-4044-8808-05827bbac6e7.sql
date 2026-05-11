CREATE TABLE public.aski_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  category text NOT NULL CHECK (category IN ('brand_directive', 'content_rule', 'channel_preference')),
  insight text NOT NULL,
  confidence integer NOT NULL DEFAULT 1,
  source_chat_ids uuid[] NOT NULL DEFAULT '{}',
  last_confirmed_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '60 days')
);

ALTER TABLE public.aski_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access aski_memory" ON public.aski_memory FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX idx_aski_memory_active ON public.aski_memory (is_active, confidence DESC) WHERE is_active = true;