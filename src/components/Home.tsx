import { useState, useEffect } from "react";
import { createSession } from "../lib/tauri-commands";
import { Button } from "./ui";
import { History } from "lucide-react";

interface HomeProps {
  onJoinSession: (
    code: string,
    participantId: string,
    displayName: string,
  ) => void;
}

const STORAGE_KEY = "partagi-participant-id";
const NAME_KEY = "partagi-display-name";
const RECENT_KEY = "partagi-recent-sessions";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(code: string) {
  const codeUpper = code.toUpperCase();
  const next = [codeUpper, ...loadRecent().filter((c) => c !== codeUpper)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

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
  const [recent, setRecent] = useState<string[]>(loadRecent);

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
      saveRecent(res.code);
      setRecent(loadRecent());
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
      saveRecent(code);
      setRecent(loadRecent());
      onJoinSession(code, participantId, getName());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRecent = (code: string) => {
    setJoinCode(code);
    setLoading(true);
    setError(null);
    onJoinSession(code, participantId, getName());
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

      {recent.length > 0 && (
        <div className="recent-sessions">
          <div className="section-label row row-gap-sm">
            <History size={12} />
            Recent
          </div>
          <div className="recent-list">
            {recent.map((code) => (
              <Button
                key={code}
                size="sm"
                className="recent-chip"
                onClick={() => handleJoinRecent(code)}
                disabled={loading}
              >
                {code}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
