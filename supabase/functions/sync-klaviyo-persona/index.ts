import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ============================================================
   Properties from previous (non-flattened) item_N_* layout that
   we explicitly UNSET on every sync so migrated profiles stay
   clean. Covers up to 4 items (multi-item diagnostics like Ouate).
   Generic — no tenant-specific values.
   ============================================================ */
const OLD_PROPERTIES_TO_UNSET = [
  "item_1__raw", "item_2__raw", "item_3__raw", "item_4__raw",
  "item_1__recommendations", "item_2__recommendations", "item_3__recommendations", "item_4__recommendations",
  "item_1_age", "item_2_age", "item_3_age", "item_4_age",
  "item_1_birthdate", "item_2_birthdate", "item_3_birthdate", "item_4_birthdate",
  "item_1_email", "item_2_email", "item_3_email", "item_4_email",
  "item_1_phone", "item_2_phone", "item_3_phone", "item_4_phone",
  "item_1_prenom", "item_2_prenom", "item_3_prenom", "item_4_prenom",
  "item_1_genre", "item_2_genre", "item_3_genre", "item_4_genre",
  "item_1_segment", "item_2_segment", "item_3_segment", "item_4_segment",
  "item_1_usage", "item_2_usage", "item_3_usage", "item_4_usage",
];

function translateExitType(exitType: string | null): string {
  const map: Record<string, string> = {
    cta_principal: "CTA Principal",
    cta_secondaire: "CTA Secondaire",
    abandon: "Abandon",
    skip: "Passé",
    completed: "Complété",
    converted: "Converti",
    checkout: "Checkout",
  };
  return (exitType && map[exitType]) || exitType || "";
}

function translateUpsell(level: string | null): string {
  const map: Record<string, string> = {
    faible: "Faible",
    moyen: "Moyen",
    eleve: "Élevé",
  };
  return (level && map[level]) || level || "";
}

/**
 * Normalize a phone number to E.164. FR-specific mapping for the
 * leading-zero national format (0X… → +33X…) is kept here because FR
 * is the initial market; for international tenants this can later be
 * driven by tenant_config.
 */
