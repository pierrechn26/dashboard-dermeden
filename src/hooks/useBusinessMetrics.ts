import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { paginateQuery } from "@/utils/paginateSupabase";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import type { DateRange } from "react-day-picker";
import { subDays, format } from "date-fns";

interface BusinessMetricsData {
  // Diagnostic data (from diagnostic_sessions — single source of truth)
  revenueDiag: number;
  aovDiag: number;
  orderCountDiag: number;

  // Non-diagnostic data (from client_orders)
  revenueNonDiag: number;
  aovNonDiag: number;
  orderCountNonDiag: number;

  // Totals
  revenueTotal: number;
  orderCountTotal: number;

  // GA4 data for conversion rates
  siteSessions: number;
  diagnosticPageViews: number;

  isLoading: boolean;
}

export function useBusinessMetrics(dateRange?: DateRange): BusinessMetricsData {
  const { config: tenantConfig } = useTenantConfig();
  const tenantId = tenantConfig?.project_id;

  const [data, setData] = useState<BusinessMetricsData>({
    revenueDiag: 0,
    aovDiag: 0,
    orderCountDiag: 0,
    revenueNonDiag: 0,
    aovNonDiag: 0,
    orderCountNonDiag: 0,
    revenueTotal: 0,
    orderCountTotal: 0,
    siteSessions: 0,
    diagnosticPageViews: 0,
    isLoading: true,
  });

  useEffect(() => {
    // Cf. backlog #3.4 — gate on tenantId so the .eq("tenant_id", ...)
    // filter sees a real value (not the cache miss "default").
    if (!tenantId) return;

    const fetchData = async () => {
      setData((d) => ({ ...d, isLoading: true }));

      const from = dateRange?.from ?? subDays(new Date(), 29);
      const toRaw = dateRange?.to ?? new Date();
      // Align with useDiagnosticStats: include the full end day
      const to = new Date(toRaw);
      to.setHours(23, 59, 59, 999);

      const fromISO = from.toISOString();
      const toISO = to.toISOString();

      // The supabase chain is cast to `any` to keep TS type inference under
      // its recursion ceiling (TS2589 fires when we chain too many builders
      // + a generic on paginateQuery). Runtime behaviour unchanged.
      const allOrdersList = await paginateQuery<{ total_price: number | null; is_from_diagnostic: boolean | null }>(
        (from_idx, to_idx) =>
          (supabase as any)
            .from("client_orders")
            .select("total_price, is_from_diagnostic")
            .eq("tenant_id", tenantId)
            .gt("total_price", 0)
            .gte("created_at", fromISO)
            .lte("created_at", toISO)
            .order("created_at", { ascending: true })
            .range(from_idx, to_idx)
      );



      // GA4 data for conversion rate denominators
      const startDate = format(from, "yyyy-MM-dd");
      const endDate = format(to, "yyyy-MM-dd");
      let siteSessions = 0;
      let diagnosticPageViews = 0;

      try {
        const { data: ga4Data, error: ga4Error } = await supabase.functions.invoke("ga4-analytics", {
          body: { start_date: startDate, end_date: endDate },
        });
        if (!ga4Error && ga4Data) {
          siteSessions = ga4Data.site_sessions || 0;
          diagnosticPageViews = ga4Data.diagnostic_page_sessions || 0;
        }
      } catch (err) {
        console.error("GA4 fetch error in useBusinessMetrics:", err);
      }

      // allOrders already contains the paginated results

      // Diagnostic metrics from client_orders
      const diagOrders = allOrdersList.filter((o: any) => o.is_from_diagnostic);
      const orderCountDiag = diagOrders.length;
      const revenueDiag = diagOrders.reduce(
        (s, o) => s + (Number(o.total_price) || 0),
        0
      );
      const aovDiag = orderCountDiag > 0 ? revenueDiag / orderCountDiag : 0;

      // Non-diagnostic metrics from client_orders
      const nonDiag = allOrdersList.filter((o: any) => !o.is_from_diagnostic);
      const orderCountNonDiag = nonDiag.length;
      const revenueNonDiag = nonDiag.reduce(
        (s, o) => s + (Number(o.total_price) || 0),
        0
      );
      const aovNonDiag = orderCountNonDiag > 0 ? revenueNonDiag / orderCountNonDiag : 0;

      // Total
      const orderCountTotal = allOrdersList.length;
      const revenueTotal = allOrdersList.reduce(
        (s, o) => s + (Number(o.total_price) || 0),
        0
      );

      setData({
        revenueDiag,
        aovDiag,
        orderCountDiag,
        revenueNonDiag,
        aovNonDiag,
        orderCountNonDiag,
        revenueTotal,
        orderCountTotal,
        siteSessions,
        diagnosticPageViews,
        isLoading: false,
      });
    };

    fetchData();
  }, [dateRange?.from?.getTime(), dateRange?.to?.getTime(), tenantId]);

  return data;
}
