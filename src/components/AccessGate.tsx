import { useEffect, useState, ReactNode } from "react";
import askItLogo from "@/assets/ask-it-logo.png";
import { PORTAL_LOGIN_URL, getPortalApiUrl } from "@/lib/portal";

const SESSION_KEY = "askit_access";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

interface AccessSession {
  user_email: string;
  user_role: string;
  organization_id: string;
  created_at: number;
  expires_at: number;
}

function getStoredSession(): AccessSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: AccessSession = JSON.parse(raw);
    if (Date.now() > session.expires_at) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function storeSession(data: Omit<AccessSession, "created_at" | "expires_at">) {
  const session: AccessSession = {
    ...data,
    created_at: Date.now(),
    expires_at: Date.now() + SESSION_DURATION_MS,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAccessSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// Loader shown while verifying
function AccessLoader() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ backgroundColor: "#0F0F0F", fontFamily: "DM Sans, sans-serif" }}
    >
      <img src={askItLogo} alt="Ask-It" className="mb-8 object-contain" style={{ height: 80 }} />
      <div
        className="rounded-full border-4 border-t-transparent animate-spin mb-4"
        style={{ width: 40, height: 40, borderColor: "#DB143C", borderTopColor: "transparent" }}
      />
    </div>
  );
}

// Blocked page shown when access is denied
function AccessBlocked() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ backgroundColor: "#0F0F0F", fontFamily: "DM Sans, sans-serif" }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <div
        className="w-full bg-white flex flex-col items-center text-center"
        style={{
          maxWidth: 420,
          borderRadius: 12,
          padding: "2rem",
        }}
      >
        {/* Logo */}
        <img src={askItLogo} alt="Ask-It" className="h-8 mb-6 object-contain" />

        {/* Lock icon */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: "#FFF0F2" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#DB143C"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Accès restreint
        </h1>

        {/* Description */}
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Ce dashboard est protégé. Connectez-vous via la plateforme Ask-It pour y accéder.
        </p>

        {/* CTA Button */}
        <a
          href={PORTAL_LOGIN_URL}
          className="w-full inline-flex items-center justify-center text-white text-sm font-medium py-3 px-6 rounded-lg transition-colors"
          style={{ backgroundColor: "#DB143C" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#EE6C4D")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#DB143C")}
        >
          Se connecter
        </a>
      </div>
    </div>
  );
}

type AccessState = "loading" | "granted" | "denied";

interface AccessGateProps {
  children: ReactNode;
}

export function AccessGate({ children }: AccessGateProps) {
  const [state, setState] = useState<AccessState>("loading");

  useEffect(() => {
    async function verify() {
      // Step 1: Check existing session
      const session = getStoredSession();

      if (session) {
        setState("granted");
        return;
      }

      // Step 2: Check URL token
      const params = new URLSearchParams(window.location.search);
      const token = params.get("access_token");

      if (!token) {
        setState("denied");
        return;
      }

      // Step 3: Verify token with Ask-It portal
      try {
        const verifyUrl = getPortalApiUrl("verify-dashboard-token");
        const response = await fetch(verifyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
          setState("denied");
          return;
        }

        if (data?.valid) {
          storeSession({
            user_email: data.user?.email || data.email || "",
            user_role: data.user?.role || data.role || "client",
            organization_id: data.user?.organization_id || data.organization_id || "",
          });

          // Clean token from URL
          const url = new URL(window.location.href);
          url.searchParams.delete("access_token");
          window.history.replaceState({}, "", url.toString());

          setState("granted");
        } else {
          setState("denied");
        }
      } catch (error) {
        setState("denied");
      }
    }

    verify();
  }, []);

  if (state === "loading") return <AccessLoader />;
  if (state === "denied") return <AccessBlocked />;
  return <>{children}</>;
}
