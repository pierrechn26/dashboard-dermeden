
CREATE TABLE public.aski_chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  is_archived BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_aski_chats_updated ON public.aski_chats(updated_at DESC);

CREATE TABLE public.aski_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.aski_chats(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  response_time_ms INTEGER DEFAULT 0
);

CREATE INDEX idx_aski_messages_chat ON public.aski_messages(chat_id, created_at ASC);
CREATE INDEX idx_aski_messages_created ON public.aski_messages(created_at DESC);

ALTER TABLE public.aski_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aski_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public full access aski_chats" ON public.aski_chats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access aski_messages" ON public.aski_messages FOR ALL USING (true) WITH CHECK (true);
