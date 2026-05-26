import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyPortalThreshold } from "../_shared/notifyPortalThreshold.ts";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";
import { corsHeaders } from "../_shared/cors.ts";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Cf. backlog #2.10 — Anti-regression guards for status and exit_type fields.
// A diagnostic session can receive multiple payloads during its lifetime
// (start, mid-session, completion). A late payload with stale data must not
// regress the session: e.g. a payload with status='en_cours' arriving after
// the session has reached 'termine' is silently kept as 'termine'.

const FINAL_STATUS_STATES = ["termine", "abandonne"] as const;

function protectStatus(
  existingStatus: string | null | undefined,
  payloadStatus: string | null | undefined
): string | null {
  // Once a session reaches a final state, no further status change is allowed.
  if (existingStatus && (FINAL_STATUS_STATES as readonly string[]).includes(existingStatus)) {
    if (payloadStatus && payloadStatus !== existingStatus) {
      console.log(
        `[protectStatus] Regression blocked: ${existingStatus} (kept) vs ${payloadStatus} (refused)`
      );
    }
    return existingStatus;
  }
  return payloadStatus ?? existingStatus ?? null;
}

// exit_type progresses linearly: null → abandon → completed → checkout → converted.
// A higher rank can never be downgraded (e.g. converted → checkout is refused).
const EXIT_TYPE_PROGRESSION: (string | null)[] = [
  null,
  "abandon",
  "completed",
  "checkout",
  "converted",
];

