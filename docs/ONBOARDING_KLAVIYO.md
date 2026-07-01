# Onboarding Klaviyo — Procédure complète

> **Document opérationnel** pour connecter Klaviyo au dashboard AskIt d'un client.
> Couvre : connexion API, configuration de la liste, audit du diagnostic, mapping des propriétés, événement de flow, et propriétés personnalisées.
>
> Version : 1.0 — juillet 2026
> Validé sur : Dermeden (juin 2026)

---

## Vue d'ensemble

L'intégration Klaviyo permet de :
1. **Créer/mettre à jour un profil Klaviyo** à chaque diagnostic terminé avec toutes les propriétés du diagnostic
2. **Abonner le profil** à une liste Klaviyo (email + SMS si opt-in)
3. **Déclencher un événement** "ASKIT diagnostic complété" pour les flows automatisés
4. **Nettoyer les anciennes propriétés** quand quelqu'un refait le diagnostic sur un parcours différent

Tout est automatique une fois configuré : chaque diagnostic terminé déclenche le sync Klaviyo sans intervention manuelle.

---

## Prérequis

- Le dashboard du client est opérationnel (Supabase + Edge Functions déployées)
- Le diagnostic du client est branché sur le dashboard (webhook diagnostic → dashboard fonctionnel)
- Un compte Klaviyo existe pour le client

---

## Phase 1 — Connexion API Klaviyo (10 min)

### 1.1 Créer la clé API Klaviyo

1. Dans Klaviyo → **Settings → API Keys**
2. Cliquer **"Create Private API Key"**
3. Nom : `AskIt Dashboard`
4. **Scopes requis** :
   - `Profiles` : Read/Write (créer et mettre à jour les profils)
   - `Lists` : Read/Write (ajouter à une liste)
   - `Events` : Write (envoyer l'événement "diagnostic complété")
5. Copier la clé (format `pk_...`)

### 1.2 Configurer le secret Supabase

```bash
SUPABASE_ACCESS_TOKEN="{ton_token}" && PROJECT_REF="{project_ref}" && \
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '[{"name":"KLAVIYO_API_KEY","value":"{pk_clé_api}"}]'
```

### 1.3 Créer ou identifier la liste Klaviyo

1. Dans Klaviyo → **Audience → Lists & Segments**
2. Soit créer une nouvelle liste (ex: `Diagnostic AskIt — {Client}`)
3. Soit utiliser une liste existante
4. **Récupérer l'ID de la liste** : ouvrir la liste → l'ID est dans l'URL (format `https://www.klaviyo.com/list/XXXXXX` → l'ID est `XXXXXX`)

### 1.4 Configurer `tenant_config`

```sql
UPDATE tenant_config
SET
  klaviyo_list_id = '{id_liste}',
  integrations_enabled = jsonb_set(integrations_enabled, '{klaviyo}', 'true'::jsonb)
WHERE project_id = '{client}';
```

> **Important** : le `klaviyo_list_id` est lu dynamiquement par la fonction `sync-klaviyo-persona` à chaque appel. Pas besoin de redéployer les Edge Functions.

### 1.5 Vérification rapide

