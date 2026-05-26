import { useMemo, useState } from "react";
import { usePersonaProfiles } from "@/hooks/usePersonaProfiles";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  DiagnosticSession,
  DiagnosticItem,
  CategoryKey,
  ColumnLabelsMapping,
} from "@/types/diagnostic";
import {
  CATEGORIES,
  STATUS_LABELS,
  RELATIONSHIP_LABELS,
  getSortedItems,
} from "@/types/diagnostic";

/* ── Adapted tone badge ─────────────────────────────────── */

const TONE_CONFIG: Record<string, { label: string; className: string }> = {
  playful:     { label: "🎭 Ludique",       className: "bg-purple-100 text-purple-800 border-purple-200" },
  factual:     { label: "📊 Factuel",       className: "bg-blue-100 text-blue-800 border-blue-200" },
  empowering:  { label: "💪 Autonomisant",  className: "bg-green-100 text-green-800 border-green-200" },
  transparent: { label: "🌿 Transparent",   className: "bg-teal-100 text-teal-800 border-teal-200" },
  expert:      { label: "🧪 Expert",        className: "bg-orange-100 text-orange-800 border-orange-200" },
};

function AdaptedToneBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const config = TONE_CONFIG[value];
  if (!config) return <span>{value}</span>;
  return (
    <Badge variant="outline" className={`text-xs font-medium whitespace-nowrap ${config.className}`}>
      {config.label}
    </Badge>
  );
}

/* ── Display status helper ──────────────────────────────── */

export function getDisplayStatus(s: DiagnosticSession): string {
  if (s.status === "en_cours" && s.created_at) {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    return new Date(s.created_at).getTime() < twoHoursAgo ? "Abandonné" : "En cours";
  }
  return STATUS_LABELS[s.status] ?? s.status ?? "—";
}

/* ── Column definition ─────────────────────────────────── */

export interface ColumnDef {
  key: string;
  label: string;
  category: CategoryKey;
  getValue: (s: DiagnosticSession) => string;
}

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "✓" : "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.join(", ");
  return String(v);
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
};

const fmtTime = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
};

