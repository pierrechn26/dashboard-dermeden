import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DateRange } from 'react-day-picker';

interface DiagnosticResponse {
  id: string;
  session_id: string;
  created_at: string | null;
  child_name: string | null;
  child_age: number | null;
  parent_name: string | null;
  email: string | null;
  phone: string | null;
  email_optin: boolean | null;
  sms_optin: boolean | null;
  detected_persona: string | null;
  persona_confidence: number | null;
  persona_scores: Record<string, number> | null;
  answers: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  source_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

type PerformancePayload = {
  totalResponses: number;
  completedResponses: number;
  completionRate: number;
  emailOptinCount: number;
  smsOptinCount: number;
  doubleOptinCount: number;
  emailOptinRate: number;
  smsOptinRate: number;
  personaDistribution: Array<{ name: string; count: number; percentage: number }>;
  funnel: {
    started: number;
    completed: number;
    optinEmail: number;
    recommendation: number;
    addToCart: number;
    checkout: number;
    purchase: number;
    avgDurationSeconds: number | null;
    avgOrderAmount: number | null;
  };
  detailedFunnel: Array<{ label: string; count: number }>;
  responses: Array<{
    id: string;
    created_at: string | null;
    child_name: string | null;
    child_age: number | null;
    detected_persona: string | null;
    email_optin: boolean | null;
    sms_optin: boolean | null;
  }>;
};

type SessionRow = {
  id: string;
  created_at: string | null;
  user_name: string | null;
  persona_code: string | null;
  matching_score: number | null;
  optin_email: boolean | null;
  optin_sms: boolean | null;
};

interface DiagnosticStats {
  // Compteurs principaux
  totalResponses: number;
  completedResponses: number;
  completionRate: number;
  
  // Opt-ins
  emailOptinCount: number;
  smsOptinCount: number;
  doubleOptinCount: number;
  emailOptinRate: number;
  smsOptinRate: number;
  
  // Personas
  personaDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;

  // Funnel
  funnel: {
    started: number;
    completed: number;
    optinEmail: number;
    recommendation: number;
    addToCart: number;
    checkout: number;
    purchase: number;
    avgDurationSeconds: number | null;
    avgOrderAmount: number | null;
  };
  
  // Detailed diagnostic funnel
  detailedFunnel: Array<{ label: string; count: number }>;
  
  // Données brutes (depuis diagnostic_sessions)
  responses: Array<{
    id: string;
    created_at: string | null;
    user_name: string | null;
    persona_code: string | null;
    matching_score: number | null;
    optin_email: boolean | null;
    optin_sms: boolean | null;
  }>;
  
  // État
  isLoading: boolean;
  error: Error | null;
}

export function useDiagnosticStats(dateRange?: DateRange): DiagnosticStats {
  const [responses, setResponses] = useState<SessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [serverStats, setServerStats] = useState<Omit<DiagnosticStats,
    'responses' | 'isLoading' | 'error'
  > | null>(null);

  const pollRef = useRef<number | null>(null);

  // Récupérer les métriques depuis une fonction backend (évite les soucis RLS + ne renvoie pas de PII)
  useEffect(() => {
    async function fetchPerformance() {
      setIsLoading(true);
      setError(null);

      try {
        // Normalise les dates en bornes UTC strictes (minuit UTC) pour éviter
        // tout décalage timezone client (Europe/Paris UTC+1/+2).
        // Ex: startOfMonth en heure locale = 2026-02-28T23:00Z → capture des sessions du mois précédent.
        const from = dateRange?.from
          ? new Date(Date.UTC(
              dateRange.from.getFullYear(),
              dateRange.from.getMonth(),
              dateRange.from.getDate(),
              0, 0, 0, 0
            )).toISOString()
          : undefined;
        const to = dateRange?.to
          ? new Date(Date.UTC(
              dateRange.to.getFullYear(),
              dateRange.to.getMonth(),
              dateRange.to.getDate(),
              23, 59, 59, 999
            )).toISOString()
          : undefined;

        const { data, error: fnError } = await supabase.functions.invoke<PerformancePayload>(
          'diagnostic-performance',
          { body: { from, to } }
        );

        if (fnError) throw fnError;
        if (!data) throw new Error('No data returned from diagnostic-performance');

          setServerStats({
            totalResponses: data.totalResponses,
            completedResponses: data.completedResponses,
            completionRate: data.completionRate,
            emailOptinCount: data.emailOptinCount,
            smsOptinCount: data.smsOptinCount,
            doubleOptinCount: data.doubleOptinCount ?? 0,
            emailOptinRate: data.emailOptinRate,
            smsOptinRate: data.smsOptinRate,
            personaDistribution: data.personaDistribution,
            funnel: data.funnel ?? { started: 0, completed: 0, optinEmail: 0, recommendation: 0, addToCart: 0, checkout: 0, purchase: 0, avgDurationSeconds: null, avgOrderAmount: null },
            detailedFunnel: data.detailedFunnel ?? [],
          });

        // Fetch recent completed sessions for the responses table (uses new columns)
        const sessionQuery = supabase
          .from("diagnostic_sessions")
          .select("id, created_at, user_name, persona_code, matching_score, optin_email, optin_sms")
          .eq("status", "termine")
          .order("created_at", { ascending: false })
          .limit(20);
        if (from) sessionQuery.gte("created_at", from);
        if (to) sessionQuery.lte("created_at", to);
        const { data: sessionRows } = await sessionQuery;
        setResponses(sessionRows ?? []);
      } catch (err) {
        console.error('[useDiagnosticStats] Error fetching performance:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    }

    // initial
    fetchPerformance();

    // poll (simple + reliable)
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(fetchPerformance, 120000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [dateRange?.from?.toISOString(), dateRange?.to?.toISOString()]);

  // Calculer les statistiques
  const stats = useMemo(() => {
    const totalResponses = serverStats?.totalResponses ?? 0;
    const completedResponses = serverStats?.completedResponses ?? 0;
    const completionRate = serverStats?.completionRate ?? 0;
    const emailOptinCount = serverStats?.emailOptinCount ?? 0;
    const smsOptinCount = serverStats?.smsOptinCount ?? 0;
    const doubleOptinCount = serverStats?.doubleOptinCount ?? 0;
    const emailOptinRate = serverStats?.emailOptinRate ?? 0;
    const smsOptinRate = serverStats?.smsOptinRate ?? 0;
    const personaDistribution = serverStats?.personaDistribution ?? [];
    const funnel = serverStats?.funnel ?? { started: 0, completed: 0, optinEmail: 0, recommendation: 0, addToCart: 0, checkout: 0, purchase: 0, avgDurationSeconds: null, avgOrderAmount: null };
    const detailedFunnel = serverStats?.detailedFunnel ?? [];

    return {
      totalResponses,
      completedResponses,
      completionRate,
      emailOptinCount,
      smsOptinCount,
      doubleOptinCount,
      emailOptinRate,
      smsOptinRate,
      personaDistribution,
      funnel,
      detailedFunnel,
      responses,
      isLoading,
      error,
    };
  }, [responses, isLoading, error, serverStats]);

  return stats;
}
