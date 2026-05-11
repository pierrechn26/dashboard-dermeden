// Cf. backlog #2.6 — Helper getEmailProvider tenant-agnostique
//
// Retourne le provider email actif d'après tenant_config.integrations_enabled.
// Évite "Klaviyo" hardcodé dans les prompts et keywords des fonctions LLM
// (aski-chat, generate-recommendation-content, monthly-market-intelligence).

import { loadTenantConfig } from './loadTenantConfig.ts';

export type EmailProvider = 'klaviyo' | 'omnisend' | 'mailchimp' | 'brevo' | 'none';

export async function getEmailProvider(): Promise<EmailProvider> {
  const config = await loadTenantConfig();
  const integrations = (config?.integrations_enabled ?? {}) as Record<string, boolean>;

  if (integrations.klaviyo === true) return 'klaviyo';
  if (integrations.omnisend === true) return 'omnisend';
  if (integrations.mailchimp === true) return 'mailchimp';
  if (integrations.brevo === true) return 'brevo';

  return 'none';
}

export function getEmailProviderDisplayName(provider: EmailProvider): string {
  switch (provider) {
    case 'klaviyo': return 'Klaviyo';
    case 'omnisend': return 'Omnisend';
    case 'mailchimp': return 'Mailchimp';
    case 'brevo': return 'Brevo';
    case 'none': return 'aucun outil email';
  }
}

export function getEmailProviderContextLine(provider: EmailProvider): string {
  if (provider === 'none') {
    return "Le client n'a pas d'outil d'email marketing configuré.";
  }
  return `Le client utilise ${getEmailProviderDisplayName(provider)} comme outil d'email marketing.`;
}
