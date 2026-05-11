import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Recommendation {
  id: string;
  title: string;
  brief: string | null;
  category: string | null;
  persona_cible: string | null;
  persona_code: string | null;
  priority: number;
  generation_status: string;
  action_status: string;
  generated_at: string | null;
  week_start: string;
  recommendation_version: number;
  generation_type: string | null;
  content: any;
  targeting: any;
  sources_inspirations: any;
  feedback_score: string | null;
  feedback_notes: string | null;
  feedback_results: any;
  feedback_entered_at: string | null;
  completed_at: string | null;
  // Legacy fields kept for backward compat
  ads_v2: any;
  offers_v2: any;
  emails_v2: any;
  campaigns_overview: any;
  checklist: any;
  persona_focus: any;
  generation_config: any;
  ads_recommendations: any;
  email_recommendations: any;
  offers_recommendations: any;
  sources_consulted: any;
  status: string | null;
  generated_categories: any;
  pre_calculated_context: any;
}

export interface RecommendationStats {
  total: number;
  pending: number;
  complete: number;
  todo: number;
  in_progress: number;
  done: number;
}

export interface QuotaData {
  used: number;
  limit: number;
  remaining: number;
  plan: string;
}

export function useMarketingRecommendations() {
  const [allRecommendations, setAllRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState<string | null>(null); // category being generated
  const [quota, setQuota] = useState<QuotaData>({ used: 0, limit: 60, remaining: 60, plan: "growth" });
  const { toast } = useToast();

  const fetchRecommendations = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "generate-marketing-recommendations",
        { method: "GET" }
      );
      if (error) throw error;
      setAllRecommendations(result?.recommendations ?? []);
      if (result?.quota) {
        setQuota({
          used: result.quota.total_generated ?? 0,
          limit: result.quota.monthly_limit ?? 60,
          remaining: result.quota.remaining ?? 60,
          plan: result.quota.plan ?? "growth",
        });
      }
    } catch (err) {
      console.error("Erreur fetch recommandations:", err);
      toast({
        title: "Erreur",
        description: "Impossible de charger les recommandations marketing.",
        variant: "destructive",
      });
      setAllRecommendations([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Generate a new recommendation on-demand
  const generateRecommendation = useCallback(async (category: "ads" | "emails" | "offers") => {
    setIsGenerating(category);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-recommendation-content",
        { body: { category } }
      );
      if (error) throw error;

      if (data?.error === "quota_exceeded") {
        toast({
          title: "Limite atteinte",
          description: `Vous avez atteint votre limite mensuelle de ${data.limit} recommandations.`,
          variant: "destructive",
        });
        return;
      }

      if (data?.error) {
        toast({
          title: "Erreur de génération",
          description: data.message || "La génération a échoué. Réessayez.",
          variant: "destructive",
        });
        return;
      }

      // Add the new recommendation to local state
      if (data?.recommendation) {
        setAllRecommendations((prev) => [data.recommendation, ...prev]);
        if (data.quota) {
          setQuota({
            used: data.quota.used,
            limit: data.quota.limit,
            remaining: data.quota.remaining,
            plan: quota.plan,
          });
        }
        toast({
          title: "Recommandation générée ✨",
          description: `"${data.recommendation.title}" est prête.`,
        });
      }
    } catch (err: any) {
      console.error("[generateRecommendation]", err);
      toast({
        title: "Erreur",
        description: err?.message || "La génération a échoué.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(null);
    }
  }, [toast, quota.plan]);

  // Update action_status (todo / in_progress / done)
  const updateStatus = useCallback(async (recommendationId: string, status: "todo" | "in_progress" | "done") => {
    const prev = allRecommendations.find((r) => r.id === recommendationId);
    // Optimistic
    setAllRecommendations((all) =>
      all.map((r) => r.id === recommendationId ? { ...r, action_status: status, completed_at: status === "done" ? new Date().toISOString() : r.completed_at } : r)
    );

    try {
      const { error } = await supabase.functions.invoke(
        "generate-marketing-recommendations",
        { body: { action: "update_status", recommendation_id: recommendationId, status } }
      );
      if (error) throw error;
    } catch (err) {
      console.error("[updateStatus]", err);
      if (prev) {
        setAllRecommendations((all) =>
          all.map((r) => r.id === recommendationId ? prev : r)
        );
      }
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le statut.",
        variant: "destructive",
      });
    }
  }, [allRecommendations, toast]);

  // Submit feedback results
  const submitFeedback = useCallback(async (recommendationId: string, results: any, notes: string) => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-marketing-recommendations",
        { body: { action: "submit_feedback", recommendation_id: recommendationId, results, notes } }
      );
      if (error) throw error;

      // Optimistic update
      setAllRecommendations((all) =>
        all.map((r) => r.id === recommendationId ? {
          ...r,
          feedback_results: results,
          feedback_score: data?.feedback_score || null,
          feedback_notes: notes || null,
          feedback_entered_at: new Date().toISOString(),
          action_status: "done",
          completed_at: r.completed_at || new Date().toISOString(),
        } : r)
      );

      toast({
        title: "Résultats enregistrés ✓",
        description: data?.feedback_score ? `Score : ${data.feedback_score === "good" ? "Bon" : data.feedback_score === "poor" ? "Mauvais" : "Moyen"}` : "Résultats sauvegardés.",
      });
    } catch (err: any) {
      console.error("[submitFeedback]", err);
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer les résultats.",
        variant: "destructive",
      });
      throw err;
    }
  }, [toast]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Split by category (V3 individual recos)
  const v3Recos = allRecommendations.filter((r) => r.recommendation_version === 3);
  const sortFn = (a: Recommendation, b: Recommendation) => {
    // Done items at the bottom
    if (a.action_status === "done" && b.action_status !== "done") return 1;
    if (a.action_status !== "done" && b.action_status === "done") return -1;
    return a.priority - b.priority || new Date(b.generated_at ?? 0).getTime() - new Date(a.generated_at ?? 0).getTime();
  };

  const recommendations = {
    ads: v3Recos.filter((r) => r.category === "ads").sort(sortFn),
    emails: v3Recos.filter((r) => r.category === "emails").sort(sortFn),
    offers: v3Recos.filter((r) => r.category === "offers").sort(sortFn),
  };

  // Flat views for overview
  const activeTasks = v3Recos
    .filter((r) => r.action_status === "todo" || r.action_status === "in_progress")
    .sort((a, b) => a.priority - b.priority || new Date(b.generated_at ?? 0).getTime() - new Date(a.generated_at ?? 0).getTime());

  const completedTasks = v3Recos
    .filter((r) => r.action_status === "done")
    .sort((a, b) => new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime());

  const stats: RecommendationStats = {
    total: v3Recos.length,
    pending: v3Recos.filter((r) => r.generation_status === "pending").length,
    complete: v3Recos.filter((r) => r.generation_status === "complete").length,
    todo: v3Recos.filter((r) => r.action_status === "todo").length,
    in_progress: v3Recos.filter((r) => r.action_status === "in_progress").length,
    done: v3Recos.filter((r) => r.action_status === "done").length,
  };

  return {
    allRecommendations,
    recommendations,
    activeTasks,
    completedTasks,
    stats,
    quota,
    loading: isLoading,
    isLoading,
    isGenerating,
    generateRecommendation,
    updateStatus,
    submitFeedback,
    refresh: fetchRecommendations,
    refetch: fetchRecommendations,
  };
}
