# `tenant_config` — Shared Contract

This document is the **single source of truth** for the structure of the `tenant_config` table. It defines the contract that:

- **Producers** must respect when writing to this table (manually via SQL Editor, or programmatically via the `extract-brand-context` Edge Function in the admin portal).
- **Consumers** can rely on when reading from this table (Edge Functions in the dashboard template, frontend hooks, etc.).

If any field structure or naming changes, this document must be updated **first**, then both producers and consumers must be aligned.

---

## Where this contract is implemented

### Producers (write to `tenant_config`)

- **Admin portal** (`premium-persona-pulse`) — Edge Function `extract-brand-context` analyses the client's website + diagnostic and generates an `INSERT/UPSERT` SQL statement.
- **Manual SQL** — for early clients before `extract-brand-context` is in production, configurations may be inserted manually via Supabase SQL Editor using a template based on this document.

### Consumers (read from `tenant_config`)

- `supabase/functions/_shared/loadTenantConfig.ts` — central loader, cached 5 minutes per Edge Function container.
- All Edge Functions that need tenant context: `aski-chat`, `aski-daily-learn`, `monthly-market-intelligence`, `weekly-intelligence-refresh`, `generate-recommendation-content`, `generate-funnel-recommendations`, `detect-persona-clusters`, `get-org-limits`, `generate-marketing-recommendations`.
- Frontend hooks (planned in Lot 7): `useTenantConfig()`.

---

## Table schema (top-level columns)

| Column | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | yes | gen_random_uuid() | Primary key. |
| `project_id` | text | yes | — | Unique slug identifying the tenant (e.g., `"ouate"`, `"cottan"`, `"baubo"`). Used as the FK in many tables. |
| `brand_name` | text | yes | — | Display name of the brand (e.g., `"Ouate Paris"`). Used in UI headers, AI prompts. |
| `brand_tone` | text | no | — | Editorial tone description used by AI prompts (e.g., `"Bienveillant, expert..."`). |
| `brand_description` | text | no | — | Short description of the brand (1–2 sentences). |
| `target_audience` | text | no | — | Free-text description of the target audience (e.g., `"parents d'enfants 4-12 ans"`). Used in AI prompts and clustering rules. |
| `industry` | text | no | — | Sector label (e.g., `"cosmétique enfant"`, `"literie haut de gamme"`). Used in AI prompts. |
| `currency` | text | no | `"EUR"` | ISO 4217 currency code. |
| `locale` | text | no | `"fr-FR"` | BCP-47 locale tag. |
| `timezone` | text | no | `"Europe/Paris"` | IANA timezone. |
| `dashboard_url` | text | no | — | Public URL of the deployed dashboard. |
| `diagnostic_url` | text | no | — | Public URL of the deployed diagnostic. |
| `client_context_json` | jsonb | no | `{}` | Rich brand context object — see §1 below. |
| `integrations_enabled` | jsonb | no | `{}` | Per-integration boolean flags — see §2 below. |
| `shopify_store_domain` | text | no | — | e.g., `"ouate.fr"`. Required if `integrations_enabled.shopify` is true. |
| `klaviyo_list_id` | text | no | — | Default list ID for Klaviyo. Required if `integrations_enabled.klaviyo` is true. |
| `ga4_landing_path` | text | no | — | URL path used as the funnel entry in GA4 reports. |
| `meta_pixel_id` | text | no | — | Required if `integrations_enabled.meta_pixel` is true. |
| `persona_detection_params` | jsonb | no | see §3 | Tunable params for persona auto-detection — see §3 below. |
| `persona_dimension_mapping` | jsonb | yes (for clustering) | see §4 | Maps tenant-specific JSONB keys to persona dimensions — see §4 below. **Without this, `detect-persona-clusters` cannot run.** |
| `created_at` | timestamptz | yes | now() | — |
| `updated_at` | timestamptz | yes | now() | — |

---

## §1 — `client_context_json` structure

Used by `monthly-market-intelligence` to enrich Gemini prompts and stored as a snapshot in `market_intelligence.client_context`.

```json
{
  "brand": "Ouate Paris",
  "description": "Marque française de soins naturels pour bébés et enfants. Positionnement premium, formules douces certifiées. Cible : parents soucieux des ingrédients, entre 25 et 45 ans.",
  "tone": "Expert, rassurant, chaleureux. Pas d'emojis, pas de jargon.",
  "products": [
    { "name": "Lait Corps Hydratant Bébé", "type": "soin corps", "price": 18 },
    { "name": "Crème Visage Peaux Sensibles", "type": "soin visage", "price": 22 }
  ],
  "channels": ["Meta Ads", "TikTok Ads", "Email (Klaviyo)", "Pinterest"],
  "promoCode": "OUATE10",
  "shopify_url": "ouate.fr"
}
```

