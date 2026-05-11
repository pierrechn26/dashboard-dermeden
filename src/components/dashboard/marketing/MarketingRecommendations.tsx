import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  LayoutGrid,
  Megaphone,
  Gift,
  Mail,
} from "lucide-react";
import { useMarketingRecommendations, type Recommendation } from "@/hooks/useMarketingRecommendations";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { MarketingOverviewTab } from "./MarketingOverviewTab";
import { MarketingAdsTab } from "./MarketingAdsTab";
import { MarketingOffersTab } from "./MarketingOffersTab";
import { MarketingEmailsTab } from "./MarketingEmailsTab";
import { FeedbackForm } from "./FeedbackForm";
import { Badge } from "@/components/ui/badge";

export function MarketingRecommendations() {
  const {
    recommendations,
    activeTasks,
    completedTasks,
    stats,
    quota,
    loading,
    isGenerating,
    generateRecommendation,
    updateStatus,
    submitFeedback,
  } = useMarketingRecommendations();

  const usageLimits = useUsageLimits();

  const [activeTab, setActiveTab] = useState("overview");
  const [feedbackRec, setFeedbackRec] = useState<Recommendation | null>(null);

  const handleNavigateToDetail = useCallback((rec: Recommendation) => {
    const tab = rec.category === "emails" ? "emails" : rec.category === "offers" ? "offers" : "ads";
    setActiveTab(tab);
    setTimeout(() => {
      document.getElementById(`reco-${rec.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, []);

  const handleOpenFeedback = useCallback((rec: Recommendation) => {
    setFeedbackRec(rec);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Chargement des recommandations...</span>
      </div>
    );
  }

  const recosUsage = {
    percentage: usageLimits.recos.percentage,
    isWarning: usageLimits.recos.isWarning,
    isExceeded: usageLimits.recos.isExceeded,
    used: usageLimits.recos.used,
    limit: usageLimits.recos.limit,
    nextPlanLabel: usageLimits.upgrade.nextPlanLabel,
    nextPlanPrice: usageLimits.upgrade.nextPlanPrice,
    hasNextPlan: !!usageLimits.upgrade.nextPlan,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground font-heading mb-2">Marketing IA Hub</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto w-full items-center justify-between gap-2 rounded-lg bg-muted/30 p-1.5">
          <TabsTrigger value="overview" className="flex-1 gap-1">
            <LayoutGrid className="w-4 h-4" />
            Vue d'ensemble
            {activeTasks.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{activeTasks.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="ads" className="flex-1 gap-1">
            <Megaphone className="w-4 h-4" />
            Ads
            {recommendations.ads.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{recommendations.ads.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="offers" className="flex-1 gap-1">
            <Gift className="w-4 h-4" />
            Offres
            {recommendations.offers.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{recommendations.offers.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="emails" className="flex-1 gap-1">
            <Mail className="w-4 h-4" />
            Emailing
            {recommendations.emails.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{recommendations.emails.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <MarketingOverviewTab
            activeTasks={activeTasks}
            completedTasks={completedTasks}
            stats={stats}
            quota={quota}
            onStatusChange={updateStatus}
            onNavigateToDetail={handleNavigateToDetail}
            onOpenFeedback={handleOpenFeedback}
            recosUsage={recosUsage}
          />
        </TabsContent>

        <TabsContent value="ads" className="mt-0">
          <MarketingAdsTab
            recommendations={recommendations.ads}
            onGenerateRecommendation={() => generateRecommendation("ads")}
            onStatusChange={updateStatus}
            isGenerating={isGenerating === "ads"}
            quota={quota}
            onOpenFeedback={handleOpenFeedback}
            recosUsage={recosUsage}
          />
        </TabsContent>

        <TabsContent value="offers" className="mt-0">
          <MarketingOffersTab
            recommendations={recommendations.offers}
            onGenerateRecommendation={() => generateRecommendation("offers")}
            onStatusChange={updateStatus}
            isGenerating={isGenerating === "offers"}
            quota={quota}
            onOpenFeedback={handleOpenFeedback}
            recosUsage={recosUsage}
          />
        </TabsContent>

        <TabsContent value="emails" className="mt-0">
          <MarketingEmailsTab
            recommendations={recommendations.emails}
            onGenerateRecommendation={() => generateRecommendation("emails")}
            onStatusChange={updateStatus}
            isGenerating={isGenerating === "emails"}
            quota={quota}
            onOpenFeedback={handleOpenFeedback}
            recosUsage={recosUsage}
          />
        </TabsContent>
      </Tabs>

      {/* Feedback modal */}
      {feedbackRec && (
        <FeedbackForm
          open={!!feedbackRec}
          onOpenChange={(open) => { if (!open) setFeedbackRec(null); }}
          recommendation={feedbackRec}
          onSubmit={submitFeedback}
        />
      )}
    </div>
  );
}
