// Cf. backlog #2.8 — Helper getCommercialFacts pour injection dans les
// prompts LLM. Lit tenant_commercial_facts (alimenté par scrape-commercial-
// facts hebdomadaire) et formate un bloc texte avec garde anti-hallucination.
//
// Le bloc rendu par formatCommercialFactsForPrompt est conçu pour être
// préfixé au prompt utilisateur du LLM. Sa garde "INTERDICTION ABSOLUE
// d'inventer ces valeurs" (textuelle, pas une contrainte technique) impose
// au modèle de rester silencieux pour toute donnée commerciale absente du
// bloc, plutôt que d'inventer (ex: seuil de livraison gratuite hallucinée).

import { paginateQuery } from "./paginateSupabase.ts";

export type CommercialFact = {
  fact_key: string;
  fact_value: string;
  source_url: string | null;
  confidence: string;
};

export type CommercialFactsByCategory = Record<string, CommercialFact[]>;

type CommercialFactRow = {
  category: string;
  fact_key: string;
  fact_value: string;
  source_url: string | null;
  confidence: string;
};

export async function getCommercialFacts(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: string
): Promise<CommercialFactsByCategory> {
  const rows = await paginateQuery<CommercialFactRow>((from, to) =>
    supabase
      .from("tenant_commercial_facts")
      .select("category, fact_key, fact_value, source_url, confidence")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("fact_key", { ascending: true })
      .range(from, to)
  );

  const grouped: CommercialFactsByCategory = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({
      fact_key: row.fact_key,
      fact_value: row.fact_value,
      source_url: row.source_url,
      confidence: row.confidence,
    });
  }
  return grouped;
}

export function formatCommercialFactsForPrompt(facts: CommercialFactsByCategory): string {
  const categories = Object.keys(facts).sort();
  if (categories.length === 0) return "";

  const lines: string[] = [
    "=== FAITS COMMERCIAUX VÉRIFIÉS ===",
    "INTERDICTION ABSOLUE d'inventer ces valeurs.",
    "Si une donnée n'est pas dans cette liste, NE LA MENTIONNE PAS.",
    "",
  ];
  for (const cat of categories) {
    lines.push(`[${cat.toUpperCase()}]`);
    for (const fact of facts[cat]) {
      lines.push(`- ${fact.fact_key} : ${fact.fact_value}`);
    }
    lines.push("");
  }
  lines.push("====================================");
  return lines.join("\n");
}
