# RUNBOOK_ONBOARDING_CLIENT

> **Procédure opérationnelle pour onboarder un nouveau client Ask-it**
>
> Ce runbook documente toutes les étapes chronologiques pour onboarder un nouveau client de bout-en-bout : du kick-off commercial à la mise en production publique du diagnostic. Il est conçu pour être suivi linéairement, phase par phase.
>
> **Pré-requis** : le template `dashboard-template-askit` doit être à jour des corrections du `TEMPLATE_CORRECTIONS_BACKLOG.md`.
>
> **Version** : 1.0
> **Date de référence** : 27 avril 2026
> **Tenant de référence** : Cottan

---

## Vue d'ensemble — Checklist synthétique

### Phase 0 — Pré-onboarding
- [ ] Validation commerciale (pricing, contrat signé, plan choisi)
- [ ] Création de l'organisation côté portail Ask-it
- [ ] Demande des accès Shopify Partners (collaborator)
- [ ] Programmation du kick-off call

### Phase 1 — Kick-off call client
- [ ] Validation des infos brand (nom, industrie, tone, cible)
- [ ] Validation des intégrations utilisées (Klaviyo / Omnisend / autre)
- [ ] Identification du contact technique côté client
- [ ] Programmation des étapes suivantes

### Phase 2 — Création des projets Lovable
- [ ] Projet **Diagnostic** créé via remix du template diagnostic
- [ ] Projet **Dashboard** créé via remix du template dashboard
- [ ] Domaines configurés (`<client>-diag.ask-it.ai` + `<client>.ask-it.ai`)

### Phase 3 — Configuration des secrets
- [ ] Secrets fixes Ask-it ajoutés (PORTAL_URL, MONITORING_API_KEY, etc.)
- [ ] Secrets client ajoutés (ORGANIZATION_ID, SHOPIFY_WEBHOOK_SECRET)
- [ ] Clés API LLM par-client ajoutées (Anthropic, Gemini, Perplexity)

### Phase 4 — Configuration tenant_config
- [ ] Insertion ligne `tenant_config` avec brand, industry, target_audience
- [ ] Configuration `integrations_enabled` (Klaviyo / Omnisend / autre)
- [ ] Configuration `website_url`
- [ ] Configuration `persona_dimension_mapping` selon le diagnostic
- [ ] Premier scrape commercial facts manuel et validation

### Phase 5 — Configuration Shopify
- [ ] Création app Custom Shopify (Ask-it x `<Client>` Dashboard)
- [ ] Scopes activés : `read_customers`, `read_orders`, `read_products`
- [ ] Webhook `orders/paid` configuré pointant vers `shopify-order-webhook`
- [ ] Test webhook avec une commande de test

### Phase 6 — Configuration intégration email
- [ ] Sync persona vers Klaviyo / Omnisend testée
- [ ] Templates email de relance configurés côté client
- [ ] Test d'envoi email

### Phase 7 — Tests bout-en-bout
- [ ] Diagnostic complet + tracking session OK
- [ ] Webhook Shopify (commande test) OK
- [ ] Aski répond correctement (avec bon provider email)
- [ ] KPIs structure OK (vides mais affichés)
- [ ] Recommandations marketing générables

### Phase 8 — Mise en prod
- [ ] Activation publique du diagnostic sur le site marchand
- [ ] Page Notion client partagée
- [ ] Login dashboard fourni au client (avec `client_admin` role)
- [ ] Programmation revue J+15

---

## Phase 0 — Pré-onboarding

### 0.1 Validation commerciale

Avant tout démarrage technique, s'assurer que :

- [ ] Le contrat est signé
- [ ] Le plan tarifaire est validé : Starter (€129/mo), Growth (€199/mo), ou Scale (€489/mo)
- [ ] La fréquence est validée : mensuel ou annuel (-2 mois)
- [ ] Le setup fee one-time est facturé (selon plan)
- [ ] Le client connaît la durée du contrat (annuel généralement)

### 0.2 Création de l'organisation côté portail

Dans le portail admin Ask-it (`https://app.ask-it.ai`) :