**Field rules:**
- `brand` (string) — fallback: `tenant_config.brand_name`.
- `description` (string) — fallback: `tenant_config.brand_description`.
- `tone` (string) — fallback: `tenant_config.brand_tone`.
- `products` (array) — empty array allowed; populated by Shopify sync if integration is enabled.
- `channels` (array of strings) — empty array allowed.
- `promoCode` (string) — empty string allowed.
- `shopify_url` (string) — fallback: `tenant_config.shopify_store_domain`.

If `client_context_json` is empty or missing, consumers will fall back to top-level columns. Quality of AI output will be degraded but no errors raised.

---

## §2 — `integrations_enabled` structure

```json
{
  "shopify": false,
  "klaviyo": false,
  "ga4": false,
  "meta_pixel": false
}
```

All flags default to `false`. Activate progressively as the client provides credentials. When a flag is `true`, the corresponding ID/secret/domain field at the top level (`shopify_store_domain`, `klaviyo_list_id`, etc.) **must** be populated.

---

## §3 — `persona_detection_params` structure

```json
{
  "min_cluster_size": 30,
  "min_split_size": 20,
  "max_persona_size": 80,
  "weak_score_threshold": 75,
  "display_threshold_pct": 0.05,
  "display_threshold_min": 3
}
```

These values control the behavior of `detect-persona-clusters` and the persona display logic in the frontend. Defaults are tuned for ~500–5000 monthly diagnostic completions. Adjust per client based on volume.

---

## §4 — `persona_dimension_mapping` structure (CRITICAL)

This field tells the persona auto-detection algorithm **which fields from `diagnostic_items.item_metadata` JSONB to use** for each dimension (identity, need, behavior).

```json
{
  "identity": ["relationship", "is_existing_client", "number_of_children"],
  "need": ["skin_concern", "age_range", "has_routine", "skin_reactivity"],
  "behavior": ["priority_1", "trust_trigger_1", "routine_size_preference", "content_format_preference"]
}
```

### How each field is interpreted

**`identity` (array of session-level column names)**
The algorithm reads `session[fieldName]` directly. These should map to top-level columns of `diagnostic_sessions` (e.g., `relationship`, `is_existing_client`, `number_of_children`).

**`need` (array of `item_metadata` JSONB keys)**
The algorithm reads `session.diagnostic_items[0].item_metadata[fieldName]`. These keys must match the keys your diagnostic webhook stores in `item_metadata`.

**`behavior` (array of session-level fields, with optional ordered-list convention)**
For most fields: `session[fieldName]`.
For ordered-list fields: any field name matching the pattern `<basename>_<n>` (e.g., `priority_1`, `trust_trigger_2`) is auto-resolved by:
1. Looking for a column named `<basename>s_ordered` (plural+_ordered) or `<basename>_ordered`.
2. Splitting the comma-separated value.
3. Picking position `n - 1`.

This convention allows the diagnostic to store ordered preferences as `priorities_ordered = "ludique,efficacite,clean"` and the mapping to extract `priority_1 = "ludique"`, `priority_2 = "efficacite"`, etc.

### Examples for different verticals

**Cosmetics for children (Ouate):**
```json
{
  "identity": ["relationship", "is_existing_client", "number_of_children"],
  "need": ["skin_concern", "age_range", "has_routine", "skin_reactivity", "exclude_fragrance"],
  "behavior": ["priority_1", "trust_trigger_1", "routine_size_preference", "content_format_preference"]
}
```

**Bedding (e.g., Cottan):**
```json
{
  "identity": ["sleeper_count", "is_existing_client", "household_type"],
  "need": ["mattress_type", "sleep_issue", "preferred_firmness", "bedroom_size"],
  "behavior": ["priority_1", "trust_trigger_1", "purchase_urgency", "content_format_preference"]
}
```

**Intimate care (e.g., Baubo):**
```json
{
  "identity": ["age_bracket", "is_existing_client", "lifestyle"],
  "need": ["cycle_phase", "sensitivity_level", "current_concern"],
  "behavior": ["priority_1", "trust_trigger_1", "format_preference"]
}
```

### Algorithm guarantees

