import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTenantConfig, type TenantConfig } from "../_shared/loadTenantConfig.ts";
import { paginateQuery } from "../_shared/paginateSupabase.ts";
import { notifyPortalThreshold } from "../_shared/notifyPortalThreshold.ts";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";

// Helper: log API usage with a FRESH Supabase client (same pattern as Perplexity which works)
async function logApiUsage(payload: Record<string, unknown>) {
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await client.from("api_usage_logs").insert(payload).select();
    if (error) {
      console.error("LOG FAIL:", payload.model, error.message, error.code, error.details);
    } else {
      console.log("LOG OK:", payload.model, payload.metadata && (payload.metadata as any).type, "row inserted:", !!data);
    }
  } catch (e: any) {
    console.error("LOG EXCEPTION:", payload.model, e.message);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ======================================================
// PERPLEXITY — détecter si la question nécessite une recherche externe
// ======================================================
function needsPerplexityResearch(userMessage: string): boolean {
  const externalKeywords = [
    "tendance", "benchmark", "marché", "concurren", "stratégie",
    "best practice", "meilleure pratique", "industrie", "secteur",
    "comment font", "qu'est-ce qui marche", "nouvell", "récent",
    "innovation", "étude", "statistique", "taux moyen", "moyenne du marché",
    "meta ads", "tiktok", "facebook", "instagram",
    "klaviyo", "omnisend", "mailchimp", "brevo",
    "email", "email marketing", "newsletter", "acquisition", "rétention",
    "bundle", "upsell", "cross-sell", "fidélisation", "ltv",
    "dtc", "e-commerce",
    "2024", "2025", "2026",
  ];
  const lower = userMessage.toLowerCase();
  return externalKeywords.some(k => lower.includes(k));
}

async function callPerplexity(query: string, tenantConfig: TenantConfig): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  // Build dynamic specialty description from tenant config
  const industryPart = tenantConfig.industry ? `dans ${tenantConfig.industry}` : "";
  const audiencePart = tenantConfig.target_audience ? ` (${tenantConfig.target_audience})` : "";
  const specialtyDescription = `${industryPart}${audiencePart}`.trim() || "le secteur e-commerce DTC";

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        search_recency_filter: "month",
        messages: [
          {
            role: "system",
            content: `Tu es un expert en marketing e-commerce DTC spécialisé ${specialtyDescription}.
RÈGLE DE FRAÎCHEUR ABSOLUE : Ne retourne QUE des informations datant de moins de 6 mois. Ignore toute source antérieure à septembre 2025.
Recherche les informations les plus récentes et pertinentes.
Fournis des données chiffrées, des exemples concrets et des sources fiables avec leur date de publication.
Réponds en français. Sois concis et actionnable. Maximum 400 mots.`,
          },
          { role: "user", content: query },
        ],
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    // Log Perplexity usage
    const perplexityModel = "sonar-pro";
    const perplexityTotalTokens = data.usage?.total_tokens || 0;
    logApiUsage({
      edge_function: "aski-chat",
      api_provider: "perplexity",
      model: perplexityModel,
      tokens_used: perplexityTotalTokens,
      total_tokens: perplexityTotalTokens,
      api_calls: 1,
      metadata: { type: "web_search" },
    });
    return data.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.error("Perplexity call failed:", err);
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

// ======================================================
// INSIGHTS PERSONAS — calcul en temps réel depuis sessions
// Generic version: iterates dynamically on item_metadata JSONB keys.
// ======================================================
function buildPersonaInsights(
  personaCode: string,
  sessions: any[],
  items: any[],
  tenantConfig: TenantConfig
): string | null {
  const ps = sessions.filter((s) => s.persona_code === personaCode);
  if (ps.length === 0) return null;

  const countValues = (arr: (string | null | undefined | boolean)[]): string => {
    const counts: Record<string, number> = {};
    arr
      .filter((v) => v !== null && v !== undefined && v !== "")
      .forEach((v) => { const k = String(v); counts[k] = (counts[k] || 0) + 1; });
    if (Object.keys(counts).length === 0) return "N/A";
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([v, c]) => `${v} ${Math.round((c / total) * 100)}%`)
      .join(", ");
  };

  const sessionIds = ps.map((s) => s.id);
  // Pick item_index === 0 (primary item) for each persona session
  const personaItems = items.filter(
    (c) => sessionIds.includes(c.session_id) && (c.item_index === 0 || c.item_index === undefined)
  );

  // Session-level metrics (always present, agnostic)
  const priorities = ps.map((s) => s.priorities_ordered?.split(",")[0]?.trim());
  const tones = ps.map((s) => s.adapted_tone);
  const trustTriggers = ps.map((s) => s.trust_triggers_ordered?.split(",")[0]?.trim());
  const routineSizes = ps.map((s) => s.routine_size_preference);
  const formats = ps.map((s) => s.content_format_preference);

  // Conversion / AOV / engagement metrics (all tenants)
  const converted = ps.filter((s) => s.conversion === true).length;
  const convRate = ps.length > 0 ? ((converted / ps.length) * 100).toFixed(1) : "0";
  const cartSessions = ps.filter((s) => s.selected_cart_amount && s.selected_cart_amount > 0);
  const aov = cartSessions.length > 0
    ? Math.round(cartSessions.reduce((sum, s) => sum + (s.selected_cart_amount || 0), 0) / cartSessions.length)
    : 0;
  const avgScore = ps.length > 0
    ? Math.round(ps.reduce((sum, s) => sum + (s.matching_score || 0), 0) / ps.length)
    : 0;
  const emailOptins = ps.filter((s) => s.optin_email).length;
  const emailRate = ps.length > 0 ? Math.round((emailOptins / ps.length) * 100) : 0;

  // Generic NEED-level metrics: iterate on the tenant's persona_dimension_mapping.need
  // and aggregate distribution for each field across persona items
  const needMapping = tenantConfig.persona_dimension_mapping?.need || [];
  const needLines: string[] = [];
  for (const field of needMapping) {
    const values = personaItems.map((it: any) => it.item_metadata?.[field]);
    const dist = countValues(values);
    if (dist !== "N/A") {
      needLines.push(`  ${field} : ${dist}`);
    }
  }

  return `  Sessions : ${ps.length} | Score moyen : ${avgScore}% | Conversion : ${convRate}% | AOV : ${aov}€ | Email optin : ${emailRate}%
${needLines.join("\n")}
  Priorités : ${countValues(priorities)}
  Tons adaptés : ${countValues(tones)}
  Trust triggers : ${countValues(trustTriggers)}
  Format : ${countValues(formats)}
  Routine : ${countValues(routineSizes)}`;
}