1. Se connecter en `admin`
2. Créer une nouvelle organisation pour le client
3. Récupérer l'`ORGANIZATION_ID` (UUID) — sera utilisé comme secret côté dashboard
4. Configurer le plan + la fréquence côté portail
5. Créer le compte `client_admin` pour le contact principal client (sans envoyer l'invitation tout de suite)

### 0.3 Demande des accès Shopify

**Important** : ne pas demander au client de créer une app eux-mêmes. Toujours passer par Shopify Partners → demande de collaborator access.

Procédure :
1. Aller dans `partners.shopify.com` → Stores → Add store → **Request access to a store**
2. Renseigner le domaine du client (ex: `<client>.myshopify.com`)
3. Cocher les permissions nécessaires :
   - **Apps** (pour pouvoir créer l'app Custom)
   - **Settings** (pour configurer le webhook)
   - **Customers** (pour la lecture is_existing_client)
   - **Orders** (pour les commandes)
   - **Products** (pour le catalogue)
4. Envoyer la demande au client
5. Le client accepte depuis son admin Shopify → Settings → Users and permissions

**Anticiper** : cette étape peut prendre 1-3 jours selon la réactivité du client. Démarrer tôt.

### 0.4 Programmation du kick-off

- Programmer un call de 30-45 min avec le contact principal client
- Préparer le brief : revue contrat, infos brand, intégrations existantes
- Envoyer un calendar invite avec lien visio

---

## Phase 1 — Kick-off call client

### 1.1 Recueil des infos brand

À recueillir pendant le call (ou via un formulaire envoyé en amont) :

- **Nom de la marque** (utilisé partout : `brand_name`)
- **Industrie précise** : "dermo-cosmétique naturelle premium" est plus utile que "beauté"
- **Tone de la marque** : ex "savant, sensoriel, élégant" — utilisé par Aski et les recos
- **Target audience** : ex "Femmes 30-60 ans, naturalité + efficacité scientifique"
- **URL du site marchand** (pour le scrape commercial facts)
- **Codes promo récurrents** : DIAG10 ? Code de bienvenue ? Programme fidélité ?
- **Méthodes de paiement principales** (3x sans frais, etc.)

### 1.2 Validation des intégrations

Identifier ce que le client utilise déjà :

- **Email marketing** : Klaviyo, Omnisend, Mailchimp, Brevo, autre, ou rien ?
- **CRM** : présent ou non ?
- **Analytics** : GA4 actif ? Pixel Meta ? TikTok ?
- **Shopify** : confirmer qu'il s'agit de Shopify (le template suppose Shopify)

### 1.3 Identification du contact technique

- Qui implémente le snippet du diagnostic sur le site Shopify ?
  - Souvent : un dev freelance ou interne, ou un agence
- Récupérer son contact (email + WhatsApp/Slack si possible)
- Programmer un call technique de 15 min avec lui pour la phase 5 (intégration Shopify)

### 1.4 Validation des produits et catalogue

- Combien de produits dans le catalogue Shopify ?
- Y a-t-il des bundles déjà configurés ?
- Les `handles` Shopify sont-ils stables (vs les `variant_ids`) ?
- Quel est le panier moyen actuel ? (utile pour benchmark Aski)

### 1.5 Programmation des étapes suivantes

- Day 1 : configuration projets Lovable + secrets
- Day 2 : tests bout-en-bout
- Day 3 : intégration site marchand (call avec dev client)
- Day 4 : mise en prod publique
- J+15 : revue post-launch

---

## Phase 2 — Création des projets Lovable

### 2.1 Projet Diagnostic

1. Aller sur le projet template diagnostic (`dashboard-template-askit-diagnostic`)
2. Cloner le repo en local **en lecture seule** (référence)
3. Créer un blank project Lovable pour le client : `<client>-diagnostic`
4. Connecter au GitHub
5. Dans le repo Lovable : supprimer tout sauf `.git`
6. Copier les fichiers du template clone
7. Commit + push

### 2.2 Projet Dashboard

Même procédure que 2.1 mais à partir de `dashboard-template-askit` :
- Blank project : `<client>-dashboard`
- Suivre la procédure validée

### 2.3 Configuration des domaines

Dans Lovable, configurer les domaines :
- Diagnostic : `<client>-diag.ask-it.ai`
- Dashboard : `<client>.ask-it.ai`

Configuration DNS :
- Ajouter les enregistrements CNAME dans le DNS de `ask-it.ai`
- Vérifier la propagation (peut prendre quelques heures)

### 2.4 Vérification du build

Tester un build à blanc des 2 projets :
- Le projet diagnostic doit afficher la home page
- Le projet dashboard doit afficher la page de login
- Aucune erreur de compilation TypeScript

---

## Phase 3 — Configuration des secrets

### 3.1 Secrets auto-fournis (rien à faire)

Ces secrets sont automatiquement injectés par Lovable/Supabase :
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3.2 Secrets fixes Ask-it (mêmes valeurs pour tous les clients)

À configurer côté **Dashboard** :

```
PORTAL_URL=https://srzbcuhwrpkfhubbbeuw.supabase.co
MONITORING_API_KEY=<valeur fixe Ask-it>
USAGE_STATS_API_KEY=<valeur fixe Ask-it>
CORS_ALLOWED_ORIGINS=<liste séparée par virgules incluant le domaine client>
```

Pour `CORS_ALLOWED_ORIGINS`, inclure :
- `https://<client>.ask-it.ai`
- `https://<client>-diag.ask-it.ai`
- `https://<domaine_shopify_client>` (ex: `https://www.cottan.com`)
- `https://<client>.myshopify.com`

### 3.3 Secrets spécifiques au client

À configurer côté **Dashboard** :

```
ORGANIZATION_ID=<UUID récupéré dans la Phase 0.2>
SHOPIFY_WEBHOOK_SECRET=<HMAC du webhook orders/paid, voir Phase 5.3>
```

À configurer côté **Diagnostic** (si besoin) :

```
DIAGNOSTIC_WEBHOOK_SECRET=<HMAC pour valider les payloads diagnostic-webhook>
```

### 3.4 Clés API LLM par-client (isolation des coûts)

À configurer côté **Dashboard** :

```
ANTHROPIC_API_KEY=<clé API dédiée au client, créée sur console.anthropic.com>
GEMINI_API_KEY=<clé API dédiée au client>
PERPLEXITY_API_KEY=<clé API dédiée au client>
```

**Important** : créer des clés API distinctes par client pour pouvoir tracer les coûts par client dans les consoles respectives. Le tracking interne via `api_usage_logs` complète cette isolation.

### 3.5 Vérification finale des secrets

Lister les secrets côté Dashboard et confirmer la présence de :
- 3 secrets auto-fournis
- 4 secrets fixes Ask-it
- 2 secrets client (ORGANIZATION_ID, SHOPIFY_WEBHOOK_SECRET)
- 3 clés API LLM

**Total attendu : ~12 secrets côté Dashboard**

---

## Phase 4 — Configuration tenant_config

### 4.1 Insertion de la ligne tenant_config

Dans le **Dashboard** Supabase, exécuter :

```sql
INSERT INTO public.tenant_config (
  project_id,
  brand_name,
  industry,
  brand_tone,
  target_audience,
  currency,
  website_url,
  integrations_enabled,
  persona_dimension_mapping,
  min_cluster_size
) VALUES (
  '<client_code>',
  '<Nom de la marque>',
  '<Industrie précise>',
  '<Tone>',
  '<Description target>',
  'EUR',
  'https://www.<client>.com/',
  '{
    "shopify": true,
    "klaviyo": false,
    "omnisend": false,
    "mailchimp": false,
    "brevo": false
  }'::jsonb,
  '{
    "ageBracket": "age_bracket",
    "skinType": "skin_type",
    "...": "..."
  }'::jsonb,
  10
);
```

Adapter `integrations_enabled` selon ce que le client utilise (un seul email provider à `true`).

Adapter `persona_dimension_mapping` selon les questions du diagnostic du client (cf. ARCHITECTURE_DIAGNOSTIC_<CLIENT>.md).

### 4.2 Premier scrape commercial facts

Déclencher manuellement le scraper pour avoir une base de facts dès le démarrage :

```bash
curl -X POST https://<client>-dashboard.supabase.co/functions/v1/scrape-commercial-facts \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "<client_code>"}'
```

Vérifier les facts extraits :

```sql
SELECT category, fact_key, fact_value, confidence, source_url
FROM public.tenant_commercial_facts
WHERE tenant_id = '<client_code>'
ORDER BY category, fact_key;
```

**Attendu** : 20-30+ facts extraits avec confidence high. Si 0 facts ou des erreurs : vérifier que `website_url` pointe vers un site marchand standard avec pages policies accessibles.

### 4.3 Limites scraper documentées

À noter dans la page Notion client :
- Le scraper extrait les facts publics du site (pages policies, FAQ, CGV)
- Certaines infos affichées en JS (bandeaux dynamiques, widgets panier) ne sont pas captées
- C'est volontaire : zéro hallucination > info partielle
- Pour les valeurs critiques absentes, le LLM restera silencieux à leur sujet

### 4.4 Configuration cron scrape-commercial-facts (déjà programmé via template)

Vérifier que le cron pg_cron est bien actif :

```sql
SELECT * FROM cron.job WHERE jobname = 'scrape-commercial-facts-weekly';
```

Si absent, le programmer :

```sql
SELECT cron.schedule(
  'scrape-commercial-facts-weekly',
  '0 8 * * 1',
  $$ SELECT net.http_post(...) $$
);
```

---

## Phase 5 — Configuration Shopify

### 5.1 Création app Custom Shopify

Dans le Shopify admin du client (`https://admin.shopify.com/store/<client>`) :

1. Aller dans **Settings → Apps and sales channels → Develop apps**
2. **Create an app** → Nommer "Ask-it x `<Client>` - Dashboard"
3. **Configure Admin API scopes** → cocher :
   - `read_customers`
   - `read_orders`
   - `read_products`
   - `read_checkouts`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_read_product_listings`
4. **Save** puis **Install app**
5. Le **Admin API access token** s'affiche **UNE SEULE FOIS** → le copier immédiatement
6. Format attendu : `shpat_xxxxxxxxxxxx`

**Important** : sauvegarder ce token dans un gestionnaire de mots de passe sécurisé (1Password, Bitwarden). Si perdu, il faudra réinstaller l'app pour générer un nouveau token.

### 5.2 Stockage du token (optionnel pour MVP)

Si la version simple de K2 est utilisée (lecture locale `client_orders`), le token Admin API n'est pas requis dans les secrets immédiatement.

Il sera requis quand on migrera vers la version évoluée K2 (API Shopify Customers — voir backlog #6.3). À ce moment-là, ajouter dans les secrets Dashboard :

```
SHOPIFY_ADMIN_API_TOKEN=<shpat_xxxxx>
```

### 5.3 Configuration du webhook orders/paid

1. Dans Shopify admin → **Settings → Notifications → Webhooks**
2. **Create webhook** :
   - Event : `Order payment` (= `orders/paid`)
   - Format : JSON
   - URL : `https://<client>-dashboard.supabase.co/functions/v1/shopify-order-webhook`
   - Webhook API version : la plus récente
3. Après création, cliquer sur **Show key** pour révéler le `Shopify webhook signing secret`
4. Format : `shpss_xxxxxxxxxxxx`
5. Stocker cette valeur dans le secret `SHOPIFY_WEBHOOK_SECRET` côté Dashboard

**Important** : le `shpss_` est le secret de signature HMAC pour valider que les webhooks viennent bien de Shopify. Différent du `shpat_` (Admin API).

### 5.4 Test du webhook

Option 1 : faire une commande test (€1) sur le site marchand
Option 2 : utiliser l'option "Send test notification" de Shopify

Vérifier dans les logs Supabase :
- Le webhook reçoit le payload
- La signature HMAC est validée
- Si la commande matche un session_code → la session est marquée `conversion=true`

```sql
SELECT session_code, conversion, validated_cart_amount, shopify_order_id
FROM public.diagnostic_sessions
WHERE shopify_order_id = '<order_id_de_test>';
```

---

## Phase 6 — Configuration intégration email

### 6.1 Identification du provider

Selon ce qui a été validé en Phase 1.2 :
- **Klaviyo** → Phase 6.2.A
- **Omnisend** → Phase 6.2.B
- **Autre** (Mailchimp, Brevo) → adapter selon les helpers existants
- **Aucun** → skipper Phase 6, le KPI email sera désactivé

### 6.2.A Configuration Klaviyo

1. Récupérer la clé API Klaviyo du client (Account → API Keys → Create Private API Key avec scopes Lists, Profiles, Events)
2. Configurer le secret côté Dashboard : `KLAVIYO_API_KEY=<pk_xxxxxxx>`
3. Tester la sync avec le webhook `sync-klaviyo` :

```bash
curl -X POST https://<client>-dashboard.supabase.co/functions/v1/sync-klaviyo \
  -H "Authorization: Bearer <ANON_KEY>" \
  -d '{"session_code": "<session_test_code>"}'
```

4. Vérifier dans Klaviyo que le profil + l'event ont bien été créés

### 6.2.B Configuration Omnisend

1. Récupérer la clé API Omnisend du client (Account → API Keys → Create new key)
2. Configurer le secret côté Dashboard : `OMNISEND_API_KEY=<xxxxxxx>`
3. Tester la sync avec le webhook `sync-omnisend` (ou équivalent selon le template)
4. Vérifier dans Omnisend que le contact + l'event ont bien été créés

### 6.3 Validation tenant_config integrations_enabled

Confirmer que dans `tenant_config.integrations_enabled`, **un seul** email provider est à `true` :

```sql
SELECT integrations_enabled FROM public.tenant_config WHERE project_id = '<client_code>';
```

Si plusieurs sont `true`, le helper `getEmailProvider` prend le premier dans l'ordre Klaviyo → Omnisend → Mailchimp → Brevo. Mieux vaut être explicite.

### 6.4 Templates email côté client

Le client doit configurer ses propres templates de relance dans son outil email. Lui fournir un brief avec :
- Liste des `personas` détectées (P0 par défaut au démarrage)
- Variables disponibles dans les events Klaviyo/Omnisend
- Exemples de copy fournis par Ask-it

Ce point relève du brief CSM, pas du runbook technique.

---

## Phase 7 — Tests bout-en-bout

### 7.1 Test diagnostic + tracking session

1. Aller sur `https://<client>-diag.ask-it.ai/diagnostic`
2. Compléter un diagnostic complet (toutes les questions)
3. Vérifier en BDD que la session est créée :

```sql
SELECT session_code, status, exit_type, persona_code, recommended_products
FROM public.diagnostic_sessions
WHERE created_at >= NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 1;
```

**Attendu** :
- `status = 'termine'`
- `persona_code` non null (P0 par défaut)
- `recommended_products` peuplé avec une liste de handles

### 7.2 Test webhook Shopify (commande test)

1. Cliquer sur le CTA "Voir mon panier" depuis la page résultats
2. Vérifier que `checkout_started=true` est posé dans la session :

```sql
SELECT session_code, checkout_started, checkout_at
FROM public.diagnostic_sessions
WHERE session_code = '<session_test>';
```

3. Faire une commande test sur le site (€1 si possible avec un code promo de test)
4. Vérifier que le webhook a bien marqué la conversion :

```sql
SELECT session_code, conversion, exit_type, validated_cart_amount,
       validated_products, is_existing_client
FROM public.diagnostic_sessions
WHERE session_code = '<session_test>';
```

**Attendu** :
- `conversion = true`
- `exit_type = 'converted'`
- `validated_cart_amount` = montant payé
- `validated_products` = liste des handles achetés
- `is_existing_client` = false (nouveau client) ou true (existant)

### 7.3 Test Aski avec bon provider email

1. Se connecter au dashboard `<client>.ask-it.ai`
2. Ouvrir Aski (chat)
3. Poser une question relative à l'email marketing : "Comment je peux relancer mes abandonnistes par email ?"
4. Vérifier dans la réponse Aski :
   - **Klaviyo client** : Aski mentionne "Klaviyo"
   - **Omnisend client** : Aski mentionne "Omnisend"
   - **Pas de mention "Klaviyo"** dans les réponses Cottan/Omnisend (sinon bug template, voir backlog #2.6)

### 7.4 Vérification structure KPIs

Le dashboard doit s'afficher sans erreurs même avec 0 ou 1 conversion :

- **Vue d'ensemble** : KPIs CA, taux conversion, AOV affichés (peut être vide ou très bas)
- **Diagnostic** : graphiques étapes funnel affichés
- **Funnel** : étapes affichées (engagement, complétion, checkout, conversion)
- **Tableau de réponses** : sessions visibles
- **Personas** : P0 affiché (single persona au démarrage)

### 7.5 Test génération recommandation marketing

1. Onglet Marketing → Recommandations → Catégorie "ads"
2. Cliquer "Générer une recommandation"
3. Vérifier qu'une reco est créée et visible dans le dashboard
4. Vérifier que :
   - Le `brand_name` du client apparaît dans le contenu
   - Les commercial facts (livraison, retours) sont mentionnés correctement si pertinents
   - Aucune valeur hallucinée (seuils, codes promo, etc.)

### 7.6 Vérification logs et coûts

```sql
SELECT edge_function, api_provider, model, tokens_input, tokens_output, created_at
FROM public.api_usage_logs
WHERE created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**Attendu** : tokens correctement loggés (non-zéro) pour chaque appel LLM.

### 7.7 Vérification chaîne notification portail

Si le client active le diagnostic et qu'il atteint un seuil de quota (ex: 80% du quota mensuel) :

```sql
SELECT * FROM public.api_usage_logs
WHERE created_at >= NOW() - INTERVAL '5 minutes'
  AND quota_threshold_reached = true;
```

Vérifier dans le portail (`https://app.ask-it.ai/admin`) qu'une notification a bien été reçue. Cette chaîne sera testée naturellement avec l'usage réel, pas besoin de la forcer.

---

## Phase 8 — Mise en prod

### 8.1 Activation publique du diagnostic

1. Le contact technique du client intègre le snippet du diagnostic dans le thème Shopify
2. Position recommandée : sur la home page, après le hero, OU sur une page dédiée `/diagnostic`
3. Snippet à fournir au client :

```html
<iframe
  src="https://<client>-diag.ask-it.ai/diagnostic"
  style="width: 100%; height: 100%; border: 0;"
  loading="lazy"
></iframe>
<script src="https://<client>-diag.ask-it.ai/embed-bridge.js"></script>
```

(adapter selon le format réel du template diagnostic)

4. Tester le diagnostic intégré sur le site Shopify en preview avant publication
5. Publier la version Shopify

### 8.2 Page Notion client

Partager une page Notion client avec :
- URL de connexion au dashboard (`https://<client>.ask-it.ai`)
- Identifiants du compte `client_admin`
- Description des onglets du dashboard
- FAQ basique
- Comment contacter le support Ask-it

### 8.3 Login dashboard

1. Envoyer l'invitation email au compte `client_admin` créé en Phase 0.2
2. Vérifier que le client reçoit bien l'email
3. Le client active son compte et change son mot de passe
4. Confirmer qu'il accède bien au dashboard

### 8.4 Programmation revue J+15

Programmer un call de 30 min avec le client pour :
- Revoir les premiers chiffres (sessions, conversions, KPIs)
- Identifier les améliorations possibles (snippet placement, email templates, etc.)
- Confirmer la satisfaction et lever d'éventuels blocages

---

## Annexe — Checklist finale de validation

Avant de marquer un onboarding comme terminé, valider tous ces points :

### Technique
- [ ] Diagnostic accessible publiquement et fonctionne sur mobile + desktop
- [ ] Dashboard accessible avec login `client_admin`
- [ ] Webhook Shopify reçoit les commandes et marque les conversions
- [ ] Aski répond avec le bon provider email
- [ ] Au moins 1 commande test a fait 100% du parcours (diagnostic → checkout → webhook → KPIs)
- [ ] Recommandations marketing générables sans erreur
- [ ] Commercial facts scrapés et visibles en BDD
- [ ] Aucune erreur dans les logs Supabase sur les 24 dernières heures

### Configuration
- [ ] Tous les secrets configurés (~12 secrets côté Dashboard)
- [ ] `tenant_config` complet avec brand, industry, target_audience, integrations_enabled, website_url
- [ ] Cron `scrape-commercial-facts-weekly` actif
- [ ] DNS et certificats SSL propagés sur les 2 domaines

### Côté client
- [ ] Snippet diagnostic intégré au site Shopify
- [ ] Templates email de relance configurés
- [ ] Page Notion client partagée
- [ ] Login dashboard fonctionnel pour le client
- [ ] Revue J+15 programmée

### Côté Ask-it
- [ ] Organisation créée dans le portail avec plan + frequency configurés
- [ ] Stripe activé et 1ère facture envoyée selon le contrat
- [ ] Client ajouté au CRM Ask-it (stage "Onboarded")

---

## Annexe — FAQ "Que faire si..."

### Q1. Le webhook Shopify reçoit le payload mais la session n'est pas marquée comme convertie

**Diagnostic** :
1. Vérifier que la signature HMAC est validée (logs Supabase)
2. Vérifier que `session_code` est bien présent dans le payload Shopify :

```sql
SELECT raw_payload->'note_attributes'
FROM public.client_orders
WHERE external_order_id = '<order_id>';
```

3. Vérifier que la session avec ce `session_code` existe en BDD

**Solutions courantes** :
- Le snippet du diagnostic ne pose pas le `note_attribute` `session_code` dans le panier Shopify → corriger l'embed-bridge
- La session a expiré (durée de vie du cookie) → augmenter la durée

### Q2. Aski répond "Aski temporairement indisponible"

**Diagnostic** :
1. Vérifier les logs `aski-chat` dans Supabase
2. Si erreur SQL → vérifier que les colonnes lues existent (`grep` dans le code aski-chat)
3. Si erreur API → vérifier les clés Anthropic et Gemini

**Solutions courantes** :
- Référence à une colonne supprimée (ex: `trust_triggers_ordered`) → cf. backlog #2.13
- Quota dépassé sur Anthropic → vérifier le portail
- Timeout sur Gemini fallback → augmenter le timeout (110s actuellement)

### Q3. Le scraper commercial facts ne trouve aucune info

**Diagnostic** :
1. Vérifier que `tenant_config.website_url` est bien renseigné
2. Tester manuellement les pages policies du site (existent-elles ?)
3. Vérifier les logs `scrape-commercial-facts`

**Solutions courantes** :
- Pages policies cachées derrière un login → impossible de scraper, accepter la limite
- Site en SPA pure (React/Vue) sans HTML statique → scraper basique limité, voir backlog #6.6

### Q4. Le KPI "Routine complète" affiche 0%

**Diagnostic** :
1. Vérifier qu'il y a au moins 1 conversion en BDD
2. Vérifier que la commande Shopify a bien `raw_payload->'line_items'` peuplé :

```sql
SELECT external_order_id, jsonb_array_length(raw_payload->'line_items') AS nb_items
FROM public.client_orders
WHERE diagnostic_session_id IS NOT NULL;
```

3. Vérifier que le hook `useInsightsMetrics` lit bien `client_order_line_items_count` (cf. backlog #3.2)

### Q5. Le KPI "Nouveaux clients via diagnostic" affiche 0%

**Diagnostic** :
1. Vérifier que la colonne `is_existing_client` existe (cf. backlog #1.1)
2. Vérifier que le webhook Shopify l'a bien posée pour les conversions :

```sql
SELECT session_code, is_existing_client, conversion
FROM public.diagnostic_sessions
WHERE conversion = true;
```

3. Si toutes à NULL → la fonction `checkIsExistingClientLocal` n'a pas été déployée (cf. backlog #2.18)

### Q6. Les coûts API ne remontent pas dans le portail

**Diagnostic** :
1. Vérifier que `api_usage_logs` est bien peuplée :

```sql
SELECT edge_function, COUNT(*), SUM(tokens_input), SUM(tokens_output)
FROM public.api_usage_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY edge_function;
```

2. Si tokens à 0 sur `monthly-market-intelligence` → bug connu, voir backlog #2.16
3. Vérifier que le secret `USAGE_STATS_API_KEY` est bien configuré

### Q7. Une commande légitime a été ignorée par le webhook (skipped)

**Cas observé** : la session avait `conversion=true` à cause d'un test précédent.

**Solution** : modifier manuellement la session en SQL admin :

```sql
UPDATE public.diagnostic_sessions
SET conversion = false,
    exit_type = NULL,
    validated_cart_amount = NULL,
    validated_products = NULL,
    upsells_converted = NULL,
    shopify_order_id = NULL
WHERE session_code = '<session_a_corriger>';
```

Puis relancer le webhook Shopify (depuis Shopify admin → Notifications → Webhooks → Send test notification).

### Q8. Le client demande à supprimer toutes ses données (RGPD)

**Procédure** :
1. Identifier toutes les sessions du client (`tenant_id = '<client_code>'`)
2. Anonymiser les emails dans `diagnostic_sessions`, `client_orders`, et toute autre table
3. Logger l'anonymisation dans un audit log
4. Confirmer par écrit au client (email)

Procédure complète à formaliser dans un document dédié RGPD (en dehors du runbook).

---

**Fin du runbook — version 1.0 — 27 avril 2026**

> Ce runbook est vivant. Toute amélioration ou correction observée pendant un onboarding réel doit être réintégrée dans la version suivante.
