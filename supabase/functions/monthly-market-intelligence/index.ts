import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";
import { paginateQuery } from "../_shared/paginateSupabase.ts";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";
import { getEmailProvider, getEmailProviderDisplayName } from "../_shared/getEmailProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// PROJECT_ID is now loaded dynamically from tenant_config inside the handler

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

function getCurrentMonthYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

function logUsage(
  supabase: any,
  provider: string,
  model: string,
  usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | number,
  metadata?: Record<string, any>
) {
  const inputTokens = typeof usage === "number" ? 0 : (usage.input_tokens || 0);
  const outputTokens = typeof usage === "number" ? 0 : (usage.output_tokens || 0);
  const totalTokens = typeof usage === "number" ? usage : (usage.total_tokens || (inputTokens + outputTokens));
  supabase
    .from("api_usage_logs")
    .insert({
      edge_function: "monthly-market-intelligence",
      api_provider: provider,
      model,
      tokens_used: totalTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      api_calls: 1,
      metadata: metadata || {},
    })
    .then(() => {})
    .catch(() => {});
}

// ──────────────────────────────────────────────
// CLIENT CONTEXT — Built dynamically from tenant_config
// ──────────────────────────────────────────────
// Expected shape of tenant_config.client_context_json :
// {
//   brand: string,
//   description: string,
//   tone: string,
//   products: Array<{ name: string, type: string, price: number }>,
//   channels: string[],
//   promoCode: string,
//   shopify_url: string,
// }
//
// If client_context_json is not populated in tenant_config, a minimal fallback
// is built from the top-level columns (brand_name, brand_description, etc.).
// This ensures the function never crashes, but for meaningful Market Intelligence
// output, client_context_json should be filled during onboarding.
type ClientContext = {
  brand: string;
  description: string;
  tone: string;
  products: Array<{ name: string; type: string; price: number }>;
  channels: string[];
  promoCode: string;
  shopify_url: string;
};

function buildClientContext(tenantConfig: any): ClientContext {
  const raw = tenantConfig?.client_context_json || {};
  return {
    brand: raw.brand || tenantConfig?.brand_name || "",
    description: raw.description || tenantConfig?.brand_description || "",
    tone: raw.tone || tenantConfig?.brand_tone || "",
    products: Array.isArray(raw.products) ? raw.products : [],
    channels: Array.isArray(raw.channels) ? raw.channels : [],
    promoCode: raw.promoCode || "",
    shopify_url: raw.shopify_url || tenantConfig?.shopify_store_domain || "",
  };
}

