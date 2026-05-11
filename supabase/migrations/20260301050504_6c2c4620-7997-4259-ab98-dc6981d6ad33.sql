
-- ÉTAPE 1: Ajouter colonnes auto-détection sur personas
ALTER TABLE public.personas 
  ADD COLUMN IF NOT EXISTS is_auto_created BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detection_source VARCHAR CHECK (detection_source IN ('manual', 'new_cluster', 'split', 'recombination')),
  ADD COLUMN IF NOT EXISTS source_personas VARCHAR[],
  ADD COLUMN IF NOT EXISTS session_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_matching_score NUMERIC(5,2) DEFAULT 0;

-- Marquer les personas manuels existants
UPDATE public.personas 
SET detection_source = 'manual', is_auto_created = false 
WHERE code IN ('P0','P1','P2','P3','P4','P5','P6','P7','P8','P9');

-- ÉTAPE 2: Créer la table de log des détections
CREATE TABLE IF NOT EXISTS public.persona_detection_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  detection_type VARCHAR NOT NULL CHECK (detection_type IN ('new_cluster', 'split', 'recombination', 'deactivation', 'scan_no_result')),
  details JSONB NOT NULL,
  action_taken VARCHAR NOT NULL CHECK (action_taken IN ('created', 'deactivated', 'none')),
  persona_code_created VARCHAR,
  sessions_affected INTEGER DEFAULT 0
);

ALTER TABLE public.persona_detection_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access detection_log"
  ON public.persona_detection_log FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Personas detection log readable"
  ON public.persona_detection_log FOR SELECT
  USING (true);
