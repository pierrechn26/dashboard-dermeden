import { getPortalApiUrl } from './portal';

const MONITORING_ENDPOINT = getPortalApiUrl('report-error');

interface ErrorEntry {
  source: 'frontend' | 'edge_function';
  severity: 'critical' | 'error' | 'warning';
  error_type: string;
  function_name: string;
  message: string;
  stack_trace: string;
  context: Record<string, unknown>;
}

let errorBuffer: ErrorEntry[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

function queueError(error: ErrorEntry) {
  errorBuffer.push(error);

  if (error.severity === 'critical') {
    flushErrors();
    return;
  }

  if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushErrors();
      flushTimeout = null;
    }, 5000);
  }
}

async function flushErrors() {
  if (errorBuffer.length === 0) return;
  const errors = [...errorBuffer];
  errorBuffer = [];

  try {
    await fetch(MONITORING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-monitoring-key': (window as unknown as Record<string, string>).__MONITORING_API_KEY__ || '',
      },
      body: JSON.stringify({ errors }),
    });
  } catch {
    // Ne jamais bloquer l'app — erreurs perdues si réseau indisponible
  }
}

// ----------- Fetch interception + loop detection -----------

const callTracker: Record<string, { count: number; firstCall: number }> = {};

function interceptFetchCalls() {
  const originalFetch = window.fetch;

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

    // Ne tracker que les appels vers les Edge Functions Supabase
    // et EXCLURE l'endpoint de monitoring lui-même pour éviter les boucles
    if (!url.includes('supabase.co/functions/v1/') || url.includes('report-error')) {
      return originalFetch(...args);
    }

    const functionName = url.split('/functions/v1/')[1]?.split('?')[0] || 'unknown';

    // Détection de boucle
    const now = Date.now();
    if (!callTracker[functionName]) {
      callTracker[functionName] = { count: 0, firstCall: now };
    }
    const tracker = callTracker[functionName];

    if (now - tracker.firstCall > 30000) {
      tracker.count = 0;
      tracker.firstCall = now;
    }
    tracker.count++;

    if (tracker.count > 10) {
      queueError({
        source: 'frontend',
        severity: 'critical',
        error_type: 'loop_detected',
        function_name: functionName,
        message: `Edge function ${functionName} called ${tracker.count} times in ${Math.round((now - tracker.firstCall) / 1000)} seconds`,
        stack_trace: new Error().stack || '',
        context: {
          url: window.location.href,
          call_count: tracker.count,
          timeframe_seconds: Math.round((now - tracker.firstCall) / 1000),
          user_agent: navigator.userAgent,
        },
      });
      tracker.count = 0;
      tracker.firstCall = now;
    }

    const startTime = Date.now();
    try {
      const response = await originalFetch(...args);
      const duration = Date.now() - startTime;

      if (!response.ok) {
        let responseBody = '';
        try { responseBody = await response.clone().text(); } catch { /* ignore */ }

        queueError({
          source: 'frontend',
          severity: response.status >= 500 ? 'error' : 'warning',
          error_type: 'edge_function_error',
          function_name: functionName,
          message: `${functionName} returned ${response.status}: ${responseBody.substring(0, 200)}`,
          stack_trace: '',
          context: {
            url: window.location.href,
            status_code: response.status,
            duration_ms: duration,
            user_agent: navigator.userAgent,
          },
        });
      }

      if (duration > 10000) {
        queueError({
          source: 'frontend',
          severity: duration > 30000 ? 'error' : 'warning',
          error_type: 'slow_response',
          function_name: functionName,
          message: `${functionName} took ${Math.round(duration / 1000)}s to respond`,
          stack_trace: '',
          context: {
            url: window.location.href,
            duration_ms: duration,
            user_agent: navigator.userAgent,
          },
        });
      }

      return response;
    } catch (fetchError: unknown) {
      const duration = Date.now() - startTime;
      const err = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      queueError({
        source: 'frontend',
        severity: 'error',
        error_type: 'fetch_failure',
        function_name: functionName,
        message: `${functionName} fetch failed: ${err.message}`,
        stack_trace: err.stack || '',
        context: {
          url: window.location.href,
          duration_ms: duration,
          user_agent: navigator.userAgent,
        },
      });
      throw fetchError;
    }
  };
}

// ----------- Public init -----------

export function initErrorReporter() {
  // 1. Erreurs JS non catchées
  window.onerror = (message, source, lineno, colno, error) => {
    queueError({
      source: 'frontend',
      severity: 'error',
      error_type: 'js_uncaught',
      function_name: source || 'unknown',
      message: String(message),
      stack_trace: error?.stack || '',
      context: {
        url: window.location.href,
        line: lineno,
        column: colno,
        user_agent: navigator.userAgent,
      },
    });
  };

  // 2. Promesses rejetées non catchées
  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    queueError({
      source: 'frontend',
      severity: 'error',
      error_type: 'unhandled_rejection',
      function_name: 'promise',
      message: reason?.message || String(reason),
      stack_trace: reason?.stack || '',
      context: {
        url: window.location.href,
        user_agent: navigator.userAgent,
      },
    });
  };

  // 3. Interception fetch
  interceptFetchCalls();
}
