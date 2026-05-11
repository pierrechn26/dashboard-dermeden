import { createHmac } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain",
};

// Cf. backlog #2.18 — Determine if the converting customer is a returning client.
// Reads client_orders for prior orders with the same email (lowercased) created
// before the session itself. tenant_id filter aligns with Phase 1.2 multi-tenant
// defensive programming. Returns:
//   - true  : at least one prior order found
//   - false : no prior order found (genuine new client)
//   - null  : unable to determine (no email, no created_at, or DB error)
//
// Limitation: only sees orders the webhook itself recorded. Pre-installation
// orders are invisible. Migration to Shopify Admin Customers API is tracked
// in backlog #6.3.
// deno-lint-ignore no-explicit-any
async function checkIsExistingClientLocal(
  supabase: any,
  email: string | null | undefined,
  sessionCreatedAt: string | null | undefined,
  tenantId: string
): Promise<boolean | null> {
  if (!email || !sessionCreatedAt) return null;

  try {
    const { count, error } = await supabase
      .from("client_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("customer_email", email.toLowerCase())
      .lt("created_at", sessionCreatedAt);

    if (error) {
      console.error("[checkIsExistingClientLocal] DB error:", error);
      return null;
    }

    return (count ?? 0) > 0;
  } catch (err) {
    console.error("[checkIsExistingClientLocal] exception:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- HMAC verification ---
    const webhookSecret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("SHOPIFY_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
    if (!hmacHeader) {
      console.error("Missing HMAC header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.text();
    const hash = createHmac("sha256", webhookSecret)
      .update(body, "utf8")
      .digest("base64");

    if (hash !== hmacHeader) {
      console.error("Invalid HMAC signature");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const order = JSON.parse(body);
    console.log(`Processing order ${order.id} — email: ${order.email}`);

    // --- Supabase client with service role ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load tenant_id from tenant_config — required for client_orders.tenant_id
    // (NOT NULL since Phase 1.2) and for is_existing_client lookup (#2.18).
    const tenantConfig = await loadTenantConfig();
    const tenantId = tenantConfig.project_id;

    // Order-level derived fields
    const orderIdShopify = String(order.id);
    const totalPrice = parseFloat(order.total_price);
    const validatedProductsList = (order.line_items || [])
      .map((item: { title: string }) => item.title)
      .join(", ");
    const orderEmailLower = order.email ? String(order.email).toLowerCase() : null;

    // --- Look for _diag_session in line item properties ---
    const diagSession = (order.line_items || [])
      .flatMap((item: { properties?: Array<{ name: string; value: string }> }) => item.properties || [])
      .find((prop: { name: string; value: string }) => prop.name === "_diag_session")
      ?.value;

    let matched = false;
    let isFromDiagnostic = false;

    // Cf. backlog #2.9 — Stratégie C+ : SELECT loads the 6 protected fields plus
    // session_code, email, created_at, id (used for downstream logic).
    const PROTECTED_FIELDS_SELECT =
      "id, session_code, email, created_at, conversion, exit_type, validated_cart_amount, validated_products, upsells_converted, shopify_order_id";

    // Helper: applies the Stratégie C+ guard, then performs the conversion UPDATE
    // if the session is not yet converted. Returns true if a conversion update
    // happened, false if it was a no-op (already converted), null if there was
    // an error during the update.
    // deno-lint-ignore no-explicit-any
    const applyConversionToSession = async (matchedSession: any): Promise<{ updated: boolean; skipped: boolean }> => {
      // Stratégie C+ no-op guard
      if (matchedSession.conversion === true) {
        console.log(
          `[shopify-order-webhook] Session ${matchedSession.session_code} ` +
          `already converted (shopify_order_id=${matchedSession.shopify_order_id}). ` +
          `Skipping update of Shopify-protected fields. ` +
          `Incoming order: ${orderIdShopify}, totalPrice: ${totalPrice}.`
        );

        if (matchedSession.shopify_order_id &&
            matchedSession.shopify_order_id !== orderIdShopify) {
          console.warn(
            `[shopify-order-webhook] Order ID mismatch for session ` +
            `${matchedSession.session_code}: stored=${matchedSession.shopify_order_id}, ` +
            `incoming=${orderIdShopify}. Possible order edit or refund.`
          );
        }

        return { updated: false, skipped: true };
      }

      // First conversion — compute is_existing_client (#2.18) and write the
      // 6 Shopify-protected fields plus is_existing_client + updated_at.
      const isExistingClient = await checkIsExistingClientLocal(
        supabase,
        orderEmailLower,
        matchedSession.created_at,
        tenantId
      );

      const updatePayload: Record<string, unknown> = {
        conversion: true,
        exit_type: "converted",
        validated_cart_amount: totalPrice,
        validated_products: validatedProductsList,
        shopify_order_id: orderIdShopify,
        // upsells_converted is left untouched here: no logic in the template
        // computes which line items were upsells. The column exists (Phase
        // 2.C-prereq) so future tracking can populate it without schema change.
      };

      // Only overwrite is_existing_client if the helper returned a definitive
      // boolean — preserve any prior value (set by the diagnostic flow) when
      // the helper returns null (no email / DB error).
      if (isExistingClient !== null) {
        updatePayload.is_existing_client = isExistingClient;
      }

      const { error } = await supabase
        .from("diagnostic_sessions")
        .update(updatePayload)
        .eq("id", matchedSession.id);

      if (error) {
        console.error(`Error updating session ${matchedSession.session_code}:`, error);
        return { updated: false, skipped: false };
      }

      console.log(
        `✅ Session ${matchedSession.session_code} marked as converted ` +
        `(shopify_order_id=${orderIdShopify}, is_existing_client=${isExistingClient})`
      );
      return { updated: true, skipped: false };
    };

    // --- Direct match by session_code ---
    if (diagSession) {
      console.log(`Found _diag_session property: ${diagSession}`);
      isFromDiagnostic = true;

      const { data: existingSession } = await supabase
        .from("diagnostic_sessions")
        .select(PROTECTED_FIELDS_SELECT)
        .eq("session_code", diagSession)
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        const result = await applyConversionToSession(existingSession);
        matched = result.updated || result.skipped;

        if (result.skipped) {
          // Stratégie C+ structured no-op response (cf. backlog #2.9)
          return new Response(JSON.stringify({
            received: true,
            matched: true,
            skipped: true,
            reason: "session_already_converted",
            session_code: existingSession.session_code,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        console.log(`Session code ${diagSession} not found in database`);
      }
    }

    // --- Fallback by email (5-day window) ---
    // Email comparison is normalized to lowercase to align with diagnostic-webhook
    // which stores emails lowercased. Sessions already converted are filtered out
    // by the .eq("conversion", false) clause, so the Stratégie C+ no-op is not
    // reached here; we still call applyConversionToSession for consistency.
    if (!matched && orderEmailLower) {
      console.log(`No direct match, trying email fallback: ${orderEmailLower}`);

      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      const { data: sessions, error: fetchError } = await supabase
        .from("diagnostic_sessions")
        .select(PROTECTED_FIELDS_SELECT)
        .eq("email", orderEmailLower)
        .eq("conversion", false)
        .gte("created_at", fiveDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (fetchError) {
        console.error("Error fetching sessions by email:", fetchError);
      } else if (sessions && sessions.length > 0) {
        const result = await applyConversionToSession(sessions[0]);
        if (result.updated) {
          matched = true;
          isFromDiagnostic = true;
          console.log(`(matched via email fallback)`);
        }
      } else {
        console.log(`No matching session found for email ${orderEmailLower} in the last 5 days`);
      }
    }

    // --- ALWAYS upsert order into client_orders ---
    // Cf. Phase 2.C: payload column is `external_order_id` (renamed by
    // template_transformation_lot1.sql). `tenant_id` is NOT NULL since Phase
    // 1.2. The composite UNIQUE (tenant_id, external_order_id) (Phase 1.3)
    // is the conflict target — same external_order_id can exist across tenants
    // but is unique within a tenant.
    const { error: upsertError } = await supabase
      .from("client_orders")
      .upsert(
        {
          tenant_id: tenantId,
          external_order_id: orderIdShopify,
          order_number: order.name || String(order.order_number),
          total_price: totalPrice,
          currency: order.currency || "EUR",
          created_at: order.created_at || new Date().toISOString(),
          is_from_diagnostic: isFromDiagnostic,
          diagnostic_session_id: diagSession || null,
          customer_email: orderEmailLower,
          raw_payload: order,
        },
        { onConflict: "tenant_id,external_order_id" }
      );

    if (upsertError) {
      console.error("Error upserting client_order:", upsertError);
    } else {
      console.log(`✅ Order ${orderIdShopify} saved to client_orders (diag: ${isFromDiagnostic})`);
    }

    if (!matched) {
      console.log(`No diagnostic session matched for order ${orderIdShopify}`);
    }

    return new Response(
      JSON.stringify({ success: true, matched, isFromDiagnostic }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook processing error:", error);
    reportEdgeFunctionError("shopify-order-webhook", error, { type: "webhook_failure", severity: "error" });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
