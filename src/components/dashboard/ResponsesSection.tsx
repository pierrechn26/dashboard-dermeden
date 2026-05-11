import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  FileJson,
  FileSpreadsheet,
  Search,
  Loader2,
  RefreshCw,
  ArrowUpRight,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useDiagnosticSessions } from "@/hooks/useDiagnosticSessions";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { SessionsTable, getColumnDefs, getDisplayStatus } from "./SessionsTable";
import { CATEGORIES } from "@/types/diagnostic";
import type { DiagnosticSession } from "@/types/diagnostic";
import type { DateRange } from "react-day-picker";

/* ── Export helpers ─────────────────────────────────────── */

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(sessions: DiagnosticSession[]) {
  const cols = getColumnDefs();
  const header = cols.map((c) => `"${c.label}"`).join(",");
  const rows = sessions.map((s) =>
    cols
      .map((c) => {
        const val = c.getValue(s);
        return `"${(val ?? "—").replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  downloadFile([header, ...rows].join("\n"), "diagnostic-sessions.csv", "text/csv");
}

function exportJSON(sessions: DiagnosticSession[]) {
  downloadFile(
    JSON.stringify(sessions, null, 2),
    "diagnostic-sessions.json",
    "application/json"
  );
}

/* ── Component ─────────────────────────────────────────── */

interface ResponsesSectionProps {
  dateRange?: DateRange;
}

export function ResponsesSection({ dateRange }: ResponsesSectionProps) {
  const { sessions, isLoading, error } = useDiagnosticSessions(dateRange);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [conversionFilter, setConversionFilter] = useState("all");
  const { toast } = useToast();
  const { sessions: sessionUsage, upgrade } = useUsageLimits();
  const overQuotaCount = useMemo(() => sessions.filter(s => s.over_quota).length, [sessions]);

  const filteredCount = useMemo(() => {
    let result = sessions;
    if (statusFilter !== "all") {
      result = result.filter((s) => getDisplayStatus(s) === statusFilter);
    }
    if (conversionFilter !== "all") {
      const val = conversionFilter === "oui";
      result = result.filter((s) => s.conversion === val);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.session_code?.toLowerCase().includes(q) ||
          s.user_name?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.persona_detected?.toLowerCase().includes(q)
      );
    }
    if (dateRange?.from) {
      result = result.filter((s) => {
        if (!s.created_at) return false;
        const d = new Date(s.created_at);
        const p = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
        const from = new Date(dateRange.from!);
        from.setHours(0, 0, 0, 0);
        return p >= from;
      });
    }
    if (dateRange?.to) {
      result = result.filter((s) => {
        if (!s.created_at) return false;
        const d = new Date(s.created_at);
        const p = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
        const to = new Date(dateRange.to!);
        to.setHours(23, 59, 59, 999);
        return p <= to;
      });
    }
    return result.length;
  }, [sessions, statusFilter, conversionFilter, searchTerm, dateRange]);

  const handleExportCSV = () => {
    exportCSV(sessions);
    toast({ title: "Export CSV", description: "Fichier téléchargé." });
  };
  const handleExportJSON = () => {
    exportJSON(sessions);
    toast({ title: "Export JSON", description: "Fichier téléchargé." });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Chargement des sessions…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4 text-destructive">
          <p>Erreur lors du chargement des données</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-foreground">
            Résultats du diagnostic
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredCount !== sessions.length
              ? `${filteredCount} session${filteredCount !== 1 ? "s" : ""} sur ${sessions.length}`
              : `${sessions.length} session${sessions.length !== 1 ? "s" : ""} au total`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-56"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-10 text-sm">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Statut : Tous</SelectItem>
              <SelectItem value="Terminé">Terminé</SelectItem>
              <SelectItem value="En cours">En cours</SelectItem>
              <SelectItem value="Abandonné">Abandonné</SelectItem>
            </SelectContent>
          </Select>

          {/* Conversion filter */}
          <Select value={conversionFilter} onValueChange={setConversionFilter}>
            <SelectTrigger className="w-[160px] h-10 text-sm">
              <SelectValue placeholder="Conversion" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Conversion : Tous</SelectItem>
              <SelectItem value="oui">Oui</SelectItem>
              <SelectItem value="non">Non</SelectItem>
            </SelectContent>
          </Select>


          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileSpreadsheet className="w-4 h-4 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJSON}>
            <FileJson className="w-4 h-4 mr-1" />
            JSON
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Badge
            key={cat.key}
            variant="outline"
            className="text-xs font-medium px-3 py-1"
            style={{ backgroundColor: cat.color, borderColor: cat.color }}
          >
            {cat.label}
          </Badge>
        ))}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Mise à jour automatique toutes les 2 min</span>
      </div>


      {/* Table */}
      <SessionsTable
        sessions={sessions}
        searchTerm={searchTerm}
        dateFrom={dateRange?.from ?? null}
        dateTo={dateRange?.to ?? null}
        statusFilter={statusFilter}
        conversionFilter={conversionFilter}
      />
    </motion.div>
  );
}
