import { useState } from "react";

interface HomeProps {
  onCreateSession: () => void;
  onJoinSession: (code: string) => void;
}

export default function Home({ onCreateSession, onJoinSession }: HomeProps) {
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    await onCreateSession();
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    await onJoinSession(joinCode.trim());
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 400 }}>
      <button onClick={handleCreate} disabled={loading}>
        {loading ? "Creating..." : "New Session"}
      </button>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          placeholder="Enter room code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          style={{ flex: 1 }}
        />
        <button onClick={handleJoin} disabled={loading || !joinCode.trim()}>
          Join
        </button>
      </div>
    </div>
  );
}
