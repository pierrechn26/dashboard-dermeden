import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { paginateQuery } from "../_shared/paginateSupabase.ts";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }


  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Cf. backlog #3.4 — load tenant_id for the defensive client_orders filter.
    const tenantConfig = await loadTenantConfig();
    const tenantId = tenantConfig.project_id;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromDate = thirtyDaysAgo.toISOString();

    // Fetch completed sessions from last 30 days WITH first item nested.
    // ⚠️ Reads need fields (skin_concern, age_range, has_routine) from item_metadata
    // JSONB. assignPersonaCode below remains Ouate-specific and is preserved as legacy.
    // For new tenants, persona_code is set by diagnostic-webhook + detect-persona-clusters.
    // Note: dropped the bogus `.limit(10000)` — PostgREST silently caps at 1000 anyway.
    // paginateQuery fetches all rows in batches (cf. backlog #2.1).
    const sessions = await paginateQuery<any>((from, to) =>
      supabase
        .from("diagnostic_sessions")
        .select(`
          id, session_code, persona_code, engagement_score, optin_email, number_of_children,
          is_existing_client,
          diagnostic_items(item_index, age, item_metadata)
        `)
        .eq("status", "termine")
        .gte("created_at", fromDate)
        .range(from, to)
    );

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ status: "no_data" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign persona codes (LEGACY OUATE: ignore P0, recalculate using item_metadata)
    function assignPersonaCode(session: any, items: any[]): string {
      const c1 = items.find((c: any) => c.item_index === 0) || items[0];
      const c2 = items.find((c: any) => c.item_index === 1);
      if (!c1) return "P6";
      const m1 = c1.item_metadata || {};
      const m2 = c2?.item_metadata || {};
      if (session.is_existing_client) return m1.skin_concern === "imperfections" ? "P8" : "P9";
      if (session.number_of_children >= 2 && c2 && m1.skin_concern !== m2.skin_concern) return "P5";
      if (m1.has_routine === true) return "P7";
      if (m1.skin_concern === "imperfections" && m1.age_range === "10-11") return "P2";
      if (m1.skin_concern === "imperfections") return "P1";
      if (m1.skin_concern === "atopique") return "P3";
      if (m1.skin_concern === "sensible") return "P4";
      return "P6";
    }

    // Build item map + effective persona code per session
    const itemBySession: Record<string, { age_range: string | null; age: number | null }> = {};
    const sessionPersonaCode: Record<string, string> = {};
    for (const s of sessions) {
      const items = ((s as any).diagnostic_items || []) as any[];
      const sortedItems = items.sort((a: any, b: any) => (a.item_index ?? 0) - (b.item_index ?? 0));
      if (sortedItems.length > 0) {
        const meta = sortedItems[0].item_metadata || {};
        itemBySession[s.id] = { age: sortedItems[0].age, age_range: meta.age_range ?? null };
      }
      const effectiveCode = (s.persona_code && s.persona_code !== 'P0')
        ? s.persona_code
        : assignPersonaCode(s, sortedItems);
      sessionPersonaCode[s.id] = effectiveCode;
    }

    // Fetch orders
    const sessionCodes = sessions.map((s: any) => s.session_code);
    const orders = await paginateQuery((from, to) =>
      supabase
        .from("client_orders")
        .select("diagnostic_session_id, total_price, is_from_diagnostic")
        .eq("tenant_id", tenantId)
        .in("diagnostic_session_id", sessionCodes)
        .range(from, to)
    );

    // Build order lookup by session_code
    const ordersByCode: Record<string, any[]> = {};
    for (const o of (orders || [])) {
      const sc = o.diagnostic_session_id;
      if (sc) {
        if (!ordersByCode[sc]) ordersByCode[sc] = [];
        ordersByCode[sc].push(o);
      }
    }

    // Global metrics
    const allOrders = orders || [];
    const globalConvRate = sessions.length > 0 ? allOrders.length / sessions.length : 0;
    const globalAOV = allOrders.length > 0
      ? allOrders.reduce((s: number, o: any) => s + (Number(o.total_price) || 0), 0) / allOrders.length
      : 0;

    // Per-persona aggregation — load active non-pool personas dynamically
    const { data: personasData, error: personasErr } = await supabase
      .from("personas")
      .select("code, is_existing_client_persona")
      .eq("is_active", true)
      .eq("is_pool", false)
      .order("code");
    if (personasErr) throw new Error(`Personas fetch error: ${personasErr.message}`);
    const personaCodes = (personasData || []).map((p: any) => p.code);

    // Build set of existing-client persona codes (excluded from ROI Acquisition)
    const existingClientCodes = new Set<string>(
      (personasData || [])
        .filter((p: any) => p.is_existing_client_persona === true)
        .map((p: any) => p.code)
    );
    const personaStats: Record<string, any> = {};

    for (const code of personaCodes) {
      const pSessions = sessions.filter((s: any) => sessionPersonaCode[s.id] === code);
      const volume = pSessions.length;
      if (volume === 0) continue;

      const pSessionCodes = pSessions.map((s: any) => s.session_code);
      const pOrders = allOrders.filter((o: any) => pSessionCodes.includes(o.diagnostic_session_id));
      const conversions = pOrders.length;
      const totalRevenue = pOrders.reduce((s: number, o: any) => s + (Number(o.total_price) || 0), 0);
      const aov = conversions > 0 ? totalRevenue / conversions : 0;
      const convRate = conversions / volume;

      // Optin email %
      const optinEmailCount = pSessions.filter((s: any) => s.optin_email === true).length;
      const optinEmailPct = optinEmailCount / volume;

      // Multi-children %
      const multiChildrenCount = pSessions.filter((s: any) => (s.number_of_children || 1) > 1).length;
      const multiChildrenPct = multiChildrenCount / volume;

      // Dominant age range of first child + average age (fallback to age_range midpoint)
      function getAgeEstimate(age: number | null, ageRange: string | null): number | null {
        if (age !== null && age !== undefined) return age;
        if (!ageRange) return null;
        const midpoints: Record<string, number> = { "4-6": 5, "7-9": 8, "10-11": 10.5 };
        return midpoints[ageRange] ?? null;
      }
      const ageRanges: Record<string, number> = {};
      const ages: number[] = [];
      for (const s of pSessions) {
        const child = itemBySession[s.id];
        if (child) {
          if (child.age_range) ageRanges[child.age_range] = (ageRanges[child.age_range] || 0) + 1;
          const est = getAgeEstimate(child.age, child.age_range);
          if (est !== null) ages.push(est);
        }
      }
      let dominantAgeRange: string | null = null;
      let maxCount = 0;
      for (const [ar, count] of Object.entries(ageRanges)) {
        if (count > maxCount) { dominantAgeRange = ar; maxCount = count; }
      }
      const avgChildAge = ages.length > 0
        ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10
        : null;

      personaStats[code] = {
        code,
        volume,
        conversions,
        convRate: Math.round(convRate * 1000) / 10,
        aov: Math.round(aov * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        optinEmailPct: Math.round(optinEmailPct * 1000) / 10,
        multiChildrenPct: Math.round(multiChildrenPct * 1000) / 10,
        dominantAgeRange,
        avgChildAge,
      };
    }

    const activePersonas = Object.values(personaStats);
    const globalConvPct = Math.round(globalConvRate * 1000) / 10;

    // === CATÉGORIE 1: Meilleur ROI Acquisition ===
    let bestROI: any = null;
    let bestROIValue = 0;
    for (const p of activePersonas) {
      // Exclude existing client personas from acquisition ROI
      if (existingClientCodes.has(p.code)) continue;
      const valuePerSession = (p.convRate / 100) * p.aov;
      if (valuePerSession > bestROIValue) {
        bestROIValue = valuePerSession;
        bestROI = { ...p, valuePerSession: Math.round(valuePerSession * 100) / 100 };
      }
    }

    // === CATÉGORIE 2: Plus gros levier de croissance ===
    // Exclude the persona already chosen for ROI
    const excludedAfterROI = new Set([bestROI?.code].filter(Boolean));
    let bestGrowth: any = null;
    let bestGrowthCA = 0;
    for (const p of activePersonas) {
      if (excludedAfterROI.has(p.code)) continue;
      if (p.convRate >= globalConvPct || p.volume < 5) continue;
      const caManquant = ((globalConvPct - p.convRate) / 100) * p.volume * p.aov;
      if (caManquant > bestGrowthCA) {
        bestGrowthCA = caManquant;
        bestGrowth = { ...p, caManquant: Math.round(caManquant) };
      }
    }

    // === CATÉGORIE 3: Meilleur potentiel de fidélisation ===
    // Exclude personas already chosen for ROI and Growth
    const excludedAfterGrowth = new Set([bestROI?.code, bestGrowth?.code].filter(Boolean));
    let bestLTV: any = null;
    let bestLTVScore = 0;
    for (const p of activePersonas) {
      if (excludedAfterGrowth.has(p.code)) continue;
      let scoreAge = 2;
      if (p.dominantAgeRange === "4-6") scoreAge = 3;
      else if (p.dominantAgeRange === "7-9") scoreAge = 2;
      else if (p.dominantAgeRange === "10-11") scoreAge = 1;

      const coeffMulti = p.multiChildrenPct > 20 ? 1.5 : 1.0;
      const ltvScore = scoreAge * (p.optinEmailPct / 100) * coeffMulti * (p.aov / 50);

      if (ltvScore > bestLTVScore) {
        bestLTVScore = ltvScore;
        bestLTV = { ...p, ltvScore: Math.round(ltvScore * 100) / 100, scoreAge, coeffMulti };
      }
    }

    return new Response(JSON.stringify({
      status: "ok",
      globalConvRate: globalConvPct,
      globalAOV: Math.round(globalAOV * 100) / 100,
      totalSessions: sessions.length,
      bestROI,
      bestGrowth,
      bestLTV,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[persona-priorities] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
