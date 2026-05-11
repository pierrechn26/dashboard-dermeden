import { AlertTriangle, ArrowUpRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PORTAL_BILLING_URL } from "@/lib/portal";

interface Props {
  percentage: number;
  isWarning: boolean;
  isExceeded: boolean;
  used: number;
  limit: number;
  nextPlanLabel: string;
  nextPlanPrice: string;
  hasNextPlan: boolean;
}

export function RecosQuotaBanner({ percentage, isWarning, isExceeded, used, limit, nextPlanLabel, nextPlanPrice, hasNextPlan }: Props) {
  if (!isWarning && !isExceeded) return null;

  if (isExceeded) {
    return (
      <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-semibold text-foreground">
              Limite de recommandations atteinte ({used}/{limit})
            </p>
            <p className="text-sm text-muted-foreground">
              Vous avez utilisé la totalité de vos crédits de recommandations marketing ce mois-ci.
              La génération est désactivée jusqu'au renouvellement.
              {hasNextPlan && (
                <> Passez au plan <span className="font-semibold">{nextPlanLabel}</span> ({nextPlanPrice}) pour augmenter votre limite.</>
              )}
            </p>
            {hasNextPlan && (
              <Button
                size="sm"
                className="mt-1 bg-destructive text-white hover:bg-destructive/90"
                onClick={() => window.open(PORTAL_BILLING_URL, "_blank")}
              >
                Mettre à niveau <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Warning (80-99%)
  return (
    <div className="rounded-lg border border-[hsl(38,92%,50%)]/30 bg-[hsl(48,96%,89%)]/50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[hsl(38,92%,50%)] mt-0.5 shrink-0" />
        <div className="flex-1 space-y-2">
          <p className="text-sm text-foreground">
            Vous avez utilisé <span className="font-semibold">{percentage}%</span> de vos recommandations marketing ({used}/{limit}).
            {hasNextPlan && (
              <> Pensez à passer au plan <span className="font-semibold">{nextPlanLabel}</span> pour augmenter votre limite.</>
            )}
          </p>
          {hasNextPlan && (
            <Button
              size="sm"
              className="mt-1 bg-destructive text-white hover:bg-destructive/90"
              onClick={() => window.open(PORTAL_BILLING_URL, "_blank")}
            >
              Mettre à niveau <ArrowUpRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
