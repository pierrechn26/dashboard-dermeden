// ============================================================
// generate-marketing-recommendations — V3 (API layer)
// GET  → retourne toutes les recommandations actives + quota
// POST → update_status / submit_feedback
// La GÉNÉRATION est maintenant dans weekly-recommendations
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";
import { paginateQuery } from "../_shared/paginateSupabase.ts";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// PROJECT_ID is now loaded dynamically from tenant_config inside the handler
// and passed as a parameter to helper functions that need it

// ── Quota helper ──────────────────────────────────────────────────────

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function getQuota(supabase: any, projectId: string) {
  const { data: planData } = await supabase
    .from("client_plan")
    .select("plan, recos_monthly_limit")
    .eq("project_id", projectId)
    .maybeSingle();

  const planLimits: Record<string, number> = { starter: 24, growth: 60, scale: 240 };
  const planName = planData?.plan ?? "growth";
  const monthlyLimit = planData?.recos_monthly_limit ?? planLimits[planName] ?? 60;

  const now = new Date();
  const utcMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const utcNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const { count: usedCount } = await supabase
    .from("marketing_recommendations")
    .select("*", { count: "exact", head: true })
    .gte("generated_at", utcMonthStart)
    .lt("generated_at", utcNextMonth);

  const totalGenerated = usedCount ?? 0;

  const monthYear = getCurrentMonthYear();
  const { data: usageData } = await supabase
    .from("recommendation_usage")
    .select("generations_log")
    .eq("project_id", projectId)
    .eq("month_year", monthYear)
    .maybeSingle();

  return {
    total_generated: totalGenerated,
    monthly_limit: monthlyLimit,
    remaining: Math.max(0, monthlyLimit - totalGenerated),
    plan: planName,
    generations_log: usageData?.generations_log || [],
  };
}

// ── Feedback score calculation ────────────────────────────────────────

function parseRange(val: string): { low: number; high: number } | null {
  if (!val) return null;
  const cleaned = String(val).replace(/[%x€]/g, "").trim();
  const rangeMatch = cleaned.match(/([\d.,]+)\s*[-–]\s*([\d.,]+)/);
  if (rangeMatch) {
    return { low: parseFloat(rangeMatch[1].replace(",", ".")), high: parseFloat(rangeMatch[2].replace(",", ".")) };
  }
  const single = parseFloat(cleaned.replace(",", "."));
  if (!isNaN(single)) return { low: single * 0.9, high: single };
  return null;
}

function calculateFeedbackScore(results: any, kpiAttendu: any, category: string): string | null {
  if (!results || !kpiAttendu || typeof kpiAttendu !== "object") return null;

  // Normalize KPI structure: handle both { CTR: "2-3%" } and { metrique: "CTR", valeur_cible: "2-3%" }
  const normalizedKpi: Record<string, string> = {};
  if (kpiAttendu.metrique && kpiAttendu.valeur_cible) {
    normalizedKpi[kpiAttendu.metrique] = kpiAttendu.valeur_cible;
  }
  if (kpiAttendu.metrique_secondaire && kpiAttendu.valeur_secondaire) {
    normalizedKpi[kpiAttendu.metrique_secondaire] = kpiAttendu.valeur_secondaire;
  }
  // Also support flat format { CTR: "2-3%", ROAS: "3-4x" }
  for (const [k, v] of Object.entries(kpiAttendu)) {
    if (!["metrique", "valeur_cible", "metrique_secondaire", "valeur_secondaire"].includes(k) && typeof v === "string") {
      normalizedKpi[k] = v;
    }
  }

  if (Object.keys(normalizedKpi).length === 0) return null;

  const mappings: Record<string, { resultKey: string; kpiKeys: string[] }[]> = {
    ads: [
      { resultKey: "ctr", kpiKeys: ["CTR", "ctr"] },
      { resultKey: "roas", kpiKeys: ["ROAS", "roas"] },
    ],
    emails: [
      { resultKey: "taux_ouverture", kpiKeys: ["taux_ouverture_vise", "Ouverture", "ouverture", "Taux d'ouverture"] },
      { resultKey: "taux_clic", kpiKeys: ["taux_clic_vise", "Clic", "clic", "Taux de clic"] },
    ],
    offers: [
      { resultKey: "taux_conversion", kpiKeys: ["Taux de conversion", "taux_conversion", "conversion"] },
      { resultKey: "panier_moyen", kpiKeys: ["AOV impact", "panier_moyen", "aov", "Panier moyen"] },
    ],
  };

  const maps = mappings[category] || [];
  const scores: string[] = [];

  for (const m of maps) {
    const actual = parseFloat(String(results[m.resultKey] ?? ""));
    if (isNaN(actual)) continue;

    let range: { low: number; high: number } | null = null;
    for (const k of m.kpiKeys) {
      if (normalizedKpi[k]) { range = parseRange(normalizedKpi[k]); break; }
    }
    if (!range) continue;

    if (actual >= range.high) scores.push("good");
    else if (actual >= range.low * 0.8) scores.push("average");
    else scores.push("poor");
  }

  if (scores.length === 0) return null;
  if (scores.length === 1) return scores[0];

  const counts = { good: 0, average: 0, poor: 0 };
  scores.forEach((s) => counts[s as keyof typeof counts]++);
  if (counts.good >= counts.average && counts.good >= counts.poor) return "good";
  if (counts.poor >= counts.good && counts.poor >= counts.average) return "poor";
  return "average";
}

