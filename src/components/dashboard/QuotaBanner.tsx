import { ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { useState } from "react";
import { PORTAL_BILLING_URL } from "@/lib/portal";

export function QuotaBanner() {
  const { sessions, aski, recos, upgrade, loading } = useUsageLimits();
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  if (loading) return null;

  // Collect resources at warning (80-99%) or exceeded (100%+)
  const alerts: { key: string; label: string; pct: number; exceeded: boolean }[] = [];

  if (aski.isExceeded) alerts.push({ key: "aski", label: "Conversations Aski", pct: aski.percentage, exceeded: true });
  else if (aski.isWarning && !dismissed.aski) alerts.push({ key: "aski", label: "Conversations Aski", pct: aski.percentage, exceeded: false });

  if (recos.isExceeded) alerts.push({ key: "recos", label: "Recommandations marketing", pct: recos.percentage, exceeded: true });
  else if (recos.isWarning && !dismissed.recos) alerts.push({ key: "recos", label: "Recommandations marketing", pct: recos.percentage, exceeded: false });

  if (sessions.isExceeded) alerts.push({ key: "sessions", label: "Sessions diagnostic", pct: sessions.percentage, exceeded: true });
  else if (sessions.isWarning && !dismissed.sessions) alerts.push({ key: "sessions", label: "Sessions diagnostic", pct: sessions.percentage, exceeded: false });

  if (alerts.length === 0) return null;

  const hasExceeded = alerts.some(a => a.exceeded);
  const warningOnly = alerts.filter(a => !a.exceeded);
  const exceededAlerts = alerts.filter(a => a.exceeded);

  return (
    <div className="space-y-0">
      {/* Exceeded banner (red) — not dismissible */}
      {exceededAlerts.length > 0 && (
        <div className="border-b px-6 py-3 bg-[hsl(0,86%,97%)] border-l-4 border-l-[hsl(0,72%,51%)] border-b-[hsl(0,72%,51%)]/20">
          <div className="container mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-base">🚫</span>
              <p className="text-sm text-foreground">
                <span className="font-semibold">Limite atteinte</span> sur vos{" "}
                {exceededAlerts.map(a => a.label).join(", ")}.{" "}
                Vos données ne seront pas mises à jour.{" "}
                {upgrade.nextPlan
                  ? <>Passez au plan <span className="font-semibold">{upgrade.nextPlanLabel}</span> pour continuer.</>
                  : <>Contactez-nous pour un plan personnalisé.</>
                }
              </p>
            </div>
            {upgrade.nextPlan && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-xs h-7 px-2.5 gap-1 bg-destructive text-white hover:bg-destructive/90"
onClick={() => window.open(PORTAL_BILLING_URL, "_blank")}
              >
                Mettre à niveau <ArrowUpRight className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Warning banner (amber) — dismissible */}
      {warningOnly.length > 0 && (
        <div className="border-b px-6 py-3 bg-[hsl(48,96%,89%)] border-l-4 border-l-[hsl(38,92%,50%)] border-b-[hsl(38,92%,50%)]/20">
          <div className="container mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-base">⚠️</span>
              <p className="text-sm text-foreground">
                Vous avez utilisé{" "}
                {warningOnly.map(a => <span key={a.key}><span className="font-semibold">{a.pct}%</span> de vos {a.label}</span>).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ", ", curr], [] as any[])}.{" "}
                {upgrade.nextPlan
                  ? <>Pensez à passer au plan <span className="font-semibold">{upgrade.nextPlanLabel}</span>.</>
                  : null
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              {upgrade.nextPlan && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs h-7 px-2.5 gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => window.open(PORTAL_BILLING_URL, "_blank")}
                >
                  Mettre à niveau <ArrowUpRight className="w-3 h-3" />
                </Button>
              )}
              <button
                onClick={() => {
                  const d = { ...dismissed };
                  warningOnly.forEach(a => d[a.key] = true);
                  setDismissed(d);
                }}
                className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors"
                title="Fermer"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
