import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  BookOpen,
  Target,
  Lightbulb,
  BarChart3,
} from "lucide-react";
import { PersonaBadge } from "./shared/PersonaBadge";
import { FormatBadge } from "./shared/FormatBadge";
import { type Recommendation } from "@/hooks/useMarketingRecommendations";
import { usePersonaProfiles } from "@/hooks/usePersonaProfiles";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────

/** Replace ALL persona codes (P0-P99) with their display names everywhere */
function sanitizePersonaReferences(text: string, getName: (code: string) => string): string {
  if (!text) return "";
  return text.replace(/\bP(\d{1,2})\b/g, (match) => {
    const resolved = getName(match);
    // If getName returned the code itself (not found), keep it hidden
    return resolved === match ? match : resolved;
  });
}

/** Apply sanitization to any value — handles strings and nested objects */
function sanitizeAny(v: any, getName: (code: string) => string): any {
  if (typeof v === "string") return sanitizePersonaReferences(v, getName);
  return v;
}

function safeStr(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Sanitize HTML entities then render **bold** markdown */
function sanitizeAndRenderMd(text: string): string {
  if (!text) return "";
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

/** Resolve persona codes in a raw persona string */
function resolvePersonaCodes(raw: string, getName: (code: string) => string): string {
  if (!raw) return "";
  const codePattern = /\bP\d+\b/g;
  if (!codePattern.test(raw)) return raw;
  return raw.replace(/\bP\d+\b/g, (match) => getName(match));
}

const CATEGORY_LABELS: Record<string, string> = { ads: "Ads", emails: "Emailing", offers: "Offres" };
const CATEGORY_COLORS: Record<string, string> = {
  ads: "bg-primary/15 text-primary border-primary/30",
  emails: "bg-secondary/15 text-secondary border-secondary/30",
  offers: "bg-accent/15 text-accent-foreground border-accent/30",
};
const STATUS_OPTIONS = [
  { value: "todo", label: "À faire" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Terminée" },
] as const;

// ── Copy helpers ───────────────────────────────────────────────────

function CopyIcon({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  return (
    <button onClick={handleCopy} className="shrink-0 p-1 rounded hover:bg-muted/60 transition-colors" title="Copier">
      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        <CopyIcon text={value} />
      </div>
      <div
        className="bg-muted/40 rounded-lg border border-border/50 px-3 py-2.5 text-[13px] text-foreground whitespace-pre-line leading-relaxed"
        dangerouslySetInnerHTML={{ __html: sanitizeAndRenderMd(value) }}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between py-1.5 text-[13px] border-b border-border/30 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium text-right max-w-[60%]">{safeStr(value)}</span>
    </div>
  );
}

// ── Collapsible Section ────────────────────────────────────────────

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false }: {
  title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/40">
      <button className="w-full flex items-center gap-2 py-3 px-1 text-sm font-medium text-foreground hover:text-primary transition-colors" onClick={() => setOpen((o) => !o)}>
        <Icon className="w-4 h-4 text-primary/70" />
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="pb-4 px-1 space-y-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Content renderers ───────────────────────────────────────────────

function AdsContent({ content, s }: { content: any; s: (v: string) => string }) {
  if (!content) return null;
  const format = content.format || "";
  const isVideo = format.includes("video") || format.includes("ugc") || format === "story";
  const isCarousel = format === "carousel";

  if (isCarousel && Array.isArray(content.slides)) {
    return (
      <div className="space-y-1">
        {content.slides.map((sl: any, i: number) => (
          <div key={i} className="mb-3">
            <CopyBlock label={`Slide ${sl.numero || i + 1} — Visuel`} value={s(safeStr(sl.visuel))} />
            <CopyBlock label={`Slide ${sl.numero || i + 1} — Texte`} value={s(safeStr(sl.texte_slide))} />
          </div>
        ))}
        <div className="border-t border-border/30 pt-3 mt-3">
          <CopyBlock label="Texte principal" value={s(safeStr(content.texte_principal))} />
          <CopyBlock label="Titre" value={s(safeStr(content.titre))} />
          <CopyBlock label="Description" value={s(safeStr(content.description))} />
        </div>
        {content.cta && <CtaBadge cta={content.cta} />}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="space-y-1">
        <CopyBlock label="Hook" value={s(safeStr(content.hook || content.hook_text))} />
        <CopyBlock label="Script" value={s(safeStr(content.script || content.script_ou_descriptif))} />
        {content.note_production && <p className="text-xs text-muted-foreground italic mt-2 px-1">{s(safeStr(content.note_production))}</p>}
        <div className="border-t border-border/30 pt-3 mt-3">
          <CopyBlock label="Texte principal" value={s(safeStr(content.texte_principal || content.ad_copy?.primary_text))} />
          <CopyBlock label="Titre" value={s(safeStr(content.titre || content.ad_copy?.headline))} />
          <CopyBlock label="Description" value={s(safeStr(content.description || content.ad_copy?.description))} />
        </div>
        {content.cta && <CtaBadge cta={content.cta} />}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {content.concept_visuel && <CopyBlock label="Concept visuel" value={s(safeStr(content.concept_visuel))} />}
      {!content.concept_visuel && content.hook_text && <CopyBlock label="Hook texte" value={s(safeStr(content.hook_text))} />}
      {!content.concept_visuel && content.script_ou_descriptif && <CopyBlock label="Descriptif visuel" value={s(safeStr(content.script_ou_descriptif))} />}
      <div className="border-t border-border/30 pt-3 mt-3">
        <CopyBlock label="Texte principal" value={s(safeStr(content.texte_principal || content.ad_copy?.primary_text))} />
        <CopyBlock label="Titre" value={s(safeStr(content.titre || content.ad_copy?.headline))} />
        <CopyBlock label="Description" value={s(safeStr(content.description || content.ad_copy?.description))} />
      </div>
      {content.cta && <CtaBadge cta={content.cta} />}
    </div>
  );
}

function EmailsContent({ content, s }: { content: any; s: (v: string) => string }) {
  if (!content) return null;

  // Flow email — show detailed flow
  if (content.type_email === "flow" && content.flow_details) {
    const fd = content.flow_details;
    const emails = Array.isArray(fd.emails) ? fd.emails : [];
    const lastDelay = emails.length > 0 ? emails[emails.length - 1].delai : "";
    return (
      <div className="space-y-3">
        <div className="bg-secondary/10 rounded-lg border border-secondary/20 px-3 py-2 text-xs">
          <p className="font-semibold text-foreground mb-1">Flow automatisé — {fd.nombre_emails || emails.length} emails</p>
          {fd.trigger && <p className="text-muted-foreground"><span className="font-medium">Trigger :</span> {s(safeStr(fd.trigger))}</p>}
          {lastDelay && <p className="text-muted-foreground"><span className="font-medium">Durée totale :</span> de immédiat à {lastDelay}</p>}
          {fd.description_flow && <p className="text-muted-foreground mt-1">{s(safeStr(fd.description_flow))}</p>}
        </div>
        <CopyBlock label="Objet (premier email)" value={s(safeStr(content.objet))} />
        {content.objet_variante && <CopyBlock label="Objet variante A/B" value={s(safeStr(content.objet_variante))} />}
        {emails.map((email: any, i: number) => (
          <div key={i} className="bg-muted/30 rounded-lg border border-border/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Email {email.position || i + 1} — {safeStr(email.delai)}</span>
              <CopyIcon text={safeStr(email.objet)} />
            </div>
            <p className="text-xs"><span className="text-muted-foreground font-medium">Objet :</span> <span className="text-foreground">{s(safeStr(email.objet))}</span></p>
            <p className="text-xs"><span className="text-muted-foreground font-medium">Objectif :</span> <span className="text-foreground">{s(safeStr(email.objectif))}</span></p>
            <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeAndRenderMd(s(safeStr(email.contenu_resume))) }} />
            {email.cta && <p className="text-xs"><span className="text-muted-foreground font-medium">CTA :</span> <span className="font-semibold text-primary">{s(safeStr(email.cta))}</span></p>}
          </div>
        ))}
        {content.cta && <CtaBadge cta={content.cta} />}
      </div>
    );
  }

  // Newsletter / campagne — existing layout
  return (
    <div className="space-y-1">
      <CopyBlock label="Objet" value={s(safeStr(content.objet))} />
      {content.objet_variante && <CopyBlock label="Objet variante A/B" value={s(safeStr(content.objet_variante))} />}
      {Array.isArray(content.contenu_sections) && content.contenu_sections.map((sec: any, i: number) => (
        <CopyBlock key={i} label={s(safeStr(sec.section))} value={s(safeStr(sec.contenu))} />
      ))}
      {content.cta && <CtaBadge cta={content.cta} />}
    </div>
  );
}

function OffersContent({ content, s }: { content: any; s: (v: string) => string }) {
  if (!content) return null;
  const OFFER_TYPE_LABELS: Record<string, string> = {
    bundle: "Bundle", upsell: "Upsell", cross_sell: "Cross-sell", offre_lancement: "Offre de Lancement",
    programme_fidelite: "Programme Fidélité", offre_saisonniere: "Offre Saisonnière",
    cadeau_avec_achat: "Cadeau avec Achat", vente_privee: "Vente Privée", parrainage: "Parrainage",
  };
  return (
    <div className="space-y-3">
      {content.concept && <CopyBlock label="Concept" value={s(safeStr(content.concept))} />}
      {content.type_offre && <InfoRow label="Type d'offre" value={OFFER_TYPE_LABELS[content.type_offre] || content.type_offre} />}
      {Array.isArray(content.composition) && content.composition.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Composition</p>
          <div className="space-y-1">
            {content.composition.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2.5 py-1.5 border border-border/40">
                <span className="font-medium text-foreground">{safeStr(p.produit)}</span>
                <span className="text-muted-foreground">{safeStr(p.role)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {content.pricing && (
        <div className="bg-primary/5 rounded-lg border border-primary/15 px-3 py-2.5 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground line-through">{safeStr(content.pricing.prix_normal)}</span>
            <span className="text-primary font-bold text-sm">{safeStr(content.pricing.prix_offre)}</span>
            {content.pricing.economie && <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">{safeStr(content.pricing.economie)}</Badge>}
          </div>
        </div>
      )}
      {content.messaging && (
        <div className="space-y-1">
          <CopyBlock label="Message Ads" value={s(safeStr(content.messaging.ads))} />
          <CopyBlock label="Message Email" value={s(safeStr(content.messaging.email))} />
          <CopyBlock label="Message Site" value={s(safeStr(content.messaging.site))} />
        </div>
      )}
      {content.plan_lancement_resume && <CopyBlock label="Plan de lancement" value={s(safeStr(content.plan_lancement_resume))} />}
    </div>
  );
}

function CtaBadge({ cta }: { cta: any }) {
  const ctaText = typeof cta === "object" ? safeStr(cta.texte || cta) : safeStr(cta);
  if (!ctaText) return null;
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase">CTA :</span>
      <Badge variant="outline" className="text-xs font-bold text-primary border-primary/40 bg-primary/5">{ctaText}</Badge>
    </div>
  );
}

// ── Targeting renderers ──────────────────────────────────────────────

function AdsTargeting({ targeting }: { targeting: any }) {
  if (!targeting) return null;
  let kpiDisplay = "";
  if (targeting.kpi_attendu) {
    const k = targeting.kpi_attendu;
    const parts = [];
    if (k.metrique && k.valeur_cible) parts.push(`${k.metrique} ${k.valeur_cible}`);
    if (k.metrique_secondaire && k.valeur_secondaire) parts.push(`${k.metrique_secondaire} ${k.valeur_secondaire}`);
    if (k.ctr) parts.push(`CTR ${k.ctr}`);
    if (k.roas) parts.push(`ROAS ${k.roas}`);
    kpiDisplay = parts.join(" · ");
  }
  return (
    <div>
      {targeting.type_audience && <InfoRow label="Type d'audience" value={targeting.type_audience} />}
      {Array.isArray(targeting.suggestions_audiences) && targeting.suggestions_audiences.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Audiences</p>
          <ul className="space-y-1">
            {targeting.suggestions_audiences.map((a: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!targeting.suggestions_audiences && Array.isArray(targeting.audiences) && targeting.audiences.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Audiences</p>
          <ul className="space-y-1">
            {targeting.audiences.map((a: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      <InfoRow label="Budget suggéré" value={targeting.budget_suggere} />
      <InfoRow label="Plateforme · Format" value={targeting.plateforme} />
      {kpiDisplay && <InfoRow label="KPI attendu" value={kpiDisplay} />}
      {targeting.ab_test && <CopyBlock label="Suggestion A/B test" value={safeStr(targeting.ab_test)} />}
    </div>
  );
}

function EmailsTargeting({ targeting }: { targeting: any }) {
  if (!targeting) return null;
  let kpiDisplay = "";
  if (targeting.kpi_attendu) {
    const parts = [];
    if (targeting.kpi_attendu.taux_ouverture_vise) parts.push(`Ouverture ${targeting.kpi_attendu.taux_ouverture_vise}`);
    if (targeting.kpi_attendu.taux_clic_vise) parts.push(`Clic ${targeting.kpi_attendu.taux_clic_vise}`);
    kpiDisplay = parts.join(" · ");
  }
  return (
    <div>
      <InfoRow label="Segment" value={targeting.segment} />
      <InfoRow label="Timing" value={targeting.timing} />
      {targeting.trigger && <InfoRow label="Trigger" value={targeting.trigger} />}
      {targeting.position_dans_flow && <InfoRow label="Position dans le flow" value={targeting.position_dans_flow} />}
      {kpiDisplay && <InfoRow label="KPI attendu" value={kpiDisplay} />}
    </div>
  );
}

function OffersTargeting({ targeting }: { targeting: any }) {
  if (!targeting) return null;
  let kpiDisplay = "";
  if (targeting.kpi_attendu) {
    const k = targeting.kpi_attendu;
    const parts = [];
    if (k.metrique && k.valeur_cible) parts.push(`${k.metrique} ${k.valeur_cible}`);
    if (k.metrique_secondaire && k.valeur_secondaire) parts.push(`${k.metrique_secondaire} ${k.valeur_secondaire}`);
    kpiDisplay = parts.join(" · ");
  }
  return (
    <div>
      <InfoRow label="Canal" value={targeting.canal} />
      <InfoRow label="Période" value={targeting.periode} />
      <InfoRow label="Durée" value={targeting.duree} />
      {kpiDisplay && <InfoRow label="KPI attendu" value={kpiDisplay} />}
    </div>
  );
}

const SOURCE_ICONS: Record<string, string> = {
  source_marketing: "📊", inspiration_marque: "💡", ad_concurrent: "📱", email_concurrent: "📧", offre_concurrent: "🏷️",
};

function SourcesList({ sources, s }: { sources: any[]; s: (v: string) => string }) {
  const validSources = (sources || []).filter((src: any) => src && src.source_name && String(src.source_name).trim());
  if (validSources.length === 0) return <p className="text-xs text-muted-foreground italic">Aucune source spécifique</p>;
  return (
    <div className="space-y-2">
      {validSources.map((src: any, i: number) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span>{SOURCE_ICONS[src.type] || "📄"}</span>
          <div>
            {src.url ? (
              <a href={src.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{s(safeStr(src.source_name))}</a>
            ) : (
              <span className="font-medium text-foreground">{s(safeStr(src.source_name))}</span>
            )}
            {src.description && String(src.description).trim() && (
              <p className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeAndRenderMd(s(safeStr(src.description))) }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

interface RecommendationCardProps {
  recommendation: Recommendation;
  onStatusChange: (id: string, status: "todo" | "in_progress" | "done") => void;
  category: "ads" | "emails" | "offers";
  onOpenFeedback?: (rec: Recommendation) => void;
}

export function RecommendationCard({ recommendation: rec, onStatusChange, category, onOpenFeedback }: RecommendationCardProps) {
  const isDone = rec.action_status === "done";
  const { getName } = usePersonaProfiles();

  // Sanitizer shorthand — strips persona codes from any string
  const s = (text: string) => sanitizePersonaReferences(text, getName);

  const rawPersona = rec.persona_cible || rec.persona_code || "";
  const personaLabel = resolvePersonaCodes(rawPersona, getName);
  const contentFormat = rec.content?.format;

  const priorityLabel = rec.priority === 1 ? "★ Priorité haute" : rec.priority === 2 ? "★★ Moyenne" : "★★★ Basse";
  const priorityColor = rec.priority === 1 ? "text-primary" : rec.priority === 2 ? "text-accent" : "text-muted-foreground";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className={cn(
        "border overflow-hidden transition-all duration-200",
        isDone && "opacity-60",
        !isDone && "border-border/60 shadow-sm hover:shadow-md"
      )}>
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                <span className={cn("text-[10px] font-bold", priorityColor)}>{priorityLabel}</span>
                {contentFormat && <FormatBadge value={contentFormat} />}
                <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0 h-5 font-semibold", CATEGORY_COLORS[category])}>
                  {CATEGORY_LABELS[category]}
                </Badge>
              </div>
              <h4 className="text-sm font-bold text-foreground leading-snug">{s(safeStr(rec.title) || "Recommandation")}</h4>
              {personaLabel && <p className="text-xs text-muted-foreground mt-0.5">Pour {s(personaLabel)}</p>}
            </div>
            {rec.persona_code && (
              <div className="shrink-0 flex flex-wrap gap-1">
                {rec.persona_code.split(",").map((code: string) => (
                  <PersonaBadge key={code.trim()} code={code.trim()} />
                ))}
              </div>
            )}
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onStatusChange(rec.id, opt.value)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-full border transition-all font-medium",
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

          {/* Brief */}
          {rec.brief && (
            <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-line" dangerouslySetInnerHTML={{ __html: sanitizeAndRenderMd(s(rec.brief)) }} />
          )}

          {/* Collapsible sections */}
          {rec.content && Object.keys(rec.content).length > 0 && (
            <div className="mt-1">
              <CollapsibleSection title="Contenu créatif" icon={BookOpen}>
                {category === "ads" && <AdsContent content={rec.content} s={s} />}
                {category === "emails" && <EmailsContent content={rec.content} s={s} />}
                {category === "offers" && <OffersContent content={rec.content} s={s} />}
              </CollapsibleSection>

              <CollapsibleSection title="Ciblage & mise en œuvre" icon={Target}>
                {category === "ads" && <AdsTargeting targeting={rec.targeting} />}
                {category === "emails" && <EmailsTargeting targeting={rec.targeting} />}
                {category === "offers" && <OffersTargeting targeting={rec.targeting} />}
              </CollapsibleSection>

              <CollapsibleSection title="Sources & inspirations" icon={Lightbulb}>
                <SourcesList sources={Array.isArray(rec.sources_inspirations) ? rec.sources_inspirations : []} s={s} />
              </CollapsibleSection>

              {/* Results section — only when done */}
              {isDone && (
                <CollapsibleSection title="Résultats" icon={BarChart3} defaultOpen={!!rec.feedback_score}>
                  {rec.feedback_entered_at ? (
                    <div className="space-y-3">
                      {rec.feedback_score && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Score :</span>
                          <Badge variant="outline" className={cn("text-[10px] px-2 py-0 h-5 font-semibold",
                            rec.feedback_score === "good" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" :
                            rec.feedback_score === "poor" ? "bg-destructive/10 text-destructive border-destructive/30" :
                            "bg-amber-500/10 text-amber-700 border-amber-500/30"
                          )}>
                            {rec.feedback_score === "good" ? "🟢 Bon" : rec.feedback_score === "poor" ? "🔴 Mauvais" : "🟡 Moyen"}
                          </Badge>
                        </div>
                      )}
                      {rec.feedback_results?.periode && (
                        <p className="text-xs text-muted-foreground">
                          Période : {new Date(rec.feedback_results.periode.debut).toLocaleDateString("fr-FR")} → {new Date(rec.feedback_results.periode.fin).toLocaleDateString("fr-FR")} ({rec.feedback_results.periode.duree_jours}j)
                        </p>
                      )}
                      {rec.targeting?.kpi_attendu && (() => {
                        const kpi = rec.targeting.kpi_attendu;
                        const entries: [string, string][] = [];
                        if (kpi.metrique && kpi.valeur_cible) entries.push([kpi.metrique, kpi.valeur_cible]);
                        if (kpi.metrique_secondaire && kpi.valeur_secondaire) entries.push([kpi.metrique_secondaire, kpi.valeur_secondaire]);
                        for (const [k, v] of Object.entries(kpi)) {
                          if (!["metrique", "valeur_cible", "metrique_secondaire", "valeur_secondaire"].includes(k) && typeof v === "string") entries.push([k, v as string]);
                        }
                        const resultKeyMap: Record<string, string> = { CTR: "ctr", ROAS: "roas", taux_ouverture_vise: "taux_ouverture", Ouverture: "taux_ouverture", taux_clic_vise: "taux_clic", Clic: "taux_clic", "Taux de conversion": "taux_conversion", "Panier moyen": "panier_moyen" };
                        return (
                          <div className="text-xs space-y-0.5">
                            {entries.map(([k, v]) => {
                              const rk = resultKeyMap[k] || k.toLowerCase();
                              const actual = rec.feedback_results?.[rk];
                              return (
                                <p key={k}>
                                  <span className="text-muted-foreground">{k} :</span>{" "}
                                  {actual !== undefined ? <span className="font-medium text-foreground">{actual}</span> : <span className="text-muted-foreground/50">—</span>}
                                  <span className="text-muted-foreground/60 ml-1">(obj: {v})</span>
                                </p>
                              );
                            })}
                          </div>
                        );
                      })()}
                      {rec.feedback_notes && <p className="text-xs text-foreground/80 italic">{rec.feedback_notes}</p>}
                      {onOpenFeedback && (
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => onOpenFeedback(rec)}>
                          Modifier les résultats
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <p className="text-xs text-muted-foreground mb-2">Aucun résultat renseigné</p>
                      {onOpenFeedback && (
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => onOpenFeedback(rec)}>
                          Ajouter vos résultats
                        </Button>
                      )}
                    </div>
                  )}
                </CollapsibleSection>
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
