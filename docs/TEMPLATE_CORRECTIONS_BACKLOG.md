# TEMPLATE_CORRECTIONS_BACKLOG

> **Document de référence pour la mise à jour du template `dashboard-template-askit`**
>
> Ce document liste toutes les corrections, améliorations et patterns à appliquer au template à partir du travail effectué sur le dashboard Cottan (avril 2026). Il sert UNE fois pour mettre à jour le template, après quoi tous les futurs onboardings (LIM, Demain Beauty, Baûbo, Endro) hériteront automatiquement de ces corrections.
>
> **Date de référence** : 27 avril 2026
> **Tenant source** : Cottan (`qkluqjeyelyvjbygcrkx.supabase.co`)
> **Cible** : `dashboard-template-askit`

---

## Sommaire

1. [Schéma BDD](#schéma-bdd)
2. [Edge functions](#edge-functions)
3. [Frontend hooks et composants](#frontend-hooks-et-composants)
4. [Helpers partagés](#helpers-partagés)
5. [Configuration et secrets](#configuration-et-secrets)
6. [Notes architecture et dette technique](#notes-architecture-et-dette-technique)
7. [Ordre d'application recommandé](#ordre-dapplication-recommandé)

---

## Schéma BDD

<details>
<summary><strong>1.1 — Ajout de la colonne <code>is_existing_client</code> sur <code>diagnostic_sessions</code></strong> (priorité moyenne)</summary>

### Problème
La colonne `is_existing_client` avait été supprimée lors d'un cleanup antérieur, ce qui a cassé le KPI "Nouveaux clients via diagnostic" (hardcodé à 0%).

### Solution

```sql
ALTER TABLE public.diagnostic_sessions
ADD COLUMN IF NOT EXISTS is_existing_client BOOLEAN DEFAULT NULL;
```

### Effort
~2 minutes (SQL simple)

### Risque de régression
Faible (colonne nullable, NULL par défaut)

### À porter sur template
Oui — colonne nécessaire pour le KPI nouveaux clients

</details>

<details>
<summary><strong>1.2 — Ajout de la colonne <code>tenant_id</code> sur <code>client_orders</code></strong> (priorité moyenne)</summary>

### Problème
`client_orders` n'avait pas de `tenant_id` contrairement aux autres tables (`diagnostic_sessions`, `diagnostic_items`, etc.). Incohérence architecturale qui crée une dette pour une éventuelle migration multi-tenant.

### Solution

```sql
ALTER TABLE public.client_orders
ADD COLUMN tenant_id VARCHAR(50) NOT NULL DEFAULT '<TENANT_CODE>';

CREATE INDEX IF NOT EXISTS idx_client_orders_tenant_id
ON public.client_orders(tenant_id);

-- Après backfill
ALTER TABLE public.client_orders
ALTER COLUMN tenant_id DROP DEFAULT;
```

### Effort
~5 minutes (ALTER TABLE + index + retrait DEFAULT)

### Risque de régression
Faible — toutes les lignes existantes seront `tenant_id = '<TENANT_CODE>'`

### À porter sur template
Oui — colonne fondamentale pour cohérence multi-tenant future

</details>

<details>
<summary><strong>1.3 — Contrainte UNIQUE sur <code>client_orders.external_order_id</code></strong> (priorité haute)</summary>

### Problème
Aucune contrainte UNIQUE sur `external_order_id`, ce qui permet des doublons quand Shopify renvoie plusieurs webhooks pour la même commande (refund, edit, retry). Source du bug critique CA Pauline (233,60€ → 0€).

### Solution

```sql
ALTER TABLE public.client_orders
ADD CONSTRAINT client_orders_tenant_external_order_unique
UNIQUE (tenant_id, external_order_id);
```

### Pré-requis
Avant d'appliquer la contrainte, supprimer tous les doublons existants :

```sql
WITH duplicates AS (
  SELECT external_order_id, COUNT(*) AS nb,
         MIN(created_at) AS first_created
  FROM public.client_orders
  WHERE external_order_id IS NOT NULL
  GROUP BY external_order_id
  HAVING COUNT(*) > 1
)
DELETE FROM public.client_orders co
USING duplicates d
WHERE co.external_order_id = d.external_order_id
  AND co.created_at != d.first_created
  AND co.total_amount = 0;
```

### Effort
~5 minutes

### Risque de régression
Faible — la contrainte est posée sur (tenant_id, external_order_id), permettant que 2 tenants distincts aient le même external_order_id

### À porter sur template
Oui — protection critique contre les écrasements webhook Shopify

</details>

<details>
<summary><strong>1.4 — Création de la table <code>tenant_commercial_facts</code></strong> (priorité moyenne)</summary>

### Problème
Pas de source de vérité structurée pour les conditions commerciales du client (livraison, retours, paiements, fidélité, garanties). Conséquence : hallucinations LLM dans les recommandations marketing (ex: "livraison gratuite 60€" au lieu de 30€ réels).

### Solution

```sql
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
```

### Catégories supportées
`shipping`, `returns`, `payment`, `promo`, `loyalty`, `guarantee`, `terms`, `faq`

### Effort
~5 minutes

### Risque de régression
Aucun (nouvelle table)

### À porter sur template
Oui

</details>

<details>
<summary><strong>1.5 — Ajout du champ <code>website_url</code> dans <code>tenant_config</code></strong> (priorité moyenne)</summary>

### Problème
Pas de champ pour stocker l'URL du site marchand client, nécessaire au scraper de commercial facts.

### Solution

```sql
ALTER TABLE public.tenant_config
ADD COLUMN IF NOT EXISTS website_url TEXT;
```

### Effort
~1 minute

### Risque de régression
Aucun (colonne nullable)

### À porter sur template
Oui

</details>

<details>
<summary><strong>1.6 — Fonction Postgres <code>generate_session_code()</code> : à conserver</strong> (priorité basse)</summary>

### Décision
La fonction est **GARDÉE** car le trigger `trg_generate_session_code` BEFORE INSERT l'utilise activement comme filet de sécurité pour les inserts manuels (scripts, backfills) qui ne fournissent pas de session_code.

### À porter sur template
Oui — laisser le trigger et la fonction en place comme filet de sécurité

### Note
Documenter dans le runbook : "le trigger ne s'active jamais en pratique car le client JS fournit toujours un session_code. La fonction reste en place comme filet pour les inserts manuels."

</details>

<details>
<summary><strong>1.7 — Suppression de l'edge function <code>shopify-checkout-webhook</code></strong> (priorité haute)</summary>

### Problème
Webhook orphelin (0 invocations sur 30 jours malgré 48 sessions Cottan + 3 checkouts + 1 conversion). 100% redondant avec le tracking frontend qui pose `checkout_started=true` via diagnostic-webhook au clic CTA.

### Solution

Suppression du dossier `supabase/functions/shopify-checkout-webhook/` et du secret `SHOPIFY_CHECKOUT_WEBHOOK_SECRET`.

### Important
Conserver les colonnes `checkout_started` et `checkout_at` dans `diagnostic_sessions` (lues par 3 consommateurs : `diagnostic-performance`, `generate-funnel-recommendations`, `SessionsTable.tsx`, alimentées par `diagnostic-webhook` au clic CTA).

### Effort
~5 minutes

### Risque de régression
Aucun (fonction non utilisée)

### À porter sur template
Oui — template plus simple (1 webhook Shopify suffit : orders/paid)

### Note runbook
Configuration Shopify simplifiée : 1 seul webhook à configurer (`orders/paid`). Pas de webhook checkout.

</details>

---

## Edge functions

<details>
<summary><strong>2.1 — Pagination Supabase systématique (paginateQuery helper)</strong> (priorité critique)</summary>

### Problème
PostgREST cap silencieusement les SELECT à 1000 lignes, faussant tous les KPIs sur les tables qui dépassent ce volume (notamment `diagnostic_sessions`, `diagnostic_items`, `marketing_sources`).

### Solution

Créer le helper `_shared/paginateSupabase.ts` :

```ts
export async function paginateQuery<T = any>(
  queryFn: (from: number, to: number) => any,
  options: { pageSize?: number } = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const allRows: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const to = from + pageSize - 1;
    const { data, error } = await queryFn(from, to);
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }
    allRows.push(...data);
    if (data.length < pageSize) hasMore = false;
    else from += pageSize;
  }

  return allRows;
}
```

Et son équivalent frontend `src/utils/paginateSupabase.ts` (même API).

### Application
Toutes les queries qui peuvent dépasser 1000 lignes :
- `diagnostic-performance/index.ts` (3 sections)
- `detect-persona-clusters/index.ts` (4 sections)
- `aski-chat/index.ts`
- Tous les hooks frontend qui lisent `diagnostic_sessions`, `diagnostic_items`, `client_orders`, `marketing_sources`

### Pattern obligatoire
Toute nouvelle query Supabase qui touche à `diagnostic_sessions`, `diagnostic_items`, `client_orders`, `marketing_sources`, `marketing_recommendations` doit utiliser `paginateQuery` ou justifier explicitement pourquoi elle peut s'en passer.

### Effort
~30 minutes pour migrer les 15 queries vulnérables identifiées

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>2.2 — RPC <code>get_intelligence_snapshot</code> tenant-agnostique</strong> (priorité moyenne)</summary>

### Problème
Les crons d'intelligence (Aski daily learn, monthly intelligence) faisaient des agrégations côté JS qui dépassaient le cap PostgREST.

### Solution
Créer une fonction Postgres RPC qui agrège côté SQL avec paramètres tenant-agnostiques :

```sql
CREATE OR REPLACE FUNCTION get_intelligence_snapshot(
  p_tenant_id VARCHAR,
  p_metadata_keys TEXT[]
) RETURNS JSONB AS $$
  -- Agrégation tenant-aware avec metadata keys lus depuis tenant_config
$$ LANGUAGE plpgsql;
```

### Helper associé
`_shared/metadataKeys.ts` : extraire les metadata keys depuis `tenant_config` pour passer à la RPC.

### À porter sur template
Oui — pattern à utiliser pour toute agrégation LLM-bound

</details>

<details>
<summary><strong>2.3 — Helper <code>logApiUsage</code> centralisé</strong> (priorité critique)</summary>

### Problème
Le tracking des coûts API était dispersé dans 6+ fichiers avec patterns variables. Certains appels n'étaient pas tracés (fire-and-forget).

### Solution

Créer `_shared/logApiUsage.ts` avec une signature standardisée :

```ts
export interface LogApiUsageParams {
  edgeFunction: string;
  apiProvider: 'anthropic' | 'gemini' | 'perplexity' | 'openai' | 'lovable_ai';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  metadata?: Record<string, unknown>;
}

export async function logApiUsage(supabase: any, params: LogApiUsageParams): Promise<void> {
  // INSERT dans api_usage_logs avec gestion d'erreur silencieuse
}
```

### Application
15 call sites migrés vers ce helper dans 6 fichiers :
- `aski-chat/index.ts`
- `aski-daily-learn/index.ts`
- `generate-funnel-recommendations/index.ts`
- `generate-marketing-recommendations/index.ts`
- `generate-recommendation-content/index.ts`
- `monthly-market-intelligence/index.ts`

### Note
Toutes les fonctions doivent utiliser `await logApiUsage(...)`, pas fire-and-forget.

### À porter sur template
**Oui — pattern obligatoire**

</details>

<details>
<summary><strong>2.4 — Helper <code>withApiUsageTracking</code> pour pattern try/finally</strong> (priorité haute)</summary>

### Problème
Le pattern "logApiUsage après INSERT" peut perdre des coûts si l'INSERT échoue. Cas observé sur `generate-recommendation-content` où un appel Sonnet de 6478 tokens était perdu si `week_start` causait une erreur PGRST204.

### Solution

```ts
export async function withApiUsageTracking<T>(
  supabase: any,
  params: WithApiUsageTrackingParams,
  fn: () => Promise<{ result: T; usage: ApiUsageTracking }>
): Promise<T> {
  let usage: ApiUsageTracking = { input: 0, output: 0, total: 0 };
  try {
    const { result, usage: u } = await fn();
    usage = u;
    return result;
  } finally {
    if (usage.input || usage.output || usage.total) {
      try {
        await logApiUsage(supabase, { ...params, ...usage });
      } catch (logErr) {
        console.error('[withApiUsageTracking] logApiUsage failed:', logErr);
      }
    }
  }
}
```

### Migration progressive
Ne PAS migrer en big bang les 5 edge functions actuelles qui appellent logApiUsage avant INSERT (pattern déjà robuste). Utiliser le helper UNIQUEMENT pour :
- Toute NOUVELLE edge function qui appelle un LLM puis fait un INSERT BDD
- Migration progressive des 5 fonctions actuelles quand on touchera à leur code pour autre chose

### À porter sur template
Oui — fichier à inclure, utilisation à mesure des besoins

</details>

<details>
<summary><strong>2.5 — Helper <code>portalUrls</code> + variabilisation URL portail</strong> (priorité critique)</summary>

### Problème
URL du portail admin Ask-it (`https://srzbcuhwrpkfhubbbeuw.supabase.co`) hardcodée dans 11 fichiers backend, avec 9 duplications inline.

### Solution

`_shared/portalUrls.ts` :

```ts
const PORTAL_URL = Deno.env.get('PORTAL_URL');

export function getPortalEndpoint(endpoint: string): string {
  if (!PORTAL_URL) {
    throw new Error('PORTAL_URL env var is not defined.');
  }
  const base = PORTAL_URL.replace(/\/$/, '');
  const path = endpoint.replace(/^\//, '');
  return `${base}/functions/v1/${path}`;
}

export function getPortalBaseUrl(): string {
  if (!PORTAL_URL) {
    throw new Error('PORTAL_URL env var is not defined.');
  }
  return PORTAL_URL.replace(/\/$/, '');
}
```

### Application
- Migrer les 2 helpers existants (`notifyPortalThreshold.ts`, `reportEdgeFunctionError.ts`)
- Supprimer les 9 duplications inline
- Migrer `get-org-limits/index.ts` (cas isolé)

### Secret à configurer
`PORTAL_URL=https://srzbcuhwrpkfhubbbeuw.supabase.co` (sans suffixe `/functions/v1`)

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>2.6 — Helper <code>getEmailProvider</code> tenant-agnostique</strong> (priorité critique)</summary>

### Problème
"Klaviyo" hardcodé dans 3 fichiers (aski-chat, generate-recommendation-content, monthly-market-intelligence). Cottan utilise Omnisend, donc Aski mentionnait "Klaviyo" dans ses réponses à Cottan.

### Solution

```ts
export type EmailProvider = 'klaviyo' | 'omnisend' | 'mailchimp' | 'brevo' | 'none';

export async function getEmailProvider(): Promise<EmailProvider> {
  const config = await loadTenantConfig();
  const integrations = (config?.integrations_enabled ?? {}) as Record<string, boolean>;

  if (integrations.klaviyo === true) return 'klaviyo';
  if (integrations.omnisend === true) return 'omnisend';
  if (integrations.mailchimp === true) return 'mailchimp';
  if (integrations.brevo === true) return 'brevo';

  return 'none';
}

export function getEmailProviderDisplayName(provider: EmailProvider): string;
export function getEmailProviderContextLine(provider: EmailProvider): string;
```

### Application
Utiliser dans les 3 fichiers concernés pour remplacer toute mention "klaviyo" hardcodée.

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>2.7 — Edge function <code>scrape-commercial-facts</code> (NOUVELLE)</strong> (priorité moyenne)</summary>

### Description
Nouvelle edge function qui scrape hebdomadairement les pages commerciales du site marchand client (livraison, retours, FAQ, CGV) et stocke les facts structurés dans `tenant_commercial_facts`.

### Fonctionnement
1. Lit `tenant_config.website_url` pour le tenant
2. Fetch la racine du site → extrait les liens du footer
3. Identifie les pages pertinentes via mots-clés (livraison, return, faq, cgv, etc.)
4. Pour chaque page : fetch HTML + Gemini Flash extrait les facts structurés
5. UPSERT dans `tenant_commercial_facts`

### Cron

```sql
SELECT cron.schedule(
  'scrape-commercial-facts-weekly',
  '0 8 * * 1',
  $$ ... $$
);
```

### Limites connues
- Ne capte pas les valeurs affichées en JS (bandeaux dynamiques, widgets panier)
- Source de vérité = HTML statique des pages policies/legal
- Pour les valeurs critiques absentes (ex: seuil livraison gratuite), garde anti-hallucination active : le LLM reste silencieux plutôt qu'inventer

### Évolution future possible
- Source enrichie via API Shopify Admin (`shipping_zones` officielles)
- Headless browser (Playwright) pour pages JS-only

### À porter sur template
Oui

</details>

<details>
<summary><strong>2.8 — Helper <code>getCommercialFacts</code> + injection prompt</strong> (priorité moyenne)</summary>

### Description
Helper qui lit `tenant_commercial_facts` et formate les facts pour injection dans les prompts LLM, avec garde anti-hallucination.

### Code

```ts
export async function getCommercialFacts(
  supabase: any,
  tenantId: string
): Promise<CommercialFactsByCategory>;

export function formatCommercialFactsForPrompt(
  facts: CommercialFactsByCategory
): string;
```

Le bloc formaté contient :
```
=== FAITS COMMERCIAUX VÉRIFIÉS ===
INTERDICTION ABSOLUE d'inventer ces valeurs.
Si une donnée n'est pas dans cette liste, NE LA MENTIONNE PAS.
[SHIPPING] ...
[RETURNS] ...
====================================
```

### Application
Injecter le bloc formaté en tête du prompt dans :
- `generate-recommendation-content` (fait pour Cottan)
- À étendre potentiellement à `aski-chat`

### À porter sur template
Oui

</details>

<details>
<summary><strong>2.9 — Hardening <code>shopify-order-webhook</code> : protection des 6 champs Shopify (Stratégie C+)</strong> (priorité critique)</summary>

### Problème
Le webhook écrasait `validated_cart_amount`, `conversion`, `exit_type`, `validated_products`, `upsells_converted`, `shopify_order_id` à chaque réception, sans aucune garde. Source du bug critique CA Pauline (233,60€ → 0€ lors d'un re-webhook avec total=0).

### Solution Stratégie C+ : no-op si conversion=true déjà

```ts
if (matchedSession.conversion === true) {
  console.log(
    `[shopify-order-webhook] Session ${matchedSession.session_code} ` +
    `already converted. Skipping update of Shopify-protected fields.`
  );

  if (matchedSession.shopify_order_id &&
      matchedSession.shopify_order_id !== orderIdShopify) {
    console.warn(
      `[shopify-order-webhook] Order ID mismatch for session ` +
      `${matchedSession.session_code}: stored=${matchedSession.shopify_order_id}, ` +
      `incoming=${orderIdShopify}. Possible order edit or refund.`
    );
  }

  return new Response(JSON.stringify({
    received: true, matched: true, skipped: true,
    reason: "session_already_converted"
  }), { status: 200 });
}

// Sinon : update normal (1ère conversion)
```

### Champs protégés
Une fois `conversion=true`, ces 6 champs sont en lecture seule via le webhook :
- `conversion`
- `exit_type` (`'converted'`)
- `validated_cart_amount`
- `validated_products`
- `upsells_converted`
- `shopify_order_id`

### Pour modifier ces valeurs en cas de besoin légitime
Procédure manuelle SQL admin documentée. Pas de modif automatique.

### Logs de monitoring
Le log `[shopify-order-webhook] Session ... already converted ... Skipping update` permet de mesurer la fréquence des re-webhooks (refund, edit, retry).

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>2.10 — Hardening <code>diagnostic-webhook</code> : protection anti-régression status + exit_type</strong> (priorité haute)</summary>

### Problème
Le diagnostic peut envoyer plusieurs payloads en cours de session. Si un payload tardif contient `status='en_cours'` après que la session soit passée à `'termine'`, le coalesce le faisait régresser silencieusement. Idem pour `exit_type` (converted → checkout → completed → abandon, jamais l'inverse).

### Solution

```ts
function protectStatus(existingStatus, payloadStatus): string | null {
  const FINAL_STATES = ['termine', 'abandonne'];
  if (existingStatus && FINAL_STATES.includes(existingStatus)) {
    if (payloadStatus && payloadStatus !== existingStatus) {
      console.log(`[protectStatus] Regression blocked`);
    }
    return existingStatus;
  }
  return payloadStatus ?? existingStatus ?? null;
}

function protectExitType(existingExitType, payloadExitType): string | null {
  const PROGRESSION_ORDER = [null, 'abandon', 'completed', 'checkout', 'converted'];
  const existingRank = PROGRESSION_ORDER.indexOf(existingExitType ?? null);
  const payloadRank = PROGRESSION_ORDER.indexOf(payloadExitType ?? null);
  if (existingRank > payloadRank) {
    if (payloadExitType) {
      console.log(`[protectExitType] Regression blocked`);
    }
    return existingExitType ?? null;
  }
  return payloadExitType ?? existingExitType ?? null;
}
```

### Règles de progression
- **Status** : `null → en_cours → termine` ou `→ abandonne`. Pas de retour en arrière depuis états finaux.
- **Exit_type** : `null → abandon → completed → checkout → converted`. Progression linéaire.

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>2.11 — UPSERT atomique dans <code>diagnostic-webhook</code></strong> (priorité haute)</summary>

### Problème
Pattern "SELECT-puis-INSERT" non atomique vulnérable à une race condition (collision session_code → erreur 23505 ou silent overwrite).

### Solution

Remplacer par UPSERT atomique avec `onConflict: 'session_code'` :

```ts
const { error } = await supabase
  .from('diagnostic_sessions')
  .upsert(payload, {
    onConflict: 'session_code',
    ignoreDuplicates: false,
  });
```

Le SELECT en amont reste nécessaire pour la logique de coalesce (protection status, exit_type, 6 champs Shopify).

### À porter sur template
Oui — déjà présent dans le template existant selon vérification, à valider

</details>

<details>
<summary><strong>2.12 — Suppression de <code>handleLegacyFormat</code> et résidus Ouate</strong> (priorité moyenne)</summary>

### Problème
Code legacy (gestion `diagnostic_responses`, `assignPersonaCode`, `engagement_score`, `number_of_children`, `is_existing_client_persona`, `content_format_preference`, etc.) propre à l'ancien client Ouate, qui pollue le template.

### Solution
Nettoyer 254 lignes au total :
- **Phase 1** : `assignPersonaCode()` legacy supprimée, remplacée par `session.persona_code || 'P0'`
- **Phase 2a** : `scoring.ts` (alias child) + `handlers.ts` L21 (fallback children) supprimés
- **Phase 2b** : `handleLegacyFormat` + branche `session_id` de `index.ts` supprimées
- **Phase 2c** : Lecture legacy `diagnostic_responses` dans `diagnostic-performance` (577 → 423 lignes)
- **Phase 3** : 18 commentaires reformulés dans 11 fichiers, 0 mention "Ouate" restante

### À porter sur template
Oui — template propre sans dette legacy

</details>

<details>
<summary><strong>2.13 — Suppression de la référence <code>trust_triggers_ordered</code> dans aski-chat</strong> (priorité haute)</summary>

### Problème
`aski-chat/index.ts` référençait la colonne `trust_triggers_ordered` qui n'existe plus en BDD (supprimée lors du cleanup Ouate, remplacée par `factors`). Causait l'erreur "Aski temporairement indisponible".

### Solution
1 ligne SELECT corrigée + 2 usages aval remappés dans `aski-chat/index.ts`.

### Note de prévention
Quand on supprime/renomme une colonne, faire un grep systématique :

```bash
grep -rn "<colonne_supprimee>" supabase/functions/ src/
```

### À porter sur template
Oui — vérifier que le template ne référence pas non plus cette colonne

</details>

<details>
<summary><strong>2.14 — Fix <code>week_start</code> inexistant dans <code>generate-recommendation-content</code></strong> (priorité haute)</summary>

### Problème
`handlers.ts` insérait `week_start: weekStart` dans `marketing_recommendations`, mais la colonne n'existe pas (PGRST204). Toute génération échouait à l'INSERT.

### Solution
Retirer `week_start` de `recoRow` (ligne ~812) ET adapter la query `weekRecosRes` (ligne 655) pour utiliser `generated_at >= weekStart` au lieu d'`eq('week_start', weekStart)`.

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>2.15 — Fix tracking coût try/finally dans <code>generate-recommendation-content</code></strong> (priorité moyenne)</summary>

### Problème
`logApiUsage()` appelé après l'INSERT réussi. Si l'INSERT échoue, les tokens consommés (~6000+ tokens Sonnet) ne sont jamais loggés.

### Solution
Encapsuler dans un try/finally pour garantir le logging.

### Note
Le helper `withApiUsageTracking` (#2.4) standardise ce pattern pour les futures fonctions.

### À porter sur template
Oui

</details>

<details>
<summary><strong>2.16 — Fix bug tracking tokens=0 dans <code>monthly-market-intelligence</code></strong> (priorité moyenne)</summary>

### Problème
Tokens à 0 dans `api_usage_logs` pour les appels Perplexity et Gemini de `monthly-market-intelligence`. Cause :
- Perplexity (ligne 369) : tokens loggés en dur avec 0, jamais extraits de `data.usage`
- Gemini (ligne 430) : extraction seulement de `total_tokens`, le helper force input/output à 0

### Solution
Adapter l'extraction des tokens depuis les responses Perplexity et Gemini pour fournir `inputTokens` et `outputTokens` explicites.

### Effort
~10 lignes

### Impact
Invisibilité des coûts mensuels Market Intelligence dans le portail (cost_total)

### À porter sur template
Oui

</details>

<details>
<summary><strong>2.17 — Fix TS dans <code>detect-persona-clusters</code></strong> (priorité haute)</summary>

### Problème
Refactor incomplet : signatures `extractCriteria(session, mapping)` et `findClusters(sessions, personas, minSize, mapping, criterionWeights)` enrichies avec `mapping` et `criterionWeights`. Les call-sites B1 ont été mis à jour, mais le call-site B3 (lignes 910-911) a été oublié.

### Solution

```ts
// AVANT (lignes 910-911)
const weakCriteria = weakSessions.map(extractCriteria);
const clusters = findClusters(weakCriteria, personas, min_cluster_size);

// APRÈS
const weakCriteria = weakSessions.map((s: any) => extractCriteria(s, mapping));
const clusters = findClusters(weakCriteria, personas, min_cluster_size, mapping, criterionWeights);
```

### Impact
La phase B3 (recombination des sessions à score faible) tomberait en panne silencieuse dès activation.

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>2.18 — Détection <code>is_existing_client</code> dans <code>shopify-order-webhook</code> (lecture locale)</strong> (priorité moyenne)</summary>

### Description
Au moment de la conversion d'une session, on doit déterminer si le client est nouveau ou existant pour le KPI K2.

### Solution choisie (version simple, lecture locale)

```ts
async function checkIsExistingClientLocal(
  supabase: any,
  email: string,
  sessionCreatedAt: string,
  tenantId: string
): Promise<boolean | null> {
  if (!email || !sessionCreatedAt) return null;

  try {
    const { count, error } = await supabase
      .from('client_orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('customer_email', email.toLowerCase())
      .lt('created_at', sessionCreatedAt);

    if (error) return null;
    return (count ?? 0) > 0;
  } catch (err) {
    return null;
  }
}
```

### Limite
Ne couvre pas les commandes pré-installation du webhook. Migration prévue vers API Shopify Customers (voir dette #6.3).

### À porter sur template
Oui — version simple suffit pour démarrer un onboarding client

</details>

---

## Frontend hooks et composants

<details>
<summary><strong>3.1 — Helper <code>src/lib/portal.ts</code></strong> (priorité critique)</summary>

### Problème
URLs portail (`https://app.ask-it.ai`, login, billing, contact email) hardcodées dans 7+ fichiers frontend.

### Solution

```ts
export const PORTAL_APP_URL = 'https://app.ask-it.ai';
export const PORTAL_API_URL = 'https://srzbcuhwrpkfhubbbeuw.supabase.co/functions/v1';
export const PORTAL_LOGIN_URL = `${PORTAL_APP_URL}/login`;
export const PORTAL_BILLING_URL = `${PORTAL_APP_URL}/dashboard/billing`;
export const ASKIT_CONTACT_EMAIL = 'contact@ask-it.ai';

export function getPortalApiUrl(endpoint: string): string {
  const path = endpoint.replace(/^\//, '');
  return `${PORTAL_API_URL}/${path}`;
}
```

### Application
Migrer les 7 fichiers :
- `AccessGate.tsx`
- `Dashboard.tsx`
- `AskiChat.tsx`
- `QuotaBanner.tsx`
- `UsageOverview.tsx`
- `RecosQuotaBanner.tsx`
- `UpgradePrompt.tsx`

Et `src/lib/error-reporter.ts` (`MONITORING_ENDPOINT`).

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>3.2 — Fix K1 (Routine 3+) dans <code>useInsightsMetrics.ts</code></strong> (priorité haute)</summary>

### Problème
Le KPI lisait `recommended_products` au lieu des produits **réellement achetés**, mesurant ainsi "% sessions où on a recommandé 3+ produits" (~100%) au lieu de "% sessions où le client a acheté 3+ produits" (vrai indicateur d'adoption).

### Solution

```ts
// K1 — Routine complète : compte les sessions converties dont la
// commande matchée contient ≥ 3 produits achetés.
// Source primaire : client_orders.raw_payload->'line_items'
// Fallback : validated_products en CSV

const routineCount = list.filter((s) => {
  if (!s.conversion) return false;

  const lineItemsCount = s.client_order_line_items_count ?? null;
  if (lineItemsCount !== null) {
    return lineItemsCount >= 3;
  }

  if (!s.validated_products) return false;
  const productsArray = s.validated_products
    .split(',')
    .map((p: string) => p.trim())
    .filter(Boolean);
  return productsArray.length >= 3;
}).length;

const convertedTotal = list.filter((s) => s.conversion).length;
const routineCompletePercent = convertedTotal > 0
  ? (routineCount / convertedTotal) * 100
  : 0;
```

### Pré-requis
Adapter la query qui charge les sessions pour inclure `client_order_line_items_count` via JOIN ou RPC.

### Limite documentée pour le runbook
Le KPI démarre son comptage à partir des commandes ayant `raw_payload` peuplé (post-fix idempotence webhook).

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>3.3 — Fix K2 (Nouveaux clients) dans <code>useInsightsMetrics.ts</code></strong> (priorité haute)</summary>

### Problème
`newClientsPercent = 0` hardcodé suite à la suppression de la colonne `is_existing_client`.

### Solution

```ts
const convertedSessions = list.filter((s) => s.conversion);
const sessionsWithKnownStatus = convertedSessions.filter((s) =>
  s.is_existing_client !== null && s.is_existing_client !== undefined
);
const newClientsCount = sessionsWithKnownStatus.filter((s) =>
  s.is_existing_client === false
).length;

const newClientsPercent = sessionsWithKnownStatus.length > 0
  ? (newClientsCount / sessionsWithKnownStatus.length) * 100
  : 0;
```

### Pré-requis
`is_existing_client` doit être au SELECT.

### À porter sur template
**Oui — critique**

</details>

<details>
<summary><strong>3.4 — Filtre <code>tenant_id</code> sur les SELECT <code>client_orders</code> (defensive programming)</strong> (priorité moyenne)</summary>

### Description
Toutes les lectures de `client_orders` doivent filtrer explicitement par `tenant_id` pour cohérence et future-proof multi-tenant.

### Application
5 fichiers concernés :
- `supabase/functions/diagnostic-performance/index.ts` (l.161, l.234)
- `supabase/functions/persona-priorities/index.ts` (l.63)
- `supabase/functions/persona-stats/index.ts` (l.135)
- `src/hooks/useBusinessMetrics.ts` (l.69)
- `src/hooks/useInsightsMetrics.ts` (l.53)
- `src/hooks/useRevenueTimeseries.ts` (l.42, l.67)

### Pattern

```ts
.from('client_orders')
.select('...')
.eq('tenant_id', '<TENANT_CODE>')
.eq(...)
```

### À porter sur template
Oui — discipline de cohérence multi-tenant

</details>

<details>
<summary><strong>3.5 — Génération CSPRNG du <code>session_code</code> côté diagnostic</strong> (priorité moyenne)</summary>

### Note
Modification dans le PROJET DIAGNOSTIC (séparé du dashboard), à porter sur le template diagnostic.

### Problème
`Math.random()` non-cryptographique pour générer le session_code. Risque (théorique mais réel) de collision et silent overwrite à grand volume.

### Solution

Dans `src/lib/webhook.ts` du projet diagnostic :

```ts
function generateSessionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 12;

  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(randomValues[i] % chars.length);
  }
  return code;
}
```

### Format préservé
12 caractères alphanumériques majuscules. Compatible avec le regex de validation `/^[A-Z0-9]{6,12}$/`.

### À porter sur template diagnostic
Oui — recommandé

</details>

---

## Helpers partagés

<details>
<summary><strong>Liste des helpers <code>_shared/</code> à inclure dans le template</strong></summary>

### Helpers backend (`supabase/functions/_shared/`)

| Helper | Rôle | Priorité |
|---|---|---|
| `paginateSupabase.ts` | Paginer les SELECT > 1000 lignes | Critique |
| `metadataKeys.ts` | Extraire les keys metadata depuis tenant_config (RPC tenant-agnostique) | Haute |
| `logApiUsage.ts` | Tracking API standardisé | Critique |
| `withApiUsageTracking.ts` | Wrapper try/finally pour tracking robuste | Haute |
| `portalUrls.ts` | URLs portail centralisées | Critique |
| `notifyPortalThreshold.ts` | Notification quota au portail | Haute (existant, à utiliser via portalUrls) |
| `reportEdgeFunctionError.ts` | Reporter erreur au portail | Haute (existant, à utiliser via portalUrls) |
| `getEmailProvider.ts` | Provider email tenant-agnostique | Critique |
| `getCommercialFacts.ts` | Lecture + formatage commercial facts pour prompts LLM | Moyenne |
| `loadTenantConfig.ts` | Lecture tenant_config (existant) | Critique |

### Helpers frontend (`src/lib/`)

| Helper | Rôle | Priorité |
|---|---|---|
| `portal.ts` | URLs portail (PORTAL_APP_URL, PORTAL_LOGIN_URL, etc.) | Critique |
| `paginateSupabase.ts` (`src/utils/`) | Paginer côté frontend | Critique |
| `error-reporter.ts` | Reporter erreurs frontend (existant, à mettre à jour avec getPortalApiUrl) | Haute |

</details>

---

## Configuration et secrets

<details>
<summary><strong>5.1 — Liste minimale des secrets par client</strong></summary>

### Secrets auto-fournis par Lovable/Supabase
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Secrets fixes Ask-it (mêmes valeurs pour tous les clients)
- `PORTAL_URL` = `https://srzbcuhwrpkfhubbbeuw.supabase.co`
- `MONITORING_API_KEY` (fixe Ask-it)
- `USAGE_STATS_API_KEY` (fixe Ask-it)
- `CORS_ALLOWED_ORIGINS` (liste séparée par virgules)

### Secrets spécifiques au client à configurer à l'onboarding
- `SHOPIFY_WEBHOOK_SECRET` (HMAC depuis Shopify admin)
- `ORGANIZATION_ID` (UUID généré à la création de l'org dans le portail)

### Clés API LLM par-client (pour isolation des coûts)
- `ANTHROPIC_API_KEY` (par-client)
- `GEMINI_API_KEY` ou `LOVABLE_API_KEY` (par-client)
- `PERPLEXITY_API_KEY` (par-client)

### Total
**~10 secrets par client** (3 auto + 4 fixes + 2 client + 3 LLM = 12 total mais 3 auto-fournis)

### Note future
- `SHOPIFY_ADMIN_API_TOKEN` à ajouter pour l'évolution K2 vers API Shopify Customers (voir dette #6.3)

</details>

<details>
<summary><strong>5.2 — Schéma <code>tenant_config</code> à initialiser</strong></summary>

```json
{
  "project_id": "<TENANT_CODE>",
  "brand_name": "<Nom de la marque>",
  "industry": "<Industrie précise, ex: dermo-cosmétique naturelle premium>",
  "brand_tone": "<Tone, ex: savant, sensoriel, élégant>",
  "target_audience": "<Description ciblée>",
  "currency": "EUR",
  "website_url": "<URL racine du site marchand>",
  "integrations_enabled": {
    "shopify": false,
    "klaviyo": false,
    "omnisend": false,
    "mailchimp": false,
    "brevo": false
  },
  "persona_dimension_mapping": { /* selon le diagnostic */ },
  "min_cluster_size": 10
}
```

</details>

<details>
<summary><strong>5.3 — Cron jobs à programmer</strong></summary>

### Cron existants (à conserver)
- `monthly-market-intelligence` : 1er du mois 8h UTC
- `weekly-intelligence-refresh` : lundi 9h UTC
- `detect-persona-clusters` : quotidien 3h UTC
- `mark-stale-sessions-as-abandoned` : quotidien
- `aski-daily-learn` : quotidien

### Cron à ajouter
- `scrape-commercial-facts-weekly` : **lundi 8h UTC**

</details>

---

## Notes architecture et dette technique

<details>
<summary><strong>6.1 — Architecture multi-tenant à décider</strong></summary>

### Situation actuelle
Architecture **1 BDD par client** : Cottan a sa BDD, Ouate a la sienne, LIM/Demain Beauty/Baûbo/Endro auront chacun la leur.

### Implications
- `tenant_id` cohérent dans toutes les tables (defensive programming)
- Mais en pratique chaque BDD ne contient qu'un seul tenant
- L'incohérence "certaines tables ont tenant_id, d'autres pas" a été corrigée (cf. #1.2)

### Évolution future possible
Migration vers architecture multi-tenant véritable (1 BDD partagée pour N clients) :
- Économies coûts Supabase
- Vue cross-tenant côté admin
- Mais : refonte RLS, isolation client, sécurité

### Décision actuelle
Garder 1 BDD par client. Le template prévoit `tenant_id` partout pour faciliter une éventuelle migration future.

</details>

<details>
<summary><strong>6.2 — Synchronisation catalogue Shopify (chantier reporté)</strong></summary>

### Problème
`client_products` reste vide pour les nouveaux clients. Aski et les recos marketing ne peuvent pas mentionner de produits spécifiques.

### Solution prévue (non implémentée)
Sync hebdomadaire ou temps réel des produits Shopify (Storefront API ou Admin API) vers `client_products`.

### Limites actuelles
- Aski répond honnêtement "catalogue non synchronisé" pour les questions produits
- Les recos marketing restent partiellement génériques
- Acceptable au démarrage d'un client, à activer en phase 2

### Effort estimé
30-45 jours

### Documentation runbook
À l'activation client, documenter clairement : "Le catalogue Shopify n'est pas synchronisé. Les recos produits se font via les mappings du diagnostic. Sync prévue en phase 2 (2-3 mois après l'activation)."

</details>

<details>
<summary><strong>6.3 — Évolution K2 vers API Shopify Customers</strong></summary>

### Description
Migration de la version simple (lecture locale `client_orders`) vers une version évoluée qui appelle l'API Shopify Admin Customers pour avoir l'historique complet des clients (incluant les commandes pré-installation du webhook).

### Pré-requis
- `SHOPIFY_ADMIN_API_TOKEN` (`shpat_*`) configuré comme secret par-client
- Scope `read_customers` activé dans l'app Shopify du client

### Bénéfices
- Vue complète clients pré-installation
- Données enrichies possibles (`total_spent`, `created_at`, `orders_count`)
- Source de vérité directe Shopify

### Effort estimé
~30-50 lignes (Option minimale) ou ~50-80 lignes (Option enrichie avec 4 colonnes)

### À documenter dans runbook
Procédure d'installation app Custom Shopify avec scope `read_customers` + récupération du `shpat_` lors de l'install initiale.

</details>

<details>
<summary><strong>6.4 — Refactor "Top produit acheté" via raw_payload</strong></summary>

### Description
Le KPI "Top produit acheté" actuel utilise `validated_products` qui peut être incomplet (juste l'upsell après un re-webhook). Migration vers la lecture de `client_orders.raw_payload->'line_items'` pour avoir tous les produits réellement achetés.

### Effort
~10 lignes

</details>

<details>
<summary><strong>6.5 — Marketing sources : ajouter colonne <code>provider</code></strong></summary>

### Problème
Les 226 marketing_sources sont mélangées (Klaviyo, Omnisend, Meta Ads, etc.). Pas de filtrage par provider selon le tenant.

### Solution
Ajouter une colonne `provider` dans `marketing_sources` et filtrer par provider lors de l'injection dans les prompts LLM.

### Effort
~30 lignes (ALTER TABLE + backfill manuel des 226 sources + adaptation des injecteurs)

</details>

<details>
<summary><strong>6.6 — Fallback bandeaux JS pour commercial facts</strong></summary>

### Problème
Les bandeaux JS (ex: "Livraison gratuite dès 30€" affiché en haut de page Cottan) ne sont pas captés par le scraper basique.

### Solutions possibles
1. Champ `commercial_facts_manual` dans `tenant_config` à remplir à l'onboarding
2. Headless browser (Playwright) — complexe sur Edge Functions
3. API Shopify Admin (`shipping_zones`) pour les seuils de livraison gratuite

### Décision actuelle
Accepter la limite. Le scraper retourne "rien" plutôt qu'inventer (zéro hallucination > info partielle).

### À documenter dans runbook
Limite acceptée du scraper. Pour les valeurs critiques affichées en JS, le LLM restera silencieux à leur sujet (comportement voulu, pas un bug).

</details>

<details>
<summary><strong>6.7 — Audit edge functions portail Ask-it</strong></summary>

### À faire (chantier séparé portail)
3 edge functions côté portail (`notifications-api`, `quota-threshold-reached`, `fetch-client-usage`) ont été auditées en avril 2026 et fonctionnent correctement.

Mais la chaîne complète tenant → portail mérite un audit récurrent (tous les 3 mois ?) pour s'assurer que les notifications de quota arrivent bien et que les coûts sont remontés.

### Note technique
Le test live H.3 du `quota-threshold-reached` a créé un side-effect réel sur Ouate Paris (notif + reminder). Le flag `test: true` a été ajouté ensuite pour permettre des tests sans side-effect.

</details>

---

## Ordre d'application recommandé

### Phase 1 — Préparation BDD et helpers (priorité critique)

1. Créer les helpers `_shared/` (paginateSupabase, logApiUsage, withApiUsageTracking, portalUrls, getEmailProvider, getCommercialFacts)
2. Créer le helper `src/lib/portal.ts`
3. Migrations SQL :
   - `is_existing_client` sur `diagnostic_sessions` (#1.1)
   - `tenant_id` sur `client_orders` (#1.2)
   - Contrainte UNIQUE sur `client_orders` (#1.3)
   - Table `tenant_commercial_facts` (#1.4)
   - Champ `website_url` sur `tenant_config` (#1.5)
4. Configurer les secrets fixes (PORTAL_URL, MONITORING_API_KEY, USAGE_STATS_API_KEY, CORS_ALLOWED_ORIGINS)

### Phase 2 — Edge functions (priorité haute)

5. Pagination dans toutes les edge functions vulnérables (#2.1)
6. Tenant-agnostique : URLs portail (#2.5), email provider (#2.6)
7. Hardening webhooks : `shopify-order-webhook` (#2.9), `diagnostic-webhook` (#2.10, #2.11)
8. Suppression `shopify-checkout-webhook` (#1.7)
9. Cleanup résidus Ouate (#2.12)
10. Fix `trust_triggers_ordered` (#2.13), `week_start` (#2.14), TS `detect-persona-clusters` (#2.17)
11. Tracking API try/finally (#2.4, #2.15)
12. Edge function `scrape-commercial-facts` + cron (#2.7, #5.3)
13. Logique `is_existing_client` dans webhook Shopify (#2.18)

### Phase 3 — Frontend (priorité haute)

14. Migration URLs portail (#3.1)
15. Fix K1 et K2 dans `useInsightsMetrics` (#3.2, #3.3)
16. Filtre `tenant_id` defensive (#3.4)
17. CSPRNG côté diagnostic (#3.5) — projet diagnostic distinct

### Phase 4 — Validation finale

18. Configurer un tenant de test (LIM)
19. Run complet bout-en-bout :
    - Diagnostic + tracking session
    - Webhook Shopify + protection 6 champs
    - Aski répond avec bon provider email
    - Reco marketing avec commercial facts
    - Market Intelligence
    - KPIs Routine 3+ et Nouveaux clients
20. Documenter les écarts éventuels avec Cottan

### Phase 5 — Backlog différé (priorité moyenne/basse)

- Sync catalogue Shopify (#6.2)
- Évolution K2 via Shopify Customers API (#6.3)
- Refactor Top produit acheté (#6.4)
- Marketing sources colonne provider (#6.5)
- Audit récurrent portail (#6.7)

---

## Annexe — Fichiers ajoutés/modifiés/supprimés

### Fichiers AJOUTÉS au template

```
supabase/functions/_shared/paginateSupabase.ts
supabase/functions/_shared/metadataKeys.ts
supabase/functions/_shared/logApiUsage.ts
supabase/functions/_shared/withApiUsageTracking.ts
supabase/functions/_shared/portalUrls.ts
supabase/functions/_shared/getEmailProvider.ts
supabase/functions/_shared/getCommercialFacts.ts
supabase/functions/scrape-commercial-facts/index.ts
src/lib/portal.ts
src/utils/paginateSupabase.ts
```

### Fichiers MODIFIÉS

```
supabase/functions/aski-chat/index.ts
supabase/functions/aski-daily-learn/index.ts
supabase/functions/detect-persona-clusters/index.ts
supabase/functions/diagnostic-performance/index.ts
supabase/functions/diagnostic-webhook/index.ts
supabase/functions/diagnostic-webhook/handlers.ts
supabase/functions/generate-funnel-recommendations/index.ts
supabase/functions/generate-marketing-recommendations/index.ts
supabase/functions/generate-recommendation-content/index.ts
supabase/functions/generate-recommendation-content/handlers.ts
supabase/functions/get-org-limits/index.ts
supabase/functions/get-usage-stats/index.ts
supabase/functions/monthly-market-intelligence/index.ts
supabase/functions/persona-priorities/index.ts
supabase/functions/persona-stats/index.ts
supabase/functions/shopify-order-webhook/index.ts
supabase/functions/sync-klaviyo-persona/index.ts
supabase/functions/weekly-intelligence-refresh/index.ts
supabase/functions/_shared/notifyPortalThreshold.ts
supabase/functions/_shared/reportEdgeFunctionError.ts
src/components/AccessGate.tsx
src/components/dashboard/AskiChat.tsx
src/components/dashboard/QuotaBanner.tsx
src/components/dashboard/UsageOverview.tsx
src/components/dashboard/marketing/shared/RecosQuotaBanner.tsx
src/components/dashboard/shared/UpgradePrompt.tsx
src/hooks/useBusinessMetrics.ts
src/hooks/useInsightsMetrics.ts
src/hooks/useRevenueTimeseries.ts
src/lib/error-reporter.ts
src/pages/Dashboard.tsx
```

### Fichiers SUPPRIMÉS

```
supabase/functions/shopify-checkout-webhook/  (dossier complet)
```

### Modifications schéma BDD

```sql
ALTER TABLE diagnostic_sessions ADD COLUMN is_existing_client BOOLEAN DEFAULT NULL;
ALTER TABLE client_orders ADD COLUMN tenant_id VARCHAR(50) NOT NULL;
ALTER TABLE client_orders ADD CONSTRAINT client_orders_tenant_external_order_unique UNIQUE (tenant_id, external_order_id);
ALTER TABLE tenant_config ADD COLUMN website_url TEXT;
CREATE TABLE tenant_commercial_facts (...);
CREATE INDEX idx_client_orders_tenant_id ON client_orders(tenant_id);
CREATE INDEX idx_tenant_commercial_facts_tenant ON tenant_commercial_facts(tenant_id, category);
CREATE INDEX idx_tenant_commercial_facts_active ON tenant_commercial_facts(tenant_id, is_active) WHERE is_active = true;
```

### Cron à programmer

```sql
SELECT cron.schedule('scrape-commercial-facts-weekly', '0 8 * * 1', $$ ... $$);
```

---

## Notes finales

### Principes architecturaux à préserver
- **Tenant-agnostique strict** : aucune valeur hardcodée par-client, tout via `tenant_config` + helpers partagés
- **Defensive programming** : filtrer explicitement par `tenant_id` dans toutes les queries
- **Anti-régression** : protection des champs critiques (status, exit_type, 6 champs Shopify) via helpers
- **Pagination systématique** : toute query Supabase potentiellement > 1000 lignes utilise `paginateQuery`
- **Anti-hallucination** : injection des `commercial_facts` dans les prompts LLM avec garde explicite
- **Tracking API garanti** : utiliser `withApiUsageTracking` pour les nouvelles fonctions

### Patterns à éviter
- ❌ `Math.random()` pour des identifiants serveur
- ❌ SELECT-puis-INSERT non transactionnel
- ❌ `logApiUsage` en post-INSERT (préférer try/finally)
- ❌ URLs portail/contact hardcodées
- ❌ "Klaviyo" en dur dans les prompts/keywords
- ❌ Webhook Shopify sans garde idempotence sur `conversion=true`

---

**Fin du document — version 1.0 — 27 avril 2026**
