-- =============================================================================
-- LOT 1 — Transformation BDD pour template générique Ask-It
-- =============================================================================
-- Cette migration transforme le dashboard Ouate original en template réutilisable
-- pour n'importe quel client Ask-It. Elle effectue 9 transformations :
--
-- 1. Création de la table tenant_config (configuration par tenant)
-- 2. Renommage diagnostic_children → diagnostic_items (JSONB agnostique)
-- 3. Renommage shopify_orders → client_orders (source-agnostic)
-- 4. Renommage ouate_products → client_products (source-agnostic)
-- 5. Drop de la table recommendation_staging (legacy V1)
-- 6. Drop des colonnes Legacy V1/V2 de marketing_recommendations
-- 7. Renommage existing_ouate_products → existing_brand_products
-- 8. Seed du persona P0 (pool des sessions non-attribuées)
-- 9. Seed des 213 sources marketing génériques
--
-- IMPORTANT : cette migration est DESTRUCTRICE sur les tables renommées.
-- Elle est conçue pour être exécutée sur un template vierge. Les migrations
-- précédentes ont créé les tables originales (diagnostic_children, shopify_orders,
-- ouate_products) qui seront supprimées et recréées ici avec leurs noms génériques.
-- =============================================================================

-- =============================================================================
-- SECTION 1 — Table tenant_config
-- =============================================================================
-- Nouvelle table centrale qui contient toutes les informations de personnalisation
-- du tenant (brand_name, brand_tone, industry, target_audience, etc.).
-- Une seule ligne par projet, lue au démarrage par toutes les Edge Functions
-- qui ont besoin de ces informations pour leurs prompts IA ou leur logique.
--
-- Au démarrage du template, cette table est VIDE. Lors de l'onboarding d'un
-- nouveau client, une ligne sera insérée avec les informations de sa marque.

CREATE TABLE IF NOT EXISTS public.tenant_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiant technique du tenant (remplace les PROJECT_ID = 'ouate' hardcodés)
  project_id VARCHAR UNIQUE NOT NULL,

  -- Informations de marque
  brand_name VARCHAR NOT NULL,
  brand_tone TEXT,
  brand_description TEXT,
  target_audience TEXT,
  industry VARCHAR,

  -- Localisation
  currency VARCHAR(3) DEFAULT 'EUR',
  locale VARCHAR(10) DEFAULT 'fr-FR',
  timezone VARCHAR(50) DEFAULT 'Europe/Paris',

  -- URLs publiques
  dashboard_url VARCHAR,
  diagnostic_url VARCHAR,

  -- Contexte enrichi utilisé par le pipeline Marketing IA
  -- Structure attendue :
  -- {
  --   "brand": "Nom de la marque",
  --   "description": "Description courte",
  --   "tone": "Ton éditorial",
  --   "products": [{"name": "...", "type": "...", "price": 0}],
  --   "channels": ["Meta Ads", "Email", ...],
  --   "promoCode": "CODE10",
  --   "shopify_url": "boutique.com"
  -- }
  client_context_json JSONB,

  -- Flags d'activation des intégrations externes (optionnelles)
  -- Structure attendue : { "shopify": false, "klaviyo": false, "ga4": false, "meta_pixel": false }
  integrations_enabled JSONB DEFAULT '{"shopify": false, "klaviyo": false, "ga4": false, "meta_pixel": false}'::jsonb,

  -- Configuration spécifique Shopify (si shopify activé)
  shopify_store_domain VARCHAR,

  -- Configuration spécifique Klaviyo (si klaviyo activé)
  klaviyo_list_id VARCHAR,

  -- Configuration spécifique GA4 (si ga4 activé)
  ga4_landing_path VARCHAR,

  -- Configuration spécifique Meta Pixel (si meta_pixel activé)
  meta_pixel_id VARCHAR,

  -- Paramètres de détection automatique des personas
  -- Valeurs par défaut issues du dashboard Ouate validé en production
  persona_detection_params JSONB DEFAULT '{
    "min_cluster_size": 30,
    "min_split_size": 20,
    "max_persona_size": 80,
    "weak_score_threshold": 75,
    "min_sessions_to_keep_after_30_days": 15,
    "similarity_threshold_b1": 0.75,
    "min_score_gain_b3": 0.05
  }'::jsonb,

  -- Mapping des champs d'item_metadata vers les dimensions persona (identity/need/behavior)
  -- Permet à detect-persona-clusters de construire les critères sans hardcoding de champs
  persona_dimension_mapping JSONB DEFAULT '{
    "identity": ["age_range", "gender", "location", "relationship"],
    "need": ["skin_concern", "occasion", "use_case", "problem_type", "main_concern"],
    "behavior": ["priorities", "trust_triggers", "preferred_format", "decision_speed"]
  }'::jsonb,

  -- Métadonnées
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index sur project_id pour les lookups rapides
CREATE INDEX IF NOT EXISTS idx_tenant_config_project_id ON public.tenant_config(project_id);

-- Trigger de mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION public.update_tenant_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenant_config_updated_at
BEFORE UPDATE ON public.tenant_config
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_config_updated_at();

