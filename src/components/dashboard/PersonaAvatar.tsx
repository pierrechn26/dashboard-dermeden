/**
 * PersonaAvatar — generic avatar with colored circle + initials.
 *
 * Replaces the previous tenant-specific persona illustrations (Clara, Nathalie,
 * Amandine, etc.). Works for any tenant: pick the persona's name (loaded from
 * the personas table via usePersonaProfiles) and the avatar generates itself
 * from the first 1-2 initials, with a stable color derived from the persona code.
 *
 * The color palette is intentionally neutral and professional, similar to the
 * placeholder avatars used by Slack, Notion, and Linear.
 */
import { cn } from "@/lib/utils";

interface PersonaAvatarProps {
  name: string;
  code: string;
  size?: number;
  className?: string;
}

/**
 * Distinct, accessible HSL colors. The persona code (e.g., "P3") indexes into
 * this palette modulo its length, so color assignment is stable across renders.
 */
const PERSONA_COLORS = [
  "hsl(220, 70%, 50%)", // blue
  "hsl(160, 60%, 45%)", // teal
  "hsl(280, 60%, 55%)", // purple
  "hsl(15, 75%, 55%)",  // orange
  "hsl(340, 70%, 55%)", // pink
  "hsl(195, 70%, 45%)", // cyan
  "hsl(45, 80%, 45%)",  // amber
  "hsl(110, 50%, 45%)", // green
  "hsl(0, 65%, 55%)",   // red
  "hsl(250, 60%, 60%)", // indigo
];

function colorForCode(code: string): string {
  // Extract numeric part if present (P0, P1, P10, etc.) — fallback to 0
  const numMatch = code.match(/\d+/);
  const idx = numMatch ? parseInt(numMatch[0], 10) : 0;
  return PERSONA_COLORS[idx % PERSONA_COLORS.length];
}

function initialsFor(name: string): string {
  if (!name || name.length === 0) return "?";
  // Take first letters of up to 2 words; fallback to first 2 chars of single word
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function PersonaAvatar({ name, code, size = 80, className }: PersonaAvatarProps) {
  const color = colorForCode(code);
  const initials = initialsFor(name);
  const fontSize = Math.max(12, Math.round(size * 0.36));

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center text-white font-bold select-none",
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: `${fontSize}px`,
      }}
      aria-label={`Avatar ${name}`}
      title={name}
    >
      {initials}
    </div>
  );
}
