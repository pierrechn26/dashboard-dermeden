import { AlertTriangle, XCircle, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PORTAL_BILLING_URL } from "@/lib/portal";

interface UpgradePromptProps {
  type: "recos" | "aski" | "sessions";
  /** "warning" = 80-99% | "exceeded" = 100% */
  severity: "warning" | "exceeded";
  currentPlan: "starter" | "growth" | "scale";
  currentUsage: number;
  currentLimit: number;
  renewalDate: string;
  nextPlan: string | null;
  nextPlanLabel: string;
  nextPlanPrice?: string;
  nextLimit: number;
  upgradeUrl?: string;
  className?: string;
}

const TYPE_LABELS: Record<string, { unit: string; period: string; renewLabel: string }> = {
  recos: {
    unit: "recommandation",
    period: "cette semaine",
    renewLabel: "se renouvellent le",
  },
  aski: {
    unit: "conversation",
    period: "ce mois",
    renewLabel: "se renouvellent le",
  },
  sessions: {
    unit: "session",
    period: "ce mois",
    renewLabel: "se renouvellent le",
  },
};

export function UpgradePrompt({
  type,
  severity,
  currentPlan,
  currentUsage,
  currentLimit,
  renewalDate,
  nextPlan,
  nextPlanLabel,
  nextPlanPrice,
  nextLimit,
  upgradeUrl = PORTAL_BILLING_URL,
  className,
}: UpgradePromptProps) {
  const isExceeded = severity === "exceeded";
  const meta = TYPE_LABELS[type];
  const diff = nextLimit - currentLimit;

  const bgClass = isExceeded
    ? "bg-destructive/8 border-destructive/30"
    : "bg-warning/10 border-warning/40";

  const iconClass = isExceeded ? "text-destructive" : "text-warning";
  const Icon = isExceeded ? XCircle : AlertTriangle;

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 space-y-3",
        bgClass,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", iconClass)} />
        <div className="flex-1 space-y-1.5">
          {isExceeded ? (
            <>
              <p className="text-sm font-semibold text-foreground">
                Limite{" "}
                {type === "recos" ? "hebdomadaire" : "mensuelle"} atteinte
              </p>
              <p className="text-sm text-muted-foreground">
                Vous avez utilisé vos{" "}
                <span className="font-semibold text-foreground">
                  {currentLimit.toLocaleString("fr-FR")} {meta.unit}
                  {currentLimit > 1 ? "s" : ""}
                </span>{" "}
                {meta.period}. Vos crédits {meta.renewLabel}{" "}
                <span className="font-semibold text-foreground">{renewalDate}</span>.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">
                Vous approchez de votre limite
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {currentUsage.toLocaleString("fr-FR")} /{" "}
                  {currentLimit.toLocaleString("fr-FR")}
                </span>{" "}
                {meta.unit}s utilisé{currentUsage > 1 ? "s" : ""} {meta.period}. Vos crédits {meta.renewLabel}{" "}
                <span className="font-semibold text-foreground">{renewalDate}</span>.
              </p>
            </>
          )}

          {nextPlan && isExceeded && (
            <p className="text-sm text-muted-foreground">
              Passez au plan{" "}
              <span className="font-semibold text-foreground">{nextPlanLabel}</span> pour{" "}
              <span className="font-semibold text-foreground">
                {nextLimit.toLocaleString("fr-FR")} {meta.unit}s
                {type === "recos" ? "/semaine" : "/mois"}
              </span>{" "}
              (+{diff.toLocaleString("fr-FR")} supplémentaire{diff > 1 ? "s" : ""}).
            </p>
          )}

          {!nextPlan && currentPlan === "scale" && isExceeded && (
            <p className="text-sm text-muted-foreground">
              Contactez-nous pour un plan personnalisé.
            </p>
          )}
        </div>
      </div>

      {nextPlan && isExceeded && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5 border-foreground/20 hover:border-primary/60 hover:text-primary"
            onClick={() => window.open(upgradeUrl, "_blank")}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Découvrir le plan {nextPlanLabel}
            {nextPlanPrice && ` — ${nextPlanPrice}`}
          </Button>
        </div>
      )}

      {!nextPlan && currentPlan === "scale" && isExceeded && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5 border-foreground/20 hover:border-primary/60 hover:text-primary"
            onClick={() => window.open("mailto:contact@ask-it.ai", "_blank")}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Contactez-nous
          </Button>
        </div>
      )}
    </div>
  );
}
