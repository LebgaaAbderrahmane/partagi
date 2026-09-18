import { useState } from "react";
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

export default function App() {
  const [view, setView] = useState<View>("home");
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (code: string) => {
    const participantId = crypto.randomUUID().slice(0, 12);
    try {
      const res = await joinSession(code, participantId);
      setSession({
        code: res.code,
        participantId,
        token: res.token,
        serverUrl: res.server_url,
      });
      setView("session");
    } catch (e) {
      setError(String(e));
    }
  };

  const handleJoin = async (code: string) => {
    const participantId = crypto.randomUUID().slice(0, 12);
    try {
      const res = await joinSession(code, participantId);
      setSession({
        code: res.code,
        participantId,
        token: res.token,
        serverUrl: res.server_url,
      });
      setView("session");
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {error && (
        <div style={{ position: "fixed", top: 16, right: 16, background: "var(--danger)", color: "white", padding: "0.75rem 1rem", borderRadius: "var(--radius)", fontSize: "0.85rem", zIndex: 2000 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: "0.5rem", background: "transparent", border: "none", color: "white", padding: 0 }}>x</button>
        </div>
      )}
      {view === "home" && (
        <Home onCreateSession={handleCreate} onJoinSession={handleJoin} />
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
          }}
        />
      )}
    </div>
  );
}
