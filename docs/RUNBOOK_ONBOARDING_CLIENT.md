# RUNBOOK — Onboarding Client Ask-it (Dashboard Template)

> **Procédure opérationnelle pour onboarder un nouveau client sur le template dashboard Ask-it.**
>
> Ce runbook est conçu pour être suivi linéairement, phase par phase. Chaque phase est numérotée (A à J) et chronométrée.
>
> **Version** : 2.0 — post-template_transformation_lot1
> **Date de référence** : 26 mai 2026
> **Template de référence** : `dashboard-template-askit`

---

## 1. Pré-requis

Avant de démarrer l'onboarding d'un nouveau client, s'assurer d'avoir les accès suivants :

| Ressource | Accès requis | Où l'obtenir |
|---|---|---|
| Portail admin Ask-it | Rôle `admin` | `https://app.ask-it.ai` |
| Workspace Lovable | Membre avec droits de création de projets | Invitation par l'équipe technique Ask-it |
| Console Anthropic | Capacité de créer des clés API dédiées | `https://console.anthropic.com` |
| Console Perplexity | Capacité de créer des clés API dédiées | `https://www.perplexity.ai/settings/api` |

**Pré-requis côté client (à valider en amont) :**
- [ ] Le contrat est signé et le plan tarifaire est validé
- [ ] Le client dispose d'un site Shopify actif (le template suppose Shopify)
- [ ] Le client a identifié son provider email (Klaviyo recommandé, Omnisend/Brevo/Mailchimp supportés)
- [ ] Un contact technique côté client est disponible pour l'intégration du snippet diagnostic

---

## 2. Phases d'onboarding (A à J)

### PHASE A — Portail admin (10 min)

Dans le portail admin Ask-it (`https://app.ask-it.ai`) :

1. **Créer l'organisation client**
   - Nom de l'organisation = nom commercial de la marque
   - `project_id` : générer un identifiant unique, en **lowercase snake_case** (ex: `cottan`, `ouate_paris`, `baubo`)
   - Ce `project_id` sera utilisé partout : tables BDD, secrets, URLs edge functions

2. **Générer le MONITORING_API_KEY**
   - Dans la fiche organisation → onglet "API Keys"
   - Copier la valeur — elle sera configurée en Phase C

3. **Créer le compte `client_admin`**
   - Créer le compte mais **ne pas envoyer l'invitation tout de suite**
   - L'invitation sera envoyée en Phase J, une fois le dashboard en prod
   - Noter l'email du contact principal client

