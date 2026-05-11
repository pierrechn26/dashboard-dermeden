
-- Add persona_code column to diagnostic_sessions
ALTER TABLE public.diagnostic_sessions 
ADD COLUMN IF NOT EXISTS persona_code VARCHAR(3);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_persona_code 
ON public.diagnostic_sessions(persona_code);

-- Backfill persona_code for all completed sessions using the decision tree
-- We need to join with diagnostic_children to get skin_concern, age_range, has_routine, skin_reactivity
UPDATE public.diagnostic_sessions ds
SET persona_code = (
  SELECT 
    CASE
      -- P8: existing client + imperfections
      WHEN ds.is_existing_client = true AND c1.skin_concern = 'imperfections' THEN 'P8'
      -- P9: existing client + other skin
      WHEN ds.is_existing_client = true AND (c1.skin_concern IS NULL OR c1.skin_concern != 'imperfections') THEN 'P9'
      -- P5: multi-children with different skin concerns
      WHEN ds.number_of_children >= 2 AND c1.skin_concern IS DISTINCT FROM c2.skin_concern AND c2.skin_concern IS NOT NULL THEN 'P5'
      -- P7: has routine (not existing client)
      WHEN c1.has_routine = true AND (ds.is_existing_client = false OR ds.is_existing_client IS NULL) THEN 'P7'
      -- P2: imperfections + pre-teen 10-11
      WHEN c1.skin_concern = 'imperfections' AND c1.age_range = '10-11' THEN 'P2'
      -- P1: imperfections + child 4-9 or unspecified
      WHEN c1.skin_concern = 'imperfections' AND (c1.age_range IN ('4-6', '7-9') OR c1.age_range IS NULL) THEN 'P1'
      -- P3: atopic
      WHEN c1.skin_concern = 'atopique' THEN 'P3'
      -- P4: sensitive
      WHEN c1.skin_concern = 'sensible' THEN 'P4'
      -- P6: dry or normal
      WHEN c1.skin_concern IN ('seche', 'normale') THEN 'P6'
      -- Default: P6 for any other case
      ELSE 'P6'
    END
  FROM public.diagnostic_children c1
  LEFT JOIN public.diagnostic_children c2 
    ON c2.session_id = ds.id AND c2.child_index = 1
  WHERE c1.session_id = ds.id AND c1.child_index = 0
  LIMIT 1
)
WHERE ds.status = 'termine' AND ds.persona_code IS NULL;
