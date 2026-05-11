import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { paginateQuery } from "../_shared/paginateSupabase.ts";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";

// ⚠️  LEGACY OUATE-SPECIFIC FUNCTION ⚠️
// This Edge Function contains Ouate-specific logic (PERSONA_DEFINITIONS hardcoded
// to P1-P9, assignPersonaCode reading skin_concern/age_range from item_metadata
// directly). It overlaps with detect-persona-clusters and is preserved here only
// for backward compatibility with the Ouate dashboard.
//
// For new tenants, persona assignment is handled by:
//   - diagnostic-webhook (real-time scoring at session creation)
//   - detect-persona-clusters (cron-based auto-detection of new personas)
//
// TODO (Lot 8): evaluate whether this function should be deleted from the
// template entirely or kept as a Ouate-only utility. If kept, accesses like
// c1.skin_concern need to be rewritten as c1.item_metadata?.skin_concern.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PERSONA_DEFINITIONS: Record<string, { name: string; subtitle: string }> = {
  P1: { name: "La Novice Imperfections Enfant", subtitle: "Nouvelle cliente, enfant 4-9 ans avec imperfections" },
  P2: { name: "La Novice Imperfections Pré-ado", subtitle: "Nouvelle cliente, pré-ado 10-11 ans avec imperfections" },
  P3: { name: "La Novice Atopique", subtitle: "Nouvelle cliente, enfant à peau atopique" },
  P4: { name: "La Novice Sensible", subtitle: "Nouvelle cliente, enfant à peau sensible" },
  P5: { name: "La Multi-enfants Besoins Mixtes", subtitle: "Plusieurs enfants avec des types de peau différents" },
  P6: { name: "La Novice Découverte", subtitle: "Nouvelle cliente, peau sèche ou normale" },
  P7: { name: "L'Insatisfaite", subtitle: "A déjà une routine mais insatisfaite" },
  P8: { name: "La Fidèle Imperfections", subtitle: "Cliente existante, enfant avec imperfections" },
  P9: { name: "La Fidèle Exploratrice", subtitle: "Cliente existante, explore d'autres besoins" },
};

// deno-lint-ignore no-explicit-any
function assignPersonaCode(session: any, children: any[]): string {
  const c1 = children.find((c: any) => c.item_index === 0) || children[0];
  const c2 = children.find((c: any) => c.item_index === 1);

  if (!c1) return "P6";

  // P8/P9: existing client
  if (session.is_existing_client) {
    return c1.skin_concern === "imperfections" ? "P8" : "P9";
  }
  // P5: multi-children different skin
  if (session.number_of_children >= 2 && c2 && c1.skin_concern !== c2.skin_concern) {
    return "P5";
  }
  // P7: has routine
  if (c1.has_routine === true) return "P7";
  // P2: imperfections pre-teen
  if (c1.skin_concern === "imperfections" && c1.age_range === "10-11") return "P2";
  // P1: imperfections child
  if (c1.skin_concern === "imperfections") return "P1";
  // P3: atopic
  if (c1.skin_concern === "atopique") return "P3";
  // P4: sensitive
  if (c1.skin_concern === "sensible") return "P4";
  // P6: default
  return "P6";
}

// deno-lint-ignore no-explicit-any
function countTop(items: string[]): Array<{ value: string; count: number; pct: number }> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const v = item.trim();
    if (v) counts[v] = (counts[v] || 0) + 1;
  }
  const total = items.filter(i => i.trim()).length;
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);
}

