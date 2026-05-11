import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { 
  Globe, 
  MousePointer, 
  Play, 
  Mail,
  CheckCircle, 
  Package, 
  ShoppingCart, 
  CreditCard, 
  Heart,
  AlertTriangle,
  Lightbulb,
  TrendingDown,
  Loader2,
  RefreshCw,
  Sparkles,
  RotateCcw
} from "lucide-react";
import { useDiagnosticStats } from "@/hooks/useDiagnosticStats";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useToast } from "@/hooks/use-toast";

interface FunnelRecommendation {
  id: string;
  step: string;
  issue: string;
  recommendation: string;
  applied: boolean;
  applied_at: string | null;
  kept_from_previous: boolean;
  week_start: string;
}

const STEP_ICONS = [Globe, MousePointer, Play, CheckCircle, Mail, Package, ShoppingCart, CreditCard, Heart];
const STEP_LABELS = [
  "Visite du site",
  "Vues diagnostic",
  "Diagnostic démarré",
  "Diagnostic complété",
  "Opt-in E-mail & SMS",
  "Recommandation affichée",
  "Ajout panier",
  "Checkout",
  "Achat",
];

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}min ${s.toString().padStart(2, "0")}sec`;
}

interface FunnelVisualizationProps {
  dateRange?: DateRange;
}

export function FunnelVisualization({ dateRange }: FunnelVisualizationProps) {
  const stats = useDiagnosticStats(dateRange);
  const { toast } = useToast();
  const [ga4Data, setGa4Data] = useState<{ site_sessions: number; diagnostic_page_sessions: number } | null>(null);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [recommendations, setRecommendations] = useState<FunnelRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Fetch recommendations from DB
  const fetchRecommendations = useCallback(async () => {
    setRecsLoading(true);
    try {
      const { data, error } = await supabase
        .from("funnel_recommendations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (!error && data) {
        // Show latest 3 non-applied + any applied ones from current week
        const nonApplied = data.filter((r: any) => !r.applied).slice(0, 3);
        const applied = data.filter((r: any) => r.applied);
        setRecommendations([...nonApplied, ...applied].slice(0, 6));
      }
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
    } finally {
      setRecsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Toggle applied status
  const toggleApplied = async (rec: FunnelRecommendation) => {
    const newApplied = !rec.applied;
    const { error } = await supabase
      .from("funnel_recommendations")
      .update({ 
        applied: newApplied, 
        applied_at: newApplied ? new Date().toISOString() : null 
      })
      .eq("id", rec.id);
    
    if (!error) {
      setRecommendations(prev => prev.map(r => 
        r.id === rec.id ? { ...r, applied: newApplied, applied_at: newApplied ? new Date().toISOString() : null } : r
      ));
      if (newApplied) {
        toast({ title: "✅ Recommandation appliquée", description: "Bravo ! Cette recommandation a été marquée comme appliquée." });
      }
    }
  };

  // Manual trigger for generating recommendations
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke("generate-funnel-recommendations", { body: {} });
      if (error) throw error;
      await fetchRecommendations();
      toast({ title: "Recommandations générées", description: "3 nouvelles recommandations IA ont été créées à partir de l'analyse du tunnel." });
    } catch (err) {
      console.error("Generation error:", err);
      toast({ title: "Erreur", description: "Impossible de générer les recommandations.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const activeRecs = recommendations.filter(r => !r.applied);
  const appliedRecs = recommendations.filter(r => r.applied);

  useEffect(() => {
    const fetchGA4 = async () => {
      setGa4Loading(true);
      try {
        const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "2026-02-08";
        const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
        
        const { data, error } = await supabase.functions.invoke("ga4-analytics", {
          body: { start_date: startDate, end_date: endDate },
        });
        
        if (error) {
          console.error("GA4 fetch error:", error);
          setGa4Data(null);
        } else {
          setGa4Data(data);
        }
      } catch (err) {
        console.error("GA4 fetch error:", err);
        setGa4Data(null);
      } finally {
        setGa4Loading(false);
      }
    };
    fetchGA4();
  }, [dateRange?.from?.getTime(), dateRange?.to?.getTime()]);

  if (stats.isLoading || ga4Loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const { funnel } = stats;

  // Build steps: order is Visite, Vues, Démarré, Complété, Opt-in, Reco, Panier, Checkout, Achat
  const stepValues = [
    ga4Data?.site_sessions ?? 0, // Visite du site (GA4)
    ga4Data?.diagnostic_page_sessions ?? 0, // Vues diagnostic (GA4)
    funnel.started,
    funnel.completed,
    funnel.optinEmail,
    funnel.recommendation,
    funnel.addToCart, // Ajout panier
    funnel.checkout, // Checkout
    funnel.purchase,
  ];

  const diagnosticViews = stepValues[1] || 1; // base = diagnostic page views (100%)

  const funnelSteps = STEP_LABELS.map((label, i) => {
    const value = stepValues[i];
    // Step 0 (Visite du site) shows only volume, no percentage
    const isSiteVisit = i === 0;
    const percentage = isSiteVisit ? null : (value / diagnosticViews) * 100;
    return { label, value, percentage, icon: STEP_ICONS[i], isPlaceholder: false, isSiteVisit };
  });

  const getLoss = (index: number) => {
    if (index === 0) return null;
    const prev = funnelSteps[index - 1];
    const curr = funnelSteps[index];
    if (prev.isPlaceholder || curr.isPlaceholder) {
      return { percent: "—", volume: null, isGain: false };
    }
    if (prev.value === 0) return { percent: "—", volume: null, isGain: false };
    const diff = prev.value - curr.value;
    const diffPercent = ((Math.abs(diff) / prev.value) * 100).toFixed(0);
    return { percent: diffPercent, volume: Math.abs(diff), isGain: diff < 0 };
  };

  const siteVisits = stepValues[0] || 0;
  const conversionRate = diagnosticViews > 1 ? ((funnel.purchase / diagnosticViews) * 100).toFixed(1) : "0.0";
  const visiteursPerdus = (stepValues[1] || 0) - funnel.purchase;
  const avgOrderAmount = funnel.avgOrderAmount;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground font-heading">
          Tunnel de Conversion
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Parcours client complet avec zones de friction détectées
        </p>
      </div>

      {/* Funnel Card */}
      <Card className="border-border/50 shadow-lg overflow-hidden">
        <CardContent className="p-8 md:p-12">
          <div className="space-y-4">
            {funnelSteps.map((step, index) => {
              const Icon = step.icon;
              const loss = getLoss(index);
              const widthPercent = 100 - (index * 6);
              
              return (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.07, duration: 0.4 }}
                  className="flex items-center gap-4 md:gap-8"
                >
                  <div className="flex-1 flex justify-center">
                    <div
                      className={`h-14 md:h-16 rounded-xl flex items-center justify-between px-4 md:px-6 transition-all duration-300 hover:scale-[1.01] cursor-default shadow-md ${step.isPlaceholder ? 'opacity-40' : ''}`}
                      style={{
                        width: `${widthPercent}%`,
                        minWidth: '280px',
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
                        {step.isSiteVisit ? (
                          <div className="text-white font-bold text-xl md:text-2xl">
                            {step.value.toLocaleString()}
                          </div>
                        ) : (
                          <>
                            <div className="text-white font-bold text-base md:text-lg">
                              {step.isPlaceholder ? "—" : `${step.percentage!.toFixed(1)}%`}
                            </div>
                            <div className="text-white/80 text-sm">
                              {step.isPlaceholder ? "—" : step.value.toLocaleString()}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="w-28 md:w-36 flex-shrink-0">
                    {loss && (
                      <div className={`flex items-center gap-2 p-2 md:p-3 rounded-xl border ${
                        loss.isGain 
                          ? 'bg-green-500/10 border-green-500/20' 
                          : 'bg-destructive/10 border-destructive/20'
                      }`}>
                        <TrendingDown className={`w-4 h-4 flex-shrink-0 ${
                          loss.isGain ? 'text-green-600 rotate-180' : 'text-destructive'
                        }`} />
                        <div className="flex flex-col">
                          <span className={`text-sm font-bold ${
                            loss.isGain ? 'text-green-600' : 'text-destructive'
                          }`}>
                            {loss.volume !== null ? `${loss.isGain ? '+' : '-'}${loss.percent}%` : "—"}
                          </span>
                          {loss.volume !== null && (
                            <span className="text-xs text-muted-foreground">
                              {loss.isGain ? '+' : '-'}{loss.volume.toLocaleString()}
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

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-10 pt-8 border-t border-border/30">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="text-center p-4 md:p-6 rounded-2xl bg-gradient-to-br from-sky-500/5 to-sky-500/10 border border-sky-500/10"
            >
              <p className="text-2xl md:text-3xl font-bold text-sky-600">{conversionRate}%</p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Taux de conversion*
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                *Sur les vues diagnostic
              </p>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 }}
              className="text-center p-4 md:p-6 rounded-2xl bg-gradient-to-br from-destructive/5 to-destructive/10 border border-destructive/10"
            >
              <p className="text-2xl md:text-3xl font-bold text-destructive">{visiteursPerdus.toLocaleString()}</p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Visiteurs perdus (diag→achat)
              </p>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="text-center p-4 md:p-6 rounded-2xl bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border border-emerald-500/10"
            >
              <p className="text-2xl md:text-3xl font-bold text-emerald-600">
                {avgOrderAmount != null ? `${avgOrderAmount.toFixed(2)}€` : "—"}
              </p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Panier moyen (commandes)
              </p>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              className="text-center p-4 md:p-6 rounded-2xl bg-gradient-to-br from-blue-500/5 to-blue-500/10 border border-blue-500/10"
            >
              <p className="text-2xl md:text-3xl font-bold text-blue-600">{formatDuration(funnel.avgDurationSeconds)}</p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Temps moyen
              </p>
            </motion.div>
          </div>
        </CardContent>
      </Card>

      {/* Frictions & Recommendations IA */}
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-heading font-semibold text-foreground flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              Frictions détectées & Recommandations IA
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="gap-2"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {generating ? "Analyse en cours..." : "Générer maintenant"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Analyse automatique chaque lundi basée sur les 7 derniers jours — Les recommandations non appliquées peuvent être conservées
          </p>
        </CardHeader>
        <CardContent>
          {recsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeRecs.length === 0 && appliedRecs.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                <Sparkles className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Aucune recommandation générée</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cliquez sur "Générer maintenant" pour lancer la première analyse IA du tunnel
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active recommendations */}
              {activeRecs.length > 0 && (
                <div className="grid md:grid-cols-3 gap-6">
                  <AnimatePresence>
                    {activeRecs.map((rec, index) => (
                      <motion.div
                        key={rec.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.1 }}
                        className="p-5 rounded-2xl bg-gradient-to-br from-muted/60 to-muted/30 border border-border/40 space-y-4 hover:shadow-lg hover:border-border/60 hover:from-muted/80 hover:to-muted/50 transition-all duration-300"
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-xs font-semibold bg-background/80 text-foreground border border-border/50 hover:bg-background/80 hover:text-foreground">
                            {rec.step}
                          </Badge>
                          {rec.kept_from_previous && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <RotateCcw className="w-3 h-3" />
                              Conservée
                            </Badge>
                          )}
                        </div>

                        <div className="flex gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/10">
                          <div className="w-8 h-8 rounded-lg bg-destructive/15 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                          </div>
                          <p className="text-sm text-foreground font-medium leading-relaxed">
                            {rec.issue}
                          </p>
                        </div>

                        <div className="flex gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                            <Lightbulb className="w-4 h-4 text-emerald-600" />
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">
                            {rec.recommendation}
                          </p>
                        </div>

                        <div
                          className="flex items-center gap-3 pt-2 border-t border-border/30 cursor-pointer group"
                          onClick={() => toggleApplied(rec)}
                        >
                          <Checkbox
                            checked={false}
                            className="h-5 w-5"
                          />
                          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                            Recommandation appliquée
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Applied recommendations */}
              {appliedRecs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Recommandations appliquées
                  </h4>
                  <div className="grid md:grid-cols-3 gap-4">
                    {appliedRecs.map((rec) => (
                      <motion.div
                        key={rec.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                            {rec.step}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {rec.applied_at ? format(new Date(rec.applied_at), "dd/MM") : ""}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-through">{rec.issue}</p>
                        <p className="text-xs text-foreground">{rec.recommendation}</p>
                        <div
                          className="flex items-center gap-3 pt-1 cursor-pointer"
                          onClick={() => toggleApplied(rec)}
                        >
                          <Checkbox checked={true} className="h-4 w-4" />
                          <span className="text-xs text-primary font-medium">
                            ✅ Appliquée
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
