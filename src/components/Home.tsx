import { useState, useEffect } from "react";
import { createSession } from "../lib/tauri-commands";
import { Button } from "./ui";

interface HomeProps {
  onJoinSession: (
    code: string,
    participantId: string,
    displayName: string,
  ) => void;
}

const STORAGE_KEY = "partagi-participant-id";
const NAME_KEY = "partagi-display-name";

export default function Home({ onJoinSession }: HomeProps) {
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem(NAME_KEY) || "",
  );
  const [participantId] = useState(
    () => localStorage.getItem(STORAGE_KEY) || crypto.randomUUID().slice(0, 12),
  );
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== null,
  );
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rememberMe) {
      localStorage.setItem(STORAGE_KEY, participantId);
      localStorage.setItem(NAME_KEY, displayName);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(NAME_KEY);
    }
  }, [rememberMe, participantId, displayName]);

  const getName = () => displayName.trim() || "Guest";

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const name = getName();
      const res = await createSession(participantId, name);
      onJoinSession(res.code, participantId, name);
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
      onJoinSession(code, participantId, getName());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home">
      <div className="home-brand">
        <h1>Partagi</h1>
        <p>Lightweight screen sharing for small teams</p>
      </div>

      <div className="home-card">
        <div className="field">
          <label htmlFor="name">Your Name</label>
          <input
            id="name"
            type="text"
            placeholder="Enter your name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Remember me
          </label>
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? "Creating..." : "New Session"}
        </Button>

        <div className="divider">
          <span>or</span>
        </div>

        <div className="row row-gap">
          <input
            className="room-input"
            type="text"
            placeholder="Enter room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <Button onClick={handleJoin} disabled={loading || !joinCode.trim()}>
            Join
          </Button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
