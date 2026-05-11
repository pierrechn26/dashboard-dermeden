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
    // Read Shopify domain from tenant_config (no hardcoded store URL)
    const tenantConfig = await loadTenantConfig(supabase);
    const SHOPIFY_STORE = tenantConfig?.shopify_store_domain;
    const STOREFRONT_TOKEN = Deno.env.get("SHOPIFY_STOREFRONT_ACCESS_TOKEN");

    if (!SHOPIFY_STORE) {
      console.warn("[sync] shopify_store_domain not configured in tenant_config. Skipping sync.");
      return new Response(JSON.stringify({ error: "shopify_store_domain not configured in tenant_config" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[sync] Store: ${SHOPIFY_STORE} | Storefront token present: ${!!STOREFRONT_TOKEN} | prefix: ${STOREFRONT_TOKEN?.substring(0, 8)}`);

    if (!STOREFRONT_TOKEN) {
      return new Response(JSON.stringify({ error: "SHOPIFY_STOREFRONT_ACCESS_TOKEN manquant" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

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

    // Paginated fetch of all products
    let allProducts: any[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    const MAX_PAGES = 20; // safety: 20 × 250 = 5000 products max

    while (pageCount < MAX_PAGES) {
      pageCount++;
      const res = await fetch(STOREFRONT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
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

    console.log(`[sync] Total products fetched: ${allProducts.length}`);

    // Upsert each product into client_products
    let synced = 0;
    let errors_count = 0;

    for (const product of allProducts) {
      try {
        // Extract Shopify numeric ID from GID
        const shopifyId = product.id.replace("gid://shopify/Product/", "");

        const variants = product.variants.edges.map((e: any) => ({
          id: e.node.id,
          title: e.node.title,
          price: parseFloat(e.node.price?.amount || "0"),
          sku: e.node.sku || "",
          available: e.node.availableForSale,
        }));

        const images = product.images.edges.map((e: any) => ({
          src: e.node.url,
          alt: e.node.altText || product.title,
        }));

        // Public product URL — uses the Shopify store domain.
        // If the store has a custom domain, Shopify auto-redirects from myshopify.com.
        const shopifyUrl = `https://${SHOPIFY_STORE}/products/${product.handle}`;

        const { error: upsertError } = await supabase.from("client_products").upsert({
          shopify_product_id: shopifyId,
          title: product.title,
          handle: product.handle,
          description: (product.description || "").substring(0, 500),
          product_type: product.productType || null,
          vendor: product.vendor || null,
          tags: product.tags || [],
          price_min: parseFloat(product.priceRange.minVariantPrice.amount),
          price_max: parseFloat(product.priceRange.maxVariantPrice.amount),
          variants,
          images,
          status: product.availableForSale ? "active" : "archived",
          published_at: product.publishedAt || null,
          shopify_url: shopifyUrl,
          synced_at: new Date().toISOString(),
        }, { onConflict: "shopify_product_id" });

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
