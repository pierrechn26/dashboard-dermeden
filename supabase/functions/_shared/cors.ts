/**
 * Shared CORS headers for all Edge Functions.
 *
 * These headers allow any origin to call the Edge Functions. Specific Edge Functions
 * that need stricter CORS (e.g. admin-only functions) should override these locally.
 *
 * Usage:
 *   import { corsHeaders } from "../_shared/cors.ts";
 *
 *   // Handle OPTIONS preflight
 *   if (req.method === "OPTIONS") {
 *     return new Response(null, { headers: corsHeaders });
 *   }
 *
 *   // On regular responses
 *   return new Response(JSON.stringify(data), {
 *     headers: { ...corsHeaders, "Content-Type": "application/json" },
 *   });
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
