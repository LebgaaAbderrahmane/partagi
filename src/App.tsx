import { useState } from "react";
import Home from "./components/Home";
import Session from "./components/Session";
import { ToastProvider, useToast } from "./components/ui";
import { joinSession } from "./lib/tauri-commands";

type View = "home" | "session";

interface SessionState {
  code: string;
  participantId: string;
  displayName: string;
  streamUrl: string;
}

function App() {
  const { toast } = useToast();
  const [view, setView] = useState<View>("home");
  const [session, setSession] = useState<SessionState | null>(null);

  const startSession = async (
    code: string,
    participantId: string,
    displayName: string,
  ) => {
    try {
      const res = await joinSession(code, participantId, displayName);
      setSession({
        code: res.code,
        participantId,
        displayName,
        streamUrl: res.stream_url,
      });
      setView("session");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {view === "home" && <Home onJoinSession={startSession} />}
      {view === "session" && session && (
        <Session
          roomCode={session.code}
          participantId={session.participantId}
          displayName={session.displayName}
          streamUrl={session.streamUrl}
          onLeave={() => {
            setSession(null);
            setView("home");
          }}
        />
      )}
    </div>
  );
}

export default function Root() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
