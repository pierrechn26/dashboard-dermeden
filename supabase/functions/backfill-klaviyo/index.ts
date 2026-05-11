import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { paginateQuery } from "../_shared/paginateSupabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 300;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const since: string = body.since ?? "2026-02-12";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load all terminated sessions with email since the given date
    const sessions = await paginateQuery<{ id: string; email: string | null; persona_code: string | null; matching_score: number | null }>((from, to) =>
      supabase
        .from("diagnostic_sessions")
        .select("id, email, persona_code, matching_score")
        .eq("status", "termine")
        .not("email", "is", null)
        .neq("email", "")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .range(from, to)
    );

    if (!sessions || sessions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No sessions to backfill" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[backfill-klaviyo] ${sessions.length} sessions to process since ${since}`);

    let processed = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
      const batch = sessions.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (session: { id: string }) => {
          try {
            const { error: invokeErr } = await supabase.functions.invoke("sync-klaviyo-persona", {
              body: { session_id: session.id },
            });
            if (invokeErr) {
              console.error(`[backfill-klaviyo] Error for session ${session.id}:`, invokeErr);
              errors++;
            } else {
              processed++;
            }
          } catch (err) {
            console.error(`[backfill-klaviyo] Exception for session ${session.id}:`, err);
            errors++;
          }
        })
      );

      // Delay between batches to respect Klaviyo rate limits
      if (i + BATCH_SIZE < sessions.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(`[backfill-klaviyo] Done. processed=${processed}, errors=${errors}, total=${sessions.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        total: sessions.length,
        processed,
        errors,
        since,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[backfill-klaviyo] Unexpected error:", err);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
