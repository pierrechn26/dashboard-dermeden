-- === Phase 1 : BDD corrections ===

-- 1.1 — is_existing_client : passer de DEFAULT false à DEFAULT NULL
ALTER TABLE public.diagnostic_sessions
ALTER COLUMN is_existing_client DROP DEFAULT;

ALTER TABLE public.diagnostic_sessions
ALTER COLUMN is_existing_client SET DEFAULT NULL;

-- 1.2 — Ajouter tenant_id sur client_orders
ALTER TABLE public.client_orders
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50);

-- Backfill éventuel des données existantes (si la table est vide en template, OK)
-- En cas de données présentes : UPDATE public.client_orders SET tenant_id = '<tenant_par_defaut>' WHERE tenant_id IS NULL;

-- Rendre NOT NULL
ALTER TABLE public.client_orders
ALTER COLUMN tenant_id SET NOT NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_client_orders_tenant_id
ON public.client_orders(tenant_id);

-- 1.3 — Contrainte UNIQUE composite (tenant_id, external_order_id)
-- D'abord supprimer la contrainte UNIQUE simple existante sur external_order_id
ALTER TABLE public.client_orders
DROP CONSTRAINT IF EXISTS client_orders_external_order_id_key;

-- Puis ajouter la composite
ALTER TABLE public.client_orders
ADD CONSTRAINT client_orders_tenant_external_order_unique
UNIQUE (tenant_id, external_order_id);

-- 1.4 — Création table tenant_commercial_facts
CREATE TABLE IF NOT EXISTS public.tenant_commercial_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  fact_key VARCHAR(100) NOT NULL,
  fact_value TEXT NOT NULL,
  source_url TEXT,
  confidence VARCHAR(20) DEFAULT 'high',
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  CONSTRAINT tenant_commercial_facts_unique UNIQUE(tenant_id, category, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_commercial_facts_tenant
ON public.tenant_commercial_facts(tenant_id, category);

CREATE INDEX IF NOT EXISTS idx_tenant_commercial_facts_active
ON public.tenant_commercial_facts(tenant_id, is_active) WHERE is_active = true;

-- 1.5 — Ajouter website_url dans tenant_config
ALTER TABLE public.tenant_config
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- 5.2 — Étendre integrations_enabled (ajouter clés omnisend, mailchimp, brevo si absentes)
-- La colonne est JSONB, on met à jour le default et on update les lignes existantes
UPDATE public.tenant_config
SET integrations_enabled = COALESCE(integrations_enabled, '{}'::jsonb)
  || jsonb_build_object(
    'omnisend', COALESCE((integrations_enabled->>'omnisend')::boolean, false),
    'mailchimp', COALESCE((integrations_enabled->>'mailchimp')::boolean, false),
    'brevo', COALESCE((integrations_enabled->>'brevo')::boolean, false)
  );

-- 5.2 (suite) — Mettre à jour le DEFAULT de la colonne integrations_enabled
-- pour que les nouveaux clients aient les 7 clés (shopify, klaviyo, omnisend,
-- mailchimp, brevo, ga4, meta_pixel) par défaut sans intervention manuelle.
ALTER TABLE public.tenant_config
ALTER COLUMN integrations_enabled SET DEFAULT
  '{"shopify": false, "klaviyo": false, "omnisend": false, "mailchimp": false, "brevo": false, "ga4": false, "meta_pixel": false}'::jsonb;