Faire un diagnostic test complet avec une adresse email valide. Vérifier dans Klaviyo :
- Le profil apparaît dans la liste
- Les propriétés `AskIt — ...` sont présentes sur le profil
- Le statut est "Abonné" (email et/ou SMS selon l'opt-in)

---

## Phase 2 — Audit du diagnostic (30-60 min)

> **Cette phase est la plus importante.** Elle détermine quelles propriétés remonteront dans Klaviyo et comment elles seront nommées. Un audit bâclé = des propriétés illisibles dans Klaviyo.

### 2.1 Objectif

Chaque diagnostic pose des questions avec des options de réponse. Chaque réponse est stockée comme une clé dans `diagnostic_items.item_metadata` (JSONB). L'audit consiste à :

1. **Lister toutes les clés** possibles dans `item_metadata`
2. **Identifier les valeurs possibles** pour chaque clé
3. **Définir un label lisible** en français pour chaque clé
4. **Traduire les valeurs** en français lisible
5. **Identifier les propriétés additionnelles** à remonter (âge, URL résultats, etc.)

### 2.2 Méthode d'audit

**Option A — Audit depuis la base de données (recommandé)**

Exécuter cette requête SQL dans le Supabase du diagnostic (pas du dashboard) pour extraire toutes les clés et valeurs uniques :

```sql
SELECT DISTINCT
  key,
  jsonb_typeof(value) AS type,
  CASE
    WHEN jsonb_typeof(value) = 'string' THEN value::text
    WHEN jsonb_typeof(value) = 'number' THEN value::text
    WHEN jsonb_typeof(value) = 'boolean' THEN value::text
    WHEN jsonb_typeof(value) = 'array' THEN value::text
    ELSE '(object)'
  END AS sample_value
FROM diagnostic_items,
     jsonb_each(item_metadata) AS kv(key, value)
ORDER BY key, sample_value;
```

Si le diagnostic utilise `item_metadata.answers` comme sous-objet :

```sql
SELECT DISTINCT
  key,
  jsonb_typeof(value) AS type,
  value::text AS sample_value
FROM diagnostic_items,
     jsonb_each(
       CASE
         WHEN item_metadata->'answers' IS NOT NULL
         THEN item_metadata->'answers'
         ELSE item_metadata
       END
     ) AS kv(key, value)
WHERE key NOT IN ('_raw', '_recommendations', 'raw', 'recommendations')
ORDER BY key, sample_value;
```

**Option B — Audit depuis le code du diagnostic**

Lire le code source du diagnostic (composants React/Lovable) pour identifier :
- Chaque question posée → la clé de stockage
- Les options de réponse → les valeurs possibles
- Les conditions d'affichage → quelles clés n'apparaissent que pour certains parcours

**Option C — Audit en faisant le diagnostic**

Faire le diagnostic en empruntant chaque chemin possible et noter :
- Le code de chaque question (visible dans les données envoyées au webhook)
- Les valeurs de réponse possibles

### 2.3 Résultat attendu de l'audit

Un tableau complet comme celui-ci :

| Clé brute | Label Klaviyo souhaité | Catégorie | Valeurs possibles → Traduction |
|-----------|----------------------|-----------|-------------------------------|
| `skinType` | Type de peau | profil_peau | `dry` → Plutôt sèche, `oily` → Plutôt grasse, `combination` → Plutôt mixte |
| `Q1` | Préoccupation principale | diagnostic | `A` → Taches pigmentaires, `B` → Rides et ridules, `C` → Relâchement |
| `sensitivity` | Sensibilité cutanée (0-10) | profil_peau | Valeur numérique 0-10, pas de traduction |
| `age` | Âge | profil_client | Valeur numérique, pas de traduction |
| `Q0b` | Date de naissance | profil_client | Date ISO, pas de traduction |
| `routineSize` | Protocole souhaité | profil_client | `essential` → Protocole Essentiel, `complete` → Protocole Complet |
| `decisionDriver` | Critères de décision | profil_client | `reviews` → Avis clients, `science` → Résultats scientifiques, `beforeAfter` → Photos avant/après |
| `CI2` | Intolérances connues | profil_peau | `none` → Aucune, `retinoids` → Rétinoïdes, `aha` → AHA |

> **Conseil** : préfixer tous les labels avec la catégorie du diagnostic si le diagnostic a des branches (ex: pour Dermeden qui a 5 préoccupations : "Taches — Type", "Rides — Zones", "Relâchement — Stade", etc.)

### 2.4 Attention aux parcours conditionnels

Si le diagnostic a des branches (ex: question 1 = "Quel est votre problème ?" → branche A, B, C...), certaines clés n'existent que dans certaines branches. C'est important car :

- Une personne qui fait le parcours "Taches" aura les clés `A1`, `A_melasma_env`, etc.
- Si elle refait le diagnostic sur le parcours "Rides", ces clés doivent être **supprimées** de son profil Klaviyo
- Le mécanisme d'`unset` gère ça automatiquement : toutes les clés du `column_labels_mapping` qui ne sont PAS dans la session actuelle sont supprimées avant d'écrire les nouvelles

**Il faut donc inclure TOUTES les clés de TOUS les parcours** dans le `column_labels_mapping`, même celles qui ne s'appliquent pas à tous les utilisateurs.

---

## Phase 3 — Configuration du `column_labels_mapping` (20-30 min)

### 3.1 Construire le JSON

À partir du tableau d'audit, construire le JSON `column_labels_mapping` :

```json
{
  "skinType": {
    "label": "Type de peau",
    "category": "profil_peau",
    "value_mapping": {
      "dry": "Plutôt sèche",
      "oily": "Plutôt grasse",
      "combination": "Plutôt mixte"
    }
  },
  "Q1": {
    "label": "Préoccupation principale",
    "category": "diagnostic",
    "value_mapping": {
      "A": "Taches pigmentaires",
      "B": "Rides et ridules",
      "C": "Relâchement",
      "D": "Manque d'éclat",
      "E": "Déshydratation"
    }
  },
  "sensitivity": {
    "label": "Sensibilité cutanée (0-10)",
    "category": "profil_peau"
  },
  "age": {
    "label": "Âge",
    "category": "profil_client"
  }
}
```

**Règles :**
- `label` : nom lisible en français, sera préfixé par `AskIt — ` automatiquement
- `category` : libre, sert au tri dans le dashboard (pas utilisé côté Klaviyo)
- `value_mapping` : optionnel, seulement si les valeurs brutes ne sont pas lisibles
- Les clés numériques (âge, score, montant) n'ont généralement pas besoin de `value_mapping`
- Les valeurs multi-sélection séparées par des virgules (ex: `"stress,smoking"`) sont automatiquement splitées, chaque valeur traduite individuellement, puis rejointes

### 3.2 Appliquer dans `tenant_config`

```sql
UPDATE tenant_config
SET column_labels_mapping = '{...le JSON complet...}'::jsonb
WHERE project_id = '{client}';
```

### 3.3 Tester

1. Faire un diagnostic test complet
2. Ouvrir le profil dans Klaviyo → Propriétés personnalisées
3. Vérifier :
   - Toutes les propriétés sont préfixées `AskIt — `
   - Les labels sont lisibles (ex: `AskIt — Type de peau` et non `skinType`)
   - Les valeurs sont traduites (ex: `Plutôt sèche` et non `dry`)
   - Les propriétés non pertinentes au parcours ne sont pas présentes

---

## Phase 4 — Propriétés de session (automatiques)

Ces propriétés remontent **automatiquement** pour chaque diagnostic, sans configuration. Elles sont définies dans `SESSION_LABEL_MAP` de `sync-klaviyo-persona`.

### 4.1 Identification et tracking

| Propriété Klaviyo | Source | Exemple |
|---|---|---|
| `AskIt — Session` | `session_code` | `ef577dc7-bb11-4345-...` |
| `AskIt — Statut` | `status` (traduit) | `Terminé`, `En cours`, `Abandonné` |
| `AskIt — Source` | `source` | `direct`, `meta_ads`, `email` |
| `AskIt — Appareil` | `device` | `mobile`, `desktop`, `tablet` |
| `AskIt — Langue` | `locale` | `fr-FR` |
| `AskIt — Date dernier diagnostic` | `created_at` | `2026-06-24T06:31:59Z` |
| `AskIt — URL résultats` | `result_url` | `https://client.com/diagnostic?r=uuid` |

### 4.2 Persona et IA

| Propriété Klaviyo | Source | Exemple |
|---|---|---|
| `AskIt — Persona` | `personas.full_label` (lookup DB) | `P1 — Mère attentive et engagée` |
| `AskIt — Code persona` | `persona_code` | `P1` |
| `AskIt — Ton adapté` | `adapted_tone` | `factual`, `playful`, `empowering` |
| `AskIt — Matching (%)` | `matching_score` | `85` |
| `AskIt — Score engagement (%)` | `engagement_score` | `78` |

### 4.3 Business et conversion

| Propriété Klaviyo | Source | Exemple |
|---|---|---|
| `AskIt — Conversion` | `conversion` | `Oui` / `Non` |
| `AskIt — Client existant` | `is_existing_client` | `Oui` / `Non` |
| `AskIt — Type de sortie` | `exit_type` (traduit) | `Complété`, `Converti`, `Abandon`, `Checkout` |
| `AskIt — Produits recommandés` | `recommended_products` | `Crème jour \| Sérum nuit` |
| `AskIt — Montant panier recommandé` | `recommended_cart_amount` | `85.50` |
| `AskIt — Potentiel upsell` | `upsell_potential` (traduit) | `Faible`, `Moyen`, `Élevé` |
| `AskIt — Produits validés` | `validated_products` | Rempli par le webhook Shopify |
| `AskIt — Montant validé` | `validated_cart_amount` | Rempli par le webhook Shopify |

### 4.4 Comportement

| Propriété Klaviyo | Source | Exemple |
|---|---|---|
| `AskIt — Durée diagnostic (sec)` | `duration_seconds` | `187` |
| `AskIt — Retours en arrière` | `back_navigation_count` | `2` |
| `AskIt — Parcours questions` | `question_path` | `Q1>Q3>Q5>Q7` |
| `AskIt — Opt-in email` | `optin_email` | `Oui` / `Non` |
| `AskIt — Opt-in SMS` | `optin_sms` | `Oui` / `Non` |

### 4.5 UTM / Attribution

| Propriété Klaviyo | Source |
|---|---|
| `AskIt — UTM source` | `utm_source` |
| `AskIt — UTM medium` | `utm_medium` |
| `AskIt — UTM campaign` | `utm_campaign` |
| `AskIt — UTM content` | `utm_content` |
| `AskIt — UTM term` | `utm_term` |

### 4.6 Profil Klaviyo

En plus des propriétés personnalisées, le sync remplit aussi :
- **`email`** : normalisé en lowercase
- **`phone_number`** : format E.164 (ex: `+33612345678`)
- **`first_name`** : depuis `user_name` de la session
- **`$source`** : `"Diagnostic Ask-it"` (tag interne Klaviyo)

---

## Phase 5 — Propriétés personnalisées avancées

Au-delà des propriétés automatiques et du mapping diagnostic, certaines propriétés peuvent être ajoutées à la demande du client.

### 5.1 Âge calculé depuis la date de naissance

Si le diagnostic collecte la date de naissance (ex: clé `Q0b`), l'âge peut être calculé côté diagnostic et envoyé comme clé dans `item_metadata` :

```json
{
  "Q0b": "1979-06-28",
  "age": 47
}
```

Mapping dans `column_labels_mapping` :
```json
{
  "Q0b": {
    "label": "Date de naissance",
    "category": "profil_client"
  },
  "age": {
    "label": "Âge",
    "category": "profil_client"
  }
}
```

**Pour ajouter une catégorie d'âge** (ex: 25-34, 35-44, etc.), le diagnostic doit calculer la tranche et l'envoyer comme clé supplémentaire :

```json
{
  "age": 47,
  "age_range": "45-54"
}
```

Mapping :
```json
{
  "age_range": {
    "label": "Tranche d'âge",
    "category": "profil_client",
    "value_mapping": {
      "18-24": "18-24 ans",
      "25-34": "25-34 ans",
      "35-44": "35-44 ans",
      "45-54": "45-54 ans",
      "55-64": "55-64 ans",
      "65+": "65 ans et plus"
    }
  }
}
```

### 5.2 URL de résultats avec ID de page

L'URL de résultats remonte automatiquement via `AskIt — URL résultats`. Elle contient l'ID unique de la session :

```
https://dermeden.com/pages/diagnostic?r=2288c3c7-985a-45e8-a2b5-10e14b5d6cc2
```

Cette URL peut être utilisée dans les emails Klaviyo pour :
- Renvoyer le client vers ses résultats personnalisés
- Afficher un CTA "Voir mes recommandations" dans le flow post-diagnostic

**Utilisation dans un template Klaviyo :**
```
<a href="{{ person|lookup:'AskIt — URL résultats' }}">Voir mes recommandations</a>
```

### 5.3 Code promo personnalisé

Si le diagnostic génère un code promo, l'envoyer dans `item_metadata` :

```json
{
  "discount_code": "DIAG-SOPHIE-10",
  "discount_code_expires_at": "2026-07-15"
}
```

Mapping :
```json
{
  "discount_code": {
    "label": "Code de réduction",
    "category": "conversion"
  },
  "discount_code_expires_at": {
    "label": "Expiration du code",
    "category": "conversion"
  }
}
```

### 5.4 Produits existants de la marque

Si le diagnostic demande "Utilisez-vous déjà des produits de la marque ?", la réponse est stockée dans `existing_brand_products` au niveau session (pas dans `item_metadata`). Elle remonte automatiquement en `AskIt — Produits existants`.

### 5.5 Toute propriété personnalisée

**Règle générale** : toute clé présente dans `item_metadata` du diagnostic remonte automatiquement dans Klaviyo. Pour qu'elle soit lisible :
1. Ajouter la clé dans `column_labels_mapping` avec un `label` clair
2. Ajouter un `value_mapping` si les valeurs brutes ne sont pas lisibles
3. Pas besoin de modifier le code — le mapping est lu dynamiquement depuis `tenant_config`

---

## Phase 6 — Événement "ASKIT diagnostic complété"

### 6.1 Pourquoi un événement

Le trigger "Entered List" (ajout à une liste) ne se déclenche qu'une seule fois par profil. Si quelqu'un refait le diagnostic, il n'entre pas à nouveau dans le flow.

L'événement "ASKIT diagnostic complété" est un **metric Klaviyo** qui se déclenche à **chaque** diagnostic terminé, même pour les profils déjà dans la liste.

### 6.2 Propriétés de l'événement

L'événement contient 11 propriétés accessibles dans les flows via `{{ event.propriété }}` :

| Propriété | Description | Exemple |
|---|---|---|
| `session_code` | Code unique de la session | `ef577dc7-bb11-...` |
| `persona` | Label complet du persona | `P1 — Mère attentive` |
| `persona_code` | Code court | `P1` |
| `source` | Source de trafic | `meta_ads` |
| `device` | Appareil | `mobile` |
| `conversion` | A converti ? | `Oui` / `Non` |
| `recommended_products` | Produits recommandés | `Crème jour \| Sérum` |
| `recommended_cart_amount` | Montant recommandé | `85.50` |
| `exit_type` | Type de sortie | `Complété` |
| `engagement_score` | Score d'engagement | `78` |
| `result_url` | URL des résultats | `https://...?r=uuid` |

### 6.3 Créer le flow dans Klaviyo

1. Dans Klaviyo → **Flows → Create Flow → "Create from scratch"**
2. **Trigger** : Indicateur (Metric) → sélectionner **"ASKIT diagnostic complété"**

   > **Note** : cette metric n'apparaît qu'après le premier diagnostic terminé. Si elle n'est pas visible, faire un diagnostic test d'abord.

3. Configurer le flow (emails, délais, conditions)
4. **Utiliser les propriétés de l'événement** dans les emails :
   ```
   Bonjour {{ person|lookup:'first_name' }},

   Merci d'avoir complété votre diagnostic !
   Voici vos recommandations personnalisées :

   {{ event.recommended_products }}

   <a href="{{ event.result_url }}">Voir mes résultats détaillés</a>
   ```

5. **Filtres avancés** possibles dans le flow :
   - Par persona : `event.persona_code` equals `P1`
   - Par conversion : `event.conversion` equals `Non` (relance les non-convertis)
   - Par source : `event.source` equals `meta_ads`

### 6.4 Désactiver l'ancien flow "Entered List"

Si un flow existe déjà avec le trigger "Entered List" :
1. Créer le nouveau flow avec "ASKIT diagnostic complété"
2. Copier les emails de l'ancien flow
3. Activer le nouveau
4. **Désactiver** l'ancien (ne pas le supprimer, au cas où)

---

## Phase 7 — Mécanisme de nettoyage des propriétés

### 7.1 Le problème

Quand quelqu'un refait le diagnostic sur un parcours différent, les propriétés de l'ancien parcours restent sur le profil Klaviyo. Exemple :
- Session 1 → parcours "Taches" → propriétés `AskIt — Type de taches`, `AskIt — Phototype`, etc.
- Session 2 → parcours "Rides" → propriétés `AskIt — Zones des rides`, `AskIt — Stade des rides`, etc.
- Sans nettoyage : le profil a les propriétés des deux parcours → données incohérentes

### 7.2 La solution

À chaque sync, la fonction `sync-klaviyo-persona` envoie un `unset` à Klaviyo contenant **toutes les propriétés AskIt possibles SAUF celles de la session actuelle**.

Concrètement :
1. Liste toutes les propriétés possibles :
   - Les 26 propriétés session-level (`AskIt — Session`, `AskIt — Statut`, etc.)
   - Toutes les propriétés du `column_labels_mapping` (`AskIt — Type de peau`, `AskIt — Zones des rides`, etc.)
2. Retire de cette liste les propriétés qui sont dans la session actuelle
3. Envoie le reste en `unset` → Klaviyo les supprime du profil

**Résultat** : le profil reflète toujours et uniquement la dernière session.

### 7.3 Conséquence sur le `column_labels_mapping`

Il faut impérativement inclure **toutes les clés de tous les parcours** dans le `column_labels_mapping`. Si une clé est absente du mapping, elle ne sera pas incluse dans le `unset` et pourrait rester sur le profil même si elle n'est plus pertinente.

---

## Phase 8 — Backfill (migration initiale)

### 8.1 Quand utiliser le backfill

- **Premier setup** : pour syncer les sessions diagnostic qui ont eu lieu avant la connexion Klaviyo
- **Après modification du `column_labels_mapping`** : pour resync tous les profils avec les nouveaux labels/traductions
- **Récupération d'erreur** : pour resync les sessions qui ont échoué

### 8.2 Lancer le backfill

```bash
curl -X POST "https://{project_ref}.supabase.co/functions/v1/backfill-klaviyo" \
  -H "Authorization: Bearer {anon_key}" \
  -H "Content-Type: application/json" \
  -d '{"since": "2026-06-01"}'
```

Le backfill :
- Récupère toutes les sessions terminées avec email depuis la date `since`
- Les traite par batch de 20 avec 300ms de délai entre chaque batch (respect du rate limit Klaviyo)
- Chaque session est syncée via `sync-klaviyo-persona` (même logique que le sync normal)

### 8.3 Après un changement de mapping

Si tu modifies le `column_labels_mapping` (ajout/suppression de clés, modification de labels ou traductions) :

1. Mettre à jour le `column_labels_mapping` dans `tenant_config`
2. Lancer un backfill depuis la date de la première session :
   ```bash
   curl -X POST ".../backfill-klaviyo" -d '{"since":"2026-01-01"}'
   ```
3. Tous les profils seront resyncés avec les nouveaux labels, et les anciennes propriétés seront nettoyées via `unset`

---

## Prompt Claude Code — Setup Klaviyo complet

> **Copier-coller dans un nouveau chat Claude Code** pour automatiser le setup. Il faut avoir le compte Klaviyo du client et l'accès au projet Supabase.

```
Je dois connecter Klaviyo au dashboard AskIt d'un nouveau client. Le dashboard est déjà opérationnel (Supabase + Edge Functions déployées + diagnostic branché).

## Informations

- Supabase project ref : {project_ref}
- Supabase access token : {supabase_access_token}
- Tenant ID (project_id dans tenant_config) : {client}
- Clé API Klaviyo : {pk_clé}
- ID de la liste Klaviyo : {id_liste}

## Contexte technique

La fonction sync-klaviyo-persona est déjà déployée. Elle lit dynamiquement :
- KLAVIYO_API_KEY depuis les secrets Supabase
- klaviyo_list_id depuis tenant_config
- column_labels_mapping depuis tenant_config

## Étapes à suivre

### ÉTAPE 1 — Configurer le secret Klaviyo
Push le secret KLAVIYO_API_KEY via l'API Supabase Management.

### ÉTAPE 2 — Configurer tenant_config
Via l'API REST Supabase :
- SET klaviyo_list_id = '{id_liste}'
- SET integrations_enabled → klaviyo = true
- Conserver les autres valeurs existantes de integrations_enabled

### ÉTAPE 3 — Audit du diagnostic
Récupérer toutes les clés et valeurs uniques dans diagnostic_items.item_metadata pour ce tenant.
Exécuter via l'API REST Supabase :
- SELECT de toutes les sessions terminées avec leurs items
- Extraire les clés de item_metadata et identifier les valeurs possibles
- Affiche-moi le résultat sous forme de tableau : clé | type | valeurs possibles

### ÉTAPE 4 — Construire le column_labels_mapping
À partir de l'audit, je vais te donner les labels et traductions souhaitées.
Tu construiras le JSON column_labels_mapping et le pousseras dans tenant_config.

Structure attendue pour chaque clé :
{
  "clé_brute": {
    "label": "Label lisible en français",
    "category": "catégorie",
    "value_mapping": {
      "valeur_brute": "Valeur traduite"
    }
  }
}

### ÉTAPE 5 — Test
Identifier une session diagnostic terminée récente avec un email.
Appeler manuellement sync-klaviyo-persona avec son session_id.
Vérifier dans les logs Supabase que le sync est OK (status 200).
Me demander de vérifier le profil dans Klaviyo.

### ÉTAPE 6 — Backfill
Lancer le backfill pour syncer toutes les sessions historiques :
curl -X POST /functions/v1/backfill-klaviyo -d '{"since":"date_premier_diagnostic"}'
Affiche le résultat (total, processed, errors).

### ÉTAPE 7 — Vérification finale
Affiche un récap :
- Nombre de propriétés dans le column_labels_mapping
- Nombre de sessions syncées via backfill
- Confirmation que l'événement "ASKIT diagnostic complété" est actif
- Me rappeler de créer le flow Klaviyo avec le trigger "Indicateur → ASKIT diagnostic complété"

Procède étape par étape. Attends mes réponses quand tu as besoin de mes choix (labels, traductions, catégories).
```

---

## Checklist de validation finale

- [ ] Secret `KLAVIYO_API_KEY` configuré dans Supabase
- [ ] `klaviyo_list_id` renseigné dans `tenant_config`
- [ ] `integrations_enabled.klaviyo = true` dans `tenant_config`
- [ ] `column_labels_mapping` complet avec toutes les clés de tous les parcours
- [ ] Diagnostic test → profil Klaviyo créé avec propriétés `AskIt — ...`
- [ ] Profil abonné à la liste (email et/ou SMS)
- [ ] Valeurs traduites correctement (pas de valeurs brutes comme `dry`, `oily`, etc.)
- [ ] Second diagnostic test (même email, parcours différent) → anciennes propriétés nettoyées
- [ ] Événement "ASKIT diagnostic complété" visible dans Klaviyo → Analytics → Metrics
- [ ] Flow créé avec trigger "Indicateur → ASKIT diagnostic complété"
- [ ] Ancien flow "Entered List" désactivé (si existant)
- [ ] Backfill des sessions historiques effectué
- [ ] Templates d'emails utilisent les propriétés de l'événement si nécessaire

---

## Annexe — Exemple complet Dermeden

Le mapping Dermeden contient **65 clés** couvrant 5 parcours diagnostic (Taches, Rides, Relâchement, Éclat, Déshydratation) + profil peau + profil client + conversion.

Extrait représentatif :

```json
{
  "Q1": {
    "label": "Préoccupations principales",
    "category": "diagnostic",
    "value_mapping": {
      "A": "Taches pigmentaires",
      "B": "Rides et ridules",
      "C": "Relâchement",
      "D": "Manque d'éclat",
      "E": "Déshydratation"
    }
  },
  "skinType": {
    "label": "Type de peau",
    "category": "profil_peau",
    "value_mapping": {
      "dry": "Plutôt sèche",
      "oily": "Plutôt grasse",
      "combination": "Plutôt mixte"
    }
  },
  "sensitivity": {
    "label": "Sensibilité cutanée (0-10)",
    "category": "profil_peau"
  },
  "age": {
    "label": "Âge",
    "category": "profil_client"
  },
  "routineSize": {
    "label": "Protocole souhaité",
    "category": "profil_client",
    "value_mapping": {
      "complete": "Protocole Complet",
      "essential": "Protocole Essentiel"
    }
  },
  "decisionDriver": {
    "label": "Critères de décision",
    "category": "profil_client",
    "value_mapping": {
      "doctor": "Avis Dr Nicolas",
      "reviews": "Avis clientes",
      "science": "Résultats scientifiques",
      "beforeAfter": "Photos avant/après"
    }
  }
}
```

Le mapping complet de Dermeden est consultable dans la table `tenant_config` du projet Supabase `xqqazuxlmzethhbtptzi`.

---

*Document créé le 1er juillet 2026 — version 1.0*
*Validé sur l'onboarding Dermeden. À mettre à jour après chaque nouvel onboarding.*
