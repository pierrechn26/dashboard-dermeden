/**
 * Persona profiles — generic template fallback values.
 *
 * IMPORTANT: This file is intentionally MINIMAL in the template.
 * The real persona profiles for each tenant are stored in the `personas` table
 * of their Supabase database, populated by `detect-persona-clusters` (auto-detection)
 * or by the admin portal (manual creation).
 *
 * The hook `usePersonaProfiles` loads from the database first and falls back
 * to this file only if the DB is unavailable. With the generic fallbacks below,
 * the dashboard remains usable but displays neutral placeholder names.
 */

export interface PersonaProfile {
  code: string;
  displayName: string;
  title: string;
  fullLabel: string;
  description: string;
}

/**
 * Only the universal P0 (pool) is hardcoded as a fallback.
 * All other persona codes (P1, P2, ..., P10+) are tenant-specific and loaded
 * from the database.
 */
export const PERSONA_PROFILES: Record<string, PersonaProfile> = {
  P0: {
    code: "P0",
    displayName: "Non attribué",
    title: "Pool des sessions sans persona",
    fullLabel: "P0 — Non attribué",
    description: "Sessions qui n'ont pas encore été affectées à un persona spécifique. Elles seront automatiquement re-classées au prochain cycle de détection des personas.",
  },
};

/**
 * Returns a default placeholder profile for any persona code not present
 * in the local fallback. Used when the DB is unavailable AND the code
 * is not P0.
 */
export function getDefaultPersonaProfile(code: string): PersonaProfile {
  return {
    code,
    displayName: code,
    title: "Persona auto-détecté",
    fullLabel: code,
    description: "Persona détecté automatiquement à partir des sessions du diagnostic. Modifie le nom et la description dans le dashboard pour refléter ta marque.",
  };
}

/**
 * Get the full label for a persona code. Falls back to the code itself.
 */
export function getPersonaLabel(code: string): string {
  return PERSONA_PROFILES[code]?.fullLabel ?? code;
}

/**
 * Get just the display name for a persona code.
 */
export function getPersonaDisplayName(code: string): string {
  return PERSONA_PROFILES[code]?.displayName ?? code;
}

/**
 * Get a short badge label.
 */
export function getPersonaBadgeLabel(code: string): string {
  const profile = PERSONA_PROFILES[code];
  return profile ? `${profile.displayName}` : code;
}
