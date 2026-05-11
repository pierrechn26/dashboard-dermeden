import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DiagnosticSession } from "@/types/diagnostic";
import type { DateRange } from "react-day-picker";

interface SessionsData {
  sessions: DiagnosticSession[];
  isLoading: boolean;
  error: Error | null;
}

export function useDiagnosticSessions(dateRange?: DateRange): SessionsData {
  const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchSessions() {
      try {
        const from = dateRange?.from?.toISOString();
        const to = dateRange?.to
          ? (() => {
              const endOfDay = new Date(dateRange.to);
              endOfDay.setHours(23, 59, 59, 999);
              return endOfDay.toISOString();
            })()
          : undefined;

        const { data, error: fnError } = await supabase.functions.invoke(
          "diagnostic-performance",
          { body: { includeDetails: true, from, to } }
        );

        if (fnError) throw fnError;
        if (!data) throw new Error("No data returned");

        if (isMounted) {
          setSessions(data.sessions || []);
          setError(null);
        }
      } catch (err) {
        console.error("[useDiagnosticSessions] Error:", err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("Unknown error"));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchSessions();

    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(fetchSessions, 120_000);

    return () => {
      isMounted = false;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [dateRange?.from?.toISOString(), dateRange?.to?.toISOString()]);

  return { sessions, isLoading, error };
}
