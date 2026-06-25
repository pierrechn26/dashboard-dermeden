import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { reportEdgeFunctionError } from "../_shared/reportEdgeFunctionError.ts";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const tenantConfig = await loadTenantConfig(supabase);
    const SHOPIFY_STORE = tenantConfig?.shopify_store_domain;

    // Try Admin API token first, fall back to Storefront token
    const ADMIN_TOKEN = Deno.env.get("SHOPIFY_ACCESS_TOKEN") || Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const STOREFRONT_TOKEN = Deno.env.get("SHOPIFY_STOREFRONT_ACCESS_TOKEN");

    if (!SHOPIFY_STORE) {
      console.warn("[sync] shopify_store_domain not configured in tenant_config. Skipping sync.");
      return new Response(JSON.stringify({ error: "shopify_store_domain not configured in tenant_config" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Prefer Admin API (REST) when available — works with shpca_ tokens
    // from OAuth authorization code flow. Falls back to Storefront GraphQL
    // if only a Storefront token is available.
    const useAdminApi = !!ADMIN_TOKEN;

    console.log(`[sync] Store: ${SHOPIFY_STORE} | Mode: ${useAdminApi ? "Admin REST API" : "Storefront GraphQL"}`);

    if (!ADMIN_TOKEN && !STOREFRONT_TOKEN) {
      return new Response(JSON.stringify({ error: "No Shopify API token configured (SHOPIFY_ACCESS_TOKEN or SHOPIFY_STOREFRONT_ACCESS_TOKEN)" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // deno-lint-ignore no-explicit-any
    let allProducts: any[] = [];

    if (useAdminApi) {
      // ── Admin REST API pagination ──
      let nextPageUrl: string | null = `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=250&status=active`;
      let pageCount = 0;
      const MAX_PAGES = 20;

      while (nextPageUrl && pageCount < MAX_PAGES) {
        pageCount++;
        const res = await fetch(nextPageUrl, {
          headers: { "X-Shopify-Access-Token": ADMIN_TOKEN! },
        });

        if (!res.ok) {
          const text = await res.text();
          console.error(`[sync] Admin API error (page ${pageCount}):`, res.status, text);
          break;
        }

        const json = await res.json();
        const products = json.products || [];
        allProducts = allProducts.concat(products);
        console.log(`[sync] Page ${pageCount}: fetched ${products.length} products (total: ${allProducts.length})`);

        // Parse Link header for cursor-based pagination
        const linkHeader = res.headers.get("link");
        nextPageUrl = null;
        if (linkHeader) {
          const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (nextMatch) nextPageUrl = nextMatch[1];
        }
      }

      console.log(`[sync] Total products fetched via Admin API: ${allProducts.length}`);

    } else {
      // ── Storefront GraphQL API (legacy path) ──
      const STOREFRONT_URL = `https://${SHOPIFY_STORE}/api/2024-01/graphql.json`;

      const query = `
        query GetAllProducts($cursor: String) {
          products(first: 250, after: $cursor) {
            edges {
              node {
                id
                title
                handle
                description
                productType
                vendor
                tags
                availableForSale
                publishedAt
                priceRange {
                  minVariantPrice { amount currencyCode }
                  maxVariantPrice { amount currencyCode }
                }
                variants(first: 50) {
                  edges {
                    node {
                      id
                      title
                      price { amount currencyCode }
                      sku
                      availableForSale
                    }
                  }
                }
                images(first: 10) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      let cursor: string | null = null;
      let pageCount = 0;
      const MAX_PAGES = 20;

      while (pageCount < MAX_PAGES) {
        pageCount++;
        const res = await fetch(STOREFRONT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN!,
          },
          body: JSON.stringify({ query, variables: { cursor } }),
        });

        if (!res.ok) {
          const text = await res.text();
          console.error(`[sync] Shopify API error (page ${pageCount}):`, res.status, text);
          break;
        }

        const json = await res.json();
        const products = json.data?.products;
        if (!products) {
          console.error("[sync] Unexpected response shape:", JSON.stringify(json).substring(0, 300));
          break;
        }

        allProducts = allProducts.concat(products.edges.map((e: any) => e.node));
        console.log(`[sync] Page ${pageCount}: fetched ${products.edges.length} products (total: ${allProducts.length})`);

        if (!products.pageInfo.hasNextPage) break;
        cursor = products.pageInfo.endCursor;
      }

      console.log(`[sync] Total products fetched via Storefront API: ${allProducts.length}`);
    }

    // Upsert each product into client_products
    let synced = 0;
    let errors_count = 0;

    for (const product of allProducts) {
      try {
        // Handle both Admin API (numeric id) and Storefront API (GID) formats
        const rawId = String(product.id);
        const shopifyId = rawId.replace("gid://shopify/Product/", "");

        // Admin API returns variants/images as arrays; Storefront returns edges
        const variants = Array.isArray(product.variants)
          ? product.variants.map((v: any) => ({
              id: String(v.id),
              title: v.title,
              price: parseFloat(v.price || "0"),
              sku: v.sku || "",
              available: v.inventory_quantity > 0,
            }))
          : (product.variants?.edges || []).map((e: any) => ({
              id: e.node.id,
              title: e.node.title,
              price: parseFloat(e.node.price?.amount || "0"),
              sku: e.node.sku || "",
              available: e.node.availableForSale,
            }));

        const images = Array.isArray(product.images)
          ? product.images.map((img: any) => ({
              src: img.src,
              alt: img.alt || product.title,
            }))
          : (product.images?.edges || []).map((e: any) => ({
              src: e.node.url,
              alt: e.node.altText || product.title,
            }));

        // Price range — Admin API has variants with price, Storefront has priceRange
        let priceMin: number, priceMax: number;
        if (product.priceRange) {
          priceMin = parseFloat(product.priceRange.minVariantPrice.amount);
          priceMax = parseFloat(product.priceRange.maxVariantPrice.amount);
        } else {
          const prices = variants.map((v: any) => v.price).filter((p: number) => p > 0);
          priceMin = prices.length > 0 ? Math.min(...prices) : 0;
          priceMax = prices.length > 0 ? Math.max(...prices) : 0;
        }

        const shopifyUrl = `https://${SHOPIFY_STORE}/products/${product.handle}`;

        const { error: upsertError } = await supabase.from("client_products").upsert({
          external_product_id: shopifyId,
          source_provider: "shopify",
          title: product.title,
          handle: product.handle,
          description: (product.body_html || product.description || "").substring(0, 500),
          product_type: product.product_type || product.productType || null,
          vendor: product.vendor || null,
          tags: Array.isArray(product.tags) ? product.tags : (product.tags || "").split(", ").filter(Boolean),
          price_min: priceMin,
          price_max: priceMax,
          currency: "EUR",
          variants,
          images,
          status: product.status === "active" || product.availableForSale ? "active" : "archived",
          published_at: product.published_at || product.publishedAt || null,
          external_url: shopifyUrl,
          synced_at: new Date().toISOString(),
        }, { onConflict: "external_product_id" });

        if (upsertError) {
          console.error(`Error upserting ${product.title}:`, upsertError.message);
          errors_count++;
        } else {
          synced++;
        }
      } catch (err) {
        console.error(`Error processing product ${product.id}:`, err);
        errors_count++;
      }
    }

    console.log(`[sync] Done: ${synced} synced, ${errors_count} errors`);

    return new Response(JSON.stringify({
      success: true,
      synced,
      errors: errors_count,
      total: allProducts.length,
      api: useAdminApi ? "admin" : "storefront",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("sync-shopify-products fatal error:", msg);
    reportEdgeFunctionError("sync-shopify-products", err, { type: "cron_failure", severity: "critical" });
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
