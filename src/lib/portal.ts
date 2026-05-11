// Cf. backlog #3.1 — URLs portail Ask-it centralisées (frontend)
//
// Remplace les URLs hardcodées (https://app.ask-it.ai, login, billing, contact)
// dispersées dans 7 composants frontend. Si une URL doit changer (rebrand,
// migration de domaine), un seul fichier à toucher.

export const PORTAL_APP_URL = 'https://app.ask-it.ai';
export const PORTAL_API_URL = 'https://srzbcuhwrpkfhubbbeuw.supabase.co/functions/v1';
export const PORTAL_LOGIN_URL = `${PORTAL_APP_URL}/login`;
export const PORTAL_BILLING_URL = `${PORTAL_APP_URL}/dashboard/billing`;
export const ASKIT_CONTACT_EMAIL = 'contact@ask-it.ai';

export function getPortalApiUrl(endpoint: string): string {
  const path = endpoint.replace(/^\//, '');
  return `${PORTAL_API_URL}/${path}`;
}
