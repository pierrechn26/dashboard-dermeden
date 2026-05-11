// Cf. backlog #2.3 — Helper logApiUsage centralisé (signature standardisée)
//
// Tracking unifié des appels API LLM. INSERT silencieux dans api_usage_logs :
// toute erreur d'INSERT est loggée mais jamais propagée au caller, pour ne pas
// bloquer la fonction métier.
//
// La signature de apiProvider est strictement alignée sur le CHECK constraint
// BDD : seuls 'anthropic' | 'gemini' | 'perplexity' | 'lovable-ai' sont
// acceptés. Étendre ce type nécessite d'étendre aussi le CHECK constraint
// (migration BDD).

export interface LogApiUsageParams {
  edgeFunction: string;
  apiProvider: 'anthropic' | 'gemini' | 'perplexity' | 'lovable-ai';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  metadata?: Record<string, unknown>;
}

export async function logApiUsage(
  supabase: any,
  params: LogApiUsageParams
): Promise<void> {
  try {
    const { error } = await supabase.from('api_usage_logs').insert({
      edge_function: params.edgeFunction,
      api_provider: params.apiProvider,
      model: params.model ?? null,
      input_tokens: params.inputTokens ?? 0,
      output_tokens: params.outputTokens ?? 0,
      total_tokens:
        params.totalTokens ??
        ((params.inputTokens ?? 0) + (params.outputTokens ?? 0)),
      metadata: params.metadata ?? {},
    });

    if (error) {
      console.error(
        `[logApiUsage] INSERT failed for ${params.edgeFunction}:`,
        error.message,
        error.code
      );
    }
  } catch (err) {
    console.error(
      `[logApiUsage] Exception for ${params.edgeFunction}:`,
      (err as Error).message
    );
  }
}
