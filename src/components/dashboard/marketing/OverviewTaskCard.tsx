import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight } from "lucide-react";
import { FormatBadge } from "./shared/FormatBadge";
import { type Recommendation } from "@/hooks/useMarketingRecommendations";
import { getPersonaDisplayName } from "@/constants/personas";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = { ads: "Ads", emails: "Emailing", offers: "Offres" };
const CATEGORY_COLORS: Record<string, string> = {
  ads: "bg-primary/15 text-primary border-primary/30",
  emails: "bg-secondary/15 text-secondary border-secondary/30",
  offers: "bg-accent/15 text-accent-foreground border-accent/30",
};

const STATUS_OPTIONS = [
  { value: "todo", label: "À faire", icon: "○" },
  { value: "in_progress", label: "En cours", icon: "◐" },
  { value: "done", label: "Terminée", icon: "●" },
] as const;

function resolvePersonaCodes(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\bP(\d{1,2})\b/g, (match) => getPersonaDisplayName(match));
}

function sanitizeAndRenderMd(text: string): string {
  if (!text) return "";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

interface Props {
  recommendation: Recommendation;
  onStatusChange: (id: string, status: "todo" | "in_progress" | "done") => void;
  onNavigateToDetail: (rec: Recommendation) => void;
}

export function OverviewTaskCard({ recommendation: rec, onStatusChange, onNavigateToDetail }: Props) {
  const category = rec.category || "ads";
  const personaLabel = resolvePersonaCodes(rec.persona_cible || rec.persona_code || "");
  const contentFormat = rec.content?.format;
  const priorityLabel = rec.priority === 1 ? "★ Priorité haute" : rec.priority === 2 ? "★★ Moyenne" : "★★★ Basse";
  const priorityColor = rec.priority === 1 ? "text-primary" : rec.priority === 2 ? "text-accent-foreground" : "text-muted-foreground";
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === rec.action_status) || STATUS_OPTIONS[0];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="border border-border/60 shadow-sm hover:shadow-md transition-shadow p-4 space-y-2.5">
        {/* Row 1: badges + status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center flex-wrap gap-1.5">
            <span className={cn("text-[11px] font-bold", priorityColor)}>{priorityLabel}</span>
            {contentFormat && <FormatBadge value={contentFormat} />}
            <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0 h-5 font-semibold", CATEGORY_COLORS[category])}>
              {CATEGORY_LABELS[category] || category}
            </Badge>
          </div>
          {/* Inline status selector */}
          <div className="flex items-center gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onStatusChange(rec.id, opt.value)}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full border transition-all font-medium",
                  rec.action_status === opt.value
                    ? opt.value === "done" ? "bg-primary text-primary-foreground border-primary"
                      : opt.value === "in_progress" ? "bg-accent/20 text-accent-foreground border-accent/40"
                      : "bg-muted text-foreground border-border"
                    : "bg-transparent text-muted-foreground border-border/50 hover:border-border hover:text-foreground"
                )}
              >
                {opt.value === "done" && rec.action_status === "done" && <Check className="w-3 h-3 inline mr-0.5" />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <h4 className="text-sm font-bold text-foreground leading-snug">
          {(rec.title || "Recommandation").replace(/\bP(\d{1,2})\b/g, (m) => getPersonaDisplayName(m))}
        </h4>
        {personaLabel && <p className="text-xs text-muted-foreground">Pour {personaLabel}</p>}

        {/* Brief */}
        {rec.brief && (
          <p
            className="text-[13px] text-foreground/80 leading-relaxed line-clamp-3"
            dangerouslySetInnerHTML={{ __html: sanitizeAndRenderMd(rec.brief.replace(/\bP(\d{1,2})\b/g, (m) => getPersonaDisplayName(m))) }}
          />
        )}

        {/* Navigate link */}
        <button
          onClick={() => onNavigateToDetail(rec)}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors pt-1"
        >
          Voir le détail
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </Card>
    </motion.div>
  );
}
