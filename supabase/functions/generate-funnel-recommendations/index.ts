import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";
import { paginateQuery } from "../_shared/paginateSupabase.ts";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load tenant config to personalize the funnel optimization prompt
    const tenantConfig = await loadTenantConfig();

    // Calculate last 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fromISO = sevenDaysAgo.toISOString();
    const toISO = now.toISOString();

    // Monday of current week (for week_start)
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    const weekStart = monday.toISOString().split("T")[0];

    // ===== Fetch funnel data from last 7 days =====
    let sessions: any[] = [];
    try {
      sessions = await paginateQuery((from, to) =>
        supabase
          .from("diagnostic_sessions")
          .select("status, optin_email, optin_sms, recommended_products, selected_cart_amount, checkout_started, conversion, validated_cart_amount, duration_seconds, question_path, abandoned_at_step")
          .gte("created_at", fromISO)
          .lte("created_at", toISO)
          .range(from, to)
      );
    } catch (sessErr) {
      console.error("Sessions query error:", sessErr);
      return new Response(JSON.stringify({ error: "DB error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const total = sessions?.length ?? 0;
    let completed = 0, optinEmail = 0, recommendation = 0, addToCart = 0, checkout = 0, purchase = 0;
    let durationSum = 0, durationCount = 0;
    let orderSum = 0, orderCount = 0;
    const abandonSteps: Record<string, number> = {};

    for (const s of sessions ?? []) {
      if (s.status === "termine") {
        completed++;
        if (s.duration_seconds != null) { durationSum += s.duration_seconds; durationCount++; }
      }
      if (s.status === "termine" && s.optin_email) optinEmail++;
      if (s.recommended_products) recommendation++;
      if (s.selected_cart_amount != null || s.conversion) addToCart++;
      if (s.checkout_started || s.conversion) checkout++;
      if (s.conversion) {
        purchase++;
        if (s.validated_cart_amount != null) { orderSum += Number(s.validated_cart_amount); orderCount++; }
      }
      if (s.status !== "termine" && s.abandoned_at_step) {
        abandonSteps[s.abandoned_at_step] = (abandonSteps[s.abandoned_at_step] || 0) + 1;
      }
    }

    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0";
    const optinRate = completed > 0 ? ((optinEmail / completed) * 100).toFixed(1) : "0";
    const cartRate = recommendation > 0 ? ((addToCart / recommendation) * 100).toFixed(1) : "0";
    const checkoutRate = addToCart > 0 ? ((checkout / addToCart) * 100).toFixed(1) : "0";
    const purchaseRate = checkout > 0 ? ((purchase / checkout) * 100).toFixed(1) : "0";
    const avgDuration = durationCount > 0 ? Math.round(durationSum / durationCount) : null;
    const avgOrder = orderCount > 0 ? (orderSum / orderCount).toFixed(2) : null;
    const topAbandon = Object.entries(abandonSteps).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // ===== Fetch previous recommendations that are NOT applied =====
    const { data: prevRecs } = await supabase
      .from("funnel_recommendations")
      .select("*")
      .eq("applied", false)
      .order("created_at", { ascending: false })
      .limit(10);

    const previousUnapplied = (prevRecs ?? []).map(r => `- [${r.step}] ${r.issue} → ${r.recommendation}`).join("\n");

    // ===== Build AI prompt =====
    const funnelSummary = `
Données tunnel de conversion (7 derniers jours) :
- Sessions démarrées : ${total}
- Diagnostics complétés : ${completed} (${completionRate}%)
- Opt-in email : ${optinEmail} (${optinRate}% des complétés)
- Recommandation affichée : ${recommendation}
- Ajout panier : ${addToCart} (${cartRate}% des recommandations)
- Checkout : ${checkout} (${checkoutRate}% des ajouts panier)
- Achats : ${purchase} (${purchaseRate}% des checkouts)
- Durée moyenne : ${avgDuration ? `${Math.floor(avgDuration / 60)}min ${avgDuration % 60}sec` : "N/A"}
- Panier moyen commandes : ${avgOrder ? `${avgOrder}€` : "N/A"}
- Top abandons : ${topAbandon.length > 0 ? topAbandon.map(([step, count]) => `${step} (${count})`).join(", ") : "N/A"}
`;

    const brandLabel = tenantConfig.brand_name || "la marque";
    const industryLabel = tenantConfig.industry || "e-commerce";

    const prompt = `Tu es un expert en optimisation de tunnels de conversion e-commerce pour ${brandLabel} (${industryLabel}).

${funnelSummary}

Recommandations précédentes NON appliquées :
${previousUnapplied || "Aucune"}

Génère exactement 3 recommandations au format JSON. Chaque recommandation doit identifier une friction réelle observée dans les données ci-dessus et proposer une solution actionnable et concrète.

RÈGLES IMPORTANTES :
- Si une recommandation précédente non appliquée te semble toujours pertinente au vu des données actuelles, tu peux la GARDER (mets kept_from_previous à true). Tu n'es pas obligé de toutes les renouveler.
- Chaque recommandation doit être liée à une étape spécifique du tunnel (ex: "Vues diagnostic", "Diagnostic complété", "Opt-in", "Ajout panier", "Checkout", "Achat")
- Les problèmes doivent être basés sur les données réelles fournies, pas inventés
- Les recommandations doivent être concrètes et actionnables

Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown :
[
  {
    "step": "Nom de l'étape",
    "issue": "Description du problème observé basé sur les données",
    "recommendation": "Action concrète recommandée",
    "kept_from_previous": false
  }
]`;

    // ===== Call Lovable AI Gateway =====
    const geminiModelUsed = "google/gemini-2.5-flash";
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: geminiModelUsed,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content ?? "[]";

    // Log Gemini usage (model captured dynamically from variable above)
    const geminiInputTokens = aiData.usage?.prompt_tokens || 0;
    const geminiOutputTokens = aiData.usage?.completion_tokens || 0;
    const geminiTokens = aiData.usage?.total_tokens || (geminiInputTokens + geminiOutputTokens);
    supabase
      .from("api_usage_logs")
      .insert({
        edge_function: "generate-funnel-recommendations",
        api_provider: "lovable-ai",
        model: geminiModelUsed,
        tokens_used: geminiTokens,
        input_tokens: geminiInputTokens,
        output_tokens: geminiOutputTokens,
        total_tokens: geminiTokens,
        api_calls: 1,
      })
      .then(() => console.log("LOG OK:", geminiModelUsed)).catch((e: any) => console.error("LOG FAIL funnel:", e.message));

    // Parse JSON from AI response (handle possible markdown wrapping)
    let recommendations: { step: string; issue: string; recommendation: string; kept_from_previous?: boolean }[];
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      recommendations = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "AI response parse failed", raw: content }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Delete old non-applied recommendations for this week, keep applied ones =====
    await supabase
      .from("funnel_recommendations")
      .delete()
      .eq("applied", false);

    // ===== Insert new recommendations =====
    const toInsert = recommendations.slice(0, 3).map(r => ({
      week_start: weekStart,
      step: r.step,
      issue: r.issue,
      recommendation: r.recommendation,
      kept_from_previous: r.kept_from_previous ?? false,
      applied: false,
    }));

    const { error: insertErr } = await supabase
      .from("funnel_recommendations")
      .insert(toInsert);

    if (insertErr) {
      console.error("Insert error:", insertErr);
      return new Response(JSON.stringify({ error: "Insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, recommendations: toInsert }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    reportEdgeFunctionError("generate-funnel-recommendations", err, { type: "cron_failure", severity: "critical" });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
