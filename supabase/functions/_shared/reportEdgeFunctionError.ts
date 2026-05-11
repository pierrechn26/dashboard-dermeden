/**
 * Shared helper to report Edge Function errors to the Ask-it admin portal.
 *
 * Called from catch blocks in Edge Functions to centralize error monitoring.
 * The admin portal provides a unified /admin/errors dashboard to review errors
 * across all tenants with AI-powered grouping and analysis.
 *
 * Fire-and-forget: errors during reporting are silently swallowed. This helper
 * must never block or fail the calling Edge Function.
 *
 * Required secrets:
 *   - MONITORING_API_KEY : API key for the portal's report-error endpoint
 *                         (if not set, reporting is skipped silently)
 *
 * Usage:
 *   import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";
 *
 *   try {
 *     // ... your code
 *   } catch (error) {
 *     reportEdgeFunctionError("aski-chat", error, {
 *       severity: "error",
 *       type: "anthropic_api_failure",
 *       session_id: sessionId,
 *     });
 *     throw error; // or return an error response
 *   }
 */

import { getPortalEndpoint } from "./portalUrls.ts";

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export type ErrorContext = {
  severity?: ErrorSeverity;
  type?: string;
  [key: string]: unknown;
};

export async function reportEdgeFunctionError(
  functionName: string,
  error: unknown,
  context?: ErrorContext
): Promise<void> {
  try {
    const apiKey = Deno.env.get("MONITORING_API_KEY");
    if (!apiKey) return;

    const err = error as Error;
    await fetch(getPortalEndpoint("report-error"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-monitoring-key": apiKey,
      },
      body: JSON.stringify({
        errors: [
          {
            source: "edge_function",
            severity: context?.severity || "error",
            error_type: context?.type || "internal_error",
            function_name: functionName,
            message: err?.message || String(error),
            stack_trace: err?.stack || "",
            context: {
              ...context,
              timestamp: new Date().toISOString(),
            },
          },
        ],
      }),
    });
  } catch {
    // Fire-and-forget: never fail the caller because of monitoring errors
  }
}
