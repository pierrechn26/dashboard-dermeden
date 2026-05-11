import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DollarSign, TrendingUp, ShoppingCart, Users, Loader2 } from "lucide-react";
import { MetricCard } from "./MetricCard";
import { useBusinessMetrics } from "@/hooks/useBusinessMetrics";
import { useRevenueTimeseries, type Granularity } from "@/hooks/useRevenueTimeseries";
import { useInsightsMetrics } from "@/hooks/useInsightsMetrics";
import { usePersonaStats } from "@/hooks/usePersonaStats";
import { usePersonaProfiles } from "@/hooks/usePersonaProfiles";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const PERSONA_COLORS: Record<string, string> = {
  P1: "hsl(348, 83%, 47%)", P2: "hsl(330, 81%, 60%)", P3: "hsl(15, 85%, 55%)",
  P4: "hsl(205, 85%, 55%)", P5: "hsl(155, 65%, 45%)", P6: "hsl(270, 60%, 55%)",
  P7: "hsl(45, 90%, 50%)", P8: "hsl(348, 70%, 35%)", P9: "hsl(195, 70%, 45%)",
};

interface BusinessMetricsProps {
  dateRange?: DateRange;
}


function fmtEuro(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function percentDiff(a: number, b: number): { value: string; positive: boolean } | null {
  if (b === 0) return null;
  const diff = ((a - b) / b) * 100;
  return { value: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`, positive: diff >= 0 };
}

export function BusinessMetrics({ dateRange }: BusinessMetricsProps) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const metrics = useBusinessMetrics(dateRange);
  const revenue = useRevenueTimeseries(dateRange, granularity);
  const insights = useInsightsMetrics(dateRange);
  const personaData = usePersonaStats(dateRange);
  const { getName, getLabel } = usePersonaProfiles();
  const { config: tenantConfig } = useTenantConfig();
  const brandName = tenantConfig?.brand_name || "la marque";
  const percentInfluenced = metrics.revenueTotal > 0
    ? (metrics.revenueDiag / metrics.revenueTotal) * 100
    : 0;

  // Conversion rate: diag purchases / diagnostic page views (GA4)
  const convRateDiag = metrics.diagnosticPageViews > 0
    ? (metrics.orderCountDiag / metrics.diagnosticPageViews) * 100
    : 0;

  // Global conversion rate: non-diag orders / site sessions (GA4)
  const convRateGlobal = metrics.siteSessions > 0
    ? (metrics.orderCountNonDiag / metrics.siteSessions) * 100
    : 0;

  const aovDiff = percentDiff(metrics.aovDiag, metrics.aovNonDiag);
  const convDiff = percentDiff(convRateDiag, convRateGlobal);
  const caWithDiag = metrics.revenueTotal;
  const caWithoutDiag = metrics.revenueTotal - metrics.revenueDiag;
  const caDiff = percentDiff(caWithDiag, caWithoutDiag);

  return (
    <div className="space-y-8">
      {/* Key Business Metrics */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6 font-heading">
          Business & Conversion
        </h2>
        {metrics.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Chargement des données...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              title="CA via diagnostic"
              value={`${fmt(metrics.revenueDiag)} €`}
              subtitle={`${metrics.orderCountDiag} commandes`}
              icon={DollarSign}
              comparison={{
                period: "CA total vs CA sans diagnostic",
                value: `${fmt(caWithDiag)} € vs ${fmt(caWithoutDiag)} €`,
                diff: caDiff ? caDiff.value : undefined,
                positive: caDiff?.positive,
              }}
              index={0}
            />
            <MetricCard
              title="% ventes influencées"
              value={`${fmt(percentInfluenced, 1)}%`}
              subtitle={`${metrics.orderCountDiag} / ${metrics.orderCountTotal} commandes`}
              icon={TrendingUp}
              comparison={{ period: `${fmt(percentInfluenced, 1)}% du CA total`, value: `${fmt(metrics.revenueDiag)} € sur ${fmt(metrics.revenueTotal)} €` }}
              index={1}
            />
            <MetricCard
              title="AOV après diag"
              value={`${fmt(metrics.aovDiag, 2)} €`}
              subtitle="Valeur moyenne par commande"
              icon={ShoppingCart}
              comparison={{
                period: "vs sans diagnostic",
                value: `${fmt(metrics.aovNonDiag, 2)} €`,
                diff: aovDiff ? aovDiff.value : undefined,
                positive: aovDiff?.positive,
              }}
              index={2}
            />
            <MetricCard
              title="Taux de conversion diag"
              value={`${fmt(convRateDiag, 1)}%`}
              subtitle={`${metrics.orderCountDiag} achats / ${metrics.diagnosticPageViews.toLocaleString()} vues diag`}
              icon={Users}
              comparison={{
                period: "vs global",
                value: `${fmt(convRateGlobal, 2)}%`,
                diff: convDiff ? convDiff.value : undefined,
                positive: convDiff?.positive,
              }}
              index={3}
            />
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Comparison — real data */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="p-6 bg-gradient-to-br from-card via-card to-primary/10 border border-border/50 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground font-heading">
                Impact du Diagnostic sur le CA
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {dateRange?.from
                    ? `${format(dateRange.from, "dd MMM yyyy", { locale: fr })} – ${format(dateRange.to ?? new Date(), "dd MMM yyyy", { locale: fr })}`
                    : "30 derniers jours"}
                </span>
                <ToggleGroup
                  type="single"
                  value={granularity}
                  onValueChange={(v) => { if (v) setGranularity(v as Granularity); }}
                  size="sm"
                  variant="outline"
                >
                  <ToggleGroupItem value="day" className="text-xs px-2">Jour</ToggleGroupItem>
                  <ToggleGroupItem value="week" className="text-xs px-2">Semaine</ToggleGroupItem>
                  <ToggleGroupItem value="month" className="text-xs px-2">Mois</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            {revenue.isLoading ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Chargement...</span>
              </div>
            ) : revenue.isEmpty ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground gap-2">
                <span className="text-4xl">📭</span>
                <p className="font-medium text-foreground">Aucune commande sur cette période</p>
                <p className="text-sm text-center max-w-xs">
                  Aucune donnée disponible pour la plage sélectionnée. Essayez un raccourci comme "30 derniers jours" ou "Toute la période".
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenue.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => fmtEuro(v)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                          <p className="font-medium text-foreground mb-2">{label}</p>
                          {payload.map((entry: any, index: number) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-muted-foreground">
                                {entry.dataKey === "withDiag" ? "CA total (avec diagnostic)" : "CA sans diagnostic"}:
                              </span>
                              <span className="font-medium text-foreground">
                                {fmtEuro(entry.value ?? 0)}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="withDiag" stroke="hsl(var(--primary))" strokeWidth={3} name="CA total (avec diagnostic)" dot={{ fill: "hsl(var(--primary))", r: 3 }} animationDuration={1200} />
                  <Line type="monotone" dataKey="withoutDiag" stroke="hsl(var(--muted-foreground))" strokeWidth={2} name="CA sans diagnostic" dot={{ fill: "hsl(var(--muted-foreground))", r: 2 }} animationDuration={1200} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </motion.div>

        {/* CA & Conversion par Persona */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="p-6 bg-gradient-to-br from-card via-card to-secondary/10 border border-border/50 shadow-md h-full min-h-[380px]">
            <h3 className="text-lg font-bold text-foreground mb-4 font-heading">
              CA & Conversion par Persona
            </h3>
            {personaData.isLoading ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Chargement...</span>
              </div>
            ) : personaData.personas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Aucune donnée persona disponible.</p>
            ) : (
              (() => {
                const sortedPersonas = personaData.personas
                  .filter(p => p.code !== "P0" && p.business && p.business.revenue > 0)
                  .sort((a, b) => (b.business?.revenue ?? 0) - (a.business?.revenue ?? 0));
                const chartData = sortedPersonas.map(p => ({
                  name: getName(p.code),
                  revenue: p.business?.revenue ?? 0,
                  aov: p.business?.aov ?? 0,
                  convRate: p.count > 0 ? ((p.business?.conversions ?? 0) / p.count * 100) : 0,
                  conversions: p.business?.conversions ?? 0,
                  sessions: p.count,
                  color: PERSONA_COLORS[p.code] || "hsl(var(--primary))",
                }));
                return (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                        <YAxis
                          yAxisId="revenue"
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: number) => `${v}€`}
                        />
                        <YAxis
                          yAxisId="conv"
                          orientation="right"
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: number) => `${v}%`}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            return (
                              <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm">
                                <p className="font-semibold text-foreground mb-1.5">{label}</p>
                                <div className="space-y-1 text-muted-foreground">
                                  <p>CA : <span className="font-medium text-foreground">{fmtEuro(d.revenue)}</span></p>
                                  <p>AOV : <span className="font-medium text-foreground">{fmt(d.aov, 2)} €</span></p>
                                  <p>Conversions : <span className="font-medium text-foreground">{d.conversions} / {d.sessions} sessions</span></p>
                                  <p>Taux conv. : <span className="font-medium text-foreground">{fmt(d.convRate, 1)}%</span></p>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend />
                        <Bar yAxisId="revenue" dataKey="revenue" name="CA (€)" radius={[4, 4, 0, 0]} animationDuration={1000}>
                          {sortedPersonas.map((p) => (
                            <Cell key={p.code} fill={PERSONA_COLORS[p.code] || "hsl(var(--primary))"} />
                          ))}
                        </Bar>
                        <Line yAxisId="conv" type="monotone" dataKey="convRate" stroke="hsl(var(--foreground))" strokeWidth={2} name="Taux conv. (%)" dot={{ r: 4, fill: "hsl(var(--foreground))" }} animationDuration={1000} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
                      {sortedPersonas.map(p => {
                        const convRate = p.count > 0 ? ((p.business?.conversions ?? 0) / p.count * 100) : 0;
                        return (
                          <div key={p.code} className="text-center space-y-0.5">
                            <p className="font-bold text-foreground text-sm">{getName(p.code)}</p>
                            <p className="text-xs text-muted-foreground leading-tight italic">{getLabel(p.code).split(" — ").slice(1).join(" — ") || p.name}</p>
                            <p className="text-xs text-muted-foreground">AOV: <span className="font-medium text-foreground">{fmt(p.business?.aov ?? 0, 1)}€</span></p>
                            <p className="text-xs text-muted-foreground">Conv: <span className="font-medium text-foreground">{fmt(convRate, 1)}%</span></p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()
            )}
          </Card>
        </motion.div>
      </div>

      {/* Additional Insights — kept as static */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="p-6 bg-gradient-to-br from-card via-card to-accent/10 border border-border/50 shadow-md">
          <h3 className="text-lg font-bold text-foreground mb-4 font-heading">
            Insights Business
          </h3>
          {insights.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Chargement...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Routine complète</p>
                <p className="text-3xl font-bold text-purple-600">{fmt(insights.routineCompletePercent, 1)}%</p>
                <p className="text-sm font-medium text-foreground">adoptent une routine 3+ produits</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Écart panier recommandé vs acheté</p>
                {insights.ecartPanier != null ? (
                  <>
                    <p className={`text-3xl font-bold ${insights.ecartPanier >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {insights.ecartPanier >= 0 ? "+" : ""}{fmt(insights.ecartPanier, 2)} €
                    </p>
                    <p className="text-sm font-medium text-foreground">panier réel vs recommandé</p>
                    <p className={`text-xs ${insights.ecartPanier >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {insights.ecartPanier >= 0 ? "les clients achètent plus" : "les clients achètent moins"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-muted-foreground">—</p>
                    <p className="text-sm font-medium text-foreground">données insuffisantes</p>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Top produit acheté</p>
                <p className="text-2xl font-bold text-amber-600 truncate" title={insights.topProduct ?? ""}>
                  {insights.topProduct ?? "—"}
                </p>
                {insights.topProduct && (
                  <p className="text-sm font-medium text-foreground">produit le + acheté ({insights.topProductCount} fois)</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Nouveaux clients via diagnostic</p>
                <p className="text-3xl font-bold text-blue-600">{fmt(insights.clientsExistantsPercent, 1)}%</p>
                <p className="text-sm font-medium text-foreground">découvrent {brandName} grâce au diagnostic</p>
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
