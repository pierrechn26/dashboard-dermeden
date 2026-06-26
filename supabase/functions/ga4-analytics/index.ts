import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ------------------------------------------------------------------ */
/*  Shopify Analytics via ShopifyQL (preferred when available)         */
/* ------------------------------------------------------------------ */

async function fetchShopifyAnalytics(
  shopifyStore: string,
  shopifyToken: string,
  startDate: string,
  endDate: string,
): Promise<{ site_sessions: number; diagnostic_page_sessions: number; conversion_rate: number; bounce_rate: number; site_aov: number; site_orders: number; site_net_sales: number }> {
  const query = `FROM sessions SHOW sessions, conversion_rate, bounce_rate SINCE ${startDate} UNTIL ${endDate}`;
  const salesQuery = `FROM sales SHOW average_order_value, orders, net_sales SINCE ${startDate} UNTIL ${endDate}`;

  const res = await fetch(
    `https://${shopifyStore}/admin/api/unstable/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": shopifyToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `{ shopifyqlQuery(query: "${query}") { parseErrors tableData { columns { name dataType } rows } } }`,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL error: ${res.status} – ${text}`);
  }

  const data = await res.json();
  const shopifyql = data?.data?.shopifyqlQuery;

  if (shopifyql?.parseErrors?.length && shopifyql.parseErrors[0]) {
    throw new Error(`ShopifyQL parse error: ${shopifyql.parseErrors.join(", ")}`);
  }

  const rows = shopifyql?.tableData?.rows;
  if (!rows || rows.length === 0) {
    return { site_sessions: 0, diagnostic_page_sessions: 0, conversion_rate: 0, bounce_rate: 0, site_aov: 0, site_orders: 0, site_net_sales: 0 };
  }

  const row = rows[0];
  const sessions = parseInt(row.sessions || "0", 10);
  const conversionRate = parseFloat(row.conversion_rate || "0") * 100;
  const bounceRate = parseFloat(row.bounce_rate || "0") * 100;

  // Fetch sales metrics (AOV, orders, net_sales) from ShopifyQL sales dataset
  let siteAov = 0;
  let siteOrders = 0;
  let siteNetSales = 0;

  try {
    const salesRes = await fetch(
      `https://${shopifyStore}/admin/api/unstable/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": shopifyToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `{ shopifyqlQuery(query: "${salesQuery}") { parseErrors tableData { columns { name dataType } rows } } }`,
        }),
      },
    );

    if (salesRes.ok) {
      const salesData = await salesRes.json();
      const salesRows = salesData?.data?.shopifyqlQuery?.tableData?.rows;
      if (salesRows && salesRows.length > 0) {
        siteAov = parseFloat(salesRows[0].average_order_value || "0");
        siteOrders = parseInt(salesRows[0].orders || "0", 10);
        siteNetSales = parseFloat(salesRows[0].net_sales || "0");
      }
    }
  } catch (err) {
    console.error("[ga4-analytics] Sales query failed:", err);
  }

  return {
    site_sessions: sessions,
    diagnostic_page_sessions: 0, // Will be filled from Supabase below
    conversion_rate: conversionRate,
    bounce_rate: bounceRate,
    site_aov: siteAov,
    site_orders: siteOrders,
    site_net_sales: siteNetSales,
  };
}

/* ------------------------------------------------------------------ */
/*  GA4 helpers (kept for backward compat when GA4 is configured)     */
/* ------------------------------------------------------------------ */

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

async function createSignedJwt(
  email: string,
  privateKeyPem: string,
  scope: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, enc.encode(unsignedToken));
  return `${unsignedToken}.${base64url(signature)}`;
}

async function getAccessToken(email: string, privateKey: string): Promise<string> {
  const jwt = await createSignedJwt(email, privateKey, "https://www.googleapis.com/auth/analytics.readonly");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth error: ${res.status} – ${text}`);
  }
  return (await res.json()).access_token;
}

