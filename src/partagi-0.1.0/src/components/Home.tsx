import { useState, useEffect } from "react";
import { createSession } from "../lib/tauri-commands";

interface HomeProps {
  onJoinSession: (code: string, participantId: string) => void;
}

const STORAGE_KEY = "partagi-participant-id";

export default function Home({ onJoinSession }: HomeProps) {
  const [participantId, setParticipantId] = useState(() =>
    localStorage.getItem(STORAGE_KEY) || ""
  );
  const [rememberMe, setRememberMe] = useState(() =>
    localStorage.getItem(STORAGE_KEY) !== null
  );
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rememberMe && participantId) {
      localStorage.setItem(STORAGE_KEY, participantId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [rememberMe, participantId]);

  const getId = () => participantId.trim() || crypto.randomUUID().slice(0, 12);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const id = getId();
      const res = await createSession(id);
      onJoinSession(res.code, id);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      onJoinSession(code, getId());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "2rem" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Partagi</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Lightweight screen sharing for small teams
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: 320 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Your Name</label>
          <input
            type="text"
            placeholder="Enter your name (optional)"
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ width: "auto" }}
            />
            Remember me
          </label>
        </div>

        <button className="primary" onClick={handleCreate} disabled={loading} style={{ padding: "0.75rem", fontSize: "1rem" }}>
          {loading ? "Creating..." : "New Session"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder="Enter room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.1em" }}
          />
          <button onClick={handleJoin} disabled={loading || !joinCode.trim()}>
            Join
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>
      )}
    </div>
  );
}
