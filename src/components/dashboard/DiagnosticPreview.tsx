import { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Eye, ExternalLink, RefreshCw, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenantConfig } from "@/hooks/useTenantConfig";

/**
 * Diagnostic URL is read from tenant_config.diagnostic_url.
 * If not configured, the iframe shows a placeholder message.
 */

/**
 * Generates an inline HTML document that:
 * 1. Clears localStorage & sessionStorage for the diagnostic origin
 * 2. Then redirects to the diagnostic home page
 *
 * Because the srcdoc page is loaded *inside* the sandboxed iframe with
 * allow-same-origin, the browser treats it as same-origin with the
 * diagnostic URL it will navigate to, so the storage.clear() calls
 * won't throw cross-origin errors.
 *
 * NOTE: srcdoc pages inherit the sandbox flags of the iframe, and with
 * allow-same-origin their effective origin is the *parent*'s origin,
 * which is NOT the diagnostic origin. So this alone wouldn't work.
 *
 * Instead we use a two-phase approach:
 * Phase 1 – remove iframe from DOM entirely (destroys the browsing context)
 * Phase 2 – after a delay, mount a brand-new iframe element with a fresh
 *           cache-busting URL, ensuring the browser creates a new context.
 */

export function DiagnosticPreview() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { config: tenantConfig } = useTenantConfig();
  const DIAGNOSTIC_URL = tenantConfig?.diagnostic_url || "";
  const brandName = tenantConfig?.brand_name || "—";

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleRestart = useCallback(() => {
    // Send reset message to the diagnostic app via postMessage
    // The diagnostic will clear storage and reload itself
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "diagnostic_reset" },
        "*"
      );
    } catch (_) { /* cross-origin — ignored */ }

    // Fallback: after giving the diagnostic time to process the message
    // and reload, remount a fresh iframe just in case
    setTimeout(() => {
      setIsResetting(true);
      setTimeout(() => {
        setIframeKey((prev) => prev + 1);
        setIsResetting(false);
      }, 300);
    }, 1000);
  }, []);

  const handleOpenExternal = () => {
    window.open(DIAGNOSTIC_URL, "_blank");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`bg-gradient-to-br from-card via-card to-muted/30 rounded-xl border border-border/50 p-6 shadow-md ${
        isFullscreen ? "fixed inset-4 z-50" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-foreground/5">
            <Eye className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground font-heading">
              Votre diagnostic
            </h3>
            <p className="text-sm text-muted-foreground">
              Prévisualisez l'expérience client en temps réel
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
          <Button size="sm" onClick={handleRestart}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Recommencer
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsFullscreen(!isFullscreen)}>
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4 mr-2" />
                Réduire
              </>
            ) : (
              <>
                <Maximize2 className="w-4 h-4 mr-2" />
                Agrandir
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenExternal}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Ouvrir
          </Button>
        </div>
      </div>

      <div 
        className={`relative bg-white rounded-xl border-2 border-foreground/10 overflow-hidden ${
          isFullscreen ? "h-[calc(100%-80px)]" : "h-[600px]"
        }`}
      >
        {/* Browser-like header */}
        <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-background rounded-md px-3 py-1 text-xs text-muted-foreground truncate">
              {DIAGNOSTIC_URL}
            </div>
          </div>
        </div>

        {/* Iframe — conditionally rendered to allow full DOM destruction on restart */}
        {!isResetting ? (
          DIAGNOSTIC_URL ? (
            <iframe
              key={iframeKey}
              name={`diagnostic-frame-${iframeKey}`}
              src={`${DIAGNOSTIC_URL}${iframeKey > 0 ? `?_restart=${iframeKey}&_t=${Date.now()}` : ""}`}
              ref={iframeRef}
              className="w-full h-[calc(100%-40px)] border-0"
              title={`Diagnostic ${brandName}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              tabIndex={-1}
            />
          ) : (
            <div className="w-full h-[calc(100%-40px)] flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
              URL du diagnostic non configurée. Renseigne <code>tenant_config.diagnostic_url</code> dans Supabase pour afficher l'aperçu.
            </div>
          )
        ) : (
          <div className="w-full h-[calc(100%-40px)] flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Propulsé par Ask-It × {brandName}</span>
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Synchronisé en temps réel
        </span>
      </div>
    </motion.div>
  );
}
