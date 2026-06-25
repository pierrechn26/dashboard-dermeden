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

/* ============================================================
   SESSION-LEVEL LABEL MAP — maps raw session keys to "AskIt —" labels
   ============================================================ */
const SESSION_LABEL_MAP: Record<string, string> = {
  session_code: "Session",
  status: "Statut",
  locale: "Langue",
  source: "Source",
  device: "Appareil",
  last_diagnostic_date: "Date dernier diagnostic",
  persona: "Persona",
  persona_code: "Code persona",
  adapted_tone: "Ton adapté",
  tone_label: "Ton label",
  matching_score: "Matching (%)",
  engagement_score: "Score engagement (%)",
  conversion_status: "Conversion",
  is_existing_client: "Client existant",
  exit_type: "Type de sortie",
  recommended_products: "Produits recommandés",
  recommended_cart_amount: "Montant panier recommandé",
  upsell_potential: "Potentiel upsell",
  validated_products: "Produits validés",
  validated_cart_amount: "Montant validé",
  selected_cart_amount: "Montant sélectionné",
  existing_brand_products: "Produits existants",
  diagnostic_duration_seconds: "Durée diagnostic (sec)",
  abandoned_at_step: "Étape d'abandon",
  back_navigation_count: "Retours en arrière",
  questions_path: "Parcours questions",
  optin_email: "Opt-in email",
  optin_sms: "Opt-in SMS",
  result_url: "URL résultats",
  utm_source: "UTM source",
  utm_medium: "UTM medium",
  utm_campaign: "UTM campaign",
  utm_content: "UTM content",
  utm_term: "UTM term",
};

const STATUS_VALUE_MAP: Record<string, string> = {
  en_cours: "En cours",
  termine: "Terminé",
  abandonne: "Abandonné",
};

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

/**
 * Apply column_labels_mapping to translate a raw key + value into
 * "AskIt — {label}" format with translated values.
 */
