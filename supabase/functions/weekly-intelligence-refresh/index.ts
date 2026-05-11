// ============================================================
// weekly-intelligence-refresh — Lightweight weekly cron
// Refreshes persona metrics + quick Perplexity trends
// Schedule: 0 7 * * 1 (Monday 07:00 UTC)
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";
import { paginateQuery } from "../_shared/paginateSupabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// PROJECT_ID is now loaded dynamically from tenant_config inside the handler

function getMonday(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const now = new Date();
  console.log(`[weekly-intelligence-refresh] Started at ${now.toISOString()}, day=${now.getUTCDay()} (0=Sun,1=Mon,...,6=Sat)`);

  let isForce = false;
  try {
    const text = await req.text();
    if (text) {
      const body = JSON.parse(text);
      isForce = body.force === true;
    }
  } catch {}

  // Guard: only run on Monday unless forced
  if (!isForce && now.getUTCDay() !== 1) {
    console.log("[weekly-intelligence-refresh] Skipped: not Monday");
    return new Response(JSON.stringify({ status: "skipped", reason: "not_monday" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Read project_id dynamically from tenant_config (replaces hardcoded "ouate")
  const tenantConfig = await loadTenantConfig();
  const PROJECT_ID = tenantConfig.project_id;

  try {
    const monthYear = getCurrentMonthYear();
    const startTime = Date.now();

    // A) Check for existing market_intelligence this month
    const { data: intel, error: intelErr } = await supabase
      .from("market_intelligence")
      .select("id, personas_snapshot")
      .eq("project_id", PROJECT_ID)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intelErr || !intel) {
      console.log("[weekly-intelligence-refresh] No complete market_intelligence found. Skipping.");
      return new Response(JSON.stringify({ status: "skipped", reason: "no_market_intelligence" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // B) Refresh persona metrics from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [sessions, orders, personasRes] = await Promise.all([
      paginateQuery((from, to) =>
        supabase
          .from("diagnostic_sessions")
          .select("persona_code, status, conversion, validated_cart_amount, recommended_products")
          .gte("created_at", thirtyDaysAgo)
          .range(from, to)
      ),
      paginateQuery((from, to) =>
        supabase
          .from("client_orders")
          .select("diagnostic_session_id, total_price, customer_email")
          .gte("created_at", thirtyDaysAgo)
          .eq("is_from_diagnostic", true)
          .range(from, to)
      ),
      supabase
        .from("personas")
        .select("code, name, full_label, session_count, avg_matching_score, is_active")
        .eq("is_active", true),
    ]);

    const personas = personasRes.data || [];

    // Calculate per-persona metrics
    const personaMetrics: Record<string, any> = {};
    for (const p of personas) {
      const pSessions = sessions.filter((s: any) => s.persona_code === p.code);
      const completed = pSessions.filter((s: any) => s.status === "termine");
      const converted = pSessions.filter((s: any) => s.conversion);
      const aovValues = converted
        .map((s: any) => parseFloat(s.validated_cart_amount))
        .filter((v: number) => !isNaN(v) && v > 0);

      personaMetrics[p.code] = {
        name: p.name,
        full_label: p.full_label,
        sessions_30d: pSessions.length,
        completed_30d: completed.length,
        converted_30d: converted.length,
        conversion_rate: completed.length > 0
          ? Math.round((converted.length / completed.length) * 1000) / 10
          : 0,
        avg_cart: aovValues.length > 0
          ? Math.round(aovValues.reduce((a: number, b: number) => a + b, 0) / aovValues.length * 100) / 100
          : 0,
        total_sessions: p.session_count,
        avg_matching_score: p.avg_matching_score,
      };
    }

    // Update personas_snapshot in market_intelligence
    const updatedSnapshot = {
      ...(intel.personas_snapshot || {}),
      refreshed_at: now.toISOString(),
      metrics: personaMetrics,
    };

    await supabase
      .from("market_intelligence")
      .update({ personas_snapshot: updatedSnapshot })
      .eq("id", intel.id);

    console.log(`[weekly-intelligence-refresh] Persona metrics refreshed for ${Object.keys(personaMetrics).length} personas`);

    // C) Quick Perplexity refresh (1 call, 5 key points)
    let weeklyTrends: any = null;
    try {
      const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
      if (PERPLEXITY_API_KEY) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const sectorLabel = tenantConfig.industry || "e-commerce DTC";
        const pplxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar-pro",
            messages: [
              {
                role: "system",
                content: `Tu es un analyste marketing spécialisé en e-commerce ${sectorLabel}. Réponds en JSON.`
              },
              {
                role: "user",
                content: `Quelles sont les actualités et tendances marketing e-commerce ${sectorLabel} des 7 derniers jours ? Résume en 5 points clés maximum. Retourne un JSON : { "trends": [{ "title": "string", "summary": "string", "relevance": "high|medium|low" }], "refreshed_at": "${now.toISOString()}" }`
              }
            ],
            max_tokens: 1000,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (pplxResponse.ok) {
          const pplxData = await pplxResponse.json();
          const raw = pplxData.choices?.[0]?.message?.content || "";
          try {
            // Try parsing directly
            weeklyTrends = JSON.parse(raw.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
          } catch {
            // Fallback: extract JSON
            const firstBrace = raw.indexOf("{");
            const lastBrace = raw.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              try { weeklyTrends = JSON.parse(raw.slice(firstBrace, lastBrace + 1)); } catch {}
            }
          }

          // Log Perplexity usage
          const pplxTokens = pplxData.usage?.total_tokens || 0;
          await supabase.from("api_usage_logs").insert({
            edge_function: "weekly-intelligence-refresh",
            api_provider: "perplexity",
            model: "sonar-pro",
            tokens_used: pplxTokens,
            total_tokens: pplxTokens,
            api_calls: 1,
            metadata: { type: "weekly_trends_refresh" },
          });
        } else {
          console.warn(`[weekly-intelligence-refresh] Perplexity returned ${pplxResponse.status}`);
          await pplxResponse.text(); // consume body
        }
      } else {
        console.log("[weekly-intelligence-refresh] No PERPLEXITY_API_KEY, skipping trends refresh");
      }
    } catch (e: any) {
      console.warn("[weekly-intelligence-refresh] Perplexity refresh failed (non-blocking):", e.message);
    }

    // Store weekly trends if we got them
    if (weeklyTrends) {
      await supabase
        .from("market_intelligence")
        .update({ weekly_trends_refresh: weeklyTrends })
        .eq("id", intel.id);
      console.log(`[weekly-intelligence-refresh] Weekly trends stored (${weeklyTrends.trends?.length || 0} points)`);
    }

    const durationMs = Date.now() - startTime;
    console.log(`[weekly-intelligence-refresh] ✓ Complete in ${durationMs}ms`);

    return new Response(JSON.stringify({
      status: "complete",
      duration_ms: durationMs,
      personas_refreshed: Object.keys(personaMetrics).length,
      trends_refreshed: !!weeklyTrends,
      trends_count: weeklyTrends?.trends?.length || 0,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("[weekly-intelligence-refresh] Error:", err);
    return new Response(JSON.stringify({
      status: "error",
      message: err.message || "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