// ======================================================
// MAIN
// ======================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load tenant configuration once at the start of the handler
    // (cached internally for 5 minutes by loadTenantConfig)
    const tenantConfig = await loadTenantConfig();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const { chatId, userMessage } = await req.json();
    if (!userMessage?.trim()) {
      return new Response(JSON.stringify({ error: "Message vide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === LIMITE MENSUELLE — lire depuis client_plan ===
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [{ count }, { data: clientPlanData }] = await Promise.all([
      supabase
        .from("aski_messages")
        .select("*", { count: "exact", head: true })
        .eq("role", "user")
        .gte("created_at", startOfMonth.toISOString()),

      supabase
        .from("client_plan")
        .select("aski_limit, plan")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const askiLimit: number = clientPlanData?.aski_limit ?? 100; // fallback Starter
    const questionsAsked = count ?? 0;
    // +1 because we count BEFORE inserting the current message
    const questionsAfterThis = questionsAsked + 1;
    const usagePercent = askiLimit > 0 ? (questionsAfterThis / askiLimit) * 100 : 0;
    const previousPercent = askiLimit > 0 ? (questionsAsked / askiLimit) * 100 : 0;

    // Fire-and-forget: notify portal at 80% and 100% thresholds
    if (previousPercent < 80 && usagePercent >= 80) {
      console.log(`[quota-notify] Crossing 80% threshold: ${questionsAfterThis}/${askiLimit}`);
      notifyPortalThreshold("aski", 80, questionsAfterThis, askiLimit);
    }
    if (previousPercent < 100 && usagePercent >= 100) {
      console.log(`[quota-notify] Crossing 100% threshold: ${questionsAfterThis}/${askiLimit}`);
      notifyPortalThreshold("aski", 100, questionsAfterThis, askiLimit);
    }

    if (questionsAsked >= askiLimit) {
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const nextMonthStr = nextMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      return new Response(JSON.stringify({
        error: "limit_reached",
        blocked: true,
        reason: "quota_exceeded",
        message: `Vous avez atteint la limite de ${askiLimit} conversations ce mois-ci. Le compteur se réinitialise le 1er ${nextMonthStr}.`,
        questions_used: questionsAsked,
        questions_limit: askiLimit,
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === CONVERSATION ===
    let currentChatId = chatId;
    if (!currentChatId) {
      const { data: newChat, error: chatError } = await supabase
        .from("aski_chats")
        .insert({ title: "Nouvelle conversation" })
        .select("id")
        .single();
      if (chatError) throw new Error("Erreur de création de conversation.");
      currentChatId = newChat.id;
    }

    await supabase.from("aski_messages").insert({
      chat_id: currentChatId,
      role: "user",
      content: userMessage,
    });

    const { data: chatHistory } = await supabase
      .from("aski_messages")
      .select("role, content")
      .eq("chat_id", currentChatId)
      .order("created_at", { ascending: true })
      .limit(20);

    // === CHARGEMENT PARALLÈLE DE TOUTES LES DONNÉES ===
    const [
      { data: personaRows },
      allSessions,
      allItems,
      { data: shopifyProducts },
      { data: latestRecos },
      marketingSourcesData,
      { data: marketIntelligenceData },
      { data: askiMemories },
      perplexityContext,
    ] = await Promise.all([
      supabase
        .from("personas")
        .select("code, name, full_label, description, criteria, is_pool, is_auto_created, session_count, avg_matching_score")
        .eq("is_active", true)
        .order("code"),

      paginateQuery((from, to) =>
        supabase
          .from("diagnostic_sessions")
          .select("id, persona_code, matching_score, adapted_tone, priorities_ordered, trust_triggers_ordered, routine_size_preference, content_format_preference, relationship, is_existing_client, number_of_children, engagement_score, conversion, selected_cart_amount, optin_email, optin_sms, duration_seconds, created_at")
          .eq("status", "termine")
          .range(from, to)
      ),

      paginateQuery((from, to) =>
        supabase
          .from("diagnostic_items")
          .select("session_id, item_index, item_metadata")
          .range(from, to)
      ),

      supabase
        .from("client_products")
        .select("title, description, product_type, price_min, price_max, tags, variants, handle, shopify_url")
        .eq("status", "active")
        .order("title"),

      supabase
        .from("marketing_recommendations")
        .select("category, title, brief, persona_cible, content, targeting, feedback_score, feedback_results, feedback_notes, completed_at, generated_at, action_status")
        .eq("recommendation_version", 3)
        .eq("status", "active")
        .order("generated_at", { ascending: false })
        .limit(20),

      paginateQuery((from, to) =>
        supabase
          .from("marketing_sources")
          .select("source_name, category, description")
          .eq("is_active", true)
          .order("category")
          .range(from, to)
      ),

      supabase
        .from("market_intelligence")
        .select("month_year, gemini_ads_analysis, gemini_email_analysis, gemini_offers_analysis, updated_at")
        .eq("status", "complete")
        .order("month_year", { ascending: false })
        .limit(3),

      supabase
        .from("aski_memory")
        .select("category, insight, confidence")
        .eq("is_active", true)
        .gte("confidence", 2)
        .order("confidence", { ascending: false })
        .limit(15),

      needsPerplexityResearch(userMessage) ? callPerplexity(userMessage, tenantConfig) : Promise.resolve(""),
    ]);

    const sessions = allSessions ?? [];
    const items = allItems ?? [];
    const products = shopifyProducts ?? [];
    const personas = (personaRows ?? []).filter((p: any) => !p.is_pool);
    const marketIntelligence = marketIntelligenceData ?? [];
    const marketingSources = marketingSourcesData ?? [];

    // === CONSTRUCTION SECTION INTELLIGENCE DE MARCHÉ RÉCENTE ===
    let marketIntelPrompt = "";
    if (marketIntelligence.length > 0) {
      const summaries: string[] = [];
      for (const mi of marketIntelligence) {
        const month = mi.month_year;
        const parts: string[] = [`Mois : ${month}`];

        // Extract key insights from each Gemini analysis (truncated for context size)
        const extractInsights = (analysis: any, label: string) => {
          if (!analysis?.analysis) return;
          const a = analysis.analysis;
          const trends = Array.isArray(a.tendances_marche) ? a.tendances_marche.slice(0, 3).join(" | ") : "";
          const errors = Array.isArray(a.erreurs_a_eviter) ? a.erreurs_a_eviter.slice(0, 2).join(" | ") : "";
          const hooks = Array.isArray(a.hooks_performants) ? a.hooks_performants.slice(0, 3).map((h: any) => typeof h === "string" ? h : h.hook || h.title || JSON.stringify(h)).join(" | ") : "";
          if (trends) parts.push(`  ${label} tendances : ${trends}`);
          if (hooks) parts.push(`  ${label} hooks : ${hooks}`);
          if (errors) parts.push(`  ${label} erreurs : ${errors}`);
        };

        extractInsights(mi.gemini_ads_analysis, "Ads");
        extractInsights(mi.gemini_email_analysis, "Email");
        extractInsights(mi.gemini_offers_analysis, "Offres");

        if (parts.length > 1) summaries.push(parts.join("\n"));
      }
      if (summaries.length > 0) {
        marketIntelPrompt = `=== INTELLIGENCE DE MARCHÉ RÉCENTE (${summaries.length} mois) ===

Ces analyses sont issues de recherches de marché automatisées (Perplexity + Gemini) réalisées spécifiquement pour la marque :

${summaries.join("\n\n")}

Utilise ces tendances récentes comme base de tes recommandations. Elles sont plus fiables que des connaissances génériques.`;
      }
    }

    // === CONSTRUCTION SECTION SOURCES MARKETING ===
    const sourcesByCategory: Record<string, string[]> = {};
    for (const src of marketingSources) {
      const cat = (src.category as string)?.toLowerCase() ?? "other";
      if (!sourcesByCategory[cat]) sourcesByCategory[cat] = [];
      sourcesByCategory[cat].push(src.source_name as string);
    }
    const adsSourceNames = sourcesByCategory["ads"] ?? [];
    const emailSourceNames = sourcesByCategory["email"] ?? [];
    const offersSourceNames = sourcesByCategory["offers"] ?? sourcesByCategory["offres"] ?? [];
    const marketingSourcesPrompt = `Tu as accès à une base de connaissances marketing de ${marketingSources.length} sources de référence couvrant les meilleures pratiques en publicité digitale, email marketing et stratégie d'offres. Utilise ces connaissances pour enrichir tes recommandations avec des best practices éprouvées.

Ads (${adsSourceNames.length} sources) : ${adsSourceNames.slice(0, 40).join(", ")}
Email (${emailSourceNames.length} sources) : ${emailSourceNames.slice(0, 40).join(", ")}
Offres (${offersSourceNames.length} sources) : ${offersSourceNames.slice(0, 40).join(", ")}

Appuie-toi sur ces ressources pour orienter tes recommandations quand c'est pertinent, sans inventer de données ou de citations spécifiques.`;

    // === CONSTRUCTION SECTION PRODUITS ===
    let productsPrompt = "";
    if (products.length > 0) {
      productsPrompt = products.map((p: any) => {
        const priceStr = !p.price_min
          ? "prix NC"
          : p.price_min === p.price_max
          ? `${p.price_min}€`
          : `${p.price_min}€ - ${p.price_max}€`;
        const variantNames = (p.variants as any[])
          ?.map((v: any) => v.title)
          .filter((t: string) => t && t !== "Default Title")
          .slice(0, 4)
          .join(", ");
        const tagsStr = (p.tags as string[])?.slice(0, 5).join(", ");
        const desc = p.description ? p.description.substring(0, 180) : "";
        return `• ${p.title} (${p.product_type || "soin"}) — ${priceStr}${variantNames ? " | Variantes : " + variantNames : ""}${tagsStr ? " | Tags : " + tagsStr : ""}${desc ? "\n  " + desc : ""}`;
      }).join("\n");
    } else {
      productsPrompt = "(Sync Shopify en attente — aucun produit chargé)";
    }

    // === CONSTRUCTION INSIGHTS PERSONAS ===
    const personaInsights = personas
      .filter((p: any) => !p.is_pool)
      .map((p: any) => {
        const insights = buildPersonaInsights(p.code, sessions, items, tenantConfig);
        if (!insights) {
          return `${p.full_label}${p.is_auto_created ? " [Auto-détecté]" : ""}\n  Description : ${p.description || "Profil en cours de définition."}\n  Aucune session terminée pour ce persona.`;
        }
        return `${p.full_label}${p.is_auto_created ? " [Auto-détecté]" : ""}\n  Description : ${p.description || "Profil en cours de définition."}\n${insights}`;
      })
      .join("\n\n");

    const p0Count = sessions.filter((s: any) => !s.persona_code || s.persona_code === "P0").length;

    // === MÉTRIQUES GLOBALES ===
    const totalSessions = sessions.length;
    const converted = sessions.filter((s: any) => s.conversion === true).length;
    const convRate = totalSessions > 0 ? ((converted / totalSessions) * 100).toFixed(1) : "0";
    const cartSessions = sessions.filter((s: any) => s.selected_cart_amount && s.selected_cart_amount > 0);
    const globalAov = cartSessions.length > 0
      ? Math.round(cartSessions.reduce((sum: number, s: any) => sum + (s.selected_cart_amount || 0), 0) / cartSessions.length)
      : 0;
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
    const prevMonthEnd = currentMonthStart;
    const currentMonthSessions = sessions.filter((s: any) => s.created_at && s.created_at >= currentMonthStart).length;
    const prevMonthSessions = sessions.filter((s: any) => s.created_at && s.created_at >= prevMonthStart && s.created_at < prevMonthEnd).length;
    const growth = prevMonthSessions > 0
      ? (((currentMonthSessions - prevMonthSessions) / prevMonthSessions) * 100).toFixed(1) + "%"
      : "N/A";

    // === SECTION RECOMMANDATIONS MARKETING & RÉSULTATS ===
    let recosContext = "";
    const recos = latestRecos ?? [];
    if (recos.length > 0) {
      const withFeedback = recos.filter((r: any) => r.feedback_score);
      const active = recos.filter((r: any) => r.action_status === "todo" || r.action_status === "in_progress");
      const done = recos.filter((r: any) => r.action_status === "done");

      const parts: string[] = [];

      if (active.length > 0) {
        parts.push(`Recommandations en cours (${active.length}) :\n` + active.map((r: any) =>
          `- [${r.category}] ${r.title} — Pour ${r.persona_cible} — ${r.action_status === "in_progress" ? "En cours" : "À faire"}`
        ).join("\n"));
      }

      if (withFeedback.length > 0) {
        const formatResult = (r: any) => {
          const score = r.feedback_score === "good" ? "🟢 Bon" : r.feedback_score === "average" ? "🟡 Moyen" : "🔴 Mauvais";
          const format = r.content?.format || r.content?.type_offre || r.content?.type_email || "";
          const results = r.feedback_results || {};
          const metrics = Object.entries(results)
            .filter(([k]) => k !== "periode" && typeof results[k] === "number")
            .map(([k, v]) => `${k}: ${v}`)
            .slice(0, 5)
            .join(", ");
          return `- [${r.category}] ${r.title} — ${r.persona_cible} — Format: ${format} — ${score}${metrics ? ` — ${metrics}` : ""}${r.feedback_notes ? ` — Notes: ${r.feedback_notes}` : ""}`;
        };
        parts.push(`Résultats des recommandations terminées (${withFeedback.length}) :\n` + withFeedback.map(formatResult).join("\n"));
      }

      if (done.length > 0 && withFeedback.length === 0) {
        parts.push(`Recommandations terminées sans résultats renseignés : ${done.length}`);
      }

      recosContext = parts.join("\n\n");
    }

    // === SYSTEM PROMPT ===
    const brandName = tenantConfig.brand_name;
    const brandTone = tenantConfig.brand_tone || "Ton professionnel, bienveillant et adapté à la marque. Vocabulaire naturel et clair. Privilégier les formulations positives et constructives.";

    const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const systemPrompt = `Tu es Aski, l'assistant IA du dashboard Ask-It pour la marque ${brandName}.

DATE DU JOUR : ${today}
Utilise cette date comme référence pour tout planning, calendrier commercial, saisonnalité ou échéance.

TON RÔLE :
Tu aides l'équipe marketing de la marque à comprendre leurs données, exploiter leurs personas, et prendre des décisions marketing éclairées. Tu as accès à toutes les données du diagnostic, les personas, les métriques de vente et le catalogue produits.

STYLE DE RÉPONSE :
Adapte la forme de ta réponse à ce qui est demandé. Pas de template fixe — chaque réponse doit être pensée pour être la plus utile possible dans son contexte.

Principes :
- Aère tes réponses — jamais plus de 3-4 lignes consécutives sans respiration visuelle
- Utilise la structure qui sert le mieux le contenu (paragraphes, sections titrées, ou format libre selon ce qui est le plus clair)
- Pour du contenu marketing (ads, emails, scripts), sépare clairement chaque pièce de contenu pour qu'elles soient facilement identifiables
- Utilise les données chiffrées du dashboard quand elles apportent de la valeur (AOV, conversion, volume du persona)
- Justifie brièvement tes choix stratégiques quand c'est pertinent — pourquoi ce produit, pourquoi cet angle, pourquoi ce format

Ce qu'il faut éviter :
- Des blocs de texte denses et indigestes
- Un formatage identique pour chaque réponse comme si c'était un template
- Des réponses génériques qui pourraient s'appliquer à n'importe quelle marque
- Des formules d'introduction enthousiastes vides ("Excellente question !", "Bien sûr !", "Absolument !")
- Les tirets cadratins (—) au milieu des phrases pour relier deux idées : utilise plutôt une virgule, deux-points, ou une nouvelle phrase
- Les constructions "X — Y" qui sonnent artificiel : préfère "X. Y" ou "X, Y"

L'objectif : que chaque réponse soit alignée avec la demande, exploite les données réelles, et soit immédiatement exploitable par l'équipe marketing.

TON CONVERSATIONNEL :
- Professionnel mais accessible — comme un collègue marketing senior
- Direct et concis — va droit au point
- Utilise les données concrètes du dashboard pour appuyer tes réponses (chiffres, personas, tendances)
- Ne répète pas la question dans ta réponse

QUAND TU GÉNÈRES DU CONTENU POUR LA MARQUE :
Quand tu rédiges du contenu destiné à être utilisé par la marque (ad copy, lignes d'objet email, scripts vidéo, textes de landing page, descriptions produits, posts réseaux sociaux) :
- Rédige dans le TON DE LA MARQUE, pas dans ton ton conversationnel standard
- ${brandTone}
- Adapte le vocabulaire, le niveau de langage et les émotions au positionnement de la marque
- Le contenu doit être prêt à être copié-collé et utilisé tel quel

QUAND TU PROPOSES DU CONTENU MARKETING POUR UN PERSONA :
- Identifie d'abord les produits les plus cohérents avec le profil du persona (skin_concern, age_range, has_routine, skin_reactivity) — ce sont ceux qui résonnent le plus avec ce profil
- Concentre tes recommandations sur ces produits en priorité
- Adapte l'angle marketing selon les caractéristiques réelles du persona : ses problématiques (skin_concern), ses besoins (priorities), ses déclencheurs de confiance (trust_triggers), son comportement d'achat (AOV, conversion rate)
- Chaque produit mis en avant doit être justifié par les données du persona

RÈGLES ABSOLUES :
1. Ne recommande JAMAIS un produit qui n'existe pas dans le catalogue
2. N'invente JAMAIS de chiffres — utilise uniquement les données réelles du dashboard
3. Si tu n'as pas assez de données pour répondre, dis-le clairement plutôt que de deviner
4. Les prix mentionnés doivent correspondre aux vrais prix du catalogue
5. Quand tu mentionnes un persona, utilise UNIQUEMENT son prénom et son titre descriptif : "Clara — La Novice Imperfections". Ne montre JAMAIS les codes techniques (P1, P2, P3, etc.), ces codes sont internes et n'ont aucun sens pour la marque. Dans les tableaux récapitulatifs, utilise le prénom seul : "Clara", pas "P1 Clara". Si tu distingues plusieurs personas dans une réponse, le prénom suffit.

RÈGLE DE FRAÎCHEUR DES SOURCES :
- Ne cite JAMAIS de ressource, étude, benchmark ou article datant de plus de 12 mois
- Privilégie TOUJOURS les données des 3 à 6 derniers mois quand elles sont disponibles
- Si tu disposes de l'intelligence de marché pré-calculée (section ci-dessous), appuie-toi dessus en priorité : ces analyses sont issues de recherches récentes et vérifiées
- Quand Perplexity fournit des résultats, vérifie mentalement leur date avant de les citer
- Si tu n'as que des références anciennes sur un sujet, indique-le explicitement plutôt que de présenter des données obsolètes comme actuelles

INTERPRÉTATION INTELLIGENTE DES CHIFFRES :
Quand tu cites des métriques, contextualise-les correctement selon ces benchmarks :

Taux de conversion e-commerce :
  < 1% = faible | 1-3% = dans la moyenne du marché | 3-5% = bon | 5-10% = très bon | > 10% = exceptionnel
  Ne dis JAMAIS qu'un taux de conversion de 10%+ est "limité" ou "reste à améliorer". Un taux de 14% est exceptionnel, dis-le. S'il y a une marge de progression, formule-le positivement : "avec un taux de conversion déjà exceptionnel à 14,4%, l'enjeu est d'augmenter le volume d'entrée pour maximiser l'impact".

AOV (Average Order Value) :
  Contextualise par rapport à la gamme de prix de la marque, pas en absolu. Si l'AOV dépasse significativement la fourchette de prix unitaire moyenne des produits, c'est probablement le signe d'un panier multiple (bundle ou 2+ produits), un signal positif.

Volume de sessions :
  Précise toujours DE QUOI on parle : "le volume de sessions du diagnostic", "le nombre de visiteurs", "le nombre de commandes".
  Ne dis jamais "le volume global est en recul" sans préciser quel volume exactement.
  Quand tu compares des périodes, précise les périodes : "les sessions du diagnostic en mars (494) vs février (552)", pas juste "-10,6%".

Règle générale : chaque chiffre cité doit être accompagné de son contexte (c'est bon, moyen ou mauvais pour cette marque dans ce secteur) et de ce que ça implique concrètement.

SOURÇAGE DES AFFIRMATIONS FACTUELLES :
- Quand tu cites un fait externe, une tendance marché ou une actualité, précise d'où vient l'information : "selon [source]" ou "cette tendance est documentée dans [source]"
- Si l'information vient de tes connaissances générales et non d'une source vérifiable, formule-le en tant que tendance observée : "on observe actuellement une tendance..." sans présenter ça comme un fait daté et sourcé
- Ne cite JAMAIS une date précise, un nom d'enquête ou un événement spécifique sauf si c'est une information vérifiable dans les données du dashboard ou les sources marketing fournies
- N'INVENTE JAMAIS d'actualité, d'étude ou d'enquête. Si tu n'as pas de source vérifiable, décris la tendance générale sans la dater ni l'attribuer à une source fictive
- Si tu cites une des ${marketingSources.length} sources marketing disponibles, mentionne le nom de la source

INTERDICTION ABSOLUE D'HALLUCINATION PRODUIT :
- Ne cite JAMAIS un ingrédient, un composant, un claim ou un pourcentage qui ne figure pas EXPLICITEMENT dans la fiche produit du catalogue
- Si tu ne connais pas la composition exacte d'un produit, dis-le clairement plutôt que d'inventer
- Ne dis JAMAIS "95% d'origine naturelle", "testé dermatologiquement", ou tout autre claim sauf si c'est écrit mot pour mot dans la description du produit
- Quand tu recommandes un produit, base-toi UNIQUEMENT sur : le nom exact du produit, son prix réel, et sa description telle qu'elle apparaît dans le catalogue

VOCABULAIRE — TOUJOURS TRADUIRE EN FRANÇAIS COMPRÉHENSIBLE :
Ne jamais utiliser les noms techniques internes des critères dans tes réponses. Exemples :
  - ingredient_transparency → "transparence dans la composition des ingrédients"
  - scientific_validation → "validation scientifique des formules"
  - proof_results → "preuves de résultats concrets"
  - brand_engagement → "engagement avec la marque"
  - peer_recommendation → "recommandations d'autres clients"
  - ludique → "approche ludique"
  - efficacite → "efficacité prouvée"
  - clean → "composition clean / naturelle"
  - autonomie → "autonomie de l'utilisateur"
  - visual → "contenu visuel"
  - short → "contenu court"
  - complete → "contenu détaillé"
  - routine_size_preference: minimal → "routine minimale"
  - routine_size_preference: simple → "routine simple"
  - routine_size_preference: complete → "routine complète"
  - content_format_preference → "format de contenu préféré"
  - trust_trigger → "déclencheur de confiance"
  - skin_reactivity → "réactivité de la peau"
  - has_routine → "a déjà une routine"
  - is_existing_client → "cliente existante"
En revanche, les noms de personas (Clara, Nathalie, Amandine...) et les noms de produits (Mon Nettoyant Douceur, Ma Crème d'Amour...) doivent TOUJOURS être utilisés tels quels.

=== GAMME DE PRODUITS ${brandName.toUpperCase()} — SYNC SHOPIFY TEMPS RÉEL (${products.length} produit${products.length !== 1 ? "s" : ""}) ===

${productsPrompt}

⚠️ RÈGLE ABSOLUE PRODUITS : Tu ne peux recommander QUE les produits listés ci-dessus avec leurs noms et prix exacts. Si un produit n'est pas dans cette liste, il N'EXISTE PAS chez ${brandName}. Ne jamais inventer, extrapoler, supposer l'existence d'un produit, ni attribuer des claims ou ingrédients qui ne figurent pas dans la description.

=== PERSONAS ${brandName.toUpperCase()} — INSIGHTS TEMPS RÉEL (${totalSessions} sessions terminées) ===

${personaInsights}

P0 — Non attribué : ${p0Count} sessions (score matching < 60%)

=== MÉTRIQUES GLOBALES ===

Sessions terminées : ${totalSessions} | Taux de conversion global : ${convRate}% | AOV moyen : ${globalAov}€
Mois actuel : ${currentMonthSessions} sessions | Mois précédent : ${prevMonthSessions} sessions | Évolution : ${growth}

=== BASE DE CONNAISSANCES MARKETING (${marketingSources.length} sources) ===

${marketingSourcesPrompt}

${marketIntelPrompt ? `${marketIntelPrompt}

` : ""}${perplexityContext ? `=== RECHERCHE TEMPS RÉEL (Perplexity sonar-pro) ===
${perplexityContext}

Utilise ces informations fraîches pour compléter ta réponse avec les tendances les plus récentes. Vérifie que les sources citées datent de moins de 12 mois.` : ""}

${recosContext ? `=== RECOMMANDATIONS MARKETING & RÉSULTATS DE PERFORMANCE ===

${recosContext}

Tu peux utiliser ces données pour répondre à des questions sur la performance des campagnes, les formats qui fonctionnent le mieux, les ROAS, les taux d'ouverture, etc. Si la marque demande "quel type d'ads fonctionne le mieux", base-toi sur les feedback_score des recommandations terminées.` : ""}

${(askiMemories ?? []).length > 0 ? `=== MÉMOIRE DE LA MARQUE (${(askiMemories ?? []).length} directives confirmées) ===

Ces directives ont été explicitement exprimées par l'équipe marketing lors de précédentes conversations. Respecte-les dans tes réponses :

${(askiMemories ?? []).map((m: any) => `• [${m.category === "brand_directive" ? "Marque" : m.category === "content_rule" ? "Contenu" : "Canal"}] ${m.insight} (confirmé ${m.confidence}x)`).join("\n")}

IMPORTANT : Ces directives sont prioritaires sur tes propres suppositions. Ne les contredis pas sauf si l'utilisateur te donne explicitement une nouvelle consigne contraire.` : ""}`;

    // === CONSTRUCTION DES MESSAGES ANTHROPIC ===
    // Le system prompt est un paramètre séparé — les messages ne contiennent QUE user/assistant
    const historyMessages = (chatHistory ?? [])
      .slice(0, -1) // exclure le dernier message (le user qu'on vient d'insérer)
      .filter((msg: any) => msg.role === "user" || msg.role === "assistant")
      .map((msg: any) => ({ role: msg.role as "user" | "assistant", content: msg.content }));

    // Assurer que les messages alternent correctement user/assistant
    const cleanedHistory: { role: "user" | "assistant"; content: string }[] = [];
    for (const msg of historyMessages) {
      const last = cleanedHistory[cleanedHistory.length - 1];
      if (last && last.role === msg.role) {
        // fusionner les messages consécutifs du même rôle
        last.content += "\n" + msg.content;
      } else {
        cleanedHistory.push({ ...msg });
      }
    }

    const anthropicMessages = [
      ...cleanedHistory,
      { role: "user" as const, content: userMessage },
    ];

    // === APPEL IA AVEC FALLBACK ===
    // Tentative 1 : Claude Sonnet 4.6 (110s)
    // Tentative 2 : Gemini 2.5 Pro via Lovable AI Gateway (30s)

    let responseText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let modelUsed = "claude-sonnet-4-6";

    const sonnetModel = "claude-sonnet-4-6";
    const geminiModel = "google/gemini-2.5-pro";

    let sonnetSucceeded = false;

    // ── TENTATIVE 1 : Claude Sonnet 4.6 ──
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 110000); // 110s

      const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: sonnetModel,
          max_tokens: 16000,
          system: systemPrompt,
          messages: anthropicMessages,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error(`[Aski] Anthropic error ${aiResponse.status}:`, errText);
        // Log échec Sonnet
        await logApiUsage({
          edge_function: "aski-chat",
          api_provider: "anthropic",
          model: sonnetModel,
          tokens_used: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          api_calls: 1,
          metadata: { type: "main_response", status: "error", http_status: aiResponse.status, error: errText.slice(0, 200) },
        });
        throw new Error(`Anthropic API error ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      responseText = aiData.content?.[0]?.text ?? "";
      inputTokens = aiData.usage?.input_tokens ?? 0;
      outputTokens = aiData.usage?.output_tokens ?? 0;
      const cacheCreationTokens = aiData.usage?.cache_creation_input_tokens ?? 0;
      const cacheReadTokens = aiData.usage?.cache_read_input_tokens ?? 0;
      const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
      modelUsed = sonnetModel;
      sonnetSucceeded = true;

      const estimatedCostUsd = (inputTokens * 3 / 1_000_000) + (outputTokens * 15 / 1_000_000) + (cacheCreationTokens * 3.75 / 1_000_000) + (cacheReadTokens * 0.30 / 1_000_000);

      await logApiUsage({
        edge_function: "aski-chat",
        api_provider: "anthropic",
        model: sonnetModel,
        tokens_used: totalTokens,
        input_tokens: inputTokens + cacheCreationTokens + cacheReadTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        api_calls: 1,
        metadata: { type: "main_response", status: "success", estimated_cost_usd: estimatedCostUsd, cache_creation_tokens: cacheCreationTokens, cache_read_tokens: cacheReadTokens },
      });

    } catch (sonnetError: unknown) {
      const errMsg = sonnetError instanceof Error ? sonnetError.message : String(sonnetError);
      const isTimeout = sonnetError instanceof Error && sonnetError.name === "AbortError";
      console.error(`[Aski] Sonnet failed (${isTimeout ? "timeout" : "error"}): ${errMsg}`);

      // Log tentative échouée Sonnet
      await logApiUsage({
        edge_function: "aski-chat",
        api_provider: "anthropic",
        model: sonnetModel,
        tokens_used: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        api_calls: 1,
        metadata: { type: "main_response", status: isTimeout ? "timeout" : "error", error: errMsg.slice(0, 200) },
      });

      // ── TENTATIVE 2 : Gemini 2.5 Pro via Lovable AI Gateway ──
      console.log("[Aski] Falling back to Gemini 2.5 Pro...");
      try {
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 30000); // 30s

        // Format OpenAI-compatible : system prompt dans le premier message
        const geminiMessages = [
          { role: "system", content: systemPrompt },
          ...anthropicMessages,
        ];

        const geminiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: geminiModel,
            max_tokens: 16000,
            messages: geminiMessages,
          }),
          signal: controller2.signal,
        });
        clearTimeout(timeoutId2);

        if (!geminiResponse.ok) {
          const errText = await geminiResponse.text();
          console.error(`[Aski] Gemini error ${geminiResponse.status}:`, errText);
          throw new Error(`Gemini API error ${geminiResponse.status}`);
        }

        const geminiData = await geminiResponse.json();
        responseText = geminiData.choices?.[0]?.message?.content ?? "";
        inputTokens = geminiData.usage?.prompt_tokens ?? 0;
        outputTokens = geminiData.usage?.completion_tokens ?? 0;
        const totalTokens = inputTokens + outputTokens;
        modelUsed = "gemini-2.5-pro-fallback";

        await logApiUsage({
          edge_function: "aski-chat",
          api_provider: "google",
          model: geminiModel,
          tokens_used: totalTokens,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          api_calls: 1,
          metadata: { type: "main_response", status: "success", fallback: true, sonnet_failure: isTimeout ? "timeout" : "error" },
        });

      } catch (geminiError: unknown) {
        const geminiErrMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
        console.error(`[Aski] Gemini fallback also failed: ${geminiErrMsg}`);

        await logApiUsage({
          edge_function: "aski-chat",
          api_provider: "google",
          model: geminiModel,
          tokens_used: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          api_calls: 1,
          metadata: { type: "main_response", status: "error", fallback: true, error: geminiErrMsg.slice(0, 200) },
        });

        return new Response(JSON.stringify({ error: "Une erreur est survenue. Veuillez réessayer." }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    

    // === TITRE AUTOMATIQUE — Claude Sonnet 4.6 (appel court) ===
    let chatTitle = "Nouvelle conversation";
    if ((chatHistory ?? []).length <= 1) {
      try {
        const titleController = new AbortController();
        const titleTimeout = setTimeout(() => titleController.abort(), 10000);
        const titleResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: sonnetModel,
            max_tokens: 12,
            system: `Génère un titre court (2-4 mots) résumant le SUJET de la demande utilisateur. Règles :
- 2 à 4 mots maximum, jamais plus
- En français, sans majuscule sauf noms propres
- Pas de guillemets, pas de ponctuation
- NE RÉPONDS PAS à la question — donne uniquement un label de sujet
- Exemples : "newsletter mars", "stratégie Pâques", "ads Instagram Clara", "routine peau sèche"`,
            messages: [{ role: "user", content: `Quel est le sujet de cette demande en 2-4 mots ?\n\n${userMessage}` }],
          }),
          signal: titleController.signal,
        });
        clearTimeout(titleTimeout);
        const titleData = await titleResponse.json();
        chatTitle = titleData.content?.[0]?.text?.trim() ?? "Nouvelle conversation";

        // Fire-and-forget: log title generation with cache tokens
        const titleInput = titleData.usage?.input_tokens ?? 0;
        const titleOutput = titleData.usage?.output_tokens ?? 0;
        const titleCacheCreation = titleData.usage?.cache_creation_input_tokens ?? 0;
        const titleCacheRead = titleData.usage?.cache_read_input_tokens ?? 0;
        const titleTokens = titleInput + titleOutput + titleCacheCreation + titleCacheRead;
        if (titleTokens > 0) {
          await logApiUsage({
            edge_function: "aski-chat",
            api_provider: "anthropic",
            model: sonnetModel,
            tokens_used: titleTokens,
            input_tokens: titleInput + titleCacheCreation + titleCacheRead,
            output_tokens: titleOutput,
            total_tokens: titleTokens,
            api_calls: 1,
            metadata: { type: "title_generation", cache_creation_tokens: titleCacheCreation, cache_read_tokens: titleCacheRead },
          });
        }
      } catch {
        chatTitle = userMessage.slice(0, 40);
      }
      await supabase.from("aski_chats").update({ title: chatTitle }).eq("id", currentChatId);
    } else {
      const { data: chatData } = await supabase.from("aski_chats").select("title").eq("id", currentChatId).single();
      chatTitle = chatData?.title ?? "Nouvelle conversation";
    }

    // === STOCKER ET RETOURNER ===
    await supabase.from("aski_messages").insert({
      chat_id: currentChatId,
      role: "assistant",
      content: responseText,
      tokens_used: inputTokens + outputTokens,
      response_time_ms: Date.now() - startTime,
    });

    await supabase.from("aski_chats").update({ updated_at: new Date().toISOString() }).eq("id", currentChatId);

    const newCount = (count ?? 0) + 1;

    if (perplexityContext) {
      console.log(`[Aski] Perplexity called for: "${userMessage.substring(0, 80)}"`);
    }
    console.log(`[Aski] Response time: ${Date.now() - startTime}ms | Tokens in:${inputTokens} out:${outputTokens} | Products: ${products.length} | Model: ${modelUsed} | Limit: ${newCount}/${askiLimit}`);

    return new Response(JSON.stringify({
      response: responseText,
      chat_id: currentChatId,
      chat_title: chatTitle,
      questions_used: newCount,
      questions_limit: askiLimit,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("aski-chat error:", e);
    reportEdgeFunctionError("aski-chat", e, { type: "internal_error" });
    return new Response(JSON.stringify({
      error: "Aski est temporairement indisponible.",
      details: e instanceof Error ? e.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
