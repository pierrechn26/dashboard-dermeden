# Onboarding Client Ask-It — Procédure Standard

> **Document opérationnel** à suivre pour chaque nouveau client onboardé sur Ask-It.
> Version : 1.0 — avril 2026
> Prérequis : le template `dashboard-template-askit` est créé et nettoyé.

---

## Préambule

Ce document décrit la **procédure complète et répétable** pour onboarder un nouveau client Ask-It depuis zéro jusqu'à dashboard live. C'est la version "checklist opérationnelle" de l'architecture documentée dans `ARCHITECTURE_DASHBOARD_TEMPLATE.md`.

**Objectif temps** : 2 heures de travail effectif pour un onboarding standard sans intégrations complexes. 4 heures avec Shopify + Klaviyo + GA4.

**Prérequis avant de démarrer** :
- Le client a signé son contrat Ask-It et payé son setup fee
- L'appel kickoff a été fait, tu as toutes les informations sur la marque (positionnement, ton, cible, catalogue, intégrations souhaitées)
- Le diagnostic du client est déjà en cours de construction ou prêt (projet Lovable séparé)

> **Note sécurité importante** : le repo `dashboard-template-askit` est actuellement **public** pendant la phase de transformation (avril 2026) pour faciliter la collaboration et l'analyse. Une fois la transformation terminée et avant d'utiliser le template pour onboarder des clients commerciaux, **il faut passer le repo en privé** pour protéger l'IP technique d'Ask-It (system prompts Aski, logique de scoring personas, architecture marketing IA). Détails dans `ARCHITECTURE_DASHBOARD_TEMPLATE.md` section 13.5.

---

## Vue d'ensemble des 10 étapes

| # | Étape | Durée moyenne | Bloquant ? |
|---|-------|--------------|-----------|
| 1 | Remix dans Lovable (projet + repo + Supabase) | 10 min | Oui |
| 2 | Création de l'org dans le portail admin Ask-It | 10 min | Oui |
| 3 | Génération des clés monitoring | 5 min | Oui |
| 4 | Configuration des secrets Supabase obligatoires | 15 min | Oui |
| 5 | Mise à jour `client_supabase_url` dans le portail | 2 min | Oui |
| 6 | Configuration de `tenant_config` (brand, ton, cible) | 20 min | Oui |
| 7 | **Connexion diagnostic ↔ dashboard** | 15 min | Oui |
| 8 | Configuration des intégrations externes optionnelles | 30-90 min | Si applicable |
| 9 | Configuration du domaine custom | 15 min | Oui (avant go-live) |
| 10 | Test end-to-end et validation | 20 min | Oui |

**Total bloquant minimum (sans intégrations)** : ~2 heures
**Total avec Shopify + Klaviyo + GA4** : ~4 heures

---

## Étape 1 — Remix dans Lovable

### Action

Dans Lovable, ouvrir le **projet template du dashboard** (connecté au repo `dashboard-template-askit`) → cliquer sur **"Remix"**.

### Ce que le Remix fait automatiquement

1. Crée un **nouveau projet Lovable** indépendant
2. Crée un **nouveau repo GitHub** sous le compte `pierrechn26` (nommé automatiquement, renommable ensuite en `tableau-{client}`)
3. **Auto-provisionne un nouveau projet Supabase vierge** (database PostgreSQL fresh + Edge Functions Deno + Storage)
4. Exécute toutes les migrations SQL du dossier `supabase/migrations/` dans l'ordre chronologique
5. Crée automatiquement les 5 secrets Supabase de base : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_URL`

### Configuration post-Remix

- Renommer le projet Lovable : `Dashboard {Client}` (ex: `Dashboard Baûbo`)
- Renommer le repo GitHub si nécessaire : `tableau-{nom-client-court}` (ex: `tableau-baubo`)

### Pourquoi un repo dédié par client

Chaque Remix crée un repo GitHub indépendant, ce qui donne :
- Historique git complet et indépendant
- Possibilité de comparer les divergences entre clients
- Indépendance vis-à-vis de Lovable (le code est à toi sur GitHub)
- Base nécessaire pour les futurs fixes multi-clients via cherry-pick

### Validation

- Le projet Lovable affiche le code du dashboard
- Aller dans Supabase (lien depuis Lovable) → vérifier que les 18 tables sont présentes (`tenant_config`, `diagnostic_sessions`, `diagnostic_items`, `personas`, `aski_chats`, etc.)
- Vérifier que la table `personas` contient déjà 1 ligne (le P0 seedé via migration)
- Vérifier que la table `marketing_sources` contient ~213 lignes (les sources génériques seedées)
- Récupérer et noter l'URL Supabase du nouveau projet (format : `https://xxxxx.supabase.co`)

---

## Étape 2 — Création de l'org dans le portail admin Ask-It

### Action

Aller sur `https://app.ask-it.ai/admin/clients` → cliquer **"Nouvelle organisation"**.

### Configuration

| Champ | Valeur |
|-------|--------|
| Nom | Nom complet de la marque (ex: `Baûbo`, `Demain Beauty`) |
| Secteur | Choisir parmi : E-commerce / SaaS / Info-produit / Agence / Autre |
| `dashboard_url` | URL future du dashboard custom (ex: `https://baubo.ask-it.ai`) |
| `diagnostic_url` | URL publique du diagnostic du client (ex: `https://baubo.com/diagnostic`) |
| `diagnostic_embed_url` | URL Lovable de l'app diagnostic (pour le code embed) |
| `diagnostic_active` | Toggle ON |
| `client_supabase_url` | **Laisser vide pour l'instant** (rempli à l'étape 5) |
| `subscription_plan` | `starter`, `growth`, ou `scale` (selon le contrat signé) |
| `aski_monthly_limit` | Auto-rempli par le trigger SQL selon le plan |
| `diagnostic_monthly_limit` | Auto-rempli par le trigger SQL selon le plan |
| `marketing_recommendations_monthly_limit` | Auto-rempli par le trigger SQL selon le plan |
| `stripe_customer_id` | Si disponible (généré après le premier paiement Stripe) |