function applyMapping(
  key: string,
  value: unknown,
  mapping: Record<string, { label: string; value_mapping?: Record<string, string> }>
): { label: string; translatedValue: unknown } {
  const entry = mapping[key];
  if (!entry) {
    return { label: `AskIt — ${key}`, translatedValue: value };
  }

  const label = `AskIt — ${entry.label}`;

  if (entry.value_mapping && value !== null && value !== undefined) {
    const strVal = String(value);
    // Handle comma-separated values (e.g. "stress,smoking")
    if (strVal.includes(",")) {
      const parts = strVal.split(",").map((p) => p.trim());
      const translated = parts.map((p) => entry.value_mapping![p] ?? p);
      return { label, translatedValue: translated.join(", ") };
    }
    if (entry.value_mapping[strVal] !== undefined) {
      return { label, translatedValue: entry.value_mapping[strVal] };
    }
  }

  return { label, translatedValue: value };
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

    // 0. Load tenant_config for klaviyo_list_id + column_labels_mapping
    const { data: tenantConfig } = await supabase
      .from("tenant_config")
      .select("klaviyo_list_id, column_labels_mapping")
      .limit(1)
      .maybeSingle();
    const klaviyoListId = tenantConfig?.klaviyo_list_id;
    const columnLabelsMapping = (tenantConfig?.column_labels_mapping ?? {}) as Record<
      string,
      { label: string; category?: string; value_mapping?: Record<string, string> }
    >;
    if (!klaviyoListId) {
      console.error("[sync-klaviyo-persona] No klaviyo_list_id in tenant_config");
    }

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

    // 5. Flatten item_metadata and apply column_labels_mapping
    const itemsMappedProps: Record<string, unknown> = {};
    const usePrefix = (items?.length ?? 0) > 1;

    (items || []).forEach((item, index) => {
      const prefix = usePrefix ? `item_${index + 1}_` : "";
      const meta = (item.item_metadata || {}) as Record<string, unknown>;

      // Dynamic questions/answers
      if (item.dynamic_question_1) itemsMappedProps[`${prefix}AskIt — Question IA 1`] = item.dynamic_question_1;
      if (item.dynamic_answer_1) itemsMappedProps[`${prefix}AskIt — Réponse IA 1`] = item.dynamic_answer_1;
      if (item.dynamic_question_2) itemsMappedProps[`${prefix}AskIt — Question IA 2`] = item.dynamic_question_2;
      if (item.dynamic_answer_2) itemsMappedProps[`${prefix}AskIt — Réponse IA 2`] = item.dynamic_answer_2;
      if (item.dynamic_question_3) itemsMappedProps[`${prefix}AskIt — Question IA 3`] = item.dynamic_question_3;
      if (item.dynamic_answer_3) itemsMappedProps[`${prefix}AskIt — Réponse IA 3`] = item.dynamic_answer_3;
      if (item.dynamic_insight_targets) itemsMappedProps[`${prefix}AskIt — Cibles IA`] = item.dynamic_insight_targets;

      // Choose source: meta.answers if object, else meta
      const answersBlock = (meta as Record<string, unknown>).answers;
      const source: Record<string, unknown> =
        answersBlock && typeof answersBlock === "object" && !Array.isArray(answersBlock)
          ? (answersBlock as Record<string, unknown>)
          : meta;

      // Keys already handled at profile level or not relevant as properties
      const SKIP_KEYS = new Set([
        "email", "phone", "optin", "user_name", "first_name",
        "answers", "raw", "recommendations",
      ]);

      for (const [key, value] of Object.entries(source)) {
        if (value === null || value === undefined) continue;
        if (key.startsWith("_")) continue; // skip _raw, _recommendations, etc.
        if (SKIP_KEYS.has(key)) continue;

        let finalValue: unknown = value;

        if (Array.isArray(value)) {
          const hasObject = value.some(
            (v) => v !== null && typeof v === "object"
          );
          if (hasObject) continue;
          finalValue = value.join(",");
        } else if (typeof value === "object") {
          continue; // skip nested blobs
        } else if (typeof value === "boolean") {
          finalValue = value ? "Oui" : "Non";
        }

        // Apply column_labels_mapping
        const { label, translatedValue } = applyMapping(key, finalValue, columnLabelsMapping);
        itemsMappedProps[`${prefix}${label}`] = translatedValue;
      }
    });

    // 6. Build properties with "AskIt —" prefix
    const rawProps: Record<string, unknown> = {
      session_code: session.session_code,
      status: STATUS_VALUE_MAP[session.status] ?? session.status,
      locale: session.locale,
      source: session.source,
      device: session.device,
      last_diagnostic_date: session.created_at,
      utm_source: session.utm_source ?? null,
      utm_medium: session.utm_medium ?? null,
      utm_campaign: session.utm_campaign ?? null,
      utm_content: session.utm_content ?? null,
      utm_term: session.utm_term ?? null,
      result_url: session.result_url ?? null,
      persona: personaFullLabel,
      persona_code: session.persona_code,
      adapted_tone: session.adapted_tone || null,
      tone_label: session.tone_label ?? null,
      matching_score: session.matching_score ?? null,
      engagement_score: session.engagement_score ?? null,
      conversion_status: session.conversion ? "Oui" : "Non",
      is_existing_client: session.is_existing_client ? "Oui" : "Non",
      exit_type: translateExitType(session.exit_type),
      recommended_products: session.recommended_products ?? null,
      recommended_cart_amount: session.recommended_cart_amount ?? null,
      upsell_potential: session.upsell_potential ? translateUpsell(session.upsell_potential) : null,
      validated_products: session.validated_products ?? null,
      validated_cart_amount: session.validated_cart_amount ?? null,
      selected_cart_amount: session.selected_cart_amount ?? null,
      existing_brand_products: session.existing_brand_products ?? null,
      diagnostic_duration_seconds: session.duration_seconds ?? null,
      abandoned_at_step: session.abandoned_at_step ?? null,
      back_navigation_count: session.back_navigation_count ?? null,
      questions_path: session.question_path ?? null,
      optin_email: session.optin_email ? "Oui" : "Non",
      optin_sms: session.optin_sms ? "Oui" : "Non",
    };

    // Transform raw session props to "AskIt — {label}" format
    const properties: Record<string, unknown> = {
      $source: "Diagnostic Ask-it",
    };

    for (const [key, value] of Object.entries(rawProps)) {
      if (value === null || value === undefined) continue;
      const labelName = SESSION_LABEL_MAP[key];
      if (labelName) {
        properties[`AskIt — ${labelName}`] = value;
      } else {
        properties[key] = value;
      }
    }

    // Add mapped item metadata properties
    Object.assign(properties, itemsMappedProps);

    // Build the unset list: all possible "AskIt —" properties MINUS the ones
    // we are setting in this request. This ensures old diagnostic-path
    // properties are removed while current ones are preserved.
    const currentPropertyKeys = new Set(Object.keys(properties));
    const allPossibleAskitProps: string[] = [
      ...Object.values(SESSION_LABEL_MAP).map((label) => `AskIt — ${label}`),
      ...Object.values(columnLabelsMapping).map((entry) => `AskIt — ${entry.label}`),
    ];
    const askitPropsToUnset = allPossibleAskitProps.filter(
      (prop) => !currentPropertyKeys.has(prop)
    );
    const fullUnsetList = [...OLD_PROPERTIES_TO_UNSET, ...askitPropsToUnset];

    const klaviyoPayload = {
      data: {
        type: "profile",
        attributes: {
          email: normalizedEmail,
          ...(phoneE164 && { phone_number: phoneE164 }),
          first_name: session.user_name ?? undefined,
          properties,
        },
        meta: {
          patch_properties: {
            append: {},
            unappend: {},
            unset: fullUnsetList,
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
    if (klaviyoListId && (session.optin_email || (session.optin_sms && phoneE164))) {
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
              data: { type: "list", id: klaviyoListId },
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

    // 9. Fire "ASKIT diagnostic complété" event for flow re-triggering
    try {
      const eventPayload = {
        data: {
          type: "event",
          attributes: {
            metric: { data: { type: "metric", attributes: { name: "ASKIT diagnostic complété" } } },
            profile: { data: { type: "profile", attributes: { email: normalizedEmail } } },
            properties: {
              session_code: session.session_code,
              persona: personaFullLabel,
              persona_code: session.persona_code,
              source: session.source ?? null,
              device: session.device ?? null,
              conversion: session.conversion ? "Oui" : "Non",
              recommended_products: session.recommended_products ?? null,
              recommended_cart_amount: session.recommended_cart_amount ?? null,
              exit_type: translateExitType(session.exit_type),
              engagement_score: session.engagement_score ?? null,
              result_url: session.result_url ?? null,
            },
            time: new Date().toISOString(),
          },
        },
      };

      const eventResp = await fetch("https://a.klaviyo.com/api/events/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Klaviyo-API-Key ${klaviyoApiKey}`,
          revision: "2024-02-15",
        },
        body: JSON.stringify(eventPayload),
      });
      const eventBody = await eventResp.text();
      console.log("[sync-klaviyo-persona] Klaviyo event response:", eventResp.status, eventBody);
    } catch (eventErr) {
      console.error("[sync-klaviyo-persona] Klaviyo event failed (non-blocking):", eventErr);
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