async function runReport(
  accessToken: string, propertyId: string,
  startDate: string, endDate: string,
  pageFilter?: string, metric = "sessions",
): Promise<number> {
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: metric }],
  };
  if (pageFilter) {
    body.dimensionFilter = {
      filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: pageFilter, caseSensitive: false } },
    };
  }
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 API error: ${res.status} – ${text}`);
  }
  const data = await res.json();
  const value = data?.rows?.[0]?.metricValues?.[0]?.value;
  return value ? parseInt(value, 10) : 0;
}

async function runReportLandingPage(
  accessToken: string, propertyId: string,
  startDate: string, endDate: string,
  landingPagePath: string,
): Promise<number> {
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "sessions" }],
    dimensions: [{ name: "landingPage" }],
    dimensionFilter: {
      filter: { fieldName: "landingPage", stringFilter: { matchType: "EXACT", value: landingPagePath, caseSensitive: false } },
    },
  };
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 landingPage API error: ${res.status} – ${text}`);
  }
  const data = await res.json();
  const value = data?.rows?.[0]?.metricValues?.[0]?.value;
  return value ? parseInt(value, 10) : 0;
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                      */
/* ------------------------------------------------------------------ */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { start_date, end_date } = await req.json();
    if (!start_date || !end_date) {
      throw new Error("start_date and end_date are required");
    }

    // Check which analytics source is available
    const ga4PropertyId = Deno.env.get("GA4_PROPERTY_ID");
    const ga4Email = Deno.env.get("GA4_SERVICE_ACCOUNT_EMAIL");
    const ga4PrivateKey = Deno.env.get("GA4_SERVICE_ACCOUNT_PRIVATE_KEY");
    const hasGA4 = !!(ga4PropertyId && ga4Email && ga4PrivateKey);

    const shopifyToken = Deno.env.get("SHOPIFY_ACCESS_TOKEN") || Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN");

    // Load tenant config for Shopify store domain + diagnostic sessions count
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let tenantConfig: Record<string, unknown> | null = null;
    try {
      tenantConfig = await loadTenantConfig(supabase);
    } catch { /* ignore */ }

    const shopifyStore = tenantConfig?.shopify_store_domain as string | undefined;
    const hasShopify = !!(shopifyToken && shopifyStore);

    console.log(`[ga4-analytics] Sources: GA4=${hasGA4}, Shopify=${hasShopify}`);

    // Count diagnostic sessions in the date range (used as diagnostic_page_sessions
    // denominator when GA4 is not available)
    const { count: diagSessionsCount } = await supabase
      .from("diagnostic_sessions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${start_date}T00:00:00Z`)
      .lte("created_at", `${end_date}T23:59:59Z`);

    const diagnosticSessions = diagSessionsCount ?? 0;

    // ── Strategy 1: Shopify (preferred — no external service account needed) ──
    if (hasShopify) {
      console.log(`[ga4-analytics] Using Shopify ShopifyQL for ${shopifyStore}`);
      try {
        const shopifyData = await fetchShopifyAnalytics(shopifyStore!, shopifyToken!, start_date, end_date);

        const result = {
          site_sessions: shopifyData.site_sessions,
          diagnostic_page_sessions: diagnosticSessions,
          conversion_rate: shopifyData.conversion_rate,
          bounce_rate: shopifyData.bounce_rate,
          site_aov: shopifyData.site_aov,
          site_orders: shopifyData.site_orders,
          site_net_sales: shopifyData.site_net_sales,
          source: "shopify",
        };
        console.log("[ga4-analytics] Shopify result:", JSON.stringify(result));
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        });
      } catch (err) {
        console.error("[ga4-analytics] Shopify failed, falling through:", err);
        // Fall through to GA4 if available
      }
    }

    // ── Strategy 2: GA4 (fallback) ──
    if (hasGA4) {
      console.log("[ga4-analytics] Using GA4");
      const accessToken = await getAccessToken(ga4Email!, ga4PrivateKey!);
      const [siteSessions, diagnosticLandingSessions] = await Promise.all([
        runReport(accessToken, ga4PropertyId!, start_date, end_date),
        runReportLandingPage(accessToken, ga4PropertyId!, start_date, end_date, "/pages/diagnostic-de-peau"),
      ]);

      const result = {
        site_sessions: siteSessions,
        diagnostic_page_sessions: diagnosticLandingSessions,
        source: "ga4",
      };
      console.log("[ga4-analytics] GA4 result:", JSON.stringify(result));
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    // ── Strategy 3: Supabase only (no external analytics) ──
    console.log("[ga4-analytics] No external analytics, returning Supabase-only data");
    return new Response(
      JSON.stringify({
        site_sessions: 0,
        diagnostic_page_sessions: diagnosticSessions,
        source: "supabase_only",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("ga4-analytics error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
