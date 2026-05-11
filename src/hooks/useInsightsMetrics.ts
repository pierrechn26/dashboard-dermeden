import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { paginateQuery } from "@/utils/paginateSupabase";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import type { DateRange } from "react-day-picker";
import { subDays } from "date-fns";

interface InsightsData {
  routineCompletePercent: number;
  ecartPanier: number | null;
  topProduct: string | null;
  topProductCount: number;
  clientsExistantsPercent: number;
  isLoading: boolean;
}

export function useInsightsMetrics(dateRange?: DateRange): InsightsData {
  const { config: tenantConfig } = useTenantConfig();
  const tenantId = tenantConfig?.project_id;

  const [data, setData] = useState<InsightsData>({
    routineCompletePercent: 0,
    ecartPanier: null,
    topProduct: null,
    topProductCount: 0,
    clientsExistantsPercent: 0,
    isLoading: true,
  });

  useEffect(() => {
    // Cf. backlog #3.4 — defensive tenant_id gating: do not fire queries
    // until tenant_config is loaded; otherwise the .eq("tenant_id", ...)
    // filter would race against the cache and return zero rows.
    if (!tenantId) return;

    const fetch = async () => {
      setData((d) => ({ ...d, isLoading: true }));

      const from = dateRange?.from ?? subDays(new Date(), 29);
      const toRaw = dateRange?.to ?? new Date();
      const to = new Date(toRaw);
      to.setHours(23, 59, 59, 999);
      const fromISO = from.toISOString();
      const toISO = to.toISOString();

      // Cf. backlog #3.2 — added session_code so we can join client_orders by
      // diagnostic_session_id (which stores session_code, not the UUID).
      const sessions = await paginateQuery<{
        session_code: string;
        recommended_products: string | null;
        validated_products: string | null;
        is_existing_client: boolean | null;
        recommended_cart_amount: number | null;
        conversion: boolean | null;
      }>((from, to) =>
        supabase
          .from("diagnostic_sessions")
          .select("session_code, recommended_products, validated_products, is_existing_client, recommended_cart_amount, conversion")
          .eq("status", "termine")
          .gte("created_at", fromISO)
          .lte("created_at", toISO)
          .range(from, to)
      );

      // Cf. backlog #3.4 — client_orders filtered by tenant_id (NOT NULL since
      // Phase 1.2). Returns total_price + raw_payload (used by K1 below for
      // line_items count) + diagnostic_session_id (used to join sessions).
      // Cast to `any` keeps the chain depth under TS2589 (cf.
      // useBusinessMetrics for the same pattern).
      const diagOrders = await paginateQuery<{
        total_price: number | null;
        diagnostic_session_id: string | null;
        raw_payload: { line_items?: unknown[] } | null;
      }>((from, to) =>
        (supabase as any)
          .from("client_orders")
          .select("total_price, diagnostic_session_id, raw_payload")
          .eq("tenant_id", tenantId)
          .eq("is_from_diagnostic", true)
          .gt("total_price", 0)
          .gte("created_at", fromISO)
          .lte("created_at", toISO)
          .range(from, to)
      );

      const list = sessions || [];

      // Helper : split rétrocompatible — supporte " | " (nouveau) et ", " (ancien)
      // Le split sur ", " (virgule+espace) évite de couper "1,2,3" dans les noms de produits
      const splitProducts = (str: string): string[] => {
        if (str.includes(" | ")) return str.split(" | ").map(p => p.trim()).filter(Boolean);
        return str.split(", ").map(p => p.trim()).filter(Boolean);
      };

      // Cf. backlog #3.2 — build a session_code → line_items_count map from
      // client_orders.raw_payload.line_items (the authoritative purchased
      // products). Falls back to validated_products CSV split when the order
      // pre-dates the raw_payload capture (legacy data).
      const lineItemsCountBySession: Record<string, number> = {};
      for (const o of diagOrders) {
        const sid = o.diagnostic_session_id;
        if (!sid) continue;
        const lineItems = o.raw_payload?.line_items;
        if (Array.isArray(lineItems)) {
          // Take the max if a session somehow has multiple orders (refund/edit)
          lineItemsCountBySession[sid] = Math.max(
            lineItemsCountBySession[sid] ?? 0,
            lineItems.length
          );
        }
      }

      // 1. Routine complète (K1) — % of CONVERTED sessions whose matched order
      // contains ≥ 3 purchased products. Source primaire: line_items count from
      // raw_payload. Fallback: validated_products CSV.
      const convertedSessions = list.filter((s) => s.conversion);
      const routineCount = convertedSessions.filter((s) => {
        const lineItemsCount = lineItemsCountBySession[s.session_code] ?? null;
        if (lineItemsCount !== null) {
          return lineItemsCount >= 3;
        }
        if (!s.validated_products) return false;
        return splitProducts(s.validated_products).length >= 3;
      }).length;
      const routineCompletePercent =
        convertedSessions.length > 0
          ? (routineCount / convertedSessions.length) * 100
          : 0;

      // 2. Écart panier (only on actual orders)
      const avgOrderPrice =
        diagOrders.length > 0
          ? diagOrders.reduce((s, o) => s + (Number(o.total_price) || 0), 0) / diagOrders.length
          : null;

      const convertedWithCart = list.filter(
        (s) => s.conversion && s.recommended_cart_amount != null
      );
      const avgRecommended =
        convertedWithCart.length > 0
          ? convertedWithCart.reduce((s, o) => s + (Number(o.recommended_cart_amount) || 0), 0) /
            convertedWithCart.length
          : null;

      const ecartPanier =
        avgOrderPrice != null && avgRecommended != null
          ? avgOrderPrice - avgRecommended
          : null;

      // 3. Top produit ACHETÉ (from validated_products on converted sessions)
      const productCounts: Record<string, number> = {};
      list.forEach((s) => {
        if (!s.conversion || !s.validated_products) return;
        splitProducts(s.validated_products).forEach((p) => {
          if (p) productCounts[p] = (productCounts[p] || 0) + 1;
        });
      });
      let topProduct: string | null = null;
      let topProductCount = 0;
      for (const [name, count] of Object.entries(productCounts)) {
        if (count > topProductCount) {
          topProduct = name;
          topProductCount = count;
        }
      }

      // 4. Nouveaux clients parmi les commandes diagnostic (K2)
      // Cf. backlog #3.3 — only sessions with a known is_existing_client value
      // (true OR false) count toward the denominator. NULL means "we couldn't
      // determine" (no email, lookup failed) and must not be conflated with
      // "new client" (false).
      const sessionsWithKnownStatus = convertedSessions.filter(
        (s) => s.is_existing_client !== null && s.is_existing_client !== undefined
      );
      const newClientsCount = sessionsWithKnownStatus.filter(
        (s) => s.is_existing_client === false
      ).length;
      const newClientsPercent =
        sessionsWithKnownStatus.length > 0
          ? (newClientsCount / sessionsWithKnownStatus.length) * 100
          : 0;

      setData({
        routineCompletePercent,
        ecartPanier,
        topProduct,
        topProductCount,
        clientsExistantsPercent: newClientsPercent,
        isLoading: false,
      });
    };

    fetch();
  }, [dateRange?.from?.getTime(), dateRange?.to?.getTime(), tenantId]);

  return data;
}
