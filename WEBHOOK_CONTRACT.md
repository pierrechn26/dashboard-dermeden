# Webhook Contract — Diagnostic → Dashboard

> **Document contractuel** décrivant le format exact du payload JSON, les headers requis, et les règles d'interprétation du webhook envoyé depuis l'app diagnostic d'un client vers l'Edge Function `diagnostic-webhook` de son dashboard Ask-It.
>
> Version : 1.0 — avril 2026
> Localisation : racine du repo `dashboard-template-askit`
> Endpoint cible : `POST {dashboard_supabase_url}/functions/v1/diagnostic-webhook`

---

## À quoi sert ce document

Le diagnostic et le dashboard d'un client Ask-It sont deux projets Lovable séparés, chacun avec son propre Supabase et son propre repo GitHub. Ils communiquent entre eux uniquement via un **webhook HTTP POST** envoyé depuis le diagnostic vers le dashboard à chaque action utilisateur significative.

Ce document fait office d'**interface contractuelle** entre les deux projets. Il décrit exactement ce que le dashboard attend en entrée, ce que le diagnostic doit envoyer en sortie, et comment les champs sont interprétés et persistés en base.

**Qui doit lire ce document** :
- Toi ou un futur CSM, lors d'un onboarding client, pour comprendre et débugger la connexion diagnostic ↔ dashboard (étape 8 de la checklist d'onboarding)
- Tout dev qui construit ou modifie un diagnostic Ask-It et veut s'assurer que le format envoyé est accepté par le dashboard
- Tout dev qui maintient le code de `diagnostic-webhook/index.ts` et veut comprendre la source de vérité du format attendu

**Quand le mettre à jour** : à chaque modification du format attendu par `diagnostic-webhook`. Toute modification doit être coordonnée avec les diagnostics déployés pour éviter de casser la communication avec les clients existants.

---

## Vue d'ensemble

### Le flux

