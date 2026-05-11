/**
 * Diagnostic types — generic, tenant-agnostic.
 *
 * The DiagnosticItem type reflects the diagnostic_items table schema (see
 * supabase/migrations/20260415093000_template_transformation_lot1.sql).
 *
 * Universal top-level fields:
 *   - id, session_id, item_index, created_at      → standard relational fields
 *   - item_label                                  → short human-readable label
 *                                                    (e.g., a child's first name,
 *                                                     a project name, an animal name)
 *   - item_metadata: JSONB                        → tenant-specific structured data
 *                                                    (e.g., {age, age_range, skin_concern}
 *                                                     for Ouate, or any other shape)
 *   - dynamic_question_1/2/3 + dynamic_answer_1/2/3  → up to 3 IA-generated branched
 *                                                       questions personalized to the
 *                                                       user's earlier answers
 *   - dynamic_insight_targets                     → comma-separated insight codes
 *                                                    targeted by the dynamic questions
 */

export interface DiagnosticItem {
  id?: string;
  session_id?: string;
  item_index: number;
  item_label: string | null;
  /**
   * Structured tenant-specific data. Shape varies by client.
   * Example for a cosmetics tenant: { age: 6, age_range: "4-8", skin_concern: "sensitive" }
   * Example for a B2C service tenant: { occasion: "gift", recipient_type: "self" }
   */
  item_metadata: Record<string, unknown> | null;
  dynamic_question_1: string | null;
  dynamic_answer_1: string | null;
  dynamic_question_2: string | null;
  dynamic_answer_2: string | null;
  dynamic_question_3: string | null;
  dynamic_answer_3: string | null;
  dynamic_insight_targets: string | null;
  created_at?: string | null;
}

export interface DiagnosticSession {
  id: string;
  session_code: string;
  created_at: string;
  status: string;
  source: string | null;
  utm_campaign: string | null;
  device: string | null;
  user_name: string | null;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  optin_email: boolean;
  optin_sms: boolean;
  number_of_children: number | null;
  locale: string | null;
  result_url: string | null;
  persona_detected: string | null;
  persona_matching_score: number | null;
  adapted_tone: string | null;
  ai_key_messages: string | null;
  ai_suggested_segment: string | null;
  conversion: boolean;
  exit_type: string | null;
  existing_client_products: string | null;
  is_existing_client: boolean;
  recommended_products: string | null;
  recommended_cart_amount: number | null;
  validated_products: string | null;
  validated_cart_amount: number | null;
  upsell_potential: string | null;
  duration_seconds: number | null;
  abandoned_at_step: string | null;
  question_path: string | null;
  back_navigation_count: number;
  has_optional_details: boolean;
  behavior_tags: string | null;
  engagement_score: number | null;
  routine_size_preference: string | null;
  priorities_ordered: string | null;
  trust_triggers_ordered: string | null;
  content_format_preference: string | null;
  persona_code: string | null;
  matching_score: number | null;
  over_quota: boolean;
  items: DiagnosticItem[];
  _source: "new" | "legacy";
}

export type CategoryKey =
  | "identification"
  | "persona"
  | "business"
  | "comportement"
  | "statiques"
  | "dynamiques";

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  color: string;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "identification", label: "Identification & Tracking", color: "#E8E8E8" },
  { key: "persona", label: "Personas & IA", color: "#EDE0F0" },
  { key: "business", label: "Business & Conversion", color: "#D5F5E3" },
  { key: "comportement", label: "Comportement", color: "#FEF3C7" },
  { key: "statiques", label: "Questions statiques", color: "#DBEAFE" },
  { key: "dynamiques", label: "Questions dynamiques IA", color: "#FEE2E2" },
];

export const STATUS_LABELS: Record<string, string> = {
  en_cours: "En cours",
  termine: "Terminé",
  abandonne: "Abandonné",
};

export const RELATIONSHIP_LABELS: Record<string, string> = {
  parent_mama: "Maman",
  parent_papa: "Papa",
  beau_parent: "Beau-parent",
  grand_parent: "Grand-parent",
  autre: "Autre",
};

/**
 * Sort items by item_index ASC (creation order in the diagnostic session).
 * Universal: works for any tenant regardless of metadata fields.
 */
export function getSortedItems(session: DiagnosticSession): DiagnosticItem[] {
  if (!session.items?.length) return [];
  return [...session.items].sort((a, b) => (a.item_index ?? 0) - (b.item_index ?? 0));
}

/**
 * Build a textual summary of items beyond the first 4 (used for compact display
 * in the sessions table). Uses item_label and a few keys from item_metadata.
 */
export function getExtraItemsSummary(session: DiagnosticSession): string {
  const sorted = getSortedItems(session);
  if (sorted.length <= 4) return "—";
  return sorted
    .slice(4)
    .map((item) => {
      const parts: string[] = [];
      if (item.item_label) parts.push(item.item_label);
      // Include up to 2 first metadata key-values for context
      if (item.item_metadata) {
        const entries = Object.entries(item.item_metadata).slice(0, 2);
        for (const [key, value] of entries) {
          if (value !== null && value !== undefined && value !== "") {
            parts.push(`${key}: ${value}`);
          }
        }
      }
      return parts.join(", ");
    })
    .join(" | ");
}

/**
 * Build a textual summary of the dynamic IA answers for items beyond the first 4.
 */
export function getExtraItemsDynamic(session: DiagnosticSession): string {
  const sorted = getSortedItems(session);
  if (sorted.length <= 4) return "—";
  return sorted
    .slice(4)
    .map((item) => {
      const parts: string[] = [];
      if (item.item_label) parts.push(item.item_label);
      if (item.dynamic_answer_1) parts.push(`R1: ${item.dynamic_answer_1}`);
      if (item.dynamic_answer_2) parts.push(`R2: ${item.dynamic_answer_2}`);
      if (item.dynamic_answer_3) parts.push(`R3: ${item.dynamic_answer_3}`);
      return parts.join(", ");
    })
    .join(" | ");
}