const fmtEuro = (v: number | null) => {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(2)} €`;
};

/* ── Base columns — 7 categories, tenant-agnostic ──────── */

const IDENTIFICATION_COLS: ColumnDef[] = [
  { key: "session_code", label: "Session ID",   category: "identification", getValue: (s) => s.session_code },
  { key: "date",         label: "Date",         category: "identification", getValue: (s) => fmtDate(s.created_at) },
  { key: "heure",        label: "Heure",        category: "identification", getValue: (s) => fmtTime(s.created_at) },
  { key: "source",       label: "Source",       category: "identification", getValue: (s) => fmt(s.source) },
  { key: "utm_campaign", label: "UTM Campaign", category: "identification", getValue: (s) => fmt(s.utm_campaign) },
  { key: "device",       label: "Device",       category: "identification", getValue: (s) => fmt(s.device) },
  { key: "locale",       label: "Langue/Pays",  category: "identification", getValue: (s) => fmt(s.locale) },
  { key: "result_url",   label: "Result URL",   category: "identification", getValue: (s) => fmt(s.result_url) },
];

// user_name (Prénom) is hardcoded in CONTACT_COLS — universal across tenants.
const CONTACT_COLS: ColumnDef[] = [
  { key: "user_name",    label: "Prénom",            category: "contact", getValue: (s) => fmt(s.user_name) },
  { key: "relationship", label: "Lien",              category: "contact", getValue: (s) => RELATIONSHIP_LABELS[s.relationship ?? ""] ?? fmt(s.relationship) },
  { key: "email",        label: "Email",             category: "contact", getValue: (s) => fmt(s.email) },
  { key: "phone",        label: "Téléphone",         category: "contact", getValue: (s) => fmt(s.phone) },
  { key: "optin_email",  label: "Opt-in Email",      category: "contact", getValue: (s) => fmt(s.optin_email) },
  { key: "optin_sms",    label: "Opt-in SMS",        category: "contact", getValue: (s) => fmt(s.optin_sms) },
  { key: "nb_children",  label: "Nombre d'items",    category: "contact", getValue: (s) => fmt(s.number_of_children) },
];

const PARCOURS_COLS: ColumnDef[] = [
  { key: "status",           label: "Statut",              category: "parcours", getValue: (s) => getDisplayStatus(s) },
  { key: "duration",         label: "Durée (sec)",         category: "parcours", getValue: (s) => fmt(s.duration_seconds) },
  { key: "abandoned_step",   label: "Abandon à l'étape",   category: "parcours", getValue: (s) => fmt(s.abandoned_at_step) },
  { key: "question_path",    label: "Chemin questions",    category: "parcours", getValue: (s) => fmt(s.question_path) },
  { key: "back_nav",         label: "Retours en arrière",  category: "parcours", getValue: (s) => fmt(s.back_navigation_count) },
  { key: "optional_details", label: "Détails optionnels",  category: "parcours", getValue: (s) => fmt(s.has_optional_details) },
];

// PROFIL_CLIENT — generic top-level fields. Tenant-specific fields are added
// dynamically via buildDynamicMetadataCols (column_labels_mapping).
const PROFIL_CLIENT_COLS: ColumnDef[] = [
  { key: "priorities",       label: "Priorités (ordonnées)",   category: "profil_client", getValue: (s) => fmt(s.priorities_ordered) },
  { key: "trust_triggers",   label: "Éléments de réassurance", category: "profil_client", getValue: (s) => fmt(s.trust_triggers_ordered) },
  { key: "content_pref",     label: "Format contenu préféré",  category: "profil_client", getValue: (s) => fmt(s.content_format_preference) },
  { key: "routine_pref",     label: "Routine souhaitée",       category: "profil_client", getValue: (s) => fmt(s.routine_size_preference) },
  { key: "existing_products",label: "Produits déjà utilisés",  category: "profil_client", getValue: (s) => fmt(s.existing_brand_products) },
  { key: "is_existing_client", label: "Client existant",       category: "profil_client", getValue: (s) => s.is_existing_client ? "Oui" : "Non" },
];

function buildPersonaCols(getLabel: (code: string) => string): ColumnDef[] {
  return [
    {
      key: "persona_code_col",
      label: "Persona",
      category: "persona",
      getValue: (s) => {
        if (!s.persona_code) return "—";
        if (s.persona_code === "P0") return "Non attribué";
        return getLabel(s.persona_code);
      },
    },
    { key: "matching_score_col", label: "Matching %", category: "persona", getValue: (s) => s.matching_score != null ? `${s.matching_score}%` : "—" },
    { key: "adapted_tone",       label: "Ton adapté", category: "persona", getValue: (s) => fmt(s.adapted_tone) },
    { key: "tone_label",         label: "Label tonalité", category: "persona", getValue: (s) => fmt(s.tone_label) },
  ];
}

const BUSINESS_COLS: ColumnDef[] = [
  { key: "conversion",           label: "Conversion",           category: "business", getValue: (s) => s.conversion ? "Oui" : "Non" },
  { key: "exit_type",            label: "Type de sortie",       category: "business", getValue: (s) => fmt(s.exit_type) },
  { key: "recommended_products", label: "Routine recommandée",  category: "business", getValue: (s) => fmt(s.recommended_products) },
  { key: "recommended_cart",     label: "Panier recommandé (€)",category: "business", getValue: (s) => fmtEuro(s.recommended_cart_amount) },
  { key: "validated_products",   label: "Produits achetés",     category: "business", getValue: (s) => fmt(s.validated_products) },
  { key: "validated_cart",       label: "Panier validé (€)",    category: "business", getValue: (s) => fmtEuro(s.validated_cart_amount) },
  { key: "upsell_potential",     label: "Potentiel upsell",     category: "business", getValue: (s) => fmt(s.upsell_potential) },
];

const COMPORTEMENT_COLS: ColumnDef[] = [
  { key: "behavior_tags",    label: "Tags comportementaux",  category: "comportement", getValue: (s) => fmt(s.behavior_tags) },
  { key: "engagement_score", label: "Score engagement (%)",  category: "comportement", getValue: (s) => s.engagement_score != null ? `${s.engagement_score}%` : "—" },
];

/* ── Dynamic metadata columns ──────────────────────────────
   Driven by tenant_config.column_labels_mapping (preferred), or by
   tenant_config.persona_dimension_mapping.need as a legacy fallback.

   For each declared key we look up its value across three locations
   (first-defined wins):
     1. session[key]                  (top-level column)
     2. items[0].item_metadata[key]   (primary item)
     3. session.client_context_json[key]  -- skipped, dashboard-side

   Values can be remapped via value_mapping for human-readable display.
   ──────────────────────────────────────────────────────── */

function resolveMetadataValue(session: DiagnosticSession, key: string): unknown {
  // 1. Top-level column on diagnostic_sessions
  const top = (session as unknown as Record<string, unknown>)[key];
  if (top !== undefined && top !== null && top !== "") return top;

  // 2. Primary item's metadata JSONB
  const items = getSortedItems(session);
  const meta0 = items[0]?.item_metadata;
  if (meta0 && key in meta0) {
    const v = (meta0 as Record<string, unknown>)[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }

  // 3. Any subsequent item that has it (for tenants that vary by item)
  for (const it of items.slice(1)) {
    if (it.item_metadata && key in it.item_metadata) {
      const v = (it.item_metadata as Record<string, unknown>)[key];
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  return null;
}

const VALID_CATEGORIES: ReadonlySet<CategoryKey> = new Set<CategoryKey>([
  "identification", "contact", "parcours", "profil_client",
  "persona", "business", "comportement",
]);

function buildDynamicMetadataCols(
  mapping: ColumnLabelsMapping | null | undefined,
  legacyFields: string[]
): ColumnDef[] {
  // Preferred path: column_labels_mapping is populated by the tenant
  if (mapping && Object.keys(mapping).length > 0) {
    return Object.entries(mapping).map(([key, entry]) => {
      const cat: CategoryKey = (entry.category && VALID_CATEGORIES.has(entry.category as CategoryKey))
        ? (entry.category as CategoryKey)
        : "profil_client";
      const valueMap = entry.value_mapping;
      return {
        key: `meta_${key}`,
        label: entry.label || key,
        category: cat,
        getValue: (s: DiagnosticSession) => {
          const raw = resolveMetadataValue(s, key);
          if (raw === null) return "—";
          if (valueMap && typeof raw === "string" && valueMap[raw]) return valueMap[raw];
          if (Array.isArray(raw) && valueMap) {
            return raw.map((v) => valueMap[String(v)] ?? String(v)).join(", ");
          }
          return fmt(raw);
        },
      };
    });
  }

  // Legacy fallback: persona_dimension_mapping.need
  return legacyFields.map((key) => ({
    key: `meta_${key}`,
    label: key,
    category: "profil_client" as CategoryKey,
    getValue: (s: DiagnosticSession) => fmt(resolveMetadataValue(s, key)),
  }));
}

/* ── Build all columns ─────────────────────────────────── */

function buildAllColumns(
  getLabel: (code: string) => string,
  dynamicFields: string[],
  columnLabelsMapping: ColumnLabelsMapping | null
): ColumnDef[] {
  const dynamic = buildDynamicMetadataCols(columnLabelsMapping, dynamicFields);

  // Distribute dynamic cols by their declared category so they appear inside
  // the right category band. Default category is profil_client.
  const dynamicByCat = new Map<CategoryKey, ColumnDef[]>();
  for (const col of dynamic) {
    const arr = dynamicByCat.get(col.category) ?? [];
    arr.push(col);
    dynamicByCat.set(col.category, arr);
  }
  const dyn = (cat: CategoryKey): ColumnDef[] => dynamicByCat.get(cat) ?? [];

  return [
    ...IDENTIFICATION_COLS, ...dyn("identification"),
    ...CONTACT_COLS,        ...dyn("contact"),
    ...PARCOURS_COLS,       ...dyn("parcours"),
    ...PROFIL_CLIENT_COLS,  ...dyn("profil_client"),
    ...buildPersonaCols(getLabel), ...dyn("persona"),
    ...BUSINESS_COLS,       ...dyn("business"),
    ...COMPORTEMENT_COLS,   ...dyn("comportement"),
  ];
}

/* ── Compute category spans for the grouped header row ── */

function getCategorySpans(columns: ColumnDef[]) {
  const spans: Array<{ category: CategoryKey; count: number }> = [];
  let current: CategoryKey | null = null;

  for (const col of columns) {
    if (col.category !== current) {
      spans.push({ category: col.category, count: 1 });
      current = col.category;
    } else {
      spans[spans.length - 1].count++;
    }
  }
  return spans;
}

const categoryMap = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

/* ── Component ─────────────────────────────────────────── */

interface SessionsTableProps {
  sessions: DiagnosticSession[];
  searchTerm?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  statusFilter?: string;
  conversionFilter?: string;
}

type SortKey = "date" | "recommended_cart" | "validated_cart";
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export function SessionsTable({ sessions, searchTerm, dateFrom, dateTo, statusFilter, conversionFilter }: SessionsTableProps) {
  const { getLabel } = usePersonaProfiles();
  const { config: tenantConfig } = useTenantConfig();
  const dynamicFields = useMemo(
    () => tenantConfig?.persona_dimension_mapping?.need || [],
    [tenantConfig]
  );
  const columnLabelsMapping = (tenantConfig?.column_labels_mapping ?? null) as ColumnLabelsMapping | null;
  const columns = useMemo(
    () => buildAllColumns(getLabel, dynamicFields, columnLabelsMapping),
    [getLabel, dynamicFields, columnLabelsMapping]
  );
  const spans = useMemo(() => getCategorySpans(columns), [columns]);
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let result = sessions;

    if (statusFilter && statusFilter !== "all") {
      result = result.filter((s) => getDisplayStatus(s) === statusFilter);
    }

    if (conversionFilter && conversionFilter !== "all") {
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
          s.persona_code?.toLowerCase().includes(q)
      );
    }

    if (dateFrom) {
      result = result.filter((s) => {
        if (!s.created_at) return false;
        const sessionDate = new Date(s.created_at);
        const parisDate = new Date(sessionDate.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
        const fromStart = new Date(dateFrom);
        fromStart.setHours(0, 0, 0, 0);
        return parisDate >= fromStart;
      });
    }
    if (dateTo) {
      result = result.filter((s) => {
        if (!s.created_at) return false;
        const sessionDate = new Date(s.created_at);
        const parisDate = new Date(sessionDate.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        return parisDate <= toEnd;
      });
    }

    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        cmp = new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      } else if (sortKey === "recommended_cart") {
        cmp = (a.recommended_cart_amount ?? 0) - (b.recommended_cart_amount ?? 0);
      } else if (sortKey === "validated_cart") {
        cmp = (a.validated_cart_amount ?? 0) - (b.validated_cart_amount ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [sessions, searchTerm, dateFrom, dateTo, statusFilter, conversionFilter, sortKey, sortDir]);

  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFrom, dateTo, pageSize, statusFilter, conversionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const paginatedSessions = filtered.slice(startIndex, endIndex);

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push("ellipsis");
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safeCurrentPage < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      <ScrollArea className="w-full whitespace-nowrap rounded-lg border border-border">
        <div className="min-w-max">
          <Table>
            <TableHeader>
              {/* Category band row */}
              <TableRow className="border-b-0">
                {spans.map((span, i) => {
                  const cat = categoryMap[span.category];
                  return (
                    <TableHead
                      key={`cat-${i}`}
                      colSpan={span.count}
                      className="text-center text-xs font-bold py-2 border-x border-border/30"
                      style={{ backgroundColor: cat?.color ?? "#f5f5f5" }}
                    >
                      {cat?.label ?? span.category}
                    </TableHead>
                  );
                })}
              </TableRow>

              {/* Column headers row */}
              <TableRow>
                {columns.map((col) => {
                  const cat = categoryMap[col.category];
                  const sortableMap: Record<string, SortKey> = {
                    date: "date",
                    recommended_cart: "recommended_cart",
                    validated_cart: "validated_cart",
                  };
                  const sk = sortableMap[col.key];
                  const isSortable = !!sk;
                  const isActive = sk === sortKey;
                  return (
                    <TableHead
                      key={col.key}
                      className={`text-xs font-medium px-3 py-2 min-w-[120px] border-x border-border/20 ${isSortable ? "cursor-pointer select-none hover:opacity-80" : ""}`}
                      style={{ backgroundColor: `${cat?.color ?? "#f5f5f5"}80` }}
                      onClick={isSortable ? () => handleSort(sk) : undefined}
                    >
                      {col.label}
                      {isSortable && (
                        <span className={`ml-1 text-black ${isActive ? "" : "opacity-50"}`}>
                          {isActive ? (sortDir === "asc" ? "▲" : "▼") : "▼"}
                        </span>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginatedSessions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-center py-12 text-muted-foreground"
                  >
                    Aucune session trouvée
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSessions.map((session) => (
                  <TableRow
                    key={session.id}
                    className={cn(
                      "transition-colors",
                      session.over_quota
                        ? "pointer-events-none select-none bg-muted/20"
                        : "hover:bg-muted/40"
                    )}
                    title={session.over_quota ? "Session au-delà de votre forfait. Passez au plan supérieur pour y accéder." : undefined}
                  >
                     {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          "px-3 py-2 text-xs max-w-[250px]",
                          session.over_quota ? "relative overflow-hidden" : "truncate"
                        )}
                        title={session.over_quota ? "🔒 Session hors quota" : col.getValue(session)}
                      >
                        {session.over_quota ? (
                          <div className="filter blur-sm select-none pointer-events-none text-muted-foreground truncate">
                            {col.key === "adapted_tone"
                              ? <AdaptedToneBadge value={session.adapted_tone} />
                              : (col.getValue(session) || "—")}
                          </div>
                        ) : (
                          col.key === "adapted_tone"
                          ? <AdaptedToneBadge value={session.adapted_tone} />
                          : col.getValue(session)
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Pagination controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Lignes par page :</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[70px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-2">
            Affichage {filtered.length === 0 ? 0 : startIndex + 1}–{endIndex} sur {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safeCurrentPage <= 1}
            className="h-8 px-3 text-xs"
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-1" />
            Précédent
          </Button>

          {getPageNumbers().map((page, i) =>
            page === "ellipsis" ? (
              <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-xs">…</span>
            ) : (
              <Button
                key={page}
                variant={page === safeCurrentPage ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                className="h-8 w-8 p-0 text-xs"
              >
                {page}
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage >= totalPages}
            className="h-8 px-3 text-xs"
          >
            Suivant
            <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Export helpers (used by ResponsesSection) ─────────── */

export function getColumnDefs(
  getLabel?: (code: string) => string,
  dynamicFields?: string[],
  columnLabelsMapping?: ColumnLabelsMapping | null
) {
  return buildAllColumns(
    getLabel ?? ((code) => code),
    dynamicFields ?? [],
    columnLabelsMapping ?? null
  );
}
