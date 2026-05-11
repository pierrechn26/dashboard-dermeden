import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTenantConfig, type TenantConfig } from "../_shared/loadTenantConfig.ts";
import { paginateQuery } from "../_shared/paginateSupabase.ts";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// deno-lint-ignore no-explicit-any
type Any = any;

/* ============================================================
   HELPERS
   ============================================================ */

/* ============================================================
   PERSONA DIMENSION MAPPING
   Reads the list of fields to use for clustering from tenant_config.
   Each tenant defines which JSONB keys from item_metadata map to
   identity/need/behavior dimensions.
   ============================================================ */
type PersonaDimensionMapping = {
  identity: string[];
  need: string[];
  behavior: string[];
};

function getDimensionMapping(tenantConfig: TenantConfig): PersonaDimensionMapping {
  const mapping = tenantConfig.persona_dimension_mapping || {};
  return {
    identity: Array.isArray(mapping.identity) ? mapping.identity : [],
    need: Array.isArray(mapping.need) ? mapping.need : [],
    behavior: Array.isArray(mapping.behavior) ? mapping.behavior : [],
  };
}

/* ============================================================
   extractCriteria — now agnostic, driven by tenant's dimension mapping
   ============================================================ */
function extractCriteria(session: Any, mapping: PersonaDimensionMapping) {
  // Primary item (index 0) = "the item that matters most" (first child for Ouate,
  // first room for Cottan, etc.). item_metadata is a JSONB blob containing all
  // domain-specific fields. We iterate on the mapping keys to pick what matters
  // for the current tenant.
  const item = session.diagnostic_items?.find((c: Any) => c.item_index === 0)
    || session.diagnostic_items?.[0];
  const item2 = session.diagnostic_items?.find((c: Any) => c.item_index === 1);

  // Identity fields come from the session itself (top-level columns)
  const identity: Record<string, Any> = {};
  for (const field of mapping.identity) {
    identity[field] = session[field] ?? null;
  }

  // Need fields come from the primary item's item_metadata JSONB
  const need: Record<string, Any> = {};
  const itemMeta = item?.item_metadata || {};
  for (const field of mapping.need) {
    need[field] = itemMeta[field] ?? null;
  }

  // Generic "is this item's key_field different from item2's key_field?" signal
  // Only used if tenant has at least one need field and multiple items
  if (item && item2 && mapping.need.length > 0) {
    const primaryNeedField = mapping.need[0];
    const item2Meta = item2.item_metadata || {};
    need[`${primaryNeedField}_differs_from_item2`] =
      itemMeta[primaryNeedField] !== item2Meta[primaryNeedField];
  }

  // Behavior fields come from the session itself (top-level columns or derived)
  const behavior: Record<string, Any> = {};
  for (const field of mapping.behavior) {
    // Special handling for ordered list fields that store comma-separated values
    // in columns like "priorities_ordered" or "trust_triggers_ordered".
    // Convention: if the mapping field name matches <x>_1 / <x>_2 etc., we look
    // for the ordered list column and extract the requested position.
    const orderedMatch = field.match(/^(.+)_(\d+)$/);
    if (orderedMatch) {
      const basename = orderedMatch[1];
      const position = parseInt(orderedMatch[2], 10) - 1;
      const orderedColumn = `${basename.replace(/_1$|_\d+$/, "")}s_ordered`;
      const orderedValue = session[orderedColumn] || session[`${basename}_ordered`];
      if (typeof orderedValue === "string") {
        const parts = orderedValue.split(",").map((x: string) => x.trim());
        behavior[field] = parts[position] ?? null;
      } else {
        behavior[field] = session[field] ?? null;
      }
    } else {
      behavior[field] = session[field] ?? null;
    }
  }

  return {
    session_id: session.id,
    email: session.email,
    persona_code: session.persona_code,
    matching_score: session.matching_score,
    identity,
    need,
    behavior,
  };
}

/* ============================================================
   WEIGHTS — dimensional weights mirror diagnostic-webhook scoring hierarchy
   Field-level weights are computed dynamically (equal weights by default
   inside each dimension) from the tenant's persona_dimension_mapping.
   ============================================================ */
const LEVEL_WEIGHTS = { identity: 0.25, need: 0.50, behavior: 0.25 };

function buildCriterionWeights(mapping: PersonaDimensionMapping): Record<string, Record<string, number>> {
  const equalWeight = (fields: string[]) => {
    const weights: Record<string, number> = {};
    if (fields.length === 0) return weights;
    const w = 1 / fields.length;
    for (const f of fields) weights[f] = w;
    return weights;
  };
  return {
    identity: equalWeight(mapping.identity),
    need: equalWeight(mapping.need),
    behavior: equalWeight(mapping.behavior),
  };
}

