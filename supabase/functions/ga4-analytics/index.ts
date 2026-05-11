import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ------------------------------------------------------------------ */
/*  JWT helpers – sign a Google service-account JWT with Web Crypto   */
/* ------------------------------------------------------------------ */

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Normalize literal \n characters (common when secrets are pasted with escaped newlines)
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s/g, "");
  console.log("🔐 PEM base64 length after cleanup:", b64.length);
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
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    enc.encode(unsignedToken),
  );

  return `${unsignedToken}.${base64url(signature)}`;
}

async function getAccessToken(email: string, privateKey: string): Promise<string> {
  const jwt = await createSignedJwt(
    email,
    privateKey,
    "https://www.googleapis.com/auth/analytics.readonly",
  );
  console.log("✅ JWT generated successfully, length:", jwt.length);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ Google OAuth error:", res.status, text);
    throw new Error(`Google OAuth error: ${res.status} – ${text}`);
  }
  const data = await res.json();
  console.log("✅ OAuth token retrieved, token starts with:", data.access_token?.substring(0, 20));
  return data.access_token;
}

/* ------------------------------------------------------------------ */
/*  GA4 Data API helpers                                              */
/* ------------------------------------------------------------------ */

async function runReport(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  pageFilter?: string,
  metric: string = "sessions",
): Promise<number> {
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: metric }],
  };

  if (pageFilter) {
    body.dimensionFilter = {
      filter: {
        fieldName: "pagePath",
        stringFilter: {
          matchType: "BEGINS_WITH",
          value: pageFilter,
          caseSensitive: false,
        },
      },
    };
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  console.log("📊 GA4 runReport request:", JSON.stringify({ url, body, pageFilter: pageFilter || "none" }));
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ GA4 API error:", res.status, text);
    throw new Error(`GA4 API error: ${res.status} – ${text}`);
  }

  const data = await res.json();
  console.log("📊 GA4 API response (filter:", pageFilter || "none", "):", JSON.stringify(data));
  const value = data?.rows?.[0]?.metricValues?.[0]?.value;
  console.log("📊 Extracted value:", value);
  return value ? parseInt(value, 10) : 0;
}

/* ------------------------------------------------------------------ */
/*  Landing page report helper                                        */
/* ------------------------------------------------------------------ */

async function runReportLandingPage(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  landingPagePath: string,
): Promise<number> {
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "sessions" }],
    dimensions: [{ name: "landingPage" }],
    dimensionFilter: {
      filter: {
        fieldName: "landingPage",
        stringFilter: {
          matchType: "EXACT",
          value: landingPagePath,
          caseSensitive: false,
        },
      },
    },
  };

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  console.log("📊 GA4 landingPage report request:", JSON.stringify({ url, body }));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ GA4 landingPage API error:", res.status, text);
    throw new Error(`GA4 landingPage API error: ${res.status} – ${text}`);
  }

  const data = await res.json();
  console.log("📊 GA4 landingPage response:", JSON.stringify(data));
  const value = data?.rows?.[0]?.metricValues?.[0]?.value;
  console.log("📊 Landing page sessions extracted:", value);
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
    const propertyId = Deno.env.get("GA4_PROPERTY_ID");
    const email = Deno.env.get("GA4_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GA4_SERVICE_ACCOUNT_PRIVATE_KEY");

    if (!propertyId || !email || !privateKey) {
      throw new Error("Missing GA4 secrets");
    }

    const { start_date, end_date } = await req.json();
    console.log("📅 Request params:", { start_date, end_date });
    if (!start_date || !end_date) {
      throw new Error("start_date and end_date are required");
    }

    console.log("🔑 Secrets loaded: propertyId=", propertyId, "email=", email, "privateKey length=", privateKey?.length);
    const accessToken = await getAccessToken(email, privateKey);

    const [siteSessions, diagnosticLandingSessions] = await Promise.all([
      runReport(accessToken, propertyId, start_date, end_date),
      runReportLandingPage(accessToken, propertyId, start_date, end_date, "/pages/diagnostic-de-peau"),
    ]);

    const result = { site_sessions: siteSessions, diagnostic_page_sessions: diagnosticLandingSessions };
    console.log("✅ Final response:", JSON.stringify(result));
    return new Response(
      JSON.stringify(result),
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
