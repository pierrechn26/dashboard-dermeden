const PRIORITY_CONFIG: Record<number, { label: string; className: string; dot: string }> = {
  1: { label: "Haute priorité", className: "text-red-600 bg-red-500/10 border-red-500/30", dot: "bg-red-500" },
  2: { label: "Moyenne priorité", className: "text-orange-600 bg-orange-500/10 border-orange-500/30", dot: "bg-orange-500" },
  3: { label: "Basse priorité", className: "text-muted-foreground bg-muted border-border", dot: "bg-muted-foreground" },
};

export function PriorityIndicator({ priority }: { priority?: number }) {
  const config = PRIORITY_CONFIG[priority ?? 3] ?? PRIORITY_CONFIG[3];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
