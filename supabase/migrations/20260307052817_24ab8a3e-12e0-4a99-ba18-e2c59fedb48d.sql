
-- ================================================================
-- Sécuriser aski_chats et aski_messages
-- Remplacer ALL public par policies granulaires
-- Le frontend lit/écrit via anon key, les edge functions via service role
-- ================================================================

-- ── aski_chats ───────────────────────────────────────────────────────
-- Supprimer la policy ALL public existante
DROP POLICY IF EXISTS "Public full access aski_chats" ON public.aski_chats;

-- SELECT : anon key autorisé (pour charger la liste des chats)
CREATE POLICY "Anon can read aski_chats"
  ON public.aski_chats
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT : anon key autorisé (création d'un nouveau chat)
CREATE POLICY "Anon can insert aski_chats"
  ON public.aski_chats
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- UPDATE : anon key autorisé (renommer, archiver un chat)
CREATE POLICY "Anon can update aski_chats"
  ON public.aski_chats
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE : service role uniquement (pas de policy = deny pour anon)
-- (service role bypasse RLS nativement, aucune policy nécessaire)

-- ── aski_messages ────────────────────────────────────────────────────
-- Supprimer la policy ALL public existante
DROP POLICY IF EXISTS "Public full access aski_messages" ON public.aski_messages;

-- SELECT : anon key autorisé (pour charger l'historique du chat)
CREATE POLICY "Anon can read aski_messages"
  ON public.aski_messages
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT : anon key autorisé (les messages sont insérés par l'edge function aski-chat via service role, mais aussi en lecture compte mensuel)
CREATE POLICY "Anon can insert aski_messages"
  ON public.aski_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- UPDATE : service role uniquement (pas de policy = deny pour anon)
-- DELETE : service role uniquement (pas de policy = deny pour anon)
