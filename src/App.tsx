import { useState } from "react";
import Home from "./components/Home";
import Session from "./components/Session";
import { createSession, joinSession } from "./lib/tauri-commands";

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

  const handleCreate = async () => {
    const participantId = crypto.randomUUID().slice(0, 12);
    try {
      const createRes = await createSession(participantId);
      const joinRes = await joinSession(createRes.code, participantId);
      setSession({
        code: createRes.code,
        participantId,
        token: joinRes.token,
        serverUrl: joinRes.server_url,
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
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Partagi</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
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
