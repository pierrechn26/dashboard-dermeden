// Cf. backlog #2.1 — Helper paginateQuery pour bypass cap PostgREST 1000 lignes
//
// Toute query Supabase qui peut dépasser 1000 lignes (diagnostic_sessions,
// diagnostic_items, client_orders, marketing_sources, marketing_recommendations)
// doit utiliser ce helper. PostgREST cap silencieusement à 1000 lignes par
// défaut, faussant tous les KPIs et agrégations sans erreur visible.

export async function paginateQuery<T = any>(
  queryFn: (from: number, to: number) => any,
  options: { pageSize?: number } = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const allRows: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const to = from + pageSize - 1;
    const { data, error } = await queryFn(from, to);
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }
    allRows.push(...data);
    if (data.length < pageSize) hasMore = false;
    else from += pageSize;
  }

  return allRows;
}