// deno-lint-ignore no-explicit-any
function generateInsights(persona: any, globalAvg: any): string[] {
  const insights: string[] = [];
  const { conversionRate, aov, engagementAvg, multiChildrenPct, topReactivity, topPriority, topFormat } = persona;
  const gConv = globalAvg.conversionRate;
  const gAov = globalAvg.aov;

  if (gConv > 0 && conversionRate > gConv * 1.5) {
    insights.push(`Taux de conversion ${(conversionRate / gConv).toFixed(1)}× supérieur à la moyenne`);
  }
  if (gAov > 0 && aov > gAov * 1.2) {
    const pctAbove = Math.round(((aov - gAov) / gAov) * 100);
    insights.push(`AOV +${pctAbove}% au-dessus de la moyenne — fort potentiel panier`);
  }
  if (gAov > 0 && aov < gAov * 0.8) {
    const pctBelow = Math.round(((gAov - aov) / gAov) * 100);
    insights.push(`AOV -${pctBelow}% sous la moyenne — opportunité d'upsell`);
  }
  if (engagementAvg > 75 && conversionRate < 5) {
    insights.push("Engagement élevé mais faible conversion — frein à identifier");
  }
  if (multiChildrenPct > 20) {
    insights.push(`${Math.round(multiChildrenPct)}% de mamans multi-enfants — adapter le discours panier multiple`);
  }
  if (topReactivity && topReactivity.value === "environment" && topReactivity.pct > 50) {
    insights.push("Majorité de peaux réactives à l'environnement — mettre en avant la protection");
  }
  if (topPriority && topPriority.pct > 30) {
    insights.push(`Priorité "${topPriority.value}" à ${topPriority.pct}% — levier marketing clé`);
  }
  if (topFormat && topFormat.value === "short" && topFormat.pct > 40) {
    insights.push("Préfère le contenu court — privilégier les messages directs et concis");
  }
  if (gConv > 0 && conversionRate < gConv * 0.5 && conversionRate > 0) {
    insights.push("Taux de conversion très en-dessous de la moyenne — revoir l'argumentaire");
  }

  return insights.slice(0, 3);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }


  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const from = body.from ? new Date(body.from) : undefined;
    const to = body.to ? new Date(body.to) : undefined;
    const cutoffDate = "2026-02-08T00:00:00.000Z";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Cf. backlog #3.4 — load tenant_id for the defensive client_orders filter.
    const tenantConfig = await loadTenantConfig();
    const tenantId = tenantConfig.project_id;

    // Fetch all completed sessions with children (paginated via shared helper)
    let q = supabase
      .from("diagnostic_sessions")
      .select("*, diagnostic_items(*)")
      .eq("status", "termine")
      .gte("created_at", cutoffDate);

    if (from && new Date(from) > new Date(cutoffDate)) q = q.gte("created_at", from.toISOString());
    if (to) q = q.lte("created_at", to.toISOString());

    let allSessions: any[] = [];
    try {
      allSessions = await paginateQuery((rangeFrom, rangeTo) => q.range(rangeFrom, rangeTo));
    } catch (queryErr) {
      console.error("[persona-stats] Query error:", queryErr);
    }

    // Fetch orders for the period
    let ordQ = supabase
      .from("client_orders")
      .select("total_price, diagnostic_session_id")
      .eq("tenant_id", tenantId)
      .eq("is_from_diagnostic", true)
      .gt("total_price", 0);
    if (from) ordQ = ordQ.gte("created_at", from.toISOString());
    if (to) ordQ = ordQ.lte("created_at", to.toISOString());
    const ordersList = await paginateQuery((rangeFrom, rangeTo) => ordQ.range(rangeFrom, rangeTo));

    // Build session_code -> order mapping (diagnostic_session_id stores session_code, not UUID)
    const orderBySessionCode: Record<string, { total_price: number }[]> = {};
    for (const o of ordersList as any[]) {
      const sid = o.diagnostic_session_id;
      if (sid) {
        if (!orderBySessionCode[sid]) orderBySessionCode[sid] = [];
        orderBySessionCode[sid].push({ total_price: Number(o.total_price) || 0 });
      }
    }

    // Assign persona codes and group sessions
    const personaGroups: Record<string, any[]> = {};
    const totalCompleted = allSessions.length;

    for (const s of allSessions) {
      const children = ((s.diagnostic_items || []) as any[]).sort(
        (a: any, b: any) => (a.item_index ?? 0) - (b.item_index ?? 0)
      );
      const code = (s.persona_code && s.persona_code !== 'P0') ? s.persona_code : assignPersonaCode(s, children);
      if (!personaGroups[code]) personaGroups[code] = [];
      personaGroups[code].push({ ...s, _children: children, _code: code });
    }

    // Global averages
    let globalConversions = 0;
    let globalRevenue = 0;
    let globalEngagementSum = 0;
    let globalEngagementCount = 0;

    for (const s of allSessions) {
      const sOrders = orderBySessionCode[s.session_code] || [];
      if (sOrders.length > 0) {
        globalConversions++;
        globalRevenue += sOrders.reduce((sum: number, o: any) => sum + o.total_price, 0);
      }
      if (s.engagement_score != null) {
        globalEngagementSum += s.engagement_score;
        globalEngagementCount++;
      }
    }
    const globalConvRate = totalCompleted > 0 ? (globalConversions / totalCompleted) * 100 : 0;
    const globalAov = globalConversions > 0 ? globalRevenue / globalConversions : 0;
    const globalEngagement = globalEngagementCount > 0 ? globalEngagementSum / globalEngagementCount : 0;

    // Build per-persona stats — dynamic: include ALL codes found in data
    const personaStats: any[] = [];

    // Start with known P1-P9, then add any new codes found in data
    const knownCodes = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"];
    const allCodes = new Set([...knownCodes, ...Object.keys(personaGroups)]);
    // Sort: known codes first in order, then new codes sorted naturally
    const sortedCodes = [...allCodes].sort((a, b) => {
      const ai = knownCodes.indexOf(a);
      const bi = knownCodes.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });

    for (const code of sortedCodes) {
      const sessions = personaGroups[code] || [];
      const count = sessions.length;
      const pct = totalCompleted > 0 ? Math.round((count / totalCompleted) * 1000) / 10 : 0;
      const def = PERSONA_DEFINITIONS[code] || { name: `Persona ${code}`, subtitle: "Nouveau profil détecté automatiquement" };

      if (count === 0) {
        personaStats.push({
          code,
          ...def,
          count: 0,
          percentage: 0,
          profile: null,
          psychology: null,
          behavior: null,
          topProducts: [],
          business: null,
          insights: [],
        });
        continue;
      }

      // -- PROFILE --
      const ageRanges: string[] = [];
      const childCounts: number[] = [];
      const reactivities: string[] = [];
      let excludeFragranceCount = 0;
      const devices: string[] = [];

      for (const s of sessions) {
        const c1 = s._children[0];
        if (c1?.age_range) ageRanges.push(c1.age_range);
        if (c1?.skin_reactivity) reactivities.push(c1.skin_reactivity);
        if (c1?.exclude_fragrance) excludeFragranceCount++;
        childCounts.push(s.number_of_children || 1);
        if (s.device) devices.push(s.device);
      }

      const ageRangeTop = countTop(ageRanges);
      const childCountDist = countTop(childCounts.map(String));
      const multiChildrenPct = count > 0 ? (childCounts.filter(c => c >= 2).length / count) * 100 : 0;
      const reactivityTop = countTop(reactivities);
      const excludeFragrancePct = count > 0 ? Math.round((excludeFragranceCount / count) * 1000) / 10 : 0;
      const deviceTop = countTop(devices);

      // -- PSYCHOLOGY --
      const priorities: string[] = [];
      const trustTriggers: string[] = [];
      const routineSizes: string[] = [];

      for (const s of sessions) {
        if (s.priorities_ordered) {
          const first = s.priorities_ordered.split(",")[0]?.trim();
          if (first) priorities.push(first);
        }
        if (s.trust_triggers_ordered) {
          const first = s.trust_triggers_ordered.split(",")[0]?.trim();
          if (first) trustTriggers.push(first);
        }
        if (s.routine_size_preference) routineSizes.push(s.routine_size_preference);
      }

      // All priorities (not just first)
      const allPriorities: string[] = [];
      const allTrust: string[] = [];
      for (const s of sessions) {
        if (s.priorities_ordered) s.priorities_ordered.split(",").forEach((p: string) => { if (p.trim()) allPriorities.push(p.trim()); });
        if (s.trust_triggers_ordered) s.trust_triggers_ordered.split(",").forEach((t: string) => { if (t.trim()) allTrust.push(t.trim()); });
      }

      const priorityTop = countTop(priorities);
      const allPriorityTop = countTop(allPriorities).slice(0, 3);
      const trustTop = countTop(trustTriggers);
      const allTrustTop = countTop(allTrust).slice(0, 3);
      const routineSizeTop = countTop(routineSizes);

      // -- BEHAVIOR --
      let durationSum = 0, durationCount = 0;
      let engagementSum = 0, engagementCount = 0;
      const formats: string[] = [];
      let optinEmail = 0, optinSms = 0;

      for (const s of sessions) {
        if (s.duration_seconds != null) { durationSum += s.duration_seconds; durationCount++; }
        if (s.engagement_score != null) { engagementSum += s.engagement_score; engagementCount++; }
        if (s.content_format_preference) formats.push(s.content_format_preference);
        if (s.optin_email) optinEmail++;
        if (s.optin_sms) optinSms++;
      }

      const durationAvg = durationCount > 0 ? Math.round(durationSum / durationCount) : null;
      const engagementAvg = engagementCount > 0 ? Math.round((engagementSum / engagementCount) * 10) / 10 : null;
      const formatTop = countTop(formats);
      const optinEmailPct = count > 0 ? Math.round((optinEmail / count) * 1000) / 10 : 0;
      const optinSmsPct = count > 0 ? Math.round((optinSms / count) * 1000) / 10 : 0;

      // -- TOP PRODUCTS --
      // Split rétrocompatible : " | " (nouveau séparateur) ou ", " (ancien — évite de couper "1,2,3" dans les noms)
      const splitProducts = (str: string): string[] => {
        if (str.includes(" | ")) return str.split(" | ").map((p: string) => p.trim()).filter(Boolean);
        return str.split(", ").map((p: string) => p.trim()).filter(Boolean);
      };
      const productCounts: Record<string, number> = {};
      for (const s of sessions) {
        if (!s.recommended_products) continue;
        splitProducts(s.recommended_products).forEach((name: string) => {
          if (name) productCounts[name] = (productCounts[name] || 0) + 1;
        });
      }
      const topProducts = Object.entries(productCounts)
        .map(([name, cnt]) => ({ name, count: cnt, pct: count > 0 ? Math.round((cnt / count) * 1000) / 10 : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // -- BUSINESS --
      let conversions = 0;
      let revenue = 0;
      let recommendedCartSum = 0;
      let recommendedCartCount = 0;

      for (const s of sessions) {
        const sOrders = orderBySessionCode[s.session_code] || [];
        if (sOrders.length > 0) {
          conversions++;
          revenue += sOrders.reduce((sum: number, o: any) => sum + o.total_price, 0);
        }
        if (s.recommended_cart_amount != null) {
          recommendedCartSum += Number(s.recommended_cart_amount) || 0;
          recommendedCartCount++;
        }
      }

      const conversionRate = count > 0 ? Math.round((conversions / count) * 1000) / 10 : 0;
      const aov = conversions > 0 ? Math.round((revenue / conversions) * 100) / 100 : 0;
      const recommendedCartAvg = recommendedCartCount > 0 ? Math.round((recommendedCartSum / recommendedCartCount) * 100) / 100 : null;
      const ecartPanier = recommendedCartAvg != null && aov > 0 ? Math.round((aov - recommendedCartAvg) * 100) / 100 : null;
      const ecartPanierPct = recommendedCartAvg != null && recommendedCartAvg > 0 && aov > 0
        ? Math.round(((aov - recommendedCartAvg) / recommendedCartAvg) * 1000) / 10 : null;
      const aovVsGlobal = globalAov > 0 ? Math.round(((aov - globalAov) / globalAov) * 1000) / 10 : null;

      // -- INSIGHTS --
      const topReactivity = reactivityTop[0] || null;
      const topPriority = priorityTop[0] || null;
      const topFormat = formatTop[0] || null;
      const insights = generateInsights(
        { conversionRate, aov, engagementAvg: engagementAvg ?? 0, multiChildrenPct, topReactivity, topPriority, topFormat },
        { conversionRate: globalConvRate, aov: globalAov }
      );

      personaStats.push({
        code,
        ...def,
        count,
        percentage: pct,
        profile: {
          ageRangeTop: ageRangeTop.slice(0, 3),
          childCountDist: childCountDist.slice(0, 3),
          multiChildrenPct: Math.round(multiChildrenPct * 10) / 10,
          reactivityTop: reactivityTop.slice(0, 3),
          excludeFragrancePct,
          deviceTop: deviceTop.slice(0, 3),
        },
        psychology: {
          priorityFirst: priorityTop[0] || null,
          priorityTop3: allPriorityTop,
          trustFirst: trustTop[0] || null,
          trustTop3: allTrustTop,
          routineSizeDist: routineSizeTop,
        },
        behavior: {
          durationAvgSeconds: durationAvg,
          engagementAvg,
          formatTop: formatTop.slice(0, 3),
          optinEmailPct,
          optinSmsPct,
        },
        topProducts,
        business: {
          conversions,
          revenue: Math.round(revenue * 100) / 100,
          aov,
          recommendedCartAvg,
          ecartPanier,
          ecartPanierPct,
          aovVsGlobal,
        },
        insights,
      });
    }

    return new Response(JSON.stringify({
      totalCompleted,
      globalAvg: {
        conversionRate: Math.round(globalConvRate * 10) / 10,
        aov: Math.round(globalAov * 100) / 100,
        engagement: Math.round(globalEngagement * 10) / 10,
      },
      personas: personaStats,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[persona-stats] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
