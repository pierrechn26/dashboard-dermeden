import { Badge } from "@/components/ui/badge";

const FORMAT_LABELS: Record<string, string> = {
  // Ad formats - new V3
  video_ugc: "Vidéo UGC",
  video_brand: "Vidéo Brand",
  image: "Image Statique",
  carousel: "Carrousel",
  before_after: "Avant / Après",
  story: "Story",
  collection: "Collection",
  // Ad formats - legacy
  reel: "Reel",
  story_video: "Story vidéo",
  ugc_video: "UGC vidéo",
  static_image: "Image statique",
  // Email types
  newsletter: "Newsletter",
  flow: "Flow Automatisé",
  campagne: "Campagne",
  relance: "Relance",
  winback: "Winback",
  flow_automation: "Flow auto.",
  campagne_promo: "Campagne promo",
  post_diagnostic: "Post-diagnostic",
  // Offer types
  bundle: "Bundle",
  upsell: "Upsell",
  cross_sell: "Cross-sell",
  offre_lancement: "Offre de Lancement",
  offre_saisonniere: "Offre Saisonnière",
  cadeau_avec_achat: "Cadeau avec Achat",
  vente_privee: "Vente Privée",
  parrainage: "Parrainage",
  programme_fidelite: "Programme Fidélité",
  offre_limitee: "Offre limitée",
  prix_psychologique: "Prix psychologique",
  // Funnel stages
  tofu_awareness: "TOFU",
  mofu_consideration: "MOFU",
  bofu_conversion: "BOFU",
  retargeting: "Retargeting",
};

const FORMAT_COLORS: Record<string, string> = {
  video_ugc: "bg-pink-500/15 text-pink-700 border-pink-500/30",
  video_brand: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  image: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  carousel: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  before_after: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  story: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  collection: "bg-teal-500/15 text-teal-700 border-teal-500/30",
  reel: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  story_video: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  ugc_video: "bg-pink-500/15 text-pink-700 border-pink-500/30",
  static_image: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  newsletter: "bg-secondary/15 text-secondary border-secondary/30",
  flow: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  campagne: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  relance: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  winback: "bg-red-500/15 text-red-700 border-red-500/30",
  flow_automation: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  campagne_promo: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  post_diagnostic: "bg-primary/15 text-primary border-primary/30",
  bundle: "bg-accent/20 text-foreground border-accent/30",
  upsell: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  cross_sell: "bg-teal-500/15 text-teal-700 border-teal-500/30",
  offre_lancement: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  offre_saisonniere: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  cadeau_avec_achat: "bg-pink-500/15 text-pink-700 border-pink-500/30",
  vente_privee: "bg-red-500/15 text-red-700 border-red-500/30",
  parrainage: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  programme_fidelite: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  offre_limitee: "bg-red-500/15 text-red-700 border-red-500/30",
  prix_psychologique: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  tofu_awareness: "bg-muted text-muted-foreground border-border",
  mofu_consideration: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  bofu_conversion: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  retargeting: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

export function getFormatLabel(value: string): string {
  return FORMAT_LABELS[value] ?? value;
}

export function FormatBadge({ value }: { value?: string }) {
  if (!value) return null;
  const label = FORMAT_LABELS[value] ?? value;
  const color = FORMAT_COLORS[value] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={`text-[10px] px-2 py-0 h-5 font-semibold ${color}`}>
      {label}
    </Badge>
  );
}
