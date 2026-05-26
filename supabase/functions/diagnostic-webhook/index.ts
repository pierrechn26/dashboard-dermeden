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

/* ============================================================
   DEFENSIVE MAPPING HELPERS — Bloc 2
   ============================================================ */

// Returns the first argument that is neither undefined nor null.
// Empty strings, 0, and false are considered defined values.
// deno-lint-ignore no-explicit-any
function firstDefined<T = any>(...values: T[]): T | null {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

// Reads a sequence of dotted paths from a source object and returns the
// first defined value found. Useful when the same logical field can arrive
// at different positions in the payload depending on the diagnostic version.
//
// Example: coalesceFrom(payload, "utm.medium", "tracking.utm_medium", "utm_medium")
// deno-lint-ignore no-explicit-any
function coalesceFrom(source: any, ...paths: string[]): any {
  if (!source || typeof source !== "object") return null;
  for (const path of paths) {
    const parts = path.split(".");
    let cur: any = source;
    let ok = true;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) {
        cur = cur[p];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return null;
}

/* ============================================================
   TONE MAPS — generic template values only.
   Tenant-specific extensions (e.g. priority labels for a given brand)
   must live in tenant_config rather than being hardcoded here.
   ============================================================ */

// Maps a generic priority code → adapted tone keyword used by downstream
// AI prompts. Extend per-tenant via tenant_config.priority_tone_map.
const PRIORITY_TONE_MAP: Record<string, string> = {
  ludique: "playful",
  autonomie: "empowering",
  efficacite: "factual",
  clean: "transparent",
};

// Human-readable label for the dominant priority (used in dashboards/exports).
// Intentionally empty in the template — to be extended per tenant via
// tenant_config.priority_tone_label_map.
const PRIORITY_TONE_LABEL_MAP: Record<string, string> = {
  // À étendre par tenant via tenant_config plus tard.
};

/* ============================================================
   STATUS / EXIT_TYPE GUARDS (Cf. backlog #2.10)
   ============================================================ */

const FINAL_STATUS_STATES = ["termine", "abandonne"] as const;

function protectStatus(
  existingStatus: string | null | undefined,
  payloadStatus: string | null | undefined
): string | null {
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

const EXIT_TYPE_PROGRESSION: (string | null)[] = [
  null,
  "abandon",
  "completed",
  "checkout",
  "converted",
];

// Translates a raw exit_type token coming from various diagnostic versions
// into the canonical progression vocabulary. Unknown tokens are passed
// through unchanged.
function translateExitType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  const map: Record<string, string> = {
    abandon: "abandon",
    abandoned: "abandon",
    abandonne: "abandon",
    drop: "abandon",
    dropoff: "abandon",
    completed: "completed",
    complete: "completed",
    termine: "completed",
    finished: "completed",
    checkout: "checkout",
    checkout_started: "checkout",
    converted: "converted",
    conversion: "converted",
    purchased: "converted",
    purchase: "converted",
  };
  return map[v] ?? v;
}

// Derives a computed exit_type from session state when the payload omits it:
//   - status=termine + conversion=true  → "converted"
//   - status=termine                    → "completed"
//   - status=en_cours + abandoned_at_step set → "abandon"
function computeExitType(
  status: string | null | undefined,
  conversion: unknown,
  abandonedAtStep: unknown
): string | null {
  if (status === "termine" && conversion === true) return "converted";
  if (status === "termine") return "completed";
  if (status === "en_cours" && abandonedAtStep !== null && abandonedAtStep !== undefined && abandonedAtStep !== "") {
    return "abandon";
  }
  return null;
}

function protectExitType(
  existingExitType: string | null | undefined,
  payloadExitType: string | null | undefined,
  computedFallback: string | null = null
): string | null {
  const candidate = translateExitType(payloadExitType) ?? computedFallback;
  const existingRank = EXIT_TYPE_PROGRESSION.indexOf(existingExitType ?? null);
  const candidateRank = EXIT_TYPE_PROGRESSION.indexOf(candidate ?? null);

  if (existingRank > candidateRank) {
    if (candidate) {
      console.log(
        `[protectExitType] Regression blocked: ${existingExitType} (kept, rank ${existingRank}) vs ${candidate} (refused, rank ${candidateRank})`
      );
    }
    return existingExitType ?? null;
  }
  return candidate ?? existingExitType ?? null;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/* ============================================================
   PRIORITY EXTRACTION — multi-source
   The dominant priority can arrive in several positions depending on the
   diagnostic version. This helper checks all known locations in order.
   ============================================================ */
// deno-lint-ignore no-explicit-any
function getFirstPriority(payload: any, items: any[], sessionData: Record<string, unknown>): string | null {
  // 1. Already computed on sessionData (comma-separated)
  if (sessionData.priorities_ordered) {
    const first = String(sessionData.priorities_ordered).split(",")[0].trim();
    if (first) return first;
  }

  // 2. Top-level payload.priorities_ordered
  if (payload?.priorities_ordered) {
    const first = String(payload.priorities_ordered).split(",")[0].trim();
    if (first) return first;
  }

  // 3. payload.item_metadata.answers.priorities
  const a1 = coalesceFrom(payload, "item_metadata.answers.priorities");
  if (Array.isArray(a1) && a1.length > 0) return String(a1[0]).trim();
  if (typeof a1 === "string" && a1) return a1.split(",")[0].trim();

  // 4. payload.item_metadata.priorities
  const a2 = coalesceFrom(payload, "item_metadata.priorities");
  if (Array.isArray(a2) && a2.length > 0) return String(a2[0]).trim();
  if (typeof a2 === "string" && a2) return a2.split(",")[0].trim();

  // 5. items[0].item_metadata.priorities
  const first = Array.isArray(items) ? items.find((i) => i?.item_index === 0) ?? items[0] : null;
  const a3 = coalesceFrom(first, "item_metadata.priorities");
  if (Array.isArray(a3) && a3.length > 0) return String(a3[0]).trim();
  if (typeof a3 === "string" && a3) return a3.split(",")[0].trim();

  // 6. items[0].item_metadata._raw.answers.priorities
  const a4 = coalesceFrom(first, "item_metadata._raw.answers.priorities");
  if (Array.isArray(a4) && a4.length > 0) return String(a4[0]).trim();
  if (typeof a4 === "string" && a4) return a4.split(",")[0].trim();

  return null;
}

/* ============================================================
   ADAPTED TONE + TONE LABEL
   ============================================================ */
function computeAdaptedTone(
  sessionData: Record<string, unknown>,
  priority1: string | null
): string {
  if (priority1 && PRIORITY_TONE_MAP[priority1]) {
    return PRIORITY_TONE_MAP[priority1];
  }
  const trust_trigger_1 = sessionData.trust_triggers_ordered
    ? String(sessionData.trust_triggers_ordered).split(",")[0].trim()
    : null;
  if (trust_trigger_1 === "scientific_validation" || trust_trigger_1 === "proof_results") {
    return "expert";
  }
  return "factual";
}

function computeToneLabel(priority1: string | null): string | null {
  if (!priority1) return null;
  return PRIORITY_TONE_LABEL_MAP[priority1] ?? null;
}

/* ============================================================
   ENGAGEMENT SCORE (0-100)
   Generic signals only — duration, completion, contact, opt-in, hesitation.
   ============================================================ */
// deno-lint-ignore no-explicit-any
function computeEngagementScore(
  sessionData: Record<string, unknown>,
  payload?: any,
  items?: any[]
): number {
  let score = 0;
  const duration = Number(sessionData.duration_seconds ?? 0);
  if (duration > 30) score += 20;
  if (sessionData.status === "termine") score += 25;
  if (sessionData.phone) score += 15;
  if (sessionData.email) score += 15;
  if (sessionData.optin_email === true || sessionData.optin_sms === true) score += 15;
  const back = Number(sessionData.back_navigation_count ?? 0);
  if (back <= 1) score += 10;
  else if (back <= 3) score += 5;

  // wantsSubscription: defensively read from nested payload locations
  const wantsSub =
    payload?.item_metadata?._raw?.wants_subscription ??
    payload?.item_metadata?.raw?.wants_subscription ??
    payload?.item_metadata?._raw?.answers?.wantsSubscription ??
    payload?.item_metadata?.answers?.wantsSubscription ??
    items?.[0]?.item_metadata?.wantsSubscription ??
    items?.[0]?.wantsSubscription;
  if (wantsSub === true) score += 15;

  return Math.max(0, Math.min(100, score));
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

  const { data: personas } = await supabase
    .from("personas")
    .select("code, criteria")
    .eq("is_active", true)
    .eq("is_pool", false);

  if (!personas || personas.length === 0) {
    console.warn("[diagnostic-webhook] No personas found in DB, falling back to P0");
    return { code: "P0", score: 0, scores_all: {} };
  }

  const item1 = items.find((c: any) => c.item_index === 0) || items[0];
  const item2 = items.find((c: any) => c.item_index === 1);

  const priority_1 = sessionData.priorities_ordered
    ? String(sessionData.priorities_ordered).split(",")[0].trim()
    : null;
  const trust_trigger_1 = sessionData.trust_triggers_ordered
    ? String(sessionData.trust_triggers_ordered).split(",")[0].trim()
    : null;

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
    if (item.item_metadata && typeof item.item_metadata === "object") {
      Object.assign(meta, item.item_metadata);
    }
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
      sessionValues[`child.${key}`] = value;
    }
  }

  if (item1 && item2) {
    const meta1 = extractMetadata(item1);
    const meta2 = extractMetadata(item2);
    for (const key of Object.keys(meta1)) {
      const isDifferent = meta1[key] !== meta2[key];
      sessionValues[`item.${key}_different`] = isDifferent;
      sessionValues[`child.${key}_different`] = isDifferent;
    }
  }

  const scores: Record<string, number> = {};
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

        if (criterion.values.includes("any")) {
          levelScore += criterionWeight;
          continue;
        }

        if (sessionValue === null || sessionValue === undefined) {
          if (criterion.required === true) {
            blockedByRequired = true;
          }
          continue;
        }

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
          blockedByRequired = true;
        }
      }

      if (blockedByRequired) break;

      if (levelTotalWeight > 0) {
        const contribution = (levelScore / levelTotalWeight) * levelWeight;
        totalScore += contribution;
        if (level === "need") needScores[persona.code] = Math.round(contribution * 100 / levelWeight);
      }
    }

    scores[persona.code] = blockedByRequired ? 0 : Math.round(totalScore * 100);
    if (blockedByRequired) needScores[persona.code] = 0;
  }

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
  let payloadItems: any[] = payload.items ?? payload.children ?? [];

  // ── Single-item synthesis fallback ─────────────────────────────────────
  // Some diagnostics post a flat payload (no payload.items) but carry the
  // answers in payload.item_metadata. Synthesize a single item so downstream
  // logic (persona scoring, items table, mapping lookup) keeps working.
  //
  // We also flatten two specific keys that the diagnostic nests inside
  // `_raw` / `answers`:
  //   - `age` (often under _raw.age)
  //   - `wantsSubscription` (often under _raw.answers.wantsSubscription
  //     or _raw.wants_subscription)
  //
  // We expose them at the top level of item_metadata in camelCase to match
  // the naming convention used by column_labels_mapping (hairProblems,
  // washFrequency, etc.). No tenant-specific values are introduced.
  if ((!Array.isArray(payloadItems) || payloadItems.length === 0)
      && payload.item_metadata && typeof payload.item_metadata === "object") {
    const meta: Record<string, any> = { ...payload.item_metadata };
    const rawBlock = (payload.item_metadata as any).raw
      ?? (payload.item_metadata as any)._raw
      ?? null;
    const answersBlock = (payload.item_metadata as any).answers ?? null;

    const flatAge =
      rawBlock?.age ??
      answersBlock?.age ??
      undefined;

    const flatWantsSub =
      rawBlock?.answers?.wantsSubscription ??
      rawBlock?.wants_subscription ??
      answersBlock?.wantsSubscription ??
      answersBlock?.wants_subscription ??
      undefined;

    payloadItems = [{
      item_index: 0,
      item_label: payload.user_name ?? null,
      ...meta,
      ...(flatAge != null ? { age: flatAge } : {}),
      ...(flatWantsSub != null ? { wantsSubscription: flatWantsSub } : {}),
      _recommendations: (payload.item_metadata as any).recommendations ?? null,
      _raw: rawBlock,
    }];
  }

  const { data: existing } = await supabase
    .from("diagnostic_sessions")
    .select("*")
    .eq("session_code", payload.session_code)
    .maybeSingle();

  // deno-lint-ignore no-explicit-any
  const coalesce = (field: string, fallback: any = null) => {
    const incoming = payload[field];
    if (incoming !== undefined && incoming !== null) return incoming;
    if (existing && existing[field] !== undefined && existing[field] !== null) return existing[field];
    return fallback;
  };

  // UTM / paid-ads click ids — read defensively from payload.utm.*, payload.tracking.*
  // or top-level payload.<field>. Falls back to existing row to avoid wiping
  // values picked up on an earlier ping.
  const utm = (field: string) =>
    firstDefined(
      coalesceFrom(payload, `utm.${field}`, `tracking.${field}`, field),
      existing?.[field]
    );

  const status = protectStatus(existing?.status, payload.status) ?? "en_cours";
  const conversion = coalesce("conversion", false);
  const abandonedAtStepIncoming = payload.abandoned_at_step === "CLEAR"
    ? null
    : coalesce("abandoned_at_step");
  // Once the session is completed, abandoned_at_step is meaningless — clear it.
  const abandonedAtStep = status === "termine" ? null : abandonedAtStepIncoming;

  const computedExit = computeExitType(status, conversion, abandonedAtStep);

  const sessionData: Record<string, unknown> = {
    session_code: payload.session_code,
    status,
    source: coalesce("source"),
    utm_campaign: utm("utm_campaign"),
    utm_medium:   utm("utm_medium"),
    utm_content:  utm("utm_content"),
    utm_term:     utm("utm_term"),
    gclid:        utm("gclid"),
    fbclid:       utm("fbclid"),
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
    tone_label: coalesce("tone_label"),
    conversion,
    exit_type: protectExitType(existing?.exit_type, payload.exit_type, computedExit),
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
    abandoned_at_step: abandonedAtStep,
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

  // Compute tone + label up-front from all available sources so they are
  // persisted even on the first webhook ping (before items hit the DB).
  const priority1 = getFirstPriority(payload, payloadItems, sessionData);
  if (!sessionData.adapted_tone) {
    sessionData.adapted_tone = computeAdaptedTone(sessionData, priority1);
  }
  if (!sessionData.tone_label) {
    const label = computeToneLabel(priority1);
    if (label) sessionData.tone_label = label;
  }

  // Recompute engagement_score if not provided by the payload.
  if (sessionData.engagement_score === null || sessionData.engagement_score === undefined) {
    sessionData.engagement_score = computeEngagementScore(sessionData, payload, payloadItems);
  }

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

  const diagPercent = diagnosticLimit > 0 ? (totalSessions / diagnosticLimit) * 100 : 0;
  const diagPrevPercent = diagnosticLimit > 0 ? ((totalSessions - 1) / diagnosticLimit) * 100 : 0;
  if (diagPrevPercent < 80 && diagPercent >= 80) {
    notifyPortalThreshold("diagnostic", 80, totalSessions, diagnosticLimit);
  }
  if (diagPrevPercent < 100 && diagPercent >= 100) {
    notifyPortalThreshold("diagnostic", 100, totalSessions, diagnosticLimit);
  }

  console.log("[diagnostic-webhook] Session saved:", session.id);

  if (Array.isArray(payloadItems) && payloadItems.length > 0) {
    const TOP_LEVEL_KEYS = new Set([
      "item_index", "item_label",
      "dynamic_question_1", "dynamic_answer_1",
      "dynamic_question_2", "dynamic_answer_2",
      "dynamic_question_3", "dynamic_answer_3",
      "dynamic_insight_targets",
    ]);

    // deno-lint-ignore no-explicit-any
    const itemRows = payloadItems.map((c: any) => {
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

    if (sessionData.status === "termine") {
      const persona = await computePersonaWithScore(supabase, sessionData, payloadItems);
      const priority1Final = getFirstPriority(payload, payloadItems, sessionData);
      const adaptedTone = computeAdaptedTone(sessionData, priority1Final);
      const toneLabel = computeToneLabel(priority1Final);
      await supabase
        .from("diagnostic_sessions")
        .update({
          persona_code: persona.code,
          matching_score: persona.score,
          adapted_tone: adaptedTone,
          tone_label: toneLabel,
        })
        .eq("id", session.id);
      console.log("[diagnostic-webhook] Persona assigned:", persona.code, "score:", persona.score, "tone:", adaptedTone, "label:", toneLabel);

      supabase.functions.invoke("sync-klaviyo-persona", {
        body: { session_id: session.id },
      }).catch((err: Error) => console.error("[diagnostic-webhook] Klaviyo sync failed:", err));
    }
  }

  if (sessionData.status === "termine" && (!Array.isArray(payloadItems) || payloadItems.length === 0)) {
    const { data: existingItems } = await supabase
      .from("diagnostic_items")
      .select("*")
      .eq("session_id", session.id)
      .order("item_index", { ascending: true });

    if (existingItems && existingItems.length > 0) {
      const persona = await computePersonaWithScore(supabase, sessionData, existingItems);
      const priority1Final = getFirstPriority(payload, existingItems, sessionData);
      const adaptedTone = computeAdaptedTone(sessionData, priority1Final);
      const toneLabel = computeToneLabel(priority1Final);
      await supabase
        .from("diagnostic_sessions")
        .update({
          persona_code: persona.code,
          matching_score: persona.score,
          adapted_tone: adaptedTone,
          tone_label: toneLabel,
        })
        .eq("id", session.id);
      console.log("[diagnostic-webhook] Persona assigned (existing items):", persona.code, "score:", persona.score, "tone:", adaptedTone, "label:", toneLabel);

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
