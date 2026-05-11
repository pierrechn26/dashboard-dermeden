import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PersonaPriorityStats {
  code: string;
  volume: number;
  conversions: number;
  convRate: number;
  aov: number;
  totalRevenue: number;
  optinEmailPct: number;
  multiChildrenPct: number;
  dominantAgeRange: string | null;
  avgChildAge: number | null;
}

export interface BestROI extends PersonaPriorityStats {
  valuePerSession: number;
}

export interface BestGrowth extends PersonaPriorityStats {
  caManquant: number;
}

export interface BestLTV extends PersonaPriorityStats {
  ltvScore: number;
  scoreAge: number;
  coeffMulti: number;
}

export interface PersonaPrioritiesData {
  globalConvRate: number;
  globalAOV: number;
  totalSessions: number;
  bestROI: BestROI | null;
  bestGrowth: BestGrowth | null;
  bestLTV: BestLTV | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePersonaPriorities(): PersonaPrioritiesData {
  const [data, setData] = useState<PersonaPrioritiesData>({
    globalConvRate: 0,
    globalAOV: 0,
    totalSessions: 0,
    bestROI: null,
    bestGrowth: null,
    bestLTV: null,
    isLoading: true,
    error: null,
  });
  

  useEffect(() => {
    async function fetchData() {
      setData((d) => ({ ...d, isLoading: true, error: null }));
      try {
        const { data: result, error } = await supabase.functions.invoke("persona-priorities");
        if (error) throw error;
        if (!result || result.status === "no_data") {
          setData((d) => ({ ...d, isLoading: false }));
          return;
        }
        setData({
          globalConvRate: result.globalConvRate,
          globalAOV: result.globalAOV,
          totalSessions: result.totalSessions,
          bestROI: result.bestROI,
          bestGrowth: result.bestGrowth,
          bestLTV: result.bestLTV,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        console.error("[usePersonaPriorities] Error:", err);
        setData((d) => ({ ...d, isLoading: false, error: err instanceof Error ? err : new Error("Unknown") }));
      }
    }

    fetchData();

    // Schedule next refresh at 00:01 French time (Europe/Paris)
    function msUntilNext0001() {
      const now = new Date();
      // Get current time in Paris
      const parisNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
      const target = new Date(parisNow);
      target.setHours(0, 1, 0, 0);
      if (target <= parisNow) target.setDate(target.getDate() + 1);
      // Convert back to local ms difference
      const diffParis = target.getTime() - parisNow.getTime();
      return diffParis;
    }

    let timeout: number | null = null;
    function scheduleNextRefresh() {
      const ms = msUntilNext0001();
      timeout = window.setTimeout(() => {
        fetchData();
        scheduleNextRefresh();
      }, ms);
    }
    scheduleNextRefresh();

    return () => { if (timeout) window.clearTimeout(timeout); };
  }, []);

  return data;
}