-- RLS : lecture publique (les données ne sont pas sensibles, c'est du branding),
-- écriture uniquement via service_role (onboarding ou modifications admin)
ALTER TABLE public.tenant_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to tenant_config"
  ON public.tenant_config
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role full access to tenant_config"
  ON public.tenant_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- SECTION 2 — Renommage diagnostic_children → diagnostic_items (JSONB)
-- =============================================================================
-- La table diagnostic_children est spécifique au cas Ouate (diagnostic pour enfants).
-- On la remplace par une table générique diagnostic_items où les champs métier
-- spécifiques (skin_concern, age_range, etc.) deviennent des clés libres d'un
-- JSONB item_metadata. Chaque client définit son propre schéma dans ce JSONB.

-- 2.1 — Drop des triggers attachés à diagnostic_children
DROP TRIGGER IF EXISTS trigger_validate_diagnostic_child ON public.diagnostic_children;

-- 2.2 — Drop de la table (approche destructrice, template vierge)
DROP TABLE IF EXISTS public.diagnostic_children CASCADE;

-- 2.3 — Drop de la fonction de validation spécifique enfant (remplacée plus bas)
DROP FUNCTION IF EXISTS public.validate_diagnostic_child() CASCADE;

-- 2.4 — Création de la nouvelle table générique diagnostic_items
CREATE TABLE public.diagnostic_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.diagnostic_sessions(id) ON DELETE CASCADE,

  -- Index 0-based de l'item dans la session
  -- L'item index 0 doit être le plus "important" (convention Ouate conservée)
  item_index INTEGER NOT NULL,

  -- Libellé court de l'item (prénom enfant, nom de projet, nom d'animal, etc.)
  item_label VARCHAR,

  -- Données spécifiques au vertical client, structure libre
  -- Exemples :
  --   Ouate : { "age": 6, "age_range": "4-8", "skin_concern": "peau sensible", "has_routine": true, ... }
  --   Baubo : { "occasion": "quotidien", "sensitivity_level": "high", "preferred_format": "huile" }
  --   DermEden : { "skin_type": "mixte", "concerns": ["acne","dark_spots"], "age_range": "25-35" }
  -- La validation des clés métier est à la charge du diagnostic côté amont.
  item_metadata JSONB DEFAULT '{}'::jsonb,

  -- Questions dynamiques IA générées par le diagnostic (max 3)
  dynamic_question_1 TEXT,
  dynamic_answer_1 TEXT,
  dynamic_question_2 TEXT,
  dynamic_answer_2 TEXT,
  dynamic_question_3 TEXT,
  dynamic_answer_3 TEXT,

  -- Codes anglais normalisés des insights ciblés (ex: "water_reactivity,sensitive_skin")
  dynamic_insight_targets TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contrainte : un item_index unique par session
  UNIQUE(session_id, item_index)
);

-- Index
CREATE INDEX idx_diagnostic_items_session ON public.diagnostic_items(session_id);
CREATE INDEX idx_diagnostic_items_created_at ON public.diagnostic_items(created_at DESC);

-- Index GIN sur le JSONB pour les requêtes sur item_metadata
CREATE INDEX idx_diagnostic_items_metadata_gin ON public.diagnostic_items USING GIN (item_metadata);

-- 2.5 — Fonction de validation générique (remplace validate_diagnostic_child)
-- Cette version ne valide plus d'enums hardcodés. Elle se contente de s'assurer
-- que item_metadata est un objet JSON valide (pas null, pas un array).
CREATE OR REPLACE FUNCTION public.validate_diagnostic_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Vérifier que item_metadata est bien un objet JSON (pas null, pas array)
  IF NEW.item_metadata IS NULL THEN
    NEW.item_metadata := '{}'::jsonb;
  END IF;

  IF jsonb_typeof(NEW.item_metadata) != 'object' THEN
    RAISE EXCEPTION 'item_metadata must be a JSON object, got %', jsonb_typeof(NEW.item_metadata);
  END IF;

  RETURN NEW;
END;
$$;

-- 2.6 — Trigger de validation
CREATE TRIGGER trigger_validate_diagnostic_item
BEFORE INSERT OR UPDATE ON public.diagnostic_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_diagnostic_item();

-- 2.7 — RLS : même politique que diagnostic_sessions (sécurité par AccessGate)
ALTER TABLE public.diagnostic_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to diagnostic_items"
  ON public.diagnostic_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- SECTION 3 — Renommage shopify_orders → client_orders (source-agnostic)
-- =============================================================================
-- La table shopify_orders est renommée en client_orders pour devenir source-agnostic.
-- Un client pourrait utiliser WooCommerce, BigCommerce, un POS custom, etc.
-- On ajoute un champ source_provider pour identifier l'origine de la commande.

-- 3.1 — Drop de la table existante (approche destructrice, template vierge)
DROP TABLE IF EXISTS public.shopify_orders CASCADE;