function protectExitType(
  existingExitType: string | null | undefined,
  payloadExitType: string | null | undefined
): string | null {
  const existingRank = EXIT_TYPE_PROGRESSION.indexOf(existingExitType ?? null);
  const payloadRank = EXIT_TYPE_PROGRESSION.indexOf(payloadExitType ?? null);

  if (existingRank > payloadRank) {
    if (payloadExitType) {
      console.log(
        `[protectExitType] Regression blocked: ${existingExitType} (kept, rank ${existingRank}) vs ${payloadExitType} (refused, rank ${payloadRank})`
      );
    }
    return existingExitType ?? null;
  }
  return payloadExitType ?? existingExitType ?? null;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/* ============================================================
   ADAPTED TONE COMPUTATION — deterministic, based on session data
   ============================================================ */
function computeAdaptedTone(sessionData: Record<string, unknown>): string {
  const priority_1 = sessionData.priorities_ordered
    ? String(sessionData.priorities_ordered).split(",")[0].trim()
    : null;
  const trust_trigger_1 = sessionData.trust_triggers_ordered
    ? String(sessionData.trust_triggers_ordered).split(",")[0].trim()
    : null;

  const priorityToneMap: Record<string, string> = {
    ludique: "playful",
    autonomie: "empowering",
    efficacite: "factual",
    clean: "transparent",
  };

  if (priority_1 && priorityToneMap[priority_1]) {
    return priorityToneMap[priority_1];
  }

  if (trust_trigger_1 === "scientific_validation" || trust_trigger_1 === "proof_results") {
    return "expert";
  }

  return "factual";
}

/* ============================================================
   PERSONA SCORING ENGINE — reads definitions from personas table
   ============================================================ */
// deno-lint-ignore no-explicit-any
async function computePersonaWithScore(
  supabase: SupabaseClient,
  sessionData: Record<string, unknown>,
  items: any[]
): Promise<{ code: string; score: number; scores_all: Record<string, number> }> {

  // 1. Load all active personas (excluding P0 pool)
  const { data: personas } = await supabase
    .from("personas")
    .select("code, criteria")
    .eq("is_active", true)
    .eq("is_pool", false);

  if (!personas || personas.length === 0) {
    console.warn("[diagnostic-webhook] No personas found in DB, falling back to P0");
    return { code: "P0", score: 0, scores_all: {} };
  }

  // 2. Prepare session values for matching
  const item1 = items.find((c: any) => c.item_index === 0) || items[0];
  const item2 = items.find((c: any) => c.item_index === 1);

  const priority_1 = sessionData.priorities_ordered
    ? String(sessionData.priorities_ordered).split(",")[0].trim()
    : null;
  const trust_trigger_1 = sessionData.trust_triggers_ordered
    ? String(sessionData.trust_triggers_ordered).split(",")[0].trim()
    : null;

  // Session-level values (universal across all tenants)
  // deno-lint-ignore no-explicit-any
  const sessionValues: Record<string, any> = {
    "relationship": sessionData.relationship,
    "is_existing_client": sessionData.is_existing_client,
    "number_of_children": sessionData.number_of_children,
    "priority_1": priority_1,
    "routine_size_preference": sessionData.routine_size_preference,
    "trust_trigger_1": trust_trigger_1,
    "content_format_preference": sessionData.content_format_preference,
  };

  // Item-level values — dynamically read from item_metadata JSONB.
  // The persona criteria reference these as "item.<field>" (e.g., "item.skin_concern").
  // This is tenant-agnostic: whatever keys the diagnostic puts into item_metadata
  // are automatically available for persona matching.
  // Also handles backward-compat: if the diagnostic sends fields directly on
  // the item object (e.g., {skin_concern: "xxx"}) instead of nested inside
  // item_metadata, we still pick them up.
  const ITEM_TOP_LEVEL = new Set([
    "item_index", "item_label", "session_id", "id", "created_at",
    "dynamic_question_1", "dynamic_answer_1",
    "dynamic_question_2", "dynamic_answer_2",
    "dynamic_question_3", "dynamic_answer_3",
    "dynamic_insight_targets", "item_metadata",
  ]);

  // deno-lint-ignore no-explicit-any
  function extractMetadata(item: any): Record<string, any> {
    const meta: Record<string, any> = {};
    // 1. Structured item_metadata (from DB rows or well-formed payloads)
    if (item.item_metadata && typeof item.item_metadata === "object") {
      Object.assign(meta, item.item_metadata);
    }
    // 2. Direct properties (backward-compat for legacy diagnostic payloads)
    for (const [key, value] of Object.entries(item)) {
      if (!ITEM_TOP_LEVEL.has(key) && value !== undefined && value !== null && !(key in meta)) {
        meta[key] = value;
      }
    }
    return meta;
  }

  if (item1) {
    const meta1 = extractMetadata(item1);
    for (const [key, value] of Object.entries(meta1)) {
      sessionValues[`item.${key}`] = value;
      // Backward-compat: existing persona criteria may reference "child.xxx"
      // (legacy Ouate convention). Populate both prefixes so criteria work
      // regardless of which prefix was used when they were created.
      sessionValues[`child.${key}`] = value;
    }
  }

  // Special criterion: compare a need-level field between item1 and item2.
  // The persona criteria can reference "item.<field>_different" to match sessions
  // where the first two items have different values for a given field.
  if (item1 && item2) {
    const meta1 = extractMetadata(item1);
    const meta2 = extractMetadata(item2);
    for (const key of Object.keys(meta1)) {
      const isDifferent = meta1[key] !== meta2[key];
      sessionValues[`item.${key}_different`] = isDifferent;
      sessionValues[`child.${key}_different`] = isDifferent; // backward-compat
    }
  }

  // 3. Score each persona
  const scores: Record<string, number> = {};
  // Track need-level scores for tie-breaking (Fix A)
  const needScores: Record<string, number> = {};

  for (const persona of personas) {
    const criteria = persona.criteria;
    let totalScore = 0;
    let blockedByRequired = false;

    for (const level of ["identity", "need", "behavior"]) {
      const levelDef = criteria[level];
      if (!levelDef || !levelDef.criteria || levelDef.criteria.length === 0) continue;

      const levelWeight = levelDef.weight;
      let levelScore = 0;
      let levelTotalWeight = 0;

      for (const criterion of levelDef.criteria) {
        const sessionValue = sessionValues[criterion.field];
        const criterionWeight = criterion.weight;
        levelTotalWeight += criterionWeight;

        // "any" always matches
        if (criterion.values.includes("any")) {
          levelScore += criterionWeight;
          continue;
        }

        // null/undefined in session = no match
        if (sessionValue === null || sessionValue === undefined) {
          // Fix B: if required and missing, block the persona
          if (criterion.required === true) {
            blockedByRequired = true;
          }
          continue;
        }

        // Evaluate match
        let matched = false;
        if (criterion.operator === "gte") {
          matched = Number(sessionValue) >= Number(criterion.values[0]);
        } else if (criterion.operator === "lte") {
          matched = Number(sessionValue) <= Number(criterion.values[0]);
        } else {
          matched = criterion.values.some((v: any) => {
            if (typeof sessionValue === "boolean") return v === sessionValue;
            return String(v) === String(sessionValue);
          });
        }

        if (matched) {
          levelScore += criterionWeight;
        } else if (criterion.required === true) {
          // Fix B: required criterion didn't match → block this persona
          blockedByRequired = true;
        }
      }

      if (blockedByRequired) break;

      // Level score = (weighted matches / total weight) × level weight
      if (levelTotalWeight > 0) {
        const contribution = (levelScore / levelTotalWeight) * levelWeight;
        totalScore += contribution;
        if (level === "need") needScores[persona.code] = Math.round(contribution * 100 / levelWeight);
      }
    }

    scores[persona.code] = blockedByRequired ? 0 : Math.round(totalScore * 100);
    if (blockedByRequired) needScores[persona.code] = 0;
  }

  // 4. Find best persona (highest score, ≥60%) — Fix A: break ties using need score
  let bestCode = "P0";
  let bestScore = 0;
  let bestNeedScore = 0;

  for (const [code, score] of Object.entries(scores)) {
    const needScore = needScores[code] ?? 0;
    if (score > bestScore || (score === bestScore && needScore > bestNeedScore)) {
      bestScore = score;
      bestCode = code;
      bestNeedScore = needScore;
    }
  }

  // If best score < 60% → P0 (unassigned pool)
  if (bestScore < 60) {
    bestCode = "P0";
  }

  console.log("[diagnostic-webhook] Scoring result:", { bestCode, bestScore, scores });
  return { code: bestCode, score: bestScore, scores_all: scores };
}

/* ============================================================
   NEW FORMAT — writes to diagnostic_sessions + diagnostic_items
   ============================================================ */
// deno-lint-ignore no-explicit-any
async function handleNewFormat(supabase: SupabaseClient, payload: any) {
  // Backward compatibility: accept both "items" (template convention) and
  // "children" (Ouate legacy diagnostic) in the webhook payload.
  const payloadItems: any[] = payload.items ?? payload.children ?? [];

  // Fetch existing session to apply COALESCE logic (don't overwrite with nulls)
  const { data: existing } = await supabase
    .from("diagnostic_sessions")
    .select("*")
    .eq("session_code", payload.session_code)
    .maybeSingle();

  // Helper: use incoming value if explicitly provided (not undefined/null), else keep existing
  // deno-lint-ignore no-explicit-any
  const coalesce = (field: string, fallback: any = null) => {
    const incoming = payload[field];
    if (incoming !== undefined && incoming !== null) return incoming;
    if (existing && existing[field] !== undefined && existing[field] !== null) return existing[field];
    return fallback;
  };

  const sessionData: Record<string, unknown> = {
    session_code: payload.session_code,
    // Cf. backlog #2.10: protectStatus blocks regression away from final states
    // (termine, abandonne).
    status: protectStatus(existing?.status, payload.status) ?? "en_cours",
    source: coalesce("source"),
    utm_campaign: coalesce("utm_campaign"),
    device: coalesce("device"),
    user_name: coalesce("user_name"),
    relationship: coalesce("relationship"),
    email: payload.email ? payload.email.toLowerCase().trim() : coalesce("email"),
    phone: coalesce("phone"),
    optin_email: coalesce("optin_email", false),
    optin_sms: coalesce("optin_sms", false),
    number_of_children: coalesce("number_of_children"),
    locale: coalesce("locale"),
    result_url: coalesce("result_url"),
    adapted_tone: coalesce("adapted_tone"),
    conversion: coalesce("conversion", false),
    // Cf. backlog #2.10: protectExitType enforces the linear progression
    // null → abandon → completed → checkout → converted.
    exit_type: protectExitType(existing?.exit_type, payload.exit_type),
    existing_brand_products: coalesce("existing_brand_products") ?? coalesce("existing_client_products"),
    is_existing_client: coalesce("is_existing_client", false),
    recommended_cart_amount: coalesce("recommended_cart_amount"),
    recommended_products: coalesce("recommended_products"),
    validated_cart_amount: coalesce("validated_cart_amount"),
    validated_products: coalesce("validated_products"),
    selected_cart_amount: coalesce("selected_cart_amount"),
    cart_selected_at: coalesce("cart_selected_at"),
    checkout_started: coalesce("checkout_started", false),
    checkout_at: coalesce("checkout_at"),
    upsell_potential: coalesce("upsell_potential"),
    duration_seconds: coalesce("duration_seconds"),
    abandoned_at_step: payload.abandoned_at_step === "CLEAR" ? null : coalesce("abandoned_at_step"),
    question_path: coalesce("question_path"),
    back_navigation_count: coalesce("back_navigation_count", 0),
    has_optional_details: coalesce("has_optional_details", false),
    behavior_tags: coalesce("behavior_tags"),
    engagement_score: coalesce("engagement_score"),
    routine_size_preference: coalesce("routine_size_preference"),
    priorities_ordered: coalesce("priorities_ordered"),
    trust_triggers_ordered: coalesce("trust_triggers_ordered"),
    content_format_preference: coalesce("content_format_preference"),
    avg_response_time: coalesce("avg_response_time"),
    total_text_length: coalesce("total_text_length"),
    has_detailed_responses: coalesce("has_detailed_responses", false),
    step_timestamps: coalesce("step_timestamps"),
  };

  const { data: session, error: sessionError } = await supabase
    .from("diagnostic_sessions")
    .upsert(sessionData, { onConflict: "session_code", ignoreDuplicates: false })
    .select("id")
    .single();

  if (sessionError) {
    console.error("[diagnostic-webhook] Session upsert error:", sessionError);
    return jsonResponse(
      { error: "Failed to save session", details: sessionError.message },
      500
    );
  }

  // ── Check diagnostic quota and flag over_quota sessions ──
  const diagNow = new Date();
  const diagMonthStart = new Date(Date.UTC(diagNow.getUTCFullYear(), diagNow.getUTCMonth(), 1)).toISOString();
  const diagNextMonth = new Date(Date.UTC(diagNow.getUTCFullYear(), diagNow.getUTCMonth() + 1, 1)).toISOString();

  const [{ count: sessionsThisMonth }, { data: diagPlanData }] = await Promise.all([
    supabase.from("diagnostic_sessions").select("*", { count: "exact", head: true })
      .gte("created_at", diagMonthStart).lt("created_at", diagNextMonth),
    supabase.from("client_plan").select("sessions_limit, plan")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const diagnosticLimit = diagPlanData?.sessions_limit ?? 500;
  const totalSessions = sessionsThisMonth ?? 0;
  const isOverQuota = totalSessions > diagnosticLimit;

  if (isOverQuota) {
    await supabase.from("diagnostic_sessions").update({ over_quota: true }).eq("id", session.id);
  }

  // Fire-and-forget: notify portal at 80% and 100% thresholds
  const diagPercent = diagnosticLimit > 0 ? (totalSessions / diagnosticLimit) * 100 : 0;
  const diagPrevPercent = diagnosticLimit > 0 ? ((totalSessions - 1) / diagnosticLimit) * 100 : 0;
  if (diagPrevPercent < 80 && diagPercent >= 80) {
    notifyPortalThreshold("diagnostic", 80, totalSessions, diagnosticLimit);
  }
  if (diagPrevPercent < 100 && diagPercent >= 100) {
    notifyPortalThreshold("diagnostic", 100, totalSessions, diagnosticLimit);
  }

  console.log("[diagnostic-webhook] Session saved:", session.id);

  // Items: native UPSERT on (session_id, item_index) — idempotent without
  // a destructive delete window. Backlog: avoids race conditions where a
  // late payload could wipe items from a concurrent payload before reinsert.
  if (Array.isArray(payloadItems) && payloadItems.length > 0) {
    // Top-level columns in diagnostic_items (universal, not tenant-specific)
    const TOP_LEVEL_KEYS = new Set([
      "item_index", "item_label",
      "dynamic_question_1", "dynamic_answer_1",
      "dynamic_question_2", "dynamic_answer_2",
      "dynamic_question_3", "dynamic_answer_3",
      "dynamic_insight_targets",
    ]);

    // deno-lint-ignore no-explicit-any
    const itemRows = payloadItems.map((c: any) => {
      // Build item_metadata from all keys that are NOT top-level columns
      const metadata: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(c)) {
        if (!TOP_LEVEL_KEYS.has(key) && value !== undefined) {
          metadata[key] = value;
        }
      }

      return {
        session_id: session.id,
        item_index: c.item_index ?? 0,
        item_label: c.item_label ?? null,
        item_metadata: Object.keys(metadata).length > 0 ? metadata : (c.item_metadata || {}),
        dynamic_question_1: c.dynamic_question_1 ?? null,
        dynamic_answer_1: c.dynamic_answer_1 ?? null,
        dynamic_question_2: c.dynamic_question_2 ?? null,
        dynamic_answer_2: c.dynamic_answer_2 ?? null,
        dynamic_question_3: c.dynamic_question_3 ?? null,
        dynamic_answer_3: c.dynamic_answer_3 ?? null,
        dynamic_insight_targets: c.dynamic_insight_targets ?? null,
      };
    });

    const { error: itemsError } = await supabase
      .from("diagnostic_items")
      .upsert(itemRows, { onConflict: "session_id,item_index", ignoreDuplicates: false });

    if (itemsError) {
      console.error("[diagnostic-webhook] Items insert error:", itemsError);
      return jsonResponse(
        { error: "Session saved but failed to save items", details: itemsError.message },
        500
      );
    }
    console.log("[diagnostic-webhook] Items saved:", payloadItems.length);

    // Assign persona + score + adapted_tone if session is completed
    if (sessionData.status === "termine") {
      const persona = await computePersonaWithScore(supabase, sessionData, payloadItems);
      const adaptedTone = computeAdaptedTone(sessionData);
      await supabase
        .from("diagnostic_sessions")
        .update({ persona_code: persona.code, matching_score: persona.score, adapted_tone: adaptedTone })
        .eq("id", session.id);
      console.log("[diagnostic-webhook] Persona assigned:", persona.code, "score:", persona.score, "tone:", adaptedTone);

      // Sync Klaviyo — fire and forget
      supabase.functions.invoke("sync-klaviyo-persona", {
        body: { session_id: session.id },
      }).catch((err: Error) => console.error("[diagnostic-webhook] Klaviyo sync failed:", err));
    }
  }

  // Also assign persona if terminated but no items in this payload
  if (sessionData.status === "termine" && (!Array.isArray(payloadItems) || payloadItems.length === 0)) {
    const { data: existingItems } = await supabase
      .from("diagnostic_items")
      .select("*")
      .eq("session_id", session.id)
      .order("item_index", { ascending: true });

    if (existingItems && existingItems.length > 0) {
      const persona = await computePersonaWithScore(supabase, sessionData, existingItems);
      const adaptedTone = computeAdaptedTone(sessionData);
      await supabase
        .from("diagnostic_sessions")
        .update({ persona_code: persona.code, matching_score: persona.score, adapted_tone: adaptedTone })
        .eq("id", session.id);
      console.log("[diagnostic-webhook] Persona assigned (existing items):", persona.code, "score:", persona.score, "tone:", adaptedTone);

      // Sync Klaviyo — fire and forget
      supabase.functions.invoke("sync-klaviyo-persona", {
        body: { session_id: session.id },
      }).catch((err: Error) => console.error("[diagnostic-webhook] Klaviyo sync failed:", err));
    }
  }

  return jsonResponse(
    { success: true, message: "Session saved successfully", id: session.id, format: "new" },
    200
  );
}

/* ============================================================
   MAIN HANDLER
   ============================================================ */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Validate webhook secret — prefer DASHBOARD_WEBHOOK_SECRET (template
    // canonical name). Falls back to legacy DIAGNOSTIC_WEBHOOK_SECRET for
    // projects remixed before the rename.
    const webhookSecret = req.headers.get("x-webhook-secret");
    const expectedSecret =
      Deno.env.get("DASHBOARD_WEBHOOK_SECRET") ??
      Deno.env.get("DIAGNOSTIC_WEBHOOK_SECRET");

    if (!expectedSecret) {
      console.error("[diagnostic-webhook] DASHBOARD_WEBHOOK_SECRET not configured");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }
    if (webhookSecret !== expectedSecret) {
      console.log("[diagnostic-webhook] Invalid webhook secret");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload = await req.json();
    console.log("[diagnostic-webhook] Received payload keys:", Object.keys(payload));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (payload.session_code) {
      return await handleNewFormat(supabase, payload);
    }

    return jsonResponse({ error: "Missing session_code" }, 400);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[diagnostic-webhook] Unexpected error:", error);
    reportEdgeFunctionError("diagnostic-webhook", error, { type: "webhook_failure", severity: "error" });
    return jsonResponse({ error: "Internal server error", details: msg }, 500);
  }
});
