// Cf. backlog #2.7 — Scraper hebdomadaire des conditions commerciales du site
// marchand. Lit tenant_config.website_url, fetch la home page, repère les
// liens pertinents dans le footer/nav (mots-clés livraison/retour/cgv/faq/...),
// fetch chaque page, fait extraire les faits structurés par Gemini Flash,
// upsert dans tenant_commercial_facts (clé composite tenant_id+category+
// fact_key).
//
// Limitation connue : l'extraction est basée sur le HTML statique. Les valeurs
// affichées en JS (bandeaux dynamiques, widgets panier) ne sont pas captées.
// Pour les valeurs critiques absentes, l'injecteur en aval (cf.
// formatCommercialFactsForPrompt dans _shared/getCommercialFacts.ts) impose au
// LLM de rester silencieux plutôt que d'inventer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";
import { logApiUsage } from "../_shared/logApiUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Category = "shipping" | "returns" | "payment" | "promo" | "loyalty" | "guarantee" | "terms" | "faq";

const PAGE_KEYWORDS: Record<Category, string[]> = {
  shipping: ["livraison", "shipping", "delivery", "expedition", "expédition", "transport"],
  returns: ["retour", "return", "refund", "remboursement"],
  payment: ["paiement", "payment", "moyen-paiement", "carte"],
  promo: ["promo", "soldes", "code-promo", "discount"],
  loyalty: ["fidelite", "fidélité", "loyalty", "club", "rewards"],
  guarantee: ["garantie", "guarantee", "warranty"],
  terms: ["cgv", "conditions", "terms", "mentions-legales", "mentions"],
  faq: ["faq", "questions", "aide", "help"],
};

// Lovable AI Gateway model name. Same naming convention as the Pro variant
// used by monthly-market-intelligence (google/gemini-3.1-pro-preview).
const GEMINI_FLASH_MODEL = "google/gemini-3.1-flash-preview";

function extractFooterLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const absolute = new URL(href, baseUrl).toString();
      if (absolute.startsWith(baseUrl)) {
        links.add(absolute);
      }
    } catch {
      // Skip invalid URLs
    }
  }
  return Array.from(links);
}

function categorizeLink(url: string): Category | null {
  const lower = url.toLowerCase();
  for (const [category, keywords] of Object.entries(PAGE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category as Category;
    }
  }
  return null;
}

async function fetchHtml(url: string, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AskItScraper/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[scrape-commercial-facts] ${url} returned ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    clearTimeout(timeout);
    console.error(`[scrape-commercial-facts] fetch ${url} failed:`, (e as Error).message);
    return null;
  }
}

// Strip <script> / <style> / tags and collapse whitespace. Caps at maxChars
// to keep the LLM input bounded.
function htmlToText(html: string, maxChars = 8000): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > maxChars) text = text.slice(0, maxChars);
  return text;
}

type Fact = { fact_key: string; fact_value: string; confidence?: "high" | "medium" | "low" };

