// Cf. backlog #2.4 — Wrapper try/finally pour tracking API garanti
//
// Garantit que les tokens consommés par un appel LLM sont loggés dans
// api_usage_logs même si une opération métier post-LLM (typiquement un INSERT
// BDD) échoue. Sans cela, un crash post-LLM fait perdre la trace de coûts qui
// ont pourtant été facturés par le provider.
//
// À utiliser pour toute NOUVELLE edge function qui appelle un LLM puis fait un
// INSERT BDD. Migration progressive des fonctions existantes au fil des
// modifications futures.

import { logApiUsage, LogApiUsageParams } from './logApiUsage.ts';

export interface ApiUsageTracking {
  input: number;
  output: number;
  total: number;
}

export type WithApiUsageTrackingParams = Omit<
  LogApiUsageParams,
  'inputTokens' | 'outputTokens' | 'totalTokens'
>;

export async function withApiUsageTracking<T>(
  supabase: any,
  params: WithApiUsageTrackingParams,
  fn: () => Promise<{ result: T; usage: ApiUsageTracking }>
): Promise<T> {
  let usage: ApiUsageTracking = { input: 0, output: 0, total: 0 };
  try {
    const { result, usage: u } = await fn();
    usage = u;
    return result;
  } finally {
    if (usage.input || usage.output || usage.total) {
      try {
        await logApiUsage(supabase, {
          ...params,
          inputTokens: usage.input,
          outputTokens: usage.output,
          totalTokens: usage.total,
        });
      } catch (logErr) {
        console.error('[withApiUsageTracking] logApiUsage failed:', logErr);
      }
    }
  }
}
