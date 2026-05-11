import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addMonths, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";

// ── Plan config ────────────────────────────────────────────────────────────────
export type PlanType = "starter" | "growth" | "scale";

const PLAN_LIMITS: Record<PlanType, { sessions: number; aski: number; recos: number }> = {
  starter: { sessions: 500,    aski: 100,   recos: 24 },
  growth:  { sessions: 10_000, aski: 500,   recos: 60 },
  scale:   { sessions: 50_000, aski: 2_000, recos: 240 },
};

const NEXT_PLAN: Record<PlanType, PlanType | null> = {
  starter: "growth",
  growth:  "scale",
  scale:   null,
};

const PLAN_PRICE: Record<PlanType, string> = {
  starter: "€99/mois",
  growth:  "€199/mois",
  scale:   "€489/mois",
};

const PLAN_LABEL: Record<PlanType, string> = {
  starter: "Starter",
  growth:  "Growth",
  scale:   "Scale",
};

// ── Cache for org limits (5 minutes) ──────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
let limitsCache: { data: OrgLimitsResponse; fetchedAt: number } | null = null;

interface OrgLimitsResponse {
  plan: string;
  aski_limit: number;
  sessions_limit: number;
  recos_limit: number;
  source: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function frenchOrdinal(day: number): string {
  return day === 1 ? "1er" : `${day}`;
}

function renewalMonthly(): string {
  const next = addMonths(startOfMonth(new Date()), 1);
  return `${frenchOrdinal(1)} ${format(next, "MMMM yyyy", { locale: fr })}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface UsageAxis {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  isWarning: boolean;
  isExceeded: boolean;
  renewalDate: string;
}

interface UpgradeInfo {
  nextPlan: PlanType | null;
  nextPlanLabel: string;
  nextPlanPrice: string;
  sessionsGain: string;
  askiGain: string;
  recosGain: string;
}

export interface UsageLimits {
  plan: PlanType;
  sessions: UsageAxis;
  aski: UsageAxis;
  recos: UsageAxis;
  upgrade: UpgradeInfo;
  loading: boolean;
  refresh: () => Promise<void>;
}

function makeAxis(used: number, limit: number, renewalDate: string): UsageAxis {
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    percentage: Math.min(pct, 100),
    isWarning: pct >= 80 && pct < 100,
    isExceeded: pct >= 100,
    renewalDate,
  };
}

function makeUpgrade(plan: PlanType): UpgradeInfo {
  const nextPlan = NEXT_PLAN[plan];
  if (!nextPlan) {
    return {
      nextPlan: null,
      nextPlanLabel: "",
      nextPlanPrice: "",
      sessionsGain: "",
      askiGain: "",
      recosGain: "",
    };
  }
  const next = PLAN_LIMITS[nextPlan];
  return {
    nextPlan,
    nextPlanLabel: PLAN_LABEL[nextPlan],
    nextPlanPrice: PLAN_PRICE[nextPlan],
    sessionsGain: next.sessions.toLocaleString("fr-FR"),
    askiGain: next.aski.toLocaleString("fr-FR"),
    recosGain: String(next.recos),
  };
}

// ── Fetch limits from portal (via proxy edge function) ────────────────────────
async function fetchOrgLimits(): Promise<OrgLimitsResponse | null> {
  // Return cached data if still fresh
  if (limitsCache && Date.now() - limitsCache.fetchedAt < CACHE_TTL_MS) {
    return limitsCache.data;
  }

  try {
    const { data, error } = await supabase.functions.invoke("get-org-limits", {
      method: "POST",
    });

    if (error || !data || !data.plan) {
      console.warn("[useUsageLimits] get-org-limits failed, will use local fallback", error);
      return null;
    }

    const response = data as OrgLimitsResponse;
    limitsCache = { data: response, fetchedAt: Date.now() };
    return response;
  } catch (err) {
    console.warn("[useUsageLimits] get-org-limits network error", err);
    return null;
  }
}

// ── Fallback: read local client_plan ──────────────────────────────────────────
async function fetchLocalLimits(projectId: string) {
  const { data } = await supabase
    .from("client_plan")
    .select("plan, sessions_limit, aski_limit, recos_monthly_limit")
    .eq("project_id", projectId)
    .single();

  if (!data) return null;
  const d = data as any;
  return {
    plan: (d.plan || "scale") as PlanType,
    sessions: d.sessions_limit ?? PLAN_LIMITS.scale.sessions,
    aski: d.aski_limit ?? PLAN_LIMITS.scale.aski,
    recos: d.recos_monthly_limit ?? PLAN_LIMITS.scale.recos,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────
// projectId default: when not provided, the hook reads it from tenant_config
// via getProjectIdSync() (the cached value loaded by useTenantConfig).
// This avoids hardcoding any tenant slug in the template.
import { getProjectIdSync } from "./useTenantConfig";

export function useUsageLimits(projectId?: string): UsageLimits {
  const effectiveProjectId = projectId || getProjectIdSync();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanType>("scale");
  const [clientLimits, setClientLimits] = useState(PLAN_LIMITS.scale);
  const [sessionsUsed, setSessionsUsed] = useState(0);
  const [askiUsed, setAskiUsed] = useState(0);
  const [recosUsed, setRecosUsed] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const utcMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const utcNextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

      // Fetch limits from portal (with cache) + usage counts in parallel
      const [orgLimits, sessionCountRes, askiCountRes, recosCountRes] = await Promise.all([
        fetchOrgLimits(),

        supabase
          .from("diagnostic_sessions")
          .select("*", { count: "exact", head: true })
          .gte("created_at", utcMonthStart)
          .lt("created_at", utcNextMonthStart),

        supabase
          .from("aski_messages")
          .select("*", { count: "exact", head: true })
          .eq("role", "user")
          .gte("created_at", utcMonthStart)
          .lt("created_at", utcNextMonthStart),

        supabase
          .from("marketing_recommendations")
          .select("*", { count: "exact", head: true })
          .gte("generated_at", utcMonthStart)
          .lt("generated_at", utcNextMonthStart),
      ]);

      // Resolve limits: portal first, then local fallback
      let resolvedPlan: PlanType;
      let resolvedLimits: { sessions: number; aski: number; recos: number };

      if (orgLimits) {
        resolvedPlan = (orgLimits.plan as PlanType) || "scale";
        resolvedLimits = {
          sessions: orgLimits.sessions_limit,
          aski: orgLimits.aski_limit,
          recos: orgLimits.recos_limit,
        };
      } else {
        // Fallback to local client_plan
        const local = await fetchLocalLimits(effectiveProjectId);
        if (local) {
          resolvedPlan = local.plan;
          resolvedLimits = { sessions: local.sessions, aski: local.aski, recos: local.recos };
        } else {
          resolvedPlan = "scale";
          resolvedLimits = PLAN_LIMITS.scale;
        }
      }

      setPlan(resolvedPlan);
      setClientLimits(resolvedLimits);
      setSessionsUsed(sessionCountRes.count ?? 0);
      setAskiUsed(askiCountRes.count ?? 0);
      setRecosUsed(recosCountRes.count ?? 0);
    } catch (err) {
      console.error("[useUsageLimits]", err);
    } finally {
      setLoading(false);
    }
  }, [effectiveProjectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const renewalMonth = renewalMonthly();

  return {
    plan,
    sessions: makeAxis(sessionsUsed, clientLimits.sessions, renewalMonth),
    aski:     makeAxis(askiUsed,     clientLimits.aski,     renewalMonth),
    recos:    makeAxis(recosUsed,    clientLimits.recos,     renewalMonth),
    upgrade:  makeUpgrade(plan),
    loading,
    refresh: fetchData,
  };
}