### Validation

- L'org apparaît dans la liste `/admin/clients`
- Cliquer sur la fiche → vérifier que les limites sont bien remplies
- **Cliquer sur le bouton "Copier ID organisation"** et noter cet UUID, il sera utilisé à l'étape 4

---

## Étape 3 — Génération des clés monitoring

### Action

Toujours dans la fiche org du portail admin, ouvrir la modale d'édition → section "Monitoring".

### Configuration

Cliquer sur **"Générer"** pour la clé dashboard. Le portail génère une clé au format `mk_xxxxxxxxxxxxxxxxxx`. **Copier cette clé immédiatement** (elle ne sera plus affichée en clair après).

Optionnel : cliquer aussi sur "Générer" pour la clé diagnostic (utile pour l'étape 7).

### Validation

- Les clés sont générées et copiées
- Elles apparaissent listées dans la section avec leur dernière utilisation à `null`

---

## Étape 4 — Configuration des secrets Supabase obligatoires

### Action

Dans le projet Lovable du nouveau dashboard, aller dans **Supabase → Edge Functions → Secrets** (ou via Lovable Cloud → Secrets selon l'interface).

### Secrets à configurer

```
ORGANIZATION_ID = {UUID copié à l'étape 2}
MONITORING_API_KEY = {mk_xxx copié à l'étape 3}
USAGE_STATS_API_KEY = askit-usage-stats-2026
DASHBOARD_WEBHOOK_SECRET = {générer une chaîne aléatoire de 32+ caractères}
ANTHROPIC_API_KEY = {clé Anthropic Ask-It globale}
LOVABLE_API_KEY = {clé Lovable AI Gateway, normalement déjà fournie par Lovable}
PERPLEXITY_API_KEY = {clé Perplexity Ask-It globale}
```

**Important pour `DASHBOARD_WEBHOOK_SECRET`** : génère une chaîne aléatoire forte avec une commande comme :
```bash
openssl rand -base64 32
```
ou un générateur en ligne. **Note bien cette valeur**, elle sera réutilisée à l'étape 7 côté diagnostic.

### Validation

Tous les secrets sont visibles dans la liste avec leur date de création. Aucun n'est marqué "missing".

---

## Étape 5 — Mise à jour `client_supabase_url` dans le portail

### Action

Récupérer l'URL Supabase du nouveau projet noté à l'étape 1 (format `https://xxxxx.supabase.co`).

Retourner sur `https://app.ask-it.ai/admin/clients/{id-de-l-org}` → éditer la fiche → renseigner `client_supabase_url` avec cette URL → sauvegarder.

### Pourquoi cette étape

C'est ce qui permet au portail admin de communiquer avec le dashboard du client : récupérer les stats d'usage (`get-usage-stats`), envoyer les notifications de quota, etc.

### Validation

La fiche org dans le portail affiche maintenant l'URL Supabase. Le portail peut maintenant appeler les Edge Functions du dashboard.

---

## Étape 6 — Configuration de `tenant_config`

### Action

Dans le projet Supabase du nouveau dashboard, ouvrir le SQL Editor et exécuter cette requête (à adapter avec les vraies valeurs du client) :

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
  integrations_enabled,
  persona_detection_params
) VALUES (
  'baubo',  -- Nom court (slug) du client, sans espaces ni accents
  'Baûbo',  -- Nom d'affichage exact (avec accents et casse)
  'Bienveillant, expert et libérateur. Ton inclusif et déculpabilisant qui parle des sujets intimes féminins sans tabou ni jargon médical excessif. Vocabulaire moderne et empowering.',
  'Marque française de soins intimes féminins naturels et inclusifs. Positionnement premium éco-responsable. Engagée pour briser les tabous autour de l''intimité féminine.',
  'Femmes 25-50 ans soucieuses de santé intime et de naturalité',
  'soin intime féminin',
  'EUR',
  'fr-FR',
  'Europe/Paris',
  'https://baubo.ask-it.ai',
  'https://baubo.com/diagnostic',
  -- client_context_json : objet enrichi pour le pipeline Marketing IA
  '{
    "brand": "Baûbo",
    "description": "Marque française de soins intimes féminins naturels et inclusifs",
    "tone": "Bienveillant, expert et libérateur",
    "products": [
      { "name": "Mon nettoyant doux", "type": "nettoyant intime", "price": 22 },
      { "name": "Mon huile rituel", "type": "huile intime", "price": 28 }
    ],
    "channels": ["Meta Ads", "Email", "Pinterest", "Site Shopify"],
    "promoCode": "BAUBO10",
    "shopify_url": "baubo.com"
  }'::jsonb,
  -- integrations_enabled : on active uniquement ce qui est configuré pour ce client
  '{
    "shopify": false,
    "klaviyo": false,
    "ga4": false,
    "meta_pixel": false
  }'::jsonb,
  -- persona_detection_params : valeurs par défaut, ajuster si nécessaire
  '{
    "min_cluster_size": 30,
    "min_split_size": 20,
    "max_persona_size": 80,
    "weak_score_threshold": 75,
    "min_sessions_to_keep_after_30_days": 15
  }'::jsonb
);
```

### Comment remplir les champs `brand_*`, `target_audience`, `industry`

Ces informations doivent venir de **l'appel kickoff avec le client**. Si tu n'as pas tous les éléments, fais une visite rapide du site du client (home page + about + 2-3 pages produits) pour compléter.

**Méthode recommandée** : prends 15 minutes pour rédiger ces champs avec soin. Ils impactent directement la qualité de tous les contenus générés par Aski et le pipeline Marketing IA. Un `brand_tone` mal défini = des recommandations marketing à côté de la plaque.

**Note pour plus tard** : une Edge Function `extract-brand-context` pourra automatiser ce remplissage en scrapant le site du client et en extrayant ces infos via Claude. Pas dans le scope v1, voir section "Next step automatisation" ci-dessous.

### Validation

Exécuter `SELECT * FROM tenant_config;` doit retourner exactement 1 ligne avec toutes les colonnes remplies.

---

## Étape 7 — Connexion diagnostic ↔ dashboard

> **Étape critique souvent oubliée.** Sans cette étape, les sessions du diagnostic n'arriveront jamais dans le dashboard.

### Contexte

Le diagnostic du client est un **projet Lovable séparé** (avec son propre repo GitHub, son propre Supabase). Il a une Edge Function `send-diagnostic-data` qui envoie un webhook au dashboard à chaque action utilisateur (création de session, mise à jour, complétion finale).

Pour que le webhook arrive au bon dashboard, le diagnostic doit connaître :
1. L'URL exacte du Supabase du dashboard
2. Le secret partagé pour signer le webhook (`DASHBOARD_WEBHOOK_SECRET`)

### Action

Aller dans le **projet Lovable du diagnostic du client** (pas le dashboard) → Supabase → Edge Functions → Secrets.

### Secrets à configurer côté diagnostic

```
DASHBOARD_WEBHOOK_URL = https://{xxxxx}.supabase.co/functions/v1/diagnostic-webhook
                         (URL Supabase du DASHBOARD, pas du diagnostic)