- All field weights are computed dynamically as **equal weights within each dimension** (e.g., 4 need fields → each weighted 0.25 within the need dimension).
- Dimension-level weights remain fixed: identity=0.25, need=0.50, behavior=0.25.
- Sessions with fewer than 50% of `need` fields populated are excluded from clustering (generic completeness filter).
- The first field of `mapping.need` is used as the primary discriminant and marked `required: true` on auto-generated personas.

---

## Migration & lifecycle

### Initial population

For each new client, a row in `tenant_config` must be inserted **before** any Edge Function in their dashboard runs. Recommended workflow:

1. **Phase 1 (current)**: Admin portal generates a SQL `INSERT … ON CONFLICT … DO UPDATE` statement via `extract-brand-context`. Operator manually executes it in the client's Supabase SQL Editor.
2. **Phase 2 (planned)**: Admin portal pushes the configuration directly via the client Supabase REST API, using stored URL + service_role key in `organizations.client_supabase_url` / `client_supabase_service_key`.

### Updating the contract

If a new field is needed (e.g., a new integration, a new persona dimension), the workflow is:

1. Update this document first.
2. Add a database migration to alter the `tenant_config` table or update the JSONB structure documentation.
3. Update `loadTenantConfig.ts` to expose the new field on the `TenantConfig` type.
4. Update consumers that need the new field.
5. Update the producer (`extract-brand-context`) to populate the new field.
6. Backfill the field for existing tenants (if applicable).

### Versioning

This contract is **not formally versioned** today. If breaking changes become necessary, introduce a `schema_version` column on `tenant_config` and write migration logic in `loadTenantConfig` to handle multiple versions transparently.

---

## Validation checklist before going live with a new client

Before activating the dashboard for a new client, verify:

- [ ] `tenant_config` row exists with the correct `project_id`.
- [ ] `brand_name` is set (required).
- [ ] `brand_tone`, `brand_description`, `target_audience`, `industry` are set (recommended for quality AI output).
- [ ] `client_context_json` is populated with at least `brand`, `description`, `tone`, `channels`.
- [ ] `persona_dimension_mapping` is set with at least 2 fields per dimension.
- [ ] `integrations_enabled` flags are aligned with the credentials/IDs provided in the corresponding columns.
- [ ] `currency`, `locale`, `timezone` match the client's market.
- [ ] `dashboard_url` and `diagnostic_url` point to the deployed projects.

---

## Reference test SQL (for manual onboarding)

```sql
INSERT INTO public.tenant_config (
  project_id, brand_name, brand_tone, brand_description,
  target_audience, industry, currency, locale, timezone,
  dashboard_url, diagnostic_url,
  client_context_json,
  integrations_enabled,
  persona_detection_params,
  persona_dimension_mapping
) VALUES (
  'cottan',
  'Cottan',
  'Expert, chaleureux, axé sur le confort et le sommeil',
  'Marque de literie haut de gamme française, fabrication artisanale.',
  'femmes 30-55 ans soucieuses de leur literie',
  'literie haut de gamme',
  'EUR',
  'fr-FR',
  'Europe/Paris',
  'https://dashboard.cottan.example',
  'https://diagnostic.cottan.example',
  '{
    "brand": "Cottan",
    "description": "Marque de literie haut de gamme française, fabrication artisanale.",
    "tone": "Expert, chaleureux, axé sur le confort et le sommeil",
    "products": [],
    "channels": ["Meta Ads", "Email (Klaviyo)", "Pinterest"],
    "promoCode": "",
    "shopify_url": "cottan.fr"
  }'::jsonb,
  '{"shopify": false, "klaviyo": false, "ga4": false, "meta_pixel": false}'::jsonb,
  '{"min_cluster_size": 30, "min_split_size": 20, "max_persona_size": 80, "weak_score_threshold": 75, "display_threshold_pct": 0.05, "display_threshold_min": 3}'::jsonb,
  '{
    "identity": ["sleeper_count", "is_existing_client", "household_type"],
    "need": ["mattress_type", "sleep_issue", "preferred_firmness", "bedroom_size"],
    "behavior": ["priority_1", "trust_trigger_1", "purchase_urgency", "content_format_preference"]
  }'::jsonb
)
ON CONFLICT (project_id) DO UPDATE SET
  brand_name = EXCLUDED.brand_name,
  brand_tone = EXCLUDED.brand_tone,
  brand_description = EXCLUDED.brand_description,
  target_audience = EXCLUDED.target_audience,
  industry = EXCLUDED.industry,
  client_context_json = EXCLUDED.client_context_json,
  integrations_enabled = EXCLUDED.integrations_enabled,
  persona_dimension_mapping = EXCLUDED.persona_dimension_mapping,
  updated_at = now();
```