// ── MAIN HANDLER ───────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Read project_id dynamically from tenant_config (replaces hardcoded "ouate")
  const tenantConfig = await loadTenantConfig();
  const projectId = tenantConfig.project_id;

  try {
    // ════════════════════════════════════════════════════════
    // GET — Retourne toutes les recommandations actives + quota
    // ════════════════════════════════════════════════════════
    if (req.method === "GET") {
      const [recsAll, quota, intelligenceResult] = await Promise.all([
        paginateQuery((from, to) =>
          supabase
            .from("marketing_recommendations")
            .select("*, generation_status")
            .eq("status", "active")
            .order("generated_at", { ascending: false })
            .range(from, to)
        ),
        getQuota(supabase, projectId),
        supabase
          .from("market_intelligence")
          .select("month_year, status, updated_at, generation_duration_ms")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return new Response(
        JSON.stringify({
          recommendations: recsAll || [],
          quota,
          intelligence: intelligenceResult.data || null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ════════════════════════════════════════════════════════
    // POST — Actions sur les recommandations
    // ════════════════════════════════════════════════════════
    if (req.method === "POST") {
      let body: any = {};
      try {
        const text = await req.text();
        if (text) body = JSON.parse(text);
      } catch {}

      const { action, recommendation_id } = body;

      if (!action || !recommendation_id) {
        return new Response(
          JSON.stringify({ error: "action and recommendation_id are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── UPDATE STATUS ──────────────────────────────────────
      if (action === "update_status") {
        const { status } = body;
        if (!["todo", "in_progress", "done"].includes(status)) {
          return new Response(
            JSON.stringify({ error: "Invalid status. Must be: todo, in_progress, done" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const updatePayload: any = { action_status: status };
        if (status === "done") {
          updatePayload.completed_at = new Date().toISOString();
        } else {
          updatePayload.completed_at = null;
        }

        const { error } = await supabase
          .from("marketing_recommendations")
          .update(updatePayload)
          .eq("id", recommendation_id);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, recommendation_id, status }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── SUBMIT FEEDBACK ────────────────────────────────────
      if (action === "submit_feedback") {
        const { results, notes } = body;

        // Get the recommendation to access kpi_attendu and category
        const { data: rec, error: recErr } = await supabase
          .from("marketing_recommendations")
          .select("targeting, content, category")
          .eq("id", recommendation_id)
          .single();

        if (recErr || !rec) {
          return new Response(
            JSON.stringify({ error: "Recommendation not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Calculate feedback_score using category-aware logic
        const kpiAttendu = rec.targeting?.kpi_attendu || {};
        const recCategory = rec.category || "ads";
        const feedbackScore = calculateFeedbackScore(results, kpiAttendu, recCategory);

        const updatePayload: any = {
          feedback_results: results || {},
          feedback_score: feedbackScore,
          feedback_notes: notes || null,
          feedback_entered_at: new Date().toISOString(),
        };
        // Only set completed if not already done
        if (!rec.targeting?.already_done) {
          updatePayload.action_status = "done";
          updatePayload.completed_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from("marketing_recommendations")
          .update(updatePayload)
          .eq("id", recommendation_id);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, recommendation_id, feedback_score: feedbackScore }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}. Use: update_status, submit_feedback` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[generate-marketing] Unhandled error:", err);
    reportEdgeFunctionError("generate-marketing-recommendations", err, { type: "internal_error", severity: "error" });
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
