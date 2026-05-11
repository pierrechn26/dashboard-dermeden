import { Badge } from "@/components/ui/badge";
import { usePersonaProfiles } from "@/hooks/usePersonaProfiles";

const PERSONA_COLORS: Record<string, string> = {
  P1: "bg-primary/20 text-primary border-primary/30",
  P2: "bg-secondary/20 text-secondary border-secondary/30",
  P3: "bg-accent/20 text-foreground border-accent/30",
  P4: "bg-primary/20 text-primary border-primary/30",
  P5: "bg-secondary/20 text-secondary border-secondary/30",
  P6: "bg-accent/20 text-foreground border-accent/30",
  P7: "bg-primary/20 text-primary border-primary/30",
  P8: "bg-secondary/20 text-secondary border-secondary/30",
  P9: "bg-accent/20 text-foreground border-accent/30",
};

/** Single persona badge */
export function PersonaBadge({ code }: { code: string }) {
  const { getName } = usePersonaProfiles();
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 h-5 font-bold ${PERSONA_COLORS[code] || "bg-muted text-muted-foreground"}`}
    >
      {getName(code)}
    </Badge>
  );
}

/** Multiple persona badges (wraps PersonaBadge) */
export function PersonaBadges({ personas }: { personas?: string[] }) {
  if (!personas || personas.length === 0) return null;
  return (
    <span className="inline-flex gap-1 ml-2 flex-wrap">
      {personas.map((p) => (
        <PersonaBadge key={p} code={p} />
      ))}
    </span>
  );
}
