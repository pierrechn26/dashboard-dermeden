import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { cn } from "@/lib/utils";
import { PORTAL_BILLING_URL } from "@/lib/portal";

// ── Helpers ────────────────────────────────────────────────────────────────────
function getBarColor(pct: number, exceeded: boolean): string {
  if (exceeded || pct >= 100) return "bg-destructive";
  if (pct >= 80) return "bg-destructive/70";
  if (pct >= 60) return "bg-amber-500";
  return "bg-emerald-500";
}

function getRowBg(pct: number, exceeded: boolean): string {
  if (exceeded || pct >= 100) return "bg-destructive/5 border-destructive/20";
  if (pct >= 80) return "bg-amber-500/5 border-amber-500/20";
  return "bg-card border-border/50";
}

// ── Sub-component ──────────────────────────────────────────────────────────────
interface UsageBarProps {
  label: string;
  used: number;
  limit: number;
  percentage: number;
  isWarning: boolean;
  isExceeded: boolean;
  renewalDate: string;
  unit: string;
}

function UsageBar({ label, used, limit, percentage, isWarning, isExceeded, renewalDate, unit }: UsageBarProps) {
  const barColor = getBarColor(percentage, isExceeded);
  const rowBg = getRowBg(percentage, isExceeded);

  return (
    <div className={cn("rounded-lg border p-4 space-y-2.5", rowBg)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {isExceeded && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 rounded-full px-2 py-0.5">
              ⚠️ Limite atteinte
            </span>
          )}
          {isWarning && !isExceeded && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5">
              ⚠️ Attention
            </span>
          )}
        </div>
        <span className={cn(
          "text-sm font-semibold tabular-nums",
          isExceeded ? "text-destructive" : isWarning ? "text-amber-600" : "text-foreground"
        )}>
          {percentage}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* Sub-label */}
      <p className="text-xs text-muted-foreground">
        {isExceeded ? (
          <span className="text-destructive font-medium">Limite atteinte</span>
        ) : (
          <span>
            <span className="font-medium text-foreground">{used.toLocaleString("fr-FR")}</span>
            {" / "}
            <span className="font-medium text-foreground">{limit.toLocaleString("fr-FR")}</span>
            {" "}{unit}
          </span>
        )}
        <span className="mx-1.5 text-border">·</span>
        Renouvellement le {renewalDate}
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function UsageOverview() {
  const { plan, sessions, aski, recos, upgrade, loading } = useUsageLimits();

  const planLabel = plan === "starter" ? "Starter" : plan === "growth" ? "Growth" : "Scale";

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-card via-card to-accent/5 rounded-xl border border-border/50 p-6 shadow-md space-y-4 animate-pulse">
        <div className="h-5 w-32 bg-muted rounded" />
        <div className="h-14 w-full bg-muted rounded-lg" />
        <div className="h-14 w-full bg-muted rounded-lg" />
        <div className="h-14 w-full bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-card via-card to-accent/5 rounded-xl border border-border/50 p-6 shadow-md space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">📊</span>
        <h3 className="text-xl font-bold text-foreground font-heading">Votre usage</h3>
      </div>

      {/* Sessions */}
      <UsageBar
        label="Sessions ce mois"
        used={sessions.used}
        limit={sessions.limit}
        percentage={sessions.percentage}
        isWarning={sessions.isWarning}
        isExceeded={sessions.isExceeded}
        renewalDate={sessions.renewalDate}
        unit="sessions"
      />

      {/* Aski */}
      <UsageBar
        label="Conversations Aski ce mois"
        used={aski.used}
        limit={aski.limit}
        percentage={aski.percentage}
        isWarning={aski.isWarning}
        isExceeded={aski.isExceeded}
        renewalDate={aski.renewalDate}
        unit="conversations"
      />

      {/* Recos */}
      <UsageBar
        label="Recommandations marketing ce mois"
        used={recos.used}
        limit={recos.limit}
        percentage={recos.percentage}
        isWarning={recos.isWarning}
        isExceeded={recos.isExceeded}
        renewalDate={recos.renewalDate}
        unit="recommandations"
      />

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <p className="text-sm text-muted-foreground">
          Plan actuel :{" "}
          <span className="font-semibold text-foreground">{planLabel}</span>
        </p>
        {upgrade.nextPlan ? (
          <Button
            size="sm"
            className="gap-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary-foreground hover:text-primary border border-primary transition-colors duration-150"
            onClick={() => window.open(PORTAL_BILLING_URL, "_blank")}
          >
            Mettre à niveau mon abonnement
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-sm border-muted-foreground/30 text-muted-foreground hover:bg-muted/40"
            onClick={() => window.open("mailto:contact@ask-it.ai", "_blank")}
          >
            Contactez-nous pour un plan personnalisé
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
