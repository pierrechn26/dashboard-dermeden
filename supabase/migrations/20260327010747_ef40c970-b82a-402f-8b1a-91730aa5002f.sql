CREATE POLICY "Anon can insert api_usage_logs"
  ON public.api_usage_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);