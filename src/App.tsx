import { useState, useEffect } from "react";
import Home from "./components/Home";
import Session from "./components/Session";
import { joinSession } from "./lib/tauri-commands";

type View = "home" | "session";

interface SessionState {
  code: string;
  participantId: string;
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSession = async (code: string) => {
    const participantId = crypto.randomUUID().slice(0, 12);
    try {
      const res = await joinSession(code, participantId);
      setSession({
        code: res.code,
        participantId,
      });
      setView("session");
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
        <Home onCreateSession={startSession} onJoinSession={startSession} />
      )}
      {view === "session" && session && (
        <Session
          roomCode={session.code}
          participantId={session.participantId}
          onLeave={() => {
            setSession(null);
            setView("home");
          }}
        />
      )}
    </div>
  );
}
