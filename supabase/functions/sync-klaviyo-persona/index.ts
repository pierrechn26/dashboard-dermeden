import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


function translateExitType(exitType: string | null): string {
  const map: Record<string, string> = {
    cta_principal: "CTA Principal",
    cta_secondaire: "CTA Secondaire",
    abandon: "Abandon",
    skip: "Passé",
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

    // 1. Charger la session
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

    // 2. Pas d'email → skip
    if (!session.email) {
      console.log("[sync-klaviyo-persona] No email, skipping:", session_id);
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normaliser l'email en lowercase
    const normalizedEmail = session.email.toLowerCase().trim();

    // 3. Charger le full_label du persona depuis la table personas (source of truth)
    const { data: personaData } = await supabase
      .from("personas")
      .select("full_label")
      .eq("code", session.persona_code ?? "P0")
      .maybeSingle();
    const personaFullLabel = personaData?.full_label || session.persona_code || "Non attribué";

    // 4. Charger les items du diagnostic triés par item_index ASC
    const { data: items } = await supabase
      .from("diagnostic_items")
      .select("*")
      .eq("session_id", session_id)
      .order("item_index", { ascending: true });

    // 4. Construire les propriétés items dynamiques et enrichissement
    // GENERIC AGNOSTIC SPREAD: all tenant-specific fields stored in item_metadata
    // are exposed flatly to Klaviyo (which only accepts flat attribute objects).
    // Whatever keys the diagnostic puts into item_metadata are forwarded
    // automatically without code change. Klaviyo allows up to ~250 custom
    // attributes per profile.
    const itemsDynamicProps: Record<string, unknown> = {};
    const itemsEnrichmentProps: Record<string, unknown> = {};

    (items || []).forEach((item, index) => {
      const prefix = `item_${index + 1}`;
      const meta = item.item_metadata || {};

      // Top-level dynamic question/answer fields (preserved as-is)
      if (item.dynamic_question_1) itemsDynamicProps[`${prefix}_dynamic_q1`] = item.dynamic_question_1;
      if (item.dynamic_answer_1) itemsDynamicProps[`${prefix}_dynamic_a1`] = item.dynamic_answer_1;
      if (item.dynamic_question_2) itemsDynamicProps[`${prefix}_dynamic_q2`] = item.dynamic_question_2;
      if (item.dynamic_answer_2) itemsDynamicProps[`${prefix}_dynamic_a2`] = item.dynamic_answer_2;
      if (item.dynamic_question_3) itemsDynamicProps[`${prefix}_dynamic_q3`] = item.dynamic_question_3;
      if (item.dynamic_answer_3) itemsDynamicProps[`${prefix}_dynamic_a3`] = item.dynamic_answer_3;
      if (item.dynamic_insight_targets) itemsDynamicProps[`${prefix}_insight_targets`] = item.dynamic_insight_targets;

      // All tenant-specific JSONB metadata fields, prefixed with item_N_
      for (const [key, value] of Object.entries(meta)) {
        if (value === null || value === undefined) continue;
        // Stringify booleans as Oui/Non for Klaviyo readability
        const formatted = typeof value === "boolean" ? (value ? "Oui" : "Non") : value;
        itemsEnrichmentProps[`${prefix}_${key}`] = formatted;
      }
    });

    // 5. Construire le payload Klaviyo
    const properties: Record<string, unknown> = {
      // Persona
      persona: personaFullLabel,
      persona_code: session.persona_code,
      adapted_tone: session.adapted_tone || null,

      // Scores
      ...(session.matching_score !== null && session.matching_score !== undefined && { matching_score: session.matching_score }),
      ...(session.engagement_score !== null && session.engagement_score !== undefined && { engagement_score: session.engagement_score }),

      // Conversion
      conversion_status: session.conversion ? "Oui" : "Non",
      is_existing_client: session.is_existing_client ? "Oui" : "Non",
      exit_type: translateExitType(session.exit_type),

      // Recommandations
      ...(session.recommended_products && { recommended_products: session.recommended_products }),
      ...(session.recommended_cart_amount !== null && session.recommended_cart_amount !== undefined && { recommended_cart_amount: session.recommended_cart_amount }),
      ...(session.upsell_potential && { upsell_potential: translateUpsell(session.upsell_potential) }),

      // Produits validés / sélectionnés
      ...(session.validated_products && { validated_products: session.validated_products }),
      ...(session.validated_cart_amount && { validated_cart_amount: session.validated_cart_amount }),
      ...(session.selected_cart_amount && { selected_cart_amount: session.selected_cart_amount }),

      // Produits existants
      ...(session.existing_brand_products && { existing_brand_products: session.existing_brand_products }),

      // Comportement
      ...(session.duration_seconds !== null && session.duration_seconds !== undefined && { diagnostic_duration_seconds: session.duration_seconds }),

      // Opt-in (propriétés custom informatives)
      optin_email: session.optin_email ? "Oui" : "Non",
      optin_sms: session.optin_sms ? "Oui" : "Non",

      // Items du diagnostic — IA insights + enrichissement (item_metadata spread)
      ...itemsDynamicProps,
      ...itemsEnrichmentProps,
    };

    const klaviyoPayload = {
      data: {
        type: "profile",
        attributes: {
          email: normalizedEmail,
          ...(session.phone && { phone_number: session.phone }),
          properties,
        },
      },
    };

    // 6. Appel Klaviyo profile-import with timeout + retry
    async function callKlaviyoWithRetry(url: string, payload: unknown, maxAttempts = 3): Promise<{ response: Response; body: string }> {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
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
          // Retry on 5xx / 429
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

    // 409 = profile already exists, treat as success (upsert behavior)
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

    // 7. Appel API Subscribe si opt-in actif (best-effort, non-bloquant)
    if (session.optin_email || session.optin_sms) {
      // deno-lint-ignore no-explicit-any
      const subscriptions: any = {};
      if (session.optin_email) {
        subscriptions.email = { marketing: { consent: "SUBSCRIBED" } };
      }
      if (session.optin_sms && session.phone) {
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
                  ...(session.phone && { phone_number: session.phone }),
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