// ──────────────────────────────────────────────
// STEP 0: COLLECT PERSONA DATA
// ──────────────────────────────────────────────
async function collectPersonaData(supabase: any) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateStr = thirtyDaysAgo.toISOString();

  const { data: personaRows } = await supabase
    .from("personas")
    .select("*")
    .eq("is_active", true)
    .order("session_count", { ascending: false });

  const recentSessions = await paginateQuery((from, to) =>
    supabase
      .from("diagnostic_sessions")
      .select(
        "persona_code,conversion,selected_cart_amount,validated_cart_amount,engagement_score,is_existing_client,optin_email,optin_sms"
      )
      .gte("created_at", dateStr)
      .not("persona_code", "is", null)
      .range(from, to)
  );

  const personaMap: Record<string, any> = {};
  for (const s of recentSessions || []) {
    const code = s.persona_code;
    if (!code) continue;
    if (!personaMap[code]) {
      personaMap[code] = {
        sessions: 0,
        conversions: 0,
        totalCart: 0,
        validatedCart: 0,
        totalEngagement: 0,
        emailOptins: 0,
        existingClients: 0,
      };
    }
    const p = personaMap[code];
    p.sessions++;
    if (s.conversion) p.conversions++;
    if (s.selected_cart_amount) p.totalCart += Number(s.selected_cart_amount);
    if (s.validated_cart_amount) p.validatedCart += Number(s.validated_cart_amount);
    if (s.engagement_score) p.totalEngagement += s.engagement_score;
    if (s.optin_email) p.emailOptins++;
    if (s.is_existing_client) p.existingClients++;
  }

  const personaData: Record<string, any> = {};
  for (const row of personaRows || []) {
    const m = personaMap[row.code] || {};
    const sessions = m.sessions || 0;
    const conversions = m.conversions || 0;
    personaData[row.code] = {
      code: row.code,
      name: row.name,
      full_label: row.full_label,
      description: row.description || "",
      is_existing_client_persona: row.is_existing_client_persona,
      is_pool: row.is_pool,
      sessions_30d: sessions,
      conversion_rate: sessions > 0 ? Math.round((conversions / sessions) * 100) : 0,
      avg_cart: sessions > 0 ? Math.round((m.totalCart || 0) / sessions) : 0,
      avg_validated_cart: conversions > 0 ? Math.round((m.validatedCart || 0) / conversions) : 0,
      avg_engagement: sessions > 0 ? Math.round((m.totalEngagement || 0) / sessions) : 0,
      email_optin_rate: sessions > 0 ? Math.round(((m.emailOptins || 0) / sessions) * 100) : 0,
      existing_client_rate: sessions > 0 ? Math.round(((m.existingClients || 0) / sessions) * 100) : 0,
      revenue_30d: m.validatedCart || 0,
      potential_revenue: sessions > 0 ? sessions * (m.totalCart / sessions || 0) * 0.05 : 0,
    };
  }

  // Identify priorities
  const nonPool = Object.values(personaData).filter((p: any) => !p.is_pool);
  const best_roi = nonPool.sort((a: any, b: any) => (b.avg_validated_cart || 0) - (a.avg_validated_cart || 0))[0];
  const best_growth = nonPool.sort((a: any, b: any) => (b.potential_revenue || 0) - (a.potential_revenue || 0))[0];
  const best_ltv = nonPool.sort((a: any, b: any) => (b.avg_engagement || 0) - (a.avg_engagement || 0))[0];

  const totalSessions = (recentSessions || []).length;
  const totalConversions = (recentSessions || []).filter((s: any) => s.conversion).length;

  return {
    personaRows: personaRows || [],
    personaData,
    priorities: {
      best_roi,
      best_roi_value: best_roi?.avg_validated_cart || 0,
      best_growth,
      best_growth_ca: Math.round(best_growth?.potential_revenue || 0),
      best_ltv,
      best_ltv_score: best_ltv?.avg_engagement || 0,
    },
    globalMetrics: {
      total_sessions: totalSessions,
      total_conversions: totalConversions,
      global_conversion_rate: totalSessions > 0 ? Math.round((totalConversions / totalSessions) * 100) : 0,
      period_days: 30,
    },
  };
}

// ──────────────────────────────────────────────
// STEP 1: PERPLEXITY — 3 PARALLEL CALLS
// ──────────────────────────────────────────────
async function callPerplexity(query: string, timeoutMs = 60000): Promise<{ raw: string; sources: string[]; inputTokens: number; outputTokens: number; totalTokens: number }> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: "Tu es un expert en marketing digital e-commerce. Fournis des données précises, chiffrées et actionnables. Cite tes sources." },
          { role: "user", content: query },
        ],
        search_recency_filter: "month",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Perplexity ${response.status}: ${err}`);
    }
    const data = await response.json();
    // Cf. backlog #2.16 — extract tokens from data.usage so logUsage gets real
    // numbers instead of zeroes.
    const usage = data.usage ?? {};
    const inputTokens = Number(usage.prompt_tokens) || 0;
    const outputTokens = Number(usage.completion_tokens) || 0;
    const totalTokens = Number(usage.total_tokens) || (inputTokens + outputTokens);
    return {
      raw: data.choices?.[0]?.message?.content || "",
      sources: (data.citations || []) as string[],
      inputTokens,
      outputTokens,
      totalTokens,
    };
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function runPerplexityPhase(
  supabase: any,
  intelligenceId: string,
  currentMonth: string,
  industry: string
): Promise<{ ads: any; email: any; offers: any }> {
  const now = new Date();
  const monthLabel = now.toLocaleString("fr-FR", { month: "long" }) + " " + now.getFullYear();

  // Use tenant's industry for all Perplexity queries (was hardcoded "cosmétique naturelle pour bébés et enfants")
  const sectorLabel = industry || "e-commerce DTC";

  // Tenant-agnostic email provider injection (replaces hardcoded "Klaviyo")
  const emailProvider = await getEmailProvider();
  const emailToolHint = emailProvider === "none" ? "" : ` ${getEmailProviderDisplayName(emailProvider)}`;

  const adsQuery = `Recherche approfondie des tendances actuelles en publicité digitale (Meta Ads, TikTok Ads, Instagram Ads, Pinterest Ads) pour le secteur ${sectorLabel}, marché français et international.

