-- === Phase 2.C-prereq : align template schema with Cottan for webhook hardening ===
-- Cf. backlog #2.9 (Stratégie C+ shopify-order-webhook) and #2.10 (protectExitType progression).
-- The backlog spec assumes 6 protected fields on diagnostic_sessions; 4 already exist
-- in the template, but `shopify_order_id` and `upsells_converted` were added on the
-- Cottan branch and never propagated. Same for the exit_type progression values
-- ('completed', 'checkout', 'converted') referenced by protectExitType — currently
-- blocked by the validate_diagnostic_session trigger.

-- 1. Add shopify_order_id on diagnostic_sessions
-- Stores the matched Shopify order ID after a successful conversion. Read by the
-- webhook to detect re-webhook with a different ID (refund/edit signal). Indexed
-- to support fast lookup. The legacy `shopify_orders.shopify_order_id` was on a
-- different (now dropped) table — no migration path needed.
ALTER TABLE public.diagnostic_sessions
ADD COLUMN IF NOT EXISTS shopify_order_id VARCHAR;

CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_shopify_order_id
ON public.diagnostic_sessions(shopify_order_id)
WHERE shopify_order_id IS NOT NULL;

-- 2. Add upsells_converted on diagnostic_sessions
-- Quantitative count of upsell products in the validated cart at conversion.
-- Distinct from upsell_potential (qualitative pre-conversion indicator: faible
-- /moyen/eleve). Type INTEGER NULL: NULL = not tracked, 0+ = measured count.
-- No code currently writes this; reserved for future upsell-tracking logic.
-- Listed in backlog #2.9 as a Shopify-protected field once conversion=true.
ALTER TABLE public.diagnostic_sessions
ADD COLUMN IF NOT EXISTS upsells_converted INTEGER;

-- 3. Extend validate_diagnostic_session trigger to accept the backlog #2.10
-- exit_type progression values: 'completed', 'checkout', 'converted'. The
-- existing values 'cta_principal', 'cta_secondaire', 'abandon' are preserved
-- for backward compatibility. The trigger function is replaced (CREATE OR
-- REPLACE) — only the exit_type IN-list is modified, all other branches
-- (status, source, device, relationship, adapted_tone, upsell_potential,
-- routine_size_preference, content_format_preference, engagement_score) are
-- preserved verbatim from the previous definition (cf. migration
-- 20260301054132).
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
  IF NEW.adapted_tone IS NOT NULL AND NEW.adapted_tone NOT IN ('pedagogique', 'scientifique', 'emotionnel', 'ludique', 'playful', 'empowering', 'factual', 'transparent', 'expert') THEN
    RAISE EXCEPTION 'Invalid adapted_tone: %', NEW.adapted_tone;
  END IF;
  -- Phase 2.C-prereq: extended with 'completed', 'checkout', 'converted' for
  -- the backlog #2.10 protectExitType progression order.
  IF NEW.exit_type IS NOT NULL AND NEW.exit_type NOT IN ('cta_principal', 'cta_secondaire', 'abandon', 'completed', 'checkout', 'converted') THEN
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
