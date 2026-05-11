/**
 * Hook to load tenant configuration from the database (single source of truth).
 *
 * The tenant_config table is the contract that drives all client-specific
 * behavior across the dashboard:
 *   - Brand name, tone, description (used in headers and labels)
 *   - Industry and target audience (used in AI prompts)
 *   - Persona dimension mapping (used to build dynamic table columns)
 *   - Integration flags (used to conditionally show/hide UI sections)
 *
 * The result is cached in module-level memory so subsequent calls across
 * different components don't re-fetch the same row.
 *
 * See TENANT_CONFIG_CONTRACT.md at repo root for the full schema.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TenantConfig {
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
    shopify?: boolean;
    klaviyo?: boolean;
    ga4?: boolean;
    meta_pixel?: boolean;
  } | null;
  shopify_store_domain: string | null;
  klaviyo_list_id: string | null;
  ga4_landing_path: string | null;
  meta_pixel_id: string | null;
  persona_detection_params: {
    min_cluster_size?: number;
    min_split_size?: number;
    max_persona_size?: number;
    weak_score_threshold?: number;
    display_threshold_pct?: number;
    display_threshold_min?: number;
  } | null;
  persona_dimension_mapping: {
    identity?: string[];
    need?: string[];
    behavior?: string[];
  } | null;
}

interface TenantConfigState {
  config: TenantConfig | null;
  isLoading: boolean;
  error: string | null;
}

let _cache: TenantConfig | null = null;
let _cachePromise: Promise<TenantConfig | null> | null = null;

/**
 * Default fallback used while the database row is being loaded
 * (or if no row exists yet — e.g., during initial onboarding).
 * The dashboard remains usable but with neutral generic labels.
 */
const FALLBACK_CONFIG: TenantConfig = {
  project_id: "default",
  brand_name: "—",
  brand_tone: null,
  brand_description: null,
  target_audience: null,
  industry: null,
  currency: "EUR",
  locale: "fr-FR",
  timezone: "Europe/Paris",
  dashboard_url: null,
  diagnostic_url: null,
  client_context_json: null,
  integrations_enabled: null,
  shopify_store_domain: null,
  klaviyo_list_id: null,
  ga4_landing_path: null,
  meta_pixel_id: null,
  persona_detection_params: null,
  persona_dimension_mapping: null,
};

async function fetchTenantConfig(): Promise<TenantConfig | null> {
  // deno-lint-ignore no-explicit-any
  const { data, error } = await (supabase as any)
    .from("tenant_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[useTenantConfig] DB load failed:", error.message);
    return null;
  }
  if (!data) {
    console.warn("[useTenantConfig] No tenant_config row found. Using fallback.");
    return null;
  }
  return data as TenantConfig;
}

export function useTenantConfig(): TenantConfigState {
  const [config, setConfig] = useState<TenantConfig | null>(_cache);
  const [isLoading, setIsLoading] = useState(!_cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache) {
      setConfig(_cache);
      setIsLoading(false);
      return;
    }

    if (!_cachePromise) {
      _cachePromise = fetchTenantConfig();
    }

    _cachePromise
      .then((data) => {
        if (data) {
          _cache = data;
          setConfig(data);
        } else {
          setConfig(FALLBACK_CONFIG);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err?.message || "Unknown error");
        setConfig(FALLBACK_CONFIG);
        setIsLoading(false);
      });
  }, []);

  return { config, isLoading, error };
}

/** Lightweight helper to read brand_name without using the full hook */
export function getBrandNameSync(): string {
  return _cache?.brand_name || "—";
}

/** Lightweight helper to read project_id without using the full hook */
export function getProjectIdSync(): string {
  return _cache?.project_id || "default";
}
