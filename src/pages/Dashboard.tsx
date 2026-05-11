import { useState, useRef } from "react";
import { DateRange } from "react-day-picker";
import { subDays, format } from "date-fns";
import { BarChart3, Users, TrendingUp, Sparkles, AlertCircle, Download, HelpCircle, Activity, DollarSign, CheckCircle, FileText, Loader2, ClipboardList, Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PORTAL_LOGIN_URL } from "@/lib/portal";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonasTab } from "@/components/dashboard/PersonasTab";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { FunnelVisualization } from "@/components/dashboard/FunnelVisualization";
import { DetailedFunnelVisualization } from "@/components/dashboard/DetailedFunnelVisualization";
import { MarketingRecommendations } from "@/components/dashboard/MarketingRecommendations";
import AskiAvatar from "@/components/AskiAvatar/AskiAvatar";
import { AskiChat } from "@/components/dashboard/AskiChat";
import { DiagnosticsAnalytics } from "@/components/dashboard/DiagnosticsAnalytics";
import { BusinessMetrics } from "@/components/dashboard/BusinessMetrics";
import { useBusinessMetrics } from "@/hooks/useBusinessMetrics";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { DiagnosticPreview } from "@/components/dashboard/DiagnosticPreview";
import { ResponsesSection } from "@/components/dashboard/ResponsesSection";
import { OverviewDiagnosticStats } from "@/components/dashboard/OverviewDiagnosticStats";
import { UsageOverview } from "@/components/dashboard/UsageOverview";
import { QuotaBanner } from "@/components/dashboard/QuotaBanner";
import { TopPersonasPotential } from "@/components/dashboard/TopPersonasPotential";
import { useDiagnosticStats } from "@/hooks/useDiagnosticStats";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import askItLogo from "@/assets/ask-it-logo.png";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { clearAccessSession } from "@/components/AccessGate";
import { cn } from "@/lib/utils";
export default function Dashboard() {
  const [supportOpen, setSupportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSections, setExportSections] = useState({
    all: true,
    overview: true,
    personas: true,
    diagnostics: true,
    business: true,
    funnel: true,
    marketing: true,
    insights: true
  });
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Refs for each section
  const overviewRef = useRef<HTMLDivElement>(null);
  const personasRef = useRef<HTMLDivElement>(null);
  const diagnosticsRef = useRef<HTMLDivElement>(null);
  const businessRef = useRef<HTMLDivElement>(null);
  const funnelRef = useRef<HTMLDivElement>(null);
  const marketingRef = useRef<HTMLDivElement>(null);
  const insightsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 6), to: new Date() });
  const [customComparisonRange, setCustomComparisonRange] = useState<DateRange | undefined>();
  const businessMetrics = useBusinessMetrics(dateRange);
  const diagnosticStats = useDiagnosticStats(dateRange);
  const usageLimits = useUsageLimits();
  const { config: tenantConfig } = useTenantConfig();
  const sectionRefs: Record<string, React.RefObject<HTMLDivElement>> = {
    overview: overviewRef,
    personas: personasRef,
    diagnostics: diagnosticsRef,
    business: businessRef,
    funnel: funnelRef,
    marketing: marketingRef,
    insights: insightsRef
  };
  const sectionNames: Record<string, string> = {
    overview: "Vue d'ensemble",
    personas: "Personas",
    diagnostics: "Diagnostics",
    business: "Business",
    funnel: "Funnel",
    marketing: "Marketing IA",
    insights: "Aski"
  };
  const handleExport = async () => {
    const selectedSections = Object.entries(exportSections).filter(([key, value]) => value && key !== 'all').map(([key]) => key);
    if (selectedSections.length === 0) {
      toast({
        title: "Aucune section sélectionnée",
        description: "Veuillez sélectionner au moins une section à exporter.",
        variant: "destructive"
      });
      return;
    }
    setIsExporting(true);
    setExportOpen(false);
    toast({
      title: "Export en cours",
      description: "Génération du PDF en cours, veuillez patienter..."
    });
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      let isFirstPage = true;

      // Store original tab to restore later
      const originalTab = activeTab;
      for (const section of selectedSections) {
        // Switch to the section's tab to make it visible
        setActiveTab(section === 'diagnostics' ? 'analytics' : section === 'insights' ? 'aski' : section);

        // Wait for tab content to render
        await new Promise(resolve => setTimeout(resolve, 500));
        const ref = sectionRefs[section];
        if (ref?.current) {
          const canvas = await html2canvas(ref.current, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            imageTimeout: 15000,
            removeContainer: true,
          });
          const imgData = canvas.toDataURL('image/jpeg', 0.85);
          const imgWidth = pageWidth - margin * 2;
          const imgHeight = canvas.height * imgWidth / canvas.width;
          if (!isFirstPage) {
            pdf.addPage();
          }

          // Add section title
          pdf.setFontSize(16);
          pdf.setTextColor(0, 0, 0);
          pdf.text(sectionNames[section], margin, margin + 5);

          // Add date range info
          pdf.setFontSize(10);
          pdf.setTextColor(100, 100, 100);
          const dateText = dateRange?.from && dateRange?.to ? `Période: ${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}` : 'Période: Non définie';
          pdf.text(dateText, margin, margin + 12);

          // Calculate how many pages we need for this section
          let yPosition = margin + 18;
          let remainingHeight = imgHeight;
          let sourceY = 0;
          while (remainingHeight > 0) {
            const availableHeight = pageHeight - yPosition - margin;
            const sliceHeight = Math.min(availableHeight, remainingHeight);
            const sliceRatio = sliceHeight / imgHeight;

            // Create a temporary canvas for the slice
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = canvas.height * sliceRatio;
            const sliceCtx = sliceCanvas.getContext('2d');
            if (sliceCtx) {
              sliceCtx.drawImage(canvas, 0, sourceY * (canvas.height / imgHeight), canvas.width, sliceCanvas.height, 0, 0, sliceCanvas.width, sliceCanvas.height);
              const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.85);
              pdf.addImage(sliceData, 'JPEG', margin, yPosition, imgWidth, sliceHeight);
            }
            remainingHeight -= sliceHeight;
            sourceY += sliceHeight;
            if (remainingHeight > 0) {
              pdf.addPage();
              yPosition = margin;
            }
          }
          isFirstPage = false;
        }
      }

      // Restore original tab
      setActiveTab(originalTab);

      // Generate filename with date
      const fileName = `rapport-marketing-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      pdf.save(fileName);
      toast({
        title: "Export réussi",
        description: `Le rapport "${fileName}" a été téléchargé.`
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Erreur d'export",
        description: "Une erreur est survenue lors de la génération du PDF.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };
  const handleToggleAll = (checked: boolean) => {
    setExportSections({
      all: checked,
      overview: checked,
      personas: checked,
      diagnostics: checked,
      business: checked,
      funnel: checked,
      marketing: checked,
      insights: checked
    });
  };
  const handleToggleSection = (section: keyof typeof exportSections, checked: boolean) => {
    const newSections = {
      ...exportSections,
      [section]: checked
    };
    const allOthersChecked = Object.entries(newSections).filter(([key]) => key !== 'all').every(([, value]) => value);
    newSections.all = allOthersChecked;
    setExportSections(newSections);
  };
  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Message envoyé",
      description: "Notre équipe vous répondra dans les 24h."
    });
    setSupportOpen(false);
  };
  const handleApplyDates = () => {
    toast({
      title: "Données actualisées",
      description: "Le dashboard a été mis à jour avec la nouvelle période."
    });
  };
  return <div className="min-h-screen bg-background">
      {/* Header with stronger visual emphasis */}
      <header className="border-b border-border bg-gradient-to-r from-primary via-secondary to-accent backdrop-blur-sm sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-col flex items-start justify-start">
               <img alt="Ask-It Logo" className="h-[61px] w-auto object-contain" src="/lovable-uploads/30b93e71-30dd-4fdd-aae7-9d008af6fa5c.png" />
              <div className="flex items-center gap-2 mt-1">
                <p className="text-base text-white font-medium">
                  Dashboard {tenantConfig?.brand_name || "—"} — Plan <span className="capitalize">{usageLimits.plan}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
              <Button
                size="sm"
                variant="ghost"
                className="text-white/70 hover:text-white hover:bg-white/10 transition-all"
                onClick={() => {
                  clearAccessSession();
                  window.location.href = PORTAL_LOGIN_URL;
                }}
                title="Se déconnecter"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Déconnexion
              </Button>
              <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="hover:bg-primary/70 hover:brightness-110 transition-all">
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Exporter le rapport PDF
                    </DialogTitle>
                    <DialogDescription>
                      Sélectionnez les sections à inclure dans votre rapport
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex items-center space-x-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <Checkbox id="export-all" checked={exportSections.all} onCheckedChange={checked => handleToggleAll(checked as boolean)} />
                      <Label htmlFor="export-all" className="font-semibold cursor-pointer">
                        Exporter l'ensemble des éléments
                      </Label>
                    </div>
                    
                    <div className="space-y-3 pl-2">
                      <div className="flex items-center space-x-3">
                        <Checkbox id="export-overview" checked={exportSections.overview} onCheckedChange={checked => handleToggleSection('overview', checked as boolean)} />
                        <Label htmlFor="export-overview" className="flex items-center gap-2 cursor-pointer">
                          <Sparkles className="w-4 h-4 text-muted-foreground" />
                          Vue d'ensemble
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <Checkbox id="export-personas" checked={exportSections.personas} onCheckedChange={checked => handleToggleSection('personas', checked as boolean)} />
                        <Label htmlFor="export-personas" className="flex items-center gap-2 cursor-pointer">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          Personas
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <Checkbox id="export-diagnostics" checked={exportSections.diagnostics} onCheckedChange={checked => handleToggleSection('diagnostics', checked as boolean)} />
                        <Label htmlFor="export-diagnostics" className="flex items-center gap-2 cursor-pointer">
                          <BarChart3 className="w-4 h-4 text-muted-foreground" />
                          Diagnostics
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <Checkbox id="export-business" checked={exportSections.business} onCheckedChange={checked => handleToggleSection('business', checked as boolean)} />
                        <Label htmlFor="export-business" className="flex items-center gap-2 cursor-pointer">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          Business
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <Checkbox id="export-funnel" checked={exportSections.funnel} onCheckedChange={checked => handleToggleSection('funnel', checked as boolean)} />
                        <Label htmlFor="export-funnel" className="flex items-center gap-2 cursor-pointer">
                          <Activity className="w-4 h-4 text-muted-foreground" />
                          Funnel
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <Checkbox id="export-marketing" checked={exportSections.marketing} onCheckedChange={checked => handleToggleSection('marketing', checked as boolean)} />
                        <Label htmlFor="export-marketing" className="flex items-center gap-2 cursor-pointer">
                          <TrendingUp className="w-4 h-4 text-muted-foreground" />
                          Marketing IA
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <Checkbox id="export-insights" checked={exportSections.insights} onCheckedChange={checked => handleToggleSection('insights', checked as boolean)} />
                        <Label htmlFor="export-insights" className="flex items-center gap-2 cursor-pointer">
                         <Bot className="w-4 h-4 text-muted-foreground" />
                          Aski
                        </Label>
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleExport} className="w-full" disabled={isExporting}>
                    {isExporting ? <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Export en cours...
                      </> : <>
                        <Download className="w-4 h-4 mr-2" />
                        Exporter le rapport
                      </>}
                  </Button>
                </DialogContent>
              </Dialog>
              <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Support
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Contactez le support Ask-It</DialogTitle>
                    <DialogDescription>
                      Notre équipe vous répondra dans les 24h
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSupportSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Nom</Label>
                      <Input id="name" placeholder="Votre nom" required />
                    </div>
                    <div>
                      <Label htmlFor="company">Entreprise</Label>
                      <Input id="company" placeholder="Votre entreprise" required />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="vous@entreprise.com" required />
                    </div>
                    <div>
                      <Label htmlFor="message">Message</Label>
                      <Textarea id="message" placeholder="Décrivez votre demande..." rows={4} required />
                    </div>
                    <Button type="submit" className="w-full">
                      Envoyer
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* ── Global quota banners (all resources: aski, recos, sessions) ── */}
      <QuotaBanner />


      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="space-y-6">
          <TabsList className="flex h-auto w-full items-center justify-between gap-4 rounded-lg bg-muted/30 p-2 text-base">
            <TabsTrigger value="overview">
              <Sparkles className="w-4 h-4" />
              Vue d'ensemble
            </TabsTrigger>
            <TabsTrigger value="personas">
              <Users className="w-4 h-4" />
              Personas
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="w-4 h-4" />
              Diagnostic
            </TabsTrigger>
            <TabsTrigger value="business">
              <DollarSign className="w-4 h-4" />
              Business
            </TabsTrigger>
            <TabsTrigger value="funnel">
              <Activity className="w-4 h-4" />
              Funnel
            </TabsTrigger>
            <TabsTrigger value="marketing">
              <TrendingUp className="w-4 h-4" />
              Marketing IA
            </TabsTrigger>
            <TabsTrigger value="aski">
              <Bot className="w-4 h-4" />
              Aski
            </TabsTrigger>
            <TabsTrigger value="responses">
              <ClipboardList className="w-4 h-4" />
              Réponses
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <div ref={overviewRef} className="space-y-8">
            {/* Key Metrics */}
            <div className="bg-gradient-to-br from-card via-card to-primary/5 rounded-xl border border-border/50 p-6 shadow-md">
              <h3 className="text-xl font-bold text-foreground mb-6 font-heading">Métriques clés</h3>
              {businessMetrics.isLoading || diagnosticStats.isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Chargement des données...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(() => {
                    const fmt = (n: number, d = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
                    const pctDiff = (a: number, b: number) => {
                      if (b === 0) return null;
                      const diff = ((a - b) / b) * 100;
                      return { value: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`, positive: diff >= 0 };
                    };
                    const convRateDiag = businessMetrics.diagnosticPageViews > 0
                      ? (businessMetrics.orderCountDiag / businessMetrics.diagnosticPageViews) * 100 : 0;
                    const convRateGlobal = businessMetrics.siteSessions > 0
                      ? (businessMetrics.orderCountNonDiag / businessMetrics.siteSessions) * 100 : 0;
                    const convDiff = pctDiff(convRateDiag, convRateGlobal);
                    const aovDiff = pctDiff(businessMetrics.aovDiag, businessMetrics.aovNonDiag);
                    const caWithDiag = businessMetrics.revenueTotal;
                    const caWithoutDiag = businessMetrics.revenueTotal - businessMetrics.revenueDiag;
                    const caDiff = pctDiff(caWithDiag, caWithoutDiag);

                    return (
                      <>
                        <MetricCard
                          title="CA via diagnostic"
                          value={`${fmt(businessMetrics.revenueDiag)} €`}
                          subtitle={`${businessMetrics.orderCountDiag} commandes`}
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
                          title="Taux de conversion diag"
                          value={`${fmt(convRateDiag, 1)}%`}
                          subtitle={`${businessMetrics.orderCountDiag} achats / ${businessMetrics.diagnosticPageViews.toLocaleString()} vues diag`}
                          icon={BarChart3}
                          comparison={{
                            period: "vs global",
                            value: `${fmt(convRateGlobal, 2)}%`,
                            diff: convDiff ? convDiff.value : undefined,
                            positive: convDiff?.positive,
                          }}
                          index={1}
                        />
                        <MetricCard
                          title="AOV après diagnostic"
                          value={`${fmt(businessMetrics.aovDiag, 2)} €`}
                          subtitle="Valeur moyenne par commande"
                          icon={TrendingUp}
                          comparison={{
                            period: "vs sans diagnostic",
                            value: `${fmt(businessMetrics.aovNonDiag, 2)} €`,
                            diff: aovDiff ? aovDiff.value : undefined,
                            positive: aovDiff?.positive,
                          }}
                          index={2}
                        />
                        <MetricCard
                          title="Diagnostics complétés"
                          value={diagnosticStats.completedResponses.toLocaleString("fr-FR")}
                          subtitle={`sur ${diagnosticStats.totalResponses.toLocaleString("fr-FR")} sessions`}
                          icon={Users}
                          comparison={{
                            period: "Taux de complétion",
                            value: `${diagnosticStats.completionRate.toFixed(1)}%`,
                          }}
                          index={3}
                        />
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Top 3 Personas — Potentiel de la semaine (replaces old PersonasOverviewPreview) */}
            <TopPersonasPotential showTitle={true} />

            {/* Diagnostic Performance - Real Data */}
            <OverviewDiagnosticStats dateRange={dateRange} />

            {/* Usage Overview */}
            <UsageOverview />

            {/* Diagnostic Preview */}
            <DiagnosticPreview />
            </div>
          </TabsContent>

          <TabsContent value="personas" className="space-y-6">
            <div ref={personasRef}>
              <PersonasTab dateRange={dateRange} />
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="bg-card rounded-lg border border-border p-6 shadow-md">
            <div ref={diagnosticsRef}>
              <DiagnosticsAnalytics dateRange={dateRange} />
            </div>
          </TabsContent>

          <TabsContent value="business" className="bg-card rounded-lg border border-border p-6 shadow-md">
            <div ref={businessRef}>
              <BusinessMetrics dateRange={dateRange} />
            </div>
          </TabsContent>

          <TabsContent value="funnel" className="bg-card rounded-lg border border-border p-6 shadow-md">
            <div ref={funnelRef} className="space-y-12">
              <FunnelVisualization dateRange={dateRange} />
              <DetailedFunnelVisualization dateRange={dateRange} />
            </div>
          </TabsContent>

          <TabsContent value="marketing" className="bg-card rounded-lg border border-border p-6 shadow-md">
            <div ref={marketingRef}>
              <MarketingRecommendations />
            </div>
          </TabsContent>

          <TabsContent value="aski" className="p-0">
            <div ref={insightsRef}>
              {/* Aski Hero Header — séparé visuellement du chat */}
              <div className="flex flex-col items-center py-8 px-4 border-b border-border bg-gradient-to-b from-card to-background">
                <AskiAvatar size={96} />
                <h2 className="mt-4 text-2xl font-bold text-foreground tracking-tight">Aski</h2>
                <p className="mt-6 text-lg text-muted-foreground text-center leading-relaxed">Hello !</p>
                <p className="mt-1 text-lg text-muted-foreground text-center max-w-lg leading-relaxed">
                  Moi c'est Aski, votre assistant personnel IA pour répondre à toutes vos questions stratégie marketing et performances, alors on démarre ?
                </p>
              </div>
              {/* Chat interface */}
              <AskiChat />
            </div>
          </TabsContent>

          <TabsContent value="responses">
            <ResponsesSection dateRange={dateRange} />
          </TabsContent>
        </Tabs>
      </main>
    </div>;
}