/* Compute weighted similarity score between two session profiles (0–1) */
function sessionSimilarity(a: Any, b: Any, criterionWeights: Record<string, Record<string, number>>): number {
  let score = 0;
  for (const [level, levelWeight] of Object.entries(LEVEL_WEIGHTS)) {
    const fieldWeights = criterionWeights[level];
    for (const [field, fieldWeight] of Object.entries(fieldWeights)) {
      const va = a[level]?.[field];
      const vb = b[level]?.[field];
      if (va === null || va === undefined || vb === null || vb === undefined) continue;
      if (String(va) === String(vb)) {
        score += levelWeight * fieldWeight;
      }
    }
  }
  return score;
}

/* Build NEED key for fast grouping (50% of total weight) — dynamic from mapping */
function needKey(s: Any, mapping: PersonaDimensionMapping): string {
  return mapping.need.map((f) => s.need?.[f] ?? "null").join("|");
}

/* Build IDENTITY key — dynamic from mapping.
   Uses at most the first 2 identity fields for granularity control. */
function identityKey(s: Any, mapping: PersonaDimensionMapping): string {
  const fieldsForKey = mapping.identity.slice(0, 2);
  return fieldsForKey.map((f) => s.identity?.[f] ?? "null").join("|");
}

/* Compute distribution of a field across sessions */
function fieldDistribution(sessions: Any[], level: string, field: string): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const s of sessions) {
    const v = s[level]?.[field];
    if (v === null || v === undefined) continue;
    const key = String(v);
    dist[key] = (dist[key] || 0) + 1;
  }
  return dist;
}

/* Get top-N values covering at least coveragePct% of sessions */
function topValues(dist: Record<string, number>, total: number, coveragePct = 0.70): string[] {
  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  const result: string[] = [];
  let covered = 0;
  for (const [val, cnt] of sorted) {
    result.push(val);
    covered += cnt;
    if (covered / total >= coveragePct) break;
  }
  return result;
}

/* Check whether a cluster profile already matches an existing persona (score >= 60%) */
function clusterMatchesExistingPersona(clusterProfile: Any, existingPersonas: Any[], mapping: PersonaDimensionMapping): boolean {
  for (const persona of existingPersonas) {
    const criteria = persona.criteria;
    let totalScore = 0;
    let blockedByRequired = false;

    // Build flat sessionValues from cluster dominant profile - dynamically from mapping
    const sv: Record<string, Any> = {};

    // Identity fields: stored as "field" (no prefix)
    for (const field of mapping.identity) {
      const dom = clusterProfile.identity?.[field]?.dominant;
      // Try to convert booleans and numbers stored as strings
      if (dom === "true") sv[field] = true;
      else if (dom === "false") sv[field] = false;
      else if (dom != null && !isNaN(Number(dom)) && dom !== "") sv[field] = Number(dom);
      else sv[field] = dom ?? null;
    }

    // Need fields: stored as "item.field" (prefixed) to distinguish from session-level fields
    for (const field of mapping.need) {
      const dom = clusterProfile.need?.[field]?.dominant;
      if (dom === "true") sv[`item.${field}`] = true;
      else if (dom === "false") sv[`item.${field}`] = false;
      else sv[`item.${field}`] = dom ?? null;
    }

    // Behavior fields: use topValues[0] (multi-value tolerant)
    for (const field of mapping.behavior) {
      sv[field] = clusterProfile.behavior?.[field]?.topValues?.[0] || null;
    }

    for (const level of ["identity", "need", "behavior"]) {
      const levelDef = criteria[level];
      if (!levelDef || !levelDef.criteria || levelDef.criteria.length === 0) continue;
      const levelWeight = levelDef.weight;
      let levelScore = 0;
      let levelTotalWeight = 0;

      for (const criterion of levelDef.criteria) {
        const sessionValue = sv[criterion.field];
        const cw = criterion.weight;
        levelTotalWeight += cw;
        if (criterion.values?.includes("any")) { levelScore += cw; continue; }
        if (sessionValue === null || sessionValue === undefined) {
          if (criterion.required === true) blockedByRequired = true;
          continue;
        }
        let matched = false;
        if (criterion.operator === "gte") matched = Number(sessionValue) >= Number(criterion.values[0]);
        else if (criterion.operator === "lte") matched = Number(sessionValue) <= Number(criterion.values[0]);
        else matched = criterion.values.some((v: Any) =>
          typeof sessionValue === "boolean" ? v === sessionValue : String(v) === String(sessionValue)
        );
        if (matched) levelScore += cw;
        else if (criterion.required === true) blockedByRequired = true;
      }
      if (blockedByRequired) break;
      if (levelTotalWeight > 0) totalScore += (levelScore / levelTotalWeight) * levelWeight;
    }

    const matchScore = blockedByRequired ? 0 : Math.round(totalScore * 100);
    if (matchScore >= 60) return true;
  }
  return false;
}

/* ============================================================
   findClusters — pairwise-inspired algorithm
   Strategy:
   1. Exclude sessions where less than 50% of NEED fields are filled
      (generic replacement for the Ouate-specific "exclude null skin_concern")
   2. Group by NEED profile (50% weight guarantee)
   3. Sub-group by IDENTITY
   4. Groups with NEED+IDENTITY identical have ≥75% similarity
   5. Validate each candidate against existing personas (score < 60%)
   ============================================================ */
