import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTenantConfig } from "../_shared/loadTenantConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function logApiUsage(payload: Record<string, unknown>) {
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await client.from("api_usage_logs").insert(payload);
  } catch (e: any) {
    console.error("LOG EXCEPTION aski-daily-learn:", e.message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load tenant configuration once at the start of the handler
    const tenantConfig = await loadTenantConfig();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // === 1. EXPIRE OLD MEMORIES ===
    await supabase
      .from("aski_memory")
      .update({ is_active: false })
      .eq("is_active", true)
      .lt("expires_at", new Date().toISOString());

    // === 2. LOAD CONVERSATIONS FROM LAST 24H ===
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentChats } = await supabase
      .from("aski_chats")
      .select("id, title")
      .eq("is_archived", false)
      .gte("updated_at", since);

    if (!recentChats || recentChats.length === 0) {
      console.log("[aski-daily-learn] No recent conversations to analyze");
      return new Response(JSON.stringify({ success: true, analyzed: 0, extracted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load messages for each chat
    const chatIds = recentChats.map(c => c.id);
    const { data: allMessages } = await supabase
      .from("aski_messages")
      .select("chat_id, role, content")
      .in("chat_id", chatIds)
      .order("created_at", { ascending: true });

    if (!allMessages || allMessages.length === 0) {
      return new Response(JSON.stringify({ success: true, analyzed: 0, extracted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group messages by chat
    const chatConversations: Record<string, { title: string; messages: string }> = {};
    for (const chat of recentChats) {
      const msgs = allMessages
        .filter(m => m.chat_id === chat.id)
        .map(m => `[${m.role}]: ${(m.content as string).substring(0, 500)}`)
        .join("\n");
      if (msgs) {
        chatConversations[chat.id] = { title: chat.title as string, messages: msgs };
      }
    }

    // === 3. LOAD EXISTING MEMORIES ===
    const { data: existingMemories } = await supabase
      .from("aski_memory")
      .select("id, insight, category, confidence, source_chat_ids")
      .eq("is_active", true);

    const existingInsights = (existingMemories ?? []).map(m => `[${m.category}] ${m.insight}`).join("\n");

    // === 4. CALL AI TO EXTRACT DIRECTIVES ===
    const conversationsText = Object.entries(chatConversations)
      .map(([id, c]) => `--- Conversation "${c.title}" (${id}) ---\n${c.messages}`)
      .join("\n\n");

    // Build dynamic brand context from tenant_config
    const brandContextParts = [];
    if (tenantConfig.industry) brandContextParts.push(`secteur ${tenantConfig.industry}`);
    if (tenantConfig.target_audience) brandContextParts.push(`ciblant ${tenantConfig.target_audience}`);
    const brandContext = brandContextParts.length > 0
      ? `d'une marque ${brandContextParts.join(" ")}`
      : "d'une marque e-commerce";

    const extractionPrompt = `Tu analyses des conversations entre un utilisateur (équipe marketing ${brandContext}) et un assistant IA (Aski).

TON OBJECTIF : Extraire UNIQUEMENT les directives, corrections et validations EXPLICITES de l'utilisateur concernant les préférences de la marque.

RÈGLES STRICTES :
1. Ne capture QUE ce que l'utilisateur DIT EXPLICITEMENT comme consigne, correction ou validation
2. IGNORE les questions posées par l'utilisateur (une question n'est pas une préférence)
3. IGNORE le silence ou l'absence de réaction (silence ≠ validation)
4. IGNORE les interprétations ou déductions ("il semble préférer...")
5. IGNORE les préférences ponctuelles liées à un contexte spécifique (ex: "pour cet email spécifique, utilise X")
6. Ne retiens QUE les directives GÉNÉRALISABLES à toutes les futures interactions

CATÉGORIES AUTORISÉES :
- brand_directive : consignes sur le ton, le positionnement, les valeurs de la marque
- content_rule : règles de création de contenu (formats, styles, interdictions)
- channel_preference : préférences par canal de communication (Instagram, email, etc.)

MÉMOIRES EXISTANTES (ne pas dupliquer) :
${existingInsights || "(aucune)"}

CONVERSATIONS À ANALYSER :
${conversationsText}

Réponds UNIQUEMENT en JSON valide avec ce format :
{
  "insights": [
    {
      "category": "brand_directive|content_rule|channel_preference",
      "insight": "description concise de la directive (1-2 phrases max)",
      "chat_id": "uuid de la conversation source",
      "matches_existing_id": null ou "uuid d'un insight existant que cela confirme"
    }
  ]
}

Si aucune directive explicite n'est trouvée, retourne : { "insights": [] }
Ne force PAS l'extraction — mieux vaut retourner un tableau vide que d'inventer des insights.`;

    const model = "google/gemini-3-flash-preview";

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Tu es un extracteur de directives. Tu retournes uniquement du JSON valide." },
          { role: "user", content: extractionPrompt },
        ],
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[aski-daily-learn] AI error:", aiResponse.status, errText);
      throw new Error(`AI error ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? "";
    const inputTokens = aiData.usage?.prompt_tokens ?? 0;
    const outputTokens = aiData.usage?.completion_tokens ?? 0;

    await logApiUsage({
      edge_function: "aski-daily-learn",
      api_provider: "google",
      model,
      tokens_used: inputTokens + outputTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      api_calls: 1,
      metadata: { type: "insight_extraction", chats_analyzed: Object.keys(chatConversations).length },
    });

    // === 5. PARSE AND STORE INSIGHTS ===
    let parsed: { insights: any[] };
    try {
      // Handle markdown code blocks
      const jsonStr = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[aski-daily-learn] Failed to parse AI response:", rawContent.substring(0, 200));
      return new Response(JSON.stringify({ success: true, analyzed: Object.keys(chatConversations).length, extracted: 0, parse_error: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validCategories = ["brand_directive", "content_rule", "channel_preference"];
    const insights = (parsed.insights ?? []).filter(
      (i: any) => i.insight && validCategories.includes(i.category)
    );

    let newCount = 0;
    let confirmedCount = 0;

    // Check active memory count
    const { count: activeCount } = await supabase
      .from("aski_memory")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    const maxMemories = 15;

    for (const insight of insights) {
      if (insight.matches_existing_id) {
        // Confirm existing insight — increment confidence and extend expiration
        const existing = existingMemories?.find(m => m.id === insight.matches_existing_id);
        if (existing) {
          const updatedChatIds = [...new Set([...(existing.source_chat_ids as string[] ?? []), insight.chat_id])];
          await supabase
            .from("aski_memory")
            .update({
              confidence: (existing.confidence as number) + 1,
              source_chat_ids: updatedChatIds,
              last_confirmed_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // Reset 60 days
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          confirmedCount++;
        }
      } else {
        // New insight — only add if under the cap
        if ((activeCount ?? 0) + newCount < maxMemories) {
          await supabase.from("aski_memory").insert({
            category: insight.category,
            insight: insight.insight,
            confidence: 1,
            source_chat_ids: [insight.chat_id].filter(Boolean),
            last_confirmed_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          });
          newCount++;
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[aski-daily-learn] Done in ${duration}ms | Chats: ${Object.keys(chatConversations).length} | New: ${newCount} | Confirmed: ${confirmedCount}`);

    return new Response(JSON.stringify({
      success: true,
      analyzed: Object.keys(chatConversations).length,
      new_insights: newCount,
      confirmed_insights: confirmedCount,
      total_active: (activeCount ?? 0) + newCount,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[aski-daily-learn] Error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
