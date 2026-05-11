/**
 * Shared helper to load tenant configuration from the tenant_config table.
 *
 * This is the single source of truth for brand information, industry, target
 * audience, integration flags, and all other tenant-specific settings. It
 * replaces the hardcoded `PROJECT_ID = "ouate"` pattern that existed in the
 * original Ouate dashboard.
 *
 * The tenant_config table contains exactly one row per deployed dashboard.
 * The first (and only) row is returned by this helper. This is a template
 * design choice: each dashboard instance is single-tenant by architecture.
 *
 * Implements in-memory caching with a 5-minute TTL to avoid hitting the
 * database on every Edge Function invocation. The cache is per-instance
 * (each Edge Function container has its own cache), which is acceptable
 * since tenant config changes are infrequent.
 *
 * Usage:
 *   import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";
 *
 *   const config = await loadTenantConfig();
 *   const brandName = config.brand_name;
 *   const tone = config.brand_tone || "neutral professional";
 *   const context = config.client_context_json;
 *
 * Throws if the tenant_config table is empty (should never happen in a
 * properly onboarded dashboard, but we fail loudly to prevent silent misbehavior).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type TenantConfig = {
  id: string;
  project_id: string;
  brand_name: string;
  brand_tone: string | null;
  brand_description: string | null;
  target_audience: string | null;
  industry: string | null;
  currency: string;
  locale: string;
  timezone: string;
  dashboard_url: string | null;
  diagnostic_url: string | null;
  client_context_json: Record<string, unknown> | null;
  integrations_enabled: {
    shopify: boolean;
    klaviyo: boolean;
    omnisend: boolean;
    mailchimp: boolean;
    brevo: boolean;
    ga4: boolean;
    meta_pixel: boolean;
  };
  shopify_store_domain: string | null;
  klaviyo_list_id: string | null;
  ga4_landing_path: string | null;
  meta_pixel_id: string | null;
  persona_detection_params: {
    min_cluster_size: number;
    min_split_size: number;
    max_persona_size: number;
    weak_score_threshold: number;
    min_sessions_to_keep_after_30_days: number;
    similarity_threshold_b1: number;
    min_score_gain_b3: number;
  };
  persona_dimension_mapping: {
    identity: string[];
    need: string[];
    behavior: string[];
  };
  created_at: string;
  updated_at: string;
};

// In-memory cache (per Edge Function container)
type CacheEntry = {
  config: TenantConfig;
  expiresAt: number;
};
let cached: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load the tenant configuration. Returns the cached value if still fresh,
 * otherwise fetches from the database.
 *
 * @param forceRefresh - if true, bypass cache and re-read from database
 */
export async function loadTenantConfig(
  forceRefresh = false
): Promise<TenantConfig> {
  const now = Date.now();

  // Return cached value if still fresh
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.config;
  }

  // Fetch from database
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await client
    .from("tenant_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[loadTenantConfig] Database error: ${error.message} (${error.code})`
    );
  }

  if (!data) {
    throw new Error(
      "[loadTenantConfig] tenant_config table is empty. " +
        "A row must be inserted during client onboarding before any Edge Function can run. " +
        "See ONBOARDING_CLIENT_ASKIT.md for the onboarding procedure."
    );
  }

  // Update cache
  cached = {
    config: data as TenantConfig,
    expiresAt: now + CACHE_TTL_MS,
  };

  return cached.config;
}

/**
 * Clear the in-memory cache. Useful for tests or after an explicit config update.
 */
export function clearTenantConfigCache(): void {
  cached = null;
}