function findClusters(sessions: Any[], existingPersonas: Any[], minSize: number, mapping: PersonaDimensionMapping, criterionWeights: Record<string, Record<string, number>>) {
  const candidates: Any[] = [];

  // Step 1: exclude sessions with too few NEED fields filled (generic completeness filter)
  // Require at least 50% (rounded up) of mapped NEED fields to be non-null
  const minNeedFieldsRequired = Math.max(1, Math.ceil(mapping.need.length * 0.5));
  const validSessions = sessions.filter((s) => {
    const filledCount = mapping.need.filter((f) => {
      const v = s.need?.[f];
      return v !== null && v !== undefined && v !== "";
    }).length;
    return filledCount >= minNeedFieldsRequired;
  });
  console.log(`[findClusters] ${sessions.length} sessions in, ${validSessions.length} with ≥${minNeedFieldsRequired}/${mapping.need.length} NEED fields set`);

  // Step 2: group by NEED profile
  const needGroups: Record<string, Any[]> = {};
  for (const s of validSessions) {
    const k = needKey(s, mapping);
    if (!needGroups[k]) needGroups[k] = [];
    needGroups[k].push(s);
  }

  for (const [nk, needGroup] of Object.entries(needGroups)) {
    if (needGroup.length < minSize) continue;

    // Step 3: sub-group by IDENTITY
    const idGroups: Record<string, Any[]> = {};
    for (const s of needGroup) {
      const k = identityKey(s, mapping);
      if (!idGroups[k]) idGroups[k] = [];
      idGroups[k].push(s);
    }

    for (const [ik, group] of Object.entries(idGroups)) {
      if (group.length < minSize) continue;

      // Compute actual avg intra-cluster similarity for reporting
      const sampleSize = Math.min(group.length, 30);
      const sample = group.slice(0, sampleSize);
      let simSum = 0;
      let simCount = 0;
      for (let i = 0; i < sample.length; i++) {
        for (let j = i + 1; j < sample.length; j++) {
          simSum += sessionSimilarity(sample[i], sample[j], criterionWeights);
          simCount++;
        }
      }
      const avgSim = simCount > 0 ? simSum / simCount : 0.75;

      // Step 4: build cluster profile dynamically from mapping
      const total = group.length;

      const buildFieldProfile = (level: string, field: string) => {
        const dist = fieldDistribution(group, level, field);
        const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
        const dominant = sorted[0]?.[0] ?? null;
        const dominantPct = sorted[0] ? Math.round((sorted[0][1] / total) * 100) : 0;
        const distribution: Record<string, number> = {};
        for (const [v, cnt] of sorted) distribution[v] = Math.round((cnt / total) * 100);
        return { dominant, dominantPct, distribution };
      };

      // Build profile sections dynamically from mapping
      const clusterProfile: Any = {
        identity: {},
        need: {},
        behavior: {},
      };
      for (const field of mapping.identity) {
        clusterProfile.identity[field] = buildFieldProfile("identity", field);
      }
      for (const field of mapping.need) {
        clusterProfile.need[field] = buildFieldProfile("need", field);
      }
      for (const field of mapping.behavior) {
        clusterProfile.behavior[field] = {
          ...buildFieldProfile("behavior", field),
          topValues: topValues(fieldDistribution(group, "behavior", field), total),
        };
      }

      // Step 5: verify cluster doesn't map to an existing persona
      if (clusterMatchesExistingPersona(clusterProfile, existingPersonas, mapping)) {
        console.log(`[findClusters] Cluster NEED=${nk} IDENTITY=${ik} (${total} sessions) → absorbed by existing persona, skip`);
        continue;
      }

      const sourcePersonas = [...new Set(group.map((s: Any) => s.persona_code))];
      candidates.push({
        session_ids: group.map((s: Any) => s.session_id),
        cluster_profile: clusterProfile,
        // Legacy common_criteria shape for buildCriteriaFromCluster compatibility
        common_criteria: buildLegacyCommonCriteria(clusterProfile, mapping),
        levels_covered: ["identity", "need", "behavior"],
        source_personas: sourcePersonas,
        current_avg_score: group.reduce((sum: number, s: Any) => sum + (s.matching_score || 0), 0) / total,
        estimated_avg_score: Math.round(avgSim * 100),
        need_key: nk,
        identity_key: ik,
      });

      console.log(`[findClusters] CLUSTER VALIDATED: NEED=${nk} IDENTITY=${ik} → ${total} sessions, avg_sim=${Math.round(avgSim * 100)}%`);
    }
  }

  return candidates;
}