DASHBOARD_WEBHOOK_SECRET = {même valeur que celle générée à l'étape 4}
MONITORING_API_KEY = {clé monitoring diagnostic, générée depuis le portail admin de la même org}
ORGANIZATION_ID = {même UUID qu'à l'étape 4}
USAGE_STATS_API_KEY = askit-usage-stats-2026
```

### Génération de la clé monitoring diagnostic

Si tu n'as pas généré la clé monitoring diagnostic à l'étape 3, retourne dans le portail admin → fiche org → section Monitoring → bouton "Générer pour diagnostic". Note la clé `mk_...` retournée.

### Validation rapide

Lancer le diagnostic du client une fois en mode test (juste les premières étapes), puis vérifier dans le Supabase du dashboard :
```sql
SELECT id, session_code, status, created_at
FROM diagnostic_sessions
ORDER BY created_at DESC
LIMIT 5;
```
Tu dois voir la session de test apparaître. Si oui : connexion diagnostic ↔ dashboard validée.

Si la session n'apparaît pas, vérifier dans les logs Supabase de l'Edge Function `diagnostic-webhook` côté dashboard pour identifier l'erreur (mauvaise URL, signature invalide, etc.).

> **Documentation de référence** : le format exact du payload JSON attendu par `diagnostic-webhook`, les headers requis, les codes d'erreur possibles et les instructions techniques complètes pour brancher un nouveau diagnostic sont documentés dans le fichier `WEBHOOK_CONTRACT.md` à la racine du repo `dashboard-template-askit`. Consulte-le si tu as un doute sur le format attendu ou si tu veux comprendre pourquoi un webhook est rejeté.

---

## Étape 8 — Configuration des intégrations externes optionnelles

À faire **uniquement pour les intégrations que le client utilise**. Sinon, sauter cette étape.

### 8.1 Shopify (si applicable)

> **Procédure validée sur l'onboarding Dermeden (juin 2026).** Depuis janvier 2026, Shopify a supprimé la création de custom apps depuis l'admin. Il faut passer par le **Dev Dashboard** (Shopify Partners) + **Custom Distribution** + **OAuth Authorization Code** pour obtenir un token Admin API.

#### Étape 1 — Obtenir l'accès collaborateur

Demander au client d'envoyer un **collaborator access request** depuis son admin Shopify :
- Shopify Admin → Settings → Users and permissions → Collaborators → "Add collaborator"
- Le client colle ton ID Shopify Partners

#### Étape 2 — Créer l'app dans le Dev Dashboard

1. Aller sur **partners.shopify.com** → Apps → **Create app**
2. Nommer l'app `AskIt Dashboard {client}`
3. Dans **Configuration → Admin API scopes**, activer tous ces scopes (mettre large pour ne pas avoir à recréer une version plus tard) :
   - `read_orders`, `read_products`, `read_customers`, `read_inventory`
   - `read_price_rules`, `read_discounts`, `read_analytics`, `read_reports`
   - `read_shipping`, `read_checkouts`, `read_marketing_events`
   - `read_product_listings`, `read_collection_listings`
   - `read_fulfillments`, `read_locales`, `read_content`
4. Dans **Storefront API scopes**, activer :
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_read_product_tags`
   - `unauthenticated_read_collection_listings`
   - `unauthenticated_read_content`
   - `unauthenticated_read_checkouts`
5. Dans **Distribution**, sélectionner **"Custom distribution"**
6. **Créer une version** (Versions → Create Version)
7. **Générer un lien d'installation** pour le store du client
8. **Installer l'app** sur le store via ce lien
9. Noter le **Client ID** et le **Client Secret** (`shpss_...`) depuis les settings de l'app

> **⚠️ Important** : le flow `client_credentials` (échange direct client_id/secret contre un token) ne fonctionne PAS pour les collaborateurs. Il faut utiliser le flow OAuth Authorization Code ci-dessous.

#### Étape 3 — Obtenir le token Admin API via OAuth Authorization Code

1. Construire cette URL (remplacer `{client_id}` et `{store}`) :
   ```
   https://{store}.myshopify.com/admin/oauth/authorize?client_id={client_id}&scope=read_orders,read_products,read_customers,read_inventory,read_price_rules,read_discounts,read_analytics,read_reports,read_shipping,read_checkouts,read_marketing_events,read_product_listings,read_collection_listings,read_fulfillments,read_locales,read_content&redirect_uri=https://example.com/callback
   ```
2. **Ouvrir cette URL dans un navigateur** → Shopify affiche la page d'autorisation → cliquer Install/Update
3. Le navigateur redirige vers `https://example.com/callback?code=XXXXXX&shop=...` → **la page affiche une erreur (normal)** → copier le `code` depuis la barre d'adresse
4. Échanger le code contre un token permanent :
   ```bash
   curl -s -X POST "https://{store}.myshopify.com/admin/oauth/access_token" \
     -H "Content-Type: application/json" \
     -d '{"client_id":"{client_id}","client_secret":"{client_secret}","code":"{code}"}'
   ```
5. La réponse contient `access_token` (format `shpca_...`) → **le noter immédiatement**

> **Ce token est permanent** (contrairement au flow client_credentials qui expire en 24h). Il ne sera plus affiché.

#### Étape 4 — Créer le webhook `orders/paid`

1. Dans l'admin Shopify du client → **Settings → Notifications → Webhooks**
2. Cliquer **"Create webhook"**
3. Configurer :
   - **Event** : `Order payment` (orders/paid)
   - **Format** : JSON
   - **URL** : `https://{project_ref}.supabase.co/functions/v1/shopify-order-webhook`
   - **API version** : la plus récente
4. **Copier le Webhook signing secret** (affiché en bas de la page webhooks après création)

#### Étape 5 — Configurer les secrets Supabase

Pousser les secrets via l'API Supabase Management :
```bash
SUPABASE_ACCESS_TOKEN="{ton_token}" && PROJECT_REF="{project_ref}" && \
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '[
    {"name":"SHOPIFY_ACCESS_TOKEN","value":"{shpca_token}"},
    {"name":"SHOPIFY_ADMIN_ACCESS_TOKEN","value":"{shpca_token}"},
    {"name":"SHOPIFY_WEBHOOK_SECRET","value":"{webhook_signing_secret}"}
  ]'
```

> **Note** : `SHOPIFY_STOREFRONT_ACCESS_TOKEN` n'est plus nécessaire séparément. La fonction `sync-shopify-products` utilise le token Admin API (`SHOPIFY_ACCESS_TOKEN`) via l'Admin REST API, plus fiable que le Storefront GraphQL avec les nouveaux tokens `shpca_`.

#### Étape 6 — Mettre à jour `tenant_config`

```sql
UPDATE tenant_config
SET
  shopify_store_domain = '{store}.myshopify.com',
  integrations_enabled = jsonb_set(integrations_enabled, '{shopify}', 'true'::jsonb)
WHERE project_id = '{client}';
```

#### Étape 7 — Premier sync produits

```bash
curl -s -X POST "https://{project_ref}.supabase.co/functions/v1/sync-shopify-products" \
  -H "Authorization: Bearer {service_role_key}" \
  -H "Content-Type: application/json"
```

Vérifier que la réponse contient `"synced": N` avec N > 0 et `"errors": 0`.

#### Étape 8 — Backfill des commandes historiques (30 jours)

Le webhook ne capture que les **nouvelles commandes**. Pour avoir l'historique dans le dashboard, faire un backfill via un script Python :

```python
import json, urllib.request, ssl

SHOPIFY_STORE = "{store}.myshopify.com"
SHOPIFY_TOKEN = "{shpca_token}"
SUPABASE_URL = "https://{project_ref}.supabase.co"
SERVICE_KEY = "{service_role_key}"
TENANT_ID = "{client}"

# Calculer la date de début (30 jours)
from datetime import datetime, timedelta
SINCE = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00Z")

ctx = ssl.create_default_context()

# Fetch toutes les commandes avec pagination
all_orders = []
next_url = f"https://{SHOPIFY_STORE}/admin/api/2024-01/orders.json?limit=250&status=any&created_at_min={SINCE}"
page = 0

while next_url and page < 20:
    page += 1
    req = urllib.request.Request(next_url, headers={"X-Shopify-Access-Token": SHOPIFY_TOKEN})
    resp = urllib.request.urlopen(req, context=ctx)
    data = json.loads(resp.read())
    orders = data.get("orders", [])
    all_orders.extend(orders)
    print(f"Page {page}: {len(orders)} commandes (total: {len(all_orders)})")
    link_header = resp.headers.get("Link", "")
    next_url = None
    if 'rel="next"' in link_header:
        for part in link_header.split(","):
            if 'rel="next"' in part:
                next_url = part.split("<")[1].split(">")[0]

# Préparer les lignes pour upsert
rows = []
for o in all_orders:
    email = (o.get("email") or "").lower() or None
    products = " | ".join([item["title"] for item in o.get("line_items", [])])
    rows.append({
        "tenant_id": TENANT_ID,
        "external_order_id": str(o["id"]),
        "source_provider": "shopify",
        "order_number": o.get("name") or str(o.get("order_number", "")),
        "total_price": float(o.get("total_price", 0)),
        "currency": o.get("currency", "EUR"),
        "created_at": o["created_at"],
        "is_from_diagnostic": False,
        "customer_email": email,
        "validated_products": products,
        "raw_payload": o,
    })

# Upsert par batch de 50
for i in range(0, len(rows), 50):
    batch = rows[i:i+50]
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/client_orders",
        data=json.dumps(batch).encode("utf-8"),
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        method="POST"
    )
    urllib.request.urlopen(req, context=ctx)
    print(f"  Batch {i//50+1}: {len(batch)} upserted")

print(f"Done: {len(rows)} commandes importées")
```

#### Étape 9 — Matching rétroactif diagnostic ↔ commandes

Après le backfill, croiser les sessions diagnostic terminées avec les commandes par email (fenêtre de 5 jours) et marquer les conversions :

```bash
# Identifier les conversions manuellement via SQL dans Supabase SQL Editor :
SELECT ds.id, ds.session_code, ds.email, ds.created_at AS diag_date,
       co.order_number, co.total_price, co.created_at AS order_date,
       co.validated_products
FROM diagnostic_sessions ds
JOIN client_orders co ON co.customer_email = ds.email
WHERE ds.status = 'termine'
  AND ds.conversion = false
  AND co.created_at >= ds.created_at
  AND co.created_at <= ds.created_at + INTERVAL '5 days'
ORDER BY ds.created_at;

-- Pour chaque match trouvé, mettre à jour la session :
UPDATE diagnostic_sessions
SET conversion = true,
    exit_type = 'converted',
    validated_cart_amount = {montant},
    validated_products = '{produits}',
    shopify_order_id = '{order_id}'
WHERE id = '{session_id}';

-- Et marquer la commande comme venant du diagnostic :
UPDATE client_orders
SET is_from_diagnostic = true
WHERE external_order_id = '{order_id}' AND tenant_id = '{client}';
```

#### Étape 10 — Vérification

Tester le webhook en passant une commande test (ou attendre une commande réelle) :
1. Vérifier dans `client_orders` que la commande apparaît avec `is_from_diagnostic = true/false`
2. Si l'email correspond à une session diagnostic récente → vérifier que `diagnostic_sessions.conversion = true`
3. Vérifier dans le dashboard → onglet Business que le CA et le panier moyen remontent

#### Mécanisme de matching des conversions

Le webhook `shopify-order-webhook` utilise une **double stratégie de matching** :

1. **Match direct par `_diag_session`** (prioritaire) : cherche un champ `_diag_session` dans les `line_items[].properties` ou `note_attributes` de la commande Shopify. Ce champ contient le `session_code` du diagnostic et permet un match exact.

2. **Fallback par email** (5 jours) : si pas de `_diag_session`, cherche une session diagnostic terminée (`status = termine`, `conversion = false`) avec le même email dans les 5 derniers jours.

**Protection anti-doublon (Stratégie C+)** : une session déjà convertie n'est jamais ré-écrasée par un second webhook.

#### Données remontées dans le dashboard via ShopifyQL

La Edge Function `ga4-analytics` interroge Shopify via ShopifyQL (API GraphQL `unstable`) pour obtenir :
- **Sessions site** : nombre total de sessions sur le store
- **Taux de conversion site** : directement calculé par Shopify (sessions → achat)
- **AOV site** : panier moyen basé sur les ventes nettes (après remises/retours, hors taxes/livraison)
- **Taux de rebond** : pourcentage de sessions sans interaction

Ces métriques sont utilisées comme base de comparaison ("vs sans diagnostic") dans le dashboard.

### 9.2 Klaviyo (si applicable)

Récupérer côté Klaviyo :
1. La clé API Klaviyo (Klaviyo Admin → Settings → API Keys → Create API Key avec accès profiles + lists)
2. L'ID de la liste d'abonnement principale (Klaviyo Admin → Lists → choisir la liste → URL contient l'ID)

### Secrets Klaviyo

```
KLAVIYO_API_KEY = {clé API}
```

### Mise à jour `tenant_config` pour Klaviyo

```sql
UPDATE tenant_config
SET
  klaviyo_list_id = 'TExMiq',  -- l'ID de la liste
  integrations_enabled = jsonb_set(integrations_enabled, '{klaviyo}', 'true'::jsonb)
WHERE project_id = '{client}';
```

### 9.3 Google Analytics 4 (si applicable)

Côté Google Cloud Platform :
1. Créer un service account dans le projet GCP du client
2. Lui donner accès au property GA4 (Property → Property Access Management → ajouter l'email du service account avec rôle "Viewer")
3. Générer une clé JSON pour le service account et la télécharger
4. Récupérer le Property ID GA4

### Secrets GA4

```
GA4_PROPERTY_ID = {property ID, format: 123456789}
GA4_SERVICE_ACCOUNT_EMAIL = {email du service account}
GA4_SERVICE_ACCOUNT_PRIVATE_KEY = {private_key extraite du JSON, attention au formatage des \n}
```

### Mise à jour `tenant_config` pour GA4

```sql
UPDATE tenant_config
SET
  ga4_landing_path = '/diagnostic',  -- chemin URL de la landing page diagnostic du client
  integrations_enabled = jsonb_set(integrations_enabled, '{ga4}', 'true'::jsonb)
WHERE project_id = '{client}';
```

### 9.4 Meta Pixel (si applicable)

Récupérer le Pixel ID du client (Meta Business Manager → Events Manager).

### Mise à jour `tenant_config` pour Meta Pixel

```sql
UPDATE tenant_config
SET
  meta_pixel_id = '{pixel_id}',
  integrations_enabled = jsonb_set(integrations_enabled, '{meta_pixel}', 'true'::jsonb)
WHERE project_id = '{client}';
```

---

## Étape 9 — Configuration du domaine custom

### Action

Dans Lovable, projet du dashboard du client → Settings → Domains → "Connect Domain" → entrer le sous-domaine choisi (ex: `baubo.ask-it.ai`).

### Configuration DNS

Côté DNS de `ask-it.ai` (probablement chez ton registrar OVH, Cloudflare, ou autre), ajouter :

```
Type:  A
Name:  baubo  (ou le sous-domaine choisi)
Value: 185.158.133.1
TTL:   3600
```

### Validation

Attendre la propagation DNS (~5-30 minutes). Une fois propagé, `https://baubo.ask-it.ai` doit afficher la page de blocage de l'AccessGate (logo Ask-It + message "Accès restreint, veuillez vous connecter via app.ask-it.ai").

---

## Étape 10 — Test end-to-end et validation

### Checklist de validation finale

À cocher avant de notifier le client que le dashboard est prêt :

**Diagnostic ↔ dashboard** :
- [ ] Lancer un diagnostic complet en mode test
- [ ] Vérifier que la session arrive dans `diagnostic_sessions` avec `status = 'termine'`
- [ ] Vérifier que les items arrivent dans `diagnostic_items` avec le bon `item_metadata`
- [ ] Vérifier que `persona_code = 'P0'` est attribué (pas de personas réels au démarrage)

**Dashboard frontend** :
- [ ] Aller sur `https://{client}.ask-it.ai` → AccessGate s'affiche
- [ ] Générer un token d'accès depuis le portail admin → URL avec `?access_token=`
- [ ] Vérifier que l'AccessGate valide le token et affiche le dashboard
- [ ] Vérifier que le header affiche bien "Dashboard {brand_name} — Plan {plan}"
- [ ] Vérifier que les 8 onglets sont accessibles (Vue d'ensemble, Personas, Diagnostic, Business, Funnel, Marketing IA, Aski, Réponses)
- [ ] Vérifier que l'onglet Diagnostic affiche bien la session de test

**Aski** :
- [ ] Aller dans l'onglet Aski → poser une question simple (ex: "Présente-toi")
- [ ] Vérifier qu'Aski répond avec le bon `brand_name` dans son message
- [ ] Vérifier dans `api_usage_logs` que l'appel est loggé avec le bon model et tokens
- [ ] Vérifier dans `aski_chats` que le chat est créé avec un titre généré

**Marketing IA** :
- [ ] Aller dans l'onglet Marketing IA → Vue d'ensemble
- [ ] Vérifier qu'aucune reco n'est encore présente (normal, on commence)
- [ ] Vérifier que le quota affiche `0 / {limite_du_plan}`
- [ ] Optionnel : déclencher manuellement `monthly-market-intelligence` pour pré-remplir la BDD intelligence

**Portail admin** :
- [ ] Aller sur `https://app.ask-it.ai/admin/clients/{id}` → vérifier que les stats du client apparaissent
- [ ] Vérifier que `cost_total` du mois en cours est > 0 (au moins 1 question Aski testée)
- [ ] Vérifier que la fiche org affiche bien les bons compteurs

**Intégrations (si applicables)** :
- [ ] Si Shopify : vérifier que `client_products` contient les produits, lancer une commande test → vérifier qu'elle remonte
- [ ] Si Klaviyo : compléter une session avec opt-in → vérifier que le profil est créé dans Klaviyo
- [ ] Si GA4 : vérifier que les sessions GA4 remontent dans l'onglet Business

### Inviter les utilisateurs du client

Une fois la validation OK, depuis le portail admin :
- Aller sur la fiche org du client
- Cliquer sur "Inviter un membre"
- Inviter chaque membre de l'équipe client (admin ou viewer selon les rôles)
- Ils reçoivent l'email d'invitation et complètent leur signup

### Notification au client

Envoyer un email (ou message Slack) au contact principal du client avec :
- Le lien vers son dashboard
- Une explication de comment se connecter (via `app.ask-it.ai/login`)
- Une vidéo Loom rapide de présentation des onglets si possible
- L'adresse de support pour toute question

---

## Récapitulatif chiffré

| Étape | Durée | Bloquante |
|-------|-------|-----------|
| 1. Repo GitHub | 5 min | ✅ |
| 2. Import Lovable + Supabase | 10 min | ✅ |
| 3. Org portail admin | 10 min | ✅ |
| 4. Clés monitoring | 5 min | ✅ |
| 5. Secrets Supabase | 15 min | ✅ |
| 6. URL Supabase dans portail | 2 min | ✅ |
| 7. `tenant_config` | 20 min | ✅ |
| 8. Connexion diagnostic | 15 min | ✅ |
| 9. Intégrations externes | 30-90 min | Si applicable |
| 10. Domaine custom | 15 min | ✅ |
| 11. Test end-to-end | 20 min | ✅ |
| **Total minimum** | **~2h** | |
| **Total avec intégrations** | **~3-4h** | |

---

# Next Step — Onboarding 1-clic depuis le portail admin

> **Vision** : remplacer la procédure manuelle des 10 étapes ci-dessus par un workflow automatisé déclenché depuis un seul formulaire dans le portail admin Ask-It.

## Objectif

Permettre à un membre de l'équipe Ask-It (toi ou un futur CSM) de créer un nouveau client en **15 minutes au lieu de 2-4 heures**, depuis une seule interface, sans manipuler de SQL, de secrets, ou de DNS manuellement.

## Workflow cible

1. Aller sur `https://app.ask-it.ai/admin/clients` → cliquer **"Onboard new client"** (au lieu de "Nouvelle organisation")
2. Remplir un formulaire unique avec toutes les infos client
3. Cliquer "Lancer l'onboarding"
4. Le portail orchestre toutes les étapes en background (5-10 minutes)
5. Le portail affiche le statut en temps réel : "Étape 2/10 — Création du repo GitHub..."
6. À la fin : récap avec liens vers le dashboard, le Supabase, le repo GitHub, et la checklist des actions manuelles restantes (intégrations externes qui nécessitent des accès tiers)

## Composants à construire

### 1. Edge Function `provision-new-client` côté portail admin

Une grosse Edge Function qui orchestre toute la séquence. Reçoit en POST le payload complet du formulaire et exécute :

**Phase 1 — Création des ressources Ask-It** :
- INSERT dans `organizations` (table portail) avec toutes les infos
- Génération automatique des 2 clés monitoring (`mk_xxx`) + insert dans `monitoring_api_keys`
- Génération du `DASHBOARD_WEBHOOK_SECRET` aléatoire 32+ caractères
- Génération d'un slug unique `project_id` à partir du nom client

**Phase 2 — Création du repo GitHub via API** :
- Appel à GitHub API : `POST /repos/pierrechn26/dashboard-template-askit/generate` avec `{ owner: "pierrechn26", name: "tableau-{slug}" }`
- Cette route GitHub utilise nativement la fonctionnalité "Create from template"
- Récupération de l'URL du nouveau repo

**Phase 3 — Création du projet Lovable via API** :
- ⚠️ **Limitation actuelle** : Lovable n'a pas d'API publique pour créer des projets depuis un repo. Pour cette phase, il faudra soit :
  - Option A : attendre que Lovable expose une API officielle
  - Option B : utiliser un workflow GitHub Actions qui détecte la création du repo et déclenche l'import via webhook Lovable (à confirmer s'ils ont ça)
  - Option C : laisser cette étape manuelle (1 clic dans Lovable) et automatiser tout le reste autour
- **Recommandation pour la v1 de l'automatisation** : Option C, on accepte un seul clic manuel "Importer dans Lovable" qui prend 1 minute, et on automatise tout le reste

**Phase 4 — Configuration Supabase via API** :
- Une fois le projet Lovable créé (manuellement ou via webhook), récupérer l'URL Supabase
- Appel à l'API Supabase Management pour configurer les secrets via API : `POST /v1/projects/{ref}/secrets`
- Pousse les 7 secrets obligatoires en une fois

**Phase 5 — Création de `tenant_config`** :
- Appel à l'API REST Supabase du nouveau projet pour insérer la ligne `tenant_config`
- Si les infos `brand_tone`, `brand_description`, etc. sont vides, déclencher l'Edge Function `extract-brand-context` (voir ci-dessous)

**Phase 6 — Configuration DNS via API du registrar** :
- Si tu utilises Cloudflare, OVH, Namecheap, ou autre : la plupart ont des APIs pour créer des records DNS
- Création automatique du record A pour `{slug}.ask-it.ai` → `185.158.133.1`

**Phase 7 — Notification** :
- Email automatique à toi avec le récap : URLs, IDs, statut de chaque phase
- Si tout OK : email automatique au client avec ses credentials et le lien dashboard

### 2. Edge Function `extract-brand-context` (auto-fill `tenant_config`)

> **Emplacement architectural important** : cette Edge Function vit **côté portail admin Ask-It** (projet Lovable `premium-persona-pulse`), **PAS côté template dashboard**. Le template dashboard n'embarque aucune fonction `extract-brand-context` — ce serait une duplication inutile puisque la fonction tourne une seule fois à l'onboarding, jamais en continu par le dashboard client. Elle est centralisée au portail admin pour un seul endroit à maintenir, une seule clé Anthropic à payer, et une évolution facilitée sans toucher aux dashboards clients.

**Chantier séparé** : la construction de cette fonction sera traitée dans un chantier dédié (probablement nouveau chat) **après** la finalisation de la transformation du template dashboard. En attendant, l'étape 6 de la checklist d'onboarding reste manuelle (remplissage à partir d'une visite du site client, ~15-20 minutes).

Pour automatiser l'étape 6 manuelle (rédaction de `brand_tone`, `target_audience`, etc.) :

**Inputs** :
- URL du site du client
- Optionnel : transcript de l'appel kickoff (si disponible)

**Logique** :
1. Scrape la home page du client + about page + 2-3 pages produits via une lib HTTP (ou une fonction de scraping)
2. Nettoie le HTML pour ne garder que le texte pertinent
3. Envoie le texte à Claude Sonnet 4.6 avec un prompt structuré :
   ```
   Tu reçois le contenu textuel de plusieurs pages du site web d'une marque e-commerce.
   Extrais les informations suivantes au format JSON strict :
   - brand_name : nom officiel
   - brand_description : 2 phrases décrivant le positionnement
   - brand_tone : 3-5 adjectifs caractérisant le ton éditorial perçu
   - target_audience : description courte de la cible démographique inférée
   - industry : secteur d'activité
   - products_inferred : 5 produits principaux avec nom et fourchette de prix si visible
   - channels_observed : canaux marketing visibles (Insta, Pinterest, Newsletter, etc.)
   - tagline_or_promise : la promesse principale
   - claims_principaux : 3-5 claims/allégations marketing
   ```
4. Retourne le JSON à `provision-new-client` qui l'utilise pour pré-remplir `tenant_config`

**Validation humaine** : la sortie est pré-remplie mais **toujours soumise à validation** dans le portail admin avant d'être insérée définitivement. C'est un brouillon, pas une vérité automatique.

### 3. Composant frontend `ClientOnboardingWizard.tsx` côté portail admin

Une page admin avec un formulaire en plusieurs étapes :

**Step 1 — Infos client** :
- Nom de la marque, slug, secteur, plan choisi
- URL du site (utilisée par `extract-brand-context`)
- URL du diagnostic (si déjà en ligne)
- Bouton "Auto-fill from website" → déclenche `extract-brand-context` et pré-remplit les champs suivants

**Step 2 — Brand context (validation/édition)** :
- Affiche les champs `brand_name`, `brand_tone`, `brand_description`, `target_audience`, `industry` pré-remplis
- Permet de modifier librement
- Le membre de l'équipe valide ou ajuste

**Step 3 — Intégrations** :
- Cases à cocher : Shopify, Klaviyo, GA4, Meta Pixel
- Si coché : champs pour saisir les credentials respectives (ou marquer "configurer plus tard")

**Step 4 — Domaine custom** :
- Sous-domaine choisi (ex: `baubo`)
- Validation automatique de disponibilité

**Step 5 — Récap et lancement** :
- Récap complet de toutes les infos
- Bouton "Lancer l'onboarding" qui POST vers `provision-new-client`
- Affichage en temps réel du statut de chaque phase

### 4. Page de monitoring de l'onboarding

Une fois lancé, l'utilisateur voit une page qui affiche en temps réel :
```
Onboarding de Baûbo en cours...

✅ Phase 1/7 — Création de l'org Ask-It (12s)
✅ Phase 2/7 — Création du repo GitHub (8s)
⏳ Phase 3/7 — Provisionnement Supabase via Lovable... (en cours, ~2 min)
⬜ Phase 4/7 — Configuration des secrets
⬜ Phase 5/7 — Configuration tenant_config
⬜ Phase 6/7 — DNS
⬜ Phase 7/7 — Notification
```

## Limitations à surmonter

### Limitation 1 — Pas d'API Lovable de création de projet

C'est le **plus gros obstacle** à un onboarding 100% automatisé. Solutions possibles :
1. **Demander à Lovable** s'ils ont ou prévoient une API. C'est en croissance rapide donc possible qu'ils en aient une bientôt.
2. **GitHub Actions + webhook Lovable** : si Lovable a un webhook qui se déclenche à la création de repo connecté, on peut automatiser via GitHub Actions
3. **Accepter un clic manuel** : phase 3 reste manuelle, phases 1-2 et 4-7 sont automatisées. Réduit déjà le temps de 2h à ~30 min.

### Limitation 2 — API Supabase Management

Supabase a une API Management pour configurer les secrets, mais elle nécessite un Personal Access Token Supabase. Faisable mais demande de stocker ce token côté portail admin.

### Limitation 3 — API DNS

Dépend du registrar. Si Cloudflare, parfait (API très propre). Si OVH ou autre, possible mais demande un peu plus de configuration.

### Limitation 4 — Validation humaine indispensable

L'`extract-brand-context` n'est pas magique. Il faut toujours qu'un humain valide les champs avant de les inscrire en BDD. Sinon, des dashboards avec des descriptions de marque hallucinées vont sortir en production.

## Effort de construction estimé

| Composant | Effort |
|-----------|--------|
| Edge Function `provision-new-client` | 3-5 jours |
| Edge Function `extract-brand-context` | 1-2 jours |
| Composant `ClientOnboardingWizard.tsx` | 2-3 jours |
| Page de monitoring | 1 jour |
| Intégration GitHub API | 0.5 jour |
| Intégration Supabase Management API | 1 jour |
| Intégration Cloudflare/OVH DNS API | 1 jour |
| Tests end-to-end + corrections | 2 jours |
| **Total** | **~12-15 jours** de dev concentré |

## Quand le construire

**Ma recommandation** : pas tout de suite. Construis-le quand tu auras **au moins 5 clients onboardés manuellement**. Pourquoi ?
- Tu auras une vraie expérience de la friction et tu sauras quoi automatiser en priorité
- Tu auras déjà testé et stabilisé la procédure manuelle
- L'investissement de 12-15 jours sera rentabilisé à partir du 8-10ème client
- Avant 5 clients, le ROI est négatif (la procédure manuelle reste plus rapide à finaliser que de coder l'automatisation)

**Objectif intermédiaire** : à 3-5 clients, automatise déjà les **briques unitaires les plus pénibles** :
- L'`extract-brand-context` (gain : 15 min par client)
- Une fonction qui génère le bloc SQL `INSERT INTO tenant_config` à partir d'un formulaire
- Un script qui pousse les secrets Supabase via Management API en un appel

Ces briques peuvent être assemblées progressivement avant de construire l'orchestrateur complet.

---

## Conclusion

Ce document est ta procédure opérationnelle de référence. À chaque nouveau client, tu suis les 10 étapes dans l'ordre. Au fil du temps, tu identifieras les points de friction réels et tu sauras exactement quoi automatiser en priorité.

L'objectif final : passer de "2 heures par client" à "15 minutes par client" via le système d'onboarding 1-clic décrit dans la section "Next Step".

---

*Document généré le 14 avril 2026 — version 1.0*
*À mettre à jour après chaque onboarding pour capturer les apprentissages.*
