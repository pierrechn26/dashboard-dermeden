// Cf. backlog #2.5 — Helper portalUrls pour centraliser l'URL du portail Ask-it
//
// Remplace les 11 occurrences hardcodées de "https://srzbcuhwrpkfhubbbeuw.supabase.co"
// dispersées dans les edge functions. Le secret PORTAL_URL doit être configuré
// par client (mais avec la même valeur pour tous les tenants Ask-it).

const PORTAL_URL = Deno.env.get('PORTAL_URL');

export function getPortalEndpoint(endpoint: string): string {
  if (!PORTAL_URL) {
    throw new Error('PORTAL_URL env var is not defined.');
  }
  const base = PORTAL_URL.replace(/\/$/, '');
  const path = endpoint.replace(/^\//, '');
  return `${base}/functions/v1/${path}`;
}

export function getPortalBaseUrl(): string {
  if (!PORTAL_URL) {
    throw new Error('PORTAL_URL env var is not defined.');
  }
  return PORTAL_URL.replace(/\/$/, '');
}