Inclure obligatoirement :
- Les formats publicitaires qui performent le mieux en ce moment (reel, UGC, statique, carrousel, before/after) avec des données chiffrées si disponibles
- Les types de hooks qui captent le plus l'attention dans ce secteur
- Les tendances de ciblage (audiences, intérêts, lookalikes) qui fonctionnent
- Les CPM et coûts par résultat moyens dans le secteur ${sectorLabel}
- Les marques DTC du secteur qui ont les meilleures performances publicitaires en ce moment et pourquoi
- Les erreurs courantes à éviter en publicité dans ce secteur

Focus sur les données les plus récentes (derniers 30 jours). Date : ${monthLabel}.`;

  const emailQuery = `Recherche approfondie des meilleures pratiques actuelles en email marketing e-commerce pour le secteur ${sectorLabel}.

Inclure obligatoirement :
- Taux d'ouverture et taux de clic benchmarks pour le secteur ${sectorLabel} en 2026
- Les types de flows automatisés qui génèrent le plus de revenus (post-achat, abandon panier, winback, post-diagnostic, nurture)
- Les tendances en lignes d'objet (personnalisation, emojis, longueur, techniques)
- Les innovations en segmentation et personnalisation dynamique
- Les meilleures pratiques${emailToolHint} spécifiques au secteur DTC ${sectorLabel}
- Les marques e-commerce qui excellent en email marketing en ce moment et pourquoi
- Fréquence d'envoi optimale et meilleurs jours/heures

Focus${emailToolHint} et marques DTC. Date : ${monthLabel}.`;

  const offersQuery = `Recherche approfondie des stratégies d'offres, bundles et pricing qui fonctionnent en e-commerce ${sectorLabel}.

Inclure obligatoirement :
- Les techniques de bundling qui augmentent le panier moyen (bundle découverte, bundle routine, bundle cadeau)
- Les prix psychologiques et techniques d'ancrage les plus efficaces dans ce secteur
- Les mécaniques de lancement d'offres qui créent de l'urgence sans dévaloriser la marque
- Les stratégies de upsell et cross-sell post-achat qui convertissent
- Le calendrier commercial à exploiter (fête des mères, rentrée, Noël, etc.) avec les dates clés
- Les marques DTC premium qui gèrent particulièrement bien leurs offres et bundles
- Les erreurs de pricing à éviter dans le positionnement premium

