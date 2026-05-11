import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DateRange } from "react-day-picker";

export interface PersonaTopItem {
  value: string;
  count: number;
  pct: number;
}

export interface PersonaProduct {
  name: string;
  count: number;
  pct: number;
}

export interface PersonaStat {
  code: string;
  name: string;
  subtitle: string;
  count: number;
  percentage: number;
  profile: {
    ageRangeTop: PersonaTopItem[];
    childCountDist: PersonaTopItem[];
    multiChildrenPct: number;
    reactivityTop: PersonaTopItem[];
    excludeFragrancePct: number;
    deviceTop: PersonaTopItem[];
  } | null;
  psychology: {
    priorityFirst: PersonaTopItem | null;
    priorityTop3: PersonaTopItem[];
    trustFirst: PersonaTopItem | null;
    trustTop3: PersonaTopItem[];
    routineSizeDist: PersonaTopItem[];
  } | null;
  behavior: {
    durationAvgSeconds: number | null;
    engagementAvg: number | null;
    formatTop: PersonaTopItem[];
    optinEmailPct: number;
    optinSmsPct: number;
  } | null;
  topProducts: PersonaProduct[];
  business: {
    conversions: number;
    revenue: number;
    aov: number;
    recommendedCartAvg: number | null;
    ecartPanier: number | null;
    ecartPanierPct: number | null;
    aovVsGlobal: number | null;
  } | null;
  insights: string[];
}

export interface PersonaStatsData {
  totalCompleted: number;
  globalAvg: {
    conversionRate: number;
    aov: number;
    engagement: number;
  };
  personas: PersonaStat[];
  isLoading: boolean;
  error: Error | null;
}

export function usePersonaStats(dateRange?: DateRange): PersonaStatsData {
  const [data, setData] = useState<PersonaStatsData>({
    totalCompleted: 0,
    globalAvg: { conversionRate: 0, aov: 0, engagement: 0 },
    personas: [],
    isLoading: true,
    error: null,
  });
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    async function fetch() {
      setData((d) => ({ ...d, isLoading: true, error: null }));
      try {
        const from = dateRange?.from?.toISOString();
        const to = dateRange?.to
          ? (() => { const d = new Date(dateRange.to); d.setHours(23, 59, 59, 999); return d.toISOString(); })()
          : undefined;

        const { data: result, error } = await supabase.functions.invoke("persona-stats", {
          body: { from, to },
        });
        if (error) throw error;
        if (!result) throw new Error("No data");

        setData({
          totalCompleted: result.totalCompleted,
          globalAvg: result.globalAvg,
          personas: result.personas,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        console.error("[usePersonaStats] Error:", err);
        setData((d) => ({ ...d, isLoading: false, error: err instanceof Error ? err : new Error("Unknown") }));
      }
    }

    fetch();
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(fetch, 120000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [dateRange?.from?.toISOString(), dateRange?.to?.toISOString()]);

  return data;
}