1. Un visiteur lance le diagnostic d'un client sur son site web (ex: `https://baubo.com/diagnostic`)
2. À chaque étape clé (création de session, saisie d'infos, complétion, abandon), le frontend du diagnostic appelle une Edge Function `send-diagnostic-data` de **son propre** projet Supabase
3. Cette Edge Function côté diagnostic construit un payload JSON et fait un POST HTTP vers l'endpoint `diagnostic-webhook` du **dashboard** du client (sur un Supabase différent)
4. L'Edge Function `diagnostic-webhook` côté dashboard authentifie la requête via le header `x-webhook-secret`, valide le payload, upsert dans `diagnostic_sessions` et `diagnostic_items`, puis déclenche les calculs de persona/sync Klaviyo si la session est complète
5. Le dashboard retourne une réponse JSON au diagnostic pour accuser réception (le diagnostic peut l'ignorer, c'est fire-and-forget)

### Les 3 moments clés où le diagnostic envoie un webhook

| Moment | Status envoyé | Données envoyées |
|--------|---------------|------------------|
| Création initiale de la session | `en_cours` | Minimum : `session_code`, `source`, `device` |
| Mise à jour au fil du diagnostic | `en_cours` | Champs accumulés au fur et à mesure |
| Complétion finale | `termine` | Tous les champs, déclenche persona + sync externe |
| Abandon à une étape | `abandonne` | Champs partiels + `exit_type` + `abandoned_at_step` |

Le webhook est **upsert** sur la clé `session_code` : à chaque appel, le dashboard met à jour la ligne existante ou la crée. La logique `COALESCE` garantit que les champs déjà remplis ne sont pas écrasés par `null` dans les appels suivants.

---

## Endpoint

### URL

```
POST {DASHBOARD_SUPABASE_URL}/functions/v1/diagnostic-webhook
```

Où `{DASHBOARD_SUPABASE_URL}` est l'URL Supabase du projet **dashboard** du client (format `https://xxxxxxxx.supabase.co`). Cette URL doit être configurée comme secret `DASHBOARD_WEBHOOK_URL` côté projet diagnostic.

### Headers requis

| Header | Valeur | Obligatoire |
|--------|--------|-------------|
| `Content-Type` | `application/json` | Oui |
| `x-webhook-secret` | Valeur du secret partagé `DASHBOARD_WEBHOOK_SECRET` | Oui |

### Authentification

L'authentification repose sur un **secret partagé** :
- Côté dashboard (Supabase Edge Functions Secrets) : secret nommé `DASHBOARD_WEBHOOK_SECRET` avec une valeur aléatoire de 32+ caractères
- Côté diagnostic (Supabase Edge Functions Secrets) : même secret nommé `DASHBOARD_WEBHOOK_SECRET` avec **exactement la même valeur**

Le diagnostic envoie cette valeur dans le header `x-webhook-secret` de chaque requête. Le dashboard la compare à la variable d'environnement. Si le match échoue → HTTP 401 `unauthorized`. Si le secret n'est pas configuré côté dashboard → HTTP 500 `server_misconfigured`.

**Note historique** : dans le code actuel du template (hérité de Ouate), le secret s'appelle encore `DIAGNOSTIC_WEBHOOK_SECRET`. La séquence de prompts Lovable de transformation renommera ce secret en `DASHBOARD_WEBHOOK_SECRET` pour uniformiser le vocabulaire dans toute la chaîne d'onboarding. Ce document décrit **l'état cible du template**, pas l'état actuel de Ouate.

**Amélioration future envisagée** : passer à une signature HMAC SHA-256 (comme les webhooks Shopify) au lieu d'un simple secret égal. Plus sécurisé mais plus complexe à configurer. Hors scope v1.

---

## Structure du payload JSON

Le body de la requête est un objet JSON avec 2 sections principales :
- Les **champs de session** au premier niveau (correspondent à `diagnostic_sessions`)
- Un tableau `items` (ou `children` dans l'ancien format) avec les items du diagnostic

### Champs au niveau session (`diagnostic_sessions`)

#### Obligatoires

| Champ | Type | Description |
|-------|------|-------------|
| `session_code` | `string` | Code unique de la session, 7 caractères, généré par le diagnostic au démarrage. Sert de clé d'upsert. |

#### Identification & tracking

| Champ | Type | Valeurs ou format | Description |
|-------|------|-------------------|-------------|
| `status` | `string` | `en_cours`, `termine`, `abandonne` | Statut actuel de la session. Détermine si les hooks post-complétion sont déclenchés. |
| `source` | `string` | Libre | Source de trafic (ex: `meta_ads`, `email`, `organic`, `newsletter`) |
| `source_url` | `string` | URL complète | URL de la page d'entrée sur le site |
| `utm_source` | `string` | Libre | UTM source parsé de l'URL |
| `utm_campaign` | `string` | Libre | UTM campaign |
| `device` | `string` | `mobile`, `desktop`, `tablet` | Type d'appareil détecté |
| `locale` | `string` | Code ISO, ex: `fr-FR` | Locale du visiteur |

#### Contact et opt-ins

| Champ | Type | Description |
|-------|------|-------------|
| `user_name` | `string` | Prénom saisi par l'utilisateur |
| `email` | `string` | Email (toujours normalisé en lowercase côté dashboard) |
| `phone` | `string` | Numéro de téléphone au format international si possible |
| `optin_email` | `boolean` | A-t-il accepté les emails marketing |
| `optin_sms` | `boolean` | A-t-il accepté les SMS |
| `relationship` | `string` | Relation à l'objet du diagnostic (ex: pour un diagnostic enfant : `parent`, `grand-parent`, `autre`) |
| `number_of_children` | `integer` | Nombre d'items déclarés (= nombre d'éléments dans `items`) |

#### Personas et IA (remplis par le dashboard, pas par le diagnostic)

Les champs suivants sont **calculés et remplis par le dashboard** après réception du webhook avec `status = "termine"`. Le diagnostic n'a **pas besoin de les envoyer**. S'il les envoie quand même, ils seront ignorés ou écrasés :
- `persona_code`
- `matching_score`
- `adapted_tone`

#### Business et conversion

| Champ | Type | Description |
|-------|------|-------------|
| `conversion` | `boolean` | A-t-il cliqué sur le CTA final (avant achat réel) |
| `exit_type` | `string` | Raison de sortie si `status = abandonne` ou `termine`. Valeurs : `completed`, `back`, `close`, `timeout` |
| `recommended_cart_amount` | `number` | Montant total recommandé à la fin du diagnostic |
| `recommended_products` | `string` | Liste des noms de produits recommandés, séparés par ` \| ` (pipe entouré d'espaces). **Ne jamais utiliser `, ` comme séparateur** — voir section "Règles de format" |
| `selected_cart_amount` | `number` | Montant sélectionné par l'utilisateur (après ajustements éventuels) |
| `cart_selected_at` | `timestamptz` | Date de la sélection du panier |
| `checkout_started` | `boolean` | A-t-il cliqué sur "Passer au paiement" |
| `checkout_at` | `timestamptz` | Date du clic checkout |
| `validated_cart_amount` | `number` | Montant réellement validé (rempli uniquement si Shopify webhook confirme plus tard) |
| `validated_products` | `string` | Noms des produits réellement commandés, séparés par ` \| ` |
| `existing_brand_products` | `string` | Produits de la marque déjà possédés avant le diagnostic (nom dans le template ; dans Ouate c'était `existing_ouate_products`) |
| `is_existing_client` | `boolean` | Est-ce un client existant qui refait un diagnostic |
| `upsell_potential` | `string` | Libellé qualitatif de potentiel d'upsell (`low`, `medium`, `high`) |

#### Comportement

| Champ | Type | Description |
|-------|------|-------------|
| `duration_seconds` | `integer` | Durée totale de la session en secondes |
| `abandoned_at_step` | `string` | Étape où l'utilisateur a abandonné (valeur spéciale `"CLEAR"` pour indiquer un reset, traduit en `null` côté dashboard) |
| `question_path` | `string` | Parcours des questions, format libre (ex: `Q1>Q3>Q5>Q7_abandon`) |
| `back_navigation_count` | `integer` | Nombre de clics "retour" pendant la session |
| `has_optional_details` | `boolean` | A-t-il rempli les détails optionnels |
| `behavior_tags` | `string` | Tags comportementaux séparés par virgules (ex: `fast_reader,price_sensitive,engaged`) |
| `engagement_score` | `integer` | Score d'engagement calculé par le diagnostic (0-100) |

#### Questions globales (phase finale)

| Champ | Type | Description |
|-------|------|-------------|
| `routine_size_preference` | `string` | Préférence taille de routine (`minimal`, `standard`, `complete`). Nom historique Ouate, à conserver pour le template : correspond conceptuellement à un "niveau d'engagement produits" applicable à tout vertical |
| `priorities_ordered` | `string` | Liste ordonnée de priorités, séparées par virgules |
| `trust_triggers_ordered` | `string` | Liste ordonnée de déclencheurs de confiance |
| `content_format_preference` | `string` | Format de contenu préféré (`video`, `text`, `mixed`) |

#### Données internes (calculs)

| Champ | Type | Description |
|-------|------|-------------|
| `avg_response_time` | `number` | Temps moyen de réponse aux questions (en secondes) |
| `total_text_length` | `integer` | Longueur totale du texte saisi par l'utilisateur |
| `has_detailed_responses` | `boolean` | Drapeau "réponses détaillées" |
| `step_timestamps` | `object` | Objet JSONB avec timestamps par étape |
| `result_url` | `string` | URL de la page résultats affichée à l'utilisateur |

### Tableau `items` (ou `children` legacy)

Le payload contient un tableau qui décrit les items du diagnostic. Le nom du champ est `items` dans le format cible template, ou `children` dans le format legacy Ouate (les deux sont acceptés pendant la transition).

Chaque élément du tableau est un objet avec la structure suivante :

```json
{
  "item_index": 0,
  "item_label": "Léa",
  "item_metadata": {
    "age": 6,
    "age_range": "4-8",
    "skin_concern": "peau sensible",
    "has_routine": true,
    "routine_issue": "peau qui tiraille après le bain"
  },
  "dynamic_question_1": "Est-ce que sa peau réagit au contact de l'eau dure ?",
  "dynamic_answer_1": "Oui souvent",
  "dynamic_question_2": null,
  "dynamic_answer_2": null,
  "dynamic_question_3": null,
  "dynamic_answer_3": null,
  "dynamic_insight_targets": "water_reactivity,sensitive_skin"
}
```

#### Champs de l'item

| Champ | Type | Description |
|-------|------|-------------|
| `item_index` | `integer` | Index 0-based de l'item dans la session. L'item `0` doit être le plus "important" (l'aîné pour enfants, le projet principal, etc.) |
| `item_label` | `string` | Libellé court (ex: prénom enfant, nom de projet, nom d'animal) |
| `item_metadata` | `object` | **Objet JSONB libre** contenant toutes les données spécifiques au vertical du client. Structure non validée côté dashboard — chaque client définit son propre schéma |
| `dynamic_question_1` à `_3` | `string` ou `null` | Questions dynamiques générées par l'IA du diagnostic (max 3) |
| `dynamic_answer_1` à `_3` | `string` ou `null` | Réponses correspondantes |
| `dynamic_insight_targets` | `string` | Codes normalisés anglais des insights ciblés par les questions, séparés par virgules |

#### Pourquoi `item_metadata` est libre

Dans le dashboard Ouate historique, la table `diagnostic_children` avait ~15 colonnes spécifiques à la cosmétique enfant (`skin_concern`, `age_range`, `skin_reactivity`, `has_ouate_products`, etc.). C'était un point de friction majeur pour généraliser le template.

Dans le template, la table `diagnostic_children` est renommée en `diagnostic_items` et ces colonnes spécifiques **deviennent des clés libres d'un JSONB `item_metadata`**. Ça veut dire :
- Le diagnostic d'un client mode femme peut envoyer `{ "occasions_preferred": [...], "size_top": "M", "style_concerns": [...] }`
- Le diagnostic d'un client animalerie peut envoyer `{ "pet_type": "chien", "weight_kg": 12, "health_concerns": [...] }`
- Le diagnostic d'un client SaaS B2B peut envoyer `{ "team_size": 15, "stack": ["React", "Python"], "main_pain": "integration_complexity" }`

Le dashboard stocke tout ça tel quel dans le JSONB, sans validation. La validation des champs métier est la responsabilité du diagnostic côté amont, pas du dashboard côté aval.

### Format legacy Ouate (backward compat)

Pendant la transition, le webhook accepte aussi le format legacy Ouate qui utilise :
- Le nom `children` au lieu de `items`
- Des colonnes plates au niveau racine de l'item au lieu d'un `item_metadata` JSONB : `first_name`, `age`, `age_range`, `skin_concern`, etc.

Quand ce format est reçu, la fonction `diagnostic-webhook` du template est capable de le reconnaître et de convertir automatiquement vers le nouveau format en bundlant tous les champs plats dans un `item_metadata` auto-généré.

Cette rétrocompat est **temporaire**. Une fois que le diagnostic de chaque client aura migré vers le nouveau format, le support du legacy pourra être retiré du code.

---

## Règles de format

### Règle 1 — Séparateur ` | ` obligatoire pour les listes de produits

Pour les champs `recommended_products`, `validated_products`, `existing_brand_products`, toujours utiliser le séparateur ` | ` (pipe entouré d'espaces). **Ne jamais utiliser `, ` (virgule espace)**.

**Pourquoi** : cette règle vient d'un bug résolu chez Ouate où le produit `"Mon écran 1,2,3 soleil"` (qui contient des virgules dans son nom) cassait le `.split(",")` côté dashboard et faisait remonter le fragment `"2"` comme top produit acheté. Depuis la règle du pipe, les noms de produits peuvent contenir n'importe quel caractère sauf `|`.

**Exemple correct** :
```json
{
  "recommended_products": "Crème apaisante bébé | Mon écran 1,2,3 soleil | Lait corporel doux"
}
```

**Exemple incorrect** :
```json
{
  "recommended_products": "Crème apaisante bébé, Mon écran 1,2,3 soleil, Lait corporel doux"
}
```

### Règle 2 — Emails en lowercase

Le dashboard normalise systématiquement les emails en lowercase avant upsert. Le diagnostic peut envoyer en n'importe quelle casse, mais pour éviter des doublons côté diagnostic aussi, la bonne pratique est d'envoyer directement en lowercase.

### Règle 3 — Timestamps en ISO 8601 UTC

Tous les champs timestamp (`cart_selected_at`, `checkout_at`, etc.) doivent être en ISO 8601 UTC (format `2026-04-14T15:32:45.123Z`). Le dashboard les stocke en `timestamptz` PostgreSQL.

### Règle 4 — Booléens stricts

Les champs booléens doivent être de vrais `true`/`false` JSON, pas des strings `"true"`/`"false"` ni des entiers `0`/`1`. Sinon la valeur par défaut (généralement `false`) est appliquée côté dashboard.

### Règle 5 — `null` vs absence de champ

Le dashboard utilise une logique COALESCE : si un champ est absent du payload OU égal à `null`, la valeur existante en base n'est pas écrasée. Conséquence :
- Pour **mettre à jour** un champ, envoie sa nouvelle valeur
- Pour **garder** la valeur existante, n'envoie pas le champ (ou envoie `null`)
- Pour **effacer** un champ, envoie la string `"CLEAR"` (uniquement supporté pour `abandoned_at_step` actuellement)

### Règle 6 — Quota `over_quota`

Si le client a dépassé son quota mensuel de sessions, le dashboard marque la session avec `over_quota = true` mais **ne bloque pas le visiteur**. Le diagnostic continue normalement. Le flag est utilisé uniquement pour le reporting côté portail admin.

---

## Exemple de payload complet

Voici un exemple de payload complet pour une session terminée avec succès (status = termine), issu d'un client fictif de type diagnostic skincare (en supposant le format cible du template) :

```json
{
  "session_code": "ABC1234",
  "status": "termine",
  "source": "meta_ads",
  "source_url": "https://baubo.com/diagnostic?utm_source=meta&utm_campaign=spring_2026",
  "utm_source": "meta",
  "utm_campaign": "spring_2026",
  "device": "mobile",
  "locale": "fr-FR",
  "user_name": "Sophie",
  "email": "sophie.dupont@example.com",
  "phone": "+33612345678",
  "optin_email": true,
  "optin_sms": false,
  "relationship": "self",
  "number_of_children": 1,
  "conversion": true,
  "exit_type": "completed",
  "recommended_cart_amount": 52.50,
  "recommended_products": "Mon nettoyant doux | Mon huile rituel",
  "selected_cart_amount": 52.50,
  "cart_selected_at": "2026-04-14T15:30:12.500Z",
  "checkout_started": true,
  "checkout_at": "2026-04-14T15:32:45.123Z",
  "existing_brand_products": null,
  "is_existing_client": false,
  "upsell_potential": "medium",
  "duration_seconds": 187,
  "question_path": "Q1>Q2>Q3>Q4>Q5>Q6>Q7>Q8>Q9>Q10>Q11_end",
  "back_navigation_count": 1,
  "has_optional_details": true,
  "behavior_tags": "engaged,price_sensitive",
  "engagement_score": 78,
  "routine_size_preference": "standard",
  "priorities_ordered": "efficacite,naturalite,prix",
  "trust_triggers_ordered": "avis_clients,ingredients,certifications",
  "content_format_preference": "mixed",
  "avg_response_time": 12.4,
  "total_text_length": 287,
  "has_detailed_responses": true,
  "step_timestamps": {
    "Q1": "2026-04-14T15:27:05.000Z",
    "Q11": "2026-04-14T15:30:05.000Z"
  },
  "result_url": "https://baubo.com/diagnostic/result/ABC1234",
  "items": [
    {
      "item_index": 0,
      "item_label": "Sophie",
      "item_metadata": {
        "age_range": "30-40",
        "skin_type": "mixte",
        "main_concern": "hydratation",
        "secondary_concern": "sensibilite",
        "current_routine": "nettoyant_seul",
        "lifestyle": "urbain_actif"
      },
      "dynamic_question_1": "Est-ce que ta peau tire après le nettoyage ?",
      "dynamic_answer_1": "Oui souvent",
      "dynamic_question_2": "À quel moment de la journée ressens-tu le plus d'inconfort ?",
      "dynamic_answer_2": "En fin de journée, surtout en hiver",
      "dynamic_question_3": null,
      "dynamic_answer_3": null,
      "dynamic_insight_targets": "dehydration,winter_sensitivity"
    }
  ]
}
```

---

## Réponses du dashboard

### Succès — HTTP 200

```json
{
  "success": true,
  "session_id": "uuid-de-la-session-créée",
  "session_code": "ABC1234",
  "persona_code": "P0",
  "persona_matching_score": null,
  "over_quota": false
}
```

En cas de succès, le dashboard retourne l'ID UUID de la session créée/mise à jour, le code, le persona détecté si `status = termine` (sinon `null`), le score de matching, et le flag `over_quota`.

### Erreur d'authentification — HTTP 401

```json
{
  "error": "unauthorized",
  "message": "Invalid or missing webhook secret"
}
```

Cause : le header `x-webhook-secret` est absent ou ne correspond pas à la variable d'environnement `DASHBOARD_WEBHOOK_SECRET` côté dashboard.

**Résolution** : vérifier que le secret est bien configuré des deux côtés avec la même valeur.

### Secret manquant côté serveur — HTTP 500

```json
{
  "error": "server_misconfigured",
  "message": "DASHBOARD_WEBHOOK_SECRET secret is missing. See WEBHOOK_CONTRACT.md at the root of the repo for onboarding instructions."
}
```

Cause : le dashboard n'a pas du tout de secret `DASHBOARD_WEBHOOK_SECRET` configuré dans ses Edge Functions Secrets. Ça arrive si l'étape 5 de la checklist d'onboarding a été oubliée.

**Résolution** : configurer le secret côté dashboard et réessayer.

### Payload invalide — HTTP 400

```json
{
  "error": "invalid_payload",
  "message": "session_code is required"
}
```

Cause : un champ obligatoire (actuellement `session_code` uniquement) est manquant.

**Résolution** : vérifier le payload côté diagnostic.

### Erreur interne — HTTP 500

```json
{
  "error": "internal_error",
  "message": "Database upsert failed: ..."
}
```

Cause : une erreur côté base de données (connexion, violation de contrainte, etc.). Le détail est loggé côté Supabase du dashboard et est aussi remonté au portail admin via `reportEdgeFunctionError`.

**Résolution** : consulter les logs Supabase de l'Edge Function pour le détail et débugger.

---

## Checklist de branchement d'un nouveau diagnostic

À effectuer lors de l'étape 8 de l'onboarding client (`ONBOARDING_CLIENT_ASKIT.md`) pour brancher le diagnostic d'un nouveau client sur son dashboard.

- [ ] Le secret `DASHBOARD_WEBHOOK_SECRET` est configuré côté dashboard (Supabase Edge Functions Secrets) avec une valeur aléatoire forte
- [ ] Le secret `DASHBOARD_WEBHOOK_SECRET` est configuré côté diagnostic avec **exactement la même valeur**
- [ ] Le secret `DASHBOARD_WEBHOOK_URL` est configuré côté diagnostic avec l'URL complète de l'endpoint : `{dashboard_supabase_url}/functions/v1/diagnostic-webhook`
- [ ] L'Edge Function côté diagnostic qui envoie le webhook (généralement `send-diagnostic-data`) utilise bien ces 2 secrets
- [ ] Le header `Content-Type: application/json` est bien envoyé
- [ ] Le header `x-webhook-secret` contient la valeur du secret (pas le nom de la variable)
- [ ] Le payload contient au minimum `session_code`
- [ ] Les séparateurs de liste produits utilisent ` | ` et pas `, `
- [ ] Les emails sont en lowercase
- [ ] Les timestamps sont en ISO 8601 UTC
- [ ] Un test end-to-end a été effectué : lancer le diagnostic → vérifier que la session arrive dans `diagnostic_sessions` du dashboard → vérifier que les items arrivent dans `diagnostic_items`
- [ ] Un test avec `status = "termine"` a été effectué pour vérifier que le persona est bien calculé (P0 au démarrage, puis P1+ après quelques dizaines de sessions via `detect-persona-clusters`)

---

## Évolutions futures envisagées

Ces évolutions ne sont **pas** dans le scope v1 du template. Elles sont documentées ici pour mémoire.

### Signature HMAC SHA-256

Passer du simple header `x-webhook-secret` à une signature HMAC SHA-256 du body comme le font Shopify, Stripe, GitHub, etc. Plus sécurisé mais plus complexe à configurer.

### Validation de schéma JSON

Introduire une validation stricte du payload avec un schéma JSON (ex: via `zod` ou `ajv`). Permet de rejeter proprement les payloads mal formés avec un message d'erreur précis sur le champ fautif.

### Webhook queue avec retries

Mettre en place une queue côté diagnostic pour retry automatique en cas d'erreur réseau ou d'indisponibilité temporaire du dashboard. Actuellement, si le POST échoue, la donnée est perdue.

### Support multi-tenant sur un seul Supabase

Actuellement chaque client a son propre Supabase. Si on passe à une archi multi-tenant unique en phase 2, le webhook devra inclure un `tenant_id` pour identifier le tenant cible.

---

## Historique

| Version | Date | Changement |
|---------|------|-----------|
| 1.0 | Avril 2026 | Document initial. Format `items` + `item_metadata` JSONB pour être agnostique au vertical client. Secret renommé de `DIAGNOSTIC_WEBHOOK_SECRET` (legacy Ouate) en `DASHBOARD_WEBHOOK_SECRET`. |

---

*Document de référence — ne jamais supprimer de ce repo, mettre à jour à chaque évolution du format.*