**Livrables Phase A :**
- `project_id` (ex: `cottan`)
- `ORGANIZATION_ID` (UUID de l'organisation)
- `MONITORING_API_KEY` (clé API monitoring)

---

### PHASE B — Remix Lovable + activation Cloud (15 min)

1. **Remix du template dashboard**
   - Dans Lovable, créer un nouveau projet par remix de `dashboard-template-askit`
   - Nommer le projet selon la convention : `<project_id>-dashboard` (ex: `cottan-dashboard`)

2. **Activation Lovable Cloud (OBLIGATOIRE avant les migrations)**
   - Aller dans les paramètres du projet → "Lovable Cloud" → Activer
   - **Sans cette étape, les migrations SQL échoueront** (pas de base de données provisionnée)
   - Attendre la confirmation que la base PostgreSQL est prête (~30 secondes)

3. **Application des migrations**

   > **Pattern `supabase/pending_migrations/` :** après chaque remix d'un projet Lovable, les migrations présentes dans le dossier `supabase/pending_migrations/` du template **ne sont PAS appliquées automatiquement**. Elles doivent être exécutées manuellement via l'éditeur SQL de Lovable Cloud, dans l'ordre numérique croissant. Ce dossier sert de staging pour les migrations de template qui doivent être rejouées sur chaque nouveau client.

   Procédure :
   - Ouvrir l'éditeur SQL dans Lovable Cloud (bouton "SQL Editor")
   - Ouvrir chaque fichier de `supabase/pending_migrations/` dans l'ordre
   - Copier-coller le contenu SQL et exécuter
   - Vérifier qu'aucune erreur n'est retournée

   **Ordre des migrations à appliquer :**
   1. `01_drop_diagnostic_responses.sql`
   2. `02_add_utm_columns.sql`
   3. `03_add_tone_label.sql`
   4. `04_add_column_labels_mapping.sql`

4. **Nettoyage post-remix**
   - Supprimer les fichiers TanStack Query orphelins s'ils existent encore (le template les a normalement déjà retirés)
   - Vérifier que le build Lovable passe sans erreur TypeScript

**⚠️ Bloquant :** Si Lovable Cloud n'est pas activé avant les migrations, l'exécution SQL retournera une erreur de connexion à la base.

**Livrables Phase B :**
- Projet Lovable dashboard créé et buildable
- Lovable Cloud activé avec base de données prête
- 4 migrations pending appliquées avec succès

---

### PHASE C — Secrets manuels (15 min)

Configurer les secrets côté dashboard (Lovable → Settings → Secrets). Liste exhaustive :

| # | Secret | Valeur | Source |
|---|--------|--------|--------|
| 1 | `ORGANIZATION_ID` | UUID | Portail admin — Phase A |
| 2 | `MONITORING_API_KEY` | Clé générée | Portail admin — Phase A |
| 3 | `USAGE_STATS_API_KEY` | `askit-usage-stats-2026` | Valeur fixe Ask-it |
| 4 | `ANTHROPIC_API_KEY` | `sk-ant-...` | Console Anthropic (clé dédiée client) |
| 5 | `PERPLEXITY_API_KEY` | `pplx-...` | Console Perplexity (clé dédiée client) |
| 6 | `PORTAL_URL` | `https://srzbcuhwrpkfhubbbeuw.supabase.co` | Valeur fixe Ask-it |
| 7 | `DASHBOARD_WEBHOOK_SECRET` | Hex 64 caractères aléatoires | Généré manuellement |

**⚠️ Convention de naming critique :**
- Le secret du webhook diagnostic ↔ dashboard s'appelle **`DASHBOARD_WEBHOOK_SECRET`**
- Le code lit le nouveau nom en **priorité**, avec un **fallback rétrocompatible** sur l'ancien nom `DIAGNOSTIC_WEBHOOK_SECRET`
- Configurer **uniquement** `DASHBOARD_WEBHOOK_SECRET` — ne pas créer de doublon

**Génération de `DASHBOARD_WEBHOOK_SECRET` :**
```bash
# Sur Mac/Linux :
openssl rand -hex 32
# Ou utiliser un générateur de chaîne aléatoire 64 caractères hex
```

**Secrets auto-fournis par Lovable (ne rien configurer) :**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Livrables Phase C :**
- 7 secrets configurés dans Lovable
- `DASHBOARD_WEBHOOK_SECRET` copié dans un gestionnaire de mots de passe (sera réutilisé en Phase G)

---

### PHASE D — `tenant_config` (15 min)

1. **Générer le SQL via le portail admin**
   - Dans le portail admin, aller dans l'organisation → "Generate tenant config"
   - Le portail génère un `INSERT ... ON CONFLICT ... DO UPDATE` complet
   - Copier le SQL généré

2. **Exécuter dans Lovable Cloud**
   - Ouvrir l'éditeur SQL du projet dashboard
   - Coller le SQL généré
   - Exécuter

3. **Vérifications critiques post-insertion**

   - `brand_name` est renseigné (obligatoire)
   - `project_id` correspond à celui de la Phase A
   - `client_supabase_url` pointe vers `/functions/v1/get-usage-stats`

     **⚠️ Piège fréquent :** si `client_supabase_url` pointe vers la racine du projet Supabase (sans le suffixe `/functions/v1/get-usage-stats`), la remontée des coûts IA vers le portail sera cassée. La valeur correcte a cette forme :
     ```
     https://<project_ref>.supabase.co/functions/v1/get-usage-stats
     ```

   - `integrations_enabled` reflète les intégrations que le client utilisera
   - `persona_dimension_mapping` est peuplé avec au moins 2 champs par dimension

4. **Vérification de la remontée des coûts IA**

   Tester manuellement l'endpoint de usage-stats :
   ```bash
   curl -X GET \
     '<CLIENT_SUPABASE_URL>/functions/v1/get-usage-stats' \
     -H 'Authorization: Bearer <USAGE_STATS_API_KEY>'
   ```
   Doit retourner un JSON avec les compteurs d'usage (pas une 404).

**Livrables Phase D :**
- Ligne `tenant_config` insérée et validée
- `client_supabase_url` correctement suffixé

---

### PHASE E — Shopify (15-30 min)

> **Approche v5 (depuis mai 2026)** : webhook `orders/paid` + Storefront token. **PAS** de Dev Dashboard ni d'Admin API Shopify. Cette approche simplifiée réduit la surface d'attaque et les permissions requises.

1. **Configuration du webhook `orders/paid`**
   - Dans l'admin Shopify du client → Settings → Notifications → Webhooks
   - Créer un webhook :
     - Event : `Order payment`
     - Format : JSON
     - URL : `https://<project_ref>.supabase.co/functions/v1/shopify-order-webhook`
   - Le webhook génère une clé secrète de signature
   - **⚠️ Format 2026 :** la clé est une chaîne hexadécimale de 64 caractères, **sans préfixe `shpss_`**
   - Si Shopify affiche un préfixe `shpss_`, retirer le préfixe et ne garder que la partie hex
   - Configurer le secret `SHOPIFY_WEBHOOK_SECRET` dans Lovable avec cette valeur hex pure

2. **Storefront Access Token (optionnel pour MVP)**
   - Via le canal Headless dans Shopify (pas via l'API Admin)
   - Nécessaire uniquement si on veut enrichir les données produit côté dashboard
   - Pour un MVP simple, cette étape peut être reportée

3. **Test du webhook**
   - Utiliser la fonction "Send test notification" de Shopify
   - Vérifier dans les logs Supabase que le webhook reçoit le payload
   - Vérifier que la signature HMAC est validée (pas de 401)

**Livrables Phase E :**
- Webhook `orders/paid` configuré avec URL correcte
- `SHOPIFY_WEBHOOK_SECRET` configuré (format hex pur, 64 caractères)
- Test notification reçue sans erreur HMAC

---

### PHASE F — Email (Klaviyo) (15 min)

1. **Récupérer la clé API Klaviyo**
   - Demander au client de créer une clé API privée dans Klaviyo
   - Klaviyo → Settings → API Keys → Create Private API Key
   - Scopes requis : Lists, Profiles, Events
   - La clé commence par `pk_...`
   - Configurer le secret `KLAVIYO_API_KEY` dans Lovable

2. **Récupérer l'ID de liste diagnostic**
   - Demander au client de créer une liste dédiée dans Klaviyo (ex: "Diagnostic — Profils")
   - Noter l'ID de la liste (ex: `RLxwL9`)
   - Ce n'est **pas** un secret Lovable — il sera stocké dans `tenant_config.klaviyo_list_id`

3. **Configurer `tenant_config`**
   ```sql
   UPDATE public.tenant_config
   SET integrations_enabled = jsonb_set(
     integrations_enabled,
     '{klaviyo}',
     'true'::jsonb
   ),
   klaviyo_list_id = '<id_liste>'
   WHERE project_id = '<project_id>';
   ```

4. **Configurer `sync-klaviyo-persona`**
   - L'edge function lit automatiquement `tenant_config.klaviyo_list_id`
   - Aucune configuration supplémentaire requise dans le code

**Livrables Phase F :**
- `KLAVIYO_API_KEY` configuré dans Lovable
- Liste Klaviyo dédiée créée côté client
- `tenant_config.integrations_enabled.klaviyo = true`
- `tenant_config.klaviyo_list_id` renseigné

---

### PHASE G — Brancher le diagnostic existant (30-45 min)

1. **Audit du diagnostic client**
   - Identifier la structure de la BDD du diagnostic (tables, champs)
   - Comprendre le flow de collecte (quels champs sont posés, à quelles étapes)
   - Identifier les clés de métadonnées stockées dans `item_metadata`
   - Noter les conventions de naming (snake_case vs camelCase)

2. **Configuration du webhook diagnostic → dashboard**

   Côté **diagnostic**, configurer :
   - `DASHBOARD_WEBHOOK_URL` = `https://<project_ref>.supabase.co/functions/v1/diagnostic-webhook`
   - `DASHBOARD_WEBHOOK_SECRET` = **la même valeur** que celle configurée en Phase C

   **⚠️ Les 2 valeurs doivent être identiques des 2 côtés.** Toute différence provoquera des 401.

3. **Alignement `note_attributes` pour le matching Shopify**

   Le webhook `shopify-order-webhook` supporte une **dual-injection** pour maximiser la fiabilité du matching :

   - **Injection A** (line items) : dans chaque `line_item`, ajouter dans `properties` :
     ```json
     { "name": "_diag_session", "value": "<session_code>" }
     ```
   - **Injection B** (cart attributes) : dans `cart.attributes` (ou `note_attributes` au niveau commande) :
     ```json
     { "name": "lim_session_id", "value": "<session_code>" }
     ```

   Le webhook tente d'abord `line_items[].properties`, puis fallback sur `note_attributes`. Au moins une des deux doit être présente.

4. **⚠️ Stockage `localStorage` obligatoire**

   Côté diagnostic, le `session_code` (ou `lim_diag_session_id`) doit être stocké dans **`localStorage`** — **pas** `sessionStorage`.

   **Pourquoi :** `sessionStorage` est effacé à la fermeture de l'onglet. Si l'utilisateur ferme l'onglet et revient plus tard (ou ouvre le checkout dans un nouvel onglet), le `session_code` est perdu. Le `cartId` Shopify, lui, survit aux fermetures d'onglet. Sans `localStorage`, la synchronisation entre diagnostic et panier est cassée.

5. **Test E2E diagnostic → dashboard**
   - Compléter un diagnostic complet sur le site client
   - Vérifier que la session apparaît dans le dashboard (`diagnostic_sessions`)
   - Vérifier que tous les champs attendus sont peuplés (status, exit_type, item_metadata)

**Livrables Phase G :**
- Webhook diagnostic configuré avec URL + secret identiques au dashboard
- Dual-injection `_diag_session` + `lim_session_id` implémentée côté diagnostic
- `lim_diag_session_id` stocké en `localStorage`
- 1 test E2E réussi (session visible en BDD)

---

### PHASE H — Premier scrape commercial facts (5 min)

1. **Déclencher le scraper manuellement**
   ```bash
   curl -X POST \
     'https://<project_ref>.supabase.co/functions/v1/scrape-commercial-facts' \
     -H 'Authorization: Bearer <ANON_KEY>' \
     -H 'Content-Type: application/json' \
     -d '{"project_id": "<project_id>"}'
   ```

2. **Vérifier les facts extraits**
   ```sql
   SELECT category, fact_key, fact_value, confidence
   FROM public.commercial_facts
   WHERE project_id = '<project_id>'
   ORDER BY category, fact_key;
   ```

   **Attendu :** 15-30 facts avec confidence ≥ 0.7. Si 0 facts → vérifier `tenant_config.client_context_json->>shopify_url` ou `website_url`.

**Livrables Phase H :**
- Commercial facts scrapés et visibles en BDD

---

### PHASE I — Validation post-connexion (45 min)

1. **`column_labels_mapping` personnalisé**
   - Générer un JSON de mapping des colonnes selon les vraies clés du diagnostic client
   - Exemple de structure :
     ```json
     {
       "skin_concern": {
         "label": "Type de peau",
         "category": "profil_client",
         "value_mapping": {
           "sensitive": "Sensible",
           "dry": "Sèche",
           "oily": "Grasse"
         }
       },
       "age_range": {
         "label": "Tranche d'âge",
         "category": "identification"
       }
     }
     ```
   - Appliquer via SQL :
     ```sql
     UPDATE public.tenant_config
     SET column_labels_mapping = '<json>'::jsonb
     WHERE project_id = '<project_id>';
     ```

2. **`persona_dimension_mapping` aligné sur les vraies clés**
   - Adapter le mapping identity / need / behavior selon le diagnostic audité en Phase G
   - Vérifier que les clés correspondent bien à celles stockées en BDD

3. **Test `detect-persona-clusters`**
   - Si au moins 30 sessions existent, déclencher la détection :
     ```bash
     curl -X POST \
       'https://<project_ref>.supabase.co/functions/v1/detect-persona-clusters' \
       -H 'Authorization: Bearer <ANON_KEY>'
     ```
   - Vérifier que des personas sont créées dans `persona_profiles`

4. **Test `generate-marketing-recommendations`**
   - Ouvrir l'onglet Marketing dans le dashboard
   - Cliquer "Générer une recommandation" (catégorie "ads" ou "emails")
   - Vérifier que la recommandation est créée et que le `brand_name` du client apparaît

5. **Test Aski**
   - Ouvrir le chat Aski dans le dashboard
   - Poser une question métier : "Quels sont nos personas les plus fréquents ?"
   - Vérifier qu'Aski répond sans erreur et mentionne les bons noms de personas

**Livrables Phase I :**
- `column_labels_mapping` personnalisé et appliqué
- `persona_dimension_mapping` aligné sur les vraies clés
- Personas détectées (si volume suffisant)
- Au moins 1 recommandation marketing générée
- Aski fonctionnel

---

### PHASE J — Domaine custom + mise en prod (15 min + propagation DNS)

1. **Configurer le domaine custom**
   - Dans Lovable → Settings → Domains
   - Ajouter le domaine souhaité (ex: `dashboard.cottan.com` ou `admin.ouate.fr`)
   - Suivre les instructions DNS (enregistrement CNAME)
   - **La propagation DNS peut prendre jusqu'à 24h**

2. **Envoyer l'invitation `client_admin`**
   - Retourner dans le portail admin Ask-it
   - Envoyer l'invitation au compte `client_admin` créé en Phase A
   - Le client recevra un email avec un lien d'activation

3. **Tests finaux en prod**
   - Tester le dashboard sur le domaine custom
   - Tester le diagnostic en conditions réelles (mobile + desktop)
   - Faire une commande test complète (diagnostic → panier → paiement → conversion)

**Livrables Phase J :**
- Domaine custom configuré et accessible
- Invitation `client_admin` envoyée
- Tests E2E réussis sur l'environnement de production

---

## 3. Migrations BDD à appliquer après remix (CRITIQUE)

Après chaque remix du template, les migrations suivantes **doivent être appliquées manuellement** dans l'éditeur SQL Lovable, **dans l'ordre numérique** :

| # | Fichier | Description |
|---|---------|-------------|
| 1 | `01_drop_diagnostic_responses.sql` | Supprime la table legacy `diagnostic_responses` |
| 2 | `02_add_utm_columns.sql` | Ajoute `utm_medium`, `utm_content`, `utm_term`, `gclid`, `fbclid` sur `diagnostic_sessions` |
| 3 | `03_add_tone_label.sql` | Ajoute `tone_label TEXT` sur `diagnostic_sessions` |
| 4 | `04_add_column_labels_mapping.sql` | Ajoute `column_labels_mapping JSONB` sur `tenant_config` |

**Procédure :**
1. Ouvrir l'éditeur SQL dans Lovable Cloud (bouton "SQL Editor")
2. Ouvrir le fichier `01_drop_diagnostic_responses.sql` depuis le repo
3. Copier-coller son contenu dans l'éditeur et exécuter
4. Vérifier qu'aucune erreur n'est retournée
5. Répéter pour les fichiers 02, 03, 04

**⚠️ Ne pas sauter l'ordre.** Les migrations sont conçues pour être idempotentes (`IF NOT EXISTS`), mais l'ordre logique doit être respecté.

---

## 4. Étape spéciale : correction des crons `project_ref`

> **Bug connu** : après un remix Lovable, les 2 cron jobs (`weekly-intelligence-refresh`, `scrape-commercial-facts-weekly`) pointent vers le `project_ref` du **TEMPLATE** au lieu du `project_ref` du **CLIENT**.
>
> **Conséquence** : les jobs hebdomadaires s'exécutent sur les edge functions du template (qui n'existent plus ou sont vides) → les tâches du client ne tournent **jamais**.

**Action obligatoire après chaque remix :**

1. **Vérifier les crons existants**
   ```sql
   SELECT jobid, jobname, schedule, command
   FROM cron.job;
   ```

2. **Identifier les URLs incorrectes**
   - Si une URL contient `btkjdqelvvqmtguhhkdv` (ou tout autre project_ref du template) au lieu du project_ref du client → le cron est incorrect
   - Le project_ref du client est visible dans l'URL Supabase du projet (ex: `https://<project_ref>.supabase.co`)

3. **Désprogrammer les crons incorrects**
   ```sql
   SELECT cron.unschedule(<jobid>);
   ```
   Répéter pour chaque job dont l'URL pointe vers le template.

4. **Re-créer les crons avec les bonnes URLs**
   ```sql
   SELECT cron.schedule(
     'weekly-intelligence-refresh',
     '0 8 * * 1',
     $$ SELECT net.http_post(
       url := 'https://<PROJECT_REF_CLIENT>.supabase.co/functions/v1/weekly-intelligence-refresh',
       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
     ) $$
   );

   SELECT cron.schedule(
     'scrape-commercial-facts-weekly',
     '0 8 * * 1',
     $$ SELECT net.http_post(
       url := 'https://<PROJECT_REF_CLIENT>.supabase.co/functions/v1/scrape-commercial-facts',
       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
     ) $$
   );
   ```

**Vérification finale :**
```sql
SELECT jobname, command FROM cron.job;
-- Les URLs doivent toutes contenir le project_ref du CLIENT
```

---

## 5. Pièges connus

| Piège | Symptôme | Solution |
|-------|----------|----------|
| **Lovable Cloud non activé avant migrations** | Erreur de connexion à la BDD lors de l'exécution SQL | Activer Lovable Cloud **avant** toute migration |
| **`client_supabase_url` sans `/functions/v1/get-usage-stats`** | Remontée des coûts IA vide ou 404 dans le portail | Suffixer l'URL avec `/functions/v1/get-usage-stats` |
| **`DASHBOARD_WEBHOOK_SECRET` désynchronisé** | 401 sur les payloads diagnostic | Vérifier que dashboard et diagnostic partagent **exactement** la même valeur |
| **Shopify `SHOPIFY_WEBHOOK_SECRET` avec préfixe `shpss_`** | Validation HMAC échoue systématiquement | Retirer le préfixe `shpss_`, ne garder que la partie hex (64 caractères) |
| **`note_attributes` : confusion `lim_session_id` vs `_diag_session`** | Commandes Shopify non matchées à une session | Implémenter les **2 conventions** côté diagnostic (dual-injection) |
| **`lim_diag_session_id` en `sessionStorage`** | Perte du session_code à la fermeture d'onglet → checkout orphelin | Utiliser **`localStorage`** pour persister le `session_code` |
| **Crons `project_ref` hérités du template** | Pas de mise à jour hebdomadaire des insights / commercial facts | Vérifier et corriger les URLs des crons après chaque remix (voir §4) |

---

## 6. Checklist finale

À cocher **obligatoirement** avant mise en production publique :

### Migrations & Configuration BDD
- [ ] Toutes les 4 migrations `pending_migrations/` appliquées dans l'ordre
- [ ] `tenant_config` rempli avec `brand_name`, `brand_tone`, `integrations_enabled`
- [ ] `column_labels_mapping` personnalisé pour le client
- [ ] `persona_dimension_mapping` aligné sur les vraies clés du diagnostic

### Secrets
- [ ] Les 7 secrets configurés (`ORGANIZATION_ID`, `MONITORING_API_KEY`, `USAGE_STATS_API_KEY`, `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `PORTAL_URL`, `DASHBOARD_WEBHOOK_SECRET`)
- [ ] `DASHBOARD_WEBHOOK_SECRET` identique des 2 côtés (dashboard + diagnostic)
- [ ] `SHOPIFY_WEBHOOK_SECRET` au format hex pur (pas de préfixe `shpss_`)
- [ ] `KLAVIYO_API_KEY` configuré (si Klaviyo activé)

### Intégrations
- [ ] Webhook Shopify `orders/paid` configuré + test HMAC OK
- [ ] Klaviyo : clé API + ID liste + test E2E (si activé)
- [ ] Diagnostic branché : `_diag_session` en `line_items.properties` + `lim_session_id` en `cart.attributes`

### Infrastructure
- [ ] Crons `project_ref` vérifiés et corrigés si besoin
- [ ] Domaine custom configuré et DNS propagé
- [ ] Lovable Cloud activé et base opérationnelle

### Tests E2E
- [ ] 1 diagnostic complet → session visible dans le tableau
- [ ] 1 commande test → conversion marquée + `validated_cart_amount` peuplé
- [ ] 1 profil créé dans Klaviyo avec les bonnes propriétés (si activé)
- [ ] Aski répond correctement dans le dashboard
- [ ] Au moins 1 recommandation marketing générée sans erreur

### Client
- [ ] Invitation `client_admin` envoyée
- [ ] Contact technique a les accès et le brief d'intégration

---

## 7. Tableau des sources d'information

| Élément | Où le récupérer | Format attendu |
|---------|-----------------|----------------|
| `ORGANIZATION_ID` | Portail admin — Phase A | UUID (ex: `a1b2c3d4-e5f6-...`) |
| `MONITORING_API_KEY` | Portail admin — Phase A | Clé alphanumérique générée |
| `client_supabase_url` | URL Supabase du projet dashboard + suffixe | `https://<project_ref>.supabase.co/functions/v1/get-usage-stats` |
| `DASHBOARD_WEBHOOK_SECRET` | Généré aléatoirement, **identique des 2 côtés** | Hex 64 caractères (ex: `a3f9...8e2b`) |
| `SHOPIFY_WEBHOOK_SECRET` | Shopify Admin → Settings → Notifications → Webhooks | Hex 64 caractères **sans préfixe `shpss_`** |
| `KLAVIYO_API_KEY` | Klaviyo → Settings → API Keys (private key) | `pk_...` |
| ID liste Klaviyo | À demander au client (liste dédiée diagnostic) | Chaîne alphanumérique (ex: `RLxwL9`) |
| `project_ref` Supabase | URL du projet Lovable Cloud | Segment de l'URL : `https://<project_ref>.supabase.co` |
| `project_id` | Défini manuellement en Phase A | Lowercase snake_case (ex: `cottan`, `ouate_paris`) |

---

**Fin du runbook — version 2.0 — 26 mai 2026**

> Ce runbook est vivant. Toute amélioration ou correction observée pendant un onboarding réel doit être réintégrée dans la version suivante. Les 4 migrations `pending_migrations/` et la correction des crons `project_ref` sont des étapes critiques qui ont causé des incidents réels — ne pas les sauter.