/* Build legacy common_criteria shape (used by generatePersonaIdentity + buildCriteriaFromCluster) */
function buildLegacyCommonCriteria(profile: Any, mapping: PersonaDimensionMapping): Record<string, { value: Any; count: number; level: string }> {
  const result: Record<string, { value: Any; count: number; level: string }> = {};
  const addField = (level: string, field: string) => {
    const fp = profile[level]?.[field];
    if (fp?.dominant != null) {
      result[`${level}.${field}`] = { value: fp.dominant, count: fp.dominantPct, level };
    }
  };
  // Identity & Need: use dominant value
  for (const field of mapping.identity) addField("identity", field);
  for (const field of mapping.need) addField("need", field);
  // Behavior: use topValues[0] as dominant
  for (const field of mapping.behavior) {
    const fp = profile.behavior?.[field];
    if (fp?.topValues?.[0]) {
      result[`behavior.${field}`] = { value: fp.topValues[0], count: fp.dominantPct, level: "behavior" };
    }
  }
  return result;
}

function findSubClusters(sessions: Any[], persona: Any, existingPersonas: Any[], minSize: number, mapping: PersonaDimensionMapping, criterionWeights: Record<string, Record<string, number>>) {
  // Sub-cluster on each behavior field defined in the mapping
  const behaviorFields = mapping.behavior.map((f) => `behavior.${f}`);
  const candidates: Any[] = [];
  for (const field of behaviorFields) {
    const [level, fieldName] = field.split(".");
    const groups: Record<string, Any[]> = {};
    for (const s of sessions) {
      const value = String(s[level]?.[fieldName] ?? "NULL");
      if (value === "NULL") continue;
      if (!groups[value]) groups[value] = [];
      groups[value].push(s);
    }
    for (const [value, group] of Object.entries(groups)) {
      if (group.length >= minSize) {
        const subCluster = findClusters(group, existingPersonas, minSize, mapping, criterionWeights);
        if (subCluster.length > 0) {
          candidates.push({
            ...subCluster[0],
            source_personas: [persona.code],
            split_from: persona.code,
            distinguishing_criterion: { field, value },
          });
        }
      }
    }
  }
  return candidates;
}

/**
 * generatePersonaIdentity — generic, agnostic version
 *
 * Produces a default name + label + description for a newly-detected persona
 * based on the dominant values across all dimensions. The output is intentionally
 * neutral: clients can rename and enrich their personas in the dashboard UI.
 *
 * Naming strategy: pick a unique placeholder name from a generic pool. The
 * descriptive label/description summarizes the dominant traits of the cluster.
 */
function generatePersonaIdentity(cluster: Any, existingNames: string[]) {
  const profile = cluster.cluster_profile;
  const criteria = cluster.common_criteria || {};

  // Generic placeholder name pool (alphabetic, no semantic loading).
  // Clients can rename these in the dashboard.
  const namePool = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta",
                    "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi",
                    "Rho", "Sigma", "Tau", "Upsilon"];
  const available = namePool.filter((p) => !existingNames.includes(p));
  const name = available.length > 0 ? available[0] : `Auto${Date.now()}`;

  // Build a generic descriptive label from the dominant traits across all levels
  const dominantTraits: string[] = [];
  for (const [key, val] of Object.entries(criteria as Record<string, Any>)) {
    const v = (val as Any)?.value;
    if (v === null || v === undefined || v === "") continue;
    const fieldName = key.split(".")[1] || key;
    // Format: "fieldname: value"
    dominantTraits.push(`${fieldName}=${v}`);
  }
  const traitSummary = dominantTraits.slice(0, 3).join(", ");

  const label = `${name} — ${traitSummary || "auto-detected cluster"}`;
  const description = `Persona auto-detected from session clustering. Dominant traits: ${traitSummary || "(no dominant traits)"}. Edit name and description in the dashboard to reflect your brand voice.`;

  return { name, label, description };
}

function buildCriteriaFromCluster(cluster: Any, criterionWeights: Record<string, Record<string, number>>, mapping: PersonaDimensionMapping) {
  const common = cluster.common_criteria;
  const profile = cluster.cluster_profile;
  const identity_criteria: Any[] = [];
  const need_criteria: Any[] = [];
  const behavior_criteria: Any[] = [];

  // Required fields: by default, mark the FIRST need field as required
  // (it's typically the most discriminant criterion). This replaces the
  // Ouate-specific list of required fields.
  const requiredFields = new Set<string>();
  if (mapping.need.length > 0) requiredFields.add(mapping.need[0]);

  for (const [key, dom] of Object.entries(common as Record<string, Any>)) {
    const [level, field] = key.split(".");
    // Need fields use "item." prefix to distinguish from session-level fields
    const criterionField = level === "need" ? `item.${field}` : field;
    let value: Any = (dom as Any).value;
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (!isNaN(Number(value)) && value !== "") value = Number(value);

    // For BEHAVIOR: use topValues (multi-value) from cluster_profile if available
    let values: Any[] = [value];
    if (level === "behavior" && profile?.behavior?.[field]?.topValues?.length > 1) {
      values = profile.behavior[field].topValues.map((v: string) => {
        if (v === "true") return true;
        if (v === "false") return false;
        if (!isNaN(Number(v)) && v !== "") return Number(v);
        return v;
      });
    }

    // Lookup weight from dynamic criterionWeights map
    const weightMap = criterionWeights[level] || {};
    const w = weightMap[field] ?? 0.25;

    const criterion: Any = { field: criterionField, values, weight: w };
    if (requiredFields.has(field)) {
      criterion.required = true;
    }

    if (level === "identity") identity_criteria.push(criterion);
    else if (level === "need") need_criteria.push(criterion);
    else if (level === "behavior") behavior_criteria.push(criterion);
  }

  return {
    identity: { weight: LEVEL_WEIGHTS.identity, criteria: identity_criteria },
    need: { weight: LEVEL_WEIGHTS.need, criteria: need_criteria },
    behavior: { weight: LEVEL_WEIGHTS.behavior, criteria: behavior_criteria },
  };
}

