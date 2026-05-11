import { Mail, Sparkles, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { RecommendationCard } from "./RecommendationCard";
import { Button } from "@/components/ui/button";
import { type Recommendation, type QuotaData } from "@/hooks/useMarketingRecommendations";
import { RecosQuotaBanner } from "./shared/RecosQuotaBanner";

interface RecosUsage {
  percentage: number; isWarning: boolean; isExceeded: boolean;
  used: number; limit: number; nextPlanLabel: string; nextPlanPrice: string; hasNextPlan: boolean;
}

interface Props {
  recommendations: Recommendation[];
  onGenerateRecommendation: () => void;
  onStatusChange: (id: string, status: "todo" | "in_progress" | "done") => void;
  isGenerating: boolean;
  quota: QuotaData;
  onOpenFeedback?: (rec: Recommendation) => void;
  recosUsage?: RecosUsage;
}

export function MarketingEmailsTab({ recommendations, onGenerateRecommendation, onStatusChange, isGenerating, quota, onOpenFeedback, recosUsage }: Props) {
  const allDone = recommendations.length > 0 && recommendations.every((r) => r.action_status === "done");
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
  const nextMonthName = nextMonth.toLocaleDateString("fr-FR", { month: "long" });
  const generationBlocked = recosUsage?.isExceeded ?? false;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-secondary" />
        <h3 className="text-xl font-bold text-foreground font-heading">Recommandations Emailing</h3>
        {recommendations.length > 0 && (
          <span className="text-sm text-muted-foreground ml-1">
            · {recommendations.length} recommandation{recommendations.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {recosUsage && <RecosQuotaBanner {...recosUsage} />}

      {!generationBlocked && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Génération en cours... ~30 secondes</p>
              <div className="w-full max-w-xs h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div className="h-full bg-primary/60 rounded-full" initial={{ width: "5%" }} animate={{ width: "90%" }} transition={{ duration: 30, ease: "linear" }} />
              </div>
            </div>
          ) : (
            <>
              <Button onClick={onGenerateRecommendation} disabled={quota.remaining <= 0} className="w-full" size="lg">
                <Sparkles className="w-4 h-4 mr-2" />
                Générer une recommandation Emailing
                <span className="ml-2 text-xs opacity-70">1 crédit</span>
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                {quota.remaining > 0
                  ? `${quota.remaining} crédit${quota.remaining !== 1 ? "s" : ""} restant${quota.remaining !== 1 ? "s" : ""} / ${quota.limit} ce mois`
                  : `Limite mensuelle atteinte. Renouvellement le 1er ${nextMonthName}.`}
              </p>
            </>
          )}
        </div>
      )}

      {allDone && <p className="text-sm text-primary font-medium">✓ Toutes les recommandations sont terminées</p>}

      {recommendations.length === 0 && !isGenerating ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Aucune recommandation Emailing pour le moment.{!generationBlocked && " Cliquez sur le bouton ci-dessus pour en générer une."}
        </p>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => (
            <div key={rec.id} id={`reco-${rec.id}`}>
              <RecommendationCard recommendation={rec} onStatusChange={onStatusChange} category="emails" onOpenFeedback={onOpenFeedback} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