function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = raw.replace(/[\s.\-()]/g, "");
  if (/^\+\d{8,15}$/.test(p)) return p;
  if (/^0\d{9}$/.test(p)) return "+33" + p.slice(1);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let session_id: string | undefined;
    try {
      const body = await req.json();
      session_id = body?.session_id;
    } catch {
      console.error("[sync-klaviyo-persona] Invalid or empty JSON body");
      return new Response(JSON.stringify({ error: "Invalid or empty JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const klaviyoApiKey = Deno.env.get("KLAVIYO_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Load session
    const { data: session, error: sessionError } = await supabase
      .from("diagnostic_sessions")
      .select("*")
      .eq("id", session_id)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("[sync-klaviyo-persona] Session not found:", sessionError);
      return new Response(
        JSON.stringify({ success: false, error: "Session not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. No email → skip
    if (!session.email) {
      console.log("[sync-klaviyo-persona] No email, skipping:", session_id);
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = session.email.toLowerCase().trim();
    const phoneE164 = normalizePhoneE164(session.phone);
    console.log("[sync-klaviyo-persona] phone normalize:", {
      raw: session.phone,
      e164: phoneE164,
      optin_sms: session.optin_sms,
    });

    // 3. Persona full_label from `personas` table
    const { data: personaData } = await supabase
      .from("personas")
      .select("full_label")
      .eq("code", session.persona_code ?? "P0")
      .maybeSingle();
    const personaFullLabel = personaData?.full_label || session.persona_code || "Non attribué";

    // 4. Load items
    const { data: items } = await supabase
      .from("diagnostic_items")
      .select("*")
      .eq("session_id", session_id)
      .order("item_index", { ascending: true });

    // 5. Flatten item_metadata
    // Generic agnostic spread: tenant-specific keys flow through to Klaviyo
    // automatically. We prefer `meta.answers` (canonical answers shape) when
    // it's an object; otherwise we spread `meta` directly.
    const itemsDynamicProps: Record<string, unknown> = {};
    const itemsEnrichmentProps: Record<string, unknown> = {};
    const usePrefix = (items?.length ?? 0) > 1;

    (items || []).forEach((item, index) => {
      const prefix = usePrefix ? `item_${index + 1}_` : "";
      const meta = (item.item_metadata || {}) as Record<string, unknown>;

      // Dynamic questions/answers (top-level on the item row)
      if (item.dynamic_question_1) itemsDynamicProps[`${prefix}dynamic_q1`] = item.dynamic_question_1;
      if (item.dynamic_answer_1) itemsDynamicProps[`${prefix}dynamic_a1`] = item.dynamic_answer_1;
      if (item.dynamic_question_2) itemsDynamicProps[`${prefix}dynamic_q2`] = item.dynamic_question_2;
      if (item.dynamic_answer_2) itemsDynamicProps[`${prefix}dynamic_a2`] = item.dynamic_answer_2;
      if (item.dynamic_question_3) itemsDynamicProps[`${prefix}dynamic_q3`] = item.dynamic_question_3;
      if (item.dynamic_answer_3) itemsDynamicProps[`${prefix}dynamic_a3`] = item.dynamic_answer_3;
      if (item.dynamic_insight_targets) itemsDynamicProps[`${prefix}insight_targets`] = item.dynamic_insight_targets;

      // Choose source: meta.answers if object, else meta
      const answersBlock = (meta as Record<string, unknown>).answers;
      const source: Record<string, unknown> =
        answersBlock && typeof answersBlock === "object" && !Array.isArray(answersBlock)
          ? (answersBlock as Record<string, unknown>)
          : meta;

      for (const [key, value] of Object.entries(source)) {
        if (value === null || value === undefined) continue;
        if (key.startsWith("_")) continue; // skip _raw, _recommendations, etc.

        if (Array.isArray(value)) {
          // Arrays of objects → skip; arrays of primitives → CSV join
          const hasObject = value.some(
            (v) => v !== null && typeof v === "object"
          );
          if (hasObject) continue;
          itemsEnrichmentProps[`${prefix}${key}`] = value.join(",");
          continue;
        }

        if (typeof value === "object") continue; // skip nested blobs

        itemsEnrichmentProps[`${prefix}${key}`] =
          typeof value === "boolean" ? (value ? "Oui" : "Non") : value;
      }
    });

    // 6. Build properties
    const properties: Record<string, unknown> = {
      // Source tag — Klaviyo rejects $source as an attribute, OK as a property
      $source: "Diagnostic Ask-it",

      // Identification & Tracking
      session_code: session.session_code,
      status: session.status,
      locale: session.locale,
      source: session.source,
      device: session.device,
      last_diagnostic_date: session.created_at,
      utm_source: session.utm_source ?? null,
      utm_medium: session.utm_medium ?? null,
      utm_campaign: session.utm_campaign ?? null,
      utm_content: session.utm_content ?? null,
      utm_term: session.utm_term ?? null,
      gclid: session.gclid ?? null,
      fbclid: session.fbclid ?? null,
      result_url: session.result_url ?? null,

      // Contact
      user_name: session.user_name ?? null,

      // Persona & IA
      persona: personaFullLabel,
      persona_code: session.persona_code,
      adapted_tone: session.adapted_tone || null,
      tone_label: session.tone_label ?? null,

      ...(session.matching_score !== null && session.matching_score !== undefined && { matching_score: session.matching_score }),
      ...(session.engagement_score !== null && session.engagement_score !== undefined && { engagement_score: session.engagement_score }),

      // Business & Conversion
      conversion_status: session.conversion ? "Oui" : "Non",
      is_existing_client: session.is_existing_client ? "Oui" : "Non",
      exit_type: translateExitType(session.exit_type),

      ...(session.recommended_products && { recommended_products: session.recommended_products }),
      ...(session.recommended_cart_amount !== null && session.recommended_cart_amount !== undefined && { recommended_cart_amount: session.recommended_cart_amount }),
      ...(session.upsell_potential && { upsell_potential: translateUpsell(session.upsell_potential) }),

      ...(session.validated_products && { validated_products: session.validated_products }),
      ...(session.validated_cart_amount && { validated_cart_amount: session.validated_cart_amount }),
      ...(session.selected_cart_amount && { selected_cart_amount: session.selected_cart_amount }),

      // Correct generic column name (NOT existing_client_products)
      ...(session.existing_brand_products && { existing_brand_products: session.existing_brand_products }),

      // Comportement
      ...(session.duration_seconds !== null && session.duration_seconds !== undefined && { diagnostic_duration_seconds: session.duration_seconds }),
      abandoned_at_step: session.abandoned_at_step ?? null,
      back_navigation_count: session.back_navigation_count ?? null,
      questions_path: session.question_path ?? null,

      // Opt-in (informational mirrors)
      optin_email: session.optin_email ? "Oui" : "Non",
      optin_sms: session.optin_sms ? "Oui" : "Non",

      // Items — dynamic IA + flattened metadata
      ...itemsDynamicProps,
      ...itemsEnrichmentProps,
    };

    const klaviyoPayload = {
      data: {
        type: "profile",
        attributes: {
          email: normalizedEmail,
          ...(phoneE164 && { phone_number: phoneE164 }),
          properties,
        },
        meta: {
          patch_properties: {
            append: {},
            unappend: {},
            unset: OLD_PROPERTIES_TO_UNSET,
          },
        },
      },
    };

    // 7. Call Klaviyo profile-import with timeout + retry
    async function callKlaviyoWithRetry(url: string, payload: unknown, maxAttempts = 3): Promise<{ response: Response; body: string }> {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Klaviyo-API-Key ${klaviyoApiKey}`,
              revision: "2024-02-15",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const body = await resp.text();
          if ((resp.status >= 500 || resp.status === 429) && attempt < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`[sync-klaviyo-persona] Attempt ${attempt} got ${resp.status}, retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          return { response: resp, body };
        } catch (err) {
          clearTimeout(timeoutId);
          if (attempt < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`[sync-klaviyo-persona] Attempt ${attempt} failed (${(err as Error).message}), retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
      throw new Error("Max retry attempts reached");
    }

    const { response: klaviyoResponse, body: responseText } = await callKlaviyoWithRetry(
      "https://a.klaviyo.com/api/profile-import/",
      klaviyoPayload
    );

    console.log("[sync-klaviyo-persona] Klaviyo profile-import response:", klaviyoResponse.status, responseText);

    if (klaviyoResponse.status === 409) {
      console.log("[sync-klaviyo-persona] Profile already exists (409), treating as success for:", normalizedEmail);
    } else if (!klaviyoResponse.ok) {
      console.error("[sync-klaviyo-persona] Klaviyo error:", klaviyoResponse.status, responseText);
      await reportEdgeFunctionError("sync-klaviyo-persona", new Error(`Klaviyo profile import failed: ${klaviyoResponse.status}`), { type: "sync_failure", severity: "error" });
      return new Response(
        JSON.stringify({ success: false, error: `Klaviyo ${klaviyoResponse.status}`, details: responseText, fallback: klaviyoResponse.status >= 500 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Subscriptions (best-effort, non-blocking). SMS only when we have a
    // properly normalized E.164 phone.
    if (session.optin_email || (session.optin_sms && phoneE164)) {
      // deno-lint-ignore no-explicit-any
      const subscriptions: any = {};
      if (session.optin_email) {
        subscriptions.email = { marketing: { consent: "SUBSCRIBED" } };
      }
      if (session.optin_sms && phoneE164) {
        subscriptions.sms = { marketing: { consent: "SUBSCRIBED" } };
      }

      const subscribePayload = {
        data: {
          type: "profile-subscription-bulk-create-job",
          attributes: {
            profiles: {
              data: [{
                type: "profile",
                attributes: {
                  email: normalizedEmail,
                  ...(phoneE164 && { phone_number: phoneE164 }),
                  subscriptions,
                },
              }],
            },
          },
          relationships: {
            list: {
              data: { type: "list", id: "TExMiq" },
            },
          },
        },
      };

      try {
        const subResponse = await fetch("https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Klaviyo-API-Key ${klaviyoApiKey}`,
            revision: "2024-02-15",
          },
          body: JSON.stringify(subscribePayload),
        });
        const subBody = await subResponse.text();
        console.log("[sync-klaviyo-persona] Klaviyo subscribe response:", subResponse.status, subBody);
      } catch (subErr) {
        console.error("[sync-klaviyo-persona] Klaviyo subscribe failed (non-blocking):", subErr);
      }
    }

    console.log("[sync-klaviyo-persona] Profile updated for session:", session_id, "persona:", session.persona_code, "email:", normalizedEmail);
    return new Response(
      JSON.stringify({ success: true, persona_code: session.persona_code, email: normalizedEmail }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync-klaviyo-persona] Unexpected error:", error);
    reportEdgeFunctionError("sync-klaviyo-persona", error, { type: "sync_failure", severity: "error" });
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
