import { useState } from "react";

type View = "home" | "session" | "summary";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [roomCode, setRoomCode] = useState<string | null>(null);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Partagi</h1>
      {view === "home" && (
        <Home
          onSessionCreated={(code) => {
            setRoomCode(code);
            setView("session");
          }}
          onJoinSession={(code) => {
            setRoomCode(code);
            setView("session");
          }}
        />
      )}
      {view === "session" && roomCode && (
        <Session roomCode={roomCode} onLeave={() => setView("home")} />
      )}
    </div>
  );
}

function Home({
  onSessionCreated,
  onJoinSession,
}: {
  onSessionCreated: (code: string) => void;
  onJoinSession: (code: string) => void;
}) {
  const [joinCode, setJoinCode] = useState("");

  return (
    <div>
      <button
        onClick={() => {
          const code = crypto.randomUUID().slice(0, 8);
          onSessionCreated(code);
        }}
      >
        New Session
      </button>
      <div style={{ marginTop: "1rem" }}>
        <input
          type="text"
          placeholder="Enter room code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button
          disabled={!joinCode.trim()}
          onClick={() => onJoinSession(joinCode.trim())}
        >
          Join
        </button>
      </div>
    </div>
  );
}

function Session({
  roomCode,
  onLeave,
}: {
  roomCode: string;
  onLeave: () => void;
}) {
  return (
    <div>
      <p>
        Room: <strong>{roomCode}</strong>
      </p>
      <p>Connecting to LiveKit...</p>
      <button onClick={onLeave}>Leave Session</button>
    </div>
  );
}