-- 3.2 — Création de la nouvelle table générique
CREATE TABLE public.client_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiant externe chez le provider e-commerce (shopify_order_id, woo_id, etc.)
  external_order_id VARCHAR UNIQUE,

  -- Numéro de commande lisible par l'humain
  order_number VARCHAR,

  -- Email du client
  customer_email VARCHAR,

  -- Montant total
  total_price NUMERIC(10, 2),
  currency VARCHAR(3) DEFAULT 'EUR',

  -- Attribution au diagnostic
  is_from_diagnostic BOOLEAN DEFAULT false,
  diagnostic_session_id UUID REFERENCES public.diagnostic_sessions(id) ON DELETE SET NULL,

  -- Produits commandés
  -- IMPORTANT : utiliser le séparateur " | " (pipe entouré d'espaces)
  -- pour éviter les bugs de parsing quand les noms de produits contiennent des virgules
  -- (ex: "Mon écran 1,2,3 soleil" cassait le split(",") dans la version Ouate initiale)
  validated_products TEXT,

  -- Provider e-commerce source (shopify, woocommerce, bigcommerce, manual, etc.)
  source_provider VARCHAR DEFAULT 'shopify',

  -- Payload original pour debug
  raw_payload JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_client_orders_created_at ON public.client_orders(created_at DESC);
CREATE INDEX idx_client_orders_is_from_diagnostic ON public.client_orders(is_from_diagnostic) WHERE is_from_diagnostic = true;
CREATE INDEX idx_client_orders_session ON public.client_orders(diagnostic_session_id) WHERE diagnostic_session_id IS NOT NULL;
CREATE INDEX idx_client_orders_customer_email ON public.client_orders(customer_email);
CREATE INDEX idx_client_orders_external_id ON public.client_orders(external_order_id);

-- RLS
ALTER TABLE public.client_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to client_orders"
  ON public.client_orders
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- SECTION 4 — Renommage ouate_products → client_products (source-agnostic)
-- =============================================================================
-- La table ouate_products devient client_products, nom générique valable pour
-- n'importe quel client. Ajout d'un champ source_provider pour compatibilité
-- multi-provider.

-- 4.1 — Drop de la table existante (approche destructrice)
DROP TABLE IF EXISTS public.ouate_products CASCADE;

-- 4.2 — Création de la nouvelle table générique
CREATE TABLE public.client_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiant externe chez le provider (shopify_product_id, woo_id, etc.)
  external_product_id VARCHAR UNIQUE,

  -- Informations produit
  title VARCHAR NOT NULL,
  handle VARCHAR,
  description TEXT,
  product_type VARCHAR,
  vendor VARCHAR,
  tags TEXT[],

  -- Prix (min/max pour gérer les variantes)
  price_min NUMERIC(10, 2),
  price_max NUMERIC(10, 2),
  currency VARCHAR(3) DEFAULT 'EUR',

  -- Variantes (taille, couleur, format, etc.) en JSONB
  variants JSONB,

  -- Images (URLs) en JSONB
  images JSONB,

  -- Statut publication
  status VARCHAR DEFAULT 'active',
  published_at TIMESTAMPTZ,

  -- URL de la page produit sur la boutique
  external_url TEXT,

  -- Provider e-commerce source
  source_provider VARCHAR DEFAULT 'shopify',

  -- Dernière synchronisation
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_client_products_status ON public.client_products(status);
CREATE INDEX idx_client_products_title ON public.client_products(title);
CREATE INDEX idx_client_products_external_id ON public.client_products(external_product_id);
CREATE INDEX idx_client_products_source_provider ON public.client_products(source_provider);

-- RLS : lecture publique (les produits sont affichés dans le dashboard),
-- écriture service_role uniquement (alimenté par les syncs Shopify/WooCommerce)
ALTER TABLE public.client_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to client_products"
  ON public.client_products
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role full access to client_products"
  ON public.client_products
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- SECTION 5 — Drop recommendation_staging (table Legacy V1)
-- =============================================================================
-- Cette table était utilisée par l'ancienne architecture Marketing IA en 3 étapes
-- (prepare-recommendations → analyze-recommendations → generate-marketing-recommendations).
-- Depuis la refonte V3 on-demand, cette table n'est plus utilisée.
-- On la supprime du template pour partir sur une base propre.

DROP TABLE IF EXISTS public.recommendation_staging CASCADE;

-- =============================================================================
-- SECTION 6 — Drop colonnes Legacy V1/V2 de marketing_recommendations
-- =============================================================================
-- Ces colonnes correspondent à des versions antérieures du système de recos marketing
-- et ne sont plus écrites depuis la refonte V3. On les supprime pour éviter le code mort.

ALTER TABLE public.marketing_recommendations
  DROP COLUMN IF EXISTS week_start,
  DROP COLUMN IF EXISTS persona_focus,
  DROP COLUMN IF EXISTS checklist,
  DROP COLUMN IF EXISTS ads_recommendations,
  DROP COLUMN IF EXISTS email_recommendations,
  DROP COLUMN IF EXISTS offers_recommendations,
  DROP COLUMN IF EXISTS sources_consulted,
  DROP COLUMN IF EXISTS ads_v2,
  DROP COLUMN IF EXISTS emails_v2,
  DROP COLUMN IF EXISTS offers_v2,
  DROP COLUMN IF EXISTS campaigns_overview,
  DROP COLUMN IF EXISTS generation_config,
  DROP COLUMN IF EXISTS pre_calculated_context;

-- =============================================================================
-- SECTION 7 — Renommage existing_ouate_products → existing_brand_products
-- =============================================================================
-- Dans diagnostic_sessions, le champ existing_ouate_products devient générique.

ALTER TABLE public.diagnostic_sessions
  RENAME COLUMN existing_ouate_products TO existing_brand_products;


-- =============================================================================
-- SECTION 8 — Seed du persona P0 (pool des sessions non-attribuées)
-- =============================================================================
-- Le persona P0 est un "pool" spécial qui contient toutes les sessions qui n'ont
-- pas encore été attribuées à un persona concret (P1, P2, etc.). Il doit exister
-- dès le démarrage pour que diagnostic-webhook puisse assigner les premières
-- sessions du nouveau client, avant que detect-persona-clusters n'ait eu le temps
-- de créer les premiers clusters.
--
-- Au fil du temps, quand le client aura accumulé suffisamment de sessions,
-- detect-persona-clusters créera automatiquement P1, P2, etc. à partir des sessions
-- en P0, et les sessions seront réattribuées.

INSERT INTO public.personas (
  code,
  name,
  full_label,
  description,
  criteria,
  is_active,
  is_pool,
  is_existing_client_persona,
  is_auto_created,
  session_count,
  avg_matching_score,
  min_sessions,
  detection_source,
  source_personas,
  created_at,
  updated_at
) VALUES (
  'P0',
  'Pool',
  'P0 — Pool des sessions non-attribuées',
  'Pool des sessions récentes en attente de classification automatique par detect-persona-clusters. Les sessions arrivent ici par défaut lors de la complétion du diagnostic, puis sont réattribuées automatiquement vers P1, P2, etc. lorsque les clusters émergent (seuil minimum de 30 sessions par cluster).',
  '{"weights": {"identity": 25, "need": 50, "behavior": 25}, "identity": {}, "need": {}, "behavior": {}}'::jsonb,
  true,
  true,
  false,
  false,
  0,
  NULL,
  0,
  'seed_template',
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- SECTION 9 — Seed des 213 sources marketing génériques
-- =============================================================================
-- Ces sources sont des références documentaires génériques (Klaviyo officiel,
-- Meta Blueprint, J7 Media, Demand Curve, Foreplay, etc.) utilisables pour tout
-- secteur e-commerce. Elles sont partagées entre tous les dashboards clients
-- et alimentent le pipeline Marketing IA V3.
--
-- Répartition : 80 ads | 66 email | 67 offers
-- Tiers : 1 (priorité max) à 3 (consultation occasionnelle)
--
-- IMPORTANT : la colonne project_id (DEFAULT 'ouate') créée par la migration
-- 20260311021756 reste remplie avec 'ouate' par défaut lors de l'insertion,
-- mais les Edge Functions du template n'utiliseront plus ce filtre (elles
-- liront toutes les sources sans filtre tenant).

INSERT INTO public.marketing_sources (source_name, category, source_url, description, tier, is_active) VALUES
  ('adcreative.ai', 'ads', 'https://adcreative.ai', 'Génération IA de créatifs publicitaires', 1, true),
  ('adespresso.com', 'ads', 'https://adespresso.com', 'Optimisation et A/B testing Meta Ads', 1, true),
  ('adlibrary.facebook.com', 'ads', 'https://www.facebook.com/ads/library', 'Bibliothèque officielle de publicités Facebook/Meta', 1, true),
  ('ads.tiktok.com', 'ads', 'https://ads.tiktok.com', 'Plateforme publicitaire TikTok', 1, true),
  ('adspy.com', 'ads', 'https://adspy.com', 'Espionnage et analyse de publicités concurrentes', 1, true),
  ('adweek.com', 'ads', 'https://adweek.com', 'Industrie publicitaire, tendances créatives', 1, true),
  ('aspire.io', 'ads', 'https://aspire.io', 'Plateforme influencer marketing DTC', 1, true),
  ('baymard.com', 'ads', 'https://baymard.com', 'Recherches UX e-commerce', 1, true),
  ('bigcommerce.com/blog', 'ads', 'https://bigcommerce.com/blog', 'Ressources e-commerce et marketing', 1, true),
  ('billo.app', 'ads', 'https://billo.app', 'Plateforme de création de vidéos UGC', 1, true),
  ('commonthreadco.com', 'ads', 'https://commonthreadco.com', 'Agence DTC spécialisée en publicité Facebook/Instagram pour le e-commerce', 1, true),
  ('conversionxl.com', 'ads', 'https://cxl.com', 'Optimisation conversion et expérimentation', 1, true),
  ('creativeos.io', 'ads', 'https://creativeos.io', 'Bibliothèque de templates créatifs pour ads', 1, true),
  ('creatoriq.com', 'ads', 'https://creatoriq.com', 'Plateforme de marketing d''influence', 1, true),
  ('digiday.com', 'ads', 'https://digiday.com', 'Actualités publicité digitale et médias', 1, true),
  ('econsultancy.com', 'ads', 'https://econsultancy.com', 'Recherches et études marketing digital', 1, true),
  ('forrester.com', 'ads', 'https://forrester.com', 'Analyses et tendances marketing digital', 1, true),
  ('gartner.com', 'ads', 'https://gartner.com', 'Recherches et prévisions technologie marketing', 1, true),
  ('grin.co', 'ads', 'https://grin.co', 'Gestion des partenariats influenceurs DTC', 1, true),
  ('growth.design', 'ads', 'https://growth.design', 'Études de cas UX et conversion', 1, true),
  ('hbr.org', 'ads', 'https://hbr.org', 'Harvard Business Review - management et marketing', 1, true),
  ('j7media.com', 'ads', 'https://j7media.com', 'Formation et stratégies Facebook Ads avancées', 1, true),
  ('kantar.com', 'ads', 'https://kantar.com', 'Études et données consommateurs', 1, true),
  ('madgicx.com', 'ads', 'https://madgicx.com', 'IA pour optimisation Meta Ads', 1, true),
  ('marketingweek.com', 'ads', 'https://www.marketingweek.com', 'Actualités et tendances marketing', 1, true),
  ('mckinsey.com/business-functions/growth-marketing-and-sales', 'ads', 'https://mckinsey.com', 'Insights stratégie et marketing consommateur', 1, true),
  ('minea.com', 'ads', 'https://minea.com', 'Spy tool pour publicités Meta, TikTok, Pinterest', 1, true),
  ('motionapp.com', 'ads', 'https://motionapp.com', 'Analyse créative des meilleures publicités Meta/TikTok', 1, true),
  ('nielsen.com', 'ads', 'https://nielsen.com', 'Mesure d''audience et analytics média', 1, true),
  ('northbeam.io', 'ads', 'https://northbeam.io', 'Attribution multi-touch pour publicité digitale', 1, true),
  ('pencil.li', 'ads', 'https://pencil.li', 'IA pour génération créative publicitaire', 1, true),
  ('pinterest.com/business', 'ads', 'https://business.pinterest.com', 'Pinterest for Business - ressources publicitaires', 1, true),
  ('revealbot.com', 'ads', 'https://revealbot.com', 'Automatisation et optimisation Facebook Ads', 1, true),
  ('semrush.com', 'ads', 'https://semrush.com', 'SEO, SEM et veille concurrentielle', 1, true),
  ('shopify.com/blog', 'ads', 'https://shopify.com/blog', 'Blog e-commerce et marketing Shopify', 1, true),
  ('similarweb.com', 'ads', 'https://similarweb.com', 'Analytics trafic et benchmarks digitaux', 1, true),
  ('smartly.io', 'ads', 'https://smartly.io', 'Automatisation créative pour publicités sociales', 1, true),
  ('supermetrics.com', 'ads', 'https://supermetrics.com', 'Agrégation de données marketing multi-plateformes', 1, true),
  ('swipefiles.com', 'ads', 'https://swipefiles.com', 'Bibliothèque de copyrighting et ads performantes', 1, true),
  ('thegoodads.com', 'ads', 'https://thegoodads.com', 'Curation des meilleures publicités digitales', 1, true),
  ('tiktok.com/business', 'ads', 'https://business.tiktok.com', 'TikTok for Business - ressources et best practices', 1, true),
  ('tiktokcreatorcenter.com', 'ads', 'https://www.tiktok.com/business/en-US/creator-academy', 'Ressources créatives TikTok pour marques', 1, true),
  ('triplewhale.com', 'ads', 'https://triplewhale.com', 'Analytics et attribution pour e-commerce DTC', 1, true),
  ('ugcads.com', 'ads', 'https://ugcads.com', 'Création et analyse de contenu UGC pour ads', 1, true),
  ('warc.com', 'ads', 'https://warc.com', 'Intelligence marketing et effectiveness', 1, true),
  ('wordstream.com', 'ads', 'https://wordstream.com', 'Benchmarks et outils publicité payante', 1, true),
  ('adheart.me', 'ads', 'https://adheart.me', 'Base de données de publicités Facebook actives', 2, true),
  ('ahrefs.com', 'ads', 'https://ahrefs.com', 'SEO et analyse de liens', 2, true),
  ('aitargeting.com', 'ads', 'https://aitargeting.com', 'Ciblage publicitaire assisté par IA', 2, true),
  ('backstage.com', 'ads', 'https://backstage.com', 'Casting pour contenu vidéo créatif', 2, true),
  ('bigspy.com', 'ads', 'https://bigspy.com', 'Intelligence créative pour Facebook et Instagram Ads', 2, true),
  ('boydbrand.com', 'ads', 'https://boydbrand.com', 'Stratégie de marque DTC', 2, true),
  ('campaignlive.co.uk', 'ads', 'https://campaignlive.co.uk', 'Créativité et stratégie publicitaire', 2, true),
  ('canva.com', 'ads', 'https://canva.com', 'Création visuelle pour ads et réseaux sociaux', 2, true),
  ('cmo.com', 'ads', 'https://cmo.com', 'Ressources pour Chief Marketing Officers', 2, true),
  ('contentmarketinginstitute.com', 'ads', 'https://contentmarketinginstitute.com', 'Stratégie et best practices content marketing', 2, true),
  ('creativehive.co', 'ads', 'https://creativehive.co', 'Inspirations créatives pour publicités DTC', 2, true),
  ('databox.com', 'ads', 'https://databox.com', 'Dashboard analytics et KPIs marketing', 2, true),
  ('drip.com', 'ads', 'https://drip.com', 'E-commerce CRM et automation', 2, true),
  ('hootsuite.com', 'ads', 'https://hootsuite.com', 'Gestion et analytics réseaux sociaux', 2, true),
  ('hubspot.com/marketing', 'ads', 'https://hubspot.com/marketing', 'Ressources inbound marketing', 2, true),
  ('hypersocial.ai', 'ads', 'https://hypersocial.ai', 'IA pour génération de contenu social', 2, true),
  ('influencer.co', 'ads', 'https://influencer.co', 'Marketplace et analytics influenceurs', 2, true),
  ('ipa.co.uk', 'ads', 'https://ipa.co.uk', 'Institut des praticiens publicitaires', 2, true),
  ('ipsos.com', 'ads', 'https://ipsos.com', 'Études de marché et sondages consommateurs', 2, true),
  ('kapwing.com', 'ads', 'https://kapwing.com', 'Édition vidéo pour contenu social', 2, true),
  ('latertech.com', 'ads', 'https://later.com', 'Scheduling et analyse Instagram/TikTok', 2, true),
  ('marketing4ecommerce.net', 'ads', 'https://marketing4ecommerce.net', 'Ressources marketing e-commerce', 2, true),
  ('marketingland.com', 'ads', 'https://marketingland.com', 'Actualités marketing digital', 2, true),
  ('nanos.ai', 'ads', 'https://nanos.ai', 'IA pour campagnes publicitaires PME', 2, true),
  ('neilpatel.com', 'ads', 'https://neilpatel.com', 'Marketing digital et SEO', 2, true),
  ('poweradspy.com', 'ads', 'https://poweradspy.com', 'Analyse et inspiration créative pour ads', 2, true),
  ('reactiondata.com', 'ads', 'https://reactiondata.com', 'Consumer insights pour e-commerce DTC', 2, true),
  ('scaleflex.io', 'ads', 'https://scaleflex.io', 'Gestion d''assets créatifs pour publicités', 2, true),
  ('searchengineland.com', 'ads', 'https://searchengineland.com', 'SEO, SEM et marketing de recherche', 2, true),
  ('socialbakers.com', 'ads', 'https://socialbakers.com', 'Analyse de performance des réseaux sociaux', 2, true),
  ('sproutsocial.com', 'ads', 'https://sproutsocial.com', 'Analytics et scheduling pour social media', 2, true),
  ('spyfu.com', 'ads', 'https://spyfu.com', 'Analyse SEA et mots-clés concurrents', 2, true),
  ('tokfluence.com', 'ads', 'https://tokfluence.com', 'Analyse des tendances TikTok pour les marques', 2, true),
  ('veed.io', 'ads', 'https://veed.io', 'Création et édition vidéo pour ads sociales', 2, true),
  ('attentive.com/blog', 'email', 'https://attentive.com/blog', 'SMS et email marketing mobile-first', 1, true),
  ('barilliance.com', 'email', 'https://barilliance.com', 'Personnalisation et abandon panier email', 1, true),
  ('customerio.com/blog', 'email', 'https://customerio.com/blog', 'Marketing automation et messaging ciblé', 1, true),
  ('drip.com/blog', 'email', 'https://drip.com/blog', 'Email e-commerce et automation DTC', 1, true),
  ('emailmonday.com', 'email', 'https://emailmonday.com', 'Études et tendances email marketing', 1, true),
  ('emailonacid.com', 'email', 'https://emailonacid.com', 'Tests de rendu et delivrabilité email', 1, true),
  ('emailvendorselection.com', 'email', 'https://emailvendorselection.com', 'Comparatifs et analyses outils email marketing', 1, true),
  ('goodemailcopy.com', 'email', 'https://goodemailcopy.com', 'Inspirations de copy pour emails marketing', 1, true),
  ('iterable.com/blog', 'email', 'https://iterable.com/blog', 'Growth marketing et email cross-canal', 1, true),
  ('klaviyo.com', 'email', 'https://klaviyo.com', 'Plateforme email/SMS pour e-commerce, guides et benchmarks officiels', 1, true),
  ('klaviyo.com/academy', 'email', 'https://academy.klaviyo.com', 'Formation officielle Klaviyo', 1, true),
  ('klaviyo.com/blog', 'email', 'https://klaviyo.com/blog', 'Blog Klaviyo : best practices, études de cas, flows', 1, true),
  ('litmus.com', 'email', 'https://litmus.com', 'Testing et analytics email marketing', 1, true),
  ('marketingcharts.com', 'email', 'https://marketingcharts.com', 'Données et benchmarks marketing', 1, true),
  ('omnisend.com/blog', 'email', 'https://omnisend.com/blog', 'Email et SMS marketing e-commerce', 1, true),
  ('postscript.io/blog', 'email', 'https://postscript.io/blog', 'SMS marketing pour Shopify DTC', 1, true),
  ('reallygoodemails.com', 'email', 'https://reallygoodemails.com', 'Inspiration et exemples de emails e-commerce', 1, true),
  ('rebuyengine.com', 'email', 'https://rebuyengine.com', 'Recommandations produits et email personnalisé', 1, true),
  ('returnpath.com', 'email', 'https://validity.com', 'Delivrabilité et réputation email', 1, true),
  ('segment.com/blog', 'email', 'https://segment.com/blog', 'CDP et données client pour personnalisation', 1, true),
  ('smile.io/blog', 'email', 'https://smile.io/blog', 'Programmes de fidélité e-commerce', 1, true),
  ('tinyclues.com', 'email', 'https://tinyclues.com', 'IA pour segmentation email avancée', 1, true),
  ('yotpo.com/blog', 'email', 'https://yotpo.com/blog', 'Reviews, loyalty et email marketing DTC', 1, true),
  ('activecampaign.com/blog', 'email', 'https://activecampaign.com/blog', 'Marketing automation et segmentation', 2, true),
  ('benchmark.email', 'email', 'https://benchmark.email', 'Tests et benchmarks email marketing', 2, true),
  ('bloomreach.com', 'email', 'https://bloomreach.com', 'Commerce experience et email personnalisé', 2, true),
  ('brevo.com/blog', 'email', 'https://brevo.com/blog', 'Marketing automation et email', 2, true),
  ('campaignmonitor.com/blog', 'email', 'https://campaignmonitor.com/blog', 'Ressources email marketing', 2, true),
  ('clearbout.com', 'email', 'https://clearbit.com', 'Enrichissement données et segmentation', 2, true),
  ('conversio.com', 'email', 'https://conversio.com', 'Email marketing Shopify post-achat', 2, true),
  ('convertkit.com/blog', 'email', 'https://convertkit.com/blog', 'Email marketing créateurs et DTC', 2, true),
  ('dotdigital.com', 'email', 'https://dotdigital.com', 'Engagement customer omnicanal', 2, true),
  ('emaildesign.email', 'email', 'https://emaildesign.email', 'Templates et best practices design email', 2, true),
  ('emailgeeks.com', 'email', 'https://emailgeeks.com', 'Communauté et ressources email marketing', 2, true),
  ('emailweekly.co', 'email', 'https://emailweekly.co', 'Newsletter sur tendances email marketing', 2, true),
  ('emarsys.com', 'email', 'https://emarsys.com', 'Marketing automation e-commerce', 2, true),
  ('exponea.com', 'email', 'https://exponea.com', 'CDP et personalisation email', 2, true),
  ('exponential.com', 'email', 'https://exponential.com', 'Retargeting et email personnalisé', 2, true),
  ('freshrelevance.com', 'email', 'https://freshrelevance.com', 'Personnalisation temps réel e-commerce', 2, true),
  ('gorgias.com/blog', 'email', 'https://gorgias.com/blog', 'Support client et email e-commerce', 2, true),
  ('heap.io/blog', 'email', 'https://heap.io/blog', 'Analytics comportemental pour personnalisation', 2, true),
  ('insider.com', 'email', 'https://insider.com', 'Engagement client et email marketing', 2, true),
  ('intercom.com/blog', 'email', 'https://intercom.com/blog', 'Communication client et automation', 2, true),
  ('loyalty.com', 'email', 'https://loyalty.com', 'Programmes fidélité et email retention', 2, true),
  ('mailchimp.com/resources', 'email', 'https://mailchimp.com/resources', 'Ressources email marketing MailChimp', 2, true),
  ('mailjet.com/blog', 'email', 'https://mailjet.com/blog', 'Blog email marketing et delivrabilité', 2, true),
  ('mixpanel.com/blog', 'email', 'https://mixpanel.com/blog', 'Analytics produit et comportement utilisateur', 2, true),
  ('moengage.com/blog', 'email', 'https://moengage.com/blog', 'Mobile et email engagement marketing', 2, true),
  ('nosto.com', 'email', 'https://nosto.com', 'Personnalisation e-commerce et email', 2, true),
  ('okendo.io/blog', 'email', 'https://okendo.io/blog', 'Reviews clients et email marketing Shopify', 2, true),
  ('optimove.com/blog', 'email', 'https://optimove.com/blog', 'Marketing automation centré client', 2, true),
  ('privy.com/blog', 'email', 'https://privy.com/blog', 'Popups, email et SMS pour Shopify', 2, true),
  ('recart.com', 'email', 'https://recart.com', 'Facebook Messenger et email marketing Shopify', 2, true),
  ('returnly.com', 'email', 'https://returnly.com', 'Gestion des retours et email post-achat', 2, true),
  ('sailthru.com/blog', 'email', 'https://sailthru.com/blog', 'Personnalisation et email marketing retail', 2, true),
  ('sendgrid.com/blog', 'email', 'https://sendgrid.com/blog', 'Delivrabilité et marketing email', 2, true),
  ('SmartrMail.com', 'email', 'https://smartrmail.com', 'Email marketing IA pour Shopify', 2, true),
  ('smsbump.com/blog', 'email', 'https://smsbump.com/blog', 'SMS marketing e-commerce', 2, true),
  ('sparkpost.com/blog', 'email', 'https://sparkpost.com/blog', 'Delivrabilité et analytics email', 2, true),
  ('userlist.com/blog', 'email', 'https://userlist.com/blog', 'Email automation SaaS et e-commerce', 2, true),
  ('vero.co/blog', 'email', 'https://vero.co/blog', 'Email marketing déclenché par comportement', 2, true),
  ('aweber.com/blog', 'email', 'https://aweber.com/blog', 'Email marketing PME', 3, true),
  ('contactpigeon.com', 'email', 'https://contactpigeon.com', 'Marketing automation retail', 3, true),
  ('getresponse.com/blog', 'email', 'https://getresponse.com/blog', 'Marketing automation et email', 3, true),
  ('maileon.com', 'email', 'https://maileon.com', 'Email marketing avancé', 3, true),
  ('onlypult.com', 'email', 'https://onlypult.com', 'Gestion et scheduling contenus multi-canal', 3, true),
  ('beautyindependent.com', 'offers', 'https://beautyindependent.com', 'Stratégies marques beauté indépendantes', 1, true),
  ('bigcommerce.com', 'offers', 'https://bigcommerce.com', 'Ressources e-commerce et stratégies de vente', 1, true),
  ('bold.co/blog', 'offers', 'https://bold.co/blog', 'Apps Shopify upsell, bundles et promotions', 1, true),
  ('burt-bees-baby.com', 'offers', 'https://burtsbees.com', 'Bundling et offres beauté naturelle bébé', 1, true),
  ('cbinsights.com', 'offers', 'https://cbinsights.com', 'Intelligence marché startups et tendances DTC', 1, true),
  ('cialdini.com', 'offers', 'https://cialdini.com', 'Principes d''influence et persuasion (Dr Cialdini)', 1, true),
  ('conversionrate.store', 'offers', 'https://conversionrate.store', 'CRO et optimisation offres e-commerce', 1, true),
  ('cosmeticsbusiness.com', 'offers', 'https://cosmeticsbusiness.com', 'Business et stratégies industrie cosmétique', 1, true),
  ('dtc.com', 'offers', 'https://dtc.com', 'Ressources et stratégies DTC', 1, true),
  ('dtcnewsletter.com', 'offers', 'https://dtcnewsletter.com', 'Newsletter tendances DTC', 1, true),
  ('ecocert.com', 'offers', 'https://ecocert.com', 'Certifications et standards bio/naturel', 1, true),
  ('euromonitor.com', 'offers', 'https://euromonitor.com', 'Études marché consommateurs et beauté', 1, true),
  ('ewg.org', 'offers', 'https://ewg.org', 'Sécurité cosmétiques naturels - Environmental Working Group', 1, true),
  ('glossy.co', 'offers', 'https://glossy.co', 'Actualités beauté, mode et DTC premium', 1, true),
  ('intelligems.io', 'offers', 'https://intelligems.io', 'Tests de prix pour e-commerce DTC', 1, true),
  ('loyaltylion.com/blog', 'offers', 'https://loyaltylion.com/blog', 'Programmes de fidélité e-commerce Shopify', 1, true),
  ('mustela.com', 'offers', 'https://mustela.com', 'Stratégies bundling et coffrets cosmétiques bébé', 1, true),
  ('naif.care', 'offers', 'https://naif.care', 'DTC skincare naturel bébé premium, bundling', 1, true),
  ('nickkolenda.com', 'offers', 'https://nickkolenda.com', 'Psychologie du pricing et marketing persuasif', 1, true),
  ('optimizely.com/blog', 'offers', 'https://optimizely.com', 'A/B testing et optimisation offres', 1, true),
  ('price-intelligently.com', 'offers', 'https://priceintelligently.com', 'Recherches et stratégies de pricing', 1, true),
  ('profitwell.com', 'offers', 'https://profitwell.com', 'Analytics revenus et pricing stratégique', 1, true),
  ('rebuyengine.com', 'offers', 'https://rebuyengine.com', 'Recommandations produits et upsell intelligents', 1, true),
  ('reconvert.com', 'offers', 'https://reconvert.com', 'Upsell post-achat Shopify', 1, true),
  ('retaildive.com', 'offers', 'https://retaildive.com', 'Actualités et tendances retail', 1, true),
  ('shopify.com/blog', 'offers', 'https://shopify.com/blog', 'E-commerce, conversion et stratégies d''offres', 1, true),
  ('statista.com', 'offers', 'https://statista.com', 'Données statistiques marché cosmétique', 1, true),
  ('themodernretail.com', 'offers', 'https://modernretail.com', 'Tendances retail et DTC', 1, true),
  ('theordinary.com', 'offers', 'https://theordinary.com', 'Pricing transparent et stratégie de gamme', 1, true),
  ('vwo.com/blog', 'offers', 'https://vwo.com', 'Tests et expérimentation pour e-commerce', 1, true),
  ('zipify.com/blog', 'offers', 'https://zipify.com/blog', 'Funnels et upsell pour Shopify', 1, true),
  ('baremetrics.com', 'offers', 'https://baremetrics.com', 'Métriques SaaS et e-commerce, pricing', 2, true),
  ('businessinsider.com/retail', 'offers', 'https://businessinsider.com', 'Tendances retail et e-commerce', 2, true),
  ('businessofashion.com', 'offers', 'https://businessoffashion.com', 'Business mode, beauté premium et retail', 2, true),
  ('carthook.com', 'offers', 'https://carthook.com', 'Funnels de commande et upsell post-achat', 2, true),
  ('cartpop.io', 'offers', 'https://cartpop.io', 'Popups et offres panier pour e-commerce', 2, true),
  ('cerave.com', 'offers', 'https://cerave.com', 'Positionnement dermato et bundling skincare', 2, true),
  ('cosmeticsandtoiletries.com', 'offers', 'https://cosmeticsandtoiletries.com', 'Recherche et formulation cosmétique', 2, true),
  ('cosrx.com', 'offers', 'https://cosrx.com', 'DTC beauté asiatique, bundling et pricing', 2, true),
  ('influencermarketinghub.com', 'offers', 'https://influencermarketinghub.com', 'Marketing d''influence et promotions', 2, true),
  ('justuno.com/blog', 'offers', 'https://justuno.com', 'Promotions et offres personnalisées e-commerce', 2, true),
  ('kinship.co', 'offers', 'https://kinship.co', 'DTC skincare naturel, bundling génération Z', 2, true),
  ('logicallabs.com', 'offers', 'https://logicallabs.com', 'Optimisation landing pages et offres', 2, true),
  ('loreal.com/group/brands', 'offers', 'https://loreal.com', 'Stratégies de portefeuille de marques beauté', 2, true),
  ('mageworx.com/blog', 'offers', 'https://mageworx.com', 'Stratégies promotionnelles e-commerce', 2, true),
  ('mindbodygreen.com', 'offers', 'https://mindbodygreen.com', 'Wellness, beauté naturelle et tendances', 2, true),
  ('natrue.org', 'offers', 'https://natrue.org', 'Certification et standards cosmétiques naturels', 2, true),
  ('onestopbundler.com', 'offers', 'https://onestopbundler.com', 'Bundling de produits Shopify', 2, true),
  ('organicbeautywiki.com', 'offers', 'https://organicbeautywiki.com', 'Beauté naturelle et organique', 2, true),
  ('paddle.com/blog', 'offers', 'https://paddle.com/blog', 'Stratégies pricing et monétisation', 2, true),
  ('practicalcommerce.com', 'offers', 'https://practicalcommerce.com', 'Conseils pratiques e-commerce et promotions', 2, true),
  ('premiumbeauty.com', 'offers', 'https://premiumbeauty.com', 'Positionnement premium beauté', 2, true),
  ('pricelabs.co', 'offers', 'https://pricelabs.co', 'Pricing dynamique e-commerce', 2, true),
  ('pricingforprofit.com', 'offers', 'https://pricingforprofit.com', 'Stratégies pricing rentables', 2, true),
  ('profitabledtc.com', 'offers', 'https://profitabledtc.com', 'Stratégies de rentabilité DTC', 2, true),
  ('sleeknote.com/blog', 'offers', 'https://sleeknote.com', 'Popups et offres de bienvenue e-commerce', 2, true),
  ('sucharitacoduri.com', 'offers', 'https://sucharitacoduri.com', 'Retail et e-commerce futures tendances', 2, true),
  ('sumo.com/stories', 'offers', 'https://sumo.com', 'Growth hacking et stratégies promotionnelles', 2, true),
  ('thefeeline.com', 'offers', 'https://thefeline.com', 'Fidélité et programmes de récompenses retail', 2, true),
  ('unilever.com', 'offers', 'https://unilever.com', 'Stratégies marques FMCG beauté et bien-être', 2, true),
  ('weleda.com', 'offers', 'https://weleda.com', 'Premium naturel et coffrets cadeaux wellness', 2, true),
  ('wisepops.com/blog', 'offers', 'https://wisepops.com', 'Popups et offres contextuelles', 2, true),
  ('woocommerce.com/blog', 'offers', 'https://woocommerce.com/blog', 'E-commerce WordPress et stratégies promotionnelles', 2, true),
  ('wrbm.com', 'offers', 'https://wrbm.com', 'World Retail Banking and Marketing', 2, true),
  ('wunderman-thompson.com', 'offers', 'https://wundermanthompson.com', 'Études tendances consommateurs', 2, true),
  ('syossbeauty.com', 'offers', 'https://syossbeauty.com', 'Benchmarks beauté capillaire et bundling', 3, true),
  ('vendasta.com/blog', 'offers', 'https://vendasta.com/blog', 'Stratégies promotionnelles locales et digitales', 3, true);

-- =============================================================================
-- FIN LOT 1 — Transformation BDD
-- =============================================================================
-- Les modifications apportées par cette migration :
--   ✅ Nouvelle table tenant_config créée (vide au démarrage)
--   ✅ Table diagnostic_children → diagnostic_items (JSONB agnostique)
--   ✅ Table shopify_orders → client_orders (source-agnostic)
--   ✅ Table ouate_products → client_products (source-agnostic)
--   ✅ Table recommendation_staging supprimée
--   ✅ Colonnes Legacy V1/V2 de marketing_recommendations supprimées
--   ✅ Colonne existing_ouate_products → existing_brand_products
--   ✅ Persona P0 seedé (pool des sessions non-attribuées)
--   ✅ 213 sources marketing génériques seedées
--
-- Prochaines étapes (Lots 2 à 12) :
--   Lot 2 : Création du dossier _shared/ pour les helpers Edge Functions
--   Lot 3 : Abstraction des PROJECT_ID = 'ouate' hardcodés
--   Lot 4 : Abstraction des system prompts IA (retrait des mentions Ouate)
--   Lot 5 : Refactor detect-persona-clusters pour agnosticisme des critères
--   Lot 6 : Renommages des tables dans le code (shopify_orders, ouate_products, etc.)
--   Lot 7 : Frontend — abstraction des composants
--   Lot 8 : Frontend — suppression Legacy V1/V2 et assets Ouate
--   Lot 9 : Frontend — rename onglet alerts → aski
--   Lot 10 : Régénération supabase/types.ts
--   Lot 11 : Ajustements diagnostic-webhook
--   Lot 12 : Nettoyage final + mise à jour documentation
-- =============================================================================
