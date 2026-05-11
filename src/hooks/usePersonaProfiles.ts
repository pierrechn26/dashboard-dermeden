/**
 * Hook to load persona profiles from the database (single source of truth).
 * Falls back to the local constants if DB is unavailable.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PERSONA_PROFILES as FALLBACK_PROFILES } from "@/constants/personas";

export interface PersonaDBProfile {
  code: string;
  name: string;
  full_label: string;
  description: string | null;
  is_pool: boolean;
  is_active: boolean;
}

interface PersonaProfilesState {
  profiles: PersonaDBProfile[];
  isLoading: boolean;
  /** Map of code → full_label for quick lookup */
  labelMap: Record<string, string>;
  /** Map of code → name for quick lookup */
  nameMap: Record<string, string>;
  getLabel: (code: string) => string;
  getName: (code: string) => string;
}

let _cache: PersonaDBProfile[] | null = null;

export function usePersonaProfiles(): PersonaProfilesState {
  const [profiles, setProfiles] = useState<PersonaDBProfile[]>(_cache ?? []);
  const [isLoading, setIsLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) return;

    supabase
      .from("personas")
      .select("code, name, full_label, description, is_pool, is_active")
      .eq("is_active", true)
      .order("code", { ascending: true })
      .then(({ data, error }) => {
        if (error || !data) {
          console.warn("[usePersonaProfiles] DB load failed, using fallback:", error?.message);
          // Build fallback from constants
          const fallback: PersonaDBProfile[] = Object.values(FALLBACK_PROFILES).map((p) => ({
            code: p.code,
            name: p.displayName,
            full_label: p.fullLabel,
            description: p.description,
            is_pool: false,
            is_active: true,
          }));
          _cache = fallback;
          setProfiles(fallback);
        } else {
          _cache = data as PersonaDBProfile[];
          setProfiles(data as PersonaDBProfile[]);
        }
        setIsLoading(false);
      });
  }, []);

  const labelMap: Record<string, string> = {};
  const nameMap: Record<string, string> = {};
  for (const p of profiles) {
    labelMap[p.code] = p.full_label;
    nameMap[p.code] = p.name;
  }

  const getLabel = (code: string): string => {
    if (!code) return "—";
    if (labelMap[code]) return labelMap[code];
    // Fallback to local constants
    const local = FALLBACK_PROFILES[code];
    if (local) return local.fullLabel;
    if (code === "P0") return "P0 — Non attribué";
    return code;
  };

  const getName = (code: string): string => {
    if (!code) return "—";
    if (nameMap[code]) return nameMap[code];
    const local = FALLBACK_PROFILES[code];
    if (local) return local.displayName;
    if (code === "P0") return "Non attribué";
    return code;
  };

  return { profiles, isLoading, labelMap, nameMap, getLabel, getName };
}