Focus marques DTC premium. Date : ${monthLabel}.`;

  console.log("[monthly-market-intelligence] STEP 1: Perplexity — 3 parallel calls...");

  // Parallel execution
  const [adsResult, emailResult, offersResult] = await Promise.allSettled([
    callPerplexity(adsQuery, 60000),
    callPerplexity(emailQuery, 60000),
    callPerplexity(offersQuery, 60000),
  ]);

  const perplexityAds =
    adsResult.status === "fulfilled"
      ? {
          searched_at: new Date().toISOString(),
          query_used: adsQuery,
          raw_response: adsResult.value.raw,
          sources_citees: adsResult.value.sources,
          status: "success",
        }
      : {
          searched_at: new Date().toISOString(),
          query_used: adsQuery,
          raw_response: "",
          sources_citees: [],
          status: "error",
          error: adsResult.reason?.message || "unknown",
        };

  const perplexityEmail =
    emailResult.status === "fulfilled"
      ? {
          searched_at: new Date().toISOString(),
          query_used: emailQuery,
          raw_response: emailResult.value.raw,
          sources_citees: emailResult.value.sources,
          status: "success",
        }
      : {
          searched_at: new Date().toISOString(),
          query_used: emailQuery,
          raw_response: "",
          sources_citees: [],
          status: "error",
          error: emailResult.reason?.message || "unknown",
        };

  const perplexityOffers =
    offersResult.status === "fulfilled"
      ? {
          searched_at: new Date().toISOString(),
          query_used: offersQuery,
          raw_response: offersResult.value.raw,
          sources_citees: offersResult.value.sources,
          status: "success",
        }
      : {
          searched_at: new Date().toISOString(),
          query_used: offersQuery,
          raw_response: "",
          sources_citees: [],
          status: "error",
          error: offersResult.reason?.message || "unknown",
        };

  // Cf. backlog #2.16 — aggregate token usage across the 3 parallel calls
  // so logUsage records real numbers instead of zeroes.
  const successCount = [adsResult, emailResult, offersResult].filter((r) => r.status === "fulfilled").length;
  const aggregatedUsage = [adsResult, emailResult, offersResult].reduce(
    (acc, r) => {
      if (r.status === "fulfilled") {
        acc.input_tokens += r.value.inputTokens;
        acc.output_tokens += r.value.outputTokens;
        acc.total_tokens += r.value.totalTokens;
      }
      return acc;
    },
    { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
  );
  logUsage(supabase, "perplexity", "sonar-pro", aggregatedUsage, {
    calls_succeeded: successCount,
    calls_total: 3,
    month_year: currentMonth,
  });

  // Save to DB
  await supabase
    .from("market_intelligence")
    .update({
      perplexity_ads: perplexityAds,
      perplexity_email: perplexityEmail,
      perplexity_offers: perplexityOffers,
      status: "perplexity_done",
      updated_at: new Date().toISOString(),
    })
    .eq("id", intelligenceId);

  console.log(`[monthly-market-intelligence] Perplexity done. ${successCount}/3 succeeded.`);
  return { ads: perplexityAds, email: perplexityEmail, offers: perplexityOffers };
}

// ──────────────────────────────────────────────
// STEP 2: GEMINI — 3 SEQUENTIAL DEEP ANALYSES
// ──────────────────────────────────────────────
async function callGemini(systemPrompt: string, userPrompt: string, timeoutMs = 120000): Promise<{ parsed: any; inputTokens: number; outputTokens: number; totalTokens: number; modelUsed: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 429) throw new Error("RATE_LIMIT: AI Gateway rate limit exceeded");
      if (response.status === 402) throw new Error("PAYMENT_REQUIRED: AI credits exhausted");
      throw new Error(`Gemini ${response.status}: ${err}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Empty Gemini response");

    // Cf. backlog #2.16 — Lovable AI Gateway returns OpenAI-compatible usage:
    // prompt_tokens / completion_tokens / total_tokens. Extract all three so
    // the caller can log a meaningful input/output split.
    const usage = data.usage ?? {};
    const inputTokens = Number(usage.prompt_tokens) || 0;
    const outputTokens = Number(usage.completion_tokens) || 0;
    const totalTokens = Number(usage.total_tokens) || (inputTokens + outputTokens);
    const modelUsed = "google/gemini-3.1-pro-preview";
    const parsed = JSON.parse(cleanJsonResponse(raw));
    return { parsed, inputTokens, outputTokens, totalTokens, modelUsed };
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function runGeminiPhase(
  supabase: any,
  intelligenceId: string,
  perplexity: { ads: any; email: any; offers: any },
  personaData: any,
  sources: { ads: any[]; email: any[]; offers: any[] },
  clientContext: ClientContext
): Promise<void> {
  // Tenant-agnostic email provider injection (replaces hardcoded "Klaviyo")
  const emailProvider = await getEmailProvider();
  const emailToolMention = emailProvider === "none" ? "" : ` et ${getEmailProviderDisplayName(emailProvider)}`;

  const personaDescriptions = (personaData.personaRows || [])
    .filter((p: any) => !p.is_pool)
    .map((p: any) => `- ${p.code} : ${p.full_label} : ${p.description || ""}`)
    .join("\n");

  const personaSummary = JSON.stringify(personaData.personaData, null, 2);
  const clientCtx = `${clientContext.brand} — ${clientContext.description}
Produits : ${clientContext.products.map((p) => `${p.name} (${p.type}) ${p.price}€`).join(", ")}
Canaux : ${clientContext.channels.join(", ")}`;

  // ── ADS ANALYSIS ────────────────────────────
  console.log("[monthly-market-intelligence] STEP 2a: Gemini ADS analysis...");
  let geminiAdsAnalysis: any = { status: "error", analyzed_at: new Date().toISOString() };
  try {
    const sourcesList = sources.ads.map((s: any) => `${s.source_name} — ${s.description || ""}`).join("\n");

    const adsSystemPrompt = `Tu es un expert senior en publicité digitale e-commerce. Tu analyses les données marché et les sources de référence pour produire une synthèse analytique approfondie sur les opportunités publicitaires pour une marque spécifique.

Tu reçois :
1. Les tendances marché actuelles (recherche Perplexity)
2. Les sources de référence en publicité (base de connaissances curatée — ${sources.ads.length} sources)
3. Les données des personas de la marque (comportements, métriques, pain points)
4. Le contexte de la marque (produits, prix, positionnement)

Produis une analyse APPROFONDIE et SPÉCIFIQUE au secteur et à la marque. Pas de généralités — chaque insight doit être actionnable.

Retourne UNIQUEMENT un JSON strict avec cette structure :
{
  "analyzed_at": "ISO timestamp",
  "model_used": "google/gemini-3.1-pro-preview",
  "input_sources_count": ${sources.ads.length},
  "analysis": {
    "tendances_marche": "string — synthèse des tendances ads pour le secteur",
    "opportunites_formats": [{"format": "string", "pourquoi": "string", "exemples_marches": "string"}],
    "hooks_performants": [{"type": "string", "pourquoi_ca_marche": "string", "exemple": "string"}],
    "angles_psychologiques": [{"angle": "string", "pertinence_personas": "string"}],
    "ciblage_recommande": {"audiences_froides": ["string"], "audiences_tiedes": ["string"], "retargeting": ["string"]},
    "benchmarks_secteur": {"cpm_moyen": "string", "ctr_moyen": "string", "cout_par_resultat": "string", "hook_rate_reference": "string"},
    "erreurs_a_eviter": ["string"]
  },
  "personas_insights": [{"persona_code": "string", "persona_name": "string", "formats_recommandes": ["string"], "angles_recommandes": ["string"], "pain_points_a_adresser": ["string"]}],
  "status": "success"
}`;

    const adsUserPrompt = `=== TENDANCES MARCHÉ (Perplexity, derniers 30j) ===
${perplexity.ads.raw_response || "Non disponible"}

=== SOURCES DE RÉFÉRENCE ADS (${sources.ads.length} sources) ===
${sourcesList}

=== PERSONAS ACTIFS ===
${personaDescriptions}

=== DONNÉES MÉTRIQUES PERSONAS (30j) ===
${personaSummary}

=== CONTEXTE MARQUE ===
${clientCtx}

Produis l'analyse JSON approfondie.`;

    const { parsed, inputTokens, outputTokens, totalTokens, modelUsed: geminiModel } = await callGemini(adsSystemPrompt, adsUserPrompt, 120000);
    geminiAdsAnalysis = { ...parsed, analyzed_at: new Date().toISOString(), status: "success" };
    logUsage(supabase, "gemini", geminiModel, { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens }, { step: "ads_analysis" });
    console.log("[monthly-market-intelligence] Gemini ADS done ✅");
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[monthly-market-intelligence] Gemini ADS FAILED:", msg);
    geminiAdsAnalysis = { status: "error", error: msg, analyzed_at: new Date().toISOString() };
    logUsage(supabase, "gemini", "google/gemini-3.1-pro-preview", 0, { step: "ads_analysis", error: msg });
  }

  await supabase
    .from("market_intelligence")
    .update({ gemini_ads_analysis: geminiAdsAnalysis, updated_at: new Date().toISOString() })
    .eq("id", intelligenceId);

  // ── EMAIL ANALYSIS ───────────────────────────
  console.log("[monthly-market-intelligence] STEP 2b: Gemini EMAIL analysis...");
  let geminiEmailAnalysis: any = { status: "error", analyzed_at: new Date().toISOString() };
  try {
    const sourcesList = sources.email.map((s: any) => `${s.source_name} — ${s.description || ""}`).join("\n");

    const emailSystemPrompt = `Tu es un expert senior en email marketing e-commerce${emailToolMention}. Tu analyses les données marché et les sources de référence pour produire une synthèse analytique approfondie sur les opportunités email pour une marque spécifique.

Tu reçois :
1. Les tendances marché actuelles (recherche Perplexity)
2. Les sources de référence en email marketing (${sources.email.length} sources spécialisées)
3. Les données des personas de la marque
4. Le contexte de la marque

Retourne UNIQUEMENT un JSON strict avec cette structure :
{
  "analyzed_at": "ISO timestamp",
  "model_used": "google/gemini-3.1-pro-preview",
  "input_sources_count": ${sources.email.length},
  "analysis": {
    "tendances_marche": "string",
    "flows_recommandes": [{"type_flow": "string", "pourquoi": "string", "nombre_emails_recommande": 0, "timing_optimal": "string"}],
    "lignes_objet_tendances": [{"technique": "string", "taux_ouverture_moyen": "string", "exemple": "string"}],
    "segmentation_avancee": [{"segment": "string", "criteres": "string", "contenu_adapte": "string"}],
    "benchmarks_secteur": {"taux_ouverture_moyen": "string", "taux_clic_moyen": "string", "taux_desabonnement_acceptable": "string", "meilleur_jour_envoi": "string", "meilleure_heure_envoi": "string"},
    "erreurs_a_eviter": ["string"]
  },
  "personas_insights": [{"persona_code": "string", "persona_name": "string", "flows_prioritaires": ["string"], "ton_recommande": "string", "frequence_contact_max": "string"}],
  "status": "success"
}`;

    const emailUserPrompt = `=== TENDANCES MARCHÉ EMAIL (Perplexity, derniers 30j) ===
${perplexity.email.raw_response || "Non disponible"}

=== SOURCES DE RÉFÉRENCE EMAIL (${sources.email.length} sources) ===
${sourcesList}

=== PERSONAS ACTIFS ===
${personaDescriptions}

=== DONNÉES MÉTRIQUES PERSONAS (30j) ===
${personaSummary}

=== CONTEXTE MARQUE ===
${clientCtx}

Produis l'analyse JSON approfondie.`;

    const { parsed, inputTokens, outputTokens, totalTokens, modelUsed: geminiModelEmail } = await callGemini(emailSystemPrompt, emailUserPrompt, 120000);
    geminiEmailAnalysis = { ...parsed, analyzed_at: new Date().toISOString(), status: "success" };
    logUsage(supabase, "gemini", geminiModelEmail, { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens }, { step: "email_analysis" });
    console.log("[monthly-market-intelligence] Gemini EMAIL done ✅");
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[monthly-market-intelligence] Gemini EMAIL FAILED:", msg);
    geminiEmailAnalysis = { status: "error", error: msg, analyzed_at: new Date().toISOString() };
    logUsage(supabase, "gemini", "google/gemini-3.1-pro-preview", 0, { step: "email_analysis", error: msg });
  }

  await supabase
    .from("market_intelligence")
    .update({ gemini_email_analysis: geminiEmailAnalysis, updated_at: new Date().toISOString() })
    .eq("id", intelligenceId);

  // ── OFFERS ANALYSIS ──────────────────────────
  console.log("[monthly-market-intelligence] STEP 2c: Gemini OFFERS analysis...");
  let geminiOffersAnalysis: any = { status: "error", analyzed_at: new Date().toISOString() };
  try {
    const sourcesList = sources.offers.map((s: any) => `${s.source_name} — ${s.description || ""}`).join("\n");

    const offersSystemPrompt = `Tu es un expert senior en stratégie d'offres et pricing e-commerce. Tu analyses les données marché et les sources de référence pour produire une synthèse analytique approfondie sur les opportunités d'offres et bundles pour une marque spécifique.

Tu reçois :
1. Les tendances marché actuelles (recherche Perplexity)
2. Les sources de référence en stratégie d'offres (${sources.offers.length} sources spécialisées)
3. Les données des personas de la marque
4. Le contexte de la marque

Retourne UNIQUEMENT un JSON strict avec cette structure :
{
  "analyzed_at": "ISO timestamp",
  "model_used": "google/gemini-3.1-pro-preview",
  "input_sources_count": ${sources.offers.length},
  "analysis": {
    "tendances_marche": "string",
    "strategies_bundling": [{"type": "string", "mecanique": "string", "marge_typique": "string", "exemple_marche": "string"}],
    "prix_psychologiques": [{"technique": "string", "impact_conversion": "string", "quand_utiliser": "string"}],
    "mecaniques_lancement": [{"type": "string", "duree_optimale": "string", "canaux": ["string"]}],
    "calendrier_commercial": [{"evenement": "string", "date": "string", "type_offre_recommande": "string", "anticipation_necessaire": "string"}],
    "benchmarks_secteur": {"taux_conversion_bundle": "string", "aov_impact_moyen": "string", "taux_cannibalisation_acceptable": "string"},
    "erreurs_a_eviter": ["string"]
  },
  "personas_insights": [{"persona_code": "string", "persona_name": "string", "types_offres_adaptes": ["string"], "sensibilite_prix": "string", "declencheurs_achat": ["string"]}],
  "status": "success"
}`;

    const offersUserPrompt = `=== TENDANCES MARCHÉ OFFRES (Perplexity, derniers 30j) ===
${perplexity.offers.raw_response || "Non disponible"}

=== SOURCES DE RÉFÉRENCE OFFRES (${sources.offers.length} sources) ===
${sourcesList}

=== PERSONAS ACTIFS ===
${personaDescriptions}

=== DONNÉES MÉTRIQUES PERSONAS (30j) ===
${personaSummary}

=== CONTEXTE MARQUE ===
${clientCtx}

Produis l'analyse JSON approfondie.`;

    const { parsed, inputTokens, outputTokens, totalTokens, modelUsed: geminiModelOffers } = await callGemini(offersSystemPrompt, offersUserPrompt, 120000);
    geminiOffersAnalysis = { ...parsed, analyzed_at: new Date().toISOString(), status: "success" };
    logUsage(supabase, "gemini", geminiModelOffers, { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens }, { step: "offers_analysis" });
    console.log("[monthly-market-intelligence] Gemini OFFERS done ✅");
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[monthly-market-intelligence] Gemini OFFERS FAILED:", msg);
    geminiOffersAnalysis = { status: "error", error: msg, analyzed_at: new Date().toISOString() };
    logUsage(supabase, "gemini", "google/gemini-3.1-pro-preview", 0, { step: "offers_analysis", error: msg });
  }

  // Count successes for final status
  const successCount = [geminiAdsAnalysis, geminiEmailAnalysis, geminiOffersAnalysis].filter(
    (a) => a.status === "success"
  ).length;
  const finalStatus = successCount >= 2 ? "complete" : "error";

  await supabase
    .from("market_intelligence")
    .update({
      gemini_offers_analysis: geminiOffersAnalysis,
      status: finalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intelligenceId);

  console.log(`[monthly-market-intelligence] Gemini phase done. ${successCount}/3 succeeded. Status: ${finalStatus}`);
}

// ──────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Read project_id dynamically from tenant_config (replaces hardcoded "ouate")
  const tenantConfig = await loadTenantConfig();
  const PROJECT_ID = tenantConfig.project_id;
  const clientContext = buildClientContext(tenantConfig);
  const tenantIndustry = tenantConfig.industry || "";

  const startTime = Date.now();

  try {
    let body: any = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (_) {}
    const { force = false } = body;

    const monthYear = getCurrentMonthYear();
    console.log(`[monthly-market-intelligence] POST month_year="${monthYear}" force=${force}`);

    // ── STEP 0: Init or resume ──────────────────
    const { data: existing } = await supabase
      .from("market_intelligence")
      .select("*")
      .eq("project_id", PROJECT_ID)
      .eq("month_year", monthYear)
      .maybeSingle();

    if (existing && existing.status === "complete" && !force) {
      console.log(`[monthly-market-intelligence] Already complete for ${monthYear}. Skipping.`);
      return new Response(
        JSON.stringify({
          message: `Market intelligence already complete for ${monthYear}. Use { "force": true } to regenerate.`,
          intelligence_id: existing.id,
          status: "already_complete",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let intelligenceId: string;

    if (!existing || force) {
      // Collect persona data + client context
      console.log("[monthly-market-intelligence] Collecting persona data...");
      const personaData = await collectPersonaData(supabase);

      // Load sources from DB
      const allSources = await paginateQuery((from, to) =>
        supabase
          .from("marketing_sources")
          .select("*")
          .eq("project_id", PROJECT_ID)
          .eq("is_active", true)
          .range(from, to)
      );

      const sourcesByCategory = {
        ads: (allSources || []).filter((s: any) => s.category === "ads"),
        email: (allSources || []).filter((s: any) => s.category === "email"),
        offers: (allSources || []).filter((s: any) => s.category === "offers"),
      };

      // Create or replace the intelligence row
      if (existing && force) {
        await supabase
          .from("market_intelligence")
          .update({
            status: "pending",
            perplexity_ads: {},
            perplexity_email: {},
            perplexity_offers: {},
            gemini_ads_analysis: {},
            gemini_email_analysis: {},
            gemini_offers_analysis: {},
            personas_snapshot: personaData.personaData,
            client_context: clientContext,
            error_log: null,
            generation_duration_ms: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        intelligenceId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("market_intelligence")
          .insert({
            project_id: PROJECT_ID,
            month_year: monthYear,
            status: "pending",
            personas_snapshot: personaData.personaData,
            client_context: clientContext,
            models_used: {
              perplexity: "sonar-pro",
              gemini: "google/gemini-3.1-pro-preview",
            },
          })
          .select()
          .single();
        if (createErr) throw new Error(`Failed to create intelligence row: ${createErr.message}`);
        intelligenceId = created.id;
      }

      console.log(`[monthly-market-intelligence] Intelligence row ID: ${intelligenceId}`);

      // ── STEP 1: Perplexity ──
      const perplexityResults = await runPerplexityPhase(supabase, intelligenceId, monthYear, tenantIndustry);

      // ── STEP 2: Gemini ──
      const personaDataFull = await collectPersonaData(supabase); // refresh
      await runGeminiPhase(supabase, intelligenceId, perplexityResults, personaDataFull, sourcesByCategory, clientContext);

    } else {
      // Resume from where we left off
      intelligenceId = existing.id;
      const personaDataFull = await collectPersonaData(supabase);

      const allSources = await paginateQuery((from, to) =>
        supabase
          .from("marketing_sources")
          .select("*")
          .eq("project_id", PROJECT_ID)
          .eq("is_active", true)
          .range(from, to)
      );

      const sourcesByCategory = {
        ads: (allSources || []).filter((s: any) => s.category === "ads"),
        email: (allSources || []).filter((s: any) => s.category === "email"),
        offers: (allSources || []).filter((s: any) => s.category === "offers"),
      };

      if (existing.status === "pending" || existing.status === "error") {
        console.log(`[monthly-market-intelligence] Resuming from status="${existing.status}"`);
        const perplexityResults = await runPerplexityPhase(supabase, intelligenceId, monthYear, tenantIndustry);
        await runGeminiPhase(supabase, intelligenceId, perplexityResults, personaDataFull, sourcesByCategory, clientContext);
      } else if (existing.status === "perplexity_done") {
        console.log("[monthly-market-intelligence] Resuming from perplexity_done — running Gemini only...");
        const perplexityData = {
          ads: existing.perplexity_ads,
          email: existing.perplexity_email,
          offers: existing.perplexity_offers,
        };
        await runGeminiPhase(supabase, intelligenceId, perplexityData, personaDataFull, sourcesByCategory, clientContext);
      }
    }

    // ── STEP 3: Finalize ────────────────────────
    const durationMs = Date.now() - startTime;
    await supabase
      .from("market_intelligence")
      .update({
        generation_duration_ms: durationMs,
        models_used: { perplexity: "sonar-pro", gemini: "google/gemini-3.1-pro-preview" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", intelligenceId);

    // Read final state
    const { data: finalRow } = await supabase
      .from("market_intelligence")
      .select("id, status, month_year, generation_duration_ms")
      .eq("id", intelligenceId)
      .single();

    console.log(
      `[monthly-market-intelligence] COMPLETE. ID=${intelligenceId} status=${finalRow?.status} duration=${durationMs}ms`
    );

    return new Response(
      JSON.stringify({
        success: true,
        intelligence_id: intelligenceId,
        month_year: monthYear,
        status: finalRow?.status,
        duration_ms: durationMs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const msg = err?.message || "Unknown error";
    const durationMs = Date.now() - startTime;
    console.error("[monthly-market-intelligence] FATAL ERROR:", msg);
    reportEdgeFunctionError("monthly-market-intelligence", err, { type: "cron_failure", severity: "critical" });

    // Try to log the error in the intelligence row if it exists
    try {
      const monthYear = getCurrentMonthYear();
      await supabase
        .from("market_intelligence")
        .update({ status: "error", error_log: msg, updated_at: new Date().toISOString() })
        .eq("project_id", PROJECT_ID)
        .eq("month_year", monthYear);
    } catch (_) {}

    return new Response(JSON.stringify({ error: msg, duration_ms: durationMs }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
