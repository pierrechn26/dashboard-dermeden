import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Hand,
  User,
  Heart,
  Baby,
  Info,
  Droplets,
  Repeat,
  HelpCircle,
  Sparkles,
  Settings,
  Mail,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Timer,
  Loader2,
  Eye,
  ShoppingCart,
} from "lucide-react";
import { useDiagnosticStats } from "@/hooks/useDiagnosticStats";
import type { DateRange } from "react-day-picker";

interface DetailedFunnelVisualizationProps {
  dateRange?: DateRange;
}

const STEP_ICONS = [User, Heart, Baby, Info, Droplets, Repeat, HelpCircle, Sparkles, Settings, Mail, Eye];

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}min ${s.toString().padStart(2, "0")}sec`;
}

export function DetailedFunnelVisualization({ dateRange }: DetailedFunnelVisualizationProps) {
  const stats = useDiagnosticStats(dateRange);

  const { steps, biggestDrop, completionRate, avgTimePerStep } = useMemo(() => {
    const raw = stats.detailedFunnel;
    if (!raw || raw.length === 0) {
      return { steps: [], biggestDrop: null, completionRate: 0, avgTimePerStep: null };
    }

    const base = raw[0].count || 1;
    const stepsData = raw.map((s, i) => ({
      label: s.label,
      value: s.count,
      percentage: (s.count / base) * 100,
      icon: STEP_ICONS[i] || HelpCircle,
    }));

    // Biggest drop
    let maxDrop = { step: "", percent: 0 };
    for (let i = 1; i < stepsData.length; i++) {
      const prev = stepsData[i - 1].value;
      if (prev === 0) continue;
      const loss = ((prev - stepsData[i].value) / prev) * 100;
      if (loss > maxDrop.percent) {
        maxDrop = { step: stepsData[i].label, percent: loss };
      }
    }

    const completed = raw[raw.length - 1].count;
    const started = raw[0].count;
    const cr = started > 0 ? (completed / started) * 100 : 0;

    // Avg steps reached per session ≈ sum(step_counts) / total sessions
    const totalStepReaches = raw.reduce((sum, s) => sum + s.count, 0);
    const avgSteps = started > 0 ? totalStepReaches / started : 0;
    const avgDuration = stats.funnel.avgDurationSeconds;
    const avgPerStep = avgDuration && avgSteps > 0 ? Math.round(avgDuration / avgSteps) : null;

    return {
      steps: stepsData,
      biggestDrop: maxDrop.percent > 0 ? maxDrop : null,
      completionRate: cr,
      avgTimePerStep: avgPerStep,
    };
  }, [stats.detailedFunnel, stats.funnel.avgDurationSeconds]);

  if (stats.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const getLoss = (index: number) => {
    if (index === 0) return null;
    const prev = steps[index - 1];
    const curr = steps[index];
    if (prev.value === 0) return { percent: "—", volume: null, isGain: false };
    const diff = prev.value - curr.value;
    const diffPercent = ((Math.abs(diff) / prev.value) * 100).toFixed(0);
    return { percent: diffPercent, volume: Math.abs(diff), isGain: diff < 0 };
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground font-heading">
          Tunnel Diagnostic Détaillé
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Parcours étape par étape — Identifiez les points d'abandon
        </p>
      </div>

      {/* Funnel Card */}
      <Card className="border-border/50 shadow-lg overflow-hidden">
        <CardContent className="p-8 md:p-12">
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const loss = getLoss(index);
              const widthPercent = 100 - (index * (50 / steps.length));

              return (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.4 }}
                  className="flex items-center gap-4 md:gap-8"
                >
                  <div className="flex-1 flex justify-center">
                    <div
                      className="h-14 md:h-16 rounded-xl flex items-center justify-between px-4 md:px-6 transition-all duration-300 hover:scale-[1.01] cursor-default shadow-md"
                      style={{
                        width: `${widthPercent}%`,
                        minWidth: "280px",
                        background: `linear-gradient(135deg, hsl(348 83% 47%) 0%, hsl(330 81% 60%) 100%)`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-white font-medium text-sm hidden sm:block">
                          {step.label}
                        </span>
                      </div>

                      <div className="text-right">
                        <div className="text-white font-bold text-base md:text-lg">
                          {step.percentage.toFixed(1)}%
                        </div>
                        <div className="text-white/80 text-sm">
                          {step.value.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-28 md:w-36 flex-shrink-0">
                    {loss && (
                      <div
                        className={`flex items-center gap-2 p-2 md:p-3 rounded-xl border ${
                          loss.isGain
                            ? "bg-green-500/10 border-green-500/20"
                            : "bg-destructive/10 border-destructive/20"
                        }`}
                      >
                        <TrendingDown
                          className={`w-4 h-4 flex-shrink-0 ${
                            loss.isGain ? "text-green-600 rotate-180" : "text-destructive"
                          }`}
                        />
                        <div className="flex flex-col">
                          <span
                            className={`text-sm font-bold ${
                              loss.isGain ? "text-green-600" : "text-destructive"
                            }`}
                          >
                            {loss.volume !== null ? `${loss.isGain ? "+" : "-"}${loss.percent}%` : "—"}
                          </span>
                          {loss.volume !== null && (
                            <span className="text-xs text-muted-foreground">
                              {loss.isGain ? "+" : "-"}
                              {loss.volume.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-10 pt-8 border-t border-border/30">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="text-center p-4 md:p-6 rounded-2xl bg-gradient-to-br from-destructive/5 to-destructive/10 border border-destructive/10"
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <p className="text-2xl md:text-3xl font-bold text-destructive">
                {biggestDrop ? `${biggestDrop.percent.toFixed(0)}%` : "—"}
              </p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Plus gros point d'abandon
              </p>
              {biggestDrop && (
                <p className="text-xs text-destructive/80 mt-0.5">
                  à l'étape « {biggestDrop.step} »
                </p>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="text-center p-4 md:p-6 rounded-2xl bg-gradient-to-br from-green-500/5 to-green-500/10 border border-green-500/10"
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-2xl md:text-3xl font-bold text-foreground">
                {completionRate.toFixed(1)}%
              </p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Taux de complétion
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="text-center p-4 md:p-6 rounded-2xl bg-gradient-to-br from-blue-500/5 to-blue-500/10 border border-blue-500/10"
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <Timer className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl md:text-3xl font-bold text-blue-600">
                {avgTimePerStep != null ? `${avgTimePerStep}sec` : "—"}
              </p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Temps moyen par étape
              </p>
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
