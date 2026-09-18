import { useState, useEffect } from "react";
import Home from "./components/Home";
import Session from "./components/Session";
import { joinSession } from "./lib/tauri-commands";

type View = "home" | "session";

interface SessionState {
  code: string;
  participantId: string;
  token: string;
  serverUrl: string;
}

function getInitialView(): { view: View; session: SessionState | null } {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const token = params.get("token");
  const server = params.get("server");
  const participantId = params.get("pid") || crypto.randomUUID().slice(0, 12);

  if (code && token && server) {
    return {
      view: "session",
      session: { code, participantId, token, serverUrl: server },
    };
  }

  return { view: "home", session: null };
}

function isInTauri(): boolean {
  return "__TAURI__" in window;
}

export default function App() {
  const initial = getInitialView();
  const [view, setView] = useState<View>(initial.view);
  const [session, setSession] = useState<SessionState | null>(initial.session);
  const [error, setError] = useState<string | null>(null);
  const [sessionOpened, setSessionOpened] = useState(false);

  const handleCreate = async (code: string) => {
    const participantId = crypto.randomUUID().slice(0, 12);
    try {
      const res = await joinSession(code, participantId);
      if (isInTauri()) {
        const { open } = await import("@tauri-apps/plugin-shell");
        const url = `${res.session_url}&pid=${participantId}`;
        await open(url);
        setSessionOpened(true);
        setSession({
          code: res.code,
          participantId,
          token: res.token,
          serverUrl: res.server_url,
        });
      } else {
        setSession({
          code: res.code,
          participantId,
          token: res.token,
          serverUrl: res.server_url,
        });
        setView("session");
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleJoin = async (code: string) => {
    const participantId = crypto.randomUUID().slice(0, 12);
    try {
      const res = await joinSession(code, participantId);
      if (isInTauri()) {
        const { open } = await import("@tauri-apps/plugin-shell");
        const url = `${res.session_url}&pid=${participantId}`;
        await open(url);
        setSessionOpened(true);
        setSession({
          code: res.code,
          participantId,
          token: res.token,
          serverUrl: res.server_url,
        });
      } else {
        setSession({
          code: res.code,
          participantId,
          token: res.token,
          serverUrl: res.server_url,
        });
        setView("session");
      }
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {error && (
        <div style={{
          position: "fixed",
          top: 16,
          right: 16,
          background: "var(--danger)",
          color: "white",
          padding: "0.75rem 1rem",
          borderRadius: "var(--radius)",
          fontSize: "0.85rem",
          zIndex: 2000,
        }}>
          {error}
        </div>
      )}
      {view === "home" && (
        <Home onCreateSession={handleCreate} onJoinSession={handleJoin} />
      )}
      {view === "home" && sessionOpened && session && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--success)",
          color: "white",
          padding: "0.75rem 1.25rem",
          borderRadius: "var(--radius)",
          fontSize: "0.85rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          <span>Session opened in your browser</span>
          <code style={{ background: "rgba(255,255,255,0.2)", padding: "0.15rem 0.4rem", borderRadius: 4 }}>
            {session.code}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(session.code);
            }}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "white",
              padding: "0.25rem 0.5rem",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            Copy Code
          </button>
        </div>
      )}
      {view === "session" && session && (
        <Session
          roomCode={session.code}
          participantId={session.participantId}
          serverUrl={session.serverUrl}
          token={session.token}
          onLeave={() => {
            setSession(null);
            setView("home");
            window.history.replaceState({}, "", window.location.pathname);
          }}
        />
      )}
    </div>
  );
}
