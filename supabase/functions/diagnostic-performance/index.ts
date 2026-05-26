import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { paginateQuery } from "../_shared/paginateSupabase.ts";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RequestBody = {
  from?: string;
  to?: string;
  includeDetails?: boolean;
};

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
    const body: RequestBody = await req.json().catch(() => ({}));
    const from = body.from ? new Date(body.from) : undefined;
    const to = body.to ? new Date(body.to) : undefined;
    const includeDetails = body.includeDetails ?? false;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Cf. backlog #3.4 — load tenant_id for the defensive client_orders filter.
    const tenantConfig = await loadTenantConfig();
    const tenantId = tenantConfig.project_id;

    /* ====== NEW FORMAT: diagnostic_sessions + children ====== */
    const cutoffDate = "2026-02-08T00:00:00.000Z";

    let sessionsQuery = supabase
      .from("diagnostic_sessions")
      .select("*, diagnostic_items(*)")
      .gte("created_at", cutoffDate)
      .order("created_at", { ascending: false });

    if (from && new Date(from) > new Date(cutoffDate)) sessionsQuery = sessionsQuery.gte("created_at", from.toISOString());
    if (to) sessionsQuery = sessionsQuery.lte("created_at", to.toISOString());

    // deno-lint-ignore no-explicit-any
    let sessions: any[] = [];
    try {
      sessions = await paginateQuery((rangeFrom, rangeTo) => sessionsQuery.range(rangeFrom, rangeTo));
    } catch (sessionsError) {
      console.error("[perf] Sessions query error:", sessionsError);
    }

    let newTotal = 0,
      newCompleted = 0,
      newEmailOptin = 0,
      newSmsOptin = 0,
      newDoubleOptin = 0;
    const newPersonaCounts: Record<string, number> = {};
    // deno-lint-ignore no-explicit-any
    const recentNew: any[] = [];

    for (const s of sessions) {
      newTotal++;
      if (s.status === "termine") newCompleted++;
      if (s.optin_email) newEmailOptin++;
      if (s.optin_sms) newSmsOptin++;
      if (s.optin_email && s.optin_sms) newDoubleOptin++;
      if (s.persona_detected) {
        newPersonaCounts[s.persona_detected] =
          (newPersonaCounts[s.persona_detected] || 0) + 1;
      }
      if (recentNew.length < 10) {
        const children = ((s.diagnostic_items || []) as any[]).sort(
          (a: any, b: any) => (b.age ?? 0) - (a.age ?? 0)
        );
        recentNew.push({
          id: s.id,
          created_at: s.created_at,
          child_name: children[0]?.first_name ?? null,
          child_age: children[0]?.age ?? null,
          detected_persona: s.persona_detected,
          email_optin: s.optin_email,
          sms_optin: s.optin_sms,
        });
      }
    }

    /* ====== METRICS ====== */
    const totalResponses = newTotal;
    const completedResponses = newCompleted;
    const completionRate =
      totalResponses > 0 ? (completedResponses / totalResponses) * 100 : 0;
    const emailOptinCount = newEmailOptin;
    const smsOptinCount = newSmsOptin;
    const doubleOptinCount = newDoubleOptin;
    const emailOptinRate =
      completedResponses > 0
        ? (emailOptinCount / completedResponses) * 100
        : 0;
    const smsOptinRate =
      completedResponses > 0
        ? (smsOptinCount / completedResponses) * 100
        : 0;

    const personaDistribution = Object.entries(newPersonaCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalResponses > 0 ? (count / totalResponses) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Recent 10 (for DiagnosticsAnalytics)
    const responses = [...recentNew]
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      )
      .slice(0, 10);

    /* ====== FUNNEL DATA (from diagnostic_sessions only) ====== */
    let funnelOptinEmail = 0;
    let funnelRecommendation = 0;
    let funnelAddToCart = 0;
    let funnelCheckout = 0;
    let funnelDurationSum = 0;
    let funnelDurationCount = 0;

    for (const s of sessions) {
      if (s.status === "termine" && s.optin_email) funnelOptinEmail++;
      if (s.recommended_products) funnelRecommendation++;
      if (s.selected_cart_amount != null || s.conversion) funnelAddToCart++;
      if (s.checkout_started || s.conversion) funnelCheckout++;
      if (s.status === "termine" && s.duration_seconds != null) {
        funnelDurationSum += s.duration_seconds;
        funnelDurationCount++;
      }
    }

    // Funnel purchase count & AOV from client_orders (single source of truth)
    let funnelPurchaseCount = 0;
    let funnelOrderAmountAvg: number | null = null;
    let orphanOrderCount = 0;
    {
      let ordQ = supabase
        .from("client_orders")
        .select("total_price, diagnostic_session_id")
        .eq("tenant_id", tenantId)
        .eq("is_from_diagnostic", true)
        .gt("total_price", 0);
      if (from) ordQ = ordQ.gte("created_at", from.toISOString());
      if (to) ordQ = ordQ.lte("created_at", to.toISOString());
      // deno-lint-ignore no-explicit-any
      let dOrders: any[] = [];
      try {
        dOrders = await paginateQuery((rangeFrom, rangeTo) => ordQ.range(rangeFrom, rangeTo));
      } catch (diagOrdErr) {
        console.error("[perf] Diag orders query error:", diagOrdErr);
      }
      funnelPurchaseCount = dOrders.length;
      orphanOrderCount = dOrders.filter((o: any) => !o.diagnostic_session_id).length;
      if (funnelPurchaseCount > 0) {
        const sum = dOrders.reduce((s: number, o: any) => s + (Number(o.total_price) || 0), 0);
        funnelOrderAmountAvg = Math.round((sum / funnelPurchaseCount) * 100) / 100;
      }
    }

    // Ensure funnel is always decreasing: cart & checkout >= purchases
    funnelAddToCart = Math.max(funnelAddToCart + orphanOrderCount, funnelPurchaseCount);
    funnelCheckout = Math.max(funnelCheckout + orphanOrderCount, funnelPurchaseCount);

    /* ====== DETAILED DIAGNOSTIC FUNNEL ====== */
    const detailedSteps = [
      { label: "Prénom parent", match: (s: any) => s.question_path && (/(?:^|>)1(?:>|$)/.test(s.question_path) || /^0>1/.test(s.question_path)) },
      { label: "Lien avec l'enfant", match: (s: any) => s.question_path && />2(?:>|$)/.test(s.question_path) },
      { label: "Nombre d'enfants", match: (s: any) => s.question_path && />3(?:>|$)/.test(s.question_path) },
      { label: "Info enfant", match: (s: any) => s.question_path && />4(?:>|$)/.test(s.question_path) },
      { label: "Type de peau", match: (s: any) => s.question_path && />5(?:>|$)/.test(s.question_path) },
      { label: "Routine existante", match: (s: any) => s.question_path && />6(?:>|$)/.test(s.question_path) },
      { label: "Questions peau", match: (s: any) => s.question_path && />11(?:>|$)/.test(s.question_path) },
      { label: "Questions IA", match: (s: any) => s.question_path && />12(?:>|$)/.test(s.question_path) },
      { label: "Préférences", match: (s: any) => s.question_path && />13(?:>|$)/.test(s.question_path) },
      { label: "Opt-in", match: (s: any) => s.status === "termine" },
      { label: "Recommandation affichée", match: (s: any) => !!s.recommended_products },
    ];

    const detailedFunnel = detailedSteps.map((step) => {
      let count = 0;
      for (const s of sessions) {
        if (step.match(s)) count++;
      }
      return { label: step.label, count };
    });

    /* ====== REVENUE TIMESERIES from client_orders ====== */
    let revenueTimeseries: { date: string; withDiag: number; withoutDiag: number }[] = [];
    {
      let ordersQuery = supabase
        .from("client_orders")
        .select("created_at, total_price, is_from_diagnostic")
        .eq("tenant_id", tenantId)
        .gt("total_price", 0)
        .order("created_at", { ascending: true });

      if (from) ordersQuery = ordersQuery.gte("created_at", from.toISOString());
      if (to) ordersQuery = ordersQuery.lte("created_at", to.toISOString());

      // deno-lint-ignore no-explicit-any
      let orders: any[] = [];
      try {
        orders = await paginateQuery((rangeFrom, rangeTo) => ordersQuery.range(rangeFrom, rangeTo));
      } catch (ordersError) {
        console.error("[perf] Orders timeseries error:", ordersError);
      }
      // Group by day in Europe/Paris timezone
      const dayMap: Record<string, { withDiag: number; withoutDiag: number }> = {};
      for (const o of orders as any[]) {
        const day = new Date(o.created_at as string).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
        if (!dayMap[day]) dayMap[day] = { withDiag: 0, withoutDiag: 0 };
        const amount = Number(o.total_price) || 0;
        if (o.is_from_diagnostic) {
          dayMap[day].withDiag += amount;
        } else {
          dayMap[day].withoutDiag += amount;
        }
      }
      revenueTimeseries = Object.entries(dayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({
          date,
          withDiag: Math.round(vals.withDiag * 100) / 100,
          withoutDiag: Math.round(vals.withoutDiag * 100) / 100,
        }));
    }

    /* ====== BUILD RESPONSE ====== */
    const result: Record<string, unknown> = {
      totalResponses,
      completedResponses,
      completionRate,
      emailOptinCount,
      smsOptinCount,
      doubleOptinCount,
      emailOptinRate,
      smsOptinRate,
      personaDistribution,
      responses,
      funnel: {
        started: newTotal,
        completed: newCompleted,
        optinEmail: funnelOptinEmail,
        recommendation: funnelRecommendation,
        addToCart: funnelAddToCart,
        checkout: funnelCheckout,
        purchase: funnelPurchaseCount,
        avgDurationSeconds: funnelDurationCount > 0 ? Math.round(funnelDurationSum / funnelDurationCount) : null,
        avgOrderAmount: funnelOrderAmountAvg,
      },
      detailedFunnel,
      revenueTimeseries,
    };

    /* ====== DETAILED SESSIONS (for Réponses tab) ====== */
    if (includeDetails) {
      // deno-lint-ignore no-explicit-any
      const detailed: any[] = [];

      // Map new sessions
      for (const s of sessions) {
        // Generic agnostic mapping: spread item_metadata JSONB so all tenant-specific
        // fields are exposed transparently to the frontend without hardcoding.
        // Also keep item_metadata explicit so consumers that prefer the raw
        // JSONB object can read it directly.
        const items = ((s.diagnostic_items || []) as any[])
          .sort((a: any, b: any) => (a.item_index ?? 0) - (b.item_index ?? 0))
          .map((c: any) => ({
            item_index: c.item_index,
            item_label: c.item_label,
            // All tenant-specific fields are spread from JSONB for flat access
            ...(c.item_metadata || {}),
            // Explicit raw metadata object for consumers that prefer nested access
            item_metadata: c.item_metadata || {},
            // Ordered/derived fields that may be at top-level or in metadata
            dynamic_question_1: c.dynamic_question_1,
            dynamic_answer_1: c.dynamic_answer_1,
            dynamic_question_2: c.dynamic_question_2,
            dynamic_answer_2: c.dynamic_answer_2,
            dynamic_question_3: c.dynamic_question_3,
            dynamic_answer_3: c.dynamic_answer_3,
            dynamic_insight_targets: c.dynamic_insight_targets,
          }));

        detailed.push({
          id: s.id,
          session_code: s.session_code,
          created_at: s.created_at,
          status: s.status,
          source: s.source,
          utm_campaign: s.utm_campaign,
          device: s.device,
          user_name: s.user_name,
          relationship: s.relationship,
          email: s.email,
          phone: s.phone,
          optin_email: s.optin_email,
          optin_sms: s.optin_sms,
          number_of_children: s.number_of_children,
          locale: s.locale,
          result_url: s.result_url,
          persona_detected: s.persona_detected,
          persona_matching_score: s.persona_matching_score,
          adapted_tone: s.adapted_tone,
          ai_key_messages: s.ai_key_messages,
          ai_suggested_segment: s.ai_suggested_segment,
          conversion: s.conversion,
          exit_type: s.exit_type,
          existing_brand_products: s.existing_brand_products,
          is_existing_client: s.is_existing_client,
          recommended_products: s.recommended_products,
          recommended_cart_amount: s.recommended_cart_amount,
          validated_products: s.validated_products,
          validated_cart_amount: s.validated_cart_amount,
          upsell_potential: s.upsell_potential,
          duration_seconds: s.duration_seconds,
          abandoned_at_step: s.status === "termine" ? null : s.abandoned_at_step,
          question_path: s.question_path,
          back_navigation_count: s.back_navigation_count,
          has_optional_details: s.has_optional_details,
          behavior_tags: s.behavior_tags,
          engagement_score: s.engagement_score,
          routine_size_preference: s.routine_size_preference,
          priorities_ordered: s.priorities_ordered,
          trust_triggers_ordered: s.trust_triggers_ordered,
          content_format_preference: s.content_format_preference,
          persona_code: s.persona_code ?? null,
          matching_score: s.matching_score ?? null,
          items,
          _source: "new",
        });
      }

      // Sort by date desc
      detailed.sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );

      result.sessions = detailed;
      result.categories = {
        identification: { color: "#E8E8E8", label: "Identification & Tracking" },
        persona: { color: "#EDE0F0", label: "Personas & IA" },
        business: { color: "#D5F5E3", label: "Business & Conversion" },
        comportement: { color: "#FEF3C7", label: "Comportement" },
        statiques: { color: "#DBEAFE", label: "Questions statiques" },
        dynamiques: { color: "#FEE2E2", label: "Questions dynamiques IA" },
      };
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[perf] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
