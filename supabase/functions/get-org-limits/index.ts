import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";
import { getPortalEndpoint } from "../_shared/portalUrls.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const organizationId = Deno.env.get("ORGANIZATION_ID")!;
  const monitoringApiKey = Deno.env.get("MONITORING_API_KEY")!;

  // Read project_id dynamically from tenant_config
  const tenantConfig = await loadTenantConfig();
  const projectId = tenantConfig.project_id;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Helper: read local client_plan as fallback
  async function getLocalLimits() {
    const { data } = await supabase
      .from("client_plan")
      .select("plan, sessions_limit, aski_limit, recos_monthly_limit")
      .eq("project_id", projectId)
      .single();

    if (!data) {
      return {
        plan: "scale",
        aski_limit: 2000,
        sessions_limit: 50000,
        recos_limit: 240,
        source: "hardcoded_fallback",
      };
    }
    return {
      plan: data.plan,
      aski_limit: data.aski_limit,
      sessions_limit: data.sessions_limit,
      recos_limit: data.recos_monthly_limit,
      source: "local_client_plan",
    };
  }

  try {
    // Call admin portal
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const portalRes = await fetch(getPortalEndpoint("get-organization-limits"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": monitoringApiKey,
      },
      body: JSON.stringify({ organization_id: organizationId }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!portalRes.ok) {
      console.warn(
        `[get-org-limits] Portal returned ${portalRes.status}, falling back to local`
      );
      const fallback = await getLocalLimits();
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const portalData = await portalRes.json();

    // Validate response shape
    if (
      !portalData.success ||
      !portalData.plan ||
      portalData.aski_limit == null ||
      portalData.sessions_limit == null ||
      portalData.recos_limit == null
    ) {
      console.warn(
        "[get-org-limits] Invalid portal response shape, falling back",
        portalData
      );
      const fallback = await getLocalLimits();
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sync local client_plan so other edge functions stay up to date
    const { error: upsertError } = await supabase
      .from("client_plan")
      .update({
        plan: portalData.plan,
        sessions_limit: portalData.sessions_limit,
        aski_limit: portalData.aski_limit,
        recos_monthly_limit: portalData.recos_limit,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId);

    if (upsertError) {
      console.warn("[get-org-limits] Failed to sync client_plan:", upsertError);
    }

    return new Response(
      JSON.stringify({
        plan: portalData.plan,
        aski_limit: portalData.aski_limit,
        sessions_limit: portalData.sessions_limit,
        recos_limit: portalData.recos_limit,
        source: "portal",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[get-org-limits] Error calling portal:", err);
    const fallback = await getLocalLimits();
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
