
-- Drop old personas table if it exists (has different schema) and recreate
DROP TABLE IF EXISTS public.personas CASCADE;

-- Create new personas table — source unique de vérité
CREATE TABLE public.personas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR NOT NULL UNIQUE,
  name VARCHAR NOT NULL,
  full_label VARCHAR NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  is_pool BOOLEAN DEFAULT FALSE,
  min_sessions INTEGER DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_personas_code ON public.personas(code);

-- Enable RLS
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Personas publicly readable"
  ON public.personas FOR SELECT USING (true);

-- Service role full access
CREATE POLICY "Service role full access personas"
  ON public.personas FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_personas_updated_at
  BEFORE UPDATE ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Also fix the validate_diagnostic_session trigger — remove reference to deleted column
CREATE OR REPLACE FUNCTION public.validate_diagnostic_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('en_cours', 'termine', 'abandonne') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: en_cours, termine, abandonne', NEW.status;
  END IF;
  IF NEW.source IS NOT NULL AND NEW.source NOT IN ('ads', 'direct', 'email', 'social', 'qrcode', 'partenaire') THEN
    RAISE EXCEPTION 'Invalid source: %', NEW.source;
  END IF;
  IF NEW.device IS NOT NULL AND NEW.device NOT IN ('mobile', 'desktop', 'tablet') THEN
    RAISE EXCEPTION 'Invalid device: %', NEW.device;
  END IF;
  IF NEW.relationship IS NOT NULL AND NEW.relationship NOT IN ('parent_mama', 'parent_papa', 'beau_parent', 'grand_parent', 'autre') THEN
    RAISE EXCEPTION 'Invalid relationship: %', NEW.relationship;
  END IF;
  IF NEW.adapted_tone IS NOT NULL AND NEW.adapted_tone NOT IN ('pedagogique', 'scientifique', 'emotionnel', 'ludique') THEN
    RAISE EXCEPTION 'Invalid adapted_tone: %', NEW.adapted_tone;
  END IF;
  IF NEW.exit_type IS NOT NULL AND NEW.exit_type NOT IN ('cta_principal', 'cta_secondaire', 'abandon') THEN
    RAISE EXCEPTION 'Invalid exit_type: %', NEW.exit_type;
  END IF;
  IF NEW.upsell_potential IS NOT NULL AND NEW.upsell_potential NOT IN ('faible', 'moyen', 'eleve') THEN
    RAISE EXCEPTION 'Invalid upsell_potential: %', NEW.upsell_potential;
  END IF;
  IF NEW.routine_size_preference IS NOT NULL AND NEW.routine_size_preference NOT IN ('minimal', 'simple', 'complete') THEN
    RAISE EXCEPTION 'Invalid routine_size_preference: %', NEW.routine_size_preference;
  END IF;
  IF NEW.content_format_preference IS NOT NULL AND NEW.content_format_preference NOT IN ('visual', 'short', 'complete') THEN
    RAISE EXCEPTION 'Invalid content_format_preference: %', NEW.content_format_preference;
  END IF;
  IF NEW.engagement_score IS NOT NULL AND (NEW.engagement_score < 0 OR NEW.engagement_score > 100) THEN
    RAISE EXCEPTION 'engagement_score must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$;