async function getNextPersonaCode(supabase: Any) {
  const { data } = await supabase.from("personas").select("code").order("code", { ascending: false }).limit(20);
  if (!data || data.length === 0) return "P10";
  let maxNum = 9;
  for (const p of data) {
    const num = parseInt(p.code.replace("P", ""));
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return `P${maxNum + 1}`;
}

/* ============================================================
   SCORING ENGINE (identical to diagnostic-webhook)
   ============================================================ */
function computeScore(sessionData: Any, items: Any[], personas: Any[], mapping: PersonaDimensionMapping): { code: string; score: number } {
  const item1 = items.find((c: Any) => c.item_index === 0) || items[0];
  const item2 = items.find((c: Any) => c.item_index === 1);
  const item1Meta = item1?.item_metadata || {};
  const item2Meta = item2?.item_metadata || {};

  const sessionValues: Record<string, Any> = {};

  // Identity fields: from session top-level (no prefix)
  for (const field of mapping.identity) {
    sessionValues[field] = sessionData[field];
  }

  // Need fields: from item_metadata (prefixed "item.")
  for (const field of mapping.need) {
    sessionValues[`item.${field}`] = item1Meta[field];
  }

  // Generic "primary need field differs between item1 and item2" signal
  if (item1 && item2 && mapping.need.length > 0) {
    const primaryNeedField = mapping.need[0];
    sessionValues[`item.${primaryNeedField}_differs_from_item2`] =
      item1Meta[primaryNeedField] !== item2Meta[primaryNeedField];
  }

  // Behavior fields: from session top-level, with same ordered-list convention
  // as in extractCriteria (e.g., "priority_1" → "priorities_ordered" first element)
  for (const field of mapping.behavior) {
    const orderedMatch = field.match(/^(.+)_(\d+)$/);
    if (orderedMatch) {
      const basename = orderedMatch[1];
      const position = parseInt(orderedMatch[2], 10) - 1;
      const orderedColumn = `${basename.replace(/_1$|_\d+$/, "")}s_ordered`;
      const orderedValue = sessionData[orderedColumn] || sessionData[`${basename}_ordered`];
      if (typeof orderedValue === "string") {
        const parts = orderedValue.split(",").map((x: string) => x.trim());
        sessionValues[field] = parts[position] ?? null;
      } else {
        sessionValues[field] = sessionData[field];
      }
    } else {
      sessionValues[field] = sessionData[field];
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
        if (criterion.values.includes("any")) { levelScore += criterionWeight; continue; }
        if (sessionValue === null || sessionValue === undefined) {
          if (criterion.required === true) blockedByRequired = true;
          continue;
        }
        let matched = false;
        if (criterion.operator === "gte") matched = Number(sessionValue) >= Number(criterion.values[0]);
        else if (criterion.operator === "lte") matched = Number(sessionValue) <= Number(criterion.values[0]);
        else matched = criterion.values.some((v: Any) => typeof sessionValue === "boolean" ? v === sessionValue : String(v) === String(sessionValue));
        if (matched) levelScore += criterionWeight;
        else if (criterion.required === true) blockedByRequired = true;
      }
      if (blockedByRequired) break;
      if (levelTotalWeight > 0) {
        const contribution = (levelScore / levelTotalWeight) * levelWeight;
        totalScore += contribution;
        if (level === "need") needScores[persona.code] = Math.round((contribution * 100) / levelWeight);
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
      bestScore = score; bestCode = code; bestNeedScore = needScore;
    }
  }
  if (bestScore < 60) bestCode = "P0";
  return { code: bestCode, score: bestScore };
}

/* ============================================================
   PHASE G (standalone): Update session_count + avg_matching_score
   Runs at EVERY execution, independent of cluster detection.
   ============================================================ */
async function updateAllPersonaSessionCounts(supabase: Any): Promise<{ updated: number; counters: Record<string, number> }> {
  const personaCounts = await paginateQuery<{ persona_code: string | null; matching_score: number | null }>((from, to) =>
    supabase
      .from("diagnostic_sessions")
      .select("persona_code, matching_score")
      .eq("status", "termine")
      .range(from, to)
  );

  if (!personaCounts) return { updated: 0, counters: {} };

  const counters: Record<string, { cnt: number; sum: number }> = {};
  for (const s of personaCounts) {
    if (!s.persona_code) continue;
    if (!counters[s.persona_code]) counters[s.persona_code] = { cnt: 0, sum: 0 };
    counters[s.persona_code].cnt++;
    counters[s.persona_code].sum += s.matching_score || 0;
  }

  let updated = 0;
  for (const [code, { cnt, sum }] of Object.entries(counters)) {
    const { error } = await supabase.from("personas").update({
      session_count: cnt,
      avg_matching_score: cnt > 0 ? Math.round((sum / cnt) * 100) / 100 : 0,
    }).eq("code", code);
    if (!error) updated++;
  }

  // Also reset to 0 any active persona not present in the counts
  const { data: allActivePersonas } = await supabase
    .from("personas")
    .select("code")
    .eq("is_active", true)
    .eq("is_pool", false);

  for (const p of (allActivePersonas || [])) {
    if (!counters[p.code] && p.code !== "P0") {
      await supabase.from("personas").update({ session_count: 0, avg_matching_score: 0 }).eq("code", p.code);
    }
  }

  console.log(`[detect-persona-clusters] Phase G: Updated counters for ${updated} personas`);
  return { updated, counters: Object.fromEntries(Object.entries(counters).map(([k, v]) => [k, v.cnt])) };
}

/* ============================================================
   MAIN HANDLER
   ============================================================ */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const dry_run: boolean = body.dry_run ?? false;
    const min_cluster_size: number = body.min_cluster_size ?? 30;
    const min_split_size: number = body.min_split_size ?? 20;
    const max_persona_size: number = body.max_persona_size ?? 80;
    const weak_score_threshold: number = body.weak_score_threshold ?? 75;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const KLAVIYO_API_KEY = Deno.env.get("KLAVIYO_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load tenant configuration & dimension mapping that drives the entire algorithm
    const tenantConfig = await loadTenantConfig();
    const mapping = getDimensionMapping(tenantConfig);
    const criterionWeights = buildCriterionWeights(mapping);

    // Validate mapping is usable
    if (mapping.identity.length === 0 && mapping.need.length === 0 && mapping.behavior.length === 0) {
      throw new Error("tenant_config.persona_dimension_mapping is empty. Cannot run clustering without dimension fields. Configure mapping during onboarding.");
    }

    console.log(`[detect-persona-clusters] START — dry_run=${dry_run}, min_cluster=${min_cluster_size}, mapping={identity:${mapping.identity.length},need:${mapping.need.length},behavior:${mapping.behavior.length}}`);

    /* ── PHASE A: Load data ── */
    // Build session SELECT dynamically: identity & behavior fields come from session columns
    const sessionColumns = new Set<string>([
      "id", "email", "persona_code", "matching_score", "status",
      ...mapping.identity,
    ]);
    // Behavior fields: include both the field itself and its potential ordered-list source column
    for (const field of mapping.behavior) {
      sessionColumns.add(field);
      const orderedMatch = field.match(/^(.+)_(\d+)$/);
      if (orderedMatch) {
        const basename = orderedMatch[1].replace(/_1$|_\d+$/, "");
        sessionColumns.add(`${basename}s_ordered`);
        sessionColumns.add(`${basename}_ordered`);
      }
    }
    const sessionSelect = Array.from(sessionColumns).join(", ");

    const [{ data: personas }, rawSessions] = await Promise.all([
      supabase.from("personas").select("code, name, criteria, is_active, is_auto_created, auto_created_at, min_sessions").eq("is_active", true).eq("is_pool", false),
      paginateQuery((from, to) =>
        supabase.from("diagnostic_sessions").select(sessionSelect).eq("status", "termine").range(from, to)
      ),
    ]);

    if (!personas || !rawSessions) throw new Error("Failed to load personas or sessions");

    // Load ALL diagnostic_items via paginateQuery (replaces ad-hoc 2-page pagination capped at 2000)
    // diagnostic_items has a generic JSONB column item_metadata containing tenant-specific fields
    const itemsSelect = "session_id, item_index, item_metadata";
    const allItems = await paginateQuery((from, to) =>
      supabase.from("diagnostic_items").select(itemsSelect).range(from, to)
    );

    console.log(`[detect-persona-clusters] Loaded ${allItems.length} diagnostic_items rows`);

    // Attach items to sessions
    const itemsBySession: Record<string, Any[]> = {};
    for (const c of (allItems || [])) {
      if (!itemsBySession[c.session_id]) itemsBySession[c.session_id] = [];
      itemsBySession[c.session_id].push(c);
    }
    const allSessions = rawSessions.map((s: Any) => ({
      ...s,
      diagnostic_items: itemsBySession[s.id] || [],
    }));

    const sessionsWithItems = allSessions.filter((s: Any) => s.diagnostic_items.length > 0).length;
    console.log(`[detect-persona-clusters] Loaded ${allSessions.length} sessions, ${personas.length} personas, ${sessionsWithItems} with items`);

    /* ── PHASE G (early): Update session_count for ALL personas — runs every time ── */
    const { counters: earlyCounters } = await updateAllPersonaSessionCounts(supabase);
    console.log(`[detect-persona-clusters] Phase G (early): session counts = ${JSON.stringify(earlyCounters)}`);

    /* ── PHASE B: Detect clusters ── */
    const allDetected: Any[] = [];

    // B1: New clusters from P0 sessions
    const p0Sessions = allSessions.filter((s: Any) => s.persona_code === "P0" || !s.persona_code);
    if (p0Sessions.length >= min_cluster_size) {
      const p0Criteria = p0Sessions.map((s: Any) => extractCriteria(s, mapping));
      const clusters = findClusters(p0Criteria, personas, min_cluster_size, mapping, criterionWeights);
      for (const c of clusters) {
        allDetected.push({ ...c, type: "new_cluster" });
        console.log(`[detect-persona-clusters] NEW_CLUSTER detected: ${c.session_ids.length} sessions, NEED=${c.need_key}, IDENTITY=${c.identity_key}`);
      }
    }

    // B2: Split large personas
    for (const persona of personas) {
      const pSessions = allSessions.filter((s: Any) => s.persona_code === persona.code);
      if (pSessions.length > max_persona_size) {
        const pCriteria = pSessions.map((s: Any) => extractCriteria(s, mapping));
        const subClusters = findSubClusters(pCriteria, persona, personas, min_split_size, mapping, criterionWeights);
        for (const c of subClusters) {
          allDetected.push({ ...c, type: "split" });
          console.log(`[detect-persona-clusters] SPLIT detected from ${persona.code}: ${c.session_ids.length} sessions`);
        }
      }
    }

    // B3: Recombination of weak sessions
    const weakSessions = allSessions.filter((s: Any) => s.persona_code && s.persona_code !== "P0" && (s.matching_score || 0) < weak_score_threshold);
    if (weakSessions.length >= min_cluster_size) {
      // Cf. backlog #2.17 — call signature aligned with B1/B2: extractCriteria
      // requires `mapping`, findClusters requires `mapping` and `criterionWeights`.
      const weakCriteria = weakSessions.map((s: Any) => extractCriteria(s, mapping));
      const clusters = findClusters(weakCriteria, personas, min_cluster_size, mapping, criterionWeights);
      for (const c of clusters) {
        const currentAvg = c.current_avg_score;
        const estimatedAvg = c.estimated_avg_score;
        if (estimatedAvg - currentAvg >= 5) {
          allDetected.push({ ...c, type: "recombination" });
          console.log(`[detect-persona-clusters] RECOMBINATION detected: ${c.session_ids.length} sessions, score gain: ${estimatedAvg - currentAvg}`);
        }
      }
    }

    if (allDetected.length === 0) {
      await supabase.from("persona_detection_log").insert({
        detection_type: "scan_no_result",
        details: { p0_count: p0Sessions.length, total_sessions: allSessions.length, weak_count: weakSessions.length, session_counts_updated: earlyCounters },
        action_taken: "counters_updated",
        sessions_affected: 0,
      });
      console.log("[detect-persona-clusters] No clusters detected. Counters were updated.");
      return new Response(JSON.stringify({ success: true, detected: 0, dry_run, message: "Aucun cluster détecté — compteurs mis à jour", session_counts: earlyCounters }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (dry_run) {
      return new Response(JSON.stringify({
        success: true, dry_run: true,
        detected: allDetected.length,
        clusters: allDetected.map((c) => ({
          type: c.type,
          sessions: c.session_ids.length,
          source_personas: c.source_personas,
          levels: c.levels_covered,
          need_key: c.need_key,
          identity_key: c.identity_key,
          avg_similarity: c.estimated_avg_score,
          current_avg_score: Math.round(c.current_avg_score),
          cluster_profile: c.cluster_profile,
        })),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    /* ── PHASE C: Create personas ── */
    const { data: existingPersonasForNames } = await supabase.from("personas").select("name");
    const existingNames: string[] = (existingPersonasForNames || []).map((p: Any) => p.name);
    const personas_created: string[] = [];

    // Phase F first: deactivate stale auto personas
    const autoPersonas = personas.filter((p: Any) => p.is_auto_created);
    for (const ap of autoPersonas) {
      const { count } = await supabase.from("diagnostic_sessions").select("*", { count: "exact", head: true }).eq("persona_code", ap.code).eq("status", "termine");
      const daysSinceCreation = (Date.now() - new Date(ap.auto_created_at).getTime()) / 86400000;
      if ((count ?? 0) < 15 && daysSinceCreation > 30) {
        await supabase.from("personas").update({ is_active: false }).eq("code", ap.code);
        await supabase.from("persona_detection_log").insert({
          detection_type: "deactivation",
          details: { persona_code: ap.code, session_count: count, days_since_creation: Math.round(daysSinceCreation) },
          action_taken: "deactivated",
          persona_code_created: ap.code,
          sessions_affected: count ?? 0,
        });
        console.log(`[detect-persona-clusters] Deactivated stale persona ${ap.code}`);
      }
    }

    for (const cluster of allDetected) {
      const nextCode = await getNextPersonaCode(supabase);
      const { name, label, description } = generatePersonaIdentity(cluster, existingNames);
      const criteria = buildCriteriaFromCluster(cluster, criterionWeights, mapping);
      existingNames.push(name);

      const isExistingClientPersona = String(cluster.common_criteria["identity.is_existing_client"]?.value) === "true";

      await supabase.from("personas").insert({
        code: nextCode,
        name,
        full_label: label,
        description,
        criteria,
        is_active: true,
        is_pool: false,
        is_auto_created: true,
        auto_created_at: new Date().toISOString(),
        detection_source: cluster.type,
        source_personas: cluster.source_personas || null,
        session_count: cluster.session_ids.length,
        avg_matching_score: 0,
        min_sessions: 15,
        is_existing_client_persona: isExistingClientPersona,
      });

      await supabase.from("persona_detection_log").insert({
        detection_type: cluster.type,
        details: {
          common_criteria: cluster.common_criteria,
          session_count: cluster.session_ids.length,
          estimated_avg_score: cluster.estimated_avg_score,
          source_personas: cluster.source_personas,
          levels_covered: cluster.levels_covered,
        },
        action_taken: "created",
        persona_code_created: nextCode,
        sessions_affected: cluster.session_ids.length,
      });

      personas_created.push(nextCode);
      console.log(`[detect-persona-clusters] Created persona ${nextCode}: ${label}`);
    }

    /* ── PHASE D: Recalculate all sessions ── */
    let reassigned = 0;
    if (personas_created.length > 0) {
      const { data: allPersonasUpdated } = await supabase.from("personas").select("code, criteria").eq("is_active", true).eq("is_pool", false);
      if (allPersonasUpdated) {
        const BATCH = 50;
        const changedSessions: Array<{ id: string; persona_code: string; matching_score: number }> = [];

        for (let i = 0; i < allSessions.length; i += BATCH) {
          const batch = allSessions.slice(i, i + BATCH);
          for (const session of batch) {
            const items = session.diagnostic_items || [];
            const result = computeScore(session, items, allPersonasUpdated, mapping);
            if (result.code !== session.persona_code || result.score !== session.matching_score) {
              changedSessions.push({ id: session.id, persona_code: result.code, matching_score: result.score });
              reassigned++;
            }
          }
          await new Promise((r) => setTimeout(r, 100));
        }

        // Batch update
        for (const s of changedSessions) {
          await supabase.from("diagnostic_sessions").update({ persona_code: s.persona_code, matching_score: s.matching_score }).eq("id", s.id);
        }
        console.log(`[detect-persona-clusters] Reassigned ${reassigned} sessions`);
      }
    }

    /* ── PHASE E: Klaviyo sync for changed sessions ── */
    if (reassigned > 0) {
      // Reload updated sessions for Klaviyo
      const updatedSessions = await paginateQuery((from, to) =>
        supabase
          .from("diagnostic_sessions")
          .select("id, email, persona_code, matching_score, optin_email, optin_sms")
          .eq("status", "termine")
          .not("email", "is", null)
          .neq("email", "")
          .range(from, to)
      );

      if (updatedSessions && KLAVIYO_API_KEY) {
        const BATCH_K = 20;
        for (let i = 0; i < updatedSessions.length; i += BATCH_K) {
          const batch = updatedSessions.slice(i, i + BATCH_K);
          await Promise.all(
            batch.map(async (session: Any) => {
              try {
                const { data: pData } = await supabase.from("personas").select("full_label").eq("code", session.persona_code ?? "P0").maybeSingle();
                const properties = {
                  persona: pData?.full_label || session.persona_code || "Non attribué",
                  persona_code: session.persona_code,
                  matching_score: session.matching_score,
                  optin_email: session.optin_email ?? false,
                  optin_sms: session.optin_sms ?? false,
                };
                await fetch("https://a.klaviyo.com/api/profile-import/", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
                    "revision": "2024-02-15",
                  },
                  body: JSON.stringify({
                    data: {
                      type: "profile",
                      attributes: {
                        email: session.email.toLowerCase().trim(),
                        properties,
                      },
                    },
                  }),
                });
              } catch (err) {
                console.error(`[detect-persona-clusters] Klaviyo sync failed for ${session.email}:`, err);
              }
            })
          );
          await new Promise((r) => setTimeout(r, 200));
        }
        console.log(`[detect-persona-clusters] Klaviyo sync done for ${updatedSessions.length} profiles`);
      }
    }

    /* ── PHASE G (final): Re-update counters after reassignment ── */
    const { counters: finalCounters } = await updateAllPersonaSessionCounts(supabase);

    return new Response(JSON.stringify({
      success: true,
      dry_run,
      personas_created,
      clusters_detected: allDetected.length,
      sessions_reassigned: reassigned,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[detect-persona-clusters] Error:", err);
    reportEdgeFunctionError("detect-persona-clusters", err, { type: "cron_failure", severity: "critical" });
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