async function extractFactsWithGemini(
  category: Category,
  pageText: string,
  pageUrl: string
): Promise<{ facts: Fact[]; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  const systemPrompt = `Tu extrais des faits commerciaux structurés depuis le texte d'une page web e-commerce.
La catégorie de la page est : ${category}.
Retourne un JSON strict :
{
  "facts": [
    { "fact_key": "string (snake_case, identifiant court)", "fact_value": "string (valeur exacte du site, sans interprétation)", "confidence": "high|medium|low" }
  ]
}
Règles strictes :
- N'invente RIEN. Si l'info n'est pas explicite dans le texte, ne la liste pas.
- "fact_key" doit être en snake_case court (ex: "free_shipping_threshold", "return_window_days", "accepted_payment_methods").
- "fact_value" doit reproduire la valeur exacte mentionnée (ex: "30€", "14 jours", "carte bancaire, PayPal, Apple Pay").
- "confidence" : "high" si la phrase est explicite, "medium" si ambigu, "low" si incertain.
- Maximum 10 facts par page.
Réponds UNIQUEMENT avec le JSON, sans markdown ni commentaire.`;

  const userPrompt = `Page URL : ${pageUrl}\n\nTexte de la page :\n\n${pageText}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_FLASH_MODEL,
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
      throw new Error(`Gemini Flash ${response.status}: ${err}`);
    }

    const data = await response.json();
    const usage = data.usage ?? {};
    const inputTokens = Number(usage.prompt_tokens) || 0;
    const outputTokens = Number(usage.completion_tokens) || 0;
    const totalTokens = Number(usage.total_tokens) || (inputTokens + outputTokens);

    let raw = data.choices?.[0]?.message?.content || "{}";
    raw = raw.trim();
    if (raw.startsWith("```json")) raw = raw.slice(7);
    else if (raw.startsWith("```")) raw = raw.slice(3);
    if (raw.endsWith("```")) raw = raw.slice(0, -3);
    raw = raw.trim();

    const parsed = JSON.parse(raw);
    const facts: Fact[] = Array.isArray(parsed.facts) ? parsed.facts : [];

    return {
      facts,
      usage: { inputTokens, outputTokens, totalTokens },
    };
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tenantConfig = await loadTenantConfig();
    const tenantId = tenantConfig.project_id;
    const websiteUrl = tenantConfig.website_url;

    if (!websiteUrl) {
      console.warn("[scrape-commercial-facts] tenant_config.website_url is empty — nothing to scrape.");
      return new Response(
        JSON.stringify({ success: true, scraped: 0, reason: "no_website_url" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let baseUrl: string;
    try {
      const u = new URL(websiteUrl);
      baseUrl = `${u.protocol}//${u.host}`;
    } catch {
      console.error("[scrape-commercial-facts] Invalid website_url:", websiteUrl);
      return new Response(
        JSON.stringify({ error: "invalid_website_url", url: websiteUrl }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Fetch home page and extract footer/nav links
    const homeHtml = await fetchHtml(baseUrl);
    if (!homeHtml) {
      return new Response(
        JSON.stringify({ error: "home_fetch_failed", url: baseUrl }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const links = extractFooterLinks(homeHtml, baseUrl);

    // Step 2: Categorize links and pick at most 1 per category (the first
    // matching link wins — typically the most prominent footer link).
    const linksByCategory: Partial<Record<Category, string>> = {};
    for (const link of links) {
      const cat = categorizeLink(link);
      if (cat && !linksByCategory[cat]) {
        linksByCategory[cat] = link;
      }
    }

    console.log(
      `[scrape-commercial-facts] tenant=${tenantId}, base=${baseUrl}, categories detected:`,
      Object.keys(linksByCategory)
    );

    // Step 3: For each category, fetch the page, extract facts via Gemini
    // Flash, upsert into tenant_commercial_facts.
    let totalFacts = 0;
    const aggregatedUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const results: Record<string, { url: string; facts_count: number; status: string }> = {};

    for (const [category, url] of Object.entries(linksByCategory)) {
      try {
        const html = await fetchHtml(url);
        if (!html) {
          results[category] = { url, facts_count: 0, status: "fetch_failed" };
          continue;
        }
        const text = htmlToText(html);
        const { facts, usage } = await extractFactsWithGemini(category as Category, text, url);
        aggregatedUsage.inputTokens += usage.inputTokens;
        aggregatedUsage.outputTokens += usage.outputTokens;
        aggregatedUsage.totalTokens += usage.totalTokens;

        if (facts.length === 0) {
          results[category] = { url, facts_count: 0, status: "no_facts" };
          continue;
        }

        const rows = facts
          .filter((f) => f.fact_key && f.fact_value)
          .map((f) => ({
            tenant_id: tenantId,
            category,
            fact_key: f.fact_key,
            fact_value: String(f.fact_value),
            source_url: url,
            confidence: f.confidence ?? "high",
            scraped_at: new Date().toISOString(),
            is_active: true,
          }));

        if (rows.length === 0) {
          results[category] = { url, facts_count: 0, status: "empty_after_filter" };
          continue;
        }

        const { error: upsertError } = await supabase
          .from("tenant_commercial_facts")
          .upsert(rows, {
            onConflict: "tenant_id,category,fact_key",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error(`[scrape-commercial-facts] upsert ${category} failed:`, upsertError);
          results[category] = { url, facts_count: 0, status: "upsert_error" };
        } else {
          totalFacts += rows.length;
          results[category] = { url, facts_count: rows.length, status: "ok" };
        }
      } catch (catErr) {
        console.error(`[scrape-commercial-facts] ${category} error:`, catErr);
        results[category] = { url, facts_count: 0, status: "error" };
      }
    }

    if (aggregatedUsage.totalTokens > 0) {
      await logApiUsage(supabase, {
        edgeFunction: "scrape-commercial-facts",
        apiProvider: "gemini",
        model: GEMINI_FLASH_MODEL,
        inputTokens: aggregatedUsage.inputTokens,
        outputTokens: aggregatedUsage.outputTokens,
        totalTokens: aggregatedUsage.totalTokens,
        metadata: {
          tenant_id: tenantId,
          website_url: baseUrl,
          categories_scraped: Object.keys(linksByCategory).length,
          total_facts: totalFacts,
        },
      });
    }

    console.log(
      `[scrape-commercial-facts] ✓ tenant=${tenantId}, ${totalFacts} facts upserted across ${Object.keys(linksByCategory).length} categories`
    );

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        website_url: baseUrl,
        total_facts: totalFacts,
        categories: results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[scrape-commercial-facts] Unhandled error:", error);
    reportEdgeFunctionError("scrape-commercial-facts", error, { type: "scrape_failure", severity: "error" });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
