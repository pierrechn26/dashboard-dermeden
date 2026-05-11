-- Update the validate_diagnostic_session trigger to accept the new deterministic tone values
CREATE OR REPLACE FUNCTION public.validate_diagnostic_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  -- Updated: accept all 5 deterministic tone values + legacy pedagogique
  IF NEW.adapted_tone IS NOT NULL AND NEW.adapted_tone NOT IN ('pedagogique', 'scientifique', 'emotionnel', 'ludique', 'playful', 'empowering', 'factual', 'transparent', 'expert') THEN
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
$function$