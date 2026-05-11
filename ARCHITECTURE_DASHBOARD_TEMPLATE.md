# Architecture — Dashboard Template Ask-It

> **Document de référence** pour le template générique du dashboard Ask-It.
> Version : avril 2026 · Repo : `dashboard-template-askit` · Base de départ : `tableau-ouate-ea1cab29`

---

## Préambule

Ce document décrit l'architecture du template `dashboard-template-askit` après transformation complète (14 commits, 12 lots — avril 2026). Le repo est **prêt à être utilisé** pour onboarder de nouveaux clients.

Le dashboard est **prêt à être dupliqué pour chaque nouveau client Ask-It**, sans code spécifique à une marque, sans données réelles, mais avec **toute la logique fonctionnelle, l'architecture, les hooks, les Edge Functions, les crons, et les patterns éprouvés** de la stack Ask-It.

Le template arrive vide. Il devient un dashboard client en quelques étapes simples : Remix dans Lovable → configuration des secrets → insertion du `tenant_config` → branchement des intégrations → onboarding terminé.

---

## Table des matières

1. [Philosophie du template](#1-philosophie-du-template)
2. [Stack technique](#2-stack-technique)
3. [Schéma BDD générique](#3-schéma-bdd-générique)
4. [Edge Functions](#4-edge-functions)
5. [Frontend — 8 onglets](#5-frontend--8-onglets)
6. [Hooks React](#6-hooks-react)
7. [Système de personas](#7-système-de-personas)
8. [Système de recommandations marketing IA](#8-système-de-recommandations-marketing-ia)
9. [Configuration Aski](#9-configuration-aski)
10. [Intégrations externes optionnelles](#10-intégrations-externes-optionnelles)
11. [Intégration portail admin](#11-intégration-portail-admin)
12. [Crons](#12-crons)
13. [Sécurité et RLS](#13-sécurité-et-rls)
14. [System prompts IA — patron générique](#14-system-prompts-ia--patron-générique)
15. [Branding et design system](#15-branding-et-design-system)
16. [Les 16 règles non-négociables](#16-les-16-règles-non-négociables)
17. [Configuration secrets](#17-configuration-secrets)
18. [Checklist d'onboarding client en 10 étapes](#18-checklist-donboarding-client-en-10-étapes)
19. [Carte de la transformation Ouate → Template](#19-carte-de-la-transformation-ouate--template)

---

## 1. Philosophie du template

### 1.1 Pourquoi ce template existe

Avant ce template, l'onboarding d'un nouveau client Ask-It nécessitait de dupliquer manuellement le projet Lovable du dashboard Ouate, puis de naviguer dans des dizaines de fichiers pour retirer les références spécifiques à Ouate (noms de produits, personas hardcodés, prompts IA mentionnant "cosmétique enfant", catalogue Shopify spécifique, etc.). Ce processus prenait plusieurs jours, était sujet à erreurs, et chaque oubli créait des problèmes en production.

Le template résout ce problème en fournissant **une coquille fonctionnelle complète** où toute la logique réutilisable est conservée et où tout le contenu spécifique à une marque est soit extrait dans des variables de configuration, soit retiré pour être réintroduit lors de l'onboarding.

### 1.2 Ce qui est réutilisable et ce qui est paramétrable

Le dashboard Ouate contient deux types d'éléments :

**Réutilisables tels quels** : la structure des 8 onglets, les hooks React, les Edge Functions génériques (diagnostic-performance, persona-stats, persona-priorities, detect-persona-clusters, aski-chat, generate-recommendation-content, etc.), la logique de scoring de personas (pondération identity 25 % / need 50 % / behavior 25 %), le système de quotas, le pipeline IA Perplexity → Gemini → Claude Sonnet, l'intégration avec le portail admin (AccessGate, tokens, monitoring, error-reporter), l'architecture des recommandations marketing V3 on-demand, la mémoire de marque Aski, le système de crons.

**Paramétrables par client** : le nom et le ton de marque, le catalogue produits, les champs de la table `diagnostic_items` (qui remplace `diagnostic_children`), les personas (créés automatiquement par `detect-persona-clusters` à partir des sessions du nouveau client), les sources marketing spécifiques (les 213 sources génériques restent dans le template), le tenant_id, les intégrations externes (Shopify, Klaviyo, GA4 — chacune optionnelle), le `project_id`.

### 1.3 La règle de base : zéro Ouate dans le template

À l'issue de la transformation, **aucune référence à Ouate, à la cosmétique enfant, ni à la tranche d'âge 4-12** ne doit subsister dans le code du template. Les seules mentions tolérées sont dans des commentaires explicatifs ou dans la documentation, et toujours formulées comme "exemple" ou "référence d'origine".

### 1.4 Workflow d'utilisation du template

1. Le template existe comme **projet Lovable** connecté au repo GitHub `https://github.com/pierrechn26/dashboard-template-askit`
2. Pour onboarder un nouveau client, on **Remix** le projet template dans Lovable. Le Remix crée automatiquement un nouveau projet Lovable + un nouveau repo GitHub (ex: `tableau-{client}`) indépendant, sans l'historique du template
3. Lovable Cloud auto-provisionne un nouveau projet Supabase vierge et exécute les migrations SQL
4. On configure les secrets côté Edge Functions (clés API, ORGANIZATION_ID, etc.)
5. On crée la fiche de l'org dans le portail admin et on génère les tokens d'accès
6. On branche les intégrations externes du client (Shopify, Klaviyo, GA4) si applicables
7. On personnalise les variables de marque (nom, ton, catalogue) via la table `tenant_config`
8. Le dashboard est prêt à recevoir les premières sessions du diagnostic du client

Tout ce processus est documenté en détail dans `ONBOARDING_CLIENT_ASKIT.md`.

### 1.5 Maintenance du template au fil du temps

Le template n'est **pas** synchronisé avec les évolutions futures du dashboard Ouate. Si Ouate évolue, il faudra reporter manuellement les changements pertinents dans le template. Inversement, si le template évolue, il faudra reporter les changements pertinents dans les dashboards des clients existants. C'est gérable tant qu'on a moins d'une dizaine de clients ; au-delà, on envisagera une vraie architecture multi-tenant unique.

---

## 2. Stack technique

### 2.1 Frontend

| Élément | Valeur |
|---------|--------|
| Framework | React 18 |
| Build tool | Vite |
| Language | TypeScript |
| UI library | shadcn/ui (Radix UI) |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| State | React Context + hooks |
| Charts | Recharts |
| Icons | Lucide React |
| Animations | Framer Motion |
| Date | date-fns |
| PDF export | html2canvas + jsPDF |
| Markdown | react-markdown |

### 2.2 Backend (Supabase)

| Élément | Valeur |
|---------|--------|
| Base de données | PostgreSQL (Supabase) |
| Auth | Supabase Auth (gestion via portail Ask-It uniquement) |
| Functions | Supabase Edge Functions (Deno runtime) |
| Storage | Supabase Storage (bucket `csv-imports` optionnel) |
| Crons | pg_cron + Supabase Scheduler |
| Real-time | Non utilisé dans le template |

### 2.3 Providers IA

| Provider | Endpoint | Modèles | Usage |
|----------|----------|---------|-------|
| Anthropic | `https://api.anthropic.com/v1/messages` | `claude-sonnet-4-6` | Aski (primaire) + Recommandations marketing |
| Lovable AI Gateway | `https://ai.gateway.lovable.dev/v1/chat/completions` | `google/gemini-2.5-pro` | Aski (fallback) |
| Lovable AI Gateway | `https://ai.gateway.lovable.dev/v1/chat/completions` | `google/gemini-3.1-pro-preview` | Analyse marché mensuelle |
| Lovable AI Gateway | `https://ai.gateway.lovable.dev/v1/chat/completions` | `google/gemini-2.5-flash` | Recommandations funnel |
| Lovable AI Gateway | `https://ai.gateway.lovable.dev/v1/chat/completions` | `google/gemini-3-flash-preview` | Apprentissage Aski quotidien |
| Perplexity | `https://api.perplexity.ai/chat/completions` | `sonar-pro` | Veille marché + recherches Aski conditionnelles |

**Décision architecturale clé** : Sonnet 4.6 est utilisé partout où Claude est appelé (Aski et Recommandations marketing), pour cohérence et qualité. Gemini Pro est le fallback Aski (et non Flash) pour minimiser la perte de qualité en cas de bascule.

### 2.4 Intégrations externes optionnelles

Activables/désactivables par client via flags de configuration et présence/absence des secrets correspondants :

| Intégration | Edge Functions concernées | Secrets requis |
|------------|--------------------------|----------------|
| Shopify | `shopify-order-webhook`, `shopify-checkout-webhook`, `sync-shopify-products`, `import-shopify-csv` | `SHOPIFY_*` |
| Klaviyo | `sync-klaviyo-persona`, `backfill-klaviyo` | `KLAVIYO_API_KEY` |
| Google Analytics 4 | `ga4-analytics` | `GA4_*` |
| Meta Pixel | Tracking côté frontend uniquement | (aucun secret BDD) |

Si une intégration n'est pas configurée pour un client, les Edge Functions correspondantes retournent gracieusement un état neutre (pas de crash, pas de pollution des logs).


---

## 3. Schéma BDD générique

Le template contient **18 tables** au total. Une seule table a été retirée par rapport au dashboard Ouate : `recommendation_staging` (résidu de l'ancienne architecture Marketing IA en 3 étapes, plus utilisée). Toutes les autres sont conservées avec, le cas échéant, un renommage de champ pour retirer toute spécificité Ouate.

### 3.1 Table `tenant_config` (NOUVELLE — propre au template)

Cette table n'existe pas dans Ouate. Elle est créée pour le template et contient les paramètres de personnalisation par tenant. Une seule ligne par projet (le template a une seule ligne, créée vide à l'init).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | Clé primaire |
| `project_id` | VARCHAR UNIQUE | Identifiant tenant (remplace les `'ouate'` hardcodés) |
| `brand_name` | VARCHAR | Nom d'affichage de la marque (remplace `"Ouate Paris"` hardcodé) |
| `brand_tone` | TEXT | Description du ton de marque pour les prompts IA |
| `brand_description` | TEXT | Description courte du positionnement |
| `target_audience` | TEXT | Cible client (ex: "Parents d'enfants 4-12 ans") |
| `industry` | VARCHAR | Secteur (ex: "cosmétique enfant", "mode femme") |
| `currency` | VARCHAR(3) | Devise par défaut (`EUR`, `USD`, etc.) |
| `locale` | VARCHAR(5) | Locale par défaut (`fr-FR`) |
| `timezone` | VARCHAR | Timezone (`Europe/Paris`) |
| `dashboard_url` | VARCHAR | URL publique du dashboard |
| `diagnostic_url` | VARCHAR | URL publique du diagnostic |
| `client_context_json` | JSONB | Contexte enrichi pour `monthly-market-intelligence` (catalogue produits, canaux, code promo, URL boutique) |
| `integrations_enabled` | JSONB | `{ "shopify": true, "klaviyo": false, "ga4": true, "meta_pixel": true }` |
| `created_at`/`updated_at` | TIMESTAMPTZ | Dates |

**RLS** : lecture publique anon (les valeurs sont non sensibles), écriture service_role uniquement.

**Pourquoi cette table** : c'est la source de vérité unique pour tout ce qui est "spécifique marque" dans le template. Toutes les Edge Functions et hooks qui avaient des constantes hardcodées (`PROJECT_ID = "ouate"`, `brandName = "Ouate Paris"`, `OUATE_CLIENT_CONTEXT`, etc.) lisent désormais depuis cette table au démarrage. C'est ce qui permet de personnaliser un nouveau client en modifiant **une seule ligne** au lieu de chercher dans 30 fichiers.

### 3.2 Table `diagnostic_sessions`

Conservée intégralement. Les commentaires de section dans le SQL sont conservés et formalisent **les 5 catégories canoniques** que tout diagnostic Ask-It doit respecter :

```
-- Identification & Tracking
-- Personas & IA
-- Business & Conversion
-- Comportement
-- Questions globales (phase 4)
```

**Champs renommés pour générique** :
- `existing_ouate_products` → `existing_brand_products`

**Tous les autres champs sont conservés tels quels**, y compris ceux qui semblent spécifiques à la cosmétique (`routine_size_preference`, `priorities_ordered`, `trust_triggers_ordered`, `content_format_preference`) parce qu'ils correspondent à des concepts génériques (taille de produit recommandé, priorités de choix, déclencheurs de confiance, format de contenu préféré) qui ont du sens pour n'importe quel diagnostic e-commerce. Le contenu des valeurs (les enums autorisés) sera redéfini par client dans le diagnostic, pas dans le dashboard.

**Triggers** :
- `generate_session_code()` (BEFORE INSERT) : génère un code court unique de 7 caractères. Conservé tel quel.
- `validate_diagnostic_session()` (BEFORE INSERT/UPDATE) : valide les enums (status, source, device, relationship, exit_type). **Les valeurs validées sont déplacées vers `tenant_config.allowed_enums` JSONB** pour devenir paramétrables par client.

**RLS** : `ALL public` (sécurité par token côté AccessGate). À durcir avec un vrai multi-tenant en phase 2.

### 3.3 Table `diagnostic_items` (renommée depuis `diagnostic_children`)

C'est la table **la plus modifiée** par la transformation. Dans Ouate elle s'appelle `diagnostic_children` parce que le diagnostic concerne des enfants. Pour le template, elle devient générique : un "item" est l'objet du diagnostic, qui peut être un enfant (Ouate), un type de peau (cosmétique adulte), un projet (SaaS B2B), un animal (animalerie), etc.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | — |
| `session_id` | UUID FK | → `diagnostic_sessions(id)` ON DELETE CASCADE |
| `item_index` | INTEGER | 0-based, ordre de l'item dans la session |
| `item_label` | VARCHAR | Libellé court (ex: prénom enfant, nom de projet, nom d'animal) |
| `item_metadata` | JSONB | **Données spécifiques au vertical client**, structure libre |
| `dynamic_question_1` à `dynamic_question_3` | TEXT | Questions IA générées (3 max) |
| `dynamic_answer_1` à `dynamic_answer_3` | TEXT | Réponses correspondantes |
| `dynamic_insight_targets` | TEXT | Codes anglais normalisés des insights ciblés |
| `created_at` | TIMESTAMPTZ | — |

**Le grand changement** : tous les champs spécifiques à Ouate (`first_name`, `birth_date`, `age`, `age_range`, `skin_concern`, `has_routine`, `routine_satisfaction`, `routine_issue`, `has_ouate_products`, `ouate_products`, `existing_routine_description`, `skin_reactivity`, `reactivity_details`, `exclude_fragrance`) ne sont **plus des colonnes**. Ils deviennent des clés du JSONB `item_metadata`. Ça permet à chaque client d'avoir sa propre structure sans modifier le schéma SQL.

**Exemple `item_metadata`** pour un nouveau client de mode femme :
```json
{
  "occasions_preferred": ["bureau", "weekend"],
  "size_top": "M",
  "size_bottom": "38",
  "color_palette": ["neutre", "terracotta"],
  "budget_range": "100-300",
  "style_concerns": ["sustainability", "longevity"]
}
```

**Trigger `validate_diagnostic_item()`** : remplace `validate_diagnostic_child()`. Ne valide plus d'enums hardcodés. La validation des champs métier devient la responsabilité du diagnostic du client (à l'amont) ou d'une éventuelle Edge Function de validation par schéma JSON (à introduire plus tard).

**Index** :
- `idx_items_session ON diagnostic_items(session_id)`
- `UNIQUE(session_id, item_index)`

### 3.4 Table `personas`

Conservée intégralement, structure inchangée :

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | — |
| `code` | VARCHAR | Identifiant (P0, P1, P2, …) |
| `name` | VARCHAR | Prénom du persona |
| `full_label` | VARCHAR | Label complet |
| `description` | TEXT | Description narrative |
| `criteria` | JSONB | Critères de scoring (voir §7) |
| `is_active` | BOOLEAN | true par défaut |
| `is_pool` | BOOLEAN | true pour P0 (sessions non-attribuées) |
| `is_existing_client_persona` | BOOLEAN | true si segmente les clients existants |
| `is_auto_created` | BOOLEAN | true si créé par `detect-persona-clusters` |
| `auto_created_at` | TIMESTAMPTZ | Date de création auto |
| `session_count` | INTEGER | Nombre de sessions associées |
| `avg_matching_score` | NUMERIC | Score moyen de matching |
| `min_sessions` | INTEGER | Seuil minimum de sessions pour rester actif |
| `detection_source` | VARCHAR | Source de détection |
| `source_personas` | TEXT[] | Personas sources (pour fusions) |
| `created_at`/`updated_at` | TIMESTAMPTZ | — |

**État au démarrage du template** : la table contient **uniquement P0** (le pool des sessions non-attribuées), créé via une migration de seed. Aucun P1-P9 prédéfini. Les personas seront créés automatiquement par `detect-persona-clusters` au fil des semaines, à partir des sessions accumulées par le client.

**Pourquoi P0 dès le départ** : `diagnostic-webhook` doit pouvoir affecter une session à P0 dès la première complétion, avant qu'aucun cluster n'ait été détecté. Sans P0 préexistant, le webhook crasherait à la première session.

### 3.5 Table `persona_detection_log`

Conservée telle quelle. Audit trail des détections automatiques.

### 3.6 Table `marketing_recommendations`

Conservée mais **nettoyée des champs Legacy V1/V2**. Voici la version V3 only :

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | — |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |
| `category` | VARCHAR | `ads`, `emails`, `offers` |
| `title` | TEXT | Titre court de la reco |
| `content_json` | JSONB | Contenu V3 unifié (5 sections : header, brief, creative, targeting, sources) |
| `persona_code` | VARCHAR | Persona ciblé |
| `format` | VARCHAR | Format détaillé (video_ugc, carousel, newsletter, flow, bundle, etc.) |
| `action_status` | VARCHAR | `todo`, `in_progress`, `done` |
| `completed_at` | TIMESTAMPTZ | Date de marquage "done" |
| `feedback_score` | VARCHAR | `good`, `average`, `poor` (calculé après feedback) |
| `feedback_data` | JSONB | KPIs réels saisis par la marque |
| `feedback_period_days` | INTEGER | Période de test choisie |
| `model_used` | VARCHAR | Modèle Claude qui a généré (logging dynamique) |
| `tokens_used` | INTEGER | Tokens consommés |
| `generation_duration_ms` | INTEGER | Durée de la génération |

**Champs supprimés (Legacy V1 et V2)** :
- `week_start`, `persona_focus`, `checklist`, `ads_recommendations`, `email_recommendations`, `offers_recommendations`, `sources_consulted` (V1)
- `ads_v2`, `emails_v2`, `offers_v2`, `campaigns_overview`, `generation_config`, `pre_calculated_context` (V2)

Ces champs ne sont plus écrits depuis la migration vers V3 et représentent du code mort qui complique la maintenance. Le template arrive sans eux.

### 3.7 Table `recommendation_usage`

Conservée. Compteurs mensuels d'usage des recos marketing.

### 3.8 Table `funnel_recommendations`

Conservée. 3 recos d'optimisation funnel par semaine, calculées par cron hebdomadaire `generate-funnel-recommendations`.

### 3.9 Table `market_intelligence`

Conservée. Stockage des résultats du pipeline Perplexity + Gemini mensuel + refresh hebdo.

**Champ `client_context`** : était en JSONB hardcodé `OUATE_CLIENT_CONTEXT` dans l'Edge Function. Devient une lecture depuis `tenant_config.client_context_json` au moment de l'exécution.

### 3.10 Table `marketing_sources`

Conservée. **Pré-remplie au démarrage du template** avec les 213 sources marketing génériques (82 Meta Ads / 66 Email / 67 Offres / 11 transversales). Ces sources sont **génériques par nature** (Klaviyo officiel, Meta Blueprint, J7 Media, etc.) et utilisables pour tout secteur e-commerce. Chaque client peut ajouter ses sources spécifiques au fil du temps.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | — |
| `source_name` | VARCHAR | Nom de la source |
| `category` | VARCHAR | `ads`, `email`, `offers`, `transverse` |
| `tier` | INTEGER | 1 = priorité maximale, 3 = consultation occasionnelle |
| `url` | TEXT | URL principale |
| `description` | TEXT | Note explicative |
| `is_active` | BOOLEAN | — |
| `language` | VARCHAR | `fr`, `en` |
| `created_at` | TIMESTAMPTZ | — |

**Champ `project_id` retiré** : dans Ouate il était hardcodé à `'ouate'`. Dans le template, les sources sont globales (pas de tenant), partagées entre tous les clients. Si un client veut des sources privées spécifiques à son secteur, on pourra introduire une colonne `tenant_id NULLABLE` plus tard.

### 3.11 Table `aski_chats`

Conservée intégralement. Conversations Aski (titre, archivage).

### 3.12 Table `aski_messages`

Conservée intégralement. Messages user/assistant, tokens consommés, temps de réponse.

### 3.13 Table `aski_memory`

Conservée intégralement. Mémoire de marque extraite quotidiennement par `aski-daily-learn`.

### 3.14 Table `api_usage_logs`

Conservée intégralement. Logging dynamique de chaque appel IA (provider, model, tokens input/output, edge_function, metadata). C'est cette table qui alimente le tracking des coûts côté portail admin via `get-usage-stats`.

### 3.15 Table `client_plan`

Conservée intégralement. Limites de l'organisation (aski_limit, sessions_limit, recos_monthly_limit, billing_cycle, plan). Synchronisée depuis le portail admin via `get-org-limits`.

**Champ `project_id`** : conservé mais devient lié à `tenant_config.project_id`. Une seule ligne par tenant.

### 3.16 Table `usage_tracking`

Conservée. Tracking d'usage par période. À évaluer si cette table est encore utile vs simple comptage `api_usage_logs` (point en suspens dans la mémoire utilisateur, à trancher dans une phase d'optimisation future).

### 3.17 Table `client_orders` (renommée depuis `shopify_orders`)

Renommée pour devenir source-agnostic. La structure reste identique mais le nom n'évoque plus exclusivement Shopify, parce qu'un client pourrait utiliser WooCommerce, BigCommerce, ou un POS qui pousse les commandes via API custom.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | — |
| `external_order_id` | VARCHAR UNIQUE | ID natif chez le provider e-commerce |
| `order_number` | VARCHAR | Numéro lisible |
| `customer_email` | VARCHAR | — |
| `total_price` | NUMERIC | — |
| `currency` | VARCHAR(3) | — |
| `is_from_diagnostic` | BOOLEAN | true si attribué au diagnostic |
| `diagnostic_session_id` | UUID FK | → `diagnostic_sessions(id)` |
| `validated_products` | TEXT | Noms produits commandés, séparés par ` | ` (pipe + espaces) |
| `source_provider` | VARCHAR | `shopify`, `woocommerce`, `bigcommerce`, `manual`, etc. |
| `raw_payload` | JSONB | Payload original pour debug |
| `created_at` | TIMESTAMPTZ | — |

**Note importante sur le séparateur** : on utilise ` | ` (pipe entouré d'espaces) et **plus jamais la virgule** comme séparateur des produits dans `validated_products`. C'est le fix du bug "Top produit acheté" qui s'affichait `"2"` à cause du produit Ouate `"Mon écran 1,2,3 soleil"` dont le nom contenait des virgules.

### 3.18 Table `client_products` (renommée depuis `ouate_products`)

Renommée pour devenir générique. Catalogue produits du client, source-agnostic.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | — |
| `external_product_id` | VARCHAR UNIQUE | ID natif chez le provider (shopify_product_id, woo_id, etc.) |
| `title` | VARCHAR NOT NULL | — |
| `handle` | VARCHAR | Slug |
| `description` | TEXT | — |
| `product_type` | VARCHAR | Type/catégorie |
| `vendor` | VARCHAR | Marque |
| `tags` | TEXT[] | — |
| `price_min` | NUMERIC | Prix minimum (avec variants) |
| `price_max` | NUMERIC | Prix maximum |
| `currency` | VARCHAR(3) | — |
| `variants` | JSONB | Variantes (taille, couleur, etc.) |
| `images` | JSONB | URLs des images |
| `status` | VARCHAR | `active`, `archived`, `draft` |
| `published_at` | TIMESTAMPTZ | — |
| `external_url` | TEXT | URL boutique |
| `source_provider` | VARCHAR | `shopify`, `woocommerce`, etc. |
| `synced_at` | TIMESTAMPTZ | Dernière synchronisation |
| `created_at` | TIMESTAMPTZ | — |

### 3.19 Table `recommendation_staging` — SUPPRIMÉE

Cette table existait dans le code Ouate mais n'est plus utilisée depuis la refonte Marketing IA V3 on-demand. Le template arrive sans cette table.

### 3.20 Récapitulatif des tables

| Table | Statut | Notes |
|-------|--------|-------|
| `tenant_config` | NOUVELLE | Configuration de marque par tenant |
| `diagnostic_sessions` | Conservée | 1 champ renommé |
| `diagnostic_items` | Renommée + abstraite | Ex `diagnostic_children`, métadonnées en JSONB |
| `personas` | Conservée | Vide au départ sauf P0 |
| `persona_detection_log` | Conservée | — |
| `diagnostic_responses` | Conservée (legacy) | Optionnelle, conservée pour rétrocompat |
| `marketing_recommendations` | Conservée + nettoyée | Champs V1/V2 supprimés |
| `recommendation_usage` | Conservée | — |
| `funnel_recommendations` | Conservée | — |
| `market_intelligence` | Conservée | — |
| `marketing_sources` | Conservée | Pré-remplie 213 sources, sans `project_id` |
| `aski_chats` | Conservée | — |
| `aski_messages` | Conservée | — |
| `aski_memory` | Conservée | — |
| `api_usage_logs` | Conservée | — |
| `client_plan` | Conservée | — |
| `usage_tracking` | Conservée | À évaluer |
| `client_orders` | Renommée | Ex `shopify_orders`, source-agnostic |
| `client_products` | Renommée | Ex `ouate_products`, source-agnostic |
| `recommendation_staging` | SUPPRIMÉE | Plus utilisée |

**Total : 18 tables** dans le template (vs 19 dans Ouate, parce qu'on a ajouté `tenant_config` et supprimé `recommendation_staging`).


---

## 4. Edge Functions

Le template contient **22 Edge Functions** dans `supabase/functions/`. Toutes sont conservées par rapport à Ouate (aucune suppression nette), mais plusieurs sont **abstraites** pour retirer les références hardcodées à Ouate.

Toutes les fonctions ont `verify_jwt = false` (sécurité par secrets partagés et CORS strict).

### 4.1 `_shared/` — Helpers partagés (NOUVEAU)

Le template introduit un dossier `supabase/functions/_shared/` qui n'existe pas dans Ouate. Il contient les helpers utilisés par plusieurs fonctions, pour éviter la duplication :

- `_shared/logApiUsage.ts` — helper unifié de logging des appels IA. Aujourd'hui dupliqué inline dans `aski-chat/index.ts` et `aski-daily-learn/index.ts`. Centralisé dans le template.
- `_shared/loadTenantConfig.ts` — charge la ligne unique de `tenant_config` au démarrage de chaque fonction. Cache en mémoire process pendant 5 minutes.
- `_shared/cors.ts` — headers CORS standards (existait déjà inline dans plusieurs fonctions).
- `_shared/notifyPortalThreshold.ts` — appel fire-and-forget vers le portail pour les seuils 80 % / 100 %.
- `_shared/reportEdgeFunctionError.ts` — helper de remontée d'erreurs vers le portail (existait déjà inline).

**Pattern de chargement de la config** : chaque Edge Function commence par :
```typescript
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";
const config = await loadTenantConfig(supabase);
const PROJECT_ID = config.project_id;
const BRAND_NAME = config.brand_name;
const BRAND_TONE = config.brand_tone;
// ... etc
```

### 4.2 Pipeline diagnostic

#### `diagnostic-webhook` — Point d'entrée du diagnostic

**Conservée**, **abstraite**.

Reçoit le webhook depuis l'app diagnostic du client. Auth par `x-webhook-secret`.

Logique :
1. Charge `tenant_config` pour récupérer `project_id`, `brand_name`, etc.
2. Upsert dans `diagnostic_sessions` avec logique COALESCE (ne pas écraser par null)
3. Vérifie le quota mensuel via `client_plan.sessions_limit`. Flag `over_quota = true` si dépassé. **Ne bloque jamais le visiteur**.
4. Notifications fire-and-forget portail à 80 % et 100 % (helper `notifyPortalThreshold`)
5. Delete-then-insert des items dans `diagnostic_items` (renommé depuis `diagnostic_children`)
6. Si `status = "termine"` : calcule `persona_code` via `computePersonaWithScore()` + `adapted_tone` via `computeAdaptedTone()` + déclenche la sync externe (`sync-klaviyo-persona` si activé pour ce tenant)

**Champs hardcodés Ouate retirés** : aucune référence à `skin_concern`, `routine`, etc. La fonction itère sur `item_metadata` (JSONB) au lieu d'avoir des références spécifiques.

**3 ajustements spécifiques à intégrer dans le template** :

1. **Standardisation du nom du secret** : le secret de vérification utilisé par la fonction doit s'appeler `DASHBOARD_WEBHOOK_SECRET` (et non `WEBHOOK_SECRET` ou autre alias historique). C'est le nom qui fera référence dans la documentation d'onboarding, le `WEBHOOK_CONTRACT.md`, et qui devra être configuré à l'identique côté projet diagnostic client. Toute référence à un autre nom dans le code doit être uniformisée.

2. **Itération agnostique sur `item_metadata` JSONB** : aujourd'hui le code Ouate itère sur des champs hardcodés spécifiques au diagnostic cosmétique enfant (`skin_concern`, `has_routine`, `routine_satisfaction`, `has_ouate_products`, etc.). Dans le template, ces champs spécifiques ne sont plus des colonnes de `diagnostic_items` — ils sont des clés libres du JSONB `item_metadata`. La fonction doit itérer sur les clés présentes dans le JSONB reçu et les stocker telles quelles, sans validation sur la liste des clés autorisées. Ça rend la fonction compatible avec n'importe quel diagnostic client sans modification.

3. **Vérification explicite de la présence du secret au démarrage** : aujourd'hui la fonction compare silencieusement le header reçu avec la variable d'environnement, et rejette en 401 si ça ne matche pas. Dans le template, ajouter un check explicite au démarrage de la fonction :
```typescript
const DASHBOARD_WEBHOOK_SECRET = Deno.env.get("DASHBOARD_WEBHOOK_SECRET");
if (!DASHBOARD_WEBHOOK_SECRET) {
  console.error("[diagnostic-webhook] DASHBOARD_WEBHOOK_SECRET is not configured. Did you set it in Supabase Edge Functions Secrets during onboarding?");
  return new Response(
    JSON.stringify({
      error: "server_misconfigured",
      message: "DASHBOARD_WEBHOOK_SECRET secret is missing. See WEBHOOK_CONTRACT.md at the root of the repo for onboarding instructions."
    }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```
Ça transforme un bug silencieux (401 sans explication) en erreur explicite qui guide le prochain qui debuggera un webhook qui ne marche pas.

**Documentation de référence** : le format exact du payload JSON attendu par `diagnostic-webhook` est documenté dans le fichier `WEBHOOK_CONTRACT.md` à la racine du repo template. Ce fichier fait office d'**interface contractuelle** entre le projet dashboard (qui reçoit les webhooks) et le projet diagnostic (qui les envoie). Tout changement du format doit être reflété dans les deux projets de manière coordonnée. Le commentaire en tête de `diagnostic-webhook/index.ts` doit pointer vers ce fichier.

#### `diagnostic-performance` — Agrégation pour le dashboard

**Conservée**, **abstraite**.

Calcule toutes les métriques pour le dashboard :
- Total sessions, taux de complétion, opt-ins
- Distribution des personas
- Funnel macro 7 étapes
- Funnel détaillé 10 étapes (basé sur `question_path`)
- Revenue timeseries (lit `client_orders` au lieu de `shopify_orders`)
- Détail des sessions si `includeDetails=true`

**Cutoff hardcodé `2026-02-08`** : retiré du template, devient `tenant_config.metrics_start_date` (NULLABLE). Si null, prend toutes les sessions.

**Group by Europe/Paris** : devient `group by ${tenant_config.timezone}`.

### 4.3 Pipeline personas

#### `persona-stats` — Statistiques détaillées par persona

**Conservée**, **abstraite**.

Stats détaillées pour l'onglet Personas. Charge sessions terminées + commandes + personas, agrège par persona, génère 3 insights automatiques par comparaison vs moyenne globale.

**Hardcoding retiré** : la fonction `assignPersonaCode()` qui attribuait à P1-P9 en dur dans Ouate devient un fallback générique qui attribue toujours à P0 si aucun persona ne match (P1+ sont créés dynamiquement par `detect-persona-clusters`).

#### `persona-priorities` — 3 personas prioritaires

**Conservée intégralement**. Aucun hardcoding Ouate à retirer. La logique de calcul (Best ROI Acquisition, Best Growth, Best LTV) est entièrement générique.

#### `detect-persona-clusters` — Détection automatique

**Conservée**, **abstraite**.

Toute la logique (6 phases : A chargement, B1 nouveaux clusters depuis P0, B2 split des personas trop grands, B3 recombinaison sessions faibles, C génération identité, D construction critères, E création DB, F réattribution, G compteurs) est conservée intégralement.

**Le seul changement** : la fonction `buildCriteriaFromCluster()` doit devenir **agnostique du schéma** des items. Au lieu de chercher des champs nommés (`skin_concern`, `age_range`, `reactivity`, etc.), elle itère sur les clés de `item_metadata` et identifie automatiquement celles qui ont une distribution non-uniforme (donc qui distinguent ce cluster). Les champs identifiés deviennent les critères du nouveau persona.

C'est le refactor le plus subtil du template. Il sera traité dans un prompt Lovable dédié à part avec validation Lovable.

**Paramètres exposés via `tenant_config.persona_detection_params` JSONB** :
```json
{
  "min_cluster_size": 30,
  "min_split_size": 20,
  "max_persona_size": 80,
  "weak_score_threshold": 75,
  "min_sessions_to_keep_after_30_days": 15
}
```

Valeurs par défaut identiques à Ouate. Permet d'ajuster par client si nécessaire.

### 4.4 Pipeline Aski

#### `aski-chat` — Assistant IA conversationnel

**Conservée**, **abstraite**.

956 lignes. Toute la logique de chargement parallèle du contexte, fallback Sonnet → Gemini, mémoire de marque, vérification quota, est conservée intégralement.

**Modèles** :
- Primaire : `claude-sonnet-4-6` (Anthropic directe), timeout 90s
- Fallback : `google/gemini-2.5-pro` (Lovable AI Gateway), timeout 90s
- Titre chat : `claude-sonnet-4-6`, timeout 10s, max_tokens 20

**Hardcoding retiré** :
- Les variables `brandName = "Ouate Paris"` et `brandTone = "..."` deviennent `const config = await loadTenantConfig(supabase)` au début, puis `${config.brand_name}` et `${config.brand_tone}` dans le system prompt.
- La mention `cosmétique enfants (4-11 ans)` dans le titre de chat devient `${config.industry}` + `${config.target_audience}`.
- Les exemples ouvertement Ouate dans le prompt (mention "Ouate" dans le contextualise AOV) deviennent neutres ("Contextualise par rapport à la gamme de prix de la marque, pas en absolu").

**Quotas** : conservés. `aski_limit` lu depuis `client_plan`, fallback 100 (Starter). Notifications portail à 80 %/100 %.

**Logging** : utilise désormais `_shared/logApiUsage.ts` au lieu de la fonction inline.

#### `aski-daily-learn` — Apprentissage quotidien

**Conservée**, **abstraite**. Cron quotidien qui extrait les directives de marque des conversations Aski des dernières 24h. Modèle : `google/gemini-3-flash-preview`. Max 15 insights actifs. Confiance incrémentée à chaque confirmation, expiration 60 jours.

**Hardcoding retiré** : la mention "marque de cosmétique enfants" dans le prompt d'extraction devient `${config.industry}`.

### 4.5 Pipeline Marketing IA

#### `monthly-market-intelligence` — Veille mensuelle

**Conservée**, **abstraite**. Cron mensuel le 1er du mois à 03h00 UTC. Pipeline 2 étapes :
1. **Step 1 — Perplexity** ×3 (ads/email/offers, modèle `sonar-pro`, parallèles, ~17s total)
2. **Step 2 — Gemini** ×3 (ads/email/offers, modèle `google/gemini-3.1-pro-preview`, séquentiels, ~3 minutes total)

**Hardcoding retiré** :
- L'objet `OUATE_CLIENT_CONTEXT` (25 lignes hardcodées) est entièrement remplacé par une lecture de `tenant_config.client_context_json` au démarrage. Tout le reste de la fonction utilise cette variable.
- `PROJECT_ID = "ouate"` devient `PROJECT_ID = config.project_id`
- Les prompts Perplexity et Gemini qui mentionnaient "cosmétique enfant" deviennent paramétrés par `${config.industry}` et `${config.target_audience}`

#### `weekly-intelligence-refresh` — Refresh hebdomadaire

**Conservée**, **abstraite**. Cron lundi 07h00 UTC. Refresh léger : snapshot personas + 1 appel Perplexity pour 5 tendances de la semaine.

**Hardcoding retiré** : `PROJECT_ID = "ouate"` + mentions "cosmétique enfant" dans le prompt → paramétrés via `tenant_config`.

#### `generate-marketing-recommendations` — API layer

**Conservée**, **abstraite**.

GET pour lire les recos actives + quota + dernière `market_intelligence`. POST pour `update_status` et `submit_feedback`.

**Hardcoding retiré** : `PROJECT_ID = "ouate"` → `tenant_config`.

#### `generate-recommendation-content` — Génération on-demand

**Conservée**, **abstraite**, **modèle aligné**.

Génération d'une reco complète via Claude Sonnet, on-demand. ~25-35s. Décompte 1 crédit. Validation `validateGeneratedCopy()` + retry max 2.

**Modèle** : passe de `claude-sonnet-4-20250514` (Sonnet 4) à `claude-sonnet-4-6` (Sonnet 4.6) pour s'aligner sur Aski.

**Hardcoding retiré** :
- Les mentions "Ouate" et "tranche d'âge 4-12" dans le system prompt (~500 lignes) deviennent `${config.brand_name}` et `${config.target_audience}`.
- Les règles de marque (ton, vocabulaire, anti-hallucination produits, max 25 % remise, etc.) sont **conservées** car elles sont génériques pour tout e-commerce premium.
- Le bloc `sources marketing` qui était parfois hardcodé inline est lu depuis `marketing_sources` (table BDD).

#### `generate-funnel-recommendations` — Recos funnel hebdomadaires

**Conservée**, **abstraite**. Cron hebdomadaire. Génère 3 recos d'optimisation tunnel basées sur les 7 derniers jours via `google/gemini-2.5-flash`.

**Hardcoding retiré** : "marque de cosmétiques pour enfants (OUATE Paris)" dans le prompt → `${config.brand_name}` + `${config.industry}`.

### 4.6 Intégrations externes (toutes optionnelles)

#### Shopify (4 fonctions)

**Conservées**, **rendues optionnelles**. Le template les inclut mais elles ne s'activent que si les secrets `SHOPIFY_*` sont présents. Si absents, elles retournent un état neutre `{ enabled: false }` sans crasher.

- `shopify-order-webhook` (HMAC SHA-256, attribution via `_diag_session` line item property + fallback email)
- `shopify-checkout-webhook` (HMAC SHA-256)
- `sync-shopify-products` (cron quotidien 05h00 UTC, lit Storefront API GraphQL, upsert dans `client_products`)
- `import-shopify-csv` (import historique depuis CSV)

**Hardcoding retiré** : le store domain `www-ouate-paris-com.myshopify.com` était hardcodé dans `sync-shopify-products`. Devient `tenant_config.shopify_store_domain`.

**Format `validated_products`** : passe de `.join(", ")` à `.join(" | ")` pour éviter le bug de parsing avec les virgules dans les noms de produits.

#### Klaviyo (2 fonctions)

**Conservées**, **rendues optionnelles** :
- `sync-klaviyo-persona` (sync profile après complétion session)
- `backfill-klaviyo` (sync historique massive)

**Hardcoding retiré** : ID liste Klaviyo `TExMiq` était hardcodé. Devient `tenant_config.klaviyo_list_id`.

#### Google Analytics 4 (1 fonction)

**Conservée**, **rendue optionnelle** :
- `ga4-analytics` (proxy GA4 Data API via JWT signé RS256)

**Hardcoding retiré** : la landing page `/pages/diagnostic-de-peau` était hardcodée. Devient `tenant_config.ga4_landing_path`.

### 4.7 Intégration portail admin

#### `get-org-limits` — Sync limites depuis portail

**Conservée**, **abstraite**. Proxy vers le portail Ask-It pour récupérer les limites de l'org. Header `x-api-key: MONITORING_API_KEY`. Timeout 8s. Synchronise `client_plan` local. Fallback : lecture locale, puis fallback hardcoded scale.

**Hardcoding retiré** : `projectId = "ouate"` devient `tenant_config.project_id`.

#### `get-usage-stats` — Expose stats au portail

**Conservée intégralement**. Auth `x-api-key`, CORS restreint à `app.ask-it.ai` et `srzbcuhwrpkfhubbbeuw.supabase.co`. Mode `"all"` ou mois spécifique. Retourne questions Aski, tokens, sessions diagnostic, recos marketing, usage API par modèle, flags de blocage, pending_feedback. Aucune référence Ouate dans cette fonction.

### 4.8 Récapitulatif Edge Functions

| Fonction | Statut | Modifications |
|----------|--------|--------------|
| `_shared/` (NOUVEAU) | Créé | Helpers centralisés |
| `diagnostic-webhook` | Conservée + abstraite | Itère sur `item_metadata` JSONB |
| `diagnostic-performance` | Conservée + abstraite | Lit `client_orders`, timezone via config |
| `persona-stats` | Conservée + abstraite | `assignPersonaCode` générique |
| `persona-priorities` | Conservée intégralement | Aucun hardcoding |
| `detect-persona-clusters` | Conservée + abstraite | `buildCriteriaFromCluster` agnostique |
| `aski-chat` | Conservée + abstraite | brandName/Tone via config, `_shared/logApiUsage` |
| `aski-daily-learn` | Conservée + abstraite | Industry via config, `_shared/logApiUsage` |
| `monthly-market-intelligence` | Conservée + abstraite | `OUATE_CLIENT_CONTEXT` → `tenant_config.client_context_json` |
| `weekly-intelligence-refresh` | Conservée + abstraite | Industry via config |
| `generate-marketing-recommendations` | Conservée + abstraite | `PROJECT_ID` via config |
| `generate-recommendation-content` | Conservée + abstraite + Sonnet 4.6 | brandName via config, sources via BDD |
| `generate-funnel-recommendations` | Conservée + abstraite | brandName + industry via config |
| `shopify-order-webhook` | Conservée + optionnelle | Activée si secrets `SHOPIFY_*` présents |
| `shopify-checkout-webhook` | Conservée + optionnelle | Idem |
| `sync-shopify-products` | Conservée + optionnelle + abstraite | Store domain via config |
| `import-shopify-csv` | Conservée + optionnelle | — |
| `sync-klaviyo-persona` | Conservée + optionnelle + abstraite | List ID via config |
| `backfill-klaviyo` | Conservée + optionnelle | — |
| `ga4-analytics` | Conservée + optionnelle + abstraite | Landing path via config |
| `get-org-limits` | Conservée + abstraite | `projectId` via config |
| `get-usage-stats` | Conservée intégralement | Aucun hardcoding |

**Total : 22 fonctions** + 1 dossier `_shared/` (vs 21 fonctions dans Ouate, +1 grâce à `_shared/`).


---

## 5. Frontend — 8 onglets

Le template conserve **les 8 onglets** du dashboard Ouate, dans le même ordre, avec les mêmes composants. Le seul changement notable : l'identifiant interne `value="alerts"` de l'onglet Aski est renommé en `value="aski"` pour éliminer un résidu historique (le label affiché était déjà "Aski", seul l'ID était `alerts`).

### 5.1 Page racine — `Dashboard.tsx`

**Conservée**, avec quelques ajustements :

**Header global** :
- Logo Ask-It (fixe, partagé par tous les clients)
- Nom du plan actuel via `useUsageLimits().plan`
- Remplace le titre `"Dashboard Ouate Paris — Plan {plan}"` par `"Dashboard {brand_name} — Plan {plan}"` lu depuis `tenant_config`
- `DateRangePicker` global
- Bouton déconnexion (clear `sessionStorage.askit_access` + redirect `/`)
- Dialog export PDF (sélection de sections + génération via `html2canvas` + `jsPDF`)
- Dialog support
- `QuotaBanner` — bannière d'alerte à 80 %+ pour sessions, Aski, recommandations

**Tabs** : 8 onglets dans cet ordre :

| ID interne | Label affiché | Composant principal |
|------------|---------------|---------------------|
| `overview` | Vue d'ensemble | inline dans `Dashboard.tsx` |
| `personas` | Personas | `PersonasTab.tsx` |
| `analytics` | Diagnostic | `DiagnosticsAnalytics.tsx` |
| `business` | Business | `BusinessMetrics.tsx` |
| `funnel` | Funnel | `FunnelVisualization.tsx` + `DetailedFunnelVisualization.tsx` |
| `marketing` | Marketing IA | `marketing/MarketingRecommendations.tsx` |
| `aski` | Aski | `AskiChat.tsx` |
| `responses` | Réponses | `ResponsesSection.tsx` |

L'identifiant `aski` remplace `alerts` partout (`TabsTrigger` et `TabsContent`).

### 5.2 Onglet « Vue d'ensemble »

**Composants** :
- `MetricCard` ×4 : CA via diagnostic, taux conversion diag, AOV après diagnostic, diagnostics complétés
- `TopPersonasPotential` : top 3 personas prioritaires
- `OverviewDiagnosticStats` : stats diagnostic agrégées
- `UsageOverview` : barres d'usage (sessions / Aski / recos) vs limites du plan
- `DiagnosticPreview` : 5 dernières sessions

**Hooks** : `useBusinessMetrics(dateRange)`, `useDiagnosticStats(dateRange)`, `useUsageLimits()`

**Hardcoding retiré** : `DiagnosticPreview.tsx` contenait `title="Diagnostic OUATE"` et `<span>Propulsé par Ask-It × OUATE</span>` → deviennent `title={\`Diagnostic ${brand_name}\`}` et `Propulsé par Ask-It × {brand_name}`.

### 5.3 Onglet « Personas »

**Composant** : `PersonasTab.tsx`

**Hooks** : `usePersonaStats(dateRange)`, `usePersonaProfiles()`

**Affichage par persona** :
- Volume, pourcentage
- Profil (champs lus dynamiquement depuis `item_metadata`)
- Psychologie (priorités, trust triggers, routine size)
- Comportement (durée, engagement, format, opt-ins)
- Top 5 produits achetés (via `client_orders`)
- Business (conversions, revenue, AOV, écart panier)
- 3 insights automatiques (comparaisons vs moyenne globale)

**Hardcoding retiré** : les descriptions persona Ouate (`"Cliente fidèle de Ouate qui revient régulièrement..."`) hardcodées dans le composant sont supprimées. Les descriptions viennent désormais uniquement de `personas.description` en BDD (rempli par `detect-persona-clusters` quand un nouveau persona est créé).

**État au démarrage** : aucune donnée à afficher tant qu'aucun persona n'a été détecté. Le composant affiche un état vide engageant : *"Vos personas seront détectés automatiquement à partir de 30 sessions complétées. Patientez ou consultez l'onglet Diagnostic en attendant."*

### 5.4 Onglet « Diagnostic » (Analytics)

**Composant** : `DiagnosticsAnalytics.tsx`

**Hook** : `useDiagnosticStats(dateRange)`

**Affichage** : totaux (sessions, complétés, taux de complétion), opt-ins (email, SMS, double), distribution des personas, liste des dernières sessions.

**Aucune référence Ouate dans ce composant**. Conservé tel quel.

### 5.5 Onglet « Business »

**Composant** : `BusinessMetrics.tsx`

**Hooks** : `useBusinessMetrics(dateRange)`, `useRevenueTimeseries(dateRange, granularity)`, `useInsightsMetrics(dateRange)`

**Affichage** :
- KPI cards : CA, AOV, sessions GA4, taux conversion
- Graphique « Impact du Diagnostic sur le CA » (LineChart Recharts, lignes Avec/Sans diagnostic, sélecteur jour/semaine/mois)
- Section Insights : routine complète %, écart panier, top produit acheté, % nouveaux clients

**Hardcoding retiré** :
- `<p>découvrent Ouate grâce au diagnostic</p>` → `<p>découvrent {brand_name} grâce au diagnostic</p>`

**Bug "Impact du Diagnostic sur le CA" — fix conservé** :
La pagination explicite `.range(0, PAGE_SIZE - 1)` avec boucle `while (hasMore)` est intégrée dans `useRevenueTimeseries.ts`. Le bug du tableau qui s'arrêtait à 1000 commandes est résolu d'origine dans le template.

**Bug "Top produit acheté" — fix conservé** :
Le splitter rétrocompatible (` | ` nouveau, `, ` ancien) est intégré dans `useInsightsMetrics.ts`. Combiné avec le webhook `shopify-order-webhook` qui utilise désormais `.join(" | ")`, le bug est complètement résolu pour tout nouveau client.

### 5.6 Onglet « Funnel »

**Composants** :
- `FunnelVisualization.tsx` — funnel macro 7 étapes : sessions → complétés → optin email → recommandation → ajout panier → checkout → achat
- `DetailedFunnelVisualization.tsx` — funnel détaillé 10 étapes basé sur `question_path`

**Hook** : `useDiagnosticStats(dateRange)`

Le funnel macro est entièrement générique. Le funnel détaillé s'adapte automatiquement à n'importe quel diagnostic dès que `question_path` est alimenté par le diagnostic du client.

### 5.7 Onglet « Marketing IA »

**Composant racine** : `marketing/MarketingRecommendations.tsx`

**Sous-onglets** :
| Sous-onglet | Composant | Rôle |
|-------------|-----------|------|
| Vue d'ensemble | `MarketingOverviewTab.tsx` | Tâches actives + historique + quota |
| Publicité | `MarketingAdsTab.tsx` | Recos Ads V3 + bouton génération on-demand |
| Emailing | `MarketingEmailsTab.tsx` | Recos emails V3 |
| Offres | `MarketingOffersTab.tsx` | Recos offres V3 |

**Sous-composants partagés** :
- `RecommendationCard.tsx` — carte unifiée V3 avec 5 sections dépliables
- `FeedbackForm.tsx` — modal d'entrée des résultats
- `OverviewTaskCard.tsx`, `OverviewHistoryCard.tsx`
- `shared/CopyButton.tsx`, `shared/FormatBadge.tsx`, `shared/PersonaBadge.tsx`, `shared/PriorityIndicator.tsx`, `shared/RecosQuotaBanner.tsx`

**Composants supprimés (Legacy V1/V2)** :
- `legacy/LegacyRecommendations.tsx` — SUPPRIMÉ
- `CampaignCard.tsx` — SUPPRIMÉ (était utilisé pour V2)
- Composants V2 (`AdsRecommendationCard.tsx`, `OffersRecommendationCard.tsx`, `EmailsRecommendationCard.tsx`) — SUPPRIMÉS s'ils existent encore

**Hook** : `useMarketingRecommendations()`

**Pattern de sanitization frontend conservé** : `sanitizePersonaReferences(text)` remplace tous les codes P0–P9 par les prénoms dans tous les champs texte rendus. Filet de sécurité en cas de leak du backend.

### 5.8 Onglet « Aski »

**Composants** :
- `AskiAvatar/AskiAvatar.tsx` + `AskiAvatar/AskiAvatar.css` — avatar animé
- `AskiChat.tsx` — interface complète

**Données** : appels directs à `supabase.functions.invoke('aski-chat', ...)`, pas de hook dédié.

**Identifiant onglet** : passe de `value="alerts"` à `value="aski"` (renommage propre du résidu historique).

### 5.9 Onglet « Réponses »

**Composant** : `ResponsesSection.tsx`

**Hook** : `useDiagnosticSessions(dateRange)` → appelle `diagnostic-performance` avec `includeDetails: true`

**Affichage** : tableau des sessions récentes (code, date, persona, score, conversion, statut). Le détail par item est lu dynamiquement depuis `item_metadata` (JSONB) et affiché en lignes clé/valeur génériques.

**Hardcoding retiré** : `SessionsTable.tsx` contient des références hardcodées aux champs Ouate (skin_concern, age_range, etc.) qui doivent être remplacées par un rendu générique des clés/valeurs présentes dans `item_metadata`.

### 5.10 AccessGate

**Conservé intégralement**. Pas de modification. URL du portail (`https://srzbcuhwrpkfhubbbeuw.supabase.co`) reste hardcodée car c'est la même pour tous les clients. SessionStorage 8h. Page de blocage avec CTA `https://app.ask-it.ai/login`.

---

## 6. Hooks React

Tous dans `src/hooks/`. Tous sont **conservés intégralement**. Aucun ne contient de référence Ouate.

| Hook | Fichier | Edge Function appelée | Rôle |
|------|---------|----------------------|------|
| `useBusinessMetrics(dateRange)` | `useBusinessMetrics.ts` | `diagnostic-performance` + `ga4-analytics` | Métriques business |
| `useDiagnosticStats(dateRange)` | `useDiagnosticStats.ts` | `diagnostic-performance` | Stats diagnostic + funnels |
| `useDiagnosticSessions(dateRange)` | `useDiagnosticSessions.ts` | `diagnostic-performance` (includeDetails) | Liste complète |
| `useInsightsMetrics(dateRange)` | `useInsightsMetrics.ts` | `client_orders` direct | Insights + top produit |
| `usePersonaStats(dateRange)` | `usePersonaStats.ts` | `persona-stats` | Stats par persona |
| `usePersonaPriorities()` | `usePersonaPriorities.ts` | `persona-priorities` | 3 personas prioritaires |
| `usePersonaProfiles()` | `usePersonaProfiles.ts` | Lecture directe `personas` | Profils avec cache |
| `useRevenueTimeseries(dateRange, granularity)` | `useRevenueTimeseries.ts` | `client_orders` direct | Courbe revenue |
| `useUsageLimits()` | `useUsageLimits.ts` | `get-org-limits` | Limites du plan, cache 5min |
| `useMarketingRecommendations()` | `useMarketingRecommendations.ts` | `generate-marketing-recommendations` + `generate-recommendation-content` | State complet marketing |
| `use-mobile` | `use-mobile.tsx` | — | Détection mobile |
| `use-toast` | `use-toast.ts` | — | Hook toast shadcn |

**Modifications par rapport à Ouate** :
- `useUsageLimits.ts` : la signature `useUsageLimits(projectId = "ouate")` devient `useUsageLimits()` (le `projectId` par défaut est retiré, la fonction lit depuis `tenant_config` côté Edge Function)
- `useInsightsMetrics.ts` et `useRevenueTimeseries.ts` : référencent `client_orders` au lieu de `shopify_orders`
- `useBusinessMetrics.ts` : idem
- Aucun autre changement


---

## 7. Système de personas

Le système de personas est **conservé intégralement** dans sa logique. C'est l'une des features les plus aboutiles du dashboard Ouate et elle est entièrement réutilisable.

### 7.1 Tables impliquées

- **`personas`** : définition des personas (code, name, full_label, description, criteria JSON, is_active, is_pool, is_existing_client_persona, is_auto_created, session_count, avg_matching_score, source_personas, detection_source)
- **`persona_detection_log`** : audit trail (detection_type, details JSON, action_taken, persona_code_created, sessions_affected)
- **`diagnostic_sessions.persona_code`** + **`matching_score`** + **`adapted_tone`** : champs alimentés à la fin de chaque session

### 7.2 Structure du JSON `criteria`

```json
{
  "weights": { "identity": 25, "need": 50, "behavior": 25 },
  "identity": {
    "field_name_1": ["value_a", "value_b"],
    "field_name_2": [...]
  },
  "need": {
    "field_name_3": [...],
    "field_name_4": [...]
  },
  "behavior": {
    "field_name_5": [...]
  }
}
```

**Pondération fixe** : identity 25 % / need 50 % / behavior 25 %. Conservée du dashboard Ouate parce qu'elle reflète une vérité métier (les besoins comptent plus que l'identité ou le comportement pour matcher un persona).

**Champs des dimensions** : dans Ouate, les champs étaient `age_range`, `skin_concern`, `reactivity`, `priorities`, `trust_triggers`. Dans le template, les noms de champs **dépendent du diagnostic du client**. Ils sont déterminés automatiquement par `detect-persona-clusters` à partir des clés de `diagnostic_items.item_metadata` qui ont une distribution discriminante dans le cluster.

### 7.3 Algorithme de détection (conservé)

Toutes les phases du `detect-persona-clusters/index.ts` sont conservées :

- **Phase A** : chargement (sessions terminées + personas actifs + items, avec pagination)
- **Phase G early** : update `session_count` et `avg_matching_score` pour tous les personas
- **Phase B** : détection
  - **B1** : nouveaux clusters depuis sessions P0 (groupement NEED → IDENTITY → validation similarité ≥ 75 %)
  - **B2** : split des personas trop grands (`session_count > max_persona_size`, défaut 80) par champ behavior
  - **B3** : recombinaison de sessions faibles (`matching_score < 75 %`), uniquement si gain de score ≥ 5 %
- **Phase C** : génération d'identité (nom, prénom, label, description) via `generatePersonaIdentity()`
- **Phase D** : construction des critères via `buildCriteriaFromCluster()` avec poids fixes 25/50/25
- **Phase E** : création en DB + log dans `persona_detection_log`
- **Phase F** : réattribution des sessions avec re-scoring complet
- **Phase G final** : mise à jour des compteurs

### 7.4 Refactor critique : `buildCriteriaFromCluster()` agnostique

C'est **le seul refactor non-trivial** du système de personas. Dans Ouate, la fonction itère sur des champs hardcodés (`age_range`, `skin_concern`, `reactivity`, etc.). Dans le template, elle doit itérer sur **toutes les clés présentes dans `item_metadata`** et identifier automatiquement celles qui distinguent ce cluster.

Pseudo-algorithme cible :
```
function buildCriteriaFromCluster(sessions, items) {
  const allKeys = collectAllItemMetadataKeys(items)
  const criteria = { identity: {}, need: {}, behavior: {} }

  for (const key of allKeys) {
    const distribution = computeDistribution(items, key)
    if (isDiscriminating(distribution, threshold = 0.6)) {
      const dimension = inferDimension(key)  // → identity | need | behavior
      criteria[dimension][key] = topValues(distribution, n = 3)
    }
  }

  return { weights: { identity: 25, need: 50, behavior: 25 }, ...criteria }
}
```

La fonction `inferDimension(key)` est elle-même configurable via `tenant_config.persona_dimension_mapping` JSONB :
```json
{
  "identity": ["age_range", "gender", "location", "relationship"],
  "need": ["skin_concern", "occasion", "use_case", "problem_type"],
  "behavior": ["priorities", "trust_triggers", "preferred_format", "decision_speed"]
}
```

Si la clé n'est dans aucune liste, par défaut elle va dans `behavior`.

Ce refactor est complexe et risqué. Il sera traité dans **un prompt Lovable dédié à part** avec validation et tests sur un échantillon de sessions fictives.

### 7.5 Paramètres exposés dans `tenant_config`

```json
{
  "persona_detection_params": {
    "min_cluster_size": 30,
    "min_split_size": 20,
    "max_persona_size": 80,
    "weak_score_threshold": 75,
    "min_sessions_to_keep_after_30_days": 15,
    "similarity_threshold_b1": 0.75,
    "min_score_gain_b3": 0.05
  }
}
```

Valeurs par défaut identiques à celles validées chez Ouate.

### 7.6 État au démarrage du template

- Table `personas` contient **uniquement P0** (le pool des sessions non-attribuées), créé via une migration de seed avec `is_pool = true`
- Aucun P1-P9 prédéfini
- `persona_detection_log` est vide
- L'onglet Personas du dashboard affiche un état vide engageant

Au fur et à mesure que le client accumule des sessions et que le cron `detect-persona-clusters` tourne (lundi 06h00 UTC), des personas sont créés automatiquement et apparaissent dans le dashboard.

### 7.7 Cron de détection

```sql
SELECT cron.schedule(
  'detect-persona-clusters-weekly',
  '0 6 * * 1',  -- Lundi 06h00 UTC
  $$ SELECT net.http_post('{supabase_url}/functions/v1/detect-persona-clusters', ...) $$
);
```

Ce cron est créé dans une migration de seed du template, en lisant `tenant_config.project_id` au moment de la création du payload.

---

## 8. Système de recommandations marketing IA

### 8.1 Architecture V3 on-demand

C'est la version actuelle (et la seule conservée dans le template). Toute la logique V1/V2 et la table `recommendation_staging` sont supprimées.

**Pipeline 3 niveaux** :

1. **`monthly-market-intelligence` (cron 1er du mois 03h00 UTC)**
   - Perplexity `sonar-pro` ×3 parallèles (tendances ads/email/offres) → `perplexity_*`
   - Gemini `google/gemini-3.1-pro-preview` ×3 séquentiels (analyse approfondie par catégorie) → `gemini_*_analysis`
   - Stocké dans `market_intelligence` avec `status = 'complete'`
   - Durée totale ~3 minutes

2. **`weekly-intelligence-refresh` (cron lundi 07h00 UTC)**
   - Rafraîchit `personas_snapshot` avec métriques 30j
   - 1 appel Perplexity pour 5 tendances de la semaine → `weekly_trends_refresh`

3. **`generate-recommendation-content` (on-demand)**
   - Déclenchée au clic sur "Générer une recommandation" dans le dashboard
   - 1 appel Claude Sonnet 4.6 → 1 reco complète
   - ~25-35s
   - 1 crédit décompté
   - Validation `validateGeneratedCopy()` + retry max 2

### 8.2 Modèles IA

| Tâche | Modèle | Provider | Timeout |
|-------|--------|----------|---------|
| Recos marketing | `claude-sonnet-4-6` | Anthropic directe | 90s |
| Perplexity tendances | `sonar-pro` | Perplexity API | 60s |
| Analyse marché | `google/gemini-3.1-pro-preview` | Lovable AI Gateway | 120s |
| Recos funnel | `google/gemini-2.5-flash` | Lovable AI Gateway | 60s |

**Changement par rapport à Ouate** : `generate-recommendation-content` passe de `claude-sonnet-4-20250514` (Sonnet 4) à `claude-sonnet-4-6` (Sonnet 4.6) pour s'aligner sur Aski. Décision validée pour cohérence et qualité.

### 8.3 System prompt — composants génériques

Le system prompt de `generate-recommendation-content` (~500 lignes) est conservé intégralement, à l'exception des références spécifiques à Ouate. Voici les blocs **génériques conservés** :

- **Anti-hallucination produits** : jamais de produit hors catalogue, jamais de formats inventés, noms et prix du catalogue uniquement
- **Anti-hallucination claims** : pas de stats inventées, pas de garanties fictives, pas de claims médicaux sans source
- **Anti-hallucination sources** : jamais de source vide, fallback sur principes marketing
- **Codes personas bannis** : jamais de P0–P9 dans aucun champ sauf `persona_code` technique
- **Pricing/marge** : remise max 25 % du prix total, priorité création de valeur (cadeau, contenu, accès anticipé) plutôt que remise directe
- **Variété formats ads** : video_ugc, video_brand, image, carousel, before_after, story, collection
- **Variété types offres** : bundle (max 25 %), cadeau avec achat, upsell, programme fidélité, offre saisonnière, vente privée, cross-sell, parrainage
- **Emails** : 60–70 % newsletters, 30–40 % flows (avec détail complet des emails du flow)
- **UGC = face caméra obligatoire** (sinon video_brand)
- **Segments comportementaux** : email peut cibler "Engagés 90j non-acheteurs", "Abandons panier 7j", "VIP top 20 %" au lieu d'un persona unique
- **Prénoms email** : variables `{prénom}`, jamais de prénoms fictifs
- **Scripts vidéo** : structure par scènes avec timing
- **Boucle d'apprentissage** : résultats BONS à reproduire, MOYENS à améliorer, MAUVAIS à éviter
- **Variété obligatoire** : consulter les recos de la semaine pour éviter doublons
- **KPI emails réalistes** : ranges paramétrables par secteur via `tenant_config.kpi_benchmarks`
- **Budget test réaliste** : 30–50 €/j en test, 80–150 €/j en scale
- **Plateforme + format** : toujours "Meta Ads · 9:16 Story + Reel" ou similaire

**Blocs paramétrés par tenant** :
- Nom de la marque : `${config.brand_name}`
- Tranche d'âge / cible : `${config.target_audience}` (ex: "Parents d'enfants 4-12 ans" ou "Femmes 25-45 ans")
- Industry/vertical : `${config.industry}`
- Catalogue produits : lu depuis `client_products`
- Devise : `${config.currency}`

### 8.4 Validation serveur `validateGeneratedCopy()`

**Conservée intégralement**. Détecte les chiffres inventés / claims douteux. Si échec → retry prompt corrigé (max 2), sinon rejet HTTP 422 `validation_failed`.

### 8.5 Base de sources marketing

**Pré-remplie au démarrage du template** avec les 213 sources génériques (82 Meta Ads / 66 Email / 67 Offres / 11 transversales). Ces sources sont **génériques par nature** (Klaviyo officiel, Meta Blueprint, J7 Media, Foreplay, Demand Curve, etc.) et utilisables pour tout secteur e-commerce. Tier 1, 2, 3 selon priorité.

Chaque client peut ajouter ses sources spécifiques au fil du temps via une simple insertion en BDD.

### 8.6 Feedback et boucle d'apprentissage

**Conservés intégralement** :

**`FeedbackForm.tsx`** :
- Période de test obligatoire : 7j / 14j / 30j / Personnalisé
- Champs par catégorie (ads, emails, offers) avec auto-calculs
- Notes libres

**Calcul auto du score** (backend) :
- Parse les ranges KPI attendus
- Compare aux résultats réels
- `good`, `average`, `poor`
- Score final = tendance majoritaire des métriques comparées

**Injection dans le prompt** : les 15 dernières recos avec feedback sont injectées dans `generate-recommendation-content` avec des instructions d'apprentissage explicites. Aski charge aussi 20 dernières recos avec feedback + 10 actives.

---

## 9. Configuration Aski

### 9.1 Modèles et fallback

| Position | Provider | Modèle | Timeout |
|----------|----------|--------|---------|
| **Primaire** | Anthropic directe | `claude-sonnet-4-6` | 90s |
| **Fallback** | Lovable AI Gateway | `google/gemini-2.5-pro` | 90s |
| **Titre chat** | Anthropic directe | `claude-sonnet-4-6` | 10s, max_tokens 20 |

**Décision validée** : Sonnet 4.6 primaire (qualité supérieure, respect des règles complexes), fallback Gemini Pro (et non Flash, pour minimiser la perte de qualité en cas de bascule).

### 9.2 Sources alimentées dans le contexte

Chargement parallèle au début de chaque appel :

1. Personas actifs avec métriques (vide au départ pour un nouveau client)
2. Sessions terminées (agrégat)
3. Items (jointure)
4. Catalogue produits (`client_products`, vide au départ si Shopify pas encore branché)
5. 20 dernières recos marketing (avec feedback)
6. 10 recos actives
7. Sources marketing (filtrées par tier/catégorie, 213 disponibles)
8. `market_intelligence` (3 derniers mois, extraction des synthèses Gemini, ~3000 tokens)
9. `weekly_trends_refresh`
10. Mémoire Aski `aski_memory` (top 15 par confiance)
11. Appel Perplexity conditionnel (si la question semble nécessiter une actualité très récente)

### 9.3 System prompt — variables paramétrées

Le system prompt (~600 lignes) est conservé intégralement avec les variables suivantes paramétrées :

- `${brandName}` ← `tenant_config.brand_name`
- `${brandTone}` ← `tenant_config.brand_tone`
- `${industry}` ← `tenant_config.industry`
- `${targetAudience}` ← `tenant_config.target_audience`

Tout le reste (instructions de comportement, format adaptatif, anti-hallucination, codes personas interdits, croisement persona × données achats, interprétation correcte des métriques, sources factuelles, étapes 5B/5C) est conservé intégralement.

### 9.4 Quota

**Conservé** : lecture dynamique de `client_plan.aski_limit` (fallback 100). Comptage via count des messages `role = 'user'` du mois. HTTP 429 si dépassé. Notifications fire-and-forget portail à 80 % et 100 %.

### 9.5 Mémoire Aski (`aski_memory`)

**Conservée intégralement** :

- Pipeline cron quotidien `aski-daily-learn`
- Modèle : `google/gemini-3-flash-preview` via Lovable Gateway
- Max 15 insights actifs
- Confiance incrémentée si insight matching existant
- Expiration 60 jours (reset à chaque confirmation)
- Réinjecté dans le system prompt Aski

**État au démarrage du template** : table vide. La mémoire de marque se construit naturellement au fil des conversations.


---

## 10. Intégrations externes optionnelles

Le template inclut **toute la plomberie** des 4 intégrations externes utilisées par Ouate, mais chacune devient **optionnelle** : activable/désactivable via la présence ou absence des secrets correspondants + le flag `tenant_config.integrations_enabled`.

### 10.1 Pattern d'activation

Chaque Edge Function liée à une intégration vérifie au démarrage :

```typescript
const config = await loadTenantConfig(supabase);
if (!config.integrations_enabled?.shopify) {
  return new Response(
    JSON.stringify({ enabled: false, message: "Shopify integration not enabled for this tenant" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

const SHOPIFY_TOKEN = Deno.env.get("SHOPIFY_STOREFRONT_ACCESS_TOKEN");
if (!SHOPIFY_TOKEN) {
  return new Response(
    JSON.stringify({ enabled: false, message: "SHOPIFY_STOREFRONT_ACCESS_TOKEN secret missing" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ... le reste de la logique
```

C'est un **no-op gracieux** : la fonction ne crashe pas, ne pollue pas les logs avec des erreurs, et retourne un état neutre que les hooks frontend peuvent gérer.

### 10.2 Shopify

| Élément | Valeur générique |
|---------|-----------------|
| Store domain | `${tenant_config.shopify_store_domain}` |
| API Storefront | GraphQL version `2025-07` |
| Token | secret `SHOPIFY_STOREFRONT_ACCESS_TOKEN` |
| Webhook orders/paid | `shopify-order-webhook`, HMAC via `SHOPIFY_WEBHOOK_SECRET` |
| Webhook checkouts/create | `shopify-checkout-webhook`, HMAC via `SHOPIFY_CHECKOUT_WEBHOOK_SECRET` |
| Sync produits | `sync-shopify-products` cron quotidien 05h00 UTC |
| Import CSV | `import-shopify-csv` pour historique |
| Propriété session | `_diag_session` dans les line items pour attribution |
| Secrets requis | `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_CHECKOUT_WEBHOOK_SECRET`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN` |

**Note onboarding** : depuis janvier 2026, les custom apps Shopify sont dépréciées. Les nouveaux clients utilisent des **collaborator access requests** pour autoriser Ask-It à accéder à leur Shopify.

### 10.3 Klaviyo

| Élément | Valeur générique |
|---------|-----------------|
| Endpoint profile | `https://a.klaviyo.com/api/profile-import/` |
| Endpoint subscribe | `https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/` |
| Revision header | `2024-02-15` |
| Liste d'abonnement | `${tenant_config.klaviyo_list_id}` |
| Retry | Max 3, timeout 15s, exponential backoff sur 5xx/429 |
| 409 → succès | Profil existant |
| Secret | `KLAVIYO_API_KEY` |

### 10.4 Google Analytics 4

| Élément | Valeur générique |
|---------|-----------------|
| API | GA4 Data API (`analyticsdata.googleapis.com/v1beta`) |
| Auth | Service account JWT signé RS256 → OAuth2 token |
| Scope | `analytics.readonly` |
| Rapports | Sessions totales + sessions landing `${tenant_config.ga4_landing_path}` |
| Secrets | `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_EMAIL`, `GA4_SERVICE_ACCOUNT_PRIVATE_KEY` |

### 10.5 Meta Pixel (frontend uniquement)

Tracking côté frontend du diagnostic et du dashboard. Aucun secret Supabase requis.

| Event | Déclencheur |
|-------|-------------|
| `PageView` | Auto au chargement |
| `CompleteRegistration` | Step opt-in (diagnostic) |
| `Lead` | Affichage page résultats (diagnostic) |

Pixel ID configuré via `tenant_config.meta_pixel_id`.

### 10.6 Récap d'activation

| Intégration | Configuré comment | Activation par défaut dans le template |
|-------------|------------------|-----------------------------------------|
| Shopify | Secrets `SHOPIFY_*` + `tenant_config.integrations_enabled.shopify = true` | Désactivé |
| Klaviyo | Secret `KLAVIYO_API_KEY` + `tenant_config.integrations_enabled.klaviyo = true` | Désactivé |
| GA4 | Secrets `GA4_*` + `tenant_config.integrations_enabled.ga4 = true` | Désactivé |
| Meta Pixel | `tenant_config.meta_pixel_id` non null | Désactivé |

Le template arrive avec **toutes les intégrations désactivées**. C'est lors de l'onboarding du client qu'on active celles qui correspondent à son stack.

---

## 11. Intégration portail admin

L'intégration avec le portail Ask-It (`https://app.ask-it.ai` / `https://srzbcuhwrpkfhubbbeuw.supabase.co`) est **conservée intégralement** dans le template. C'est elle qui permet à Ask-It de gérer les clients depuis un seul endroit.

### 11.1 AccessGate

**Conservé tel quel** : `src/components/AccessGate.tsx`

Flux :
1. Check `sessionStorage.askit_access` (durée 8h) → granted
2. Sinon → cherche `?access_token=` dans l'URL
3. Si absent → denied → page de blocage avec CTA `https://app.ask-it.ai/login`
4. Si présent → POST `https://srzbcuhwrpkfhubbbeuw.supabase.co/functions/v1/verify-dashboard-token`
5. Si valide → stocke session, nettoie URL → granted

**URL du portail** : hardcodée car identique pour tous les clients. C'est volontaire.

### 11.2 `get-org-limits` — Sync limites

**Conservée + abstraite**. Proxy vers le portail pour récupérer les limites de l'org, synchronise `client_plan` local. Cache 5 minutes. `projectId` lu depuis `tenant_config`.

### 11.3 `get-usage-stats` — Expose stats au portail

**Conservée intégralement**. Auth `x-api-key`, CORS strict, flags de blocage, pending_feedback. Aucune référence Ouate.

### 11.4 `quota-threshold-reached` — Notifications portail

Helper inline `notifyPortalThreshold()` dans Ouate, **centralisé dans `_shared/notifyPortalThreshold.ts`** dans le template. Appelé en fire-and-forget par `diagnostic-webhook`, `aski-chat`, `generate-recommendation-content` quand un seuil 80 % ou 100 % est franchi.

### 11.5 `report-error` — Monitoring d'erreurs

`src/lib/error-reporter.ts` (frontend) **conservé intégralement**. Intercepte `fetch` pour logger les erreurs 4xx/5xx, détecte les boucles, envoie au portail via `report-error`.

Helper inline `reportEdgeFunctionError()` dans les Edge Functions Ouate, **centralisé dans `_shared/reportEdgeFunctionError.ts`** dans le template. Tous les blocs catch des Edge Functions importent ce helper.

### 11.6 Secrets liés au portail

| Secret | Valeur | Source |
|--------|--------|--------|
| `MONITORING_API_KEY` | Clé monitoring du dashboard, format `mk_...` | Générée par le portail à la création de l'org |
| `USAGE_STATS_API_KEY` | `askit-usage-stats-2026` | Identique pour tous les clients |
| `ORGANIZATION_ID` | UUID de l'org dans le portail | Copié depuis le portail à la création |

Ces 3 secrets sont **obligatoires** dans tout déploiement du template.

---

## 12. Crons

Les crons sont créés dans une **migration de seed** du template, qui est exécutée à la création de chaque nouveau projet Supabase. Tous les crons sont conservés du dashboard Ouate, à l'exception de ceux liés aux intégrations optionnelles (Shopify) qui ne s'activent que si l'intégration est configurée.

| Cron | Fréquence | Edge Function | Activation |
|------|-----------|---------------|------------|
| `monthly-market-intelligence` | 1er du mois 03h00 UTC | `monthly-market-intelligence` | Toujours actif |
| `weekly-intelligence-refresh` | Lundi 07h00 UTC | `weekly-intelligence-refresh` | Toujours actif |
| `detect-persona-clusters-weekly` | Lundi 06h00 UTC | `detect-persona-clusters` | Toujours actif |
| `aski-daily-learn` | Quotidien 04h00 UTC | `aski-daily-learn` | Toujours actif |
| `generate-funnel-recommendations-weekly` | Mardi 08h00 UTC | `generate-funnel-recommendations` | Toujours actif |
| `sync-shopify-products-daily` | Quotidien 05h00 UTC | `sync-shopify-products` | Si Shopify activé |

**Pattern de création** : chaque cron est créé dans une migration SQL avec `pg_cron + net.http_post`. Le payload du POST inclut l'URL de l'Edge Function qui est lue depuis une variable d'environnement Supabase au moment de l'exécution de la migration (pas hardcodée dans le SQL).

---

## 13. Sécurité et RLS

### 13.1 Modèle de sécurité actuel

Le template hérite du modèle de sécurité du dashboard Ouate, qui est **pragmatique pour un MVP B2B mono-tenant** :

- **AccessGate frontend** : tout accès au dashboard nécessite un token temporaire (5 min, single-use) généré par le portail Ask-It. Session stockée en sessionStorage 8h.
- **CORS strict sur les endpoints sensibles** : `get-usage-stats` n'accepte que `app.ask-it.ai` et le portail Supabase.
- **Headers d'auth sur les webhooks** : `x-webhook-secret` pour `diagnostic-webhook`, HMAC SHA-256 pour les webhooks Shopify, `x-api-key` pour les endpoints cross-Supabase.
- **RLS Supabase** : `ALL public` via service_role sur la plupart des tables. Pas de séparation tenant au niveau BDD.

### 13.2 RLS détaillé

Le template applique les mêmes policies que Ouate :

- **Tables sensibles** (sessions, orders, logs, messages) : `service_role` uniquement pour write, lecture publique anon parce que la sécurité repose sur le token.
- **Tables de référence** (`personas`, `client_products`, `marketing_sources`) : lecture publique anon.
- **`aski_chats` / `aski_messages`** : lecture/insertion par anon et authenticated.
- **`api_usage_logs`** : policy explicite `"Service role can insert usage logs"` + `"Anon can insert api_usage_logs"`. C'est ce qui résout le bug de logging Anthropic silencieux découvert chez Ouate.

### 13.3 Limites du modèle actuel

Ce modèle n'est pas un vrai multi-tenant sécurisé. Si on a 2 clients dans la même base Supabase (ce qui n'est PAS le cas dans le template — chaque client a son propre Supabase), il n'y a aucune isolation BDD. C'est acceptable parce que :
- Chaque client a son propre projet Supabase complètement isolé
- Les UUID v4 utilisés comme `resultId` sont non devinables
- L'AccessGate filtre toute requête entrante avant d'arriver au dashboard

### 13.5 Sécurité du repo GitHub template

**Le repo `dashboard-template-askit` est public pendant la phase de transformation** (avril 2026) pour faciliter l'accès en lecture par les outils d'analyse et la collaboration. Une fois la transformation terminée et le template prêt à être utilisé commercialement, **le repo doit être passé en privé** pour protéger l'IP technique d'Ask-It.

**Ce que contient le code du repo et qu'un concurrent pourrait copier en lecture publique** :
- L'architecture complète (tables, Edge Functions, hooks)
- Les system prompts Aski (~600 lignes) avec toutes les règles d'anti-hallucination, le ton, le pipeline de chargement contextuel
- Le system prompt `generate-recommendation-content` (~500 lignes) avec les règles de marque, anti-hallucination produits, validation, retry
- La logique de scoring de personas (pondération identity/need/behavior 25/50/25, algorithme de détection automatique)
- La structure de la table `tenant_config` et les patterns d'abstraction
- Les 213 sources marketing avec leur tier (qui sont génériques mais restent un choix éditorial Ask-It)

**Action à effectuer après la phase de transformation** :
1. Aller sur `https://github.com/pierrechn26/dashboard-template-askit/settings`
2. Scroll en bas → "Danger Zone" → "Change repository visibility"
3. "Make private" → confirmer
4. Le repo reste accessible à toi et à toute personne explicitement ajoutée comme collaborator, mais n'est plus visible publiquement

**Aucune donnée sensible n'est exposée pendant la phase publique** : le `.env` du repo ne contient que `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID` et `VITE_SUPABASE_PUBLISHABLE_KEY` (clé anon publique par design), et tous les vrais secrets (service_role, Anthropic, Stripe, Shopify, Klaviyo) sont stockés côté Supabase Edge Functions Secrets, jamais dans le repo.

### 13.6 Évolution future (hors scope du template v1)

Pour une vraie phase 2 multi-tenant unique :
- Ajouter `tenant_id UUID NOT NULL` sur toutes les tables
- RLS basée sur JWT claim `tenant_id`
- Auth Supabase centralisée (au lieu de l'AccessGate token)
- Migration progressive des clients existants vers le nouveau schéma

Ces évolutions ne sont **pas dans le scope du template v1**. Le template reproduit fidèlement le modèle de sécurité Ouate validé en production.

---

## 14. System prompts IA — patron générique

C'est l'une des sections les plus importantes parce que c'est là que se trouve le plus gros risque de fuite Ouate dans le template.

### 14.1 Variables paramétrées

Toutes les Edge Functions qui construisent des prompts IA lisent désormais les variables suivantes depuis `tenant_config` au démarrage :

```typescript
const config = await loadTenantConfig(supabase);

const BRAND_NAME = config.brand_name;            // ex: "Ouate Paris"
const BRAND_TONE = config.brand_tone;            // ex: "Bienveillant, expert, rassurant..."
const BRAND_DESCRIPTION = config.brand_description; // ex: "Marque française de soins naturels..."
const TARGET_AUDIENCE = config.target_audience;  // ex: "Parents d'enfants 4-12 ans"
const INDUSTRY = config.industry;                // ex: "cosmétique enfant"
const CURRENCY = config.currency;                // ex: "EUR"
const CLIENT_CONTEXT = config.client_context_json; // objet enrichi
```

### 14.2 Patron de system prompt Aski

```
Tu es Aski, l'assistant IA du dashboard Ask-It pour la marque ${BRAND_NAME}.

DATE DU JOUR : ${today}
[...]

TON RÔLE :
Tu aides l'équipe marketing de la marque à comprendre leurs données, exploiter leurs personas, et prendre des décisions marketing éclairées.

CONTEXTE MARQUE :
${BRAND_DESCRIPTION}
Cible : ${TARGET_AUDIENCE}
Secteur : ${INDUSTRY}

TON DE MARQUE :
${BRAND_TONE}

[... le reste du prompt générique : style, anti-hallucination, codes personas, croisement persona×données, interprétation métriques, sources factuelles ...]
```

### 14.3 Patron de system prompt `generate-recommendation-content`

```
Tu es un expert en marketing performance pour ${BRAND_NAME}, marque ${INDUSTRY}.
Cible : ${TARGET_AUDIENCE}.

[... règles génériques : anti-hallucination, max 25% remise, variété formats, etc. ...]

CATALOGUE PRODUITS DE LA MARQUE :
${products_from_client_products_table}

CONTEXTE PERSONAS :
${personas_with_metrics}

INTELLIGENCE MARCHÉ :
${market_intelligence_summary}

[... le reste du prompt ...]
```

### 14.4 Patron de system prompt `monthly-market-intelligence`

Le `OUATE_CLIENT_CONTEXT` hardcodé devient :

```typescript
const CLIENT_CONTEXT = config.client_context_json;
// CLIENT_CONTEXT contient : { brand, description, tone, products[], channels[], promoCode, shopify_url }
```

Et est utilisé partout dans la fonction au lieu de l'objet hardcodé.

### 14.5 Règle de relecture

Avant chaque commit dans le template, faire un `grep -r "Ouate\|ouate\|OUATE\|cosmétique enfant\|4-12 ans\|peau enfant"` dans `src/` et `supabase/` pour s'assurer qu'il ne reste plus aucune référence Ouate. Le résultat doit être vide.

---

## 15. Branding et design system

### 15.1 Branding fixe Ask-It (conservé)

Le template garde le branding **Ask-It** parce que c'est le SaaS qui propulse les dashboards :

- **Logo Ask-It** : `src/assets/ask-it-logo.png`, affiché en haut du dashboard
- **Couleurs Ask-It** : tokens dans `src/index.css`
  - Primary `348 83% 47%` (rouge `#DB143C`)
  - Secondary `330 81% 60%` (rose magenta)
  - Accent `15 85% 55%` (orange-rouge `#EE6C4D`)
  - Tertiary `0 70% 60%` (rouge clair)
- **Polices** : DM Sans (corps) + Poppins (titres)
- **Mention de pied** : "Propulsé par Ask-It" reste affiché sur toutes les vues partagées

### 15.2 Branding paramétré par client

Le seul élément paramétré est le **nom de la marque** affiché dans le header et certains titres :

- Header : "Dashboard `${brand_name}` — Plan `${plan}`"
- Titre HTML : "`${brand_name}` × Ask-It Dashboard"
- Mentions ponctuelles dans les composants : `Diagnostic ${brand_name}`, `découvrent ${brand_name} grâce au diagnostic`, etc.

Le **logo du client** n'est PAS dans le scope du template v1. Ajouté plus tard via une colonne `tenant_config.brand_logo_url` si le besoin se confirme.

### 15.3 Assets à nettoyer

Les avatars personas pré-générés pour Ouate sont **supprimés** du template :
- `src/assets/persona-emma.png`
- `src/assets/persona-lea.png`
- `src/assets/persona-sophie.png`
- `src/assets/persona-p1.png` à `persona-p9.png`

Le composant `PersonaCard.tsx` affichera un avatar généré par défaut (initiale du nom dans un cercle coloré) jusqu'à ce qu'un client veuille fournir des avatars personnalisés.

### 15.4 Favicon et meta tags

`index.html` :
- Title : reste générique "Ask-It Dashboard Data Premium" ou paramétré au runtime via JS si on veut afficher le nom de la marque dans l'onglet navigateur
- Favicon : reste Ask-It (pas de favicon par client dans le template v1)
- Meta description : reste générique

### 15.5 README.md

Le `README.md` actuel est l'ancien README généré automatiquement par Lovable au démarrage du projet Ouate (avec l'URL `https://lovable.dev/projects/638949cb-...`). Il est **entièrement remplacé** par un README dédié au template :

```markdown
# Ask-It Dashboard Template

Template de base réutilisable pour les dashboards client Ask-It.

## Utilisation

Ce repo est destiné à être utilisé comme template via Remix dans Lovable. Pour onboarder un nouveau client :
1. Remix du projet template dans Lovable → crée automatiquement un nouveau projet + repo GitHub + Supabase
2. Suivre la checklist d'onboarding documentée dans ONBOARDING_CLIENT_ASKIT.md

## Stack

- Vite + React 18 + TypeScript
- shadcn/ui + Tailwind CSS
- Supabase (Postgres + Edge Functions + Storage)
- Anthropic Claude Sonnet 4.6 + Google Gemini + Perplexity

## Documentation

Voir `ARCHITECTURE_DASHBOARD_TEMPLATE.md` pour l'architecture complète.
Voir `ONBOARDING_CHECKLIST.md` pour la checklist d'onboarding client (à venir).

## Repo source

Ce template a été dérivé du dashboard Ouate Paris (`tableau-ouate-ea1cab29`),
le premier déploiement Ask-It en production.
```


---

## 16. Les 16 règles non-négociables

Ces 16 règles sont issues du croisement des récaps des 3 chats Claude (admin, dashboard, diagnostic) avec l'analyse du code Ouate. Ce sont les leçons apprises de tous les bugs résolus en production. Elles **doivent être respectées dans toute évolution future du template** et figurer dans la documentation onboarding de chaque nouveau client.

### Règle 1 — RPC `SECURITY DEFINER` pour la création de session

**Jamais de `.from('diagnostic_sessions').insert({...}).select()` direct depuis le frontend.** Toujours passer par une fonction RPC `SECURITY DEFINER` (`create_diagnostic_session`) qui INSERT et retourne `{id, session_code}` en contournant la RLS.

**Pourquoi** : la RLS `USING(false)` bloque le `.select()` chaîné après l'INSERT, ce qui a causé le bug `"Missing session_code or session_id"` chez Ouate.

### Règle 2 — Pagination explicite obligatoire

**Aucun `.from(table).select()` sans `.range(0, N)` explicite** sur les tables à volume (`diagnostic_sessions`, `client_orders`, `aski_messages`, `api_usage_logs`). Pour les volumes >1000, paginer avec une boucle `while (hasMore)`.

**Pourquoi** : Supabase a un plafond implicite à 1000 lignes. Le bug "Impact CA" qui s'arrêtait au 12/03 venait de ce plafond.

### Règle 3 — Séparateur ` | ` pour les listes de produits

**Jamais de `.join(", ")` pour `validated_products` ou `recommended_products`.** Toujours `.join(" | ")` (pipe entouré d'espaces).

**Pourquoi** : un produit dont le nom contient une virgule (ex: `"Mon écran 1,2,3 soleil"`) cassait le `.split(",")` et faisait remonter le fragment `"2"` comme top produit.

### Règle 4 — Guard `hasExternalData` avant envoi de webhook

**Aucun montant ne doit être envoyé dans un webhook tant que les données externes ne sont pas chargées.** Si Shopify timeout, le montant reste à `null` plutôt que d'envoyer un fallback hardcodé.

**Pourquoi** : un montant faux est pire qu'un montant absent, ça crée des incohérences dashboard ↔ Shopify Analytics.

### Règle 5 — Source unique de vérité pour les calculs partagés

**Un calcul partagé entre l'UI et un webhook = une seule fonction.** Ex: `cartTotalCalculator.ts` utilisé à la fois par `StickyCartSidebar` et par le useEffect qui envoie le webhook.

**Pourquoi** : garantit que le montant envoyé au dashboard est strictement identique à celui vu par l'utilisateur.

### Règle 6 — Logging modèle dynamique + helper centralisé

**Le nom du modèle IA est lu depuis la variable du body de la requête, jamais hardcodé dans le code de logging.** Helper `_shared/logApiUsage()` partagé entre toutes les Edge Functions.

**Pourquoi** : permet de changer de modèle sans toucher au code de logging. Évite les mismatchs entre le model loggé et la pricing table.

### Règle 7 — Policy RLS explicite `Service role can insert usage logs`

**`api_usage_logs` doit avoir une policy explicite** qui autorise les inserts depuis le service_role et anon.

**Pourquoi** : sans cette policy, certains appels Anthropic ne loggaient pas leur coût silencieusement.

### Règle 8 — Entrées `model_pricing` avec et sans préfixe `google/`

**Côté portail admin**, dans la table `model_pricing`, chaque modèle Gemini doit avoir deux entrées : avec préfixe `google/` et sans. Le matcher `findPricing()` essaie les deux.

**Pourquoi** : le dashboard logge parfois `gemini-2.5-pro` et parfois `google/gemini-2.5-pro`. Les deux doivent matcher.

### Règle 9 — Enums anglais en BDD, traduction française à l'affichage

**Tous les codes enum (status, source, exit_type, etc.) sont en anglais en BDD.** La traduction française se fait uniquement à l'affichage côté frontend.

**Pourquoi** : permet les regroupements stats fiables et facilite le multilingue. Décision validée chez Ouate sur les codes des questions dynamiques (`visible_signs`, `weather_changes`, etc.).

### Règle 10 — Tri items par âge/index décroissant

**L'item index 0 doit être le plus "important"** (l'aîné pour des enfants, le projet principal pour un SaaS, etc.). Cohérence avec Klaviyo et le dashboard.

### Règle 11 — `ORGANIZATION_ID` en secret, jamais en constante

**L'UUID de l'organisation est stocké uniquement dans le secret Supabase `ORGANIZATION_ID`, jamais dans le code.**

**Pourquoi** : permet de copier le code d'un client à l'autre sans risque de fuite croisée.

### Règle 12 — `.catch(() => {})` interdits

**Tous les blocs catch doivent contenir au minimum `console.error("LOG FAIL:", error)`.** Jamais de catch silencieux.

**Pourquoi** : un catch silencieux a caché le bug de logging Anthropic pendant des semaines chez Ouate.

### Règle 13 — Timeout 110s minimum sur les appels Claude Sonnet

**Les appels Claude Sonnet doivent avoir un timeout de 110s minimum** (pas 30s). Le fallback Gemini intervient ensuite.

**Pourquoi** : Sonnet peut prendre 31+ secondes sur les recos lourdes. Le timeout 30s causait des 504 systématiques.

### Règle 14 — Parsing JSON robuste à 4 niveaux

**Le parsing du JSON retourné par les LLM doit être robuste à 4 niveaux** :
1. Direct `JSON.parse()`
2. Strip code blocks markdown (` ```json ... ``` `)
3. Extraction `{...}` par regex
4. Log complet et rejet propre HTTP 422 si tout échoue

**Pourquoi** : Sonnet et Gemini retournent parfois le JSON avec du texte autour, parfois dans des code blocks, parfois directement. Un seul niveau de parsing ne suffit pas.

### Règle 15 — Validation `validateGeneratedCopy()` + retry max 2

**Toute génération de contenu marketing passe par `validateGeneratedCopy()`** qui détecte les chiffres inventés, claims douteux, garanties fictives. En cas d'échec, retry max 2 avec prompt corrigé. Sinon HTTP 422 `validation_failed`.

**Pourquoi** : Sonnet hallucine régulièrement des stats ("73 % de nos clientes", "15 000 parents"). Sans validation, ces hallucinations partent en production.

### Règle 16 — Sanitization frontend des codes personas

**`sanitizePersonaReferences(text)` est appliqué sur tous les champs texte rendus côté frontend.** Remplace P0–P9 par les prénoms.

**Pourquoi** : malgré les instructions backend, Sonnet laisse occasionnellement passer des codes persona dans le contenu. Filet de sécurité frontend obligatoire.

### Synthèse

Ces 16 règles sont **des invariants du template**. Aucune modification ne doit les casser. Tout nouveau prompt Lovable de transformation doit explicitement vérifier qu'il ne viole aucune de ces règles avant d'être appliqué.

---

## 17. Configuration secrets

Liste complète des secrets Supabase à configurer pour qu'un dashboard cloné depuis le template fonctionne.

### 17.1 Secrets obligatoires

| Secret | Source | Description |
|--------|--------|-------------|
| `SUPABASE_URL` | Auto par Lovable | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto par Lovable | Service role key |
| `SUPABASE_ANON_KEY` | Auto par Lovable | Clé anon publique |
| `SUPABASE_PUBLISHABLE_KEY` | Auto par Lovable | Alias de l'anon key |
| `SUPABASE_DB_URL` | Auto par Lovable | URL postgres direct |
| `ANTHROPIC_API_KEY` | Console Anthropic | Clé API Claude (Sonnet 4.6) |
| `LOVABLE_API_KEY` | Lovable AI Gateway | Clé pour Gemini fallback |
| `PERPLEXITY_API_KEY` | Console Perplexity | Pour `monthly-market-intelligence` |
| `MONITORING_API_KEY` | Portail admin Ask-It | Format `mk_...`, généré à la création de l'org |
| `USAGE_STATS_API_KEY` | Constante Ask-It | `askit-usage-stats-2026` |
| `ORGANIZATION_ID` | Portail admin Ask-It | UUID de l'org client |
| `DASHBOARD_WEBHOOK_SECRET` | Généré à l'onboarding | Pour `diagnostic-webhook`, partagé avec le diagnostic client |

### 17.2 Secrets optionnels (selon intégrations)

| Secret | Activé si | Description |
|--------|-----------|-------------|
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Shopify activé | Storefront API |
| `SHOPIFY_ACCESS_TOKEN` | Shopify activé | Admin API |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify activé | Admin API |
| `SHOPIFY_WEBHOOK_SECRET` | Shopify activé | HMAC orders/paid |
| `SHOPIFY_CHECKOUT_WEBHOOK_SECRET` | Shopify activé | HMAC checkouts/create |
| `KLAVIYO_API_KEY` | Klaviyo activé | API Klaviyo v3 |
| `GA4_PROPERTY_ID` | GA4 activé | Property ID GA4 |
| `GA4_SERVICE_ACCOUNT_EMAIL` | GA4 activé | Service account |
| `GA4_SERVICE_ACCOUNT_PRIVATE_KEY` | GA4 activé | Private key RS256 |

### 17.3 Vérification post-onboarding

Une Edge Function `health-check` (à créer dans le template) vérifie au démarrage que tous les secrets obligatoires sont présents et que les optionnels sont cohérents avec `tenant_config.integrations_enabled`. Retourne un rapport JSON exploitable.

```bash
# Test post-onboarding
curl -X POST https://{supabase_url}/functions/v1/health-check \
  -H "x-api-key: askit-usage-stats-2026"
```

---

## 18. Checklist d'onboarding client en 10 étapes

Cette checklist documente le processus complet pour onboarder un nouveau client à partir du template. Objectif : **dashboard live en moins de 2 heures de travail effectif** (4 heures avec intégrations Shopify + Klaviyo + GA4).

> **Note importante** : la procédure opérationnelle complète et détaillée vit dans le fichier séparé `ONBOARDING_CLIENT_ASKIT.md` à la racine du repo. La section ci-dessous en est la version résumée, à des fins de référence dans le document d'architecture. Pour exécuter un onboarding réel, suis `ONBOARDING_CLIENT_ASKIT.md`.

### Étape 1 — Remix dans Lovable

Dans Lovable, ouvrir le projet template du dashboard → cliquer sur **"Remix"**. Lovable crée automatiquement :
- Un **nouveau projet Lovable** (nommer : `Dashboard {Client}`, ex: `Dashboard Baûbo`)
- Un **nouveau repo GitHub** indépendant (ex: `tableau-baubo`) sous le compte `pierrechn26`
- Un **nouveau projet Supabase vierge** (auto-provisionné par Lovable Cloud)

Lovable exécute automatiquement toutes les migrations SQL du dossier `supabase/migrations/`. Le nouveau Supabase est complètement isolé — aucun risque de fuite de données.

### Étape 2 — Création de l'org dans le portail admin

Aller sur `https://app.ask-it.ai/admin/clients` → "Nouvelle organisation".

Remplir :
- Nom du client
- Secteur (E-commerce / SaaS / Info-produit / Agence / Autre)
- `dashboard_url` : URL future du dashboard (ex: `https://baubo.ask-it.ai`)
- `diagnostic_url` : URL publique du diagnostic
- `subscription_plan` : starter / growth / scale
- Laisser `client_supabase_url` vide pour l'instant (rempli à l'étape 6)

Enregistrer. Le trigger SQL `trg_sync_plan_limits` remplit automatiquement les limites selon le plan.

**Copier l'UUID de l'org** (bouton "Copier ID organisation") — ce sera le `ORGANIZATION_ID` à mettre en secret.

### Étape 3 — Génération des clés monitoring

Dans la modale d'édition de l'org, section "Monitoring", cliquer "Générer" pour la clé dashboard. Copier le `mk_...`.

C'est la valeur du secret `MONITORING_API_KEY`.

### Étape 4 — Configuration des secrets Supabase

Dans le projet Lovable client, aller dans Supabase → Edge Functions → Secrets et configurer **les 12 secrets obligatoires** :

```
ORGANIZATION_ID = {uuid copié à l'étape 3}
MONITORING_API_KEY = {mk_... copié à l'étape 4}
USAGE_STATS_API_KEY = askit-usage-stats-2026
DASHBOARD_WEBHOOK_SECRET = {généré aléatoirement, à partager avec le diagnostic}
ANTHROPIC_API_KEY = {clé Anthropic globale}
LOVABLE_API_KEY = {clé Lovable AI Gateway}
PERPLEXITY_API_KEY = {clé Perplexity globale}
```

Les 5 secrets `SUPABASE_*` sont auto-créés par Lovable Cloud, rien à faire.

### Étape 5 — Mise à jour `client_supabase_url` côté portail

Récupérer l'URL Supabase du nouveau projet (visible dans Lovable Cloud, format `https://{project_ref}.supabase.co`).

Retourner sur `https://app.ask-it.ai/admin/clients/{id}` et renseigner `client_supabase_url` avec cette URL.

### Étape 6 — Configuration de `tenant_config`

Dans le projet Supabase du client, exécuter cette requête SQL pour créer la ligne unique de `tenant_config` :

```sql
INSERT INTO tenant_config (
  project_id,
  brand_name,
  brand_tone,
  brand_description,
  target_audience,
  industry,
  currency,
  locale,
  timezone,
  dashboard_url,
  diagnostic_url,
  client_context_json,
  integrations_enabled
) VALUES (
  '{nom_court_client}',  -- ex: 'baubo'
  '{nom affichage marque}',  -- ex: 'Baûbo'
  '{description ton de marque}',
  '{description courte de la marque}',
  '{cible client}',  -- ex: 'Femmes 25-45 ans soucieuses de santé intime'
  '{secteur}',  -- ex: 'soin intime féminin'
  'EUR',
  'fr-FR',
  'Europe/Paris',
  '{dashboard_url}',
  '{diagnostic_url}',
  '{ jsonb avec brand, description, tone, products, channels, promoCode, shopify_url }'::jsonb,
  '{ "shopify": false, "klaviyo": false, "ga4": false, "meta_pixel": false }'::jsonb
);
```

> **Note importante sur l'automatisation future** : le remplissage manuel des champs `brand_name`, `brand_tone`, `brand_description`, `target_audience` et `industry` prend ~15-20 minutes par client. Une **Edge Function `extract-brand-context`** sera construite ultérieurement **côté portail admin Ask-It** (et non côté template dashboard) pour automatiser cette étape via scraping du site client + extraction par Claude Sonnet. Voir détails dans `ONBOARDING_CLIENT_ASKIT.md` section "Next step automatisation". Cette fonction n'est pas dans le scope du template dashboard v1.

### Étape 7 — Connexion diagnostic ↔ dashboard

> **Étape critique souvent oubliée**. Sans cette étape, les sessions du diagnostic n'arriveront jamais dans le dashboard.

Le diagnostic du client est un **projet Lovable séparé** (avec son propre repo GitHub, son propre Supabase). Il a une Edge Function `send-diagnostic-data` qui envoie un webhook au dashboard à chaque action utilisateur.

Pour que le webhook arrive au bon dashboard, le diagnostic doit connaître l'URL exacte du Supabase du dashboard et le secret partagé pour signer le webhook (`DASHBOARD_WEBHOOK_SECRET`).

**Action** : aller dans le projet Lovable du diagnostic du client → Supabase → Edge Functions → Secrets → ajouter :

```
DASHBOARD_WEBHOOK_URL = https://{xxxxx}.supabase.co/functions/v1/diagnostic-webhook
DASHBOARD_WEBHOOK_SECRET = {même valeur que celle générée à l'étape 5 côté dashboard}
MONITORING_API_KEY = {clé monitoring diagnostic, générée depuis le portail admin}
ORGANIZATION_ID = {même UUID qu'à l'étape 5}
USAGE_STATS_API_KEY = askit-usage-stats-2026
```

**Validation** : lancer le diagnostic du client une fois en mode test, puis vérifier dans `diagnostic_sessions` du nouveau Supabase dashboard que la session est arrivée. Si oui, connexion validée.

Le format exact du payload attendu par `diagnostic-webhook` est documenté dans `WEBHOOK_CONTRACT.md` à la racine du repo template.

### Étape 8 — Configuration des intégrations externes (si applicables)

Pour chaque intégration que le client utilise, ajouter les secrets correspondants et passer le flag à `true` dans `tenant_config.integrations_enabled`. Détails complets dans `ONBOARDING_CLIENT_ASKIT.md`.

### Étape 9 — Configuration du domaine custom

Dans Lovable, ajouter le domaine custom du client (ex: `baubo.ask-it.ai`).

Ajouter les DNS A records côté DNS du client (ou côté `ask-it.ai` si sous-domaine) :
- `A {sous-domaine}` → `185.158.133.1`

### Étape 10 — Test end-to-end et validation

1. Lancer le diagnostic du client une fois (en mode test)
2. Vérifier que la session arrive dans `diagnostic_sessions`
3. Vérifier que le dashboard l'affiche dans l'onglet Diagnostic
4. Tester Aski avec une question simple
5. Vérifier que le coût est loggé dans `api_usage_logs`
6. Vérifier que le portail admin voit bien les stats du client (`/admin/clients/{id}`)
7. Inviter les utilisateurs du client via le portail
8. Notifier le client que le dashboard est prêt avec le lien et les credentials

**Total : ~2 heures de travail effectif** pour un onboarding standard sans intégrations complexes. Avec Shopify + Klaviyo + GA4, compter ~4 heures.

### Évolutions futures de la checklist

Cette checklist sera affinée et automatisée au fil des onboardings. Objectif phase 2 : **onboarding 1-clic depuis le portail admin** (Remix Lovable + provisionnement Supabase + secrets + tenant_config + DNS, tout via une Edge Function `provision-new-client`).


---

## 19. Carte de la transformation Ouate → Template

Cette section liste **toutes les modifications concrètes** à appliquer au repo `dashboard-template-askit` pour passer de la copie 1:1 actuelle de Ouate à l'état cible décrit dans ce document. C'est la matière première de la séquence de prompts Lovable de transformation qui sera produite ensuite.

### 19.1 Modifications BDD (migrations)

À traiter dans **une nouvelle migration de transformation** appliquée par-dessus les migrations existantes :

| Action | Cible | Détail |
|--------|-------|--------|
| CREATE TABLE | `tenant_config` | Nouvelle table de configuration tenant |
| RENAME TABLE | `diagnostic_children` → `diagnostic_items` | + restructuration en JSONB |
| RENAME TABLE | `shopify_orders` → `client_orders` | + ajout `source_provider` |
| RENAME TABLE | `ouate_products` → `client_products` | + ajout `source_provider` |
| ALTER TABLE | `diagnostic_sessions` RENAME COLUMN `existing_ouate_products` TO `existing_brand_products` | |
| DROP TABLE | `recommendation_staging` | Plus utilisée |
| ALTER TABLE | `marketing_recommendations` DROP COLUMN | `persona_focus`, `checklist`, `ads_recommendations`, `email_recommendations`, `offers_recommendations`, `sources_consulted`, `ads_v2`, `emails_v2`, `offers_v2`, `campaigns_overview`, `generation_config`, `pre_calculated_context` |
| INSERT INTO | `personas` | Seed P0 uniquement (pool sessions non-attribuées) |
| INSERT INTO | `marketing_sources` | Seed des 213 sources génériques |
| INSERT INTO | `tenant_config` | Ligne vide à remplir lors de chaque onboarding |
| ALTER POLICY | `api_usage_logs` | S'assurer que les policies "Service role can insert" et "Anon can insert" sont en place |

### 19.2 Modifications Edge Functions

#### Création du dossier `_shared/`

Créer 5 fichiers helpers :
1. `_shared/cors.ts` — extraire les headers CORS dupliqués
2. `_shared/loadTenantConfig.ts` — lecture cachée de `tenant_config`
3. `_shared/logApiUsage.ts` — extraire le helper inline d'`aski-chat`
4. `_shared/notifyPortalThreshold.ts` — extraire le helper inline d'`aski-chat`
5. `_shared/reportEdgeFunctionError.ts` — extraire le helper inline

Mettre à jour `aski-chat/index.ts` et `aski-daily-learn/index.ts` pour importer ces helpers au lieu de les avoir inline.

#### Abstraction des `PROJECT_ID = "ouate"`

6 fichiers à modifier :
- `supabase/functions/get-org-limits/index.ts` ligne 21
- `supabase/functions/weekly-intelligence-refresh/index.ts` ligne 15
- `supabase/functions/monthly-market-intelligence/index.ts` ligne 22
- `supabase/functions/generate-marketing-recommendations/index.ts` ligne 36
- `supabase/functions/generate-recommendation-content/index.ts` ligne 34
- `src/hooks/useUsageLimits.ts` ligne 166

Pattern de remplacement :
```typescript
// AVANT
const PROJECT_ID = "ouate";

// APRÈS
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";
const config = await loadTenantConfig(supabase);
const PROJECT_ID = config.project_id;
```

#### Abstraction des prompts IA Ouate-spécifiques

**`aski-chat/index.ts`** :
- Lignes 506-507 : `brandName = "Ouate Paris"` et `brandTone = "..."` → lecture depuis `tenant_config`
- Ligne 95 : prompt système titre "expert en marketing e-commerce DTC spécialisé dans la cosmétique enfants (4-11 ans)" → paramétré via `industry` + `target_audience`
- Ligne 580 : `"Un AOV de 58€ chez Ouate (gamme 15-55€)"` → exemple générique sans nom de marque
- Ligne 612 : `"autonomie → 'autonomie de l'enfant'"` → liste générique sans référence à enfant

**`aski-daily-learn/index.ts`** :
- Ligne 94 : "marque de cosmétique enfants" → paramétré via `industry`

**`monthly-market-intelligence/index.ts`** :
- Lignes 73-94 : objet `OUATE_CLIENT_CONTEXT` complet → suppression et lecture depuis `tenant_config.client_context_json`
- Lignes 434-436 : utilisation du contexte → adaptation à la lecture dynamique
- Lignes 731+746 : `client_context: OUATE_CLIENT_CONTEXT` → `client_context: config.client_context_json`

**`weekly-intelligence-refresh/index.ts`** :
- Lignes 162+166 : "analyste marketing spécialisé en e-commerce cosmétique enfant" → paramétré via `industry`

**`generate-recommendation-content/index.ts`** :
- Ligne 222 : "La tranche d'âge cible de la marque Ouate est 4-12 ans" → `${config.target_audience}`
- Ligne 316 : "TOUJOURS 'Parents d'enfants 4-12 ans'" → `TOUJOURS '${config.target_audience}'`
- Toutes les autres mentions "Ouate" → `${config.brand_name}`

**`generate-funnel-recommendations/index.ts`** :
- Ligne 119 : "marque de cosmétiques pour enfants (OUATE Paris)" → `${config.industry} (${config.brand_name})`

**`detect-persona-clusters/index.ts`** :
- Refactor `buildCriteriaFromCluster()` pour itérer sur `item_metadata` JSONB au lieu de champs hardcodés
- Refactor `assignPersonaCode()` pour ne plus hardcoder P1-P9
- Lecture des paramètres depuis `tenant_config.persona_detection_params`

#### Renommages liés aux tables

- Toutes les requêtes `.from("shopify_orders")` → `.from("client_orders")` (~5 fichiers)
- Toutes les requêtes `.from("ouate_products")` → `.from("client_products")` (~3 fichiers)
- Toutes les requêtes `.from("diagnostic_children")` → `.from("diagnostic_items")` (~2 fichiers)

#### Ajustements spécifiques à `diagnostic-webhook`

3 ajustements à intégrer dans le prompt Lovable qui traite l'abstraction de `diagnostic-webhook` :

1. **Standardisation du nom du secret** en `DASHBOARD_WEBHOOK_SECRET` (uniformiser toutes les références, supprimer les alias historiques)
2. **Itération agnostique** sur les clés de `item_metadata` JSONB reçues dans le payload, sans validation sur une liste de clés spécifiques
3. **Check explicite au démarrage** de la présence de `DASHBOARD_WEBHOOK_SECRET` dans les variables d'environnement, avec un message d'erreur guidant vers `WEBHOOK_CONTRACT.md`

Ces ajustements transforment le webhook d'un composant Ouate-spécifique en interface contractuelle documentée et générique.

#### Création du fichier `WEBHOOK_CONTRACT.md` à la racine du repo

Ce fichier documente le format exact du payload JSON attendu par `diagnostic-webhook`. Il sert d'**interface contractuelle** entre le projet dashboard et tout projet diagnostic qui veut s'y brancher. Contenu :
- Structure complète du JSON (tous les champs, types, obligatoires/optionnels)
- Exemple de payload commenté
- Headers d'authentification (`x-webhook-secret`)
- Liste des statuts acceptés, sources, device, exit_type
- Format de `item_metadata` avec exemples multi-vertical
- Codes d'erreur possibles et leur signification
- Instructions d'onboarding pour brancher un nouveau diagnostic

Le fichier est versionné dans le repo et référencé depuis le code de `diagnostic-webhook/index.ts` via un commentaire en tête.

#### Note importante : `extract-brand-context` est HORS SCOPE du template dashboard

L'Edge Function `extract-brand-context` qui automatisera le remplissage de `tenant_config` à partir d'un scraping du site client **ne fait pas partie** du template dashboard. Elle sera construite ultérieurement **côté portail admin Ask-It** (projet `premium-persona-pulse`), dans un chantier séparé après la transformation du template dashboard.

Raisons architecturales :
- C'est un outil d'onboarding tournant une seule fois à la création du client, pas un composant du dashboard en fonctionnement continu
- Centraliser au portail évite de dupliquer la fonction dans chaque dashboard client et de devoir gérer une clé Anthropic dans chaque projet client
- Compatible avec le futur onboarding 1-clic qui vivra aussi côté portail admin
- Permet d'améliorer la fonction sans toucher aux dashboards clients

Dans le template dashboard, les champs de `tenant_config` sont remplis manuellement à l'onboarding (étape 7 de la checklist). L'automatisation viendra plus tard, côté portail admin, via un chantier dédié.

#### Activation conditionnelle des intégrations

Ajouter le pattern `if (!config.integrations_enabled?.{integration}) return { enabled: false }` au début de :
- `shopify-order-webhook/index.ts`
- `shopify-checkout-webhook/index.ts`
- `sync-shopify-products/index.ts`
- `import-shopify-csv/index.ts`
- `sync-klaviyo-persona/index.ts`
- `backfill-klaviyo/index.ts`
- `ga4-analytics/index.ts`

#### Alignement modèle Sonnet 4.6

`generate-recommendation-content/index.ts` ligne 35 :
```typescript
// AVANT
const SONNET_MODEL = "claude-sonnet-4-20250514";

// APRÈS
const SONNET_MODEL = "claude-sonnet-4-6";
```

### 19.3 Modifications Frontend

#### Renommage onglet `alerts` → `aski`

`src/pages/Dashboard.tsx` :
- Ligne 432 : `<TabsTrigger value="alerts">` → `<TabsTrigger value="aski">`
- Ligne du `<TabsContent value="alerts">` → `value="aski"`

#### Header dynamique

`src/pages/Dashboard.tsx` ligne 241 :
```tsx
// AVANT
Dashboard Ouate Paris — Plan <span className="capitalize">{usageLimits.plan}</span>

// APRÈS
Dashboard {tenantConfig.brand_name} — Plan <span className="capitalize">{usageLimits.plan}</span>
```

Ajouter un hook `useTenantConfig()` qui charge la ligne unique de `tenant_config` au démarrage et la met en cache global.

#### Composants à abstraire

**`src/components/dashboard/DiagnosticPreview.tsx`** :
- Ligne 43 : `{ type: "ouate_diagnostic_reset" }` → `{ type: "diagnostic_reset" }`
- Ligne 142 : `title="Diagnostic OUATE"` → `title={\`Diagnostic ${brand_name}\`}`
- Ligne 154 : `Propulsé par Ask-It × OUATE` → `Propulsé par Ask-It × {brand_name}`

**`src/components/dashboard/BusinessMetrics.tsx`** :
- Ligne 384 : `découvrent Ouate grâce au diagnostic` → `découvrent {brand_name} grâce au diagnostic`

**`src/components/dashboard/PersonasTab.tsx`** :
- Lignes 103-104 : descriptions hardcodées P8 et P9 Ouate → SUPPRIMÉES (descriptions viennent de la BDD `personas.description`)

**`src/components/dashboard/SessionsTable.tsx`** :
- Toutes les références aux champs Ouate (`skin_concern`, `age_range`, etc.) → rendu générique des clés/valeurs de `item_metadata` JSONB

#### Suppression des constantes Ouate

`src/constants/personas.ts` : **SUPPRIMÉ entièrement** (les 9 personas P1-P9 Ouate hardcodés). Remplacé par un fichier `src/constants/personas.ts` qui expose seulement P0 et des helpers génériques (`getPersonaLabel`, `getPersonaDisplayName`, `getPersonaBadgeLabel`) qui lisent depuis la BDD.

#### Suppression des composants Legacy V1/V2

À supprimer :
- `src/components/dashboard/marketing/legacy/LegacyRecommendations.tsx`
- `src/components/dashboard/marketing/CampaignCard.tsx`
- Tout autre fichier dans `marketing/legacy/` ou marqué V2

#### Suppression des assets Ouate

À supprimer :
- `src/assets/persona-emma.png`
- `src/assets/persona-lea.png`
- `src/assets/persona-sophie.png`
- `src/assets/persona-p1.png` à `persona-p9.png`

#### Mise à jour des types TS

`src/types/diagnostic.ts` : retirer toute mention de `child`, `skin_concern`, `routine`, `ouate`. Remplacer par des types génériques.

`src/integrations/supabase/types.ts` : régénérer ce fichier après les migrations BDD pour qu'il reflète la nouvelle structure (`diagnostic_items`, `client_orders`, `client_products`, `tenant_config`, suppression de `recommendation_staging`).

### 19.4 Modifications fichiers racine

#### `README.md`

**Remplacé entièrement** par le README du template documenté en section 15.5.

#### `WEBHOOK_CONTRACT.md` (NOUVEAU)

**Créé à la racine du repo template**. Documente le format exact du payload JSON attendu par `diagnostic-webhook`, les headers d'auth, les codes d'erreur, les instructions d'onboarding pour brancher un nouveau diagnostic. Sert d'interface contractuelle entre le projet dashboard et tout projet diagnostic. Voir section 19.2 pour le détail.

#### `ONBOARDING_CLIENT_ASKIT.md` (NOUVEAU)

**Créé à la racine du repo template**. Procédure opérationnelle complète et répétable pour onboarder un nouveau client, en 10 étapes détaillées. Ce fichier est le pendant opérationnel du présent document d'architecture. Voir le fichier pour les détails de chaque étape.

#### `index.html`

- Title : conservé "Ask-It Dashboard Data Premium"
- Aucune autre modification

#### `package.json`

- Conservé tel quel (`"name": "vite_react_shadcn_ts"` est déjà générique)

#### `ARCHITECTURE_DASHBOARD_OUATE.md`

**Supprimé** du repo template (résidu de Ouate). Remplacé par `ARCHITECTURE_DASHBOARD_TEMPLATE.md` (le présent document).

#### `ARCHITECTURE.md`

À examiner — c'est un autre fichier d'architecture trouvé dans le repo Ouate. Probablement une version ancienne ou alternative. À supprimer aussi.

### 19.5 Récapitulatif chiffré de la transformation

| Catégorie | Nombre d'éléments à modifier |
|-----------|------------------------------|
| Tables BDD à créer/renommer/supprimer | 5 |
| Tables à nettoyer (drop columns) | 1 |
| Migrations à seeder | 3 (P0, 213 sources, tenant_config vide) |
| Edge Functions à abstraire | 12 |
| Helpers `_shared/` à créer | 5 |
| Composants frontend à abstraire | 5 |
| Composants frontend à supprimer | ~5 (Legacy V1/V2) |
| Assets à supprimer | ~10 (avatars personas) |
| Constantes hardcodées à supprimer | 1 (`src/constants/personas.ts` réduit) |
| Hooks à modifier | 4 (`useUsageLimits`, `useBusinessMetrics`, `useInsightsMetrics`, `useRevenueTimeseries`) |
| Fichiers racine à remplacer | 2 (`README.md`, `ARCHITECTURE_*.md`) |
| Onglet à renommer | 1 (`alerts` → `aski`) |

**Estimation du nombre de prompts Lovable** : entre 8 et 12 prompts séquentiels, chacun ciblé sur une zone (BDD, helpers, abstraction prompts, abstraction composants, etc.) avec validation entre chaque.

### 19.6 Ordre d'exécution recommandé

L'ordre des prompts Lovable de transformation respecte une dépendance stricte :

1. **Migration BDD** : créer `tenant_config`, renommer les tables, dropper les colonnes legacy, seeder P0 et les 213 sources
2. **Helpers `_shared/`** : créer le dossier et les 5 helpers
3. **Abstraction Edge Functions — config tenant** : remplacer tous les `PROJECT_ID = "ouate"` et hardcoded brand
4. **Abstraction Edge Functions — prompts IA** : nettoyer les system prompts de toute référence Ouate
5. **Activation conditionnelle des intégrations** : pattern `if (!config.integrations_enabled.X)`
6. **Refactor `detect-persona-clusters`** : `buildCriteriaFromCluster()` agnostique
7. **Renommage tables côté code** : `shopify_orders` → `client_orders`, `ouate_products` → `client_products`, `diagnostic_children` → `diagnostic_items`
8. **Frontend — abstraction composants** : header dynamique, suppression mentions Ouate dans les composants
9. **Frontend — suppression Legacy V1/V2 et assets**
10. **Frontend — rename onglet `alerts` → `aski`**
11. **Régénération `supabase/types.ts`** après les migrations BDD
12. **Nettoyage final** : remplacement README, suppression des `.md` Ouate, vérification grep "ouate"

Chaque prompt est validable indépendamment et inclut une vérification de non-régression sur les fonctionnalités existantes.

---

## Conclusion

Ce document décrit l'état cible complet du template `dashboard-template-askit`. Le repo actuel est encore une copie 1:1 du dashboard Ouate (commit initial). La séquence de prompts Lovable de transformation, qui sera produite en livrable suivant après validation de cette architecture, appliquera **toutes les modifications listées en section 19** dans l'ordre recommandé.

À l'issue de la transformation, le template sera prêt à être dupliqué pour chaque nouveau client Ask-It en suivant la **checklist d'onboarding en 10 étapes** documentée en section 18.

**Prochaine étape** : validation de ce document par Pierre, puis production de la séquence de prompts Lovable de transformation.

---

*Document généré le 14 avril 2026 — version 1.0*
