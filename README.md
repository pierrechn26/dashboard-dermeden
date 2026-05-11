# Dashboard Template — Ask-It

Template multi-tenant pour les dashboards client Ask-It.  
Construit avec **React + Supabase** via **Lovable**.

---

## Présentation

Ce repo contient le **dashboard générique** déployé pour chaque client Ask-It. Il inclut :

- **8 onglets** : Overview, Personas, Analytics, Business, Funnel, Marketing IA, Aski (chatbot), Réponses
- **Système de personas** : auto-détection par clustering, scoring en temps réel, fiches persona enrichies
- **Recommandations marketing IA** : génération de campagnes Ads, Email, Offres via Claude Sonnet 4.6
- **Aski** : assistant conversationnel IA intégré au dashboard
- **Market Intelligence** : veille concurrentielle mensuelle automatisée
- **Intégrations** : Shopify, Klaviyo, GA4, Meta Pixel (toutes activables/désactivables par tenant)

## Architecture

La configuration client est centralisée dans la table `tenant_config`.  
Tous les composants (frontend et Edge Functions) lisent cette table au démarrage.

Les données spécifiques au diagnostic de chaque client sont stockées dans le champ JSONB `item_metadata` de la table `diagnostic_items`, ce qui rend le schéma extensible sans migration.

### Documentation détaillée

| Document | Contenu |
|----------|---------|
| `ARCHITECTURE_DASHBOARD_TEMPLATE.md` | Architecture complète du template (tables, Edge Functions, crons, intégrations) |
| `TENANT_CONFIG_CONTRACT.md` | Contrat de la table `tenant_config` (schéma, exemples, SQL d'insertion) |
| `WEBHOOK_CONTRACT.md` | Contrat du webhook diagnostic (payload, format items, backward-compat) |
| `ONBOARDING_CLIENT_ASKIT.md` | Procédure d'onboarding client pas-à-pas |

## Déploiement d'un nouveau client

1. **Remix** ce projet dans Lovable → crée un nouveau projet + repo GitHub
2. **Créer** le projet Supabase du client et appliquer les migrations (`supabase/migrations/`)
3. **Insérer** la ligne `tenant_config` du client (via l'admin portal `extract-brand-context` ou manuellement, voir `TENANT_CONFIG_CONTRACT.md`)
4. **Configurer** les secrets Supabase : `ANTHROPIC_API_KEY`, `DIAGNOSTIC_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ORGANIZATION_ID`, etc.
5. **Activer** les intégrations nécessaires (Shopify, Klaviyo, GA4) via `tenant_config.integrations_enabled`
6. **Connecter** le diagnostic du client au webhook (`/functions/v1/diagnostic-webhook`)

Voir `ONBOARDING_CLIENT_ASKIT.md` pour la procédure complète.

## Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | React + Tailwind + shadcn/ui |
| Backend | Supabase (PostgreSQL, Edge Functions, RLS, Auth) |
| IA | Anthropic Claude Sonnet 4.6 (direct API) + Gemini 2.5 Pro (fallback via Lovable Gateway) |
| Build | Lovable (no-code React + Supabase) |
| Hébergement | Lovable (frontend) + Supabase (backend) |

## Structure du repo

```
src/
├── components/dashboard/   # Composants React du dashboard (8 onglets)
├── hooks/                  # Hooks React (useTenantConfig, usePersonaProfiles, etc.)
├── types/                  # Types TypeScript (DiagnosticItem, DiagnosticSession, etc.)
├── integrations/supabase/  # Client Supabase + types auto-générés
└── constants/              # Constantes (personas fallback)

supabase/
├── migrations/             # Migrations SQL (schéma complet)
└── functions/
    ├── _shared/            # Helpers partagés (CORS, logging, tenant config)
    ├── aski-chat/          # Chatbot IA
    ├── aski-daily-learn/   # Apprentissage quotidien Aski
    ├── detect-persona-clusters/  # Auto-détection hebdomadaire des personas
    ├── diagnostic-webhook/ # Réception + stockage des sessions diagnostic
    ├── generate-recommendation-content/  # Génération IA des recommandations marketing
    ├── generate-funnel-recommendations/  # Recommandations funnel
    ├── monthly-market-intelligence/      # Veille concurrentielle mensuelle
    ├── weekly-intelligence-refresh/      # Refresh hebdomadaire intelligence
    ├── sync-klaviyo-persona/             # Sync Klaviyo après persona assignment
    ├── sync-shopify-products/            # Sync quotidienne catalogue Shopify
    ├── persona-stats/      # Stats personas (agrégation)
    └── persona-priorities/ # Priorités personas (classement)
```

## Contribution

Ce repo est un **template**. Les modifications doivent rester **génériques** et ne jamais introduire de logique spécifique à un client. Les données client-spécifiques vivent dans `tenant_config` et `item_metadata` JSONB.
