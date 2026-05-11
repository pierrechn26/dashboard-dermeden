import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Users, TrendingUp, ShoppingCart, Zap } from "lucide-react";
import { usePersonaStats, PersonaStat } from "@/hooks/usePersonaStats";
import { usePersonaProfiles } from "@/hooks/usePersonaProfiles";
import { DateRange } from "react-day-picker";
import { Loader2 } from "lucide-react";
import { PersonaAvatar } from "./PersonaAvatar";

const PERSONA_COLORS: Record<string, string> = {
  P1: "348 83% 47%", P2: "330 81% 60%", P3: "15 85% 55%", P4: "205 85% 55%",
  P5: "155 65% 45%", P6: "270 60% 55%", P7: "45 90% 50%", P8: "348 70% 35%", P9: "195 70% 45%",
};

function getColor(code: string) {
  return PERSONA_COLORS[code] || "200 60% 50%";
}

function MiniPersonaCard({
  persona,
  globalAvg,
  getName,
}: {
  persona: PersonaStat;
  globalAvg: { conversionRate: number; aov: number };
  getName: (code: string) => string;
}) {
  const color = getColor(persona.code);
  // Persona name comes from the database (loaded via usePersonaProfiles).
  // Falls back to the code if not yet loaded.
  const displayName = getName(persona.code) || persona.name || persona.code;
  const subtitle = persona.subtitle || "Persona auto-détecté";
  const convRate = persona.business ? (persona.business.conversions / Math.max(persona.count, 1)) * 100 : 0;
  const convVsGlobal = globalAvg.conversionRate > 0 ? Math.round(((convRate / globalAvg.conversionRate) - 1) * 1000) / 10 : null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="overflow-hidden h-full flex flex-col">
        {/* Header */}
        <div className="p-4 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <PersonaAvatar name={displayName} code={persona.code} size={48} className="shrink-0" />
            <div className="min-w-0">
              <h4 className="text-base font-bold text-foreground leading-tight">
                {displayName} <span className="font-medium text-muted-foreground">— {subtitle}</span>
              </h4>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Représente {persona.percentage}% de vos prospects</p>
            <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: "hsl(348 83% 47%)" }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(persona.percentage * 2, 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* KPIs — 2x2 compact */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              { icon: Users, label: "Volume", value: String(persona.count) },
              { icon: TrendingUp, label: "Conversion", value: `${convRate.toFixed(1)}%`, sub: convVsGlobal != null ? `${convVsGlobal > 0 ? "+" : ""}${convVsGlobal}% vs moy.` : undefined, subColor: convVsGlobal != null ? (convVsGlobal >= 0 ? "text-green-600" : "text-red-500") : "" },
              { icon: ShoppingCart, label: "AOV", value: persona.business?.aov ? `${persona.business.aov.toFixed(0)}€` : "–", sub: persona.business?.aovVsGlobal != null ? `${persona.business.aovVsGlobal > 0 ? "+" : ""}${persona.business.aovVsGlobal}% vs moy.` : undefined, subColor: persona.business?.aovVsGlobal != null ? (persona.business.aovVsGlobal >= 0 ? "text-green-600" : "text-red-500") : "" },
              { icon: Zap, label: "Engagement", value: persona.behavior?.engagementAvg != null ? `${Math.round(persona.behavior.engagementAvg)}/100` : "–" },
            ].map((kpi, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg p-2">
                <kpi.icon className="w-4 h-4 shrink-0" style={{ color: `hsl(${color})` }} />
                <div>
                  <p className="text-sm font-bold text-foreground">{kpi.value}</p>
                  <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                  {kpi.sub && <p className={`text-[11px] font-medium ${kpi.subColor}`}>{kpi.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

interface PersonasOverviewPreviewProps {
  dateRange?: DateRange;
  onViewAll: () => void;
}

export function PersonasOverviewPreview({ dateRange, onViewAll }: PersonasOverviewPreviewProps) {
  const { personas, isLoading, globalAvg } = usePersonaStats(dateRange);
  const { getName } = usePersonaProfiles();

  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-card via-card to-secondary/10 rounded-xl border border-border/50 p-6 shadow-md">
        <h3 className="text-xl font-bold text-foreground mb-4 font-heading">Top 3 Personas</h3>
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Chargement…</span>
        </div>
      </div>
    );
  }

  const top3 = [...personas].filter(p => p.count >= 20).sort((a, b) => b.count - a.count).slice(0, 3);

  return (
    <div className="bg-gradient-to-br from-card via-card to-secondary/10 rounded-xl border border-border/50 p-6 shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xl font-bold text-foreground font-heading">Top 3 Personas</h3>
        <button onClick={onViewAll} className="text-sm text-primary font-medium hover:underline">
          Voir tous les personas →
        </button>
      </div>

      {top3.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Pas assez de données sur cette période (minimum 20 sessions par persona).
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top3.map((p) => (
            <MiniPersonaCard key={p.code} persona={p} globalAvg={globalAvg} getName={getName} />
          ))}
        </div>
      )}
    </div>
  );
}
