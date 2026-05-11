/**
 * Shared helper to notify the Ask-it admin portal when a quota threshold is crossed.
 *
 * Called by Edge Functions that consume metered resources (aski-chat, generate-
 * recommendation-content, diagnostic-webhook). The portal uses these notifications
 * to trigger email alerts at 80% and 100% of quota.
 *
 * Fire-and-forget: errors are logged but never thrown. This helper must never
 * block or fail the calling Edge Function.
 *
 * Required secrets:
 *   - ORGANIZATION_ID : UUID of the tenant's organization in the admin portal
 *   - USAGE_STATS_API_KEY : API key for the portal's quota-threshold-reached endpoint
 *                          (fallback "askit-usage-stats-2026" is a dev default)
 *
 * Usage:
 *   import { notifyPortalThreshold } from "../_shared/notifyPortalThreshold.ts";
 *
 *   if (usageAfterThisCall >= limit) {
 *     notifyPortalThreshold("aski", 100, usageAfterThisCall, limit);
 *   } else if (usageAfterThisCall >= limit * 0.8) {
 *     notifyPortalThreshold("aski", 80, usageAfterThisCall, limit);
 *   }
 */

import { getPortalEndpoint } from "./portalUrls.ts";

export type ResourceType = "aski" | "recommendations" | "diagnostic";
export type Threshold = 80 | 100;

export function notifyPortalThreshold(
  resourceType: ResourceType,
  threshold: Threshold,
  current: number,
  limit: number
): void {
  try {
    const portalEndpoint = getPortalEndpoint("quota-threshold-reached");
    const apiKey =
      Deno.env.get("USAGE_STATS_API_KEY") || "askit-usage-stats-2026";
    const organizationId = Deno.env.get("ORGANIZATION_ID");

    if (!organizationId) {
      console.warn("[quota-notify] ORGANIZATION_ID not set, skipping notification");
      return;
    }

    fetch(portalEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        organization_id: organizationId,
        resource_type: resourceType,
        threshold,
        current_usage: current,
        limit,
      }),
    }).catch((e) =>
      console.error("[quota-notify] Failed:", (e as Error).message)
    );
  } catch (e) {
    console.error("[quota-notify] Error:", e);
  }
}
