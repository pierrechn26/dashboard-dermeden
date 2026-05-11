import { motion } from "framer-motion";
import { Activity, Users, Clock, PlayCircle, Loader2 } from "lucide-react";
import { useDiagnosticStats } from "@/hooks/useDiagnosticStats";
import { DateRange } from "react-day-picker";

interface OverviewDiagnosticStatsProps {
  dateRange?: DateRange;
}

export function OverviewDiagnosticStats({ dateRange }: OverviewDiagnosticStatsProps) {
  const stats = useDiagnosticStats(dateRange);

  if (stats.isLoading) {
    return (
      <div className="bg-gradient-to-br from-card via-card to-accent/10 rounded-xl border border-border/50 p-6 shadow-md">
        <h3 className="text-xl font-bold text-foreground mb-6 font-heading">Performance du Diagnostic</h3>
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-card via-card to-accent/10 rounded-xl border border-border/50 p-6 shadow-md">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-foreground font-heading">Performance du Diagnostic</h3>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-xs text-muted-foreground">Temps réel</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Réponses */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          transition={{ duration: 0.3 }}
          className="bg-gradient-to-br from-card via-card to-primary/5 rounded-xl p-6 border border-border/50 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">Total réponses</p>
          <p className="text-2xl font-bold text-foreground">{stats.totalResponses}</p>
          <p className="text-xs text-muted-foreground mt-2">Complétées</p>
          <p className="text-sm font-semibold text-foreground">{stats.completedResponses}</p>
        </motion.div>

        {/* Taux de complétion */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-gradient-to-br from-card via-card to-accent/5 rounded-xl p-6 border border-border/50 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">Taux de complétion</p>
          <p className="text-2xl font-bold text-foreground">{stats.completionRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground mt-2">Réponses avec persona</p>
          <p className="text-sm font-semibold text-foreground">{stats.personaDistribution.reduce((sum, p) => sum + p.count, 0)}</p>
        </motion.div>

        {/* Taux opt-in email */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-gradient-to-br from-card via-card to-secondary/5 rounded-xl p-6 border border-border/50 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <PlayCircle className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">Taux opt-in email</p>
          <p className="text-2xl font-bold text-foreground">{stats.emailOptinRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground mt-2">Inscrits email</p>
          <p className="text-sm font-semibold text-foreground">{stats.emailOptinCount}</p>
        </motion.div>

        {/* Taux opt-in SMS */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          transition={{ duration: 0.3, delay: 0.3 }}
          className="bg-gradient-to-br from-card via-card to-primary/5 rounded-xl p-6 border border-border/50 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">Taux opt-in SMS</p>
          <p className="text-2xl font-bold text-foreground">{stats.smsOptinRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground mt-2">Inscrits SMS</p>
          <p className="text-sm font-semibold text-foreground">{stats.smsOptinCount}</p>
        </motion.div>
      </div>
    </div>
  );
}
