import { AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, History, Sparkles } from "lucide-react";
import { type Recommendation, type RecommendationStats, type QuotaData } from "@/hooks/useMarketingRecommendations";
import { OverviewTaskCard } from "./OverviewTaskCard";
import { OverviewHistoryCard } from "./OverviewHistoryCard";
import { RecosQuotaBanner } from "./shared/RecosQuotaBanner";

interface RecosUsage {
  percentage: number; isWarning: boolean; isExceeded: boolean;
  used: number; limit: number; nextPlanLabel: string; nextPlanPrice: string; hasNextPlan: boolean;
}

interface Props {
  activeTasks: Recommendation[];
  completedTasks: Recommendation[];
  stats: RecommendationStats;
  quota: QuotaData;
  onStatusChange: (id: string, status: "todo" | "in_progress" | "done") => void;
  onNavigateToDetail: (rec: Recommendation) => void;
  onOpenFeedback: (rec: Recommendation) => void;
  recosUsage?: RecosUsage;
}

export function MarketingOverviewTab({ activeTasks, completedTasks, stats, quota, onStatusChange, onNavigateToDetail, onOpenFeedback, recosUsage }: Props) {
  const activeCount = activeTasks.length;
  const doneCount = completedTasks.length;

  return (
    <div className="space-y-8">
      {recosUsage && <RecosQuotaBanner {...recosUsage} />}
      {/* Header stats */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          {stats.total > 0 && (
            <p className="text-xs text-muted-foreground">
              {stats.total} recommandation{stats.total !== 1 ? "s" : ""} cette semaine
              {stats.todo > 0 && <> · <span className="text-primary font-medium">{stats.todo} à traiter</span></>}
              {stats.in_progress > 0 && <> · <span className="text-accent-foreground font-medium">{stats.in_progress} en cours</span></>}
              {stats.done > 0 && <> · {stats.done} terminée{stats.done !== 1 ? "s" : ""}</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{quota.used} / {quota.limit} crédits utilisés ce mois</span>
        </div>
      </div>

      {/* ── Section 1: À traiter ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground font-heading">À traiter</h3>
          {activeCount > 0 && (
            <Badge className="bg-primary/15 text-primary border-primary/30 text-xs h-5 px-2">{activeCount}</Badge>
          )}
        </div>

        {activeCount === 0 ? (
          <div className="rounded-lg border border-border/40 bg-muted/10 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              ✨ Toutes vos recommandations sont traitées.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Générez-en de nouvelles dans les onglets Ads, Offres ou Emailing.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {activeTasks.map((rec) => (
                <OverviewTaskCard
                  key={rec.id}
                  recommendation={rec}
                  onStatusChange={onStatusChange}
                  onNavigateToDetail={onNavigateToDetail}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* ── Section 2: Historique ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-bold text-foreground/70 font-heading">Historique</h3>
          {doneCount > 0 && (
            <Badge variant="secondary" className="text-xs h-5 px-2">{doneCount}</Badge>
          )}
        </div>

        {doneCount === 0 ? (
          <p className="text-sm text-muted-foreground/60 py-4">
            Aucune recommandation terminée pour le moment.
          </p>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {completedTasks.map((rec) => (
                <OverviewHistoryCard
                  key={rec.id}
                  recommendation={rec}
                  onNavigateToDetail={onNavigateToDetail}
                  onOpenFeedback={onOpenFeedback}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  );
}
