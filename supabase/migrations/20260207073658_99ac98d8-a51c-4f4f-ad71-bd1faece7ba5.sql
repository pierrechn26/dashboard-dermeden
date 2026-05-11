
-- =============================================
-- Table: diagnostic_sessions
-- =============================================
CREATE TABLE IF NOT EXISTS public.diagnostic_sessions (
  -- Identification & Tracking
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code VARCHAR UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR NOT NULL DEFAULT 'en_cours',
  source VARCHAR,
  utm_campaign VARCHAR,
  device VARCHAR,
  user_name VARCHAR,
  relationship VARCHAR,
  email VARCHAR,
  phone VARCHAR,
  optin_email BOOLEAN DEFAULT false,
  optin_sms BOOLEAN DEFAULT false,
  number_of_children INTEGER,
  locale VARCHAR,
  result_url VARCHAR,

  -- Personas & IA
  persona_detected VARCHAR,
  persona_matching_score INTEGER,
  adapted_tone VARCHAR,
  ai_key_messages TEXT,
  ai_suggested_segment VARCHAR,

  -- Business & Conversion
  conversion BOOLEAN DEFAULT false,
  exit_type VARCHAR,
  existing_ouate_products TEXT,
  is_existing_client BOOLEAN DEFAULT false,
  recommended_cart_amount DECIMAL(10,2),
  validated_cart_amount DECIMAL(10,2),
  upsell_potential VARCHAR,

  -- Comportement
  duration_seconds INTEGER,
  abandoned_at_step VARCHAR,
  question_path TEXT,
  back_navigation_count INTEGER DEFAULT 0,
  has_optional_details BOOLEAN DEFAULT false,
  behavior_tags TEXT,
  engagement_score INTEGER,

  -- Questions globales (phase 4)
  routine_size_preference VARCHAR,
  priorities_ordered TEXT,
  trust_triggers_ordered TEXT,
  content_format_preference VARCHAR,

  -- Données cachées (pour calculs internes)
  avg_response_time FLOAT,
  total_text_length INTEGER,
  has_detailed_responses BOOLEAN DEFAULT false,
  step_timestamps JSONB
);

-- Validation trigger for enum-like fields (instead of CHECK constraints for flexibility)
CREATE OR REPLACE FUNCTION public.validate_diagnostic_session()
RETURNS TRIGGER AS $$
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
  IF NEW.persona_matching_score IS NOT NULL AND (NEW.persona_matching_score < 0 OR NEW.persona_matching_score > 100) THEN
    RAISE EXCEPTION 'persona_matching_score must be between 0 and 100';
  END IF;
  IF NEW.engagement_score IS NOT NULL AND (NEW.engagement_score < 0 OR NEW.engagement_score > 100) THEN
    RAISE EXCEPTION 'engagement_score must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trigger_validate_diagnostic_session
  BEFORE INSERT OR UPDATE ON public.diagnostic_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_diagnostic_session();

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_code ON public.diagnostic_sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON public.diagnostic_sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON public.diagnostic_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.diagnostic_sessions(status);

-- =============================================
-- Table: diagnostic_children
-- =============================================
CREATE TABLE IF NOT EXISTS public.diagnostic_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.diagnostic_sessions(id) ON DELETE CASCADE,
  child_index INTEGER NOT NULL,

  -- Infos enfant
  first_name VARCHAR,
  birth_date DATE,
  age INTEGER,
  age_range VARCHAR,
  skin_concern VARCHAR,

  -- Routine
  has_routine BOOLEAN,
  routine_satisfaction INTEGER,
  routine_issue VARCHAR,
  routine_issue_details TEXT,
  has_ouate_products BOOLEAN,
  ouate_products TEXT,
  existing_routine_description TEXT,

  -- Réactivité
  skin_reactivity VARCHAR,
  reactivity_details TEXT,
  exclude_fragrance BOOLEAN DEFAULT false,

  -- Questions dynamiques IA
  dynamic_question_1 TEXT,
  dynamic_answer_1 TEXT,
  dynamic_question_2 TEXT,
  dynamic_answer_2 TEXT,
  dynamic_question_3 TEXT,
  dynamic_answer_3 TEXT,
  dynamic_insight_targets TEXT,

  UNIQUE(session_id, child_index)
);

-- Validation trigger for children
CREATE OR REPLACE FUNCTION public.validate_diagnostic_child()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.age_range IS NOT NULL AND NEW.age_range NOT IN ('4-6', '7-9', '10-11') THEN
    RAISE EXCEPTION 'Invalid age_range: %', NEW.age_range;
  END IF;
  IF NEW.skin_concern IS NOT NULL AND NEW.skin_concern NOT IN ('imperfections', 'sensible', 'seche', 'atopique', 'normale') THEN
    RAISE EXCEPTION 'Invalid skin_concern: %', NEW.skin_concern;
  END IF;
  IF NEW.routine_issue IS NOT NULL AND NEW.routine_issue NOT IN ('not_adapted', 'no_visible_results', 'not_tolerated', 'too_complicated', 'other') THEN
    RAISE EXCEPTION 'Invalid routine_issue: %', NEW.routine_issue;
  END IF;
  IF NEW.skin_reactivity IS NOT NULL AND NEW.skin_reactivity NOT IN ('environment', 'products', 'no') THEN
    RAISE EXCEPTION 'Invalid skin_reactivity: %', NEW.skin_reactivity;
  END IF;
  IF NEW.routine_satisfaction IS NOT NULL AND (NEW.routine_satisfaction < 0 OR NEW.routine_satisfaction > 10) THEN
    RAISE EXCEPTION 'routine_satisfaction must be between 0 and 10';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trigger_validate_diagnostic_child
  BEFORE INSERT OR UPDATE ON public.diagnostic_children
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_diagnostic_child();

CREATE INDEX IF NOT EXISTS idx_children_session ON public.diagnostic_children(session_id);

-- =============================================
-- Function: generate_session_code (auto-generate if null)
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_session_code()
RETURNS TRIGGER AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  IF NEW.session_code IS NULL THEN
    LOOP
      result := '';
      FOR i IN 1..7 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.diagnostic_sessions WHERE session_code = result);
    END LOOP;
    NEW.session_code := result;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trigger_generate_session_code
  BEFORE INSERT ON public.diagnostic_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_session_code();

-- =============================================
-- RLS Policies
-- =============================================
ALTER TABLE public.diagnostic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_children ENABLE ROW LEVEL SECURITY;

-- Service role full access (edge functions use service role key)
CREATE POLICY "Service role full access sessions" ON public.diagnostic_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access children" ON public.diagnostic_children
  FOR ALL USING (true) WITH CHECK (true);
