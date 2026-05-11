import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Rocket, Target, RefreshCw } from "lucide-react";
import { FormatBadge, getFormatLabel } from "./shared/FormatBadge";
import { type Recommendation } from "@/hooks/useMarketingRecommendations";
import { getPersonaDisplayName } from "@/constants/personas";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = { ads: "Ads", emails: "Emailing", offers: "Offres" };
const CATEGORY_COLORS: Record<string, string> = {
  ads: "bg-primary/15 text-primary border-primary/30",
  emails: "bg-secondary/15 text-secondary border-secondary/30",
  offers: "bg-accent/15 text-accent-foreground border-accent/30",
};

const FEEDBACK_LABELS: Record<string, { label: string; color: string }> = {
  good: { label: "🟢 Bon", color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  average: { label: "🟡 Moyen", color: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  poor: { label: "🔴 Mauvais", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

function resolvePersonaCodes(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\bP(\d{1,2})\b/g, (match) => getPersonaDisplayName(match));
}

function sanitizeAndRenderMd(text: string): string {
  if (!text) return "";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

// ── Analysis Generator ──────────────────────────────────────────────

interface AnalysisBlock {
  icon: React.ReactNode;
  title: string;
  color: string;
  bullets: string[];
}

function generateAnalysis(rec: Recommendation): AnalysisBlock | null {
  const score = rec.feedback_score;
  if (!score) return null;

  const category = rec.category || "ads";
  const format = rec.content?.format || "";
  const persona = resolvePersonaCodes(rec.persona_cible || rec.persona_code || "");
  const feedbackResults = rec.feedback_results || {};
  const kpiAttendus = rec.targeting?.kpi_attendu || {};

  // Normalize KPI for comparison
  const normalizeKpi = (kpi: any): Record<string, string> => {
    if (!kpi) return {};
    if (Array.isArray(kpi)) {
      const out: Record<string, string> = {};
      kpi.forEach((item: any) => {
        if (item?.metrique && item?.valeur_cible) out[item.metrique] = String(item.valeur_cible);
      });
      return out;
    }
    // Handle flat {metrique, valeur_cible, metrique_secondaire, valeur_secondaire} format
    if (kpi.metrique && kpi.valeur_cible) {
      const out: Record<string, string> = { [kpi.metrique]: String(kpi.valeur_cible) };
      if (kpi.metrique_secondaire && kpi.valeur_secondaire) {
        out[kpi.metrique_secondaire] = String(kpi.valeur_secondaire);
      }
      return out;
    }
    const out: Record<string, string> = {};
    Object.entries(kpi).forEach(([k, v]) => { out[k] = String(v); });
    return out;
  };

  const kpiNorm = normalizeKpi(kpiAttendus);
  const metricNames = Object.keys(kpiNorm);

  // Build metric comparison strings
  const metricComparisons: string[] = [];
  metricNames.forEach((metric) => {
    const target = kpiNorm[metric];
    const resultKey = metric === "CTR" ? "ctr" : metric === "ROAS" ? "roas" : metric === "taux_ouverture_vise" ? "taux_ouverture" : metric === "taux_clic_vise" ? "taux_clic" : metric === "CPA" ? "cpa" : metric;
    const actual = feedbackResults[resultKey];
    if (actual !== undefined && actual !== null) {
      metricComparisons.push(`${metric} : ${actual} (objectif : ${target})`);
    }
  });

  const formatLabel = format ? `le format ${getFormatLabel(format)}` : "ce format";
  const categoryLabel = CATEGORY_LABELS[category] || category;

  if (score === "good") {
    const bullets: string[] = [];

    if (metricComparisons.length > 0) {
      bullets.push(`Résultats au-dessus des objectifs — ${metricComparisons.join(", ")}`);
    }

    bullets.push(
      `✅ Scaler : Augmenter le budget sur ${formatLabel} pour ${persona || "ce persona"} — l'audience répond bien`,
      `✅ Répliquer : Tester le même angle ${formatLabel} sur d'autres personas avec un profil similaire`,
      `✅ Prioriser : Allouer plus de ressources à la catégorie ${categoryLabel} qui montre un fort ROI`,
    );

    if (category === "ads") {
      bullets.push(`✅ Itérer : Créer des variantes du visuel/hook en gardant le même angle pour éviter la fatigue pub`);
    } else if (category === "emails") {
      bullets.push(`✅ Segmenter : Affiner la segmentation pour maximiser les taux sur ce type d'email`);
    } else if (category === "offers") {
      bullets.push(`✅ Prolonger : Envisager de prolonger ou de décliner cette offre en version saisonnière`);
    }

    return {
      icon: <Rocket className="w-4 h-4" />,
      title: "Comment capitaliser sur ce succès",
      color: "border-emerald-500/30 bg-emerald-500/5",
      bullets,
    };
  }

  if (score === "average") {
    const bullets: string[] = [];

    if (metricComparisons.length > 0) {
      bullets.push(`Résultats proches des objectifs — ${metricComparisons.join(", ")}`);
    }

    bullets.push(
      `⚡ Optimiser le ciblage : Affiner l'audience ${persona ? `de ${persona}` : ""} — tester des segments plus précis`,
      `⚡ Tester des variantes : Modifier le hook ou l'accroche tout en gardant le concept de base`,
    );

    if (category === "ads") {
      bullets.push(
        `⚡ Créatif : Tester un nouveau visuel (UGC, carrousel, vidéo courte) avec le même message`,
        `⚡ Placement : Vérifier la répartition par placement (stories vs feed vs reels) et couper les moins performants`,
      );
    } else if (category === "emails") {
      bullets.push(
        `⚡ Objet : Tester un objet d'email plus court/percutant ou avec un emoji`,
        `⚡ Timing : Essayer un autre jour/heure d'envoi pour améliorer le taux d'ouverture`,
      );
    } else if (category === "offers") {
      bullets.push(
        `⚡ Valeur perçue : Renforcer la perception de valeur (ajouter un cadeau plutôt qu'augmenter la remise)`,
        `⚡ Urgence : Ajouter un déclencheur d'urgence (quantité limitée, durée courte)`,
      );
    }

    return {
      icon: <Target className="w-4 h-4" />,
      title: "Pistes d'optimisation",
      color: "border-amber-500/30 bg-amber-500/5",
      bullets,
    };
  }

  if (score === "poor") {
    const bullets: string[] = [];

    if (metricComparisons.length > 0) {
      bullets.push(`Résultats en dessous des objectifs — ${metricComparisons.join(", ")}`);
    }

    bullets.push(
      `🔄 Changer d'angle : ${formatLabel} n'a pas résonné avec ${persona || "cette audience"} — tester un angle radicalement différent`,
      `🔄 Revoir le ciblage : L'audience n'était peut-être pas la bonne — vérifier la pertinence du persona`,
    );

    if (category === "ads") {
      bullets.push(
        `🔄 Créatif : Abandonner ce type de visuel et tester un format complètement différent`,
        `🔄 Message : Le bénéfice mis en avant ne parle pas à l'audience — identifier un autre pain point`,
        `🔄 Ne pas augmenter le budget — couper cette approche et réallouer`,
      );
    } else if (category === "emails") {
      bullets.push(
        `🔄 Objet : L'email n'a probablement pas été ouvert — retravailler complètement l'objet`,
        `🔄 Liste : Vérifier la qualité du segment — possiblement trop large ou mal qualifié`,
        `🔄 Contenu : Simplifier le message et rendre le CTA plus visible/urgent`,
      );
    } else if (category === "offers") {
      bullets.push(
        `🔄 Proposition : L'offre n'était pas assez attractive ou pas assez claire`,
        `🔄 Canal : Tester le même type d'offre sur un autre canal de diffusion`,
        `🔄 Timing : Vérifier si le moment était pertinent (saison, événement, besoin)`,
      );
    }

    return {
      icon: <RefreshCw className="w-4 h-4" />,
      title: "Analyse et recommandations correctives",
      color: "border-destructive/30 bg-destructive/5",
      bullets,
    };
  }

  return null;
}

// ── Component ────────────────────────────────────────────────────────

interface Props {
  recommendation: Recommendation;
  onNavigateToDetail: (rec: Recommendation) => void;
  onOpenFeedback: (rec: Recommendation) => void;
}

export function OverviewHistoryCard({ recommendation: rec, onNavigateToDetail, onOpenFeedback }: Props) {
  const [expanded, setExpanded] = useState(false);
  const category = rec.category || "ads";
  const personaLabel = resolvePersonaCodes(rec.persona_cible || rec.persona_code || "");
  const contentFormat = rec.content?.format;
  const feedback = rec.feedback_score ? FEEDBACK_LABELS[rec.feedback_score] : null;
  const analysis = generateAnalysis(rec);

  const completedDate = rec.completed_at
    ? new Date(rec.completed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const kpiAttendus = rec.targeting?.kpi_attendu;
  const feedbackResults = rec.feedback_results || {};
  const periode = feedbackResults.periode;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card className="border border-border/40 bg-muted/20 shadow-none hover:shadow-sm transition-shadow overflow-hidden">
        <div className="p-4 space-y-2">
          {/* Row 1 */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 font-semibold bg-primary/15 text-primary border-primary/30">
                ● Terminée
              </Badge>
              {contentFormat && <FormatBadge value={contentFormat} />}
              <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0 h-5 font-semibold", CATEGORY_COLORS[category])}>
                {CATEGORY_LABELS[category] || category}
              </Badge>
            </div>
            {completedDate && <span className="text-xs text-muted-foreground">{completedDate}</span>}
          </div>

          {/* Title */}
          <h4 className="text-sm font-semibold text-foreground/80 leading-snug">
            {(rec.title || "Recommandation").replace(/\bP(\d{1,2})\b/g, (m) => getPersonaDisplayName(m))}
          </h4>
          {personaLabel && <p className="text-xs text-muted-foreground">Pour {personaLabel}</p>}

          {/* Feedback row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Résultat :</span>
              {feedback ? (
                <Badge variant="outline" className={cn("text-[11px] px-2 py-0 h-5 font-semibold", feedback.color)}>
                  {feedback.label}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground/60 italic">Pas encore renseigné</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenFeedback(rec)}
            >
              {feedback ? "Modifier résultat" : "Ajouter résultat"}
            </Button>
          </div>

          {/* Analysis Preview (always visible when feedback exists) */}
          {analysis && (
            <div className={cn("rounded-lg border p-3 mt-1", analysis.color)}>
              <div className="flex items-center gap-2 mb-2">
                {analysis.icon}
                <span className="text-xs font-semibold">{analysis.title}</span>
              </div>
              {/* Show first 2 bullets as preview */}
              <ul className="space-y-1">
                {analysis.bullets.slice(0, 2).map((bullet, i) => (
                  <li key={i} className="text-xs leading-relaxed text-foreground/80">{bullet}</li>
                ))}
              </ul>
              {analysis.bullets.length > 2 && !expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="text-xs font-medium text-primary hover:text-primary/80 mt-1.5 transition-colors"
                >
                  Voir toutes les recommandations ({analysis.bullets.length - 2} de plus) →
                </button>
              )}
            </div>
          )}

          {/* No feedback yet prompt */}
          {!feedback && rec.action_status === "done" && (
            <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-3 mt-1">
              <p className="text-xs text-muted-foreground text-center">
                📊 Ajoutez vos résultats pour débloquer l'analyse de performance et les recommandations d'optimisation
              </p>
            </div>
          )}

          {/* Footer: detail link + expand */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => onNavigateToDetail(rec)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Voir le détail
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expanded details */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
                {/* Full analysis bullets */}
                {analysis && analysis.bullets.length > 2 && (
                  <div className={cn("rounded-lg border p-3", analysis.color)}>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Toutes les recommandations
                    </p>
                    <ul className="space-y-1.5">
                      {analysis.bullets.slice(2).map((bullet, i) => (
                        <li key={i} className="text-xs leading-relaxed text-foreground/80">{bullet}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Period */}
                {periode && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Période de test</p>
                    <p className="text-xs text-foreground/80">
                      {new Date(periode.debut).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      {" → "}
                      {new Date(periode.fin).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      {" "}({periode.duree_jours} jours)
                    </p>
                  </div>
                )}

                {/* Feedback results vs KPI */}
                {rec.feedback_entered_at && kpiAttendus && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Résultats vs objectifs</p>
                    <div className="space-y-2">
                      {(() => {
                        const normalize = (kpi: any): Record<string, string> => {
                          if (Array.isArray(kpi)) {
                            const out: Record<string, string> = {};
                            kpi.forEach((item: any) => {
                              if (item?.metrique && item?.valeur_cible) out[item.metrique] = String(item.valeur_cible);
                            });
                            return out;
                          }
                          if (kpi.metrique && kpi.valeur_cible) {
                            const out: Record<string, string> = { [kpi.metrique]: String(kpi.valeur_cible) };
                            if (kpi.metrique_secondaire && kpi.valeur_secondaire) {
                              out[kpi.metrique_secondaire] = String(kpi.valeur_secondaire);
                            }
                            return out;
                          }
                          const out: Record<string, string> = {};
                          Object.entries(kpi).forEach(([k, v]) => { out[k] = String(v); });
                          return out;
                        };

                        // Format metric values with proper units
                        const formatMetricValue = (key: string, value: any): string => {
                          if (value === undefined || value === null) return "—";
                          const num = parseFloat(String(value));
                          if (isNaN(num)) return String(value);
                          const k = key.toLowerCase();
                          if (k.includes("ctr") || k.includes("taux") || k.includes("ouverture") || k.includes("clic")) {
                            return `${num.toFixed(1)}%`;
                          }
                          if (k.includes("roas")) return `${num.toFixed(1)}x`;
                          if (k.includes("cpa") || k.includes("cpc") || k.includes("budget") || k.includes("ca") || k.includes("aov") || k.includes("panier")) {
                            return `${num.toFixed(0)}€`;
                          }
                          if (Number.isInteger(num)) return num.toLocaleString("fr-FR");
                          return num.toFixed(1);
                        };

                        const kpiNorm = normalize(kpiAttendus);
                        return Object.entries(kpiNorm).map(([k, v]) => {
                          const resultKey = k === "CTR" ? "ctr" : k === "ROAS" ? "roas" : k === "taux_ouverture_vise" ? "taux_ouverture" : k === "taux_clic_vise" ? "taux_clic" : k;
                          const actual = feedbackResults[resultKey];
                          const actualNum = parseFloat(String(actual));
                          const targetNum = parseFloat(String(v).replace(/[^0-9.,]/g, "").replace(",", "."));
                          const isAbove = !isNaN(actualNum) && !isNaN(targetNum) && actualNum > targetNum;
                          const isBelow = !isNaN(actualNum) && !isNaN(targetNum) && actualNum < targetNum * 0.8;
                          const statusColor = isAbove ? "border-emerald-500/40 bg-emerald-500/5" : isBelow ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30";

                          return (
                            <div key={k} className={cn("rounded-md border p-2.5 flex items-center justify-between", statusColor)}>
                              <div className="flex items-center gap-2">
                                {isAbove && <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                {isBelow && <TrendingDown className="w-3.5 h-3.5 text-destructive shrink-0" />}
                                {!isAbove && !isBelow && <span className="w-3.5 h-3.5 shrink-0" />}
                                <span className="text-xs font-medium text-foreground/70">{k}</span>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className={cn("text-sm font-bold", isAbove ? "text-emerald-600" : isBelow ? "text-destructive" : "text-foreground")}>
                                  {formatMetricValue(k, actual)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  objectif {String(v)}
                                </span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* Brief */}
                {rec.brief && !rec.feedback_entered_at && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Brief</p>
                    <p
                      className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line"
                      dangerouslySetInnerHTML={{ __html: sanitizeAndRenderMd(rec.brief.replace(/\bP(\d{1,2})\b/g, (m) => getPersonaDisplayName(m))) }}
                    />
                  </div>
                )}

                {/* KPI attendus (when no feedback yet) */}
                {!rec.feedback_entered_at && kpiAttendus && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">KPI attendus</p>
                    <div className="text-xs text-foreground/80 space-y-0.5">
                      {(() => {
                        const normalize = (kpi: any): Record<string, string> => {
                          if (Array.isArray(kpi)) {
                            const out: Record<string, string> = {};
                            kpi.forEach((item: any) => {
                              if (item?.metrique && item?.valeur_cible) out[item.metrique] = String(item.valeur_cible);
                            });
                            return out;
                          }
                          if (kpi.metrique && kpi.valeur_cible) {
                            const out: Record<string, string> = { [kpi.metrique]: String(kpi.valeur_cible) };
                            if (kpi.metrique_secondaire && kpi.valeur_secondaire) {
                              out[kpi.metrique_secondaire] = String(kpi.valeur_secondaire);
                            }
                            return out;
                          }
                          const out: Record<string, string> = {};
                          Object.entries(kpi).forEach(([k, v]) => { out[k] = String(v); });
                          return out;
                        };
                        return Object.entries(normalize(kpiAttendus)).map(([k, v]) => (
                          <p key={k}><span className="text-muted-foreground">{k} :</span> {String(v)}</p>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Feedback notes */}
                {rec.feedback_notes && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-xs text-foreground/80">{rec.feedback_notes}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